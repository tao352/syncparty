const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend build if it exists
const distPath = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 1e8, // Allow up to 100MB for data transfer if needed
});

// In-memory room storage
// Key: roomId, Value: { id, password, hostId, currentVideo: { isPlaying, currentTime, updatedAt }, participants: Map }
const rooms = new Map();

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    roomsCount: rooms.size,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/room/:roomId', (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId);
  if (!room) {
    return res.status(404).json({ exists: false, error: 'Room not found' });
  }
  return res.json({
    exists: true,
    hasPassword: Boolean(room.password),
    participantsCount: room.participants.size
  });
});

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // Create room
  socket.on('create-room', ({ roomId, password, userName }, callback) => {
    const cleanRoomId = (roomId || Math.random().toString(36).substring(2, 8)).toLowerCase().trim();

    if (rooms.has(cleanRoomId)) {
      if (typeof callback === 'function') {
        return callback({ success: false, error: 'Room ID already in use. Please pick another.' });
      }
      return;
    }

    const newRoom = {
      id: cleanRoomId,
      password: password ? password.trim() : null,
      hostId: socket.id,
      videoState: {
        isPlaying: false,
        currentTime: 0,
        fileName: '',
        updatedAt: Date.now()
      },
      participants: new Map()
    };

    const participant = {
      socketId: socket.id,
      userName: userName || 'Host',
      isHost: true,
      audioMuted: true,
      isSpeaking: false,
      joinedAt: Date.now()
    };

    newRoom.participants.set(socket.id, participant);
    rooms.set(cleanRoomId, newRoom);

    socket.join(cleanRoomId);
    socket.roomId = cleanRoomId;

    console.log(`[Room Created] ${cleanRoomId} by ${socket.id} (${userName})`);

    if (typeof callback === 'function') {
      callback({
        success: true,
        roomId: cleanRoomId,
        isHost: true,
        participants: Array.from(newRoom.participants.values()),
        videoState: newRoom.videoState
      });
    }
  });

  // Join existing room
  socket.on('join-room', ({ roomId, password, userName }, callback) => {
    const cleanRoomId = (roomId || '').toLowerCase().trim();
    const room = rooms.get(cleanRoomId);

    if (!room) {
      if (typeof callback === 'function') {
        return callback({ success: false, error: 'Room does not exist.' });
      }
      return;
    }

    if (room.password && room.password !== (password ? password.trim() : '')) {
      if (typeof callback === 'function') {
        return callback({ success: false, error: 'Incorrect room password.' });
      }
      return;
    }

    const participant = {
      socketId: socket.id,
      userName: userName || `Guest-${socket.id.substring(0, 4)}`,
      isHost: socket.id === room.hostId,
      audioMuted: true,
      isSpeaking: false,
      joinedAt: Date.now()
    };

    room.participants.set(socket.id, participant);
    socket.join(cleanRoomId);
    socket.roomId = cleanRoomId;

    console.log(`[Room Joined] ${cleanRoomId}: ${socket.id} (${participant.userName})`);

    // Notify others in room
    socket.to(cleanRoomId).emit('user-joined', {
      participant,
      allParticipants: Array.from(room.participants.values())
    });

    if (typeof callback === 'function') {
      callback({
        success: true,
        roomId: cleanRoomId,
        isHost: participant.isHost,
        hostId: room.hostId,
        participants: Array.from(room.participants.values()),
        videoState: room.videoState
      });
    }
  });

  // WebRTC Signaling: relay SDP Offer / Answer / ICE Candidates directly to specific peer
  socket.on('signal', ({ to, signal, streamType }) => {
    // streamType: 'video' (media stream) or 'voice' (mic audio)
    io.to(to).emit('signal', {
      from: socket.id,
      signal,
      streamType: streamType || 'video'
    });
  });

  // Host sends video state change (play, pause, seek)
  socket.on('sync-video', ({ action, currentTime, isPlaying, fileName }) => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    room.videoState = {
      isPlaying: typeof isPlaying === 'boolean' ? isPlaying : room.videoState.isPlaying,
      currentTime: typeof currentTime === 'number' ? currentTime : room.videoState.currentTime,
      fileName: fileName !== undefined ? fileName : room.videoState.fileName,
      updatedAt: Date.now()
    };

    // Broadcast to everyone else in the room
    socket.to(roomId).emit('sync-video', {
      action,
      videoState: room.videoState,
      senderId: socket.id
    });
  });

  // Host periodic heartbeat (every 2s) to correct client drift
  socket.on('video-heartbeat', ({ currentTime, isPlaying }) => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;

    room.videoState.currentTime = currentTime;
    room.videoState.isPlaying = isPlaying;
    room.videoState.updatedAt = Date.now();

    socket.to(roomId).emit('video-heartbeat', {
      currentTime,
      isPlaying,
      timestamp: Date.now()
    });
  });

  // Chat message
  socket.on('chat-message', ({ text, senderName }) => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const message = {
      id: Math.random().toString(36).substring(2, 9),
      senderId: socket.id,
      senderName: senderName || 'Anonymous',
      text,
      timestamp: Date.now()
    };

    io.to(roomId).emit('chat-message', message);
  });

  // Floating emoji reaction
  socket.on('send-reaction', ({ emoji, senderName }) => {
    const roomId = socket.roomId;
    if (!roomId) return;

    io.to(roomId).emit('receive-reaction', {
      id: Math.random().toString(36).substring(2, 9),
      emoji,
      senderName,
      timestamp: Date.now()
    });
  });

  // Voice status (mute/unmute, speaking for audio ducking)
  socket.on('voice-status', ({ isMuted, isSpeaking }) => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    const participant = room.participants.get(socket.id);
    if (participant) {
      if (typeof isMuted === 'boolean') participant.audioMuted = isMuted;
      if (typeof isSpeaking === 'boolean') participant.isSpeaking = isSpeaking;

      socket.to(roomId).emit('voice-status', {
        socketId: socket.id,
        isMuted: participant.audioMuted,
        isSpeaking: participant.isSpeaking
      });
    }
  });

  // Disconnection handler
  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
    const roomId = socket.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    room.participants.delete(socket.id);

    // If host left, assign new host or close room if empty
    if (room.participants.size === 0) {
      rooms.delete(roomId);
      console.log(`[Room Deleted] ${roomId} is now empty.`);
    } else {
      let newHostAssigned = false;
      if (room.hostId === socket.id) {
        // Assign first remaining participant as host
        const nextParticipant = room.participants.values().next().value;
        if (nextParticipant) {
          room.hostId = nextParticipant.socketId;
          nextParticipant.isHost = true;
          newHostAssigned = true;
          io.to(roomId).emit('host-changed', {
            newHostId: nextParticipant.socketId,
            newHostName: nextParticipant.userName
          });
        }
      }

      io.to(roomId).emit('user-left', {
        socketId: socket.id,
        remainingParticipants: Array.from(room.participants.values())
      });
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`>>> SyncParty Signaling Server running on http://localhost:${PORT}`);
});
