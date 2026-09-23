import React, { useRef, useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Sliders,
  Upload,
  Monitor,
  Subtitles,
  FileVideo,
  Radio,
} from 'lucide-react';
import { SubtitleCue, FloatingReaction, VideoSourceType } from '../types';
import { parseSubtitles } from '../utils/subtitleParser';

interface VideoPlayerProps {
  isHost: boolean;
  remoteStream: MediaStream | null;
  onStreamReady: (stream: MediaStream | null) => void;
  onVideoAction: (action: 'play' | 'pause' | 'seek', fileName?: string) => void;
  videoRef: React.RefObject<HTMLVideoElement>;
  reactions: FloatingReaction[];
  onOpenQualitySettings: () => void;
  isAudioDuckingActive?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  isHost,
  remoteStream,
  onStreamReady,
  onVideoAction,
  videoRef,
  reactions,
  onOpenQualitySettings,
  isAudioDuckingActive = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const subtitleInputRef = useRef<HTMLInputElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [videoSource, setVideoSource] = useState<VideoSourceType>('none');
  const [currentFileName, setCurrentFileName] = useState('');

  // Subtitles
  const [subtitles, setSubtitles] = useState<SubtitleCue[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<string>('');
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);

  // Controls auto-hide timer
  const controlsTimeoutRef = useRef<number | null>(null);

  // Manage Audio Ducking
  useEffect(() => {
    if (!videoRef.current) return;
    if (isAudioDuckingActive) {
      videoRef.current.volume = Math.max(0.2, (isMuted ? 0 : volume) * 0.35);
    } else {
      videoRef.current.volume = isMuted ? 0 : volume;
    }
  }, [isAudioDuckingActive, volume, isMuted, videoRef]);

  // Attach remote stream to guest video element
  useEffect(() => {
    if (!isHost && videoRef.current) {
      if (remoteStream) {
        console.log('[VideoPlayer] Attaching remoteStream to guest player');
        videoRef.current.srcObject = remoteStream;
        videoRef.current.play().catch((err) => {
          console.warn('[VideoPlayer] Guest autoplay blocked:', err);
        });
        setVideoSource('screen'); // treated as live stream
      } else {
        videoRef.current.srcObject = null;
        setVideoSource('none');
      }
    }
  }, [isHost, remoteStream, videoRef]);

  // Video time update & subtitle tracking
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    // Track active subtitle cue
    if (subtitles.length > 0 && subtitlesEnabled) {
      const active = subtitles.find(
        (cue) => time >= cue.startTime && time <= cue.endTime
      );
      setActiveSubtitle(active ? active.text : '');
    } else {
      setActiveSubtitle('');
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 0);
    }
  };

  // Play / Pause toggle
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
        if (isHost) onVideoAction('play', currentFileName);
      });
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      if (isHost) onVideoAction('pause', currentFileName);
    }
  };

  // Seek handler
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current || !isHost) return;
    const newTime = parseFloat(e.target.value);
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    onVideoAction('seek', currentFileName);
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  // Volume handler
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);
    if (videoRef.current) {
      videoRef.current.volume = val;
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    if (isMuted) {
      videoRef.current.volume = volume || 1;
      setIsMuted(false);
    } else {
      videoRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  // Host loads local video file
  const handleFileSelect = (file: File) => {
    if (!videoRef.current) return;

    const fileUrl = URL.createObjectURL(file);
    videoRef.current.srcObject = null;
    videoRef.current.src = fileUrl;
    setCurrentFileName(file.name);
    setVideoSource('local');

    videoRef.current.onloadedmetadata = () => {
      setDuration(videoRef.current?.duration || 0);

      // Create WebRTC stream using captureStream()
      try {
        const videoEl = videoRef.current as HTMLVideoElement & {
          captureStream?: () => MediaStream;
          mozCaptureStream?: () => MediaStream;
        };
        const stream = (videoEl.captureStream || videoEl.mozCaptureStream)?.call(videoEl);

        if (stream) {
          console.log('[VideoPlayer] Successfully captured video stream for WebRTC P2P');
          onStreamReady(stream);
        } else {
          console.warn('[VideoPlayer] captureStream not supported in this browser; fallback to screen share.');
        }
      } catch (err) {
        console.error('[VideoPlayer] Failed to captureStream from video element:', err);
      }
    };
  };

  // Host starts screen / window sharing
  const handleStartScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'window',
          frameRate: 60,
        },
        audio: true, // share system audio
      });

      if (videoRef.current) {
        videoRef.current.src = '';
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      setVideoSource('screen');
      setCurrentFileName('Live Screen / Window Stream');
      onStreamReady(stream);

      // Handle when user stops sharing via browser bar
      stream.getVideoTracks()[0].onended = () => {
        setVideoSource('none');
        onStreamReady(null);
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      };
    } catch (err) {
      console.warn('[VideoPlayer] Screen share cancelled or rejected:', err);
    }
  };

  // Subtitle file parser
  const handleSubtitleFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsedCues = parseSubtitles(text);
      setSubtitles(parsedCues);
      setSubtitlesEnabled(true);
      console.log(`[Subtitles] Loaded ${parsedCues.length} subtitle cues from ${file.name}`);
    } catch (err) {
      console.error('[Subtitles] Failed reading subtitle file:', err);
    }
  };

  // Drag and drop handlers
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isHost) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.srt') || file.name.endsWith('.vtt')) {
        handleSubtitleFile(file);
      } else {
        handleFileSelect(file);
      }
    }
  };

  // Format seconds to mm:ss or hh:mm:ss
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = window.setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 2800);
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className="relative flex-1 h-full bg-black flex items-center justify-center overflow-hidden select-none group"
    >
      {/* HTML5 Video Element */}
      <video
        ref={videoRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        playsInline
        className="w-full h-full object-contain pointer-events-none"
      />

      {/* Floating Emoji Reactions Layer */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
        {reactions.map((reaction) => (
          <div
            key={reaction.id}
            style={{ left: `${reaction.xOffset}%` }}
            className="absolute bottom-16 text-4xl animate-float-up"
          >
            {reaction.emoji}
          </div>
        ))}
      </div>

      {/* Subtitles Overlay */}
      {activeSubtitle && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 pointer-events-none px-4 max-w-4xl text-center">
          <span className="cinema-subtitle bg-black/60 backdrop-blur-xs px-3 py-1.5 rounded-lg text-white font-medium text-lg md:text-xl inline-block leading-snug">
            {activeSubtitle}
          </span>
        </div>
      )}

      {/* Empty State / Select Video Screen (When no video is playing) */}
      {videoSource === 'none' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-cinema-950/90 z-10">
          <div className="max-w-md w-full p-8 rounded-2xl bg-cinema-900 border border-cinema-800 text-center shadow-2xl">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center text-gold-400">
              <FileVideo className="w-7 h-7" />
            </div>

            <h3 className="text-xl font-bold text-cinema-100 mb-1">
              {isHost ? 'Load Video to Start Party' : 'Waiting for Host to Stream'}
            </h3>
            <p className="text-xs text-cinema-400 mb-6">
              {isHost
                ? 'Drag & drop any video file directly, or choose your screen window with audio.'
                : 'The host has not started playing a video yet. It will automatically appear here once started.'}
            </p>

            {isHost && (
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  className="hidden"
                />

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 px-4 rounded-xl bg-gold-500 hover:bg-gold-600 active:scale-[0.98] text-cinema-950 font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-gold-500/20 transition-all"
                >
                  <Upload className="w-4 h-4" />
                  <span>Choose Local Video (MP4, WebM, MKV)</span>
                </button>

                <div className="flex items-center gap-3 my-2">
                  <div className="flex-1 h-px bg-cinema-800"></div>
                  <span className="text-[11px] text-cinema-600 uppercase font-mono">Or</span>
                  <div className="flex-1 h-px bg-cinema-800"></div>
                </div>

                <button
                  onClick={handleStartScreenShare}
                  className="w-full py-2.5 px-4 rounded-xl bg-cinema-850 hover:bg-cinema-800 border border-cinema-700/80 active:scale-[0.98] text-cinema-100 font-medium text-xs flex items-center justify-center gap-2 transition-all"
                >
                  <Monitor className="w-4 h-4 text-cinema-400" />
                  <span>Share Screen / Window with Audio</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Live Badge (Top Left) */}
      {videoSource !== 'none' && (
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-xs font-medium text-white/90">
          <Radio className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
          <span className="truncate max-w-[200px] md:max-w-xs">{currentFileName || 'Live Stream'}</span>
        </div>
      )}

      {/* Sleek Cinema Controls Bar (Bottom) */}
      <div
        className={`absolute inset-x-0 bottom-0 z-30 pt-16 pb-4 px-6 bg-gradient-to-t from-black/95 via-black/60 to-transparent transition-opacity duration-300 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Seek Bar (Visible for local video files) */}
        {videoSource === 'local' && (
          <div className="relative mb-3 group/seek">
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.1"
              value={currentTime}
              disabled={!isHost}
              onChange={handleSeek}
              className={`w-full h-1.5 rounded-lg bg-white/20 accent-gold-500 cursor-pointer ${
                !isHost ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            />
          </div>
        )}

        {/* Buttons Row */}
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-4">
            {/* Play/Pause (Host Only) */}
            {isHost && videoSource === 'local' && (
              <button
                onClick={togglePlay}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-[0.95] text-white transition-all"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              </button>
            )}

            {/* Volume Control */}
            <div className="flex items-center gap-2 group/volume">
              <button
                onClick={toggleMute}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/90"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 accent-gold-500 bg-white/30 rounded-lg cursor-pointer transition-all"
              />
            </div>

            {/* Time Indicator */}
            {videoSource === 'local' && (
              <div className="text-xs font-mono text-white/70">
                <span>{formatTime(currentTime)}</span>
                <span className="mx-1 text-white/40">/</span>
                <span>{formatTime(duration)}</span>
              </div>
            )}
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Subtitles Input (Host) */}
            {isHost && (
              <>
                <input
                  ref={subtitleInputRef}
                  type="file"
                  accept=".srt,.vtt"
                  onChange={(e) => e.target.files?.[0] && handleSubtitleFile(e.target.files[0])}
                  className="hidden"
                />
                <button
                  onClick={() => subtitleInputRef.current?.click()}
                  className={`p-2 rounded-xl transition-colors ${
                    subtitles.length > 0 ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30' : 'hover:bg-white/10 text-white/80'
                  }`}
                  title={subtitles.length > 0 ? `${subtitles.length} Subtitles Loaded` : 'Load Subtitles (.srt/.vtt)'}
                >
                  <Subtitles className="w-4 h-4" />
                </button>
              </>
            )}

            {/* Quality & Performance Settings Modal Trigger */}
            <button
              onClick={onOpenQualitySettings}
              className="p-2 rounded-xl hover:bg-white/10 text-white/80 transition-colors"
              title="Stream Quality & Performance Settings"
            >
              <Sliders className="w-4 h-4" />
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-xl hover:bg-white/10 text-white/80 transition-colors"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
