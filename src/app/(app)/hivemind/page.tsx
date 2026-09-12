"use client";

import { useEffect, useState, useRef } from "react";
import { Activity, Cpu, Zap, RadioReceiver } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Telemetry = {
  scene: number;
  kickLevel: number;
  flash: boolean;
  spatial: { x: number; y: number };
  cc: Record<string, number>;
};

export default function HiveMindDashboard() {
  const [telemetry, setTelemetry] = useState<Telemetry>({
    scene: 1,
    kickLevel: 0,
    flash: false,
    spatial: { x: 0, y: 0 },
    cc: {},
  });
  const [connected, setConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    const connect = () => {
      ws.current = new WebSocket("ws://localhost:9001");
      
      ws.current.onopen = () => setConnected(true);
      ws.current.onclose = () => {
        setConnected(false);
        setTimeout(connect, 2000); // Reconnect
      };
      
      ws.current.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === "init") {
            setTelemetry(t => ({ ...t, scene: msg.data.scene, cc: msg.data.cc }));
          } else if (msg.type === "scene_change") {
            setTelemetry(t => ({ ...t, scene: msg.data.scene }));
          } else if (msg.type === "fft_kick") {
            setTelemetry(t => ({ ...t, kickLevel: msg.data.level }));
          } else if (msg.type === "spatial") {
            setTelemetry(t => ({ ...t, spatial: { x: msg.data.x, y: msg.data.y } }));
          } else if (msg.type === "strobe") {
            setTelemetry(t => ({ ...t, flash: msg.data.flash }));
            setTimeout(() => setTelemetry(t => ({ ...t, flash: false })), 100);
          } else if (msg.type === "midi_cc") {
            setTelemetry(t => ({
              ...t,
              cc: { ...t.cc, [msg.data.channel]: msg.data.value }
            }));
          }
        } catch (e) {
          console.error(e);
        }
      };
    };
    
    connect();
    
    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []);

  const triggerScene = (sceneId: number) => {
    if (ws.current && connected) {
      ws.current.send(JSON.stringify({ type: "trigger_scene", scene: sceneId }));
    }
  };

  const triggerStrobe = () => {
    if (ws.current && connected) {
      ws.current.send(JSON.stringify({ type: "strobe" }));
    }
  };

  return (
    <div className="min-h-screen bg-black text-white selection:bg-[var(--app-brand)] font-sans">
      <div className="mx-auto max-w-5xl p-6 md:p-12">
        {/* Header */}
        <header className="mb-12 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <Cpu className="w-8 h-8 text-indigo-500" />
              Hive Mind
            </h1>
            <p className="text-zinc-400 mt-1">Wildframe Nervous System Telemetry</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              {connected && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-3 w-3 ${connected ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
            </span>
            <span className="text-sm font-medium text-zinc-300">
              {connected ? "SYS.ONLINE" : "SYS.OFFLINE"}
            </span>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Audio Visualizer */}
          <div className="col-span-1 md:col-span-2 bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 relative overflow-hidden">
            <AnimatePresence>
              {telemetry.flash && (
                <motion.div
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0 bg-white z-0 mix-blend-overlay"
                />
              )}
            </AnimatePresence>
            
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-8 text-zinc-400 font-medium tracking-widest text-xs uppercase">
                <Activity className="w-4 h-4" />
                FFT Kick Analysis
              </div>
              
              <div className="flex items-end gap-2 h-48">
                {Array.from({ length: 32 }).map((_, i) => {
                  // Simulate some variance based on the actual kick level
                  const variance = Math.abs(Math.sin(i * 12.345)) * 0.2;
                  const height = telemetry.kickLevel > 0 
                    ? Math.max(5, (telemetry.kickLevel - variance) * 100) 
                    : 5;
                  
                  return (
                    <motion.div
                      key={i}
                      animate={{ height: `${height}%` }}
                      transition={{ type: "spring", bounce: 0, duration: 0.1 }}
                      className="flex-1 bg-indigo-500 rounded-t-sm opacity-80"
                      style={{ 
                        filter: telemetry.flash ? "brightness(2)" : "none",
                        backgroundColor: telemetry.kickLevel > 0.8 ? "#ec4899" : "#6366f1"
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8">
            <div className="flex items-center gap-2 mb-6 text-zinc-400 font-medium tracking-widest text-xs uppercase">
              <RadioReceiver className="w-4 h-4" />
              Show Control
            </div>
            
            <div className="space-y-4">
              <div>
                <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">Active Scene</p>
                <div className="text-4xl font-light font-mono text-white">
                  SCENE_{telemetry.scene.toString().padStart(2, '0')}
                </div>
              </div>
              
              <div className="pt-4 grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map(s => (
                  <button
                    key={s}
                    onClick={() => triggerScene(s)}
                    className={`py-3 rounded-xl font-mono text-sm transition-all active:scale-95 ${
                      telemetry.scene === s 
                        ? 'bg-indigo-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)]' 
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    S_{s}
                  </button>
                ))}
              </div>
              
              <button
                onClick={triggerStrobe}
                className="w-full mt-2 py-4 rounded-xl bg-pink-500/20 text-pink-400 font-bold uppercase tracking-widest border border-pink-500/50 hover:bg-pink-500 hover:text-white transition-all active:scale-95"
              >
                <Zap className="w-4 h-4 inline mr-2" />
                Manual Strobe
              </button>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
