"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function DeployContainer() {
  const router = useRouter();
  const [containerName, setContainerName] = useState("tracker-node-beta");
  const [dbType, setDbType] = useState("PostgreSQL");
  const [portMapping, setPortMapping] = useState("5432:5432");
  const [operatorKey, setOperatorKey] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [deployStep, setDeployStep] = useState(0);
  const [deployLogs, setDeployLogs] = useState<string[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem("session_token");
    if (!token) {
      router.push("/login");
    }
  }, [router]);

  const simulatedLogs = [
    "[SYS_DAEMON] RESOLVING CORE REPLICATION SHARD...",
    "[SYS_DAEMON] DOCKING CONTAINER INSTANCE FOR LOG STREAM...",
    "[SYS_DAEMON] ALLOCATING MEMORY SEGMENT: 512MB RAM CORES...",
    `[SYS_DAEMON] MAPPING NETWORK CHANNEL ROUTE [${portMapping}]...`,
    `[SYS_DAEMON] MOUNTING ENCRYPTED PARTITION ON DB TARGET [${dbType}]...`,
    "[SYS_DAEMON] STABILIZING NEURAL TELEMETRY HEARTBEAT...",
    "[SYS_DAEMON] PULSATER_NODE_SECURE_LINK: HANDSHAKE OK.",
    "[SYS_DAEMON] CONTAINER DEPLOYED AND SYNCHRONIZING REALTIME TRANS..."
  ];

  useEffect(() => {
    if (deploying && deployStep < simulatedLogs.length) {
      const timer = setTimeout(() => {
        setDeployLogs(prev => [...prev, simulatedLogs[deployStep]]);
        setDeployStep(s => s + 1);
      }, 700);
      return () => clearTimeout(timer);
    } else if (deploying && deployStep === simulatedLogs.length) {
      // Finished deploying
      setDeploying(false);
      setDeployStep(0);
      
      const ports = portMapping.split(":");
      const extPort = ports[1] || "5432";

      // Trigger custom toast notification
      if ((window as any).toast) {
        (window as any).toast.success(`Container ${containerName} initialized`, {
          db_type: dbType,
          host: "localhost",
          port: extPort,
          status: "ONLINE",
          node_id: containerName.toUpperCase(),
        });
      }

      // Automatically push to /connections after 1.2-second transition delay
      setTimeout(() => {
        router.push("/connections");
      }, 1200);
    }
  }, [deploying, deployStep]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [deployLogs]);

  const handleDeploy = (e: React.FormEvent) => {
    e.preventDefault();
    if (deploying) return;
    setDeployLogs([]);
    setDeployStep(0);
    setDeploying(true);
  };

  return (
    <div className="bg-[#0A0A0A] text-[#e5e2e1] font-body-mono min-h-[calc(100vh-64px)] p-6 flex items-center justify-center relative">
      {/* Starry Coordinates Background */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: "radial-gradient(#00ff41 1px, transparent 1px)", backgroundSize: "32px 32px" }}></div>

      <div className="w-full max-w-2xl bg-[#0e0e0e] border border-[#3b4b37] rounded-sm relative overflow-hidden flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.8)]">
        {/* Tactical Brackets */}
        <div className="absolute bracket-tl"></div>
        <div className="absolute bracket-tr"></div>
        <div className="absolute bracket-bl"></div>
        <div className="absolute bracket-br"></div>

        {/* Header bar */}
        <div className="bg-[#2a2a2a] px-4 py-2 flex justify-between items-center border-b border-[#3b4b37]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#00f1fe] text-sm">hub</span>
            <span className="font-label-code text-[10px] text-[#00f1fe] uppercase tracking-widest">
              CONTAINER_DEPLOYMENT_WIZARD // v1.2.0
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[#00ff41] animate-ping"></div>
            <span className="font-label-code text-[8px] text-[#84967e]">SECURE CHANNEL</span>
          </div>
        </div>

        {/* Main Panel Content */}
        <div className="p-8 space-y-6">
          <div className="border-b border-[#3b4b37]/30 pb-4">
            <h1 className="font-display-tech text-2xl text-[#00ff41] tracking-tight">Deploy CDC Ingestion Core</h1>
            <p className="font-body-mono text-xs text-[#b9ccb2] mt-1">Configure isolated container routing endpoints to intercept ledger transactions.</p>
          </div>

          {!deploying && deployLogs.length === 0 ? (
            <form onSubmit={handleDeploy} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="font-label-code text-[9px] text-[#00f1fe] block">[ CONTAINER_DESIGNATION ]</label>
                  <input 
                    required
                    value={containerName}
                    onChange={(e) => setContainerName(e.target.value)}
                    className="w-full bg-[#1c1b1b] border border-[#3b4b37] focus:border-[#00ff41] text-white font-body-mono p-3 text-xs focus:ring-0 focus:outline-none transition-all"
                    placeholder="tracker-node-beta"
                    type="text"
                  />
                </div>
                <div className="space-y-2">
                  <label className="font-label-code text-[9px] text-[#00f1fe] block">[ INGESTION_TARGET_DB ]</label>
                  <select
                    value={dbType}
                    onChange={(e) => setDbType(e.target.value)}
                    className="w-full bg-[#1c1b1b] border border-[#3b4b37] focus:border-[#00ff41] text-white font-body-mono p-3 text-xs focus:ring-0 focus:outline-none transition-all"
                  >
                    <option value="PostgreSQL">PostgreSQL (CDC WAL)</option>
                    <option value="MySQL">MySQL (Binlog Stream)</option>
                    <option value="MongoDB">MongoDB (Oplog Watcher)</option>
                    <option value="Cassandra">Cassandra (CommitLog Capture)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="font-label-code text-[9px] text-[#00f1fe] block">[ HOST_PORT_MAPPING ]</label>
                  <input 
                    required
                    value={portMapping}
                    onChange={(e) => setPortMapping(e.target.value)}
                    className="w-full bg-[#1c1b1b] border border-[#3b4b37] focus:border-[#00ff41] text-white font-body-mono p-3 text-xs focus:ring-0 focus:outline-none transition-all"
                    placeholder="5432:5432"
                    type="text"
                  />
                </div>
                <div className="space-y-2">
                  <label className="font-label-code text-[9px] text-[#00f1fe] block">[ OPERATOR_SIGNATURE_KEY ]</label>
                  <input 
                    required
                    value={operatorKey}
                    onChange={(e) => setOperatorKey(e.target.value)}
                    className="w-full bg-[#1c1b1b] border border-[#3b4b37] focus:border-[#00ff41] text-white font-body-mono p-3 text-xs focus:ring-0 focus:outline-none transition-all placeholder:opacity-30"
                    placeholder="SHA256-OPERATOR-KEY-HEX"
                    type="password"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-[#00ff41]/10 border border-[#00ff41] text-[#00ff41] py-4 mt-6 font-label-code text-xs tracking-widest hover:bg-[#00ff41]/20 cursor-pointer active:scale-[0.99] transition-all flex items-center justify-center gap-2 font-bold"
              >
                INITIALIZE CORE DEPLOYMENT SEQUENCE
                <span className="material-symbols-outlined">rocket_launch</span>
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between font-label-code text-[10px] text-[#84967e]">
                <span>DEPLOY_STATUS: {deploying ? "PROVISIONING..." : "DEPLOY_COMPLETE"}</span>
                <span>PROGRESS: {Math.floor((deployLogs.length / simulatedLogs.length) * 100)}%</span>
              </div>
              
              {/* Progress segment bar */}
              <div className="h-2 w-full bg-[#1c1b1b] flex gap-[2px]">
                {simulatedLogs.map((_, i) => (
                  <div 
                    key={i} 
                    className={`flex-1 h-full transition-all duration-300 ${
                      i < deployLogs.length ? "bg-[#00ff41] shadow-[0_0_8px_#00ff41]" : "bg-[#2a2a2a]"
                    }`}
                  ></div>
                ))}
              </div>

              {/* Console log outputs */}
              <div 
                ref={logContainerRef}
                className="bg-[#050505] border border-[#3b4b37]/40 p-4 h-48 overflow-y-auto text-[10px] font-mono text-[#00ff41]/85 space-y-1.5 custom-scrollbar"
              >
                {deployLogs.map((log, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-[#84967e]">[{new Date().toLocaleTimeString()}]</span>
                    <span className={log.includes("OK") || log.includes("SUCCESSFULLY") ? "text-[#00ff41] font-bold" : "text-[#b9ccb2]"}>
                      {log}
                    </span>
                  </div>
                ))}
                {deploying && (
                  <div className="flex gap-2 text-[#00f1fe] animate-pulse">
                    <span>&gt;&gt; ESTABLISHING SHARD SOCKET PROTOCOL...</span>
                    <span className="cursor-blink">_</span>
                  </div>
                )}
              </div>

              {!deploying && (
                <div className="flex gap-4 pt-4">
                  <button
                    onClick={() => {
                      setDeployLogs([]);
                      setDeployStep(0);
                    }}
                    className="flex-1 bg-[#1c1b1b] border border-[#3b4b37] text-[#b9ccb2] hover:text-white py-3 font-label-code text-[11px] text-center transition-all cursor-pointer"
                  >
                    CONFIG NEW NODE
                  </button>
                  <Link
                    href="/live-cdc"
                    className="flex-1 bg-[#00f1fe]/10 border border-[#00f1fe] text-[#00f1fe] py-3 font-label-code text-[11px] text-center hover:bg-[#00f1fe]/20 transition-all"
                  >
                    ENTER TRANSACTION CONSOLE
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
