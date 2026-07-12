"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";
import { TerminalLoadingState } from "@/components/TerminalLoadingState";

interface WorkerNode {
  node_id: string;
  status: "ONLINE" | "OFFLINE";
  last_heartbeat: string;
  goroutine_count?: number;
  mem_alloc_bytes?: number;
  gc_pause_ns?: number;
  started_at: string;
}

interface AlertRow {
  occurred_at: string;
  severity: string;
}

export default function ClusterHealth() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [nodes, setNodes] = useState<WorkerNode[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [repolling, setRepolling] = useState(false);

  // Load token
  useEffect(() => {
    const t = localStorage.getItem("session_token");
    if (!t) {
      router.push("/login");
      return;
    }
    setToken(t);
  }, [router]);

  // Fetch nodes
  const fetchNodes = useCallback(async (isManual = false) => {
    if (!token) return;
    if (isManual) setRepolling(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/cluster/nodes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNodes(data.nodes ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch cluster nodes", err);
    } finally {
      setLoading(false);
      setRepolling(false);
    }
  }, [token]);

  // Fetch alerts for heatmap
  const fetchAlerts = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/alerts?limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch alerts for heatmap", err);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchNodes();
      fetchAlerts();
      const interval = setInterval(() => {
        fetchNodes();
        fetchAlerts();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [token, fetchNodes, fetchAlerts]);

  // 60 columns (minutes) x 20 rows
  const cols = 60;
  const rows = 20;
  const heatmap = Array.from({ length: cols * rows }).map(() => 0);

  // Map alerts to heatmap matrix
  alerts.forEach(alert => {
    const diffMs = Date.now() - new Date(alert.occurred_at).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin >= 0 && diffMin < cols) {
      const col = cols - 1 - diffMin; // 0 is 59 mins ago, 59 is now
      // Row by severity: ERROR -> 0..4, WARNING -> 5..9, INFO -> 10..14, SYS -> 15..19
      let rowStart = 15;
      let range = 5;
      if (alert.severity === "ERROR") {
        rowStart = 0;
      } else if (alert.severity === "WARNING") {
        rowStart = 5;
      } else if (alert.severity === "INFO") {
        rowStart = 10;
      }
      const row = rowStart + (Math.abs(alert.occurred_at.charCodeAt(0) || 0) % range);
      const idx = row * cols + col;
      if (idx >= 0 && idx < heatmap.length) {
        heatmap[idx] = alert.severity === "ERROR" ? 5 : alert.severity === "WARNING" ? 3 : 2;
      }
    }
  });

  const getHeatColorClass = (level: number) => {
    switch (level) {
      case 5: return "bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.5)]";
      case 3: return "bg-yellow-500 shadow-[0_0_4px_rgba(234,179,8,0.5)]";
      case 2: return "bg-[#00f1fe] shadow-[0_0_4px_rgba(0,241,254,0.5)]";
      default: return "bg-[#1c1b1b]";
    }
  };

  const handleManualRefresh = () => {
    fetchNodes(true);
    fetchAlerts();
  };

  if (loading) {
    return (
      <div className="bg-[#0A0A0A] text-[#e5e2e1] min-h-screen flex items-center justify-center">
        <TerminalLoadingState label="POLLING CLUSTER NODES..." />
      </div>
    );
  }

  // Display grid of 8 slots
  const totalSlots = 8;
  const filledSlots = nodes.slice(0, totalSlots);
  const emptySlotsCount = totalSlots - filledSlots.length;

  return (
    <div className="bg-[#0A0A0A] text-[#e5e2e1] font-body-mono selection:bg-primary-container selection:text-on-primary-container min-h-screen flex flex-col">
      <div className="fixed inset-0 scanline-overlay z-50 pointer-events-none opacity-20"></div>

      <div className="p-6 min-h-screen bg-[#0A0A0A]">
        {/* Header */}
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="font-display-tech text-[32px] font-bold uppercase tracking-tighter">Cluster Resource Health</h1>
            <p className="font-label-code text-[#00e639] opacity-80 mt-1 text-[10px]">
              REAL-TIME TELEMETRY // ACTIVE NODES: {nodes.filter(n => n.status === "ONLINE").length} / {nodes.length}
            </p>
          </div>
          <div>
            <button
              onClick={handleManualRefresh}
              disabled={repolling}
              className="bg-[#00ff41]/10 border border-[#00ff41] text-[#00ff41] px-6 py-2 font-label-code tracking-widest flex items-center gap-2 hover:bg-[#00ff41]/20 active:scale-95 transition-all text-xs font-bold disabled:opacity-50 cursor-pointer"
            >
              <span className={`material-symbols-outlined text-sm ${repolling ? "animate-spin" : ""}`}>
                refresh
              </span>
              REFRESH_NODES
            </button>
          </div>
        </div>

        {/* 8 Server Nodes Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Real provisioned nodes */}
          {filledSlots.map((node) => {
            const isOnline = node.status === "ONLINE";
            const goroutines = node.goroutine_count ?? 0;
            // CPU proxy: map goroutine threshold (default 16384) to percentage
            const cpuLoad = Math.min(100, Math.round((goroutines / 16384) * 100));
            // Mem % proxy: mem_alloc_bytes vs 512MB RAM cap
            const memAllocBytes = node.mem_alloc_bytes ?? 0;
            const memPercent = Math.min(100, Math.round((memAllocBytes / (512 * 1024 * 1024)) * 100));
            const gcLatencyMs = (node.gc_pause_ns ?? 0) / 1000000;

            return (
              <div
                key={node.node_id}
                className={`node-card bg-[#201f1f]/60 backdrop-blur-md border p-4 relative group rounded-sm transition-all ${
                  isOnline ? "border-[#3b4b37]" : "border-red-950 opacity-60"
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="truncate max-w-[70%]">
                    <div className="font-label-code text-[#b9ccb2] opacity-60 text-[9px] truncate">
                      ID: {node.node_id.slice(0, 12)}
                    </div>
                    <div className="font-display-tech text-[18px] text-[#00e639] font-bold truncate">
                      {node.node_id}
                    </div>
                  </div>
                  <div className={`px-2 py-0.5 border text-[9px] font-label-code ${
                    isOnline
                      ? "bg-[#72ff70]/10 border-[#72ff70]/30 text-[#72ff70]"
                      : "bg-[#2a0a0a]/20 border-red-500/30 text-red-400"
                  }`}>
                    {node.status}
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-4">
                    {/* GOROUTINE Load bar */}
                    <div className="border border-[#3b4b37] p-3 relative bg-black/20 rounded-sm">
                      <div className="flex justify-between items-center text-[10px] font-label-code mb-1.5">
                        <span className="opacity-50">GOROUTINE LOAD</span>
                        <span className={`font-bold ${isOnline ? "text-[#00e639]" : "text-red-400"}`}>
                          {goroutines}
                        </span>
                      </div>
                      <div className="h-3 bg-[#353534]/50 border border-[#3b4b37]/40 w-full flex overflow-hidden p-[2px] rounded-sm">
                        {Array.from({ length: 15 }).map((_, idx) => (
                          <div
                            key={idx}
                            className={`h-full flex-grow mx-[1px] transition-colors duration-300 ${
                              idx < Math.ceil(cpuLoad / 6.67)
                                ? isOnline
                                  ? "bg-[#00e639] shadow-[0_0_5px_#00ff41]"
                                  : "bg-red-500"
                                : "bg-[#1c1b1b]"
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    {/* MEM ALLOC bar */}
                    <div className="border border-[#3b4b37] p-3 relative bg-black/20 rounded-sm">
                      <div className="flex justify-between items-center text-[10px] font-label-code mb-1.5">
                        <span className="opacity-50">MEM ALLOC</span>
                        <span className="font-bold text-[#00f1fe]">
                          {(memAllocBytes / (1024 * 1024)).toFixed(1)} MB ({memPercent}%)
                        </span>
                      </div>
                      <div className="h-3 bg-[#353534]/50 border border-[#3b4b37]/40 w-full flex overflow-hidden p-[2px] rounded-sm">
                        {Array.from({ length: 15 }).map((_, idx) => (
                          <div
                            key={idx}
                            className={`h-full flex-grow mx-[1px] transition-colors duration-300 ${
                              idx < Math.ceil(memPercent / 6.67)
                                ? "bg-[#00f1fe] shadow-[0_0_5px_#00f1fe]"
                                : "bg-[#1c1b1b]"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-[10px] font-label-code">
                      <span className="opacity-50">START TIME</span>
                      <span className="text-[#b9ccb2]">
                        {new Date(node.started_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-label-code">
                      <span className="opacity-50">GC LATENCY</span>
                      <span className={gcLatencyMs > 5.0 ? "text-red-400 font-bold" : "text-[#72ff70]"}>
                        {gcLatencyMs.toFixed(3)} ms
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Empty slot indicators */}
          {nodes.length === 0 ? (
            Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={`empty-${idx}`}
                className="bg-[#1c1b1b]/20 border border-[#3b4b37]/20 p-6 flex flex-col items-center justify-center h-52 text-center opacity-30 select-none rounded-sm border-dashed"
              >
                <span className="material-symbols-outlined text-[32px] mb-2 text-[#84967e]">
                  sensors_off
                </span>
                <div className="font-label-code text-[10px] text-[#84967e] uppercase tracking-wider">
                  AWAITING TELEMETRY...
                </div>
              </div>
            ))
          ) : (
            Array.from({ length: emptySlotsCount }).map((_, idx) => (
              <div
                key={`not-prov-${idx}`}
                className="bg-[#1c1b1b]/10 border border-[#3b4b37]/20 p-6 flex flex-col items-center justify-center h-52 text-center opacity-25 select-none rounded-sm"
              >
                <span className="material-symbols-outlined text-[24px] mb-1.5 text-[#84967e]">
                  grid_3x3
                </span>
                <div className="font-label-code text-[9px] text-[#84967e] uppercase tracking-wider">
                  [ SLOT {filledSlots.length + idx + 1}: NOT PROVISIONED ]
                </div>
              </div>
            ))
          )}
        </div>

        {/* Job Processing Heatmap Matrix */}
        <section className="mt-8 bg-[#1c1b1b]/40 backdrop-blur-md border border-[#3b4b37] p-6 relative overflow-hidden rounded-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="font-display-tech text-[20px] font-bold uppercase tracking-tighter text-[#00f1fe] flex items-center gap-2">
                <span className="material-symbols-outlined">grid_view</span>
                Job Processing Heatmap Matrix
              </h2>
              <p className="font-label-code text-[#b9ccb2] text-[10px] opacity-60">
                DISTRIBUTED PROCESSING SECTOR ANALYSIS // LAST 1 HOUR METRIC PLOT
              </p>
            </div>
            <div className="flex items-center gap-4 font-label-code text-[8px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-[#1c1b1b]"></span> <span>IDLE</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-[#00f1fe] shadow-[0_0_3px_#00f1fe]"></span> <span>INFO</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-yellow-500 shadow-[0_0_3px_#eab308]"></span> <span>WARN</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-red-500 shadow-[0_0_3px_#ef4444]"></span> <span>ERROR</span>
              </div>
            </div>
          </div>

          <div className="relative">
            {/* Y-Axis Labels */}
            <div className="absolute -left-10 top-0 bottom-8 flex flex-col justify-between font-label-code text-[8px] opacity-40">
              <span>CRIT</span><span>WARN</span><span>INFO</span><span>SYS</span>
            </div>

            {/* Heatmap Grid */}
            <div className="heatmap-grid border-l border-b border-[#3b4b37]/30 pb-2 pl-2 grid grid-cols-60 gap-[2px]">
              {heatmap.map((level, i) => (
                <div
                  key={i}
                  className={`aspect-square w-full rounded-[1px] transition-all duration-300 ${getHeatColorClass(level)}`}
                />
              ))}
            </div>

            {/* X-Axis Labels */}
            <div className="flex justify-between mt-2 ml-2 font-label-code text-[8px] opacity-40">
              <span>60 mins ago</span>
              <span>45 mins ago</span>
              <span>30 mins ago</span>
              <span>15 mins ago</span>
              <span>Now</span>
            </div>
            <div className="text-center mt-2 font-label-code text-[9px] opacity-40 tracking-widest uppercase">
              Time Ingestion Coordinates (x, y)
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
