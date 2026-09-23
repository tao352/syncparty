import React, { useState, useRef, useEffect } from 'react';
import { Participant, ChatMessage } from '../types';
import {
  Users,
  Copy,
  Check,
  Send,
  Mic,
  MicOff,
  Crown,
  Smile,
  Volume2,
} from 'lucide-react';

interface ChatAndHangoutProps {
  roomId: string;
  isHost?: boolean;
  participants: Participant[];
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onSendReaction: (emoji: string) => void;
  isMicMuted: boolean;
  onToggleMic: () => void;
  isAudioDuckingActive?: boolean;
}

const QUICK_EMOJIS = ['❤️', '😂', '🍿', '🔥', '👏', '😱', '🚀', '✨'];

export const ChatAndHangout: React.FC<ChatAndHangoutProps> = ({
  roomId,
  participants,
  messages,
  onSendMessage,
  onSendReaction,
  isMicMuted,
  onToggleMic,
  isAudioDuckingActive,
}) => {
  const [inputText, setInputText] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'people'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCopyLink = () => {
    const fullUrl = `${window.location.origin}?room=${roomId}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  return (
    <div className="flex flex-col h-full bg-cinema-900 border-l border-cinema-800 w-80 shrink-0">
      {/* Room Header & Share Bar */}
      <div className="p-4 border-b border-cinema-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-mono font-semibold text-cinema-400 uppercase tracking-wider">
              Room #{roomId}
            </span>
          </div>

          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cinema-850 hover:bg-cinema-800 border border-cinema-700/60 text-xs font-medium text-cinema-100 transition-colors"
            title="Copy Invite Link"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-cinema-400" />
                <span>Invite</span>
              </>
            )}
          </button>
        </div>

        {/* Voice Bar & Status */}
        <div className="flex items-center justify-between bg-cinema-850 p-2.5 rounded-xl border border-cinema-800">
          <div className="flex items-center gap-2.5">
            <button
              onClick={onToggleMic}
              className={`p-2 rounded-lg transition-all ${
                isMicMuted
                  ? 'bg-cinema-800 text-cinema-400 hover:text-cinema-100'
                  : 'bg-emerald-500 text-cinema-950 font-bold shadow-lg shadow-emerald-500/20'
              }`}
              title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            >
              {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <div className="text-left">
              <div className="text-xs font-medium text-cinema-100">
                {isMicMuted ? 'Mic Off' : 'Voice Live'}
              </div>
              <div className="text-[10px] text-cinema-400">
                {isMicMuted ? 'Click to talk' : 'Push-to-talk'}
              </div>
            </div>
          </div>

          {isAudioDuckingActive && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gold-500/10 border border-gold-500/30 text-[10px] text-gold-400 animate-pulse">
              <Volume2 className="w-3 h-3" />
              <span>Ducking</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs Header */}
      <div className="flex border-b border-cinema-800 text-xs font-medium">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 py-2.5 text-center transition-colors border-b-2 ${
            activeTab === 'chat'
              ? 'border-gold-500 text-gold-400 bg-cinema-850/50'
              : 'border-transparent text-cinema-400 hover:text-cinema-100'
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => setActiveTab('people')}
          className={`flex-1 py-2.5 text-center transition-colors border-b-2 flex items-center justify-center gap-1.5 ${
            activeTab === 'people'
              ? 'border-gold-500 text-gold-400 bg-cinema-850/50'
              : 'border-transparent text-cinema-400 hover:text-cinema-100'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>People ({participants.length})</span>
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {activeTab === 'chat' ? (
          messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-cinema-600">
              <Smile className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-xs">No messages yet.</p>
              <p className="text-[11px] text-cinema-600 mt-1">Say hi to everyone in the party!</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="text-left animate-fade-in">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-cinema-100">
                    {msg.senderName}
                  </span>
                  <span className="text-[10px] text-cinema-600">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="text-xs text-cinema-400 bg-cinema-850 px-3 py-2 rounded-xl rounded-tl-none border border-cinema-800/80 inline-block max-w-full break-words">
                  {msg.text}
                </div>
              </div>
            ))
          )
        ) : (
          <div className="space-y-2">
            {participants.map((p) => (
              <div
                key={p.socketId}
                className="flex items-center justify-between p-2.5 rounded-xl bg-cinema-850 border border-cinema-800"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-cinema-800 flex items-center justify-center font-bold text-xs text-cinema-100">
                    {p.userName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-semibold text-cinema-100 flex items-center gap-1">
                      <span>{p.userName}</span>
                      {p.isHost && (
                        <span title="Host">
                          <Crown className="w-3 h-3 text-gold-400 inline" />
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-cinema-600">
                      {p.audioMuted ? 'Muted' : 'Microphone Active'}
                    </div>
                  </div>
                </div>

                {!p.audioMuted && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                )}
              </div>
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Reactions Bar */}
      <div className="px-4 py-2 border-t border-cinema-800 bg-cinema-900/90 flex items-center justify-between gap-1 overflow-x-auto">
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => onSendReaction(emoji)}
            className="p-1 text-base hover:scale-125 active:scale-95 transition-transform"
            title={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Chat Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-cinema-800 bg-cinema-900 flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Send a message..."
          className="flex-1 bg-cinema-850 border border-cinema-800 rounded-xl px-3 py-2 text-xs text-cinema-100 placeholder-cinema-600 focus:outline-none focus:border-gold-500/50 transition-colors"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="p-2 bg-gold-500 hover:bg-gold-600 disabled:opacity-40 disabled:hover:bg-gold-500 text-cinema-950 rounded-xl transition-all active:scale-[0.98]"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
