"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

interface TransactionRow {
  timestamp: string;
  table: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  payload: string;
}

export default function LiveCdc() {
  const [rows, setRows] = useState<TransactionRow[]>([
    { timestamp: "2026-06-13 11:24:47.833", table: "transactions_v2", action: "INSERT", payload: '{ "uuid": "nkfeojf9m", "v": 51, "amount": 204.5 }' },
    { timestamp: "2026-06-13 11:24:46.340", table: "transactions_v2", action: "UPDATE", payload: '{ "uuid": "vmnnqk6rl", "v": 59, "status": "verified" }' },
    { timestamp: "2026-06-13 11:24:44.830", table: "metadata_kv", action: "INSERT", payload: '{ "uuid": "fdfblhdyc", "v": 61, "key": "ip_addr" }' },
    { timestamp: "2026-06-13 11:24:43.338", table: "billing_events", action: "DELETE", payload: '{ "uuid": "xrcwon0k5", "v": 90, "user_id": 8080 }' },
    { timestamp: "2026-06-13 11:24:41.833", table: "billing_events", action: "DELETE", payload: '{ "uuid": "l74ze27xr", "v": 11, "invoice": 4410 }' },
    { timestamp: "2026-06-13 11:24:40.338", table: "audit_log", action: "DELETE", payload: '{ "uuid": "phfv72jdx", "v": 47, "event": "logout" }' },
    { timestamp: "2026-06-13 11:24:38.840", table: "user_sessions", action: "DELETE", payload: '{ "uuid": "3d48ktvkt", "v": 36, "duration": 140 }' }
  ]);
  const [ingestionRate, setIngestionRate] = useState(14250);
  const [goroutines, setGoroutines] = useState(3);
  const [saturation, setSaturation] = useState(12);

  // Prepend live log row every 2 seconds
  useEffect(() => {
    const tableNames = ["transactions_v2", "metadata_kv", "billing_events", "audit_log", "user_sessions"];
    const actions = ["INSERT", "UPDATE", "DELETE"] as const;
    
    const interval = setInterval(() => {
      const now = new Date();
      const timeStr = now.toISOString().replace("T", " ").substring(0, 23);
      const tbl = tableNames[Math.floor(Math.random() * tableNames.length)];
      const act = actions[Math.floor(Math.random() * actions.length)];
      
      const val = Math.floor(Math.random() * 100);
      const uuid = Math.random().toString(36).substring(2, 11);
      const payloadStr = act === "INSERT" 
        ? `{ "uuid": "${uuid}", "v": ${val}, "status": "active" }`
        : act === "UPDATE"
        ? `{ "uuid": "${uuid}", "v": ${val}, "prev_v": ${val - 3} }`
        : `{ "uuid": "${uuid}", "v": ${val} }`;

      setRows(prev => [
        { timestamp: timeStr, table: tbl, action: act, payload: payloadStr },
        ...prev
      ].slice(0, 30)); // Limit to last 30 rows

      // Randomly update metrics slightly
      setIngestionRate(rate => Math.max(13000, Math.min(15500, rate + Math.floor((Math.random() - 0.5) * 500))));
      setGoroutines(go => Math.max(2, Math.min(5, go + (Math.random() > 0.8 ? 1 : Math.random() > 0.8 ? -1 : 0))));
      setSaturation(sat => Math.max(5, Math.min(25, sat + Math.floor((Math.random() - 0.5) * 4))));
    }, 1800);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-[#0A0A0A] text-[#e5e2e1] font-body-mono selection:bg-[#00ff41]/20 selection:text-[#00ff41] min-h-screen flex flex-col">
      {/* Main Content Area */}
      <div className="min-h-screen overflow-hidden flex flex-col bg-[#0A0A0A]">
        
        {/* Top Telemetry Strip */}
        <div className="px-6 py-2 bg-[#1c1b1b] border-b border-[#3b4b37]/30 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-[#00e639] rounded-full animate-ping"></span>
              <span className="font-label-code text-[#00e639] text-[10px]">CLUSTER: ACTIVE</span>
            </div>
            <div className="font-label-code text-[10px] text-[#b9ccb2]">REGION: <span className="text-white">US-WEST-2</span></div>
            <div className="font-label-code text-[10px] text-[#b9ccb2]">UPTIME: <span className="text-white">14D 08H 22M</span></div>
          </div>
          <div className="font-label-code text-[10px] text-[#00dbe7] animate-pulse">STREAMING LIVE_DATA_TX...</div>
        </div>

        {/* Performance Metric Cluster */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-6 py-4">
          {/* Ingestion Rate */}
          <div className="bg-[#201f1f]/80 backdrop-blur-md border border-[#3b4b37] p-4 tactical-bracket relative">
            <div className="font-label-code text-[#b9ccb2] text-[10px] mb-1">INGESTION RATE</div>
            <div className="flex items-baseline gap-2">
              <span className="font-display-tech text-[24px] text-[#00e639]">{ingestionRate.toLocaleString()}</span>
              <span className="font-label-code text-[10px] text-[#b9ccb2]">ROWS/SEC</span>
            </div>
            <div className="mt-2 h-1 bg-[#353534]/50 overflow-hidden">
              <div className="h-full bg-[#00e639] transition-all duration-500" style={{ width: `${(ingestionRate / 16000) * 100}%` }}></div>
            </div>
          </div>

          {/* Active Coroutines */}
          <div className="bg-[#201f1f]/80 backdrop-blur-md border border-[#3b4b37] p-4 tactical-bracket relative">
            <div className="font-label-code text-[#b9ccb2] text-[10px] mb-1">ACTIVE COROUTINES</div>
            <div className="flex items-baseline gap-2">
              <span className="font-display-tech text-[24px] text-[#00dbe7]">{goroutines}</span>
              <span className="font-label-code text-[10px] text-[#b9ccb2]">GOROUTINES</span>
            </div>
            <div className="mt-2 flex gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div 
                  key={i} 
                  className={`h-1 flex-1 transition-all duration-300 ${i < goroutines ? "bg-[#00dbe7]" : "bg-[#353534]/50"}`}
                ></div>
              ))}
            </div>
          </div>

          {/* Channel Saturation */}
          <div className="bg-[#201f1f]/80 backdrop-blur-md border border-[#3b4b37] p-4 tactical-bracket relative">
            <div className="font-label-code text-[#b9ccb2] text-[10px] mb-1">CHANNEL SATURATION</div>
            <div className="flex items-baseline gap-2">
              <span className={`font-display-tech text-[24px] ${saturation > 20 ? "text-error" : "text-[#74f5ff]"}`}>{saturation}%</span>
              <span className="font-label-code text-[10px] text-[#b9ccb2]">SATURATION</span>
            </div>
            <div className="mt-2 h-1 bg-[#353534]/50 overflow-hidden flex gap-0.5">
              <div 
                className={`h-full transition-all duration-500 ${saturation > 20 ? "bg-error" : "bg-[#74f5ff]"}`} 
                style={{ width: `${saturation}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Layout 70/30 Split */}
        <div className="flex-1 flex flex-col md:flex-row gap-4 px-6 pb-4 overflow-hidden">
          {/* Left Wide Panel: logs table */}
          <div className="flex-[7] bg-[#0e0e0e] border border-[#3b4b37] flex flex-col overflow-hidden relative rounded-sm">
            <div className="scanline-overlay absolute inset-0 z-0 pointer-events-none opacity-20"></div>
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#3b4b37] bg-[#2a2a2a]/50 z-10">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[14px] text-[#00e639]">terminal</span>
                <span className="font-label-code text-[10px] text-[#00e639]">live_cdc_stream.log</span>
              </div>
              <div className="flex gap-1.5">
                <span className="w-2 h-2 rounded-full bg-error/40"></span>
                <span className="w-2 h-2 rounded-full bg-[#00dbe7]/40"></span>
                <span className="w-2 h-2 rounded-full bg-[#00e639]/40"></span>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto p-4 z-10 custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[#0e0e0e] border-b border-[#3b4b37]/30 z-20">
                  <tr>
                    <th className="py-2 font-label-code text-[10px] text-[#b9ccb2] tracking-wider">TIMESTAMP</th>
                    <th className="py-2 font-label-code text-[10px] text-[#b9ccb2] tracking-wider">SOURCE_TABLE</th>
                    <th className="py-2 font-label-code text-[10px] text-[#b9ccb2] tracking-wider text-center">ACTION</th>
                    <th className="py-2 font-label-code text-[10px] text-[#b9ccb2] tracking-wider">PAYLOAD_SNAPSHOT</th>
                  </tr>
                </thead>
                <tbody className="font-body-mono-sm text-[12px] text-[#e5e2e1]/80 divide-y divide-[#3b4b37]/10">
                  {rows.map((row, i) => (
                    <tr key={i} className="hover:bg-[#353534]/20 transition-colors">
                      <td className="py-2 text-[#00e639] whitespace-nowrap pr-4">{row.timestamp}</td>
                      <td className="py-2 pr-4">{row.table}</td>
                      <td className="py-2 pr-4 text-center">
                        <span className={`px-2 py-0.5 font-bold text-[8px] rounded-none ${
                          row.action === "INSERT" ? "bg-primary-container/20 text-[#00ff41]" :
                          row.action === "UPDATE" ? "bg-secondary-container/20 text-[#00f1fe]" :
                          "bg-error-container/20 text-error"
                        }`}>
                          {row.action}
                        </span>
                      </td>
                      <td className="py-2 font-body-mono-sm opacity-60 truncate max-w-[200px] lg:max-w-md" title={row.payload}>
                        {row.payload}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Panel: Side Stats */}
          <div className="flex-[3] flex flex-col gap-4 overflow-y-auto custom-scrollbar">
            {/* Topologies */}
            <div className="bg-[#201f1f]/80 border border-[#3b4b37] p-4 tactical-bracket relative rounded-sm">
              <div className="font-label-code text-[10px] text-[#00e639] mb-2">ROUTING_TARGETS</div>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="opacity-50">BigQuery Storage Shard</span>
                  <span className="text-[#00e639] font-bold">READY</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="opacity-50">Elasticsearch Index</span>
                  <span className="text-[#00e639] font-bold">SYNCING</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="opacity-50">PubSub Topic</span>
                  <span className="text-[#00f1fe] font-bold">BUFFERING</span>
                </div>
              </div>
            </div>

            {/* Performance Graphic */}
            <div className="bg-[#201f1f]/80 border border-[#3b4b37] p-4 tactical-bracket relative rounded-sm flex-1 flex flex-col justify-between">
              <div className="font-label-code text-[10px] text-[#00dbe7] mb-2 uppercase">Thread logs count</div>
              <div className="flex items-end gap-1.5 h-32 pt-4 justify-around">
                <div className="w-3 bg-[#00e639]/50 h-[40%] rounded-t"></div>
                <div className="w-3 bg-[#00e639]/70 h-[65%] rounded-t"></div>
                <div className="w-3 bg-[#00e639] h-[85%] rounded-t"></div>
                <div className="w-3 bg-[#00f1fe] h-[55%] rounded-t"></div>
                <div className="w-3 bg-error/80 h-[30%] rounded-t"></div>
              </div>
              <div className="text-center font-label-code text-[9px] text-[#b9ccb2] mt-4 uppercase">
                ACTIVE QUEUE WORKERS: 12
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
