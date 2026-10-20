import React, { useState } from 'react';
import { Gamepad, CheckCircle, ShieldCheck, Eye, Terminal } from 'lucide-react';

interface AdaptersProps {
  adapters: any[];
  onValidate: (id: string, config: any) => Promise<boolean>;
}

export const Adapters: React.FC<AdaptersProps> = ({ adapters, onValidate }) => {
  const [selectedAdapter, setSelectedAdapter] = useState<string>(adapters[0]?.id || 'minecraft-java');
  const [configJson, setConfigJson] = useState<string>(JSON.stringify({
    host: 'localhost',
    port: 25565,
    version: '1.20.1',
    botName: 'AutoPlayBot',
    auth: 'offline',
    exploreRadius: 50,
    viewerPort: 3007,
    enableViewer: true,
    objective: 'bounded_exploration'
  }, null, 2));

  const [validationMsg, setValidationMsg] = useState<{ valid: boolean; text: string } | null>(null);

  const handleValidation = async () => {
    try {
      const parsed = JSON.parse(configJson);
      const ok = await onValidate(selectedAdapter, parsed);
      setValidationMsg(ok ? { valid: true, text: 'Configuration is valid!' } : { valid: false, text: 'Validation failed.' });
    } catch (e: any) {
      setValidationMsg({ valid: false, text: `JSON Error: ${e.message}` });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Game Adapters Registry</h2>
          <p className="text-sm text-slate-400">Manage independently installable game adapters and runtime prerequisites.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {adapters.map((adapter) => (
          <div
            key={adapter.id}
            onClick={() => setSelectedAdapter(adapter.id)}
            className={`cursor-pointer bg-surface border rounded-xl p-5 transition-all ${
              selectedAdapter === adapter.id ? 'border-sky-500 shadow-md shadow-sky-500/10' : 'border-border hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Gamepad className="w-5 h-5 text-sky-400" />
                <h4 className="font-semibold text-white">{adapter.displayName}</h4>
              </div>
              <span className="px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-400 rounded-md border border-emerald-500/30">
                Installed
              </span>
            </div>

            <p className="text-xs text-slate-400 mb-4">ID: <code className="text-sky-300">{adapter.id}</code></p>

            <div className="space-y-1.5 text-xs text-slate-300">
              <div className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-slate-400" />
                <span>3D Rendering: {adapter.capabilities?.supportsRealRendering ? 'Supported' : 'Disabled'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                <span>Auto-Reconnection: {adapter.capabilities?.supportsReconnection ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Adapter Configuration Panel */}
      <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-sky-400" />
            <h3 className="font-semibold text-white">Adapter Configuration Inspector: {selectedAdapter}</h3>
          </div>
          <button
            onClick={handleValidation}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Validate Configuration
          </button>
        </div>

        {validationMsg && (
          <div className={`p-3 rounded-lg text-xs font-mono mb-4 border ${validationMsg.valid ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800' : 'bg-rose-950/40 text-rose-300 border-rose-800'}`}>
            {validationMsg.text}
          </div>
        )}

        <textarea
          rows={10}
          value={configJson}
          onChange={(e) => setConfigJson(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-sky-300 focus:outline-none focus:border-sky-500"
        />
      </div>
    </div>
  );
};
