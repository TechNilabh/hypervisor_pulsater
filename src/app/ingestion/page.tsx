"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";
import { useContainerStream, ContainerState } from "@/hooks/useContainerStream";

// ─── Types ────────────────────────────────────────────────────────────────────

type VectorType = "PHARMA_R3" | "IOT_GRID" | "QUANT_ALPHA";
type StatusState = "INITIALIZED" | "PROCESSING" | "SYNCED" | "FAILED";

interface ContainerRow {
  container_id: string;
  callsign_alias: string;
  target_vector_type: VectorType;
  status_state: StatusState;
  file_size_bytes: number | null;
  checksum_sha256: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: StatusState }) {
  const configs: Record<StatusState, { label: string; cls: string; dot: string }> = {
    INITIALIZED: {
      label: "INITIALIZED",
      cls: "bg-[#1c3a2a] border-[#00ff41]/40 text-[#00ff41]",
      dot: "bg-[#00ff41]",
    },
    PROCESSING: {
      label: "PROCESSING",
      cls: "bg-[#0d2a38] border-[#00f1fe]/40 text-[#00f1fe]",
      dot: "bg-[#00f1fe] animate-pulse",
    },
    SYNCED: {
      label: "SYNCED",
      cls: "bg-[#0a1f0a] border-[#72ff70]/50 text-[#72ff70]",
      dot: "bg-[#72ff70]",
    },
    FAILED: {
      label: "FAILED",
      cls: "bg-[#2a0a0a] border-red-500/40 text-red-400",
      dot: "bg-red-500",
    },
  };
  const c = configs[status] ?? configs.INITIALIZED;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 border rounded-sm font-label-code text-[9px] tracking-wider ${c.cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmtBytes(n: number | null) {
  if (n === null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ─── Upload Panel ─────────────────────────────────────────────────────────────

interface UploadPanelProps {
  token: string;
  onUploaded: (id: string) => void;
}

function UploadPanel({ token, onUploaded }: UploadPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [callsign, setCallsign] = useState("");
  const [vectorType, setVectorType] = useState<VectorType>("PHARMA_R3");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Drag-and-drop handlers
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !callsign.trim()) {
      setResult({ type: "err", msg: "Callsign alias and payload file are required." });
      return;
    }

    setUploading(true);
    setProgress(0);
    setResult(null);

    const form = new FormData();
    form.append("payload", file);
    form.append("callsign_alias", callsign.trim());
    form.append("target_vector_type", vectorType);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (idempotencyKey.trim()) {
      headers["Idempotency-Key"] = idempotencyKey.trim();
    }

    try {
      // Use XHR for real upload progress events.
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
      };

      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status === 202 || xhr.status === 200) {
            const data = JSON.parse(xhr.responseText);
            setResult({ type: "ok", msg: `Container ${data.container_id} accepted.` });
            onUploaded(data.container_id);
            setFile(null);
            setCallsign("");
            setIdempotencyKey("");
            setProgress(0);
            resolve();
          } else {
            try {
              const err = JSON.parse(xhr.responseText);
              reject(new Error(err.error || `HTTP ${xhr.status}`));
            } catch {
              reject(new Error(`HTTP ${xhr.status}`));
            }
          }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.open("POST", `${API_BASE_URL}/api/v1/containers/upload`);
        Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
        xhr.send(form);
      });
    } catch (err: unknown) {
      setResult({
        type: "err",
        msg: err instanceof Error ? err.message : "Upload failed",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-[#1c1b1b]/80 backdrop-blur-md border border-[#3b4b37] rounded-sm p-5 flex flex-col gap-4 relative chamfer-br shadow-2xl overflow-hidden">
      <div className="scanline-overlay absolute inset-0 z-0 pointer-events-none opacity-10"></div>
      
      <div className="flex justify-between items-center border-b border-[#3b4b37] pb-2 z-10">
        <h2 className="font-label-code text-[10px] text-[#00e639] flex items-center gap-2 font-bold uppercase">
          <span className="material-symbols-outlined text-sm">upload_file</span>
          [MODULE: UPLOAD_TERMINAL]
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 z-10">
        {/* Drop zone */}
        <div
          ref={dropRef}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`border border-dashed rounded-none p-6 text-center cursor-pointer transition-all relative ${
            file
              ? "border-[#00ff41]/60 bg-[#00ff41]/5 shadow-[0_0_15px_rgba(0,255,65,0.05)]"
              : "border-[#3b4b37] hover:border-[#00f1fe]/50 hover:bg-[#1c1b1b]/40"
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <div className="flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-[#00ff41] text-3xl">
                check_circle
              </span>
              <span className="font-body-mono text-xs text-[#00ff41]">{file.name}</span>
              <span className="font-label-code text-[9px] text-[#b9ccb2]">
                {fmtBytes(file.size)}
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-2">
              <span className="material-symbols-outlined text-[#b9ccb2] text-3xl opacity-50">
                cloud_upload
              </span>
              <span className="font-body-mono text-xs text-[#b9ccb2]">
                Drop CDC payload or click to browse
              </span>
              <span className="font-label-code text-[8px] text-[#84967e] mt-1">
                .json .csv .parquet .avro .bin — max 5 GiB
              </span>
            </div>
          )}
        </div>

        {/* Form fields */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="font-label-code text-[9px] text-[#84967e] uppercase tracking-wider">
              Callsign Alias *
            </label>
            <input
              type="text"
              value={callsign}
              onChange={(e) => setCallsign(e.target.value)}
              placeholder="e.g. ALPHA-BATCH-001"
              className="bg-[#0e0e0e] border border-[#3b4b37] rounded-none px-3 py-2 font-body-mono text-xs text-[#e5e2e1] placeholder-[#84967e]/30 focus:outline-none focus:border-[#00f1fe] transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-label-code text-[9px] text-[#84967e] uppercase tracking-wider">
              Target Vector Type *
            </label>
            <select
              value={vectorType}
              onChange={(e) => setVectorType(e.target.value as VectorType)}
              className="bg-[#0e0e0e] border border-[#3b4b37] rounded-none px-3 py-2 font-body-mono text-xs text-[#e5e2e1] focus:outline-none focus:border-[#00f1fe] transition-colors cursor-pointer"
            >
              <option value="PHARMA_R3">PHARMA_R3</option>
              <option value="IOT_GRID">IOT_GRID</option>
              <option value="QUANT_ALPHA">QUANT_ALPHA</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-label-code text-[9px] text-[#84967e] uppercase tracking-wider">
              Idempotency Key (optional)
            </label>
            <input
              type="text"
              value={idempotencyKey}
              onChange={(e) => setIdempotencyKey(e.target.value)}
              placeholder="e.g. run-2026-07-03-batch-001"
              className="bg-[#0e0e0e] border border-[#3b4b37] rounded-none px-3 py-2 font-body-mono text-xs text-[#e5e2e1] placeholder-[#84967e]/30 focus:outline-none focus:border-[#00f1fe] transition-colors"
            />
          </div>
        </div>

        {/* Upload progress */}
        {uploading && (
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <span className="font-label-code text-[8px] text-[#00f1fe] tracking-wider">
                TRANSMITTING...
              </span>
              <span className="font-display-tech text-[10px] text-[#00f1fe]">{progress}%</span>
            </div>
            <div className="w-full h-1 bg-[#0e0e0e] overflow-hidden">
              <div
                className="h-full bg-[#00f1fe] shadow-[0_0_5px_#00f1fe] transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Result message */}
        {result && (
          <div
            className={`p-2.5 border rounded-none font-body-mono text-[11px] ${
              result.type === "ok"
                ? "bg-[#00ff41]/5 border-[#00e639]/40 text-[#00e639]"
                : "bg-error-container/20 border-error/40 text-error"
            }`}
          >
            {result.type === "ok" ? "✓ " : "✗ "}
            {result.msg}
          </div>
        )}

        <button
          type="submit"
          disabled={uploading || !file}
          className="w-full bg-[#00f1fe]/10 border border-[#00f1fe] text-[#00f1fe] font-label-code py-2.5 hover:bg-[#00f1fe]/20 hover:shadow-[0_0_15px_rgba(0,241,254,0.3)] tracking-widest uppercase transition-all flex items-center justify-center gap-2 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer rounded-none"
        >
          {uploading ? (
            <>
              <span className="material-symbols-outlined animate-spin text-xs">autorenew</span>
              TRANSMITTING...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-sm">publish</span>
              INITIATE UPLOAD
            </>
          )}
        </button>
      </form>
    </div>
  );
}

// ─── Container Grid Row ────────────────────────────────────────────────────────

function ContainerGridRow({
  container,
  liveUpdate,
}: {
  container: ContainerRow;
  liveUpdate: ContainerState | undefined;
}) {
  const effectiveStatus = (liveUpdate?.to_state ?? container.status_state) as StatusState;
  const isNew = useRef(false);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!isNew.current) {
      isNew.current = true;
      return;
    }
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 800);
    return () => clearTimeout(t);
  }, [effectiveStatus]);

  return (
    <tr
      className={`hover:bg-[#353534]/20 transition-all duration-300 ${
        flash ? "bg-[#00f1fe]/10" : ""
      }`}
    >
      {/* Callsign + ID */}
      <td className="py-2.5 px-4 pr-4">
        <div className="flex flex-col">
          <span className="font-body-mono text-sm text-[#e5e2e1] truncate font-bold">
            {container.callsign_alias}
          </span>
          <span className="font-label-code text-[8px] text-[#84967e] truncate">
            {container.container_id}
          </span>
        </div>
      </td>

      {/* Vector type */}
      <td className="py-2.5 px-4 pr-4 font-label-code text-[10px] text-[#00dbe7] hidden md:table-cell">
        {container.target_vector_type}
      </td>

      {/* Size */}
      <td className="py-2.5 px-4 pr-4 font-body-mono-sm text-[11px] text-[#b9ccb2] hidden lg:table-cell">
        {fmtBytes(container.file_size_bytes)}
      </td>

      {/* Status */}
      <td className="py-2.5 px-4 pr-4 text-center">
        <StatusBadge status={effectiveStatus} />
      </td>

      {/* Date */}
      <td className="py-2.5 px-4 pr-4 font-label-code text-[9px] text-[#84967e] hidden xl:table-cell">
        {fmtDate(container.created_at)}
      </td>
    </tr>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function IngestionPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [containers, setContainers] = useState<ContainerRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterVector, setFilterVector] = useState<string>("");

  // Load token from localStorage.
  useEffect(() => {
    const t = localStorage.getItem("session_token");
    if (!t) {
      router.push("/login");
      return;
    }
    setToken(t);
  }, [router]);

  // SSE live updates.
  const { containers: liveMap, connected, error: sseError } = useContainerStream(token);

  // ── Fetch initial container list ──────────────────────────────────────────
  const fetchContainers = useCallback(async () => {
    if (!token) return;
    setLoadingList(true);
    try {
      const params = new URLSearchParams({ limit: "50", sort_by: "created_at", sort_dir: "DESC" });
      if (filterStatus) params.set("status", filterStatus);
      if (filterVector) params.set("target_vector_type", filterVector);

      const res = await fetch(`${API_BASE_URL}/api/v1/containers/active?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setContainers(data.containers ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingList(false);
    }
  }, [token, filterStatus, filterVector]);

  useEffect(() => {
    if (token) fetchContainers();
  }, [fetchContainers, token]);

  // Refresh list when a new upload completes.
  const handleUploaded = useCallback(
    (_id: string) => {
      setTimeout(() => fetchContainers(), 600);
    },
    [fetchContainers]
  );

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#0A0A0A] text-[#e5e2e1] font-body-mono selection:bg-[#00ff41]/20 selection:text-[#00ff41] flex flex-col">
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="border-b border-[#3b4b37]/30 px-6 py-4 flex flex-col md:flex-row md:items-center gap-4 justify-between bg-[#131313]/40">
        <div>
          <div className="font-label-code text-[9px] text-[#00e639] tracking-widest mb-0.5">
            [MODULE: INGESTION_PIPELINE]
          </div>
          <h1 className="font-display-tech text-xl text-white tracking-wider uppercase font-bold">
            CONTAINER INGESTION MONITOR
          </h1>
        </div>

        {/* SSE connection indicator */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? "bg-[#00ff41] shadow-[0_0_8px_#00ff41]" : "bg-red-500 animate-pulse"
              }`}
            />
            <span className="font-label-code text-[10px] text-[#b9ccb2]">
              {connected
                ? "LIVE_STREAM: ACTIVE"
                : sseError
                ? `STREAM: ${sseError.toUpperCase()}`
                : "STREAM: CONNECTING..."}
            </span>
          </div>
        </div>
      </div>

      {/* Top Telemetry Strip */}
      <div className="px-6 py-2 bg-[#1c1b1b] border-b border-[#3b4b37]/30 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-[#00e639] rounded-full animate-ping"></span>
            <span className="font-label-code text-[#00e639] text-[10px]">INGESTION: ACTIVE</span>
          </div>
          <div className="font-label-code text-[10px] text-[#b9ccb2]">
            BACKEND: <span className="text-white">LOCAL_DISK / S3</span>
          </div>
          <div className="font-label-code text-[10px] text-[#b9ccb2] hidden sm:block">
            STAGING: <span className="text-white">INFRA/STAGING</span>
          </div>
        </div>
        <div className="font-label-code text-[10px] text-[#00dbe7] animate-pulse">
          {connected ? "STREAMING TELEMETRY..." : "TELEMETRY PAUSED"}
        </div>
      </div>

      <div className="px-6 py-6 max-w-[1600px] w-full mx-auto flex flex-col lg:flex-row gap-6">
        {/* Left Side: Active Containers */}
        <div className="flex-[7] bg-[#1c1b1b]/40 border border-[#3b4b37] relative rounded-sm flex flex-col shadow-2xl min-h-[520px]">
          <div className="scanline-overlay absolute inset-0 z-0 pointer-events-none opacity-10"></div>
          
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#3b4b37] bg-[#2a2a2a]/50 z-10">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[16px] text-[#00e639]">terminal</span>
              <span className="font-label-code text-[10px] text-[#00e639] uppercase font-bold">
                Active Containers
              </span>
              <span className="font-display-tech text-[10px] text-[#84967e]">
                [{containers.length}]
              </span>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-[#0e0e0e] border border-[#3b4b37] rounded-none px-2 py-1 font-label-code text-[9px] text-[#b9ccb2] focus:outline-none focus:border-[#00f1fe] cursor-pointer"
              >
                <option value="">ALL_STATES</option>
                <option value="INITIALIZED">INITIALIZED</option>
                <option value="PROCESSING">PROCESSING</option>
                <option value="SYNCED">SYNCED</option>
                <option value="FAILED">FAILED</option>
              </select>
              <select
                value={filterVector}
                onChange={(e) => setFilterVector(e.target.value)}
                className="bg-[#0e0e0e] border border-[#3b4b37] rounded-none px-2 py-1 font-label-code text-[9px] text-[#b9ccb2] focus:outline-none focus:border-[#00f1fe] cursor-pointer"
              >
                <option value="">ALL_VECTORS</option>
                <option value="PHARMA_R3">PHARMA_R3</option>
                <option value="IOT_GRID">IOT_GRID</option>
                <option value="QUANT_ALPHA">QUANT_ALPHA</option>
              </select>
              <button
                onClick={() => fetchContainers()}
                className="p-1 rounded border border-[#3b4b37] text-[#b9ccb2] hover:text-[#00f1fe] hover:border-[#00f1fe]/50 transition-all cursor-pointer bg-[#0e0e0e]"
                title="Refresh"
              >
                <span
                  className={`material-symbols-outlined text-[14px] ${loadingList ? "animate-spin" : ""}`}
                >
                  refresh
                </span>
              </button>
            </div>
          </div>

          {/* Table Area */}
          <div className="flex-1 overflow-auto z-10 custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#0e0e0e] border-b border-[#3b4b37]/30 z-20">
                <tr>
                  <th className="py-2.5 px-4 font-label-code text-[10px] text-[#b9ccb2] tracking-wider">CALLSIGN_ALIAS / ID</th>
                  <th className="py-2.5 px-4 font-label-code text-[10px] text-[#b9ccb2] tracking-wider hidden md:table-cell text-left">VECTOR_TYPE</th>
                  <th className="py-2.5 px-4 font-label-code text-[10px] text-[#b9ccb2] tracking-wider hidden lg:table-cell text-left">FILE_SIZE</th>
                  <th className="py-2.5 px-4 font-label-code text-[10px] text-[#b9ccb2] tracking-wider text-center">STATUS</th>
                  <th className="py-2.5 px-4 font-label-code text-[10px] text-[#b9ccb2] tracking-wider hidden xl:table-cell text-left">CREATED_AT</th>
                </tr>
              </thead>
              <tbody className="font-body-mono-sm text-[12px] text-[#e5e2e1]/80 divide-y divide-[#3b4b37]/10">
                {loadingList ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center">
                      <div className="inline-flex items-center gap-3 text-[#84967e]">
                        <span className="material-symbols-outlined animate-spin text-[#00f1fe]">
                          autorenew
                        </span>
                        <span className="font-label-code text-[10px]">LOADING CONTAINERS...</span>
                      </div>
                    </td>
                  </tr>
                ) : containers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-24 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span className="material-symbols-outlined text-[48px] text-[#3b4b37]">
                          inbox
                        </span>
                        <span className="font-label-code text-[10px] text-[#84967e]">
                          NO CONTAINERS FOUND — UPLOAD A PAYLOAD TO BEGIN
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  containers.map((c) => (
                    <ContainerGridRow
                      key={c.container_id}
                      container={c}
                      liveUpdate={liveMap.get(c.container_id)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side: Upload Panel & Live event ticker */}
        <div className="flex-[3] flex flex-col gap-6">
          {token && <UploadPanel token={token} onUploaded={handleUploaded} />}

          {/* Live event ticker */}
          {liveMap.size > 0 && (
            <div className="bg-[#1c1b1b]/80 backdrop-blur-md border border-[#3b4b37] rounded-sm p-4 relative chamfer-tl shadow-2xl overflow-hidden flex flex-col gap-3">
              <div className="scanline-overlay absolute inset-0 z-0 pointer-events-none opacity-10"></div>
              
              <div className="flex justify-between items-center border-b border-[#3b4b37] pb-1.5 z-10">
                <h2 className="font-label-code text-[10px] text-[#00dbe7] flex items-center gap-2 font-bold uppercase">
                  <span className="material-symbols-outlined text-sm">history</span>
                  [LIVE_EVENT_STREAM]
                </h2>
              </div>
              
              <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar z-10 pr-1">
                {[...liveMap.values()]
                  .sort(
                    (a, b) =>
                      new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
                  )
                  .slice(0, 20)
                  .map((e) => (
                    <div
                      key={e.container_id + e.occurred_at}
                      className="flex items-center gap-2.5 font-body-mono-sm text-[11px] leading-tight border-b border-[#3b4b37]/10 pb-1"
                    >
                      <span className="text-[#00e639] whitespace-nowrap">
                        {new Date(e.occurred_at).toLocaleTimeString()}
                      </span>
                      <span className="text-[#e5e2e1] font-bold truncate max-w-[100px]">{e.callsign_alias}</span>
                      {e.from_state && (
                        <>
                          <span className="text-[#84967e]/60">{e.from_state}</span>
                          <span className="material-symbols-outlined text-[10px] text-[#84967e]/60">
                            arrow_forward
                          </span>
                        </>
                      )}
                      <span
                        className={`px-1 py-0.5 text-[8px] font-bold ${
                          e.to_state === "SYNCED"
                            ? "bg-primary-container/20 text-[#00ff41]"
                            : e.to_state === "FAILED"
                            ? "bg-error-container/20 text-error"
                            : "bg-secondary-container/20 text-[#00f1fe]"
                        }`}
                      >
                        {e.to_state}
                      </span>
                      {e.detail && (
                        <span className="text-[#b9ccb2]/60 truncate flex-1">{e.detail}</span>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
