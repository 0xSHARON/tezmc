import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Key,
  Radio,
  ShieldCheck,
  AlertCircle,
  Play,
  Square,
  Plus,
  Trash2,
  CheckCircle2,
  ExternalLink,
  Layers,
  Cpu,
  Power,
  RefreshCw,
  Globe
} from 'lucide-react';

interface Destination {
  id: string;
  name: string;
  platform: 'youtube' | 'twitch' | 'kick' | 'tiktok' | 'facebook' | 'custom';
  rtmpUrl: string;
  hasKey: boolean;
  enabled: boolean;
  status: string;
}

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
  const [resolution, setResolution] = useState('1280x720');
  const [fps, setFps] = useState('30');
  const [bitrate, setBitrate] = useState('2500k');

  // Multi-stream state
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [presets, setPresets] = useState<Record<string, { name: string; rtmpUrl: string }>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  // Form state for adding destination
  const [newPlatform, setNewPlatform] = useState<string>('twitch');
  const [newName, setNewName] = useState<string>('Twitch Main Channel');
  const [newRtmpUrl, setNewRtmpUrl] = useState<string>('rtmp://live.twitch.tv/app');
  const [newStreamKey, setNewStreamKey] = useState<string>('');

  // Editing destination stream key
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [savedSuccess, setSavedSuccess] = useState<Record<string, boolean>>({});

  const getAuthHeader = () => {
    const token = localStorage.getItem('tezmc_auth_token') || '';
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    };
  };

  const fetchDestinations = async () => {
    try {
      const res = await fetch('/api/v1/stream/destinations');
      if (res.ok) {
        const data = await res.json();
        setDestinations(data.destinations || []);
      }
    } catch (e) {
      console.error('Failed to fetch destinations', e);
    }
  };

  const fetchPresets = async () => {
    try {
      const res = await fetch('/api/v1/stream/presets');
      if (res.ok) {
        const data = await res.json();
        setPresets(data.presets || {});
      }
    } catch (e) {
      console.error('Failed to fetch presets', e);
    }
  };

  useEffect(() => {
    fetchDestinations();
    fetchPresets();
  }, []);

  const handlePlatformChange = (p: string) => {
    setNewPlatform(p);
    const preset = presets[p];
    if (preset) {
      setNewName(preset.name);
      setNewRtmpUrl(preset.rtmpUrl);
    } else {
      setNewName('Custom Stream Target');
      setNewRtmpUrl('');
    }
  };

  const handleAddDestination = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRtmpUrl.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/v1/stream/destinations', {
        method: 'POST',
        headers: getAuthHeader(),
        body: JSON.stringify({
          name: newName,
          platform: newPlatform,
          rtmpUrl: newRtmpUrl,
          streamKey: newStreamKey || undefined,
          enabled: true
        })
      });

      if (res.ok) {
        setShowAddModal(false);
        setNewStreamKey('');
        await fetchDestinations();
      }
    } catch (e) {
      console.error('Error adding destination', e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id: string, currentEnabled: boolean) => {
    try {
      const res = await fetch(`/api/v1/stream/destinations/${id}`, {
        method: 'PATCH',
        headers: getAuthHeader(),
        body: JSON.stringify({ enabled: !currentEnabled })
      });
      if (res.ok) {
        setDestinations((prev) =>
          prev.map((d) => (d.id === id ? { ...d, enabled: !currentEnabled } : d))
        );
      }
    } catch (e) {
      console.error('Failed to toggle destination', e);
    }
  };

  const handleUpdateKey = async (id: string) => {
    const key = keyInputs[id];
    if (!key) return;

    try {
      const res = await fetch(`/api/v1/stream/destinations/${id}`, {
        method: 'PATCH',
        headers: getAuthHeader(),
        body: JSON.stringify({ streamKey: key })
      });
      if (res.ok) {
        setSavedSuccess((prev) => ({ ...prev, [id]: true }));
        setKeyInputs((prev) => ({ ...prev, [id]: '' }));
        setTimeout(() => {
          setSavedSuccess((prev) => ({ ...prev, [id]: false }));
        }, 3000);
        await fetchDestinations();
      }
    } catch (e) {
      console.error('Failed to update key', e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this destination?')) return;
    try {
      const res = await fetch(`/api/v1/stream/destinations/${id}`, {
        method: 'DELETE',
        headers: getAuthHeader()
      });
      if (res.ok) {
        setDestinations((prev) => prev.filter((d) => d.id !== id));
      }
    } catch (e) {
      console.error('Failed to delete destination', e);
    }
  };

  const handleStart = async () => {
    const [width, height] = resolution.split('x').map(Number);
    const activeDests = destinations.filter((d) => d.enabled);

    await onStartStream({
      provider,
      rtmpUrl: activeDests[0]?.rtmpUrl || 'rtmp://a.rtmp.youtube.com/live2',
      width,
      height,
      fps: Number(fps),
      videoBitrate: bitrate,
      audioBitrate: '128k',
      overlayEnabled: true,
      destinations: activeDests
    });
  };

  const getPlatformBadge = (platform: string) => {
    switch (platform) {
      case 'youtube':
        return <span className="px-2 py-0.5 text-[10px] font-bold bg-red-950 text-red-400 border border-red-800 uppercase">YouTube Live</span>;
      case 'twitch':
        return <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-950 text-purple-400 border border-purple-800 uppercase">Twitch</span>;
      case 'kick':
        return <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 uppercase">Kick Gaming</span>;
      case 'tiktok':
        return <span className="px-2 py-0.5 text-[10px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800 uppercase">TikTok Live</span>;
      case 'facebook':
        return <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-950 text-blue-400 border border-blue-800 uppercase">Facebook Live</span>;
      default:
        return <span className="px-2 py-0.5 text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700 uppercase">Custom RTMP</span>;
    }
  };

  const activeCount = destinations.filter((d) => d.enabled).length;

  return (
    <div className="space-y-6 font-mono text-white">
      {/* Top Banner: Master Live Status & Controls */}
      <div className="bg-black border-2 border-zinc-800 p-6 shadow-[4px_4px_0px_0px_#ffffff]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b-2 border-zinc-800">
          <div>
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 bg-emerald-400 animate-pulse border border-black inline-block"></span>
              <h2 className="text-lg font-black tracking-widest uppercase">BROADCAST ENCODER & MULTI-STREAM</h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Simultaneously stream to YouTube, Twitch, Kick, TikTok, & Facebook with 0% extra CPU overhead via FFmpeg native tee muxer.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 bg-zinc-950 border border-zinc-800 text-xs">
              <span className="text-zinc-500 mr-2">ENCODER STATUS:</span>
              <span className={`font-bold ${
                streamStatus === 'LIVE_CONFIRMED'
                  ? 'text-emerald-400'
                  : streamStatus === 'ENCODER_RUNNING'
                  ? 'text-sky-400'
                  : 'text-zinc-400'
              }`}>
                [{streamStatus}]
              </span>
            </div>

            <button
              onClick={handleStart}
              disabled={streamStatus === 'LIVE_CONFIRMED' || streamStatus === 'ENCODER_RUNNING'}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-black border-2 border-white shadow-[2px_2px_0px_0px_#ffffff] text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-black" />
              START ALL TARGETS ({activeCount})
            </button>

            <button
              onClick={onStopStream}
              disabled={streamStatus === 'INACTIVE'}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-black border-2 border-white shadow-[2px_2px_0px_0px_#ffffff] text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
            >
              <Square className="w-4 h-4 fill-black" />
              STOP STREAM
            </button>
          </div>
        </div>

        {/* Live Metrics Grid */}
        {streamMetrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-2">
            <div className="p-3 bg-zinc-950 border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase block">STREAM FRAMERATE</span>
              <span className="text-base font-black text-emerald-400">{streamMetrics.fps || 0} FPS</span>
            </div>
            <div className="p-3 bg-zinc-950 border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase block">OUTGOING BITRATE</span>
              <span className="text-base font-black text-sky-400">{streamMetrics.bitrateKbps || 0} kbps</span>
            </div>
            <div className="p-3 bg-zinc-950 border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase block">ENCODER SPEED</span>
              <span className="text-base font-black text-amber-400">{streamMetrics.speed || 0}x</span>
            </div>
            <div className="p-3 bg-zinc-950 border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase block">FRAMES PROCESSED</span>
              <span className="text-base font-black text-white">{streamMetrics.totalFrames || 0}</span>
            </div>
          </div>
        )}
      </div>

      {/* Multi-Stream Manager Hub */}
      <div className="bg-black border-2 border-zinc-800 p-6 shadow-[4px_4px_0px_0px_#ffffff]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-black tracking-widest uppercase">STREAM DESTINATIONS & RESTREAMING</h3>
              <span className="px-2 py-0.5 text-[10px] bg-emerald-500 text-black font-bold border border-black">
                {activeCount} / {destinations.length} ENABLED
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Add any number of RTMP channels. FFmpeg encodes the video only once, then multiplexes the output across all active endpoints without increasing CPU load.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchDestinations}
              className="p-2 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white text-xs cursor-pointer"
              title="Refresh Destination Status"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-black border border-white text-xs font-bold uppercase tracking-wider shadow-[2px_2px_0px_0px_#ffffff] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              ADD DESTINATION
            </button>
          </div>
        </div>

        {/* Destination Cards */}
        <div className="space-y-3">
          {destinations.length === 0 ? (
            <div className="p-6 bg-zinc-950 border border-zinc-800 text-center text-xs text-zinc-500">
              No destinations configured. Click "ADD DESTINATION" to start broadcasting to multiple platforms.
            </div>
          ) : (
            destinations.map((dest) => (
              <div
                key={dest.id}
                className={`p-4 border-2 transition-all ${
                  dest.enabled
                    ? 'bg-zinc-950 border-zinc-700 shadow-[2px_2px_0px_0px_#27272a]'
                    : 'bg-[#08080a] border-zinc-900 opacity-60'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left: Destination Platform & Name */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {getPlatformBadge(dest.platform)}
                      <span className="text-sm font-bold text-white tracking-wide">{dest.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 border ${
                        dest.status === 'ONLINE'
                          ? 'border-emerald-600 text-emerald-400 bg-emerald-950/40'
                          : 'border-zinc-800 text-zinc-500 bg-black'
                      }`}>
                        {dest.status}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500 font-mono break-all flex items-center gap-2">
                      <Globe className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                      <span>{dest.rtmpUrl}</span>
                    </div>
                  </div>

                  {/* Right: Key config and action controls */}
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Key update inline input */}
                    <div className="flex items-center gap-1.5">
                      <input
                        type="password"
                        placeholder={dest.hasKey ? '•••••••• (Stored)' : 'Enter Stream Key'}
                        value={keyInputs[dest.id] || ''}
                        onChange={(e) =>
                          setKeyInputs((prev) => ({ ...prev, [dest.id]: e.target.value }))
                        }
                        className="bg-black border border-zinc-800 px-2.5 py-1 text-xs text-amber-300 w-44 focus:outline-none focus:border-amber-400 font-mono"
                      />
                      <button
                        onClick={() => handleUpdateKey(dest.id)}
                        disabled={!keyInputs[dest.id]}
                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-bold text-white border border-zinc-600 cursor-pointer"
                        title="Save new stream key"
                      >
                        {savedSuccess[dest.id] ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          'SAVE'
                        )}
                      </button>
                    </div>

                    {/* Enable / Disable toggle */}
                    <button
                      onClick={() => handleToggle(dest.id, dest.enabled)}
                      className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold border cursor-pointer uppercase ${
                        dest.enabled
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500'
                          : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'
                      }`}
                    >
                      <Power className="w-3 h-3" />
                      {dest.enabled ? 'ENABLED' : 'MUTED'}
                    </button>

                    {/* Delete button (allow delete for non-primary) */}
                    <button
                      onClick={() => handleDelete(dest.id)}
                      className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-950/40 border border-transparent hover:border-red-900 transition-colors cursor-pointer"
                      title="Remove Destination"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* FFmpeg Tee Muxer Architecture Note */}
        <div className="mt-4 p-3 bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>
              <strong>Zero-Load Tee Engine:</strong> Output stream uses FFmpeg <code className="text-emerald-400 font-bold">-f tee</code> with <code className="text-zinc-300 font-bold">[f=flv:onfail=ignore]</code>. If any platform drops connection, the other broadcasts remain uninterrupted.
            </span>
          </div>
          <span className="text-[10px] text-emerald-400 font-bold border border-emerald-800 px-2 py-0.5">
            FAULT ISOLATED
          </span>
        </div>
      </div>

      {/* Encoder Hardware & Video Settings */}
      <div className="bg-black border-2 border-zinc-800 p-6 shadow-[4px_4px_0px_0px_#ffffff]">
        <h3 className="text-sm font-black tracking-widest uppercase mb-1">VIDEO RENDER & HARDWARE ENCODER</h3>
        <p className="text-xs text-zinc-400 mb-6">
          Global video settings applied to all outgoing multi-stream targets simultaneously.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-1">CANVAS RESOLUTION</label>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
            >
              <option value="1280x720">720p HD (1280x720) — Recommended for VPS</option>
              <option value="1920x1080">1080p Full HD (1920x1080)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-1">FRAME RATE</label>
            <select
              value={fps}
              onChange={(e) => setFps(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
            >
              <option value="30">30 FPS (Constant Framerate)</option>
              <option value="60">60 FPS (High Motion)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-1">VIDEO BITRATE</label>
            <select
              value={bitrate}
              onChange={(e) => setBitrate(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
            >
              <option value="2500k">2500 kbps (Standard 720p)</option>
              <option value="4500k">4500 kbps (High Quality 1080p)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Add Destination Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-black border-2 border-zinc-700 p-6 w-full max-w-lg shadow-[8px_8px_0px_0px_#ffffff] font-mono">
            <h3 className="text-base font-black uppercase tracking-wider mb-2">ADD MULTI-STREAM TARGET</h3>
            <p className="text-xs text-zinc-400 mb-4">
              Select a streaming platform preset or specify a custom RTMP/RTMPS server ingest target.
            </p>

            <form onSubmit={handleAddDestination} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1">PLATFORM PRESET</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'youtube', label: 'YouTube' },
                    { id: 'twitch', label: 'Twitch' },
                    { id: 'kick', label: 'Kick' },
                    { id: 'tiktok', label: 'TikTok' },
                    { id: 'facebook', label: 'Facebook' },
                    { id: 'custom', label: 'Custom' }
                  ].map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => handlePlatformChange(p.id)}
                      className={`py-2 text-xs font-bold uppercase border cursor-pointer ${
                        newPlatform === p.id
                          ? 'bg-emerald-500 text-black border-white'
                          : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1">TARGET LABEL / NAME</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 p-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1">RTMP SERVER URL</label>
                <input
                  type="text"
                  value={newRtmpUrl}
                  onChange={(e) => setNewRtmpUrl(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 p-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1 flex items-center justify-between">
                  <span>STREAM KEY (WRITE-ONLY)</span>
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-normal">
                    <ShieldCheck className="w-3 h-3" /> Redacted in logs & API
                  </span>
                </label>
                <input
                  type="password"
                  placeholder="Paste stream key here..."
                  value={newStreamKey}
                  onChange={(e) => setNewStreamKey(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 p-2 text-xs text-amber-300 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div className="pt-4 border-t border-zinc-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-xs font-bold text-zinc-300 border border-zinc-700 cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black uppercase tracking-wider border border-white shadow-[2px_2px_0px_0px_#ffffff] cursor-pointer"
                >
                  {loading ? 'ADDING...' : 'SAVE TARGET'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
