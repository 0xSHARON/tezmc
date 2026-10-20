import React from 'react';
import {
  Activity,
  Cpu,
  HardDrive,
  Radio,
  Gamepad2,
  Compass,
  AlertTriangle,
  Clock,
  Zap,
  TrendingUp
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface OverviewProps {
  sessionState: string;
  streamStatus: string;
  gameProgress: any;
  systemMetrics: any;
  streamMetrics: any;
  logs: any[];
}

export const Overview: React.FC<OverviewProps> = ({
  sessionState,
  streamStatus,
  gameProgress,
  systemMetrics,
  streamMetrics,
  logs
}) => {
  const chartData = [
    { time: '10s', cpu: Math.max(10, (systemMetrics?.cpuUsagePercent || 20) - 5), bitrate: 2450 },
    { time: '8s', cpu: Math.max(12, (systemMetrics?.cpuUsagePercent || 20) + 2), bitrate: 2480 },
    { time: '6s', cpu: Math.max(15, (systemMetrics?.cpuUsagePercent || 20) - 3), bitrate: 2510 },
    { time: '4s', cpu: Math.max(14, (systemMetrics?.cpuUsagePercent || 20) + 4), bitrate: 2490 },
    { time: '2s', cpu: systemMetrics?.cpuUsagePercent || 20, bitrate: streamMetrics?.bitrateKbps || 2500 },
    { time: 'now', cpu: systemMetrics?.cpuUsagePercent || 20, bitrate: streamMetrics?.bitrateKbps || 2500 }
  ];

  const getStatusBadge = (state: string) => {
    switch (state) {
      case 'RUNNING':
      case 'LIVE_CONFIRMED':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'VALIDATING':
      case 'STARTING_GAME':
      case 'ENCODER_RUNNING':
      case 'INGEST_CONNECTED':
        return 'bg-sky-500/20 text-sky-400 border-sky-500/30 animate-pulse';
      case 'RECOVERING':
      case 'RECONNECTING':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse';
      case 'FAILED':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
      default:
        return 'bg-slate-700/30 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Session Status */}
        <div className="bg-surface border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-sm font-medium">Session State</span>
            <Activity className="w-5 h-5 text-sky-400" />
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${getStatusBadge(sessionState)}`}>
              {sessionState}
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-2 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> Uptime: {gameProgress?.uptimeSeconds || 0}s
          </div>
        </div>

        {/* Stream Health */}
        <div className="bg-surface border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-sm font-medium">Stream Ingest</span>
            <Radio className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${getStatusBadge(streamStatus)}`}>
              {streamStatus}
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-2 flex items-center justify-between">
            <span>FPS: {streamMetrics?.fps || 0}</span>
            <span>Bitrate: {streamMetrics?.bitrateKbps || 0} kbps</span>
          </div>
        </div>

        {/* Current Objective */}
        <div className="bg-surface border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-sm font-medium">Game Objective</span>
            <Compass className="w-5 h-5 text-amber-400" />
          </div>
          <div className="text-sm font-semibold text-white truncate">
            {gameProgress?.currentObjective || 'Autonomous Survey'}
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-3 overflow-hidden">
            <div
              className="bg-amber-400 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${gameProgress?.objectiveProgressPercent || 35}%` }}
            />
          </div>
        </div>

        {/* System Load */}
        <div className="bg-surface border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-sm font-medium">Host Health</span>
            <Cpu className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="text-lg font-bold text-white">
            {systemMetrics?.cpuUsagePercent || 0}% <span className="text-xs text-slate-400 font-normal">CPU</span>
          </div>
          <div className="text-xs text-slate-400 mt-1 flex items-center justify-between">
            <span>RAM: {systemMetrics?.memoryUsagePercent || 0}%</span>
            <span>Free: {systemMetrics?.freeMemoryMb || 0} MB</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Telemetry & Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Real-time Bot Telemetry Card */}
        <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Gamepad2 className="w-5 h-5 text-sky-400" />
            <h3 className="font-semibold text-white">Autonomous Agent Telemetry</h3>
          </div>

          <div className="space-y-4">
            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800">
              <span className="text-xs text-slate-400">Current Coordinates</span>
              <div className="font-mono text-sm text-sky-300 font-medium mt-0.5">
                X: {gameProgress?.details?.position?.x ?? 0} &nbsp;
                Y: {gameProgress?.details?.position?.y ?? 64} &nbsp;
                Z: {gameProgress?.details?.position?.z ?? 0}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-400">Blocks Traveled</span>
                <div className="text-lg font-bold text-emerald-400">
                  {gameProgress?.explorationStats?.blocksTraveled || 0} m
                </div>
              </div>
              <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-400">Waypoints Cleared</span>
                <div className="text-lg font-bold text-amber-400">
                  {gameProgress?.explorationStats?.discoveredPointsOfInterest || 0}
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800">
              <span className="text-xs text-slate-400">Health & Vitals</span>
              <div className="flex items-center gap-4 mt-1">
                <div className="flex items-center gap-1">
                  <span className="text-rose-400 font-bold">♥</span>
                  <span className="text-sm font-semibold">{gameProgress?.details?.health ?? 20} / 20</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-amber-500 font-bold">🍗</span>
                  <span className="text-sm font-semibold">{gameProgress?.details?.food ?? 20} / 20</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Metrics Graph */}
        <div className="lg:col-span-2 bg-[#0f111a] border border-border rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <h3 className="font-semibold text-white">Live Bitrate & Encoder Throughput</h3>
            </div>
            <span className="text-xs font-mono text-slate-400">RTMP Target: 2500 kbps</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="bitrateGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} domain={[2000, 3000]} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#090a0f', borderColor: '#1e2235', borderRadius: '8px' }}
                />
                <Area type="monotone" dataKey="bitrate" stroke="#10b981" fillOpacity={1} fill="url(#bitrateGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Terminal / Real-time Logs Card */}
      <div className="bg-[#0f111a] border border-border rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-white text-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            Real-time TEZMC Autonomous Event Log (Redacted)
          </h3>
          <span className="text-xs text-slate-500 font-mono">Pino Structured Stream</span>
        </div>
        <div className="bg-slate-950 rounded-lg p-3 font-mono text-xs text-slate-300 max-h-48 overflow-y-auto space-y-1 border border-slate-800">
          {logs.length === 0 ? (
            <div className="text-slate-500">System listening for events...</div>
          ) : (
            logs.slice(-15).map((l: any, idx: number) => (
              <div key={idx} className="flex gap-2 items-start">
                <span className="text-slate-500 select-none">[{new Date(l.timestamp).toLocaleTimeString()}]</span>
                <span className={l.level === 'error' ? 'text-rose-400' : l.level === 'warn' ? 'text-amber-400' : 'text-sky-300'}>
                  [{l.source?.toUpperCase() || 'SYS'}]
                </span>
                <span className="break-all">{l.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
