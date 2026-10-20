import React from 'react';
import { Database, Shield, Bell, Cpu, Server } from 'lucide-react';

export const Settings: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="bg-[#0f111a] border border-border rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-bold text-white mb-1">TEZMC Platform Settings & Guardrails</h2>
        <p className="text-sm text-slate-400 mb-6">
          Global operating limits and persistence configurations for unattended 24/7 TEZMC broadcasts.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Thresholds */}
          <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 space-y-4">
            <div className="flex items-center gap-2 text-sky-400 font-semibold text-sm">
              <Cpu className="w-4 h-4" /> Resource Quotas & Limits
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Max CPU Threshold (%)</label>
              <input
                type="number"
                defaultValue={85}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Max Memory Threshold (%)</label>
              <input
                type="number"
                defaultValue={85}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Max Restart Retries</label>
              <input
                type="number"
                defaultValue={5}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white"
              />
            </div>
          </div>

          {/* Database & Security */}
          <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 space-y-4">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
              <Database className="w-4 h-4" /> Persistence & Storage
            </div>
            <div>
              <span className="text-xs text-slate-400 block mb-1">Active Persistence Engine</span>
              <div className="font-mono text-xs text-emerald-300">SQLite (file:./data/autoplay.sqlite)</div>
            </div>
            <div>
              <span className="text-xs text-slate-400 block mb-1">Production Ingestion</span>
              <div className="font-mono text-xs text-slate-300">PostgreSQL 15+ Compatible Schema</div>
            </div>
            <div className="pt-2">
              <span className="text-xs text-slate-400 block mb-1">Audit Trail</span>
              <div className="font-mono text-xs text-sky-300">Enabled (Every API mutation logged)</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
