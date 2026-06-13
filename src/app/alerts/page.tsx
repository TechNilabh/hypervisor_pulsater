"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

interface AlertRow {
  timestamp: string;
  severity: "ERROR" | "WARN" | "INFO" | "SYS";
  nodeId: string;
  eventType: string;
  message: string;
}

export default function PipelineAlerts() {
  const [alerts, setAlerts] = useState<AlertRow[]>([
    { timestamp: "2026-06-13 11:02:11.452", severity: "ERROR", nodeId: "US-E1-NODE-09", eventType: "PACKET_LOSS_CRIT", message: "Buffer overflow detected on eth0 pipeline. Dropping frames > 1500MTU." },
    { timestamp: "2026-06-13 11:02:08.109", severity: "WARN", nodeId: "EU-W2-NODE-04", eventType: "LATENCY_SPIKE", message: "Routing divergence observed in EU-W2 region. Latency +140ms." },
    { timestamp: "2026-06-13 11:01:55.998", severity: "INFO", nodeId: "ASIA-S1-NODE-22", eventType: "NODE_REBALANCE", message: "Load distribution complete. 12 shards migrated to ASIA-S1." },
    { timestamp: "2026-06-13 11:01:30.001", severity: "SYS", nodeId: "ROOT_PULSATER", eventType: "HB_PULSE", message: "Routine heartbeat sync valid. Threads: 1024/1024." },
    { timestamp: "2026-06-13 11:01:12.772", severity: "ERROR", nodeId: "US-E1-NODE-12", eventType: "TLS_HANDSHAKE_FAIL", message: "Certificate validation error on secure gateway 4." },
    { timestamp: "2026-06-13 11:00:55.210", severity: "INFO", nodeId: "US-E1-NODE-09", eventType: "DB_QUERY_OPTI", message: "Vacuum process completed on local postgres shard." },
    { timestamp: "2026-06-13 11:00:44.119", severity: "WARN", nodeId: "SA-E1-NODE-01", eventType: "DISK_IO_HOG", message: "Process [89112] utilizing 85% IOPS bandwidth." },
    { timestamp: "2026-06-13 11:00:30.505", severity: "INFO", nodeId: "EU-W2-NODE-04", eventType: "CRON_SUCCESS", message: "Daily backup rotation finished successfully." }
  ]);

  // Filters state
  const [activeFilters, setActiveFilters] = useState({
    ERROR: true,
    WARN: true,
    INFO: true,
    SYS: true
  });

  const [activeAnomalies, setActiveAnomalies] = useState(8);
  const [peakLoad, setPeakLoad] = useState(94);
  const [searchQuery, setSearchQuery] = useState("");

  // Live alerts simulation
  useEffect(() => {
    const severities: ("ERROR" | "WARN" | "INFO" | "SYS")[] = ["ERROR", "WARN", "INFO", "SYS"];
    const nodes = ["US-E1-NODE-09", "EU-W2-NODE-04", "ASIA-S1-NODE-22", "SA-E1-NODE-01", "US-E1-NODE-12"];
    const events = ["NET_TIMEOUT", "CPU_LOAD_HIGH", "BUFFER_FLUSH", "MEM_LIMIT_WARN", "SYNC_RESET"];
    const messages = [
      "Network packet transit timed out after 5000ms. Reconnecting...",
      "Thread pool saturation exceeded threshold. Throttling active coroutines.",
      "Buffer pool successfully flushed to analytical layer.",
      "Allocated slice size close to memory limit. GC scheduled.",
      "Connection handoff completed successfully between active clusters."
    ];

    const interval = setInterval(() => {
      const idx = Math.floor(Math.random() * severities.length);
      const now = new Date();
      const timeStr = now.toISOString().replace("T", " ").substring(0, 23);
      
      const newAlert: AlertRow = {
        timestamp: timeStr,
        severity: severities[idx],
        nodeId: nodes[Math.floor(Math.random() * nodes.length)],
        eventType: events[idx],
        message: messages[idx]
      };

      setAlerts(prev => [newAlert, ...prev].slice(0, 30));

      if (newAlert.severity === "ERROR") {
        setActiveAnomalies(c => Math.min(15, c + 1));
      }
      setPeakLoad(load => Math.max(85, Math.min(99, load + Math.floor((Math.random() - 0.5) * 3))));
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const toggleFilter = (type: keyof typeof activeFilters) => {
    setActiveFilters(prev => ({ ...prev, [type]: !prev[type] }));
  };

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(alerts, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "pulsater_alerts_dump.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Filter logs based on active state buttons and search query
  const filteredAlerts = alerts.filter(row => {
    if (!activeFilters[row.severity]) return false;
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      return (
        row.nodeId.toLowerCase().includes(q) ||
        row.eventType.toLowerCase().includes(q) ||
        row.message.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="bg-[#0A0A0A] text-[#e5e2e1] font-body-mono min-h-screen overflow-hidden flex flex-col select-none">
      {/* Main Content Area */}
      <div className="p-6 min-h-screen overflow-hidden flex gap-6">
        
        {/* Left Section: Diagnostic Matrix & Filters */}
        <section className="flex-1 flex flex-col space-y-6 overflow-hidden">
          {/* Control Bar */}
          <div className="bg-[#1c1b1b] border border-[#3b4b37] p-2 flex items-center justify-between rounded-sm">
            <div className="flex items-center gap-2">
              <span className="font-label-code text-[#b9ccb2]/60 text-[10px] mr-2 px-2 border-r border-[#3b4b37]">
                FILTER_STREAM:
              </span>
              <button 
                onClick={() => toggleFilter("ERROR")}
                className={`px-3 py-1 font-label-code text-[10px] border transition-all active:scale-95 ${
                  activeFilters.ERROR 
                    ? "bg-[#93000a] text-[#ffdad6] border-error shadow-[0_0_8px_rgba(255,49,49,0.2)]" 
                    : "bg-[#131313] border-[#3b4b37] text-[#b9ccb2]/50 hover:text-white"
                }`}
              >
                [ERROR]
              </button>
              
              <button 
                onClick={() => toggleFilter("WARN")}
                className={`px-3 py-1 font-label-code text-[10px] border transition-all active:scale-95 ${
                  activeFilters.WARN 
                    ? "bg-[#ffd2cd]/20 text-[#ffb4ab] border-[#ffb4ab] shadow-[0_0_8px_rgba(255,180,171,0.2)]" 
                    : "bg-[#131313] border-[#3b4b37] text-[#b9ccb2]/50 hover:text-white"
                }`}
              >
                [WARNING]
              </button>
              
              <button 
                onClick={() => toggleFilter("INFO")}
                className={`px-3 py-1 font-label-code text-[10px] border transition-all active:scale-95 ${
                  activeFilters.INFO 
                    ? "bg-[#00f1fe]/20 text-[#00f1fe] border-[#00f1fe] shadow-[0_0_8px_rgba(0,241,254,0.2)]" 
                    : "bg-[#131313] border-[#3b4b37] text-[#b9ccb2]/50 hover:text-white"
                }`}
              >
                [INFO]
              </button>
              
              <button 
                onClick={() => toggleFilter("SYS")}
                className={`px-3 py-1 font-label-code text-[10px] border transition-all active:scale-95 ${
                  activeFilters.SYS 
                    ? "bg-[#353534] text-[#b9ccb2] border-[#84967e] shadow-[0_0_8px_rgba(132,150,126,0.15)]" 
                    : "bg-[#131313] border-[#3b4b37] text-[#b9ccb2]/50 hover:text-white"
                }`}
              >
                [SYSTEM]
              </button>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-[#00e639] font-label-code text-[10px]">
                <span className="animate-pulse">●</span>
                <span>LIVE_TELEMETRY</span>
              </div>
              <button 
                onClick={handleExport}
                className="bg-[#00e639] text-[#003907] font-label-code px-4 py-1 text-[10px] hover:brightness-110 active:scale-95 transition-all font-bold"
              >
                EXPORT_LOGS
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="flex-grow bg-[#0e0e0e] border border-[#3b4b37] relative overflow-hidden flex flex-col rounded-sm">
            <div className="scanline absolute inset-0 pointer-events-none opacity-20"></div>
            
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-2 bg-[#2a2a2a]/30 p-3 border-b border-[#3b4b37] font-label-code text-[10px] text-[#00e639] font-bold sticky top-0 z-10">
              <div className="col-span-3">TIMESTAMP</div>
              <div className="col-span-2">SEVERITY</div>
              <div className="col-span-2">NODE_ID</div>
              <div className="col-span-2">EVENT_TYPE</div>
              <div className="col-span-3">MESSAGE</div>
            </div>
            
            {/* Table Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar font-body-mono-sm divide-y divide-[#3b4b37]/20 p-1">
              {filteredAlerts.length > 0 ? (
                filteredAlerts.map((row, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 p-2.5 hover:bg-[#353534]/20 transition-colors group text-[12px]">
                    <div className="col-span-3 text-[#b9ccb2]/80 pr-1">{row.timestamp}</div>
                    <div className="col-span-2">
                      {row.severity === "ERROR" ? (
                        <span className="text-error bg-error-container/20 px-1.5 py-0.5 border border-error/30 text-[9px] font-bold">ERROR</span>
                      ) : row.severity === "WARN" ? (
                        <span className="text-[#ffb4ab] bg-[#ffd2cd]/10 px-1.5 py-0.5 border border-[#ffb4ab]/30 text-[9px] font-bold">WARN</span>
                      ) : row.severity === "INFO" ? (
                        <span className="text-[#00f1fe] bg-[#00f1fe]/10 px-1.5 py-0.5 border border-[#00f1fe]/30 text-[9px] font-bold">INFO</span>
                      ) : (
                        <span className="text-[#b9ccb2]/60 bg-[#353534]/20 px-1.5 py-0.5 border border-[#84967e]/30 text-[9px] font-bold">SYS</span>
                      )}
                    </div>
                    <div className="col-span-2 font-label-code text-[#00dbe7]">{row.nodeId}</div>
                    <div className="col-span-2 text-[#b9ccb2] font-semibold text-[11px] truncate" title={row.eventType}>{row.eventType}</div>
                    <div className="col-span-3 text-[#e5e2e1] truncate group-hover:whitespace-normal" title={row.message}>
                      {row.message}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center font-label-code text-[#b9ccb2] opacity-40 text-xs">
                  NO ALERTS FOUND MATCHING THE CONFIGURATION
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Right Section: Metric Cards */}
        <aside className="w-80 flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar">
          
          {/* Metric Box 1: Anomalies */}
          <div className="flex-1 bg-[#1c1b1b] border border-[#3b4b37] corner-bracket p-4 flex flex-col justify-center relative overflow-hidden group hover:bg-[#353534]/30 transition-all duration-300 min-h-[140px] rounded-sm">
            <div className="scanline absolute inset-0 opacity-10 pointer-events-none"></div>
            <div className="flex justify-between items-center mb-2">
              <span className="font-label-code text-[#00e639] text-[10px] font-bold">CRIT_ANOMALY_INDEX</span>
              <span className="material-symbols-outlined text-error animate-pulse text-lg">warning</span>
            </div>
            <div className="text-[48px] font-display-tech text-error leading-none mb-1 font-bold">
              {String(activeAnomalies).padStart(2, "0")}
            </div>
            <div className="font-label-code text-[9px] text-[#b9ccb2] uppercase tracking-widest">Active System Breaches</div>
            <div className="mt-4 pt-2 border-t border-[#3b4b37]/40 flex justify-between text-[10px] font-label-code text-[#b9ccb2]">
              <span>THREAT_LVL</span>
              <span className="text-error font-bold">SEVERE</span>
            </div>
          </div>

          {/* Metric Box 2: Node Saturation */}
          <div className="flex-1 bg-[#1c1b1b] border border-[#3b4b37] corner-bracket p-4 flex flex-col justify-center relative overflow-hidden group hover:bg-[#353534]/30 transition-all duration-300 min-h-[140px] rounded-sm">
            <div className="scanline absolute inset-0 opacity-10 pointer-events-none"></div>
            <div className="flex justify-between items-center mb-2">
              <span className="font-label-code text-[#00e639] text-[10px] font-bold">NODE_SATURATION</span>
              <span className="material-symbols-outlined text-[#00f1fe] text-lg">speed</span>
            </div>
            <div className="text-[48px] font-display-tech text-[#00f1fe] leading-none mb-1 font-bold">{peakLoad}%</div>
            <div className="font-label-code text-[9px] text-[#b9ccb2] uppercase tracking-widest">Aggregate Peak Load</div>
            <div className="mt-4 pt-2 border-t border-[#3b4b37]/40 flex gap-0.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div 
                  key={i} 
                  className={`h-1.5 flex-1 transition-all duration-300 ${i < 9 ? "bg-[#00f1fe]" : "bg-[#2a2a2a]"}`}
                ></div>
              ))}
            </div>
          </div>

          {/* Metric Box 3: Data Flux */}
          <div className="flex-1 bg-[#1c1b1b] border border-[#3b4b37] corner-bracket p-4 flex flex-col justify-center relative overflow-hidden group hover:bg-[#353534]/30 transition-all duration-300 min-h-[140px] rounded-sm">
            <div className="scanline absolute inset-0 opacity-10 pointer-events-none"></div>
            <div className="flex justify-between items-center mb-2">
              <span className="font-label-code text-[#00e639] text-[10px] font-bold">TELEMETRY_FLUX</span>
              <span className="material-symbols-outlined text-[#00e639] text-lg">query_stats</span>
            </div>
            <div className="text-[48px] font-display-tech text-[#00e639] leading-none mb-1 font-bold">
              1.4 <span className="text-[20px] font-semibold">PB</span>
            </div>
            <div className="font-label-code text-[9px] text-[#b9ccb2] uppercase tracking-widest">Pipeline Throughput / 24H</div>
            <div className="mt-4 flex gap-1 items-end h-8">
              <div className="w-2 bg-[#00e639]/40 h-1/2 rounded-t"></div>
              <div className="w-2 bg-[#00e639]/60 h-2/3 rounded-t"></div>
              <div className="w-2 bg-[#00e639] h-full rounded-t animate-pulse"></div>
              <div className="w-2 bg-[#00e639]/80 h-3/4 rounded-t"></div>
              <div className="w-2 bg-[#00e639]/40 h-1/3 rounded-t"></div>
              <div className="w-2 bg-[#00e639]/60 h-1/2 rounded-t"></div>
              <div className="w-2 bg-[#00e639]/90 h-[90%] rounded-t"></div>
            </div>
          </div>
        </aside>

      </div>
    </div>
  );
}
