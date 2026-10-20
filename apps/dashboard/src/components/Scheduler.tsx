import React, { useState } from 'react';
import { Calendar, Plus, Clock, Globe } from 'lucide-react';

interface SchedulerProps {
  schedules: any[];
  onCreateSchedule: (schedule: any) => Promise<void>;
}

export const Scheduler: React.FC<SchedulerProps> = ({ schedules, onCreateSchedule }) => {
  const [cron, setCron] = useState('0 */4 * * *');
  const [duration, setDuration] = useState('180');
  const [tz, setTz] = useState('UTC');

  const handleAdd = async () => {
    await onCreateSchedule({
      gameId: 'minecraft-java',
      cronExpression: cron,
      timezone: tz,
      durationMinutes: Number(duration),
      enabled: true,
      gameConfig: { objective: 'bounded_exploration' }
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-bold text-white mb-1">Persistent Automation Scheduler</h2>
        <p className="text-sm text-slate-400 mb-6">
          Define recurring streaming broadcasts, daily operating intervals, and scheduled maintenance windows.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Cron Expression</label>
            <input
              type="text"
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-sky-300 focus:outline-none focus:border-sky-500 font-mono"
            />
            <span className="text-[11px] text-slate-500">e.g. 0 */4 * * * (Every 4 hours)</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Duration (Minutes)</label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Timezone</label>
            <select
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
            >
              <option value="UTC">UTC (Universal Coordinated Time)</option>
              <option value="America/New_York">America/New_York (EST)</option>
              <option value="Europe/London">Europe/London (GMT)</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Recurring Schedule
        </button>
      </div>

      {/* Active Schedules Table */}
      <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-white mb-4">Scheduled Automated Jobs</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/80 text-slate-400 uppercase font-mono border-b border-slate-800">
              <tr>
                <th className="p-3">Schedule ID</th>
                <th className="p-3">Game</th>
                <th className="p-3">Cron</th>
                <th className="p-3">Duration</th>
                <th className="p-3">Timezone</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono">
              {schedules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-500">No scheduled cron jobs configured.</td>
                </tr>
              ) : (
                schedules.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-900/40">
                    <td className="p-3 text-sky-400">{s.id}</td>
                    <td className="p-3">{s.gameId}</td>
                    <td className="p-3 text-amber-300">{s.cronExpression}</td>
                    <td className="p-3">{s.durationMinutes} min</td>
                    <td className="p-3">{s.timezone}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        {s.enabled ? 'ACTIVE' : 'DISABLED'}
                      </span>
                    </td>
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
