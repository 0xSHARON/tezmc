import React, { useState } from 'react';
import { Play, Pause, Square, RotateCcw, AlertOctagon, CheckCircle2 } from 'lucide-react';

interface SessionsProps {
  sessionState: string;
  activeSession: any;
  history: any[];
  onStart: (gameId: string, gameConfig: any) => Promise<void>;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onStop: () => Promise<void>;
}

export const Sessions: React.FC<SessionsProps> = ({
  sessionState,
  activeSession,
  history,
  onStart,
  onPause,
  onResume,
  onStop
}) => {
  const [selectedGame, setSelectedGame] = useState('subway-surfers');

  return (
    <div className="space-y-6">
      {/* Session Controls */}
      <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-bold text-white mb-2">Autonomous Session Control Panel</h3>
        <p className="text-sm text-slate-400 mb-6">Start, pause, resume, or cleanly terminate autonomous broadcast sessions.</p>

        <div className="flex flex-wrap items-center gap-4">
          <select
            value={selectedGame}
            onChange={(e) => setSelectedGame(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-sm rounded-lg px-3 py-2 text-white focus:outline-none focus:border-sky-500 font-mono"
          >
            <option value="subway-surfers">Subway Surfers (Autonomous 24/7 AI Runner)</option>
            <option value="minecraft-java-mock">Minecraft Java (Simulated Autonomous Harness)</option>
            <option value="minecraft-java">Minecraft Java Edition (Mineflayer + 3D Viewer)</option>
          </select>

          <button
            onClick={() => {
              if (selectedGame === 'subway-surfers') {
                onStart(selectedGame, {
                  botName: 'JakeSurfer',
                  mode: 'autonomous_ai',
                  difficulty: 'normal',
                  autoRevive: true,
                  viewerPort: 3008,
                  enableViewer: true,
                  startingMultiplier: 10
                });
              } else {
                onStart(selectedGame, {
                  host: 'localhost',
                  port: 25565,
                  version: '1.20.1',
                  botName: 'AutoPlayBot',
                  exploreRadius: 50,
                  enableViewer: true
                });
              }
            }}
            disabled={sessionState === 'RUNNING' || sessionState === 'STARTING_GAME'}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg text-sm font-semibold transition-colors cursor-pointer"
          >
            <Play className="w-4 h-4" /> Start Session
          </button>

          <button
            onClick={onPause}
            disabled={sessionState !== 'RUNNING'}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            <Pause className="w-4 h-4" /> Pause
          </button>

          <button
            onClick={onResume}
            disabled={sessionState !== 'IDLE' && sessionState !== 'PAUSED'}
            className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            <RotateCcw className="w-4 h-4" /> Resume
          </button>

          <button
            onClick={onStop}
            disabled={sessionState === 'IDLE' || sessionState === 'STOPPED'}
            className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            <Square className="w-4 h-4" /> Terminate Cleanly
          </button>
        </div>
      </div>

      {/* Active Session Card */}
      {activeSession && (
        <div className="bg-surface border border-sky-500/30 rounded-xl p-5 shadow-sm bg-gradient-to-r from-sky-950/20 to-transparent">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-white">Active Session: {activeSession.id}</h4>
            <span className="px-2 py-0.5 text-xs bg-sky-500/20 text-sky-400 rounded-md font-mono">
              {activeSession.state}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-slate-300 mt-3">
            <div>
              <span className="text-slate-500">Game Adapter:</span>
              <p className="font-semibold text-white">{activeSession.gameId}</p>
            </div>
            <div>
              <span className="text-slate-500">Restarts:</span>
              <p className="font-semibold text-white">{activeSession.restartCount}</p>
            </div>
            <div>
              <span className="text-slate-500">Failures:</span>
              <p className="font-semibold text-white">{activeSession.consecutiveFailures}</p>
            </div>
            <div>
              <span className="text-slate-500">Started At:</span>
              <p className="font-semibold text-white">{new Date(activeSession.createdAt).toLocaleTimeString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* History Table */}
      <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-white mb-4">Historical Session Records</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/80 text-slate-400 uppercase font-mono border-b border-slate-800">
              <tr>
                <th className="p-3">Session ID</th>
                <th className="p-3">Game</th>
                <th className="p-3">Final State</th>
                <th className="p-3">Restarts</th>
                <th className="p-3">Timestamp</th>
                <th className="p-3">Failure Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-500">No previous sessions found in SQLite database.</td>
                </tr>
              ) : (
                history.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-900/40">
                    <td className="p-3 text-sky-400">{s.id}</td>
                    <td className="p-3">{s.gameId}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        {s.state}
                      </span>
                    </td>
                    <td className="p-3">{s.restartCount}</td>
                    <td className="p-3 text-slate-400">{new Date(s.createdAt).toLocaleString()}</td>
                    <td className="p-3 text-slate-500 truncate max-w-xs">{s.lastFailureReason || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
