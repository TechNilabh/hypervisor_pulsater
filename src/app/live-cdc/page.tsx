"use client";

import React, { useState, useEffect, useRef } from "react";
import { useContainerStream, ContainerState } from "@/hooks/useContainerStream";
import { useRouter } from "next/navigation";
import { TerminalLoadingState } from "@/components/TerminalLoadingState";

// ── Types ──────────────────────────────────────────────────────────────────────

interface CdcRow {
  key: string;
  timestamp: string;
  container: string;       // callsign_alias (or short container_id)
  source: string;          // from_state → to_state label
  action: string;          // severity label
  snapshot: string;        // detail summary
  severity: "INFO" | "WARNING" | "ERROR" | "SYS";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toAction(from: string, to: string): string {
  if (to === "PROCESSING") return "PROCESSING";
  if (to === "SYNCED")     return "SYNCED";
  if (to === "FAILED")     return "FAILED";
  if (to === "INITIALIZED") return "INIT";
  if (to === "QUEUED")     return "REQUEUED";
  return to || "EVENT";
}

function toActionColor(to: string): string {
  if (to === "SYNCED")   return "bg-[#0a1f0a] border border-[#72ff70]/30 text-[#72ff70]";
  if (to === "FAILED")   return "bg-[#2a0a0a] border border-red-500/30 text-red-400";
  if (to === "PROCESSING") return "bg-[#0d2a38] border border-[#00f1fe]/30 text-[#00f1fe]";
  return "bg-[#1c1b1b] border border-[#3b4b37]/40 text-[#b9ccb2]";
}

function toSeverityColor(to: string): "INFO" | "WARNING" | "ERROR" | "SYS" {
  if (to === "FAILED")     return "ERROR";
  if (to === "PROCESSING") return "INFO";
  if (to === "SYNCED")     return "INFO";
  return "SYS";
}

function parseSnapshot(detail: string | undefined): string {
  if (!detail) return "—";
  try {
    const parsed = typeof detail === "string" ? JSON.parse(detail) : detail;
    if (parsed.error)  return `err: ${parsed.error}`;
    if (parsed.step)   return `step: ${parsed.step}`;
    if (parsed.source) return `src: ${parsed.source}`;
    if (parsed.retry_in_sec) return `retry in ${parsed.retry_in_sec}s`;
    return JSON.stringify(parsed).slice(0, 60);
  } catch {
    return String(detail).slice(0, 60);
  }
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function eventToRow(e: ContainerState): CdcRow {
  return {
    key: `${e.container_id}-${e.to_state}-${e.occurred_at}`,
    timestamp: fmtTime(e.occurred_at),
    container: e.callsign_alias || e.container_id.slice(0, 10),
    source: `${e.from_state || "—"} → ${e.to_state}`,
    action: toAction(e.from_state ?? "", e.to_state),
    snapshot: parseSnapshot(e.detail),
    severity: toSeverityColor(e.to_state),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LiveCdc() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("session_token");
    if (!t) { router.push("/login"); return; }
    setToken(t);
  }, [router]);

  const { containers: liveMap, connected, error: sseError } = useContainerStream(token);

  const [rows, setRows] = useState<CdcRow[]>([]);
  const seenKeys = useRef(new Set<string>());

  useEffect(() => {
    const handler = (e: Event) => {
      const update = (e as CustomEvent<ContainerState>).detail;
      const row = eventToRow(update);
      if (seenKeys.current.has(row.key)) return;
      seenKeys.current.add(row.key);
      setRows(prev => [row, ...prev].slice(0, 50));
    };
    window.addEventListener("containerStatusUpdated", handler);
    return () => window.removeEventListener("containerStatusUpdated", handler);
  }, []);

  const totalEvents    = rows.length;
  const activeContainers = [...liveMap.values()].filter(
    s => s.to_state !== "SYNCED" && s.to_state !== "FAILED"
  ).length;
  const failedCount = rows.filter(r => r.severity === "ERROR").length;

  const byState: Record<string, number> = { INITIALIZED: 0, PROCESSING: 0, SYNCED: 0, FAILED: 0 };
  [...liveMap.values()].forEach(s => { if (byState[s.to_state] !== undefined) byState[s.to_state]++; });
  const total = Math.max(1, [...liveMap.values()].length);

  return (
    <div className="bg-[#0A0A0A] text-[#e5e2e1] font-body-mono selection:bg-[#00ff41]/20 selection:text-[#00ff41] min-h-screen flex flex-col">
      <div className="min-h-screen overflow-hidden flex flex-col bg-[#0A0A0A]">

        {/* Top Telemetry Strip */}
        <div className="px-6 py-2 bg-[#1c1b1b] border-b border-[#3b4b37]/30 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${connected ? "bg-[#00e639] animate-ping" : "bg-red-500 animate-pulse"}`} />
              <span className={`font-label-code text-[10px] ${connected ? "text-[#00e639]" : "text-red-400"}`}>
                {connected ? "STREAM: ACTIVE" : sseError ? `STREAM: ${sseError.toUpperCase()}` : "STREAM: CONNECTING"}
              </span>
            </div>
          </div>
          <div className="font-label-code text-[10px] text-[#00dbe7] animate-pulse">
            {connected ? "STREAMING LIVE_EVENTS..." : "TELEMETRY PAUSED"}
          </div>
        </div>

        {/* Performance Metric Cluster */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-6 py-4">
          {/* Total Events */}
          <div className="bg-[#201f1f]/80 backdrop-blur-md border border-[#3b4b37] p-4 tactical-bracket relative">
            <div className="font-label-code text-[#b9ccb2] text-[10px] mb-1">TOTAL EVENTS (SESSION)</div>
            <div className="flex items-baseline gap-2">
              <span className="font-display-tech text-[24px] text-[#00e639]">{totalEvents.toLocaleString()}</span>
              <span className="font-label-code text-[10px] text-[#b9ccb2]">EVENTS</span>
            </div>
            <div className="mt-2 h-1 bg-[#353534]/50 overflow-hidden">
              <div className="h-full bg-[#00e639] transition-all duration-500" style={{ width: `${Math.min(100, (totalEvents / 50) * 100)}%` }} />
            </div>
          </div>

          {/* Active Containers */}
          <div className="bg-[#201f1f]/80 backdrop-blur-md border border-[#3b4b37] p-4 tactical-bracket relative">
            <div className="font-label-code text-[#b9ccb2] text-[10px] mb-1">ACTIVE CONTAINERS</div>
            <div className="flex items-baseline gap-2">
              <span className="font-display-tech text-[24px] text-[#00dbe7]">{activeContainers}</span>
              <span className="font-label-code text-[10px] text-[#b9ccb2]">IN-FLIGHT</span>
            </div>
            <div className="mt-2 flex gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={`h-1 flex-1 transition-all duration-300 ${i < activeContainers ? "bg-[#00dbe7]" : "bg-[#353534]/50"}`} />
              ))}
            </div>
          </div>

          {/* Failed Count */}
          <div className="bg-[#201f1f]/80 backdrop-blur-md border border-[#3b4b37] p-4 tactical-bracket relative">
            <div className="font-label-code text-[#b9ccb2] text-[10px] mb-1">FAILED EVENTS</div>
            <div className="flex items-baseline gap-2">
              <span className={`font-display-tech text-[24px] ${failedCount > 0 ? "text-red-400" : "text-[#74f5ff]"}`}>
                {failedCount}
              </span>
              <span className="font-label-code text-[10px] text-[#b9ccb2]">ERRORS</span>
            </div>
            <div className="mt-2 h-1 bg-[#353534]/50 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${failedCount > 0 ? "bg-red-400" : "bg-[#74f5ff]"}`}
                style={{ width: `${totalEvents > 0 ? (failedCount / totalEvents) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* Layout 70/30 Split */}
        <div className="flex-1 flex flex-col md:flex-row gap-4 px-6 pb-4 overflow-hidden">
          {/* Left Wide Panel: event log table */}
          <div className="flex-[7] bg-[#0e0e0e] border border-[#3b4b37] flex flex-col overflow-hidden relative rounded-sm">
            <div className="scanline-overlay absolute inset-0 z-0 pointer-events-none opacity-20" />
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#3b4b37] bg-[#2a2a2a]/50 z-10">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[14px] text-[#00e639]">terminal</span>
                <span className="font-label-code text-[10px] text-[#00e639]">live_cdc_stream.log</span>
              </div>
              <div className="flex gap-1.5">
                <span className="w-2 h-2 rounded-full bg-error/40" />
                <span className="w-2 h-2 rounded-full bg-[#00dbe7]/40" />
                <span className="w-2 h-2 rounded-full bg-[#00e639]/40" />
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 z-10 custom-scrollbar">
              {!connected && rows.length === 0 ? (
                <TerminalLoadingState label="CONNECTING TO CDC STREAM..." />
              ) : rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <span className="material-symbols-outlined text-[48px] text-[#3b4b37]">stream</span>
                  <span className="font-label-code text-[10px] text-[#84967e] uppercase">
                    NO CDC ACTIVITY YET — upload a payload or deploy a node to begin
                  </span>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-[#0e0e0e] border-b border-[#3b4b37]/30 z-20">
                    <tr>
                      <th className="py-2 font-label-code text-[10px] text-[#b9ccb2] tracking-wider">TIMESTAMP</th>
                      <th className="py-2 font-label-code text-[10px] text-[#b9ccb2] tracking-wider">CONTAINER</th>
                      <th className="py-2 font-label-code text-[10px] text-[#b9ccb2] tracking-wider hidden sm:table-cell">SOURCE</th>
                      <th className="py-2 font-label-code text-[10px] text-[#b9ccb2] tracking-wider text-center">ACTION</th>
                      <th className="py-2 font-label-code text-[10px] text-[#b9ccb2] tracking-wider hidden lg:table-cell">SNAPSHOT</th>
                    </tr>
                  </thead>
                  <tbody className="font-body-mono-sm text-[12px] text-[#e5e2e1]/80 divide-y divide-[#3b4b37]/10">
                    {rows.map((row) => (
                      <tr key={row.key} className="hover:bg-[#353534]/20 transition-colors">
                        <td className="py-2 text-[#00e639] whitespace-nowrap pr-4">{row.timestamp}</td>
                        <td className="py-2 pr-4 truncate max-w-[100px] font-bold">{row.container}</td>
                        <td className="py-2 pr-4 opacity-50 hidden sm:table-cell truncate max-w-[120px]">{row.source}</td>
                        <td className="py-2 pr-4 text-center">
                          <span className={`px-2 py-0.5 font-bold text-[8px] rounded-none ${toActionColor(row.action)}`}>
                            {row.action}
                          </span>
                        </td>
                        <td className="py-2 font-body-mono-sm opacity-60 truncate max-w-[200px] lg:max-w-md hidden lg:table-cell" title={row.snapshot}>
                          {row.snapshot}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Right Panel: Side Stats */}
          <div className="flex-[3] flex flex-col gap-4 overflow-y-auto custom-scrollbar">
            <div className="bg-[#201f1f]/80 border border-[#3b4b37] p-4 tactical-bracket relative rounded-sm">
              <div className="font-label-code text-[10px] text-[#00e639] mb-3">CONTAINER_STATES</div>
              <div className="space-y-2">
                {(["INITIALIZED", "PROCESSING", "SYNCED", "FAILED"] as const).map(state => {
                  const count = byState[state] ?? 0;
                  const pct = Math.round((count / total) * 100);
                  const color = state === "SYNCED" ? "#72ff70" : state === "FAILED" ? "#f87171" : state === "PROCESSING" ? "#00f1fe" : "#b9ccb2";
                  return (
                    <div key={state}>
                      <div className="flex justify-between items-center text-xs mb-1">
                        <span className="opacity-60 font-label-code text-[9px]">{state}</span>
                        <span className="font-bold" style={{ color }}>{count}</span>
                      </div>
                      <div className="h-1 bg-[#353534]/50 overflow-hidden">
                        <div className="h-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-[#201f1f]/80 border border-[#3b4b37] p-4 tactical-bracket relative rounded-sm flex-1 flex flex-col justify-between">
              <div className="font-label-code text-[10px] text-[#00dbe7] mb-2 uppercase">Event State Breakdown</div>
              <div className="flex items-end gap-2 h-28 pt-4 justify-around">
                {(["INITIALIZED", "PROCESSING", "SYNCED", "FAILED"] as const).map(state => {
                  const count = byState[state] ?? 0;
                  const pct = Math.max(4, Math.round((count / total) * 100));
                  const color = state === "SYNCED" ? "#72ff70" : state === "FAILED" ? "#f87171" : state === "PROCESSING" ? "#00f1fe" : "#b9ccb2";
                  return (
                    <div key={state} className="flex flex-col items-center gap-1 flex-1">
                      <div
                        className="w-full rounded-t transition-all duration-700"
                        style={{ height: `${pct}%`, backgroundColor: color + "99" }}
                      />
                      <span className="font-label-code text-[8px] opacity-50">{state.slice(0, 4)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="text-center font-label-code text-[9px] text-[#b9ccb2] mt-4 uppercase">
                LIVE CONTAINERS: {liveMap.size}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
