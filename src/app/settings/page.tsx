"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";
import { TerminalLoadingState } from "@/components/TerminalLoadingState";

interface ConfigItem {
  key: string;
  value: string;
  updated_at?: string;
  updated_by?: string;
  read_only: boolean;
  note?: string;
}

export default function SystemConfiguration() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [generatingKey, setGeneratingKey] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [keyHint, setKeyHint] = useState<string | null>(null);
  const [keyGenError, setKeyGenError] = useState<string | null>(null);
  const [keyRotated, setKeyRotated] = useState(false);

  const [goroutineThreshold, setGoroutineThreshold] = useState(16384);
  const [flushInterval, setFlushInterval] = useState(500);
  const [replicationFactor, setReplicationFactor] = useState("x3");
  const [verbosityLevel, setVerbosityLevel] = useState("INFO");
  const [verbosity, setVerbosity] = useState({ err: 0, info: 100, debug: 0 });

  const [storageBackend, setStorageBackend] = useState("local");
  const [storageRawDir, setStorageRawDir] = useState("./uploads");

  const [activeRegions, setActiveRegions] = useState<Record<string, boolean>>({
    "US-EAST-1": false,
    "US-WEST-2": false,
    "EU-WEST-1": false,
    "AP-SOUTH-1": false,
    "SA-EAST-1": false,
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const t = localStorage.getItem("session_token");
    if (!t) {
      router.push("/login");
      return;
    }
    setToken(t);
  }, [router]);

  const fetchConfigs = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const configList: ConfigItem[] = data.config ?? [];

        configList.forEach(item => {
          if (item.key === "goroutine_threshold") {
            setGoroutineThreshold(Number(item.value) || 16384);
          } else if (item.key === "flush_interval_ms") {
            setFlushInterval(Number(item.value) || 500);
          } else if (item.key === "replication_factor") {
            setReplicationFactor(item.value || "x3");
          } else if (item.key === "verbosity_level") {
            const val = item.value || "INFO";
            setVerbosityLevel(val);
            if (val === "ERROR") setVerbosity({ err: 100, info: 0, debug: 0 });
            else if (val === "INFO") setVerbosity({ err: 0, info: 100, debug: 0 });
            else if (val === "DEBUG") setVerbosity({ err: 0, info: 0, debug: 100 });
          } else if (item.key === "storage_backend") {
            setStorageBackend(item.value);
          } else if (item.key === "storage_raw_dir") {
            setStorageRawDir(item.value);
          }
        });
      }
    } catch (err) {
      console.error("Failed to fetch configs", err);
    }
  }, [token]);

  const fetchActiveRegions = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/containers/active?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const used: Record<string, boolean> = {
          "US-EAST-1": false,
          "US-WEST-2": false,
          "EU-WEST-1": false,
          "AP-SOUTH-1": false,
          "SA-EAST-1": false,
        };
        (data.containers ?? []).forEach((c: any) => {
          if (c.origin_region && used[c.origin_region] !== undefined) {
            used[c.origin_region] = true;
          }
        });
        setActiveRegions(used);
      }
    } catch (err) {
      console.error("Failed to fetch active regions", err);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      Promise.all([fetchConfigs(), fetchActiveRegions()]).then(() => {
        setLoading(false);
      });
    }
  }, [token, fetchConfigs, fetchActiveRegions]);

  const saveConfig = async (key: string, value: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/config/${key}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ value }),
      });
      const data = await res.json();
      if (res.ok) {
        if ((window as any).toast) {
          (window as any).toast.success(`CONFIG UPDATED: ${key.toUpperCase()}`, {
            value: data.value,
            status: "NOMINAL",
          });
        }
      } else {
        if ((window as any).toast) {
          (window as any).toast.error(`MUTATION ERROR: ${data.error || "Permission Denied"}`);
        }
      }
    } catch (err) {
      console.error("Failed to save config", err);
    }
  };

  const handleGenerateKey = async () => {
    if (generatingKey) return;
    setGeneratingKey(true);
    setKeyGenError(null);
    setGeneratedKey(null);
    setKeyRotated(false);

    if (!token) {
      setKeyGenError("Authentication token not found. Please log in.");
      setGeneratingKey(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/operator/signature-key/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate signature key");
      }
      setGeneratedKey(data.signature_key);
      setKeyHint(data.key_hint);
      setKeyRotated(!!data.rotated);
      if ((window as any).toast) {
        (window as any).toast.success("DEPLOYMENT KEY GENERATED", {
          hint: data.key_hint,
          status: "ACTIVE",
        });
      }
    } catch (err: any) {
      const msg = err.message || "An unexpected error occurred";
      setKeyGenError(msg);
      if ((window as any).toast) {
        (window as any).toast.error("Key Generation Failed", {
          error: msg,
        });
      }
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleVerbositySlider = (level: "err" | "info" | "debug", val: number) => {
    const nextVerbosity = { err: 0, info: 0, debug: 0, [level]: val };
    setVerbosity(nextVerbosity);

    let target = "INFO";
    if (level === "err" && val > 50) target = "ERROR";
    else if (level === "debug" && val > 50) target = "DEBUG";

    setVerbosityLevel(target);
    saveConfig("verbosity_level", target);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let angle = 0;

    const nodes = [
      { x: 0, y: 0, z: 0, label: "SYS_ROOT", color: "#00e639" },
      { x: -80, y: -50, z: -50, label: "US-EAST-1", color: "#00f1fe" },
      { x: 80, y: 50, z: 50, label: "AP-SOUTH-1", color: "#00f1fe" },
      { x: -50, y: 70, z: 60, label: "US-WEST-2", color: "#ffb4ab" },
      { x: 70, y: -60, z: -80, label: "SA-EAST-1", color: "#ffb4ab" },
    ];

    const rotateX = (point: { x: number; y: number; z: number }, rad: number) => {
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      return {
        x: point.x,
        y: point.y * cos - point.z * sin,
        z: point.y * sin + point.z * cos,
      };
    };

    const rotateY = (point: { x: number; y: number; z: number }, rad: number) => {
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      return {
        x: point.x * cos + point.z * sin,
        y: point.y,
        z: -point.x * sin + point.z * cos,
      };
    };

    const draw = () => {
      ctx.fillStyle = "#0e0e0e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      const projected = nodes.map((node) => {
        let p = rotateY(node, angle);
        p = rotateX(p, angle * 0.5);

        const scale = 250 / (250 + p.z);
        return {
          x: cx + p.x * scale,
          y: cy + p.y * scale,
          z: p.z,
          label: node.label,
          color: node.color,
          scale,
        };
      });

      ctx.lineWidth = 1;
      projected.forEach((node, i) => {
        if (i === 0) return; // Skip SYS_ROOT
        ctx.strokeStyle = "rgba(59, 75, 55, 0.4)";
        ctx.beginPath();
        ctx.moveTo(projected[0].x, projected[0].y);
        ctx.lineTo(node.x, node.y);
        ctx.stroke();
      });

      projected.forEach((node) => {
        ctx.fillStyle = node.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = node.color;

        ctx.beginPath();
        ctx.arc(node.x, node.y, 4 * node.scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;

        ctx.fillStyle = "rgba(185, 204, 178, 0.6)";
        ctx.font = "8px 'JetBrains Mono', monospace";
        ctx.fillText(node.label, node.x + 6, node.y + 3);
      });

      angle += 0.01;
      animId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, []);

  if (loading) {
    return (
      <div className="bg-[#0A0A0A] text-[#e5e2e1] min-h-screen flex items-center justify-center">
        <TerminalLoadingState label="LOADING CONFIG..." />
      </div>
    );
  }

  return (
    <div className="bg-[#0A0A0A] text-[#e5e2e1] font-body-mono selection:bg-[#00ff41]/20 selection:text-[#00ff41] min-h-screen flex flex-col">
      <div className="fixed inset-0 scanline-overlay z-50 pointer-events-none opacity-20"></div>

      {/* Main Content Area */}
      <div className="p-6 min-h-screen overflow-y-auto bg-[#0A0A0A]">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-container-max mx-auto">
          <section className="bg-[#1c1b1b]/80 backdrop-blur-md border border-[#3b4b37] p-4 relative chamfer-br flex flex-col gap-6 overflow-hidden min-h-[460px] rounded-sm">
            <div className="flex justify-between items-center border-b border-[#3b4b37] pb-2">
              <h2 className="font-label-code text-[10px] text-[#00e639] flex items-center gap-2 font-bold uppercase">
                <span className="material-symbols-outlined text-sm">precision_manufacturing</span>
                [MODULE: WORKER_POOL_ORCHESTRATOR]
              </h2>
            </div>

            <div className="space-y-6">
              {/* Goroutine Thresholds — DISPLAY ONLY */}
              <div className="relative group">
                <div className="flex justify-between items-center mb-1">
                  <p className="font-label-code text-[10px] text-[#b9ccb2] opacity-60">GOROUTINE_THRESHOLD (READ-ONLY)</p>
                  <span className="text-[8px] text-[#00e639] border border-[#00e639]/30 px-1 font-mono uppercase">
                    Stored Only
                  </span>
                </div>
                <div className="flex items-center gap-4 cursor-help" title="Runtime goroutine count is managed by the Go scheduler — this value is stored for reference only.">
                  <input
                    disabled
                    className="w-full h-1 bg-[#2a2a2a] rounded-none appearance-none cursor-not-allowed accent-[#00e639] opacity-50"
                    max="65536"
                    min="1024"
                    step="1024"
                    type="range"
                    value={goroutineThreshold}
                  />
                  <span className="font-label-code text-[12px] text-[#00e639]/50 font-bold w-12 text-right">
                    {(goroutineThreshold / 1000).toFixed(1)}k
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 opacity-40 select-none">
                <div className="p-3 border border-[#3b4b37]/30 bg-[#0e0e0e] relative" title="No live telemetry for queue buffer sizes.">
                  <p className="font-label-code text-[8px] text-[#00dbe7] uppercase">INGEST_CHAN_BUFF</p>
                  <div className="flex gap-[2px] mt-2 segment-bar">
                    <span className="active"></span><span className="active"></span><span className="active"></span><span className="active"></span>
                    <span></span><span></span><span></span>
                  </div>
                  <p className="mt-2 font-label-code text-[10px] text-[#e5e2e1] font-semibold">512/1024 MB</p>
                </div>

                <div className="p-3 border border-[#3b4b37]/30 bg-[#0e0e0e] relative" title="No live telemetry for queue packet counts.">
                  <p className="font-label-code text-[8px] text-[#00dbe7] uppercase">OUTBOUND_QUEUE</p>
                  <div className="flex gap-[2px] mt-2 segment-bar">
                    <span className="active"></span><span className="active"></span><span className="active"></span><span></span>
                    <span></span><span></span><span></span>
                  </div>
                  <p className="mt-2 font-label-code text-[10px] text-[#e5e2e1] font-semibold">25.4k PKTS</p>
                </div>
              </div>

              {/* Radial Telemetry — DECORATIVE / DIMMED */}
              <div className="flex justify-around items-center pt-4 opacity-40 select-none">
                <div className="relative w-24 h-24 flex items-center justify-center border-2 border-dashed border-[#3b4b37] rounded-full">
                  <div className="text-center">
                    <p className="font-display-tech text-[16px] text-[#00e639] leading-none font-bold">82%</p>
                    <p className="font-label-code text-[8px] text-[#b9ccb2]">CPU_LOAD</p>
                  </div>
                </div>

                <div className="relative w-24 h-24 flex items-center justify-center border-2 border-dashed border-[#3b4b37] rounded-full">
                  <div className="text-center">
                    <p className="font-display-tech text-[16px] text-[#00dbe7] leading-none font-bold">4.2ms</p>
                    <p className="font-label-code text-[8px] text-[#b9ccb2]">LAT_P99</p>
                  </div>
                </div>
              </div>

              {/* Operator Signature Key subsection */}
              <div className="border-t border-[#3b4b37]/30 pt-4 space-y-3">
                <p className="font-label-code text-[10px] text-[#b9ccb2] uppercase opacity-60">OPERATOR_DEPLOYMENT_KEY</p>
                <div className="space-y-2">
                  <button
                    onClick={handleGenerateKey}
                    disabled={generatingKey}
                    className="w-full py-2 bg-[#00ff41]/10 border border-[#00ff41] hover:bg-[#00ff41]/20 disabled:opacity-50 text-[#00ff41] font-label-code text-[10px] tracking-widest text-center cursor-pointer transition-colors font-bold rounded-sm"
                  >
                    {generatingKey ? "GENERATING..." : "GENERATE DEPLOYMENT KEY"}
                  </button>

                  {keyGenError && (
                    <p className="font-label-code text-[9px] text-[#ffb4ab] uppercase tracking-wider">
                      Error: {keyGenError}
                    </p>
                  )}

                  {generatedKey && (
                    <div className="p-3 border border-[#3b4b37]/50 bg-[#0e0e0e] space-y-2 relative rounded-sm">
                      <div className="absolute top-0 right-0 w-2 h-2 bg-[#ffb4ab]/20"></div>
                      <p className="font-label-code text-[8px] text-[#ffb4ab] uppercase font-bold tracking-widest">
                        ⚠️ This key will not be shown again
                      </p>
                      <div className="flex gap-2">
                        <input
                          readOnly
                          type="text"
                          value={generatedKey}
                          className="flex-1 bg-[#1c1b1b] border border-[#3b4b37] text-white font-body-mono p-1 text-[10px] focus:outline-none focus:border-[#00ff41]"
                          onClick={(e) => e.currentTarget.select()}
                        />
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(generatedKey);
                            if ((window as any).toast) {
                              (window as any).toast.success("KEY COPIED TO CLIPBOARD");
                            }
                          }}
                          className="px-3 bg-[#00f1fe]/10 border border-[#00f1fe] text-[#00f1fe] hover:bg-[#00f1fe]/20 text-[9px] font-label-code font-bold uppercase transition-colors rounded-sm cursor-pointer"
                        >
                          COPY
                        </button>
                      </div>
                      <p className="font-label-code text-[8px] text-[#b9ccb2]/60 flex flex-col gap-1">
                        <span>Key Hint: ...{keyHint} (Active)</span>
                        {keyRotated && (
                          <span className="text-[#ffb4ab] font-bold">
                            ⚠️ Previous key is now invalid.
                          </span>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="bg-[#1c1b1b]/80 backdrop-blur-md border border-[#3b4b37] p-4 relative chamfer-tl flex flex-col gap-6 min-h-[460px] rounded-sm">
            <div className="flex justify-between items-center border-b border-[#3b4b37] pb-2">
              <h2 className="font-label-code text-[10px] text-[#00dbe7] flex items-center gap-2 font-bold uppercase">
                <span className="material-symbols-outlined text-sm">database</span>
                [MODULE: PERSISTENCE_LAYER]
              </h2>
            </div>

            <div className="space-y-6">
              {/* Flush Intervals */}
              <div>
                <p className="font-label-code text-[10px] text-[#b9ccb2] mb-2 opacity-60">FLUSH_INTERVAL_MS</p>
                <div className="flex gap-2">
                  {[250, 500, 1000].map((val) => (
                    <button
                      key={val}
                      onClick={() => {
                        setFlushInterval(val);
                        saveConfig("flush_interval_ms", String(val));
                      }}
                      className={`flex-1 py-2 border font-label-code text-[11px] transition-colors rounded-sm cursor-pointer ${
                        flushInterval === val
                          ? "border-[#00e639] bg-[#00ff41]/10 text-[#00e639] font-bold"
                          : "border-[#3b4b37] bg-[#1c1b1b] hover:bg-[#2a2a2a] text-[#b9ccb2]"
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>

              {/* Partition Paths — READ ONLY / ENV-BACKED */}
              <div className="bg-[#0e0e0e] p-3 border-l-2 border-[#00dbe7] rounded-r-sm">
                <p className="font-label-code text-[8px] text-[#b9ccb2] mb-1">DATA_PARTITION_PATH (READ-ONLY)</p>
                <code className="font-label-code text-[10px] text-[#00dbe7] break-all leading-tight">
                  {storageRawDir}
                </code>
                <div className="flex gap-2 mt-4">
                  <span className="px-2 py-0.5 bg-[#353534] font-label-code text-[8px] text-[#e5e2e1]">
                    (env-backed, requires restart)
                  </span>
                  <span className="px-2 py-0.5 bg-[#00ff41]/10 border border-[#00e639]/30 font-label-code text-[8px] text-[#00e639] font-bold">
                    ACTIVE
                  </span>
                </div>
              </div>

              {/* Segmented Toggles — DISPLAY ONLY / ENV-BACKED */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <p className="font-label-code text-[10px] text-[#b9ccb2] opacity-60">WRITE_STRATEGY (READ-ONLY)</p>
                  <span className="text-[8px] text-[#00e639] border border-[#00e639]/30 px-1 font-mono uppercase">
                    Env-Backed
                  </span>
                </div>
                <div
                  className="flex flex-col gap-1.5 cursor-help"
                  title="Write strategy is env-backed (STORAGE_BACKEND) and requires a process restart to change."
                >
                  {[
                    { id: "WRITE_THROUGH", label: "WRITE_THROUGH (S3)", active: storageBackend === "s3" },
                    { id: "ASYNC_APPEND", label: "ASYNC_APPEND (Local Disk)", active: storageBackend === "local" },
                  ].map((strategy) => (
                    <div
                      key={strategy.id}
                      className={`flex items-center justify-between p-2.5 border rounded-sm transition-colors ${
                        strategy.active
                          ? "bg-[#00ff41]/5 border-[#00e639]/60 text-[#00e639] border-l-2 border-l-[#00e639]"
                          : "bg-[#0e0e0e] border-[#3b4b37] text-[#b9ccb2] opacity-50"
                      }`}
                    >
                      <span className="font-label-code text-[10px] font-bold">{strategy.label}</span>
                      <div className={`w-8 h-4 relative flex items-center p-0.5 transition-all ${strategy.active ? "bg-[#00ff41]/20" : "bg-[#353534]"}`}>
                        <div className={`w-3.5 h-3 bg-[#00e639] transition-transform ${strategy.active ? "translate-x-4" : "translate-x-0"}`}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="bg-[#1c1b1b]/80 backdrop-blur-md border border-[#3b4b37] p-4 relative chamfer-br flex flex-col gap-6 min-h-[460px] rounded-sm">
            <div className="flex justify-between items-center border-b border-[#3b4b37] pb-2">
              <h2 className="font-label-code text-[10px] text-[#ffb4ab] flex items-center gap-2 font-bold uppercase">
                <span className="material-symbols-outlined text-sm">wifi_tethering</span>
                [MODULE: NETWORK_INTERFACE]
              </h2>
            </div>

            <div className="space-y-6">
              <div>
                <p className="font-label-code text-[10px] text-[#b9ccb2] mb-2 opacity-60">
                  ACTIVE_REPLICATION_REGIONS (DISPLAY-ONLY)
                </p>
                <div
                  className="grid grid-cols-2 gap-2 cursor-help"
                  title="These toggles reflect actual regions utilized by active containers, not manual selection."
                >
                  {Object.keys(activeRegions).map((reg) => (
                    <div
                      key={reg}
                      className={`flex items-center justify-between px-3 py-2 border rounded-sm transition-colors ${
                        activeRegions[reg]
                          ? "border-[#00e639] bg-[#00ff41]/10 text-[#00e639] font-bold"
                          : "border-[#3b4b37] bg-[#0e0e0e] text-[#b9ccb2] opacity-40"
                      }`}
                    >
                      <span className="font-label-code text-[10px]">{reg}</span>
                      <span className="material-symbols-outlined text-xs">
                        {activeRegions[reg] ? "check_circle" : "radio_button_unchecked"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Replication Factor */}
              <div>
                <p className="font-label-code text-[10px] text-[#b9ccb2] mb-2 opacity-60">REPLICATION_FACTOR</p>
                <div className="flex items-center justify-between h-8 bg-[#0e0e0e] rounded-sm p-1 border border-[#3b4b37]/30">
                  {["x1", "x3", "x5", "GLOBAL"].map((factor) => (
                    <button
                      key={factor}
                      onClick={() => {
                        setReplicationFactor(factor);
                        saveConfig("replication_factor", factor);
                      }}
                      className={`px-4 h-full font-label-code text-[10px] transition-colors cursor-pointer ${
                        replicationFactor === factor
                          ? "bg-[#00ff41] text-[#003907] font-bold rounded-sm"
                          : "bg-transparent text-[#b9ccb2] hover:text-white"
                      }`}
                    >
                      {factor}
                    </button>
                  ))}
                </div>
              </div>

              {/* Verbose Log Levels */}
              <div className="space-y-3">
                <p className="font-label-code text-[10px] text-[#b9ccb2] mb-2 opacity-60">VERBOSITY_LEVEL</p>
                <div className="border border-[#3b4b37] p-3 space-y-3 bg-[#0e0e0e]/40 rounded-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-label-code text-[9px] uppercase">
                      ERR_ONLY {verbosityLevel === "ERROR" ? "(ACTIVE)" : ""}
                    </span>
                    <input
                      type="range"
                      className="w-24 h-1 accent-[#93000a] bg-[#2a2a2a] appearance-none cursor-pointer"
                      value={verbosity.err}
                      onChange={(e) => handleVerbositySlider("err", Number(e.target.value))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-label-code text-[9px] uppercase">
                      INFO_WARN {verbosityLevel === "INFO" ? "(ACTIVE)" : ""}
                    </span>
                    <input
                      type="range"
                      className="w-24 h-1 accent-[#00f1fe] bg-[#2a2a2a] appearance-none cursor-pointer"
                      value={verbosity.info}
                      onChange={(e) => handleVerbositySlider("info", Number(e.target.value))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-label-code text-[9px] text-[#00e639] uppercase">
                      DEBUG_VERBOSE {verbosityLevel === "DEBUG" ? "(ACTIVE)" : ""}
                    </span>
                    <input
                      type="range"
                      className="w-24 h-1 accent-[#00e639] bg-[#2a2a2a] appearance-none cursor-pointer"
                      value={verbosity.debug}
                      onChange={(e) => handleVerbositySlider("debug", Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>

              {/* Live Visualization Map */}
              <div className="mt-2 border border-[#3b4b37] bg-[#0e0e0e] relative overflow-hidden h-32 flex flex-col justify-end rounded-sm">
                <canvas
                  ref={canvasRef}
                  width="300"
                  height="128"
                  className="w-full h-full block absolute inset-0 z-0"
                />
                <div className="relative z-10 p-2 bg-[#0e0e0e]/80 text-center border-t border-[#3b4b37]/30">
                  <span className="font-label-code text-[8px] text-[#00e639] tracking-widest font-bold">
                    3D_CLUSTER_MAP_STREAMING
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
