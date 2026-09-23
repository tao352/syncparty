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
  // ICE candidate queues: socketId -> any[]
  const iceCandidateQueues = useRef<Map<string, any[]>>(new Map());

  const localStreamRef = useRef<MediaStream | null>(null);
  localStreamRef.current = localStream;

  const micStreamRef = useRef<MediaStream | null>(null);
  micStreamRef.current = micStream;

  const iceServersRef = useRef<RTCConfiguration>(DEFAULT_ICE_SERVERS);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Default to 720p @ 30fps at 1500 kbps (1.5 Mbps) for buttery smooth streaming on standard home upload
  const [qualitySettings, setQualitySettings] = useState<QualitySettings>({
    resolution: '720p',
    frameRate: 30,
    bitrateKbps: 1500,
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
          console.log('[WebRTC] Active ICE Servers:', servers);
        }
      })
      .catch((err) => {
        console.warn('[WebRTC] Fallback to default ICE servers:', err);
      });
  }, []);

  // Apply bitrate & resolution parameters
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

        // CRITICAL FIX: Prioritize smooth framerate over resolution to eliminate lag and stutter!
        (params as any).degradationPreference = 'maintain-framerate';

        if (settings.bitrateKbps > 0) {
          params.encodings[0].maxBitrate = settings.bitrateKbps * 1000;
        } else {
          params.encodings[0].maxBitrate = 1500 * 1000;
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
        console.log(`[WebRTC] Set quality: ${settings.resolution} @ ${settings.frameRate}fps, ${settings.bitrateKbps}kbps (maintain-framerate)`);
      } catch (err) {
        console.warn('[WebRTC] setParameters failed:', err);
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

      console.log(`[WebRTC] Creating new RTCPeerConnection for ${targetSocketId}`);
      const pc = new RTCPeerConnection(iceServersRef.current);
      peerConnections.current.set(targetSocketId, pc);

      if (!iceCandidateQueues.current.has(targetSocketId)) {
        iceCandidateQueues.current.set(targetSocketId, []);
      }

      // CRITICAL FIX: Always create a DataChannel on Host to force ICE gathering immediately
      if (isHost) {
        try {
          const dc = pc.createDataChannel('sync-channel', { ordered: true });
          dc.onopen = () => console.log(`[WebRTC] Host DataChannel OPEN with ${targetSocketId}`);
          dc.onmessage = (e) => console.log(`[WebRTC] Received DC msg:`, e.data);
        } catch (e) {
          console.warn('[WebRTC] DataChannel create error:', e);
        }
      } else {
        pc.ondatachannel = (ev) => {
          console.log(`[WebRTC] Guest DataChannel received:`, ev.channel.label);
          ev.channel.onopen = () => console.log('[WebRTC] Guest DataChannel OPEN');
        };
      }

      // Track connection state
      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] State for ${targetSocketId}: ${pc.connectionState}`);
        if (pc.connectionState === 'connected') {
          setConnectionStatus('connected');
        } else if (pc.connectionState === 'connecting') {
          setConnectionStatus('connecting');
        } else if (pc.connectionState === 'failed') {
          setConnectionStatus('failed');
          console.warn(`[WebRTC] Connection failed with ${targetSocketId}. Retrying with ICE restart...`);
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
          console.log(`[WebRTC] >>> Gathered ICE candidate for ${targetSocketId}: ${event.candidate.type || 'relay/srflx'}`);
          socket.emit('signal', {
            to: targetSocketId,
            signal: {
              candidate: {
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex,
                usernameFragment: event.candidate.usernameFragment,
              },
            },
            streamType: 'video',
          });
        }
      };

      // Handle incoming remote media tracks (Guest receiving host's video/audio)
      pc.ontrack = (event) => {
        console.log(`[WebRTC] >>> Received remote track: kind=${event.track.kind}, id=${event.track.id}`);
        if (event.streams && event.streams[0]) {
          const stream = event.streams[0];
          console.log(`[WebRTC] Remote stream attached! Tracks: ${stream.getTracks().length}`);
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

      // Prevent race conditions / Glare: only initiate when signaling state is stable
      if (pc.signalingState !== 'stable') {
        console.log(`[WebRTC] Peer ${targetSocketId} is in ${pc.signalingState}, waiting for stable state before offering.`);
        return;
      }

      // Ensure local tracks are attached
      if (localStreamRef.current) {
        const senders = pc.getSenders();
        localStreamRef.current.getTracks().forEach((track) => {
          const existing = senders.find((s) => s.track && s.track.kind === track.kind);
          if (existing) {
            existing.replaceTrack(track);
          } else {
            pc.addTrack(track, localStreamRef.current!);
          }
        });
      }

      try {
        setConnectionStatus('connecting');
        const offer = await pc.createOffer({
          iceRestart,
          offerToReceiveAudio: false,
          offerToReceiveVideo: false,
        });
        await pc.setLocalDescription(offer);
        console.log(`[WebRTC] Sent Offer to ${targetSocketId} (iceRestart=${iceRestart})`);

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

      console.log(`[WebRTC] setMediaStream: new stream with ${stream.getTracks().length} tracks!`);

      // For every connected peer, update tracks and renegotiate offer
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
    console.log(`[WebRTC] Guest requesting stream in room ${roomId}`);
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
      signal: { sdp?: RTCSessionDescriptionInit; candidate?: any };
    }) => {
      const pc = getOrCreatePeerConnection(from);

      if (signal.sdp) {
        console.log(`[WebRTC] Received SDP ${signal.sdp.type} from ${from}`);
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

        // Flush queued candidates
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
            console.log(`[WebRTC] Added ICE candidate from ${from}`);
          } catch (e) {
            console.warn('[WebRTC] Error adding ICE candidate:', e);
          }
        } else {
          console.log(`[WebRTC] Buffering ICE candidate from ${from} (waiting for remoteDescription)`);
          const queue = iceCandidateQueues.current.get(from) || [];
          queue.push(signal.candidate);
          iceCandidateQueues.current.set(from, queue);
        }
      }
    };

    const handleUserJoined = ({ participant }: { participant: { socketId: string } }) => {
      console.log(`[WebRTC] User joined room: ${participant.socketId}`);
      if (isHost) {
        createOfferForPeer(participant.socketId);
      }
    };

    const handleStreamRequested = ({ bySocketId }: { bySocketId: string }) => {
      console.log(`[WebRTC] Stream requested by ${bySocketId}`);
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
