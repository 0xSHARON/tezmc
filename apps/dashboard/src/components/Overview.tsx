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
        return 'bg-emerald-500 text-black border-2 border-black font-black uppercase shadow-[2px_2px_0px_0px_#ffffff]';
      case 'VALIDATING':
      case 'STARTING_GAME':
      case 'ENCODER_RUNNING':
      case 'INGEST_CONNECTED':
        return 'bg-sky-400 text-black border-2 border-black font-black uppercase shadow-[2px_2px_0px_0px_#ffffff] animate-pulse';
      case 'RECOVERING':
      case 'RECONNECTING':
        return 'bg-yellow-400 text-black border-2 border-black font-black uppercase shadow-[2px_2px_0px_0px_#ffffff] animate-pulse';
      case 'FAILED':
        return 'bg-red-500 text-white border-2 border-black font-black uppercase shadow-[2px_2px_0px_0px_#ffffff]';
      default:
        return 'bg-zinc-800 text-zinc-300 border-2 border-zinc-700 font-bold uppercase';
    }
  };

  return (
    <div className="space-y-6 font-mono">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Session Status */}
        <div className="bg-black border-2 border-zinc-800 p-5 shadow-[4px_4px_0px_0px_#18181b] hover:border-zinc-600 transition-all">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs uppercase font-bold tracking-widest text-zinc-300">SESSION_STATE</span>
            <Activity className="w-4 h-4 text-sky-400" />
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`px-2 py-0.5 text-xs tracking-wider ${getStatusBadge(sessionState)}`}>
              [{sessionState}]
            </span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-3 flex items-center gap-1.5 font-bold">
            <Clock className="w-3 h-3 text-zinc-400" /> UPTIME: {gameProgress?.uptimeSeconds || 0}S
          </div>
        </div>

        {/* Stream Health */}
        <div className="bg-black border-2 border-zinc-800 p-5 shadow-[4px_4px_0px_0px_#18181b] hover:border-zinc-600 transition-all">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs uppercase font-bold tracking-widest text-zinc-300">STREAM_INGEST</span>
            <Radio className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`px-2 py-0.5 text-xs tracking-wider ${getStatusBadge(streamStatus)}`}>
              [{streamStatus}]
            </span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-3 flex items-center justify-between font-bold">
            <span>FPS: {streamMetrics?.fps || 0}</span>
            <span>BITRATE: {streamMetrics?.bitrateKbps || 0} KBPS</span>
          </div>
        </div>

        {/* Current Objective */}
        <div className="bg-black border-2 border-zinc-800 p-5 shadow-[4px_4px_0px_0px_#18181b] hover:border-zinc-600 transition-all">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs uppercase font-bold tracking-widest text-zinc-300">OBJECTIVE</span>
            <Compass className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xs font-black text-white truncate uppercase tracking-wider">
            {gameProgress?.currentObjective || 'AUTONOMOUS SURVEY'}
          </div>
          <div className="w-full bg-zinc-950 border border-zinc-800 h-2 mt-3 overflow-hidden">
            <div
              className="bg-amber-400 h-2 transition-all duration-500"
              style={{ width: `${gameProgress?.objectiveProgressPercent || 35}%` }}
            />
          </div>
        </div>

        {/* System Load */}
        <div className="bg-black border-2 border-zinc-800 p-5 shadow-[4px_4px_0px_0px_#18181b] hover:border-zinc-600 transition-all">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs uppercase font-bold tracking-widest text-zinc-300">HOST_TELEMETRY</span>
            <Cpu className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-lg font-black text-white">
            {systemMetrics?.cpuUsagePercent || 0}% <span className="text-xs text-zinc-500 font-bold">CPU</span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-1 flex items-center justify-between font-bold">
            <span>RAM: {systemMetrics?.memoryUsagePercent || 0}%</span>
            <span>FREE: {systemMetrics?.freeMemoryMb || 0} MB</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Telemetry & Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Real-time Bot Telemetry Card */}
        <div className="bg-black border-2 border-zinc-800 p-6 shadow-[5px_5px_0px_0px_#10b981]">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-zinc-800">
            <Gamepad2 className="w-4 h-4 text-emerald-400" />
            <h3 className="font-bold text-white text-xs uppercase tracking-widest">[AGENT_TELEMETRY]</h3>
          </div>

          <div className="space-y-4">
            <div className="p-3 bg-zinc-950 border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">COORDINATES</span>
              <div className="font-mono text-xs text-emerald-300 font-bold">
                X: {gameProgress?.details?.position?.x ?? 0} &nbsp;
                Y: {gameProgress?.details?.position?.y ?? 64} &nbsp;
                Z: {gameProgress?.details?.position?.z ?? 0}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">TRAVELED</span>
                <div className="text-base font-black text-emerald-400">
                  {gameProgress?.explorationStats?.blocksTraveled || 0} M
                </div>
              </div>
              <div className="p-3 bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">WAYPOINTS</span>
                <div className="text-base font-black text-amber-400">
                  {gameProgress?.explorationStats?.discoveredPointsOfInterest || 0}
                </div>
              </div>
            </div>

            <div className="p-3 bg-zinc-950 border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">HEALTH & VITALS</span>
              <div className="flex items-center gap-4 mt-1 font-bold">
                <div className="flex items-center gap-1.5">
                  <span className="text-rose-500 font-bold">♥</span>
                  <span className="text-xs text-white">{gameProgress?.details?.health ?? 20} / 20</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-amber-500 font-bold">🍗</span>
                  <span className="text-xs text-white">{gameProgress?.details?.food ?? 20} / 20</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Metrics Graph */}
        <div className="lg:col-span-2 bg-black border-2 border-zinc-800 p-6 shadow-[5px_5px_0px_0px_#ffffff] flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-white text-xs uppercase tracking-widest">[THROUGHPUT_MONITOR]</h3>
            </div>
            <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider">TARGET: 2500 KBPS</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="bitrateGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" stroke="#52525b" fontSize={11} tickLine={false} />
                <YAxis stroke="#52525b" fontSize={11} domain={[2000, 3000]} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#000000', borderColor: '#3f3f46', borderRadius: '0px', borderWidth: '2px' }}
                />
                <Area type="monotone" dataKey="bitrate" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#bitrateGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Terminal / Real-time Logs Card */}
      <div className="bg-black border-2 border-zinc-800 p-5 shadow-[4px_4px_0px_0px_#18181b]">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-800">
          <h3 className="font-bold text-white text-xs uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-400 inline-block border border-black"></span>
            [EVENT_LOG // STRUCTURED_STREAM]
          </h3>
          <span className="text-[10px] text-zinc-500 font-bold uppercase">PINO_JSON_REDACTED</span>
        </div>
        <div className="bg-zinc-950 p-3 font-mono text-xs text-zinc-300 max-h-48 overflow-y-auto space-y-1.5 border border-zinc-800">
          {logs.length === 0 ? (
            <div className="text-zinc-600 font-bold uppercase">[IDLE] LISTENING FOR SYSTEM EVENTS...</div>
          ) : (
            logs.slice(-15).map((l: any, idx: number) => (
              <div key={idx} className="flex gap-2 items-start text-[11px]">
                <span className="text-zinc-500 select-none">[{new Date(l.timestamp).toLocaleTimeString()}]</span>
                <span className={l.level === 'error' ? 'text-red-400 font-bold' : l.level === 'warn' ? 'text-yellow-400 font-bold' : 'text-emerald-400 font-bold'}>
                  [{l.source?.toUpperCase() || 'SYS'}]
                </span>
                <span className="break-all text-zinc-300">{l.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
