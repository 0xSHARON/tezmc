import React, { useState } from 'react';
import { Lock, ShieldAlert, ArrowRight, KeyRound, Terminal } from 'lucide-react';

interface BrutalistLoginProps {
  onLogin: (token: string, user: any) => void;
}

export const BrutalistLogin: React.FC<BrutalistLoginProps> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('ENTER PASSCODE TO UNLOCK');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: password.trim() })
      });

      const data = await res.json();

      if (!res.ok || !data.token) {
        setError(data.message || 'INVALID PASSCODE. ACCESS DENIED.');
        setLoading(false);
        return;
      }

      localStorage.setItem('tezmc_auth_token', data.token);
      onLogin(data.token, data.user);
    } catch {
      setError('FAILED TO CONNECT TO TEZMC AUTH GATEWAY');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:20px_20px] flex items-center justify-center p-4 font-mono text-white select-none">
      <div className="w-full max-w-md bg-black border-2 border-zinc-700 shadow-[8px_8px_0px_0px_#10b981] relative">
        {/* Terminal Header Bar */}
        <div className="bg-zinc-900 border-b-2 border-zinc-700 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-red-500 border border-black inline-block"></span>
            <span className="w-3 h-3 bg-yellow-500 border border-black inline-block"></span>
            <span className="w-3 h-3 bg-emerald-500 border border-black inline-block"></span>
            <span className="text-xs text-zinc-400 font-bold ml-2">SECURITY_GATE // V1.0</span>
          </div>
          <span className="text-[10px] text-emerald-400 uppercase tracking-widest font-black">[RESTRICTED]</span>
        </div>

        {/* Card Body */}
        <div className="p-8">
          {/* Logo Showcase */}
          <div className="text-center mb-6">
            <div className="inline-block border-2 border-emerald-500 shadow-[4px_4px_0px_0px_#ffffff] bg-black p-1.5 mb-3">
              <img
                src="/logo.png"
                alt="TEZMC Logo"
                className="w-20 h-20 object-contain mx-auto"
                onError={(e) => {
                  // Fallback to monogram if image fails
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <h1 className="text-2xl font-black tracking-widest uppercase text-white">TEZMC</h1>
            <p className="text-xs text-emerald-400 font-bold uppercase tracking-wider mt-0.5">
              [AUTONOMOUS GAMING & LIVE STREAMING]
            </p>
          </div>

          {/* Warning Badge */}
          <div className="bg-zinc-950 border-2 border-zinc-800 p-3 mb-6 text-xs text-zinc-400 flex items-start gap-2.5">
            <Terminal className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-white font-bold uppercase">OPERATOR AUTH REQUIRED</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">Session encrypted via SHA-256 JWT tokens.</div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs uppercase tracking-wider text-zinc-300 font-bold mb-2 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-emerald-400" /> PASSCODE:
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoFocus
                className="w-full bg-zinc-950 border-2 border-zinc-700 text-white px-4 py-3 text-sm font-mono placeholder-zinc-600 focus:outline-none focus:border-emerald-400 focus:shadow-[3px_3px_0px_0px_#10b981] transition-all"
              />
            </div>

            {error && (
              <div className="bg-red-950/60 border-2 border-red-500 p-3 text-xs text-red-200 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span className="font-bold">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-700 text-black font-black uppercase tracking-wider py-3.5 px-4 text-sm border-2 border-black shadow-[4px_4px_0px_0px_#ffffff] hover:shadow-[2px_2px_0px_0px_#ffffff] active:translate-x-0.5 active:translate-y-0.5 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>VERIFYING CREDENTIALS...</>
              ) : (
                <>
                  <span>UNLOCK DASHBOARD</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Technical Metadata Stamp */}
          <div className="mt-8 pt-4 border-t border-zinc-800 text-[10px] text-zinc-500 flex justify-between items-center">
            <span>CORE: ONLINE</span>
            <span>HTTPS: 256-BIT</span>
            <span>v1.0.0</span>
          </div>
        </div>
      </div>
    </div>
  );
};
