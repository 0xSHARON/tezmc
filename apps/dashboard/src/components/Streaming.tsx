import React, { useState } from 'react';
import { Sliders, Key, Radio, ShieldCheck, AlertCircle, Play, Square } from 'lucide-react';

interface StreamingProps {
  streamStatus: string;
  streamMetrics: any;
  onStartStream: (config: any) => Promise<void>;
  onStopStream: () => Promise<void>;
}

export const Streaming: React.FC<StreamingProps> = ({
  streamStatus,
  streamMetrics,
  onStartStream,
  onStopStream
}) => {
  const [provider, setProvider] = useState('ffmpeg');
  const [rtmpUrl, setRtmpUrl] = useState('rtmp://a.rtmp.youtube.com/live2');
  const [streamKey, setStreamKey] = useState('');
  const [streamKeySaved, setStreamKeySaved] = useState(false);
  const [resolution, setResolution] = useState('1280x720');
  const [fps, setFps] = useState('30');
  const [bitrate, setBitrate] = useState('2500k');

  const handleStart = async () => {
    const [width, height] = resolution.split('x').map(Number);
    await onStartStream({
      provider,
      rtmpUrl,
      streamKey: streamKey || undefined,
      width,
      height,
      fps: Number(fps),
      videoBitrate: bitrate,
      audioBitrate: '128k',
      overlayEnabled: true
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-bold text-white mb-1">Live Broadcast & Encoder Settings</h2>
        <p className="text-sm text-slate-400 mb-6">
          Configure video rendering resolution, YouTube ingest targets, and write-only stream credentials.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Target Ingest */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">RTMP Ingest Server</label>
              <input
                type="text"
                value={rtmpUrl}
                onChange={(e) => setRtmpUrl(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500 font-mono"
              />
              <span className="text-[11px] text-slate-500">YouTube Primary: rtmp://a.rtmp.youtube.com/live2 or local test target</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-amber-400" />
                YouTube Live Stream Key (Write-Only)
              </label>
              <input
                type="password"
                placeholder="••••••••••••••••••••••••••••••••"
                value={streamKey}
                onChange={(e) => {
                  setStreamKey(e.target.value);
                  setStreamKeySaved(true);
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-amber-300 focus:outline-none focus:border-sky-500 font-mono"
              />
              <span className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Never returned through API or logs. Redacted automatically.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Encoder Engine</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
              >
                <option value="ffmpeg">FFmpeg (Native Headless Subprocess)</option>
                <option value="obs">OBS Studio (WebSocket Provider)</option>
              </select>
            </div>
          </div>

          {/* Video Parameters */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Canvas Resolution</label>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
              >
                <option value="1280x720">720p HD (1280x720) — Recommended for VPS</option>
                <option value="1920x1080">1080p Full HD (1920x1080)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Frame Rate</label>
                <select
                  value={fps}
                  onChange={(e) => setFps(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                >
                  <option value="30">30 FPS</option>
                  <option value="60">60 FPS</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Target Video Bitrate</label>
                <select
                  value={bitrate}
                  onChange={(e) => setBitrate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                >
                  <option value="2500k">2500 kbps (Standard 720p)</option>
                  <option value="4500k">4500 kbps (High 1080p)</option>
                </select>
              </div>
            </div>

            <div className="pt-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1">HTML5 Live Overlay Source</label>
              <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-sky-300 flex items-center justify-between">
                <span>http://localhost:3000/overlay</span>
                <span className="text-emerald-400 font-sans font-semibold">Active</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 pt-6 border-t border-slate-800 flex items-center gap-4">
          <button
            onClick={handleStart}
            disabled={streamStatus === 'LIVE_CONFIRMED' || streamStatus === 'ENCODER_RUNNING'}
            className="flex items-center gap-2 px-6 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            <Play className="w-4 h-4" /> Start Live Encoder
          </button>

          <button
            onClick={onStopStream}
            disabled={streamStatus === 'INACTIVE'}
            className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            <Square className="w-4 h-4" /> Stop Live Stream
          </button>
        </div>
      </div>
    </div>
  );
};
