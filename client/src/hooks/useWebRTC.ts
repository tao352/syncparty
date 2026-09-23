import { useEffect, useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { QualitySettings } from '../types';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

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
  // Local media stream (from local video or screen share)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  // Remote stream (for guests receiving host's video)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  // Microphone stream for voice chat
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(true);

  // Map of peer connections: socketId -> RTCPeerConnection
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  localStreamRef.current = localStream;

  const micStreamRef = useRef<MediaStream | null>(null);
  micStreamRef.current = micStream;

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

  // Apply bitrate & resolution parameters to active senders
  const applyQualityToPeer = useCallback(
    async (pc: RTCPeerConnection, settings: QualitySettings) => {
      try {
        const senders = pc.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
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
        console.log(`[WebRTC] Applied quality: ${settings.resolution} @ ${settings.frameRate}fps, ${settings.bitrateKbps}kbps`);
      } catch (err) {
        console.warn('[WebRTC] Failed to setSenderParameters:', err);
      }
    },
    []
  );

  // Update quality across all connected peers
  const updateQuality = useCallback(
    (newSettings: QualitySettings) => {
      setQualitySettings(newSettings);
      peerConnections.current.forEach((pc) => {
        applyQualityToPeer(pc, newSettings);
      });
    },
    [applyQualityToPeer]
  );

  // Create or retrieve PeerConnection for a specific target socket
  const getOrCreatePeerConnection = useCallback(
    (targetSocketId: string): RTCPeerConnection => {
      if (peerConnections.current.has(targetSocketId)) {
        return peerConnections.current.get(targetSocketId)!;
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnections.current.set(targetSocketId, pc);

      // Handle ICE Candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit('signal', {
            to: targetSocketId,
            signal: { candidate: event.candidate },
            streamType: 'video',
          });
        }
      };

      // Handle incoming remote media tracks (Guest receiving host's video/audio)
      pc.ontrack = (event) => {
        console.log(`[WebRTC] Received remote track: kind=${event.track.kind}`);
        if (event.streams && event.streams[0]) {
          const stream = event.streams[0];
          setRemoteStream(stream);

          // Audio Ducking monitor for remote voice
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
    [socket, qualitySettings, applyQualityToPeer, onRemoteSpeaking]
  );

  // Setup simple volume threshold detection for audio ducking
  const setupAudioDetection = (stream: MediaStream, callback: (isSpeaking: boolean) => void) => {
    try {
      if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioContextRef.current = new AudioContextClass();
      }
      const ctx = audioContextRef.current;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
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
        const isNowSpeaking = average > 25; // volume threshold

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
  };

  // Attach local stream (from video or screen share) and broadcast to all peers
  const setMediaStream = useCallback(
    async (stream: MediaStream | null) => {
      setLocalStream(stream);
      localStreamRef.current = stream;

      if (!stream) {
        // Remove video tracks from all PCs
        peerConnections.current.forEach((pc) => {
          const senders = pc.getSenders();
          senders.forEach((sender) => {
            if (sender.track && (sender.track.kind === 'video' || sender.track.kind === 'audio')) {
              pc.removeTrack(sender);
            }
          });
        });
        return;
      }

      // Add or replace tracks for each connected peer
      for (const [targetSocketId, pc] of peerConnections.current.entries()) {
        const senders = pc.getSenders();
        stream.getTracks().forEach((track) => {
          const existingSender = senders.find(s => s.track && s.track.kind === track.kind);
          if (existingSender) {
            existingSender.replaceTrack(track);
          } else {
            pc.addTrack(track, stream);
          }
        });

        // Re-negotiate offer
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket?.emit('signal', {
            to: targetSocketId,
            signal: { sdp: pc.localDescription },
            streamType: 'video',
          });
          applyQualityToPeer(pc, qualitySettings);
        } catch (err) {
          console.error('[WebRTC] Error renegotiating after adding track:', err);
        }
      }
    },
    [socket, qualitySettings, applyQualityToPeer]
  );

  // Toggle Microphone
  const toggleMicrophone = useCallback(async () => {
    if (micStream) {
      // Mute / Stop mic
      micStream.getTracks().forEach(t => t.stop());
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

        // Add mic tracks to all peer connections
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

  // Handle incoming signaling messages from Socket.io
  useEffect(() => {
    if (!socket) return;

    const handleSignal = async ({
      from,
      signal,
    }: {
      from: string;
      signal: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
    }) => {
      const pc = getOrCreatePeerConnection(from);

      if (signal.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

        if (signal.sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('signal', {
            to: from,
            signal: { sdp: pc.localDescription },
            streamType: 'video',
          });
        }
      } else if (signal.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch (e) {
          console.warn('[WebRTC] Error adding ICE candidate:', e);
        }
      }
    };

    // When a new user joins, if we are host and have a stream, initiate the WebRTC offer
    const handleUserJoined = async ({ participant }: { participant: { socketId: string } }) => {
      console.log(`[WebRTC] New participant joined: ${participant.socketId}`);
      if (isHost && localStreamRef.current) {
        const pc = getOrCreatePeerConnection(participant.socketId);
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('signal', {
            to: participant.socketId,
            signal: { sdp: pc.localDescription },
            streamType: 'video',
          });
          applyQualityToPeer(pc, qualitySettings);
        } catch (e) {
          console.error('[WebRTC] Failed creating offer for new user:', e);
        }
      }
    };

    const handleUserLeft = ({ socketId }: { socketId: string }) => {
      const pc = peerConnections.current.get(socketId);
      if (pc) {
        pc.close();
        peerConnections.current.delete(socketId);
      }
    };

    socket.on('signal', handleSignal);
    socket.on('user-joined', handleUserJoined);
    socket.on('user-left', handleUserLeft);

    return () => {
      socket.off('signal', handleSignal);
      socket.off('user-joined', handleUserJoined);
      socket.off('user-left', handleUserLeft);
    };
  }, [socket, isHost, getOrCreatePeerConnection, qualitySettings, applyQualityToPeer]);

  // Clean up on unmount or room leave
  useEffect(() => {
    return () => {
      peerConnections.current.forEach((pc) => pc.close());
      peerConnections.current.clear();
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
    qualitySettings,
    updateQuality,
    micStream,
    isMicMuted,
    toggleMicrophone,
  };
}
