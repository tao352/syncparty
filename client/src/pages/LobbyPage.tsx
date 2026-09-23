import React, { useState, useEffect } from 'react';
import {
  Film,
  Sparkles,
  Lock,
  ArrowRight,
  ShieldCheck,
  Zap,
  Users,
} from 'lucide-react';

interface LobbyPageProps {
  initialRoomId?: string;
  onCreateRoom: (roomId: string, name: string, password?: string) => void;
  onJoinRoom: (roomId: string, name: string, password?: string) => void;
  error?: string | null;
  isLoading?: boolean;
}

export const LobbyPage: React.FC<LobbyPageProps> = ({
  initialRoomId = '',
  onCreateRoom,
  onJoinRoom,
  error,
  isLoading = false,
}) => {
  const [tab, setTab] = useState<'create' | 'join'>(initialRoomId ? 'join' : 'create');
  const [roomId, setRoomId] = useState(initialRoomId);
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (initialRoomId) {
      setRoomId(initialRoomId);
      setTab('join');
    }
  }, [initialRoomId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim()) return;

    if (tab === 'create') {
      onCreateRoom(roomId.trim(), userName.trim(), password.trim() || undefined);
    } else {
      if (!roomId.trim()) return;
      onJoinRoom(roomId.trim(), userName.trim(), password.trim() || undefined);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col justify-between bg-cinema-950 text-cinema-100 p-6 md:p-12 relative overflow-hidden">
      {/* Subtle background ambient depth */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-gold-500/5 blur-[120px] rounded-full pointer-events-none"></div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gold-500 flex items-center justify-center text-cinema-950 font-black shadow-lg shadow-gold-500/20">
            <Film className="w-5 h-5 fill-current" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
              <span>SyncParty</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cinema-850 text-gold-400 border border-gold-500/20">
                P2P Cinema
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium text-cinema-400">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Private & Encrypted</span>
          </span>
        </div>
      </header>

      {/* Main Hero & Form */}
      <main className="relative z-10 my-auto py-8 flex flex-col items-center">
        {/* Title */}
        <div className="text-center max-w-xl mx-auto mb-8">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-cinema-100 mb-3">
            Watch any video together.{' '}
            <span className="text-gold-400 font-serif italic font-normal">Ultra-smooth.</span>
          </h2>
          <p className="text-sm text-cinema-400 leading-relaxed">
            Drag & drop local files from your PC or share your screen. WebRTC direct streaming with custom bitrate and real-time playback synchronization.
          </p>
        </div>

        {/* Card Box */}
        <div className="w-full max-w-md bg-cinema-900 border border-cinema-800 rounded-3xl p-6 md:p-8 shadow-2xl shadow-black/80">
          {/* Tabs */}
          <div className="grid grid-cols-2 p-1 bg-cinema-850 rounded-xl mb-6 border border-cinema-800">
            <button
              type="button"
              onClick={() => setTab('create')}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                tab === 'create'
                  ? 'bg-cinema-800 text-gold-400 shadow-sm'
                  : 'text-cinema-400 hover:text-cinema-100'
              }`}
            >
              Create New Party
            </button>
            <button
              type="button"
              onClick={() => setTab('join')}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                tab === 'join'
                  ? 'bg-cinema-800 text-gold-400 shadow-sm'
                  : 'text-cinema-400 hover:text-cinema-100'
              }`}
            >
              Join with Code
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-left animate-fade-in">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-medium text-cinema-400 mb-1.5">
                Your Nickname
              </label>
              <input
                type="text"
                required
                maxLength={20}
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="e.g. Alex"
                className="w-full bg-cinema-850 border border-cinema-800 rounded-xl px-3.5 py-2.5 text-xs text-cinema-100 placeholder-cinema-600 focus:outline-none focus:border-gold-500/60 transition-colors"
              />
            </div>

            {tab === 'join' ? (
              <div>
                <label className="block text-xs font-medium text-cinema-400 mb-1.5">
                  Room Code
                </label>
                <input
                  type="text"
                  required
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  placeholder="e.g. cinema-7x8"
                  className="w-full bg-cinema-850 border border-cinema-800 rounded-xl px-3.5 py-2.5 text-xs text-cinema-100 placeholder-cinema-600 font-mono focus:outline-none focus:border-gold-500/60 transition-colors uppercase"
                />
              </div>
            ) : (
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-medium text-cinema-400">
                    Custom Room ID <span className="text-cinema-600">(Optional)</span>
                  </label>
                </div>
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  placeholder="Leave empty for auto-generated code"
                  className="w-full bg-cinema-850 border border-cinema-800 rounded-xl px-3.5 py-2.5 text-xs text-cinema-100 placeholder-cinema-600 font-mono focus:outline-none focus:border-gold-500/60 transition-colors"
                />
              </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-medium text-cinema-400 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-cinema-500" />
                  <span>Room Passcode {tab === 'create' && <span className="text-cinema-600">(Optional)</span>}</span>
                </label>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tab === 'create' ? 'Set private room passcode' : 'Enter passcode if required'}
                className="w-full bg-cinema-850 border border-cinema-800 rounded-xl px-3.5 py-2.5 text-xs text-cinema-100 placeholder-cinema-600 focus:outline-none focus:border-gold-500/60 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !userName.trim() || (tab === 'join' && !roomId.trim())}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-gold-500 hover:bg-gold-600 active:scale-[0.98] disabled:opacity-50 disabled:hover:bg-gold-500 text-cinema-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-gold-500/20 transition-all"
            >
              {isLoading ? (
                <span>Connecting...</span>
              ) : (
                <>
                  <span>{tab === 'create' ? 'Launch Private Room' : 'Enter Party'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Features Highlights */}
          <div className="mt-6 pt-5 border-t border-cinema-800/80 grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-lg bg-cinema-850/50">
              <Zap className="w-3.5 h-3.5 text-gold-400 mx-auto mb-1" />
              <div className="text-[10px] font-semibold text-cinema-100">Zero Upload</div>
              <div className="text-[9px] text-cinema-600">Local P2P Stream</div>
            </div>
            <div className="p-2 rounded-lg bg-cinema-850/50">
              <Sparkles className="w-3.5 h-3.5 text-gold-400 mx-auto mb-1" />
              <div className="text-[10px] font-semibold text-cinema-100">60 FPS Crisp</div>
              <div className="text-[9px] text-cinema-600">Fine Bitrate Dial</div>
            </div>
            <div className="p-2 rounded-lg bg-cinema-850/50">
              <Users className="w-3.5 h-3.5 text-gold-400 mx-auto mb-1" />
              <div className="text-[10px] font-semibold text-cinema-100">Voice & Chat</div>
              <div className="text-[9px] text-cinema-600">Audio Ducking</div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center text-xs text-cinema-600">
        SyncParty • Open Source Private Cinema Hangout • Inspired by Kosmi.io
      </footer>
    </div>
  );
};
