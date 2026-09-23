import React from 'react';
import { QualitySettings, ResolutionPreset, FrameRatePreset } from '../types';
import { Zap, Film, Smartphone, X, Gauge } from 'lucide-react';

interface QualitySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: QualitySettings;
  onUpdate: (newSettings: QualitySettings) => void;
  isHost: boolean;
}

export const QualitySettingsModal: React.FC<QualitySettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdate,
  isHost,
}) => {
  if (!isOpen) return null;

  const presets = [
    {
      id: 'cinema',
      name: 'Cinema 1080p 🌟',
      desc: 'Crystal-clear sharp HD',
      icon: Film,
      resolution: '1080p' as ResolutionPreset,
      frameRate: 30 as FrameRatePreset,
      bitrateKbps: 4500,
    },
    {
      id: 'fast',
      name: 'Smooth 720p ⚡',
      desc: 'Clean & light bandwidth',
      icon: Zap,
      resolution: '720p' as ResolutionPreset,
      frameRate: 30 as FrameRatePreset,
      bitrateKbps: 2500,
    },
    {
      id: 'saver',
      name: 'Mobile Saver 📱',
      desc: 'Lowest data usage',
      icon: Smartphone,
      resolution: '480p' as ResolutionPreset,
      frameRate: 24 as FrameRatePreset,
      bitrateKbps: 1000,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-cinema-900 border border-cinema-800 rounded-2xl w-full max-w-md p-6 shadow-2xl shadow-black/80">
        <div className="flex items-center justify-between pb-4 border-b border-cinema-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-gold-500/10 text-gold-400">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-cinema-100 text-lg">Stream Quality & Performance</h3>
              <p className="text-xs text-cinema-400">Fine-tune resolution, framerate, and bitrate</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-cinema-400 hover:text-cinema-100 hover:bg-cinema-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!isHost && (
          <div className="my-3 px-3 py-2 rounded-lg bg-cinema-850 border border-cinema-800 text-xs text-cinema-400">
            ℹ️ As a viewer, quality is synchronized with the host's transmission settings.
          </div>
        )}

        {/* Quick Presets */}
        <div className="mt-4">
          <label className="text-xs font-medium text-cinema-400 uppercase tracking-wider">Quick Presets</label>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {presets.map((p) => {
              const Icon = p.icon;
              const isSelected =
                settings.resolution === p.resolution &&
                settings.frameRate === p.frameRate &&
                settings.bitrateKbps === p.bitrateKbps;

              return (
                <button
                  key={p.id}
                  disabled={!isHost}
                  onClick={() =>
                    onUpdate({
                      ...settings,
                      resolution: p.resolution,
                      frameRate: p.frameRate,
                      bitrateKbps: p.bitrateKbps,
                    })
                  }
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                    isSelected
                      ? 'border-gold-500 bg-gold-500/10 text-gold-400 ring-1 ring-gold-500/50'
                      : 'border-cinema-800 bg-cinema-850 hover:border-cinema-700 text-cinema-400 hover:text-cinema-100'
                  } ${!isHost ? 'opacity-60 cursor-not-allowed' : 'active:scale-[0.98]'}`}
                >
                  <Icon className={`w-4 h-4 mb-2 ${isSelected ? 'text-gold-400' : 'text-cinema-400'}`} />
                  <div>
                    <div className="text-xs font-semibold text-cinema-100">{p.name}</div>
                    <div className="text-[10px] text-cinema-400 mt-0.5">{p.bitrateKbps / 1000} Mbps</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Fine-Tuning */}
        <div className="mt-6 space-y-4">
          {/* Resolution */}
          <div>
            <div className="flex justify-between items-center text-xs font-medium text-cinema-400 mb-2">
              <span>Target Resolution</span>
              <span className="text-cinema-100 font-mono">{settings.resolution}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['1080p', '720p', '480p'] as ResolutionPreset[]).map((res) => (
                <button
                  key={res}
                  disabled={!isHost}
                  onClick={() => onUpdate({ ...settings, resolution: res })}
                  className={`py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${
                    settings.resolution === res
                      ? 'border-gold-500 bg-gold-500/10 text-gold-400'
                      : 'border-cinema-800 bg-cinema-850 text-cinema-400 hover:text-cinema-100'
                  } ${!isHost ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {res}
                </button>
              ))}
            </div>
          </div>

          {/* Framerate */}
          <div>
            <div className="flex justify-between items-center text-xs font-medium text-cinema-400 mb-2">
              <span>Framerate (FPS)</span>
              <span className="text-cinema-100 font-mono">{settings.frameRate} FPS</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([60, 30, 24] as FrameRatePreset[]).map((fps) => (
                <button
                  key={fps}
                  disabled={!isHost}
                  onClick={() => onUpdate({ ...settings, frameRate: fps })}
                  className={`py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${
                    settings.frameRate === fps
                      ? 'border-gold-500 bg-gold-500/10 text-gold-400'
                      : 'border-cinema-800 bg-cinema-850 text-cinema-400 hover:text-cinema-100'
                  } ${!isHost ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {fps} FPS
                </button>
              ))}
            </div>
          </div>

          {/* Bitrate Slider */}
          <div>
            <div className="flex justify-between items-center text-xs font-medium text-cinema-400 mb-2">
              <span>Max Stream Bitrate</span>
              <span className="text-gold-400 font-mono font-medium">
                {(settings.bitrateKbps / 1000).toFixed(1)} Mbps
              </span>
            </div>
            <input
              type="range"
              min="500"
              max="8000"
              step="250"
              disabled={!isHost}
              value={settings.bitrateKbps}
              onChange={(e) => onUpdate({ ...settings, bitrateKbps: Number(e.target.value) })}
              className={`w-full accent-gold-500 ${!isHost ? 'opacity-60 cursor-not-allowed' : ''}`}
            />
            <div className="flex justify-between text-[10px] text-cinema-600 mt-1">
              <span>0.5 Mbps (Saver)</span>
              <span>4.5 Mbps (HD Default)</span>
              <span>8.0 Mbps (Ultra HD)</span>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-cinema-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-gold-500 hover:bg-gold-600 active:scale-[0.98] text-cinema-950 font-semibold text-xs transition-transform"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
