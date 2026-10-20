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
  AlertCircle
} from 'lucide-react';
import { Overview } from './components/Overview';
import { Adapters } from './components/Adapters';
import { Sessions } from './components/Sessions';
import { Streaming } from './components/Streaming';
import { Scheduler } from './components/Scheduler';
import { Settings } from './components/Settings';

export default function App() {
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
    // 1. Initial Login to obtain local JWT token
    fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'autoplay2026' })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.token) setAuthToken(data.token);
      })
      .catch(() => {
        // Fallback or retry
      });

    // 2. Fetch Initial State
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
  }, []);

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

  return (
    <div className="flex h-screen bg-background text-slate-100 overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-[#0c0e15] border-r border-border flex flex-col justify-between p-4">
        <div>
          {/* TEZMC Brand Header */}
          <div className="flex items-center gap-3 px-3 py-4 mb-6 border-b border-border">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-700 flex items-center justify-center font-black text-white text-lg shadow-lg shadow-emerald-500/20">
              T
            </div>
            <div>
              <h1 className="font-extrabold text-white text-base tracking-wider leading-tight">TEZMC</h1>
              <span className="text-[10px] text-emerald-400 font-mono tracking-tight uppercase">Autonomous Gaming</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'overview'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-[#131622]'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" /> Overview
            </button>

            <button
              onClick={() => setActiveTab('adapters')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'adapters'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-[#131622]'
              }`}
            >
              <Gamepad2 className="w-4 h-4" /> Game Adapters
            </button>

            <button
              onClick={() => setActiveTab('sessions')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'sessions'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-[#131622]'
              }`}
            >
              <PlaySquare className="w-4 h-4" /> Sessions
            </button>

            <button
              onClick={() => setActiveTab('streaming')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'streaming'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-[#131622]'
              }`}
            >
              <Radio className="w-4 h-4" /> Streaming
            </button>

            <button
              onClick={() => setActiveTab('scheduler')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'scheduler'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-[#131622]'
              }`}
            >
              <Calendar className="w-4 h-4" /> Scheduler
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'settings'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-[#131622]'
              }`}
            >
              <SettingsIcon className="w-4 h-4" /> Settings
            </button>
          </nav>
        </div>

        {/* Footer info */}
        <div className="pt-4 border-t border-border text-xs text-slate-500 space-y-1">
          <div className="flex items-center gap-1.5 text-slate-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            Host: Ubuntu 24.04 LTS
          </div>
          <p>TEZMC Daemon &bull; 24/7 Autonomous</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-16 border-b border-border bg-[#0c0e15]/80 backdrop-blur-md px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-white uppercase tracking-wider">
              {activeTab}
            </span>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-mono text-emerald-400">TEZMC Live Ops</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 bg-[#121520] border border-border rounded-full text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-slate-300 font-mono">CORE: ONLINE</span>
            </div>
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
