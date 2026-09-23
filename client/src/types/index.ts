export interface Participant {
  socketId: string;
  userName: string;
  isHost: boolean;
  audioMuted: boolean;
  isSpeaking: boolean;
  joinedAt: number;
}

export interface VideoState {
  isPlaying: boolean;
  currentTime: number;
  fileName: string;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  senderName: string;
  timestamp: number;
  xOffset: number; // percentage from left (20-80%)
}

export interface SubtitleCue {
  id: number;
  startTime: number; // in seconds
  endTime: number;   // in seconds
  text: string;
}

export type VideoSourceType = 'none' | 'local' | 'screen' | 'lossless';

export type ResolutionPreset = '1080p' | '720p' | '480p';
export type FrameRatePreset = 60 | 30 | 24;

export interface QualitySettings {
  resolution: ResolutionPreset;
  frameRate: FrameRatePreset;
  bitrateKbps: number; // e.g. 1500 to 10000, or 0 for unlimited/auto
  hardwareAcceleration: boolean;
}
