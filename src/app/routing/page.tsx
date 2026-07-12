"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";
import { useContainerStream, ContainerState } from "@/hooks/useContainerStream";
import { TerminalLoadingState } from "@/components/TerminalLoadingState";

// ── Types ──────────────────────────────────────────────────────────────────────

interface RegionStat {
  region: string;
  lat: number;
  lon: number;
  container_count: number;
  active_count: number;
  newest_event_at?: string;
}

interface ContainerShort {
  id: string;
  region: string;
  status: string;
}

// Helper to determine region status color
function getRegionColor(active: number, total: number): string {
  if (total === 0) return "text-[#84967e]";
  if (active > 0) return "text-[#00f1fe]"; // Processing
  return "text-[#00e639]"; // Synced/nominal
}

// ── Interactive Globe Component ───────────────────────────────────────────────

function InteractiveGlobe({ regions }: { regions: RegionStat[] }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = canvas.width = canvas.offsetWidth;
    let height = canvas.height = canvas.offsetHeight;

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener("resize", handleResize);

    const radius = 130;
    let angleX = 0.3;
    let angleY = 0.8;
    let targetAngleX = 0.3;
    let targetAngleY = 0.8;
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    // Generate globe grid dots
    const sphereDots: { x: number; y: number; z: number }[] = [];
    const latCount = 16;
    const lonCount = 28;
    for (let i = 1; i < latCount; i++) {
      const lat = (Math.PI * i) / latCount - Math.PI / 2;
      for (let j = 0; j < lonCount; j++) {
        const lon = (2 * Math.PI * j) / lonCount;
        sphereDots.push({
          x: radius * Math.cos(lat) * Math.sin(lon),
          y: radius * Math.sin(lat),
          z: radius * Math.cos(lat) * Math.cos(lon),
        });
      }
    }

    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      targetAngleY += dx * 0.007;
      targetAngleX += dy * 0.007;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    };

    const handleMouseUp = () => {
      isDragging = false;
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    let animationFrameId: number;
    let pulseAngle = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      angleX += (targetAngleX - angleX) * 0.1;
      angleY += (targetAngleY - angleY) * 0.1;
      angleX = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, angleX));

      if (!isDragging) {
        targetAngleY += 0.0012;
      }

      pulseAngle += 0.05;
      const pulseRadius = 6 + Math.sin(pulseAngle) * 4;

      const centerX = width / 2;
      const centerY = height / 2;
      const fov = 350;

      // Project grid dots
      const projectedDots: { px: number; py: number; zVal: number }[] = [];
      for (const d of sphereDots) {
        const cosY = Math.cos(angleY);
        const sinY = Math.sin(angleY);
        let x1 = d.x * cosY - d.z * sinY;
        let z1 = d.x * sinY + d.z * cosY;

        const cosX = Math.cos(angleX);
        const sinX = Math.sin(angleX);
        let y2 = d.y * cosX - z1 * sinX;
        let z2 = d.y * sinX + z1 * cosX;

        const scale = fov / (fov + z2);
        projectedDots.push({
          px: centerX + x1 * scale,
          py: centerY + y2 * scale,
          zVal: z2,
        });
      }

      // Draw grid dots
      for (const p of projectedDots) {
        const isFront = p.zVal < 0;
        const opacity = isFront
          ? Math.max(0.1, 0.45 * (1 + p.zVal / radius))
          : Math.max(0.02, 0.1 * (1 - p.zVal / radius));

        ctx.beginPath();
        ctx.arc(p.px, p.py, isFront ? 1.2 : 0.8, 0, 2 * Math.PI);
        ctx.fillStyle = isFront ? `rgba(114, 255, 112, ${opacity})` : `rgba(59, 75, 55, ${opacity})`;
        ctx.fill();
      }

      // Draw equator ring outline
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(235, 255, 226, 0.07)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Project regions on globe
      const projectedNodes = regions.map((node) => {
        const radLat = (node.lat * Math.PI) / 180;
        const radLon = (node.lon * Math.PI) / 180;

        const nx = radius * Math.cos(radLat) * Math.sin(radLon);
        const ny = -radius * Math.sin(radLat);
        const nz = radius * Math.cos(radLat) * Math.cos(radLon);

        const cosY = Math.cos(angleY);
        const sinY = Math.sin(angleY);
        let x1 = nx * cosY - nz * sinY;
        let z1 = nx * sinY + nz * cosY;

        const cosX = Math.cos(angleX);
        const sinX = Math.sin(angleX);
        let y2 = ny * cosX - z1 * sinX;
        let z2 = ny * sinX + z1 * cosX;

        const scale = fov / (fov + z2);
        return {
          ...node,
          px: centerX + x1 * scale,
          py: centerY + y2 * scale,
          zVal: z2,
          isFront: z2 < 0,
        };
      });

      // Project core point (0, 0)
      const coreRadLat = 0;
      const coreRadLon = 0;
      const coreNx = radius * Math.cos(coreRadLat) * Math.sin(coreRadLon);
      const coreNy = -radius * Math.sin(coreRadLat);
      const coreNz = radius * Math.cos(coreRadLat) * Math.cos(coreRadLon);
      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);
      let coreX1 = coreNx * cosY - coreNz * sinY;
      let coreZ1 = coreNx * sinY + coreNz * cosY;
      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);
      let coreY2 = coreNy * cosX - coreZ1 * sinX;
      let coreZ2 = coreNy * sinX + coreZ1 * cosX;
      const coreScale = fov / (fov + coreZ2);
      const corePx = centerX + coreX1 * coreScale;
      const corePy = centerY + coreY2 * coreScale;

      // Draw lines: region coordinate → (0, 0) only if active_count > 0 (PROCESSING status)
      for (const n of projectedNodes) {
        if (n.active_count > 0) {
          const bothFront = n.isFront && (coreZ2 < 0);
          const opacity = bothFront ? 0.35 : 0.08;

          ctx.beginPath();
          ctx.moveTo(n.px, n.py);
          const midX = (n.px + corePx) / 2;
          const midY = (n.py + corePy) / 2 - 30;
          ctx.quadraticCurveTo(midX, midY, corePx, corePy);

          ctx.strokeStyle = bothFront ? "rgba(0, 241, 254, 0.4)" : "rgba(59, 75, 55, 0.2)";
          ctx.lineWidth = bothFront ? 1.5 : 0.8;
          ctx.stroke();
        }
      }

      // Draw nodes and labels
      for (const n of projectedNodes) {
        const color = n.active_count > 0 ? "rgba(0, 241, 254, 1)" : "rgba(0, 255, 65, 1)";
        const textColor = n.active_count > 0 ? "#00f1fe" : "#00ff41";

        if (n.isFront) {
          ctx.beginPath();
          ctx.arc(n.px, n.py, pulseRadius, 0, 2 * Math.PI);
          ctx.strokeStyle = color.replace("1)", "0.3)");
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(n.px, n.py, n.isFront ? 4.5 : 2.5, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.lineWidth = 1;
        ctx.stroke();

        if (n.isFront) {
          ctx.beginPath();
          ctx.moveTo(n.px, n.py);
          ctx.lineTo(n.px + (n.px > centerX ? 25 : -25), n.py - 20);
          ctx.strokeStyle = color.replace("1)", "0.5)");
          ctx.lineWidth = 1;
          ctx.stroke();

          const textX = n.px + (n.px > centerX ? 25 : -25);
          const textY = n.py - 20;
          ctx.font = "bold 9px monospace";

          ctx.fillStyle = "rgba(28, 27, 27, 0.85)";
          const boxWidth = 130;
          const boxHeight = 28;
          const boxX = n.px > centerX ? textX : textX - boxWidth;
          const boxY = textY - boxHeight / 2;

          ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
          ctx.strokeStyle = color.replace("1)", "0.8)");
          ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

          ctx.fillStyle = textColor;
          ctx.fillText(n.region, boxX + 6, boxY + 11);
          ctx.fillStyle = "#b9ccb2";
          ctx.font = "8px monospace";
          ctx.fillText(`Containers: ${n.container_count} (${n.active_count} act)`, boxX + 6, boxY + 22);
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (canvas) {
        canvas.removeEventListener("mousedown", handleMouseDown);
      }
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      cancelAnimationFrame(animationFrameId);
    };
  }, [regions]);

  return (
    <div className="relative w-[500px] h-[500px] flex items-center justify-center">
      <canvas ref={canvasRef} className="w-full h-full cursor-grab active:cursor-grabbing z-10" />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function GlobalRouting() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [regions, setRegions] = useState<RegionStat[]>([]);
  const [sseSubscribers, setSseSubscribers] = useState(0);
  const [containers, setContainers] = useState<ContainerShort[]>([]);
  const [loading, setLoading] = useState(true);

  // Load token
  useEffect(() => {
    const t = localStorage.getItem("session_token");
    if (!t) {
      router.push("/login");
      return;
    }
    setToken(t);
  }, [router]);

  const fetchTopology = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/routing/topology`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRegions(data.regions ?? []);
        setSseSubscribers(data.sse_subscriber_count ?? 0);
      }
    } catch (err) {
      console.error("Failed to fetch routing topology", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchContainers = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/containers/active?limit=6`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const mapped = (data.containers ?? []).map((c: any) => ({
          id: c.container_id.slice(0, 10),
          region: c.origin_region || "US-WEST-2",
          status: c.status_state,
        }));
        setContainers(mapped);
      }
    } catch (err) {
      console.error("Failed to fetch containers for routing page list", err);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchTopology();
      fetchContainers();
    }
  }, [token, fetchTopology, fetchContainers]);

  // Real-time SSE stream log
  const { connected } = useContainerStream(token);
  const [consoleMsgs, setConsoleMsgs] = useState<string[]>([]);
  const seenKeys = useRef(new Set<string>());

  useEffect(() => {
    const handler = (e: Event) => {
      const update = (e as CustomEvent<ContainerState>).detail;
      const key = `${update.container_id}-${update.to_state}-${update.occurred_at}`;
      if (seenKeys.current.has(key)) return;
      seenKeys.current.add(key);

      const msg = `>> ${update.callsign_alias || update.container_id.slice(0, 8)} transition to ${update.to_state}`;
      setConsoleMsgs((prev) => [msg, ...prev].slice(0, 15));

      // Refresh topology and containers on event
      fetchTopology();
      fetchContainers();
    };

    window.addEventListener("containerStatusUpdated", handler);
    return () => window.removeEventListener("containerStatusUpdated", handler);
  }, [fetchTopology, fetchContainers]);

  // Derived metrics
  const totalContainers = regions.reduce((acc, curr) => acc + curr.container_count, 0);
  const activeRegionsCount = regions.filter((r) => r.container_count > 0).length;

  if (loading) {
    return (
      <div className="bg-[#0A0A0A] text-[#e5e2e1] min-h-screen flex items-center justify-center">
        <TerminalLoadingState label="FETCHING TOPOLOGY..." />
      </div>
    );
  }

  return (
    <div className="bg-[#0A0A0A] text-[#e5e2e1] font-body-mono selection:bg-primary-container selection:text-on-primary-container overflow-hidden h-screen flex flex-col">
      <div className="flex flex-1 overflow-hidden relative">
        {/* Main Content Area */}
        <div className="flex-grow relative overflow-hidden bg-[#0A0A0A] flex z-10 h-screen">
          <div className="absolute inset-0 scanline z-10 pointer-events-none"></div>

          {/* Left Sidebar Data Panel */}
          <div className="w-80 h-full border-r border-[#3b4b37] bg-[#131313]/40 backdrop-blur-sm z-20 flex flex-col p-4 gap-4 overflow-y-auto custom-scrollbar">
            {/* Region Container Index Card */}
            <div className="tactical-bracket p-3 bg-[#1c1b1b]/80 border border-[#3b4b37] relative">
              <div className="flex justify-between items-center mb-2">
                <span className="font-label-code text-[#00e639] text-[10px]">[REGION_CONTAINER_INDEX]</span>
              </div>
              <div className="space-y-2">
                {regions.length === 0 ? (
                  <div className="text-[11px] opacity-40 text-center py-2">NO REGIONS ACTIVE</div>
                ) : (
                  regions.map((node, i) => (
                    <div key={i} className="flex justify-between text-[12px]">
                      <span className="opacity-50 text-[#b9ccb2]">{node.region}</span>
                      <span className={`font-bold ${getRegionColor(node.active_count, node.container_count)}`}>
                        {node.container_count} containers ({node.active_count} active)
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* SSE Subscribers Gauge */}
            <div className="tactical-bracket p-3 bg-[#1c1b1b]/80 border border-[#3b4b37] relative">
              <div className="flex justify-between items-center mb-2">
                <span className="font-label-code text-[#00e639] text-[10px]">[SSE_SUBSCRIBERS]</span>
              </div>
              <div className="text-[24px] font-display-tech font-bold text-white mb-1">
                {sseSubscribers}
              </div>
              <div className="font-body-mono-sm text-[12px] text-[#b9ccb2] mb-4">
                ACTIVE_STREAMS / SUBSCRIBERS
              </div>
              <div className="segment-bar flex">
                {Array.from({ length: 12 }).map((_, idx) => (
                  <span
                    key={idx}
                    className={idx < Math.min(12, sseSubscribers) ? "active" : ""}
                  />
                ))}
              </div>
            </div>

            {/* Real SSE Log stream */}
            <div className="flex-1 bg-black/60 p-2 font-body-mono-sm border border-[#3b4b37] overflow-hidden flex flex-col rounded-sm">
              <div className="text-[#00e639] opacity-40 mb-1 font-label-code text-[10px] tracking-wider">
                LIVE_EVENT_LOGGER
              </div>
              <div className="custom-scrollbar overflow-y-auto flex-1 text-[10px] leading-tight space-y-1">
                {consoleMsgs.length === 0 ? (
                  <p className="text-[#00e639] opacity-25">Awaiting live transitions...</p>
                ) : (
                  consoleMsgs.map((msg, i) => (
                    <p key={i} className="text-[#00e639] truncate">
                      {msg}
                    </p>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Central Earth & Topology */}
          <div className="flex-1 relative globe-container flex items-center justify-center p-8 overflow-visible">
            <div
              className="absolute inset-0 opacity-10 pointer-events-none"
              style={{
                backgroundImage: "radial-gradient(#00e639 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
            ></div>

            {/* Globe Visualisation */}
            <InteractiveGlobe regions={regions} />

            {/* Floating Telemetry Coordinates */}
            <div className="absolute top-8 left-8 space-y-4 pointer-events-none">
              <div className="font-label-code text-[12px] bg-black/55 p-3 border-l-2 border-[#00ff41] text-[#b9ccb2] leading-relaxed">
                CORE_LINK: ACTIVE<br />
                STREAM_HEALTH: nominal<br />
                ACTIVE_CHANNELS: {activeRegionsCount}
              </div>
            </div>

            <div className="absolute bottom-8 right-8 text-right pointer-events-none">
              <div className="font-display-tech text-[20px] text-[#00ff41] opacity-40">
                REAL-TIME_ROUTING_GRID
              </div>
              <div className="font-label-code text-[#b9ccb2] text-[10px] mt-1">
                TOPOLOGY_DEPTH: LEVEL_4
              </div>
            </div>
          </div>

          {/* Right Sidebar Data Panel */}
          <div className="w-80 h-full border-l border-[#3b4b37] bg-[#131313]/40 backdrop-blur-sm z-20 flex flex-col p-4 gap-4 overflow-y-auto custom-scrollbar">
            {/* Global Node Health */}
            <div className="tactical-bracket p-3 bg-[#1c1b1b]/80 border border-[#3b4b37] relative">
              <div className="font-label-code text-[#00e639] text-[10px] mb-3">GLOBAL_NODE_HEALTH</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-black/40 border border-[#3b4b37]">
                  <div className="text-[9px] opacity-50 mb-1 text-[#b9ccb2] uppercase">TOTAL CONTAINERS</div>
                  <div className="text-[20px] font-bold text-[#00e639]">{totalContainers}</div>
                </div>
                <div className="p-2 bg-black/40 border border-[#3b4b37]">
                  <div className="text-[9px] opacity-50 mb-1 text-[#b9ccb2] uppercase">ACTIVE REGIONS</div>
                  <div className="text-[20px] font-bold text-[#00e639]">{activeRegionsCount}</div>
                </div>
              </div>
            </div>

            {/* Topology radar graphic */}
            <div className="tactical-bracket p-3 bg-[#1c1b1b]/80 border border-[#3b4b37] aspect-square relative overflow-hidden flex flex-col">
              <div className="font-label-code text-[#00e639] text-[10px] mb-2 uppercase">routing_topology_v5</div>
              <div className="flex-1 flex items-center justify-center">
                <svg className="w-full h-full p-2" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" fill="none" r="40" stroke="#3b4b37" strokeDasharray="2 2"></circle>
                  <circle className="animate-pulse" cx="50" cy="50" fill="#00e639" r="3"></circle>
                  <path d="M50 50 L20 20 M50 50 L80 20 M50 50 L50 90" stroke="#00e639" strokeWidth="1"></path>
                  <circle cx="20" cy="20" fill="#00f1fe" r="2.5"></circle>
                  <circle cx="80" cy="20" fill="#00f1fe" r="2.5"></circle>
                  <circle cx="50" cy="90" fill="#ffb4ab" r="2.5"></circle>
                </svg>
              </div>
            </div>

            {/* Real container rows */}
            <div className="tactical-bracket p-3 bg-[#1c1b1b]/80 border border-[#3b4b37] flex-1 overflow-hidden flex flex-col">
              <div className="font-label-code text-[#00e639] text-[10px] mb-2 uppercase">container_routing_flags</div>
              <div className="overflow-y-auto custom-scrollbar flex-1">
                {containers.length === 0 ? (
                  <div className="text-[11px] opacity-40 text-center py-4">NO ACTIVE CONTAINERS</div>
                ) : (
                  <table className="w-full text-left font-body-mono-sm">
                    <thead className="text-[9px] opacity-40 sticky top-0 bg-[#1c1b1b] z-10 text-[#b9ccb2]">
                      <tr>
                        <th className="pb-2">CONTAINER_ID</th>
                        <th className="pb-2">REGION</th>
                        <th className="pb-2 text-right">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className="text-[11px] divide-y divide-[#3b4b37]/20 text-[#e5e2e1]/80">
                      {containers.map((p, idx) => (
                        <tr key={idx}>
                          <td className="py-1 font-bold">{p.id}</td>
                          <td className="py-1">{p.region}</td>
                          <td
                            className={`py-1 text-right font-bold ${
                              p.status === "SYNCED"
                                ? "text-[#00e639]"
                                : p.status === "FAILED"
                                ? "text-red-400"
                                : "text-[#00f1fe]"
                            }`}
                          >
                            {p.status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
