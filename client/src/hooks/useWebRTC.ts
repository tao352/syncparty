import { useEffect, useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { QualitySettings } from '../types';

const DEFAULT_ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' },
    {
      urls: [
        'turn:global.relay.metered.ca:80',
        'turn:global.relay.metered.ca:443',
        'turns:global.relay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
};

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

interface UseWebRTCProps {
  socket: Socket | null;
  roomId: string | null;
  isHost: boolean;
  onRemoteSpeaking?: (isSpeaking: boolean) => void;
}

export function useWebRTC({
  socket,
  roomId,
  isHost,
  onRemoteSpeaking,
}: UseWebRTCProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(true);

  // Map of peer connections: socketId -> RTCPeerConnection
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  // ICE candidate queues: socketId -> RTCIceCandidateInit[] (for candidates arriving before remote description)
  const iceCandidateQueues = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const localStreamRef = useRef<MediaStream | null>(null);
  localStreamRef.current = localStream;

  const micStreamRef = useRef<MediaStream | null>(null);
  micStreamRef.current = micStream;

  // Active ICE servers (fetched from server or default fallback)
  const iceServersRef = useRef<RTCConfiguration>(DEFAULT_ICE_SERVERS);

  // Audio Ducking analyser
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Quality settings state
  const [qualitySettings, setQualitySettings] = useState<QualitySettings>({
    resolution: '1080p',
    frameRate: 60,
    bitrateKbps: 6000,
    hardwareAcceleration: true,
  });

  // Fetch updated ICE servers configuration from backend on mount
  useEffect(() => {
    fetch('/api/ice-servers')
      .then((res) => (res.ok ? res.json() : null))
      .then((servers) => {
        if (Array.isArray(servers) && servers.length > 0) {
          iceServersRef.current = {
            iceServers: servers,
            iceCandidatePoolSize: 10,
          };
          console.log('[WebRTC] Updated ICE Servers config with STUN and TURN relays');
        }
      })
      .catch((err) => {
        console.warn('[WebRTC] Using default fallback ICE servers:', err);
      });
  }, []);

  // Apply bitrate & resolution parameters to active senders
  const applyQualityToPeer = useCallback(
    async (pc: RTCPeerConnection, settings: QualitySettings) => {
      try {
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
        if (!videoSender) return;

        const params = videoSender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }

        if (settings.bitrateKbps > 0) {
          params.encodings[0].maxBitrate = settings.bitrateKbps * 1000;
        } else {
          delete params.encodings[0].maxBitrate;
        }

        params.encodings[0].maxFramerate = settings.frameRate;

        if (settings.resolution === '720p') {
          params.encodings[0].scaleResolutionDownBy = 1.5;
        } else if (settings.resolution === '480p') {
          params.encodings[0].scaleResolutionDownBy = 2.25;
        } else {
          params.encodings[0].scaleResolutionDownBy = 1.0;
        }

        await videoSender.setParameters(params);
      } catch (err) {
        console.warn('[WebRTC] setParameters not supported or failed:', err);
      }
    },
    []
  );

  const updateQuality = useCallback(
    (newSettings: QualitySettings) => {
      setQualitySettings(newSettings);
      peerConnections.current.forEach((pc) => {
        applyQualityToPeer(pc, newSettings);
      });
    },
    [applyQualityToPeer]
  );

  // Setup simple volume threshold detection for audio ducking
  const setupAudioDetection = useCallback(
    (stream: MediaStream, callback: (isSpeaking: boolean) => void) => {
      try {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          const AudioContextClass =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          audioContextRef.current = new AudioContextClass();
        }
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let speakingState = false;

        const checkVolume = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const average = sum / dataArray.length;
          const isNowSpeaking = average > 20;

          if (isNowSpeaking !== speakingState) {
            speakingState = isNowSpeaking;
            callback(speakingState);
          }
          requestAnimationFrame(checkVolume);
        };
        checkVolume();
      } catch (e) {
        console.warn('[AudioDucking] Error creating audio analyser:', e);
      }
    },
    []
  );

  // Create or retrieve PeerConnection for a specific target socket
  const getOrCreatePeerConnection = useCallback(
    (targetSocketId: string): RTCPeerConnection => {
      if (peerConnections.current.has(targetSocketId)) {
        return peerConnections.current.get(targetSocketId)!;
      }

      console.log(`[WebRTC] Initializing new PeerConnection for peer ${targetSocketId}`);
      const pc = new RTCPeerConnection(iceServersRef.current);
      peerConnections.current.set(targetSocketId, pc);

      if (!iceCandidateQueues.current.has(targetSocketId)) {
        iceCandidateQueues.current.set(targetSocketId, []);
      }

      // Track connection state
      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] Connection state for ${targetSocketId}: ${pc.connectionState}`);
        if (pc.connectionState === 'connected') {
          setConnectionStatus('connected');
        } else if (pc.connectionState === 'connecting') {
          setConnectionStatus('connecting');
        } else if (pc.connectionState === 'failed') {
          setConnectionStatus('failed');
          console.warn(`[WebRTC] Peer ${targetSocketId} connection failed. Attempting ICE restart...`);
          if (isHost) {
            createOfferForPeer(targetSocketId, true);
          }
        } else if (pc.connectionState === 'disconnected') {
          setConnectionStatus('reconnecting');
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`[WebRTC] ICE state for ${targetSocketId}: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          setConnectionStatus('connected');
        } else if (pc.iceConnectionState === 'failed') {
          setConnectionStatus('failed');
        }
      };

      // Handle ICE Candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit('signal', {
            to: targetSocketId,
            signal: { candidate: event.candidate.toJSON() },
            streamType: 'video',
          });
        }
      };

      // Handle incoming remote media tracks (Guest receiving host's video/audio)
      pc.ontrack = (event) => {
        console.log(`[WebRTC] >>> Received remote track: kind=${event.track.kind}, id=${event.track.id}`);
        if (event.streams && event.streams[0]) {
          const stream = event.streams[0];
          console.log(`[WebRTC] Remote stream attached with ${stream.getTracks().length} tracks`);
          setRemoteStream(stream);
          setConnectionStatus('connected');

          if (event.track.kind === 'audio' && onRemoteSpeaking) {
            setupAudioDetection(stream, onRemoteSpeaking);
          }
        }
      };

      // Add local video/screen tracks if host
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
        applyQualityToPeer(pc, qualitySettings);
      }

      // Add mic track if active
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, micStreamRef.current!);
        });
      }

      return pc;
    },
    [socket, isHost, qualitySettings, applyQualityToPeer, onRemoteSpeaking, setupAudioDetection]
  );

  // Flush queued ICE candidates after remote description is set
  const flushIceCandidates = useCallback(async (targetSocketId: string, pc: RTCPeerConnection) => {
    const queue = iceCandidateQueues.current.get(targetSocketId);
    if (!queue || queue.length === 0) return;

    console.log(`[WebRTC] Flushing ${queue.length} buffered ICE candidates for ${targetSocketId}`);
    while (queue.length > 0) {
      const cand = queue.shift();
      if (cand) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.warn('[WebRTC] Error adding buffered ICE candidate:', e);
        }
      }
    }
  }, []);

  // Host creates WebRTC offer for a specific peer
  const createOfferForPeer = useCallback(
    async (targetSocketId: string, iceRestart = false) => {
      const pc = getOrCreatePeerConnection(targetSocketId);

      // Ensure tracks are added
      if (localStreamRef.current) {
        const senders = pc.getSenders();
        localStreamRef.current.getTracks().forEach((track) => {
          const existing = senders.find((s) => s.track && s.track.kind === track.kind);
          if (!existing) {
            pc.addTrack(track, localStreamRef.current!);
          }
        });
      }

      try {
        setConnectionStatus('connecting');
        const offer = await pc.createOffer({ iceRestart });
        await pc.setLocalDescription(offer);
        console.log(`[WebRTC] Sending Offer to peer ${targetSocketId} (iceRestart=${iceRestart})`);

        socket?.emit('signal', {
          to: targetSocketId,
          signal: { sdp: pc.localDescription },
          streamType: 'video',
        });
        applyQualityToPeer(pc, qualitySettings);
      } catch (err) {
        console.error(`[WebRTC] Failed creating offer for peer ${targetSocketId}:`, err);
        setConnectionStatus('failed');
      }
    },
    [getOrCreatePeerConnection, socket, qualitySettings, applyQualityToPeer]
  );

  // Attach local stream (from video or screen share) and broadcast to all peers
  const setMediaStream = useCallback(
    async (stream: MediaStream | null) => {
      setLocalStream(stream);
      localStreamRef.current = stream;

      if (!stream) {
        // Remove tracks from all peer connections
        peerConnections.current.forEach((pc) => {
          pc.getSenders().forEach((sender) => {
            if (sender.track && (sender.track.kind === 'video' || sender.track.kind === 'audio')) {
              pc.removeTrack(sender);
            }
          });
        });
        return;
      }

      console.log(`[WebRTC] setMediaStream: new stream with ${stream.getTracks().length} tracks`);

      // For every connected peer, update tracks and renegotiate
      for (const [targetSocketId, pc] of peerConnections.current.entries()) {
        const senders = pc.getSenders();
        stream.getTracks().forEach((track) => {
          const existingSender = senders.find((s) => s.track && s.track.kind === track.kind);
          if (existingSender) {
            existingSender.replaceTrack(track);
          } else {
            pc.addTrack(track, stream);
          }
        });

        // Renegotiate with offer
        createOfferForPeer(targetSocketId);
      }
    },
    [createOfferForPeer]
  );

  // Guest requests stream from host
  const requestStreamFromHost = useCallback(() => {
    if (!socket || isHost) return;
    console.log(`[WebRTC] Requesting stream from host in room ${roomId}`);
    setConnectionStatus('connecting');
    socket.emit('request-stream', { roomId });
  }, [socket, isHost, roomId]);

  // Toggle Microphone
  const toggleMicrophone = useCallback(async () => {
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      setMicStream(null);
      setIsMicMuted(true);
      socket?.emit('voice-status', { isMuted: true, isSpeaking: false });
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        setMicStream(stream);
        setIsMicMuted(false);
        socket?.emit('voice-status', { isMuted: false, isSpeaking: false });

        peerConnections.current.forEach((pc) => {
          stream.getAudioTracks().forEach((track) => {
            pc.addTrack(track, stream);
          });
        });
      } catch (err) {
        console.error('[WebRTC] Failed to get microphone access:', err);
      }
    }
  }, [micStream, socket]);

  // Main Signaling Listener
  useEffect(() => {
    if (!socket) return;

    // Handle incoming WebRTC SDP or ICE Candidate
    const handleSignal = async ({
      from,
      signal,
    }: {
      from: string;
      signal: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
    }) => {
      const pc = getOrCreatePeerConnection(from);

      if (signal.sdp) {
        console.log(`[WebRTC] Received SDP ${signal.sdp.type} from ${from}`);
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

        // Flush any candidates that arrived while waiting for remote description
        await flushIceCandidates(from, pc);

        if (signal.sdp.type === 'offer') {
          // Add local mic track to answer if active
          if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach((track) => {
              pc.addTrack(track, micStreamRef.current!);
            });
          }

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          console.log(`[WebRTC] Generated Answer for ${from}. Sending...`);

          socket.emit('signal', {
            to: from,
            signal: { sdp: pc.localDescription },
            streamType: 'video',
          });
        }
      } else if (signal.candidate) {
        // If remote description is already set, add candidate directly; otherwise buffer it
        if (pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (e) {
            console.warn('[WebRTC] Error adding ICE candidate:', e);
          }
        } else {
          const queue = iceCandidateQueues.current.get(from) || [];
          queue.push(signal.candidate);
          iceCandidateQueues.current.set(from, queue);
        }
      }
    };

    // When a new user joins:
    const handleUserJoined = ({ participant }: { participant: { socketId: string } }) => {
      console.log(`[WebRTC] User joined room: ${participant.socketId}`);
      // Host immediately initiates an offer if local stream is active
      if (isHost && localStreamRef.current) {
        createOfferForPeer(participant.socketId);
      }
    };

    // When a guest explicitly requests the stream from host
    const handleStreamRequested = ({ bySocketId }: { bySocketId: string }) => {
      console.log(`[WebRTC] Stream explicitly requested by ${bySocketId}`);
      if (isHost) {
        createOfferForPeer(bySocketId);
      }
    };

    const handleUserLeft = ({ socketId }: { socketId: string }) => {
      const pc = peerConnections.current.get(socketId);
      if (pc) {
        pc.close();
        peerConnections.current.delete(socketId);
        iceCandidateQueues.current.delete(socketId);
      }
    };

    socket.on('signal', handleSignal);
    socket.on('user-joined', handleUserJoined);
    socket.on('stream-requested', handleStreamRequested);
    socket.on('user-left', handleUserLeft);

    // If guest, immediately ask host for stream
    if (!isHost) {
      requestStreamFromHost();
    }

    return () => {
      socket.off('signal', handleSignal);
      socket.off('user-joined', handleUserJoined);
      socket.off('stream-requested', handleStreamRequested);
      socket.off('user-left', handleUserLeft);
    };
  }, [
    socket,
    isHost,
    getOrCreatePeerConnection,
    createOfferForPeer,
    flushIceCandidates,
    requestStreamFromHost,
  ]);

  // Clean up on unmount or room exit
  useEffect(() => {
    return () => {
      peerConnections.current.forEach((pc) => pc.close());
      peerConnections.current.clear();
      iceCandidateQueues.current.clear();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [roomId]);

  return {
    localStream,
    remoteStream,
    setMediaStream,
    connectionStatus,
    qualitySettings,
    updateQuality,
    micStream,
    isMicMuted,
    toggleMicrophone,
    requestStreamFromHost,
  };
}
