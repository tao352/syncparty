import { useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { VideoState } from '../types';

interface UseSyncEngineProps {
  socket: Socket | null;
  isHost: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  onStateChange?: (state: VideoState) => void;
}

export function useSyncEngine({
  socket,
  isHost,
  videoRef,
  onStateChange,
}: UseSyncEngineProps) {
  const isSelfTriggered = useRef(false);

  // Host sends state change (play, pause, seek)
  const emitVideoAction = useCallback(
    (action: 'play' | 'pause' | 'seek', fileName?: string) => {
      if (!socket || !isHost || !videoRef.current) return;
      if (isSelfTriggered.current) return;

      const video = videoRef.current;
      const payload = {
        action,
        currentTime: video.currentTime,
        isPlaying: !video.paused,
        fileName: fileName !== undefined ? fileName : '',
      };

      socket.emit('sync-video', payload);
      if (onStateChange) {
        onStateChange({
          isPlaying: payload.isPlaying,
          currentTime: payload.currentTime,
          fileName: payload.fileName,
          updatedAt: Date.now(),
        });
      }
    },
    [socket, isHost, videoRef, onStateChange]
  );

  // Host Heartbeat: every 2 seconds to correct any drift
  useEffect(() => {
    if (!socket || !isHost) return;

    const interval = setInterval(() => {
      const video = videoRef.current;
      if (video && !video.paused) {
        socket.emit('video-heartbeat', {
          currentTime: video.currentTime,
          isPlaying: !video.paused,
        });
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [socket, isHost, videoRef]);

  // Guest listener for Host's actions and heartbeats
  useEffect(() => {
    if (!socket) return;

    const handleSyncVideo = ({
      action,
      videoState,
    }: {
      action: string;
      videoState: VideoState;
    }) => {
      console.log(`[SyncEngine] Received sync action: ${action}`, videoState);
      if (onStateChange) onStateChange(videoState);

      const video = videoRef.current;
      if (!video) return;

      isSelfTriggered.current = true;

      // Calculate latency offset if possible
      const latencySeconds = Math.max(0, (Date.now() - videoState.updatedAt) / 1000);
      const targetTime = videoState.currentTime + (videoState.isPlaying ? latencySeconds : 0);

      if (action === 'seek' || Math.abs(video.currentTime - targetTime) > 0.4) {
        video.currentTime = targetTime;
      }

      if (videoState.isPlaying && video.paused) {
        video.play().catch(() => {
          console.warn('[SyncEngine] Autoplay was prevented by browser; waiting for user interaction.');
        });
      } else if (!videoState.isPlaying && !video.paused) {
        video.pause();
      }

      setTimeout(() => {
        isSelfTriggered.current = false;
      }, 100);
    };

    const handleHeartbeat = ({
      currentTime,
      isPlaying,
      timestamp,
    }: {
      currentTime: number;
      isPlaying: boolean;
      timestamp: number;
    }) => {
      const video = videoRef.current;
      if (!video) return;

      const networkLag = Math.max(0, (Date.now() - timestamp) / 1000);
      const expectedTime = currentTime + (isPlaying ? networkLag : 0);

      // Only adjust if drift is greater than 0.6 seconds
      const drift = Math.abs(video.currentTime - expectedTime);
      if (drift > 0.6) {
        console.log(`[SyncEngine] Correcting playback drift of ${drift.toFixed(2)}s`);
        isSelfTriggered.current = true;
        video.currentTime = expectedTime;
        setTimeout(() => {
          isSelfTriggered.current = false;
        }, 100);
      }
    };

    socket.on('sync-video', handleSyncVideo);
    socket.on('video-heartbeat', handleHeartbeat);

    return () => {
      socket.off('sync-video', handleSyncVideo);
      socket.off('video-heartbeat', handleHeartbeat);
    };
  }, [socket, videoRef, onStateChange]);

  return {
    emitVideoAction,
  };
}
