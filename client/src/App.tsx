import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { Participant, VideoState } from './types';
import { LobbyPage } from './pages/LobbyPage';
import { RoomPage } from './pages/RoomPage';

// Connect to signaling server (uses proxy in development or direct host in production)
const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:4000' : window.location.origin;

export const App: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [currentRoom, setCurrentRoom] = useState<{
    id: string;
    isHost: boolean;
    initialVideoState?: VideoState;
    initialLosslessVideo?: boolean;
    initialStreamUrl?: string | null;
  } | null>(null);
  const [currentUser, setCurrentUser] = useState<{ name: string; socketId: string }>({
    name: '',
    socketId: '',
  });
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Extract ?room=xyz from query params if someone clicked an invite link
  const [initialRoomParam, setInitialRoomParam] = useState<string>('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setInitialRoomParam(roomParam.trim());
    }

    const s = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });

    s.on('connect', () => {
      console.log(`[Socket] Connected to signaling server with ID: ${s.id}`);
    });

    s.on('connect_error', (err) => {
      console.warn('[Socket] Connection error:', err);
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, []);

  // Handle Room Creation
  const handleCreateRoom = (roomId: string, name: string, password?: string) => {
    if (!socket) {
      setError('Connecting to signaling server... Please wait a second.');
      return;
    }
    setError(null);
    setIsLoading(true);

    socket.emit(
      'create-room',
      { roomId, password, userName: name },
      (res: {
        success: boolean;
        error?: string;
        roomId: string;
        isHost: boolean;
        participants: Participant[];
        videoState: VideoState;
      }) => {
        setIsLoading(false);
        if (!res.success) {
          setError(res.error || 'Failed to create room.');
          return;
        }

        // Update URL query without page reload
        window.history.pushState({}, '', `?room=${res.roomId}`);

        setCurrentUser({ name, socketId: socket.id || '' });
        setParticipants(res.participants || []);
        setCurrentRoom({
          id: res.roomId,
          isHost: true,
          initialVideoState: res.videoState,
        });
      }
    );
  };

  // Handle Room Joining
  const handleJoinRoom = (roomId: string, name: string, password?: string) => {
    if (!socket) {
      setError('Connecting to signaling server... Please wait a second.');
      return;
    }
    setError(null);
    setIsLoading(true);

    socket.emit(
      'join-room',
      { roomId, password, userName: name },
      (res: {
        success: boolean;
        error?: string;
        roomId: string;
        isHost: boolean;
        participants: Participant[];
        videoState: VideoState;
        hasLosslessVideo?: boolean;
        streamUrl?: string | null;
      }) => {
        setIsLoading(false);
        if (!res.success) {
          setError(res.error || 'Failed to join room.');
          return;
        }

        window.history.pushState({}, '', `?room=${res.roomId}`);

        setCurrentUser({ name, socketId: socket.id || '' });
        setParticipants(res.participants || []);
        setCurrentRoom({
          id: res.roomId,
          isHost: res.isHost,
          initialVideoState: res.videoState,
          initialLosslessVideo: res.hasLosslessVideo,
          initialStreamUrl: res.streamUrl,
        });
      }
    );
  };

  // Handle Leaving Room
  const handleLeaveRoom = () => {
    if (socket && currentRoom) {
      socket.disconnect();
      socket.connect();
    }
    // Clean URL
    window.history.pushState({}, '', window.location.pathname);
    setCurrentRoom(null);
  };

  return (
    <div className="w-full min-h-[100dvh]">
      {!currentRoom ? (
        <LobbyPage
          initialRoomId={initialRoomParam}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          error={error}
          isLoading={isLoading}
        />
      ) : (
        <RoomPage
          socket={socket}
          roomId={currentRoom.id}
          isHost={currentRoom.isHost}
          currentUser={currentUser}
          initialParticipants={participants}
          initialVideoState={currentRoom.initialVideoState}
          initialLosslessVideo={currentRoom.initialLosslessVideo}
          initialStreamUrl={currentRoom.initialStreamUrl}
          onLeaveRoom={handleLeaveRoom}
        />
      )}
    </div>
  );
};

export default App;
