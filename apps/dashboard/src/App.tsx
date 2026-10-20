import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  LayoutDashboard,
  Gamepad2,
  PlaySquare,
  Radio,
  Calendar,
  Settings as SettingsIcon,
  Activity,
  ShieldCheck,
  AlertCircle,
  Lock,
  LogOut,
  Terminal
} from 'lucide-react';
import { Overview } from './components/Overview';
import { Adapters } from './components/Adapters';
import { Sessions } from './components/Sessions';
import { Streaming } from './components/Streaming';
import { Scheduler } from './components/Scheduler';
import { Settings } from './components/Settings';
import { BrutalistLogin } from './components/BrutalistLogin';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'adapters' | 'sessions' | 'streaming' | 'scheduler' | 'settings'>('overview');
  const [sessionState, setSessionState] = useState<string>('IDLE');
  const [streamStatus, setStreamStatus] = useState<string>('INACTIVE');
  const [gameProgress, setGameProgress] = useState<any>(null);
  const [systemMetrics, setSystemMetrics] = useState<any>(null);
  const [streamMetrics, setStreamMetrics] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [adapters, setAdapters] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [authToken, setAuthToken] = useState<string>('');

  useEffect(() => {
    // 1. Verify if user is already authenticated
    const savedToken = localStorage.getItem('tezmc_auth_token');
    if (savedToken) {
      setAuthToken(savedToken);
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    // 2. Fetch Initial State when authenticated
    refreshState();

    // 3. Connect WebSocket for live telemetry
    const socket: Socket = io();

    socket.on('session:state_changed', (state: string) => {
      setSessionState(state);
      refreshState();
    });

    socket.on('stream:status', (status: string) => {
      setStreamStatus(status);
    });

    socket.on('stream:metrics', (metrics: any) => {
      setStreamMetrics(metrics);
    });

    socket.on('system:metrics', (metrics: any) => {
      setSystemMetrics(metrics);
    });

    socket.on('game:progress', (progress: any) => {
      setGameProgress(progress);
    });

    socket.on('log:entry', (entry: any) => {
      setLogs((prev) => [...prev.slice(-100), entry]);
    });

    return () => {
      socket.disconnect();
    };
  }, [isAuthenticated]);

  const refreshState = async () => {
    try {
      const [sysRes, gamesRes, sessRes, schedRes] = await Promise.all([
        fetch('/api/v1/system/status'),
        fetch('/api/v1/games'),
        fetch('/api/v1/sessions'),
        fetch('/api/v1/schedules')
      ]);

      const sys = await sysRes.json();
      const games = await gamesRes.json();
      const sess = await sessRes.json();
      const sched = await schedRes.json();

      if (sys.session) {
        setSessionState(sys.session.state);
        setActiveSession(sys.session);
      }
      if (sys.stream) {
        setStreamStatus(sys.stream.status);
        setStreamMetrics(sys.stream.metrics);
      }
      if (sys.system) {
        setSystemMetrics(sys.system);
      }
      if (games.adapters) {
        setAdapters(games.adapters);
      }
      if (sess.history) {
        setHistory(sess.history);
      }
      if (sched.schedules) {
        setSchedules(sched.schedules);
      }
    } catch {
      // offline or loading
    }
  };

  const handleStartSession = async (gameId: string, gameConfig: any) => {
    await fetch('/api/v1/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        gameId,
        gameConfig,
        maxHours: 24,
        alwaysOn: true
      })
    });
    refreshState();
  };

  const handlePauseSession = async () => {
    if (!activeSession) return;
    await fetch(`/api/v1/sessions/${activeSession.id}/pause`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` }
    });
    refreshState();
  };

  const handleResumeSession = async () => {
    if (!activeSession) return;
    await fetch(`/api/v1/sessions/${activeSession.id}/resume`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` }
    });
    refreshState();
  };

  const handleStopSession = async () => {
    if (!activeSession) return;
    await fetch(`/api/v1/sessions/${activeSession.id}/stop`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` }
    });
    refreshState();
  };

  const handleStartStream = async (config: any) => {
    await fetch('/api/v1/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        gameId: 'minecraft-java-mock',
        gameConfig: { objective: 'bounded_exploration' },
        streamConfig: config
      })
    });
    refreshState();
  };

  const handleStopStream = async () => {
    await fetch('/api/v1/stream/stop', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` }
    });
    refreshState();
  };

  const handleValidateAdapter = async (id: string, config: any): Promise<boolean> => {
    try {
      const res = await fetch(`/api/v1/games/${id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      return data.valid === true;
    } catch {
      return false;
    }
  };

  const handleCreateSchedule = async (schedule: any) => {
    await fetch('/api/v1/schedules', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify(schedule)
    });
    refreshState();
  };

  const handleLogout = () => {
    localStorage.removeItem('tezmc_auth_token');
    setAuthToken('');
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return (
      <BrutalistLogin
        onLogin={(token) => {
          setAuthToken(token);
          setIsAuthenticated(true);
        }}
      />
    );
  }

  return (
    <div className="flex h-screen bg-[#050505] text-white overflow-hidden font-mono select-none">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-black border-r-2 border-zinc-800 flex flex-col justify-between p-4 z-20">
        <div>
          {/* TEZMC Brand Header with Logo */}
          <div className="flex items-center gap-3 px-2 py-4 mb-6 border-b-2 border-zinc-800">
            <div className="border-2 border-emerald-500 shadow-[3px_3px_0px_0px_#ffffff] bg-black p-1 flex-shrink-0">
              <img
                src="/logo.png"
                alt="TEZMC"
                className="w-8 h-8 object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div className="overflow-hidden">
              <h1 className="font-black text-white text-base tracking-widest leading-none uppercase">TEZMC</h1>
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block mt-1">
                [LIVE OPS]
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-2">
            {[
              { id: 'overview', label: '[01] OVERVIEW', icon: LayoutDashboard },
              { id: 'adapters', label: '[02] ADAPTERS', icon: Gamepad2 },
              { id: 'sessions', label: '[03] SESSIONS', icon: PlaySquare },
              { id: 'streaming', label: '[04] STREAMING', icon: Radio },
              { id: 'scheduler', label: '[05] SCHEDULER', icon: Calendar },
              { id: 'settings', label: '[06] SETTINGS', icon: SettingsIcon }
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-mono font-bold tracking-wider uppercase border-2 transition-all cursor-pointer ${
                    isActive
                      ? 'bg-emerald-500 text-black border-white shadow-[3px_3px_0px_0px_#ffffff]'
                      : 'bg-zinc-950 text-zinc-400 hover:text-white border-zinc-800 hover:border-zinc-500 shadow-[2px_2px_0px_0px_#18181b]'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer info */}
        <div className="pt-4 border-t-2 border-zinc-800 text-[10px] text-zinc-500 space-y-1 font-mono">
          <div className="flex items-center gap-2 text-zinc-300 font-bold">
            <span className="w-2 h-2 bg-emerald-400 border border-black"></span>
            <span>HOST: UBUNTU 22.04</span>
          </div>
          <p className="text-zinc-500 uppercase">TEZMC • 24/7 UNATTENDED</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#08080a] bg-[radial-gradient(#1f1f23_1px,transparent_1px)] [background-size:24px_24px]">
        {/* Top Header */}
        <header className="h-16 border-b-2 border-zinc-800 bg-black px-6 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <span className="text-xs font-black text-black bg-emerald-400 px-2.5 py-1 border border-black uppercase tracking-widest shadow-[2px_2px_0px_0px_#ffffff]">
              {activeTab}
            </span>
            <span className="text-zinc-600 font-bold">/</span>
            <span className="text-xs font-mono text-zinc-400 tracking-wider">TEZMC COMMAND CENTER</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 bg-zinc-950 border border-zinc-800 text-xs font-mono">
              <span className="w-2 h-2 bg-emerald-400 animate-pulse inline-block"></span>
              <span className="text-zinc-300 font-bold uppercase tracking-wider">CORE: ONLINE</span>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/60 hover:bg-red-600 text-red-200 hover:text-black border-2 border-red-500 hover:border-black text-xs font-mono font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_#ffffff] transition-all cursor-pointer"
              title="Lock Dashboard Session"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>LOCK</span>
            </button>
          </div>
        </header>

        {/* View Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {activeTab === 'overview' && (
            <Overview
              sessionState={sessionState}
              streamStatus={streamStatus}
              gameProgress={gameProgress}
              systemMetrics={systemMetrics}
              streamMetrics={streamMetrics}
              logs={logs}
            />
          )}

          {activeTab === 'adapters' && (
            <Adapters
              adapters={adapters}
              onValidate={handleValidateAdapter}
            />
          )}

          {activeTab === 'sessions' && (
            <Sessions
              sessionState={sessionState}
              activeSession={activeSession}
              history={history}
              onStart={handleStartSession}
              onPause={handlePauseSession}
              onResume={handleResumeSession}
              onStop={handleStopSession}
            />
          )}

          {activeTab === 'streaming' && (
            <Streaming
              streamStatus={streamStatus}
              streamMetrics={streamMetrics}
              onStartStream={handleStartStream}
              onStopStream={handleStopStream}
            />
          )}

          {activeTab === 'scheduler' && (
            <Scheduler
              schedules={schedules}
              onCreateSchedule={handleCreateSchedule}
            />
          )}

          {activeTab === 'settings' && <Settings />}
        </div>
      </main>
    </div>
  );
}
