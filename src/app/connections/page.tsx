"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";

interface LogMessage {
  time: string;
  msg: string;
}

export default function SourceConnection() {
  // Form state
  const [dbType, setDbType] = useState("POSTGRESQL_v15");
  const [host, setHost] = useState("db-cluster-primary.internal");
  const [port, setPort] = useState("5432");
  const [dbName, setDbName] = useState("hypervisor_pulsater_db");
  const [flushInterval, setFlushInterval] = useState(2000);
  const [partitionFormat, setPartitionFormat] = useState("YYYY-MM-DD");
  
  // Whitelist state
  const [whitelist, setWhitelist] = useState({
    public: true,
    analytics: false,
    audit_logs: false
  });

  // Connection status & saturation
  const [connectionState, setConnectionState] = useState<"idle" | "connecting" | "connected">("idle");
  const [saturation, setSaturation] = useState(6); // out of 10 segments

  // Log state
  const [logs, setLogs] = useState<LogMessage[]>([
    { time: "08:22:25", msg: "POLLING_SOURCE... SUCCESS" },
    { time: "08:22:28", msg: "SYNC_BUFFER_CLEARED [0x00FF21]" },
    { time: "08:22:31", msg: "KEEPALIVE_SENT -> MESH_GATEWAY" },
    { time: "08:22:35", msg: "METRIC_HARVEST: 124 flows/sec" },
    { time: "08:22:38", msg: "SYNC_BUFFER_CLEARED [0x00FF21]" },
    { time: "08:22:41", msg: "POLLING_SOURCE... SUCCESS" },
    { time: "08:22:45", msg: "METRIC_HARVEST: 124 flows/sec" }
  ]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Live log simulation
  useEffect(() => {
    const phrases = [
      "POLLING_SOURCE... SUCCESS",
      "SYNC_BUFFER_CLEARED [0x00FF21]",
      "KEEPALIVE_SENT -> MESH_GATEWAY",
      "METRIC_HARVEST: 124 flows/sec",
      "WORKER_POOL: Thread health check OK",
      "REPLICATOR: Received block commit 108"
    ];

    const interval = setInterval(() => {
      const now = new Date();
      const timeStr = now.toTimeString().split(" ")[0];
      const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
      
      setLogs(prev => [
        ...prev,
        { time: timeStr, msg: randomPhrase }
      ].slice(-25)); // keep last 25 logs

      // Fluctuate saturation slightly
      setSaturation(sat => {
        const diff = Math.random() > 0.5 ? 1 : -1;
        const next = sat + diff;
        return next >= 2 && next <= 10 ? next : sat;
      });
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const handleEstablishConnection = () => {
    if (connectionState !== "idle") return;
    setConnectionState("connecting");
    
    // Add starting logs
    setTimeout(() => {
      const now = new Date();
      const t = now.toTimeString().split(" ")[0];
      setLogs(prev => [...prev, { time: t, msg: `>> INITIATING SOURCE HANDSHAKE TO ${host}:${port}...` }]);
    }, 500);

    setTimeout(() => {
      const now = new Date();
      const t = now.toTimeString().split(" ")[0];
      setLogs(prev => [...prev, { time: t, msg: `>> VALIDATING CREDENTIALS FOR DATABASE: ${dbName}...` }]);
    }, 1500);

    setTimeout(() => {
      const now = new Date();
      const t = now.toTimeString().split(" ")[0];
      setLogs(prev => [
        ...prev,
        { time: t, msg: `>> ESTABLISHED CHANNEL isolated-worker-pool-[1042]` },
        { time: t, msg: `>> CONNECTION STATE: CONNECTED_STABLE` }
      ]);
      setConnectionState("connected");
      setSaturation(9);
    }, 3000);
  };

  const handleDumpConfig = () => {
    const configStr = `---
db_type: "${dbType}"
host: "${host}"
port: ${port}
database_name: "${dbName}"
schemas: [${Object.keys(whitelist).filter(k => whitelist[k as keyof typeof whitelist]).map(k => `"${k}"`).join(", ")}]
flush_interval_ms: ${flushInterval}
partition_format: "${partitionFormat}"
status: "dumped"
`;
    alert(configStr);
  };

  return (
    <div className="bg-[#0A0A0A] text-[#e5e2e1] font-body-mono selection:bg-[#00ff41]/20 selection:text-[#00ff41] h-[calc(100vh-64px)] flex flex-col overflow-hidden">
      {/* SideNavBar */}
      <aside className="fixed left-0 top-16 h-[calc(100vh-64px)] w-64 z-40 bg-black/90 backdrop-blur-xl border-r border-[#3b4b37] flex flex-col py-4 space-y-1">
        <div className="px-6 py-4 border-b border-[#3b4b37]/30">
          <h3 className="font-headline-md text-[#00e639] font-bold text-md leading-none">OPERATOR_01</h3>
          <p className="font-label-code text-[#00dbe7] opacity-70 text-[10px] mt-1.5">[NODE: US-EAST-1]</p>
        </div>
        <nav className="flex-1">
          <Link className="text-[#b9ccb2] flex items-center gap-3 px-4 py-3 opacity-70 hover:bg-[#353534]/30 hover:opacity-100 hover:text-white transition-all" href="/live-cdc">
            <span className="material-symbols-outlined">sensors</span>
            <span className="font-label-code text-[10px]">LIVE_CDC</span>
          </Link>
          <Link className="text-[#b9ccb2] flex items-center gap-3 px-4 py-3 opacity-70 hover:bg-[#353534]/30 hover:opacity-100 hover:text-white transition-all" href="/cluster">
            <span className="material-symbols-outlined">dns</span>
            <span className="font-label-code text-[10px]">CLUSTER_HEALTH</span>
          </Link>
          <Link className="text-[#b9ccb2] flex items-center gap-3 px-4 py-3 opacity-70 hover:bg-[#353534]/30 hover:opacity-100 hover:text-white transition-all" href="/routing">
            <span className="material-symbols-outlined">hub</span>
            <span className="font-label-code text-[10px]">GLOBAL_ROUTING</span>
          </Link>
          <div className="bg-[#ebffe2]/20 text-[#00e639] border-l-4 border-[#00e639] flex items-center gap-3 px-4 py-3 font-bold cursor-default">
            <span className="material-symbols-outlined">settings_ethernet</span>
            <span className="font-label-code text-[10px]">CONNECTIONS</span>
          </div>
          <Link className="text-[#b9ccb2] flex items-center gap-3 px-4 py-3 opacity-70 hover:bg-[#353534]/30 hover:opacity-100 hover:text-white transition-all" href="/alerts">
            <span className="material-symbols-outlined">warning</span>
            <span className="font-label-code text-[10px]">ALERTS</span>
          </Link>
          <Link className="text-[#b9ccb2] flex items-center gap-3 px-4 py-3 opacity-70 hover:bg-[#353534]/30 hover:opacity-100 hover:text-white transition-all" href="/settings">
            <span className="material-symbols-outlined">terminal</span>
            <span className="font-label-code text-[10px]">SETTINGS</span>
          </Link>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="ml-64 p-6 h-[calc(100vh-64px)] overflow-y-auto bg-[#0A0A0A] grid grid-cols-1 lg:grid-cols-10 gap-6">
        
        {/* Left Pane: CONFIGURATION (60%) */}
        <section className="col-span-1 lg:col-span-6 space-y-6">
          <div className="glass-module p-6 border-l-2 border-[#00e639] relative overflow-hidden bg-[#0e0e0e]/80 backdrop-blur-md rounded border border-[#3b4b37]/30">
            <div className="absolute top-0 right-0 p-2 opacity-20 pointer-events-none text-right">
              <span className="font-label-code text-[8px]">[FORM_ID: 99x-ALPHA]</span>
            </div>
            
            <header className="flex items-center gap-2 mb-6 border-b border-[#3b4b37]/30 pb-2">
              <span className="material-symbols-outlined text-[#00e639]">database</span>
              <h2 className="font-headline-lg text-[22px] text-[#00e639] font-bold tracking-tight">SOURCE NODE CONFIGURATION</h2>
            </header>

            <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
              {/* DB Config */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="font-label-code text-[10px] text-[#b9ccb2] flex items-center gap-1">
                    <span className="text-[#00e639] text-[8px]">▶</span> DB_TYPE
                  </label>
                  <div className="relative">
                    <select 
                      value={dbType}
                      onChange={(e) => setDbType(e.target.value)}
                      className="w-full border-b border-[#3b4b37] focus:border-[#00e639] text-[#00e639] font-body-mono px-2 py-2 appearance-none bg-[#0e0e0e] focus:ring-0 focus:outline-none"
                    >
                      <option value="POSTGRESQL_v15">POSTGRESQL_v15</option>
                      <option value="MYSQL_v8">MYSQL_v8</option>
                      <option value="MONGODB_ATLAS">MONGODB_ATLAS</option>
                    </select>
                    <span className="absolute right-2 top-2 material-symbols-outlined pointer-events-none text-[#b9ccb2]">arrow_drop_down</span>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="font-label-code text-[10px] text-[#b9ccb2] flex items-center gap-1">
                    <span className="text-[#00e639] text-[8px]">▶</span> HOST
                  </label>
                  <div className="corner-bracket bracket-tl bracket-tr bracket-bl bracket-br p-px bg-[#0e0e0e] border border-[#3b4b37]">
                    <input 
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      className="w-full bg-transparent border-none text-[#00e639] font-body-mono px-3 py-2 placeholder:text-[#3b4b37] focus:ring-1 focus:ring-[#00e639]/30 focus:outline-none" 
                      type="text"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="font-label-code text-[10px] text-[#b9ccb2] flex items-center gap-1">
                    <span className="text-[#00e639] text-[8px]">▶</span> PORT
                  </label>
                  <input 
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    className="w-full bg-transparent border-b border-[#3b4b37] focus:border-[#00e639] text-[#00e639] font-body-mono px-1 py-1 focus:ring-0 focus:outline-none" 
                    type="text"
                  />
                </div>
                
                <div className="col-span-2 space-y-2">
                  <label className="font-label-code text-[10px] text-[#b9ccb2] flex items-center gap-1">
                    <span className="text-[#00e639] text-[8px]">▶</span> DATABASE_NAME
                  </label>
                  <input 
                    value={dbName}
                    onChange={(e) => setDbName(e.target.value)}
                    className="w-full bg-transparent border-b border-[#3b4b37] focus:border-[#00e639] text-[#00e639] font-body-mono px-1 py-1 focus:ring-0 focus:outline-none" 
                    placeholder="IDENTIFIER_REQUIRED" 
                    type="text"
                  />
                </div>
              </div>

              {/* Schema Whitelist */}
              <div className="space-y-2">
                <label className="font-label-code text-[10px] text-[#b9ccb2] flex items-center gap-1">
                  <span className="text-[#00e639] text-[8px]">▶</span> SCHEMA_SCOPE_WHITELIST
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <div 
                    onClick={() => setWhitelist(w => ({ ...w, public: !w.public }))}
                    className={`corner-bracket bracket-tl bracket-bl p-2 border-r border-[#3b4b37] flex justify-between items-center group cursor-pointer transition-colors ${
                      whitelist.public ? "bg-[#00ff41]/10 text-[#00ff41]" : "bg-[#1c1b1b] text-[#b9ccb2] hover:border-[#00e639]"
                    }`}
                  >
                    <span className="font-label-code text-[10px]">public</span>
                    {whitelist.public ? (
                      <span className="material-symbols-outlined text-sm">check_circle</span>
                    ) : (
                      <span className="material-symbols-outlined text-sm opacity-0 group-hover:opacity-100">add</span>
                    )}
                  </div>
                  
                  <div 
                    onClick={() => setWhitelist(w => ({ ...w, analytics: !w.analytics }))}
                    className={`p-2 border border-[#3b4b37] flex justify-between items-center group cursor-pointer transition-colors ${
                      whitelist.analytics ? "bg-[#00ff41]/10 text-[#00ff41]" : "bg-[#1c1b1b] text-[#b9ccb2] hover:border-[#00e639]"
                    }`}
                  >
                    <span className="font-label-code text-[10px]">analytics</span>
                    {whitelist.analytics ? (
                      <span className="material-symbols-outlined text-sm">check_circle</span>
                    ) : (
                      <span className="material-symbols-outlined text-sm opacity-0 group-hover:opacity-100">add</span>
                    )}
                  </div>

                  <div 
                    onClick={() => setWhitelist(w => ({ ...w, audit_logs: !w.audit_logs }))}
                    className={`p-2 border border-[#3b4b37] flex justify-between items-center group cursor-pointer transition-colors ${
                      whitelist.audit_logs ? "bg-[#00ff41]/10 text-[#00ff41]" : "bg-[#1c1b1b] text-[#b9ccb2] hover:border-[#00e639]"
                    }`}
                  >
                    <span className="font-label-code text-[10px]">audit_logs</span>
                    {whitelist.audit_logs ? (
                      <span className="material-symbols-outlined text-sm">check_circle</span>
                    ) : (
                      <span className="material-symbols-outlined text-sm opacity-0 group-hover:opacity-100">add</span>
                    )}
                  </div>

                  <div className="corner-bracket bracket-tr bracket-br p-2 border-l border-[#3b4b37] bg-[#1c1b1b] flex justify-between items-center opacity-50 cursor-not-allowed">
                    <span className="font-label-code text-[10px] opacity-50">MORE...</span>
                  </div>
                </div>
              </div>

              {/* Storage Destination Section */}
              <div className="pt-8 mt-8 border-t border-dashed border-[#3b4b37] space-y-6">
                <header className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#00f1fe]">save_as</span>
                  <h3 className="font-headline-md text-[18px] text-[#00f1fe] font-semibold tracking-tight">STORAGE DESTINATION</h3>
                </header>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="font-label-code text-[10px] text-[#b9ccb2] block">OUTPUT_DIRECTORY</label>
                    <div className="bg-[#0e0e0e] border border-[#3b4b37] p-2 font-body-mono text-[#00f1fe] flex items-center gap-2 rounded-sm">
                      <span className="text-[12px] opacity-50">mnt/</span>
                      <input 
                        className="bg-transparent border-none focus:ring-0 w-full p-0 text-[12px] focus:outline-none" 
                        type="text" 
                        defaultValue="telemetry/flow_probes/active_stream"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="font-label-code text-[10px] text-[#b9ccb2] block">FLUSH_INTERVAL_MS</label>
                    <input 
                      min="500" 
                      max="10000" 
                      step="500"
                      value={flushInterval}
                      onChange={(e) => setFlushInterval(Number(e.target.value))}
                      className="w-full accent-[#00f1fe] h-1 bg-[#2a2a2a] rounded-full appearance-none cursor-pointer" 
                      type="range"
                    />
                    <div className="flex justify-between font-label-code text-[8px] text-[#b9ccb2]">
                      <span>500ms</span>
                      <span className="text-[#00f1fe]">CURRENT: {flushInterval}ms</span>
                      <span>10000ms</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="font-label-code text-[10px] text-[#b9ccb2] block">PARTITION_FORMAT</label>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => setPartitionFormat("YYYY-MM-DD")}>
                      <input 
                        type="radio" 
                        name="partition" 
                        checked={partitionFormat === "YYYY-MM-DD"}
                        onChange={() => {}}
                        className="text-[#00f1fe] focus:ring-0 bg-transparent border-[#3b4b37]" 
                      />
                      <span className={`font-label-code text-[10px] ${partitionFormat === "YYYY-MM-DD" ? "text-[#00f1fe]" : "opacity-50"}`}>YYYY-MM-DD</span>
                    </div>
                    
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => setPartitionFormat("EPOCH_CHUNK")}>
                      <input 
                        type="radio" 
                        name="partition" 
                        checked={partitionFormat === "EPOCH_CHUNK"}
                        onChange={() => {}}
                        className="text-[#00f1fe] focus:ring-0 bg-transparent border-[#3b4b37]" 
                      />
                      <span className={`font-label-code text-[10px] ${partitionFormat === "EPOCH_CHUNK" ? "text-[#00f1fe]" : "opacity-50"}`}>EPOCH_CHUNK</span>
                    </div>

                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => setPartitionFormat("PROTO_BUFFER")}>
                      <input 
                        type="radio" 
                        name="partition" 
                        checked={partitionFormat === "PROTO_BUFFER"}
                        onChange={() => {}}
                        className="text-[#00f1fe] focus:ring-0 bg-transparent border-[#3b4b37]" 
                      />
                      <span className={`font-label-code text-[10px] ${partitionFormat === "PROTO_BUFFER" ? "text-[#00f1fe]" : "opacity-50"}`}>PROTO_BUFFER</span>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </section>

        {/* Right Pane: DIAGNOSTIC LOG (40%) */}
        <section className="col-span-1 lg:col-span-4 flex flex-col gap-6">
          {/* Console Card - STABLE FIXED HEIGHT CONTAINER */}
          <div className="glass-module flex flex-col border border-[#3b4b37] relative bg-[#0e0e0e]/80 backdrop-blur-md rounded overflow-hidden h-[360px] flex-none">
            <div className="bg-[#2a2a2a] px-3 py-2 flex items-center justify-between border-b border-[#3b4b37] flex-none">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${connectionState === "connected" ? "bg-[#00e639]" : "bg-error animate-pulse"}`}></span>
                <span className="font-label-code text-white text-[10px] tracking-wider">CONNECTION DIAGNOSTIC LOG</span>
              </div>
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 bg-[#3b4b37] rounded-sm"></span>
                <span className="w-2.5 h-2.5 bg-[#3b4b37] rounded-sm"></span>
              </div>
            </div>
            
            {/* Terminal log panel */}
            <div 
              ref={logContainerRef}
              className="flex-grow p-4 font-body-mono text-[11px] overflow-y-auto custom-scrollbar bg-black/40 space-y-1.5"
            >
              {logs.map((log, index) => (
                <p key={index} className="text-[#b9ccb2] opacity-50 hover:opacity-100 transition-opacity">
                  [{log.time}] {log.msg}
                </p>
              ))}
            </div>
            
            {/* Saturation progress bar */}
            <div className="p-4 border-t border-[#3b4b37] bg-[#0e0e0e]/60 flex-none">
              <div className="flex items-center justify-between mb-4">
                <span className="font-label-code text-[#b9ccb2] text-[10px]">WORKER_POOL_SATURATION</span>
                <span className="font-label-code text-[#00e639] text-[10px]">{(saturation * 10)}% ACTIVE</span>
              </div>
              <div className="flex gap-[2px]">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div 
                    key={i} 
                    className={`h-2 flex-1 transition-all duration-300 ${i < saturation ? "bg-[#00e639] shadow-[0_0_4px_#00e639]" : "bg-[#1c1b1b]"}`}
                  ></div>
                ))}
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="glass-module p-4 space-y-3 bg-[#0e0e0e]/80 border border-[#3b4b37] rounded-sm flex-none">
            <button 
              onClick={handleEstablishConnection}
              disabled={connectionState !== "idle"}
              className={`w-full font-label-code py-3 flex items-center justify-center gap-2 transition-all rounded-sm ${
                connectionState === "connected"
                  ? "bg-[#00ff41]/20 text-[#00ff41] border border-[#00ff41] shadow-[0_0_15px_rgba(0,255,65,0.2)]"
                  : connectionState === "connecting"
                  ? "bg-[#00f1fe]/10 border border-[#00f1fe] text-[#00f1fe] animate-pulse cursor-wait"
                  : "bg-[#00e639] text-[#003907] hover:shadow-[0_0_15px_rgba(0,230,57,0.4)] hover:brightness-110 active:opacity-90"
              }`}
            >
              <span className="material-symbols-outlined text-sm">
                {connectionState === "connected" ? "check_circle" : "bolt"}
              </span>
              {connectionState === "connected" 
                ? "CONNECTION ESTABLISHED" 
                : connectionState === "connecting" 
                ? "ESTABLISHING LINK..." 
                : "ESTABLISH CONNECTION"}
            </button>
            
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => {
                  const now = new Date();
                  const t = now.toTimeString().split(" ")[0];
                  setLogs(prev => [...prev, { time: t, msg: `>> RUNNING WORKER TEST: OK [THREADS: ${saturation}]` }]);
                }}
                className="border border-[#84967e] text-[#b9ccb2] font-label-code py-2 hover:bg-[#353534]/50 hover:text-white transition-all flex items-center justify-center gap-2 text-[10px] tracking-wider"
              >
                <span className="material-symbols-outlined text-sm">gesture</span>
                TEST WORKER
              </button>
              
              <button 
                onClick={handleDumpConfig}
                className="border border-[#84967e] text-[#b9ccb2] font-label-code py-2 hover:bg-[#353534]/50 hover:text-white transition-all flex items-center justify-center gap-2 text-[10px] tracking-wider"
              >
                <span className="material-symbols-outlined text-sm">terminal</span>
                DUMP_CONFIG
              </button>
            </div>
            
            <div className="flex justify-between items-center px-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#00e639] animate-ping"></div>
                <span className="font-label-code text-[9px] text-[#00e639]">DAEMON_ACTIVE</span>
              </div>
              <span className="font-label-code text-[9px] text-[#b9ccb2]">PID: 1042 // THREADS: 12</span>
            </div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 w-full h-8 z-50 bg-[#2a2a2a] border-t border-[#00e639]/30 shadow-[0_-4px_12px_rgba(0,0,0,0.5)] flex justify-between items-center px-6">
        <div className="font-label-code text-[#00e639] flex gap-4 text-[10px]">
          <span>[SYSTEM_STATUS: NOMINAL]</span>
          <span className="hidden md:inline">[THREAD_COUNT: 1024]</span>
          <span className="hidden md:inline">[UPTIME: 99.998%]</span>
        </div>
        <div className="flex gap-6">
          <a className="font-body-mono-sm text-[10px] text-[#b9ccb2]/60 hover:text-[#74f5ff] transition-colors underline" href="#">DOCS</a>
          <a className="font-body-mono-sm text-[10px] text-[#b9ccb2]/60 hover:text-[#74f5ff] transition-colors underline" href="#">API_REF</a>
          <a className="font-body-mono-sm text-[10px] text-[#b9ccb2]/60 hover:text-[#74f5ff] transition-colors underline" href="#">SYS_LOGS</a>
        </div>
      </footer>
    </div>
  );
}
