"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";
import { useContainerStream, ContainerState } from "@/hooks/useContainerStream";
import { TerminalLoadingState } from "@/components/TerminalLoadingState";

interface AlertRow {
  event_id: string;
  occurred_at: string;
  severity: "ERROR" | "WARNING" | "INFO" | "SYS";
  container_id: string;
  callsign_alias: string;
  origin_region?: string;
  from_state?: string;
  to_state?: string;
  detail?: any;
}

export default function PipelineAlerts() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  const [activeFilters, setActiveFilters] = useState({
    ERROR: true,
    WARNING: true,
    INFO: true,
    SYS: true,
  });

  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [stats, setStats] = useState({
    critAnomalyIndex: 0,
    nodeSaturation: 0.0,
    telemetryFlux: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem("session_token");
    if (!t) {
      router.push("/login");
      return;
    }
    setToken(t);
  }, [router]);

  const fetchAlerts = useCallback(async () => {
    if (!token) return;
    try {
      const activeSeverities = Object.entries(activeFilters)
        .filter(([_, active]) => active)
        .map(([sev]) => sev);

      const params = new URLSearchParams();
      if (activeSeverities.length > 0) {
        params.set("severity", activeSeverities.join(","));
      } else {
        params.set("severity", "NONE"); // force empty list if all filters disabled
      }
      params.set("limit", "100");

      const res = await fetch(`${API_BASE_URL}/api/v1/alerts?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts ?? []);
        setStats({
          critAnomalyIndex: data.crit_anomaly_index ?? 0,
          nodeSaturation: data.node_saturation ?? 0.0,
          telemetryFlux: data.telemetry_flux ?? 0,
        });
      }
    } catch (err) {
      console.error("Failed to fetch alerts", err);
    } finally {
      setLoading(false);
    }
  }, [token, activeFilters]);

  useEffect(() => {
    if (token) {
      fetchAlerts();
    }
  }, [token, activeFilters, fetchAlerts]);

  // Live SSE listener
  const { connected } = useContainerStream(token);
  const seenKeys = useRef(new Set<string>());

  useEffect(() => {
    const handler = (e: Event) => {
      const update = (e as CustomEvent<ContainerState>).detail;
      const key = `${update.container_id}-${update.to_state}-${update.occurred_at}`;
      if (seenKeys.current.has(key)) return;
      seenKeys.current.add(key);

      const severityMap: Record<string, "ERROR" | "WARNING" | "INFO" | "SYS"> = {
        FAILED: "ERROR",
        PROCESSING: "INFO",
        SYNCED: "INFO",
        INITIALIZED: "INFO",
      };

      const newAlert: AlertRow = {
        event_id: update.container_id + "-" + update.to_state,
        occurred_at: update.occurred_at,
        severity: severityMap[update.to_state] || "INFO",
        container_id: update.container_id,
        callsign_alias: update.callsign_alias || update.container_id.slice(0, 10),
        to_state: update.to_state,
        detail: update.detail,
      };

      setAlerts((prev) => {
        if (!activeFilters[newAlert.severity]) return prev;
        return [newAlert, ...prev].slice(0, 100);
      });

      setStats((prev) => ({
        ...prev,
        telemetryFlux: prev.telemetryFlux + 1,
        critAnomalyIndex: prev.critAnomalyIndex + (newAlert.severity === "ERROR" ? 1 : 0),
      }));
    };

    window.addEventListener("containerStatusUpdated", handler);
    return () => window.removeEventListener("containerStatusUpdated", handler);
  }, [activeFilters]);

  const toggleFilter = (type: keyof typeof activeFilters) => {
    setActiveFilters((prev) => ({ ...prev, [type]: !prev[type] }));
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

  const getMsg = (a: AlertRow) => {
    if (!a.detail) return a.to_state || "Unknown State";
    try {
      const parsed = typeof a.detail === "string" ? JSON.parse(a.detail) : a.detail;
      if (parsed.error) return parsed.error;
      if (parsed.message) return parsed.message;
      if (parsed.step) return `Step: ${parsed.step}`;
      return JSON.stringify(parsed);
    } catch {
      return String(a.detail);
    }
  };

  const fmtDate = (iso: string) => {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="bg-[#0A0A0A] text-[#e5e2e1] min-h-screen flex items-center justify-center">
        <TerminalLoadingState label="LOADING ALERTS..." />
      </div>
    );
  }

  return (
    <div className="bg-[#0A0A0A] text-[#e5e2e1] font-body-mono min-h-screen overflow-hidden flex flex-col select-none">
      <div className="fixed inset-0 scanline-overlay z-50 pointer-events-none opacity-20"></div>

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
                className={`px-3 py-1 font-label-code text-[10px] border transition-all active:scale-95 cursor-pointer ${
                  activeFilters.ERROR
                    ? "bg-[#93000a] text-[#ffdad6] border-error shadow-[0_0_8px_rgba(255,49,49,0.2)]"
                    : "bg-[#131313] border-[#3b4b37] text-[#b9ccb2]/50 hover:text-white"
                }`}
              >
                [ERROR]
              </button>

              <button
                onClick={() => toggleFilter("WARNING")}
                className={`px-3 py-1 font-label-code text-[10px] border transition-all active:scale-95 cursor-pointer ${
                  activeFilters.WARNING
                    ? "bg-[#ffd2cd]/20 text-[#ffb4ab] border-[#ffb4ab] shadow-[0_0_8px_rgba(255,180,171,0.2)]"
                    : "bg-[#131313] border-[#3b4b37] text-[#b9ccb2]/50 hover:text-white"
                }`}
              >
                [WARNING]
              </button>

              <button
                onClick={() => toggleFilter("INFO")}
                className={`px-3 py-1 font-label-code text-[10px] border transition-all active:scale-95 cursor-pointer ${
                  activeFilters.INFO
                    ? "bg-[#00f1fe]/20 text-[#00f1fe] border-[#00f1fe] shadow-[0_0_8px_rgba(0,241,254,0.2)]"
                    : "bg-[#131313] border-[#3b4b37] text-[#b9ccb2]/50 hover:text-white"
                }`}
              >
                [INFO]
              </button>

              <button
                onClick={() => toggleFilter("SYS")}
                className={`px-3 py-1 font-label-code text-[10px] border transition-all active:scale-95 cursor-pointer ${
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
                <span className={`animate-pulse ${connected ? "text-[#00e639]" : "text-red-400"}`}>●</span>
                <span>{connected ? "LIVE_TELEMETRY" : "TELEMETRY_DISCONNECTED"}</span>
              </div>
              <button
                onClick={handleExport}
                className="bg-[#00e639] text-[#003907] font-label-code px-4 py-1 text-[10px] hover:brightness-110 active:scale-95 transition-all font-bold cursor-pointer"
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
              <div className="col-span-2">CONTAINER_ALIAS</div>
              <div className="col-span-2">EVENT_STATE</div>
              <div className="col-span-3">MESSAGE</div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar font-body-mono-sm divide-y divide-[#3b4b37]/20 p-1">
              {alerts.length > 0 ? (
                alerts.map((row) => (
                  <div
                    key={row.event_id}
                    className="grid grid-cols-12 gap-2 p-2.5 hover:bg-[#353534]/20 transition-colors group text-[12px]"
                  >
                    <div className="col-span-3 text-[#b9ccb2]/80 pr-1 truncate">{fmtDate(row.occurred_at)}</div>
                    <div className="col-span-2">
                      {row.severity === "ERROR" ? (
                        <span className="text-error bg-error-container/20 px-1.5 py-0.5 border border-error/30 text-[9px] font-bold">
                          ERROR
                        </span>
                      ) : row.severity === "WARNING" ? (
                        <span className="text-[#ffb4ab] bg-[#ffd2cd]/10 px-1.5 py-0.5 border border-[#ffb4ab]/30 text-[9px] font-bold">
                          WARN
                        </span>
                      ) : row.severity === "INFO" ? (
                        <span className="text-[#00f1fe] bg-[#00f1fe]/10 px-1.5 py-0.5 border border-[#00f1fe]/30 text-[9px] font-bold">
                          INFO
                        </span>
                      ) : (
                        <span className="text-[#b9ccb2]/60 bg-[#353534]/20 px-1.5 py-0.5 border border-[#84967e]/30 text-[9px] font-bold">
                          SYS
                        </span>
                      )}
                    </div>
                    <div className="col-span-2 font-label-code text-[#00dbe7] truncate">{row.callsign_alias}</div>
                    <div
                      className="col-span-2 text-[#b9ccb2] font-semibold text-[11px] truncate"
                      title={row.to_state}
                    >
                      {row.to_state}
                    </div>
                    <div
                      className="col-span-3 text-[#e5e2e1] truncate group-hover:whitespace-normal break-all"
                      title={getMsg(row)}
                    >
                      {getMsg(row)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center font-label-code text-[#b9ccb2] opacity-40 text-xs">
                  NO ALERTS RECORDED
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Right Section: Metric Cards */}
        <aside className="w-80 flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar">
          <div className="flex-1 bg-[#1c1b1b] border border-[#3b4b37] corner-bracket p-4 flex flex-col justify-center relative overflow-hidden group hover:bg-[#353534]/30 transition-all duration-300 min-h-[140px] rounded-sm">
            <div className="scanline absolute inset-0 opacity-10 pointer-events-none"></div>
            <div className="flex justify-between items-center mb-2">
              <span className="font-label-code text-[#00e639] text-[10px] font-bold">CRIT_ANOMALY_INDEX</span>
              <span className="material-symbols-outlined text-error animate-pulse text-lg">warning</span>
            </div>
            <div className="text-[48px] font-display-tech text-error leading-none mb-1 font-bold">
              {String(stats.critAnomalyIndex).padStart(2, "0")}
            </div>
            <div className="font-label-code text-[9px] text-[#b9ccb2] uppercase tracking-widest">
              Errors Last 24 Hours
            </div>
            <div className="mt-4 pt-2 border-t border-[#3b4b37]/40 flex justify-between text-[10px] font-label-code text-[#b9ccb2]">
              <span>THREAT_LVL</span>
              <span className={`font-bold ${stats.critAnomalyIndex > 0 ? "text-error" : "text-[#00e639]"}`}>
                {stats.critAnomalyIndex > 0 ? "SEVERE" : "NOMINAL"}
              </span>
            </div>
          </div>

          <div className="flex-1 bg-[#1c1b1b] border border-[#3b4b37] corner-bracket p-4 flex flex-col justify-center relative overflow-hidden group hover:bg-[#353534]/30 transition-all duration-300 min-h-[140px] rounded-sm">
            <div className="scanline absolute inset-0 opacity-10 pointer-events-none"></div>
            <div className="flex justify-between items-center mb-2">
              <span className="font-label-code text-[#00e639] text-[10px] font-bold">NODE_SATURATION</span>
              <span className="material-symbols-outlined text-[#00f1fe] text-lg">speed</span>
            </div>
            <div className="text-[48px] font-display-tech text-[#00f1fe] leading-none mb-1 font-bold">
              {stats.nodeSaturation.toFixed(0)}%
            </div>
            <div className="font-label-code text-[9px] text-[#b9ccb2] uppercase tracking-widest">
              Active Workers Availability
            </div>
            <div className="mt-4 pt-2 border-t border-[#3b4b37]/40 flex gap-0.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 transition-all duration-300 ${
                    i < Math.round(stats.nodeSaturation / 10) ? "bg-[#00f1fe]" : "bg-[#2a2a2a]"
                  }`}
                ></div>
              ))}
            </div>
          </div>

          {/* Metric Box 3: Telemetry Flux */}
          <div className="flex-1 bg-[#1c1b1b] border border-[#3b4b37] corner-bracket p-4 flex flex-col justify-center relative overflow-hidden group hover:bg-[#353534]/30 transition-all duration-300 min-h-[140px] rounded-sm">
            <div className="scanline absolute inset-0 opacity-10 pointer-events-none"></div>
            <div className="flex justify-between items-center mb-2">
              <span className="font-label-code text-[#00e639] text-[10px] font-bold">TELEMETRY_FLUX</span>
              <span className="material-symbols-outlined text-[#00e639] text-lg">query_stats</span>
            </div>
            <div className="text-[48px] font-display-tech text-[#00e639] leading-none mb-1 font-bold">
              {stats.telemetryFlux}
            </div>
            <div className="font-label-code text-[9px] text-[#b9ccb2] uppercase tracking-widest">
              Total Events Last 24 Hours
            </div>
            <div className="mt-4 flex gap-1 items-end h-8">
              <div className="w-2 bg-[#00e639]/40 h-1/2 rounded-t"></div>
              <div className="w-2 bg-[#00e639]/60 h-2/3 rounded-t"></div>
              <div className="w-2 bg-[#00e639] h-full rounded-t animate-pulse"></div>
              <div className="w-2 bg-[#00e639]/80 h-3/4 rounded-t"></div>
              <div className="w-2 bg-[#00e639]/40 h-1/3 rounded-t"></div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
