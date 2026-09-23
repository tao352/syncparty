import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { Participant, ChatMessage, FloatingReaction, VideoState } from '../types';
import { useWebRTC } from '../hooks/useWebRTC';
import { useSyncEngine } from '../hooks/useSyncEngine';
import { VideoPlayer } from '../components/VideoPlayer';
import { ChatAndHangout } from '../components/ChatAndHangout';
import { QualitySettingsModal } from '../components/QualitySettingsModal';
import {
  Film,
  LogOut,
  Maximize2,
  Minimize2,
  Crown,
} from 'lucide-react';

interface RoomPageProps {
  socket: Socket | null;
  roomId: string;
  isHost: boolean;
  currentUser: { name: string; socketId: string };
  initialParticipants: Participant[];
  initialVideoState?: VideoState;
  onLeaveRoom: () => void;
}

export const RoomPage: React.FC<RoomPageProps> = ({
  socket,
  roomId,
  isHost,
  currentUser,
  initialParticipants,
  onLeaveRoom,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Participants & Chat state
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [isCinemaMode, setIsCinemaMode] = useState<boolean>(false);
  const [isQualityModalOpen, setIsQualityModalOpen] = useState<boolean>(false);
  const [isAudioDuckingActive, setIsAudioDuckingActive] = useState<boolean>(false);

  // WebRTC Hook
  const {
    remoteStream,
    setMediaStream,
    connectionStatus,
    qualitySettings,
    updateQuality,
    isMicMuted,
    toggleMicrophone,
    requestStreamFromHost,
  } = useWebRTC({
    socket,
    roomId,
    isHost,
    onRemoteSpeaking: (speaking) => {
      // Remote speaker talking -> duck the media volume
      setIsAudioDuckingActive(speaking);
    },
  });

  // Sync Engine Hook
  const { emitVideoAction } = useSyncEngine({
    socket,
    isHost,
    videoRef,
    onStateChange: (state) => {
      console.log('[RoomPage] Video state updated:', state);
    },
  });

  // Socket event listeners for Room events
  useEffect(() => {
    if (!socket) return;

    const handleUserJoined = ({
      participant,
      allParticipants,
    }: {
      participant: Participant;
      allParticipants: Participant[];
    }) => {
      setParticipants(allParticipants || ((prev) => [...prev, participant]));
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).substring(2, 9),
          senderId: 'system',
          senderName: 'System',
          text: `${participant.userName} entered the cinema.`,
          timestamp: Date.now(),
        },
      ]);
    };

    const handleUserLeft = ({
      socketId,
      remainingParticipants,
    }: {
      socketId: string;
      remainingParticipants: Participant[];
    }) => {
      const departed = participants.find((p) => p.socketId === socketId);
      if (departed) {
        setMessages((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).substring(2, 9),
            senderId: 'system',
            senderName: 'System',
            text: `${departed.userName} left.`,
            timestamp: Date.now(),
          },
        ]);
      }
      setParticipants(remainingParticipants || ((prev) => prev.filter((p) => p.socketId !== socketId)));
    };

    const handleChatMessage = (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    };

    const handleReceiveReaction = ({
      id,
      emoji,
      senderName,
      timestamp,
    }: {
      id: string;
      emoji: string;
      senderName: string;
      timestamp: number;
    }) => {
      // Random horizontal offset between 20% and 80%
      const xOffset = 20 + Math.random() * 60;
      const newReaction: FloatingReaction = { id, emoji, senderName, timestamp, xOffset };
      setReactions((prev) => [...prev, newReaction]);

      // Remove after 2.6 seconds
      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== id));
      }, 2600);
    };

    const handleVoiceStatus = ({
      socketId,
      isSpeaking,
    }: {
      socketId: string;
      isSpeaking: boolean;
    }) => {
      setParticipants((prev) =>
        prev.map((p) => (p.socketId === socketId ? { ...p, isSpeaking } : p))
      );
    };

    socket.on('user-joined', handleUserJoined);
    socket.on('user-left', handleUserLeft);
    socket.on('chat-message', handleChatMessage);
    socket.on('receive-reaction', handleReceiveReaction);
    socket.on('voice-status', handleVoiceStatus);

    return () => {
      socket.off('user-joined', handleUserJoined);
      socket.off('user-left', handleUserLeft);
      socket.off('chat-message', handleChatMessage);
      socket.off('receive-reaction', handleReceiveReaction);
      socket.off('voice-status', handleVoiceStatus);
    };
  }, [socket, participants]);

  // Send Chat Message
  const handleSendMessage = useCallback(
    (text: string) => {
      if (!socket) return;
      socket.emit('chat-message', { text, senderName: currentUser.name });
    },
    [socket, currentUser]
  );

  // Send Floating Reaction
  const handleSendReaction = useCallback(
    (emoji: string) => {
      if (!socket) return;
      socket.emit('send-reaction', { emoji, senderName: currentUser.name });
    },
    [socket, currentUser]
  );

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-cinema-950 text-cinema-100 overflow-hidden">
      {/* Top Bar */}
      <header className="h-12 border-b border-cinema-800 bg-cinema-900 px-4 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gold-500 flex items-center justify-center text-cinema-950 font-black">
              <Film className="w-3.5 h-3.5 fill-current" />
            </div>
            <span className="font-bold text-sm text-cinema-100">SyncParty</span>
          </div>

          <div className="h-4 w-px bg-cinema-800 mx-1"></div>

          <div className="flex items-center gap-1.5 text-xs text-cinema-400">
            <span>Room:</span>
            <span className="font-mono text-cinema-100 font-semibold uppercase">{roomId}</span>
            {isHost && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-gold-500/10 text-gold-400 text-[10px] font-medium border border-gold-500/20">
                <Crown className="w-3 h-3" /> Host
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Cinema Mode Toggle (Hides chat for full width) */}
          <button
            onClick={() => setIsCinemaMode((prev) => !prev)}
            className={`p-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              isCinemaMode
                ? 'bg-gold-500/10 border-gold-500/30 text-gold-400'
                : 'bg-cinema-850 hover:bg-cinema-800 border-cinema-800 text-cinema-400 hover:text-cinema-100'
            }`}
            title={isCinemaMode ? 'Show Chat & Hangout' : 'Full Width Cinema View'}
          >
            {isCinemaMode ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Exit Cinema</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Cinema Mode</span>
              </>
            )}
          </button>

          {/* Leave Room Button */}
          <button
            onClick={onLeaveRoom}
            className="p-1.5 rounded-lg bg-cinema-850 hover:bg-rose-500/20 hover:text-rose-400 border border-cinema-800 text-xs text-cinema-400 transition-colors flex items-center gap-1.5"
            title="Leave Party"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Leave</span>
          </button>
        </div>
      </header>

      {/* Main View Area: Video on Left, Chat on Right */}
      <div className="flex-1 flex overflow-hidden relative">
        <VideoPlayer
          isHost={isHost}
          remoteStream={remoteStream}
          onStreamReady={setMediaStream}
          onVideoAction={emitVideoAction}
          videoRef={videoRef}
          reactions={reactions}
          onOpenQualitySettings={() => setIsQualityModalOpen(true)}
          isAudioDuckingActive={isAudioDuckingActive}
          connectionStatus={connectionStatus}
          onRequestStream={requestStreamFromHost}
        />

        {/* Chat & Hangout Sidebar (Collapsible in cinema mode) */}
        {!isCinemaMode && (
          <ChatAndHangout
            roomId={roomId}
            isHost={isHost}
            participants={participants}
            messages={messages}
            onSendMessage={handleSendMessage}
            onSendReaction={handleSendReaction}
            isMicMuted={isMicMuted}
            onToggleMic={toggleMicrophone}
            isAudioDuckingActive={isAudioDuckingActive}
          />
        )}
      </div>

      {/* Quality Settings Modal */}
      <QualitySettingsModal
        isOpen={isQualityModalOpen}
        onClose={() => setIsQualityModalOpen(false)}
        settings={qualitySettings}
        onUpdate={updateQuality}
        isHost={isHost}
      />
    </div>
  );
};
