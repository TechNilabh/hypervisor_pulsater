"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

interface LatencyNode {
  name: string;
  lat: string;
  color: string;
}

interface PacketFlag {
  pid: string;
  lag: number;
  status: "SYNC" | "REPL" | "LAG";
}

interface GlobeNode {
  name: string;
  lat: number;
  lon: number;
  color: string;
  textColor: string;
  details: string;
}

function InteractiveGlobe() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  
  const nodes: GlobeNode[] = [
    { name: "NODE_US_EAST_01", lat: 37.77, lon: -122.41, color: "rgba(0, 255, 65, 1)", textColor: "#00ff41", details: "THROUGHPUT: 18.2 TB/s" },
    { name: "NODE_EU_CENT_04", lat: 50.11, lon: 8.68, color: "rgba(0, 241, 254, 1)", textColor: "#00f1fe", details: "SYNC_RATE: 120.4 Gbit" },
    { name: "NODE_ASIA_SOUTH_01", lat: 19.07, lon: 72.87, color: "rgba(255, 180, 171, 1)", textColor: "#ffb4ab", details: "LATENCY: 214ms" }
  ];

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
          z: radius * Math.cos(lat) * Math.cos(lon)
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
          zVal: z2
        });
      }

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

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(235, 255, 226, 0.07)";
      ctx.lineWidth = 1;
      ctx.stroke();

      const projectedNodes = nodes.map(node => {
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
          isFront: z2 < 0
        };
      });

      // Draw lines
      for (let i = 0; i < projectedNodes.length; i++) {
        for (let j = i + 1; j < projectedNodes.length; j++) {
          const n1 = projectedNodes[i];
          const n2 = projectedNodes[j];
          const bothFront = n1.isFront && n2.isFront;
          const opacity = bothFront ? 0.35 : 0.08;

          ctx.beginPath();
          ctx.moveTo(n1.px, n1.py);
          const midX = (n1.px + n2.px) / 2;
          const midY = (n1.py + n2.py) / 2 - 30;
          ctx.quadraticCurveTo(midX, midY, n2.px, n2.py);
          
          ctx.strokeStyle = bothFront ? "rgba(0, 241, 254, 0.4)" : "rgba(59, 75, 55, 0.2)";
          ctx.lineWidth = bothFront ? 1.5 : 0.8;
          ctx.stroke();
        }
      }

      // Draw nodes and label cards
      for (const n of projectedNodes) {
        const opacity = n.isFront ? 1.0 : 0.2;
        
        if (n.isFront) {
          ctx.beginPath();
          ctx.arc(n.px, n.py, pulseRadius, 0, 2 * Math.PI);
          ctx.strokeStyle = n.color.replace("1)", "0.3)");
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(n.px, n.py, n.isFront ? 4.5 : 2.5, 0, 2 * Math.PI);
        ctx.fillStyle = n.color;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.lineWidth = 1;
        ctx.stroke();

        if (n.isFront) {
          ctx.beginPath();
          ctx.moveTo(n.px, n.py);
          ctx.lineTo(n.px + (n.px > centerX ? 25 : -25), n.py - 20);
          ctx.strokeStyle = n.color.replace("1)", "0.5)");
          ctx.lineWidth = 1;
          ctx.stroke();

          const textX = n.px + (n.px > centerX ? 25 : -25);
          const textY = n.py - 20;
          ctx.font = "bold 9px monospace";
          
          ctx.fillStyle = "rgba(28, 27, 27, 0.85)";
          const boxWidth = 120;
          const boxHeight = 28;
          const boxX = n.px > centerX ? textX : textX - boxWidth;
          const boxY = textY - boxHeight / 2;
          
          ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
          ctx.strokeStyle = n.color.replace("1)", "0.8)");
          ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

          ctx.fillStyle = n.textColor;
          ctx.fillText(n.name, boxX + 6, boxY + 11);
          ctx.fillStyle = "#b9ccb2";
          ctx.font = "8px monospace";
          ctx.fillText(n.details, boxX + 6, boxY + 22);
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
  }, []);

  return (
    <div className="relative w-[500px] h-[500px] flex items-center justify-center">
      <canvas 
        ref={canvasRef} 
        className="w-full h-full cursor-grab active:cursor-grabbing z-10"
      />
    </div>
  );
}

export default function GlobalRouting() {
  const [latencies, setLatencies] = useState<LatencyNode[]>([
    { name: "US-EAST-01", lat: "12ms", color: "text-[#00e639]" },
    { name: "EU-WEST-02", lat: "84ms", color: "text-[#00dbe7]" },
    { name: "ASIA-SOUTH-01", lat: "214ms", color: "text-error" }
  ]);

  const [consoleMsgs, setConsoleMsgs] = useState<string[]>([
    ">> REQUEST_HANDOFF: node_771 -> node_004",
    ">> TCP_ACK: packet_id_0923 verified",
    ">> BUFFERING_READY: seq_551",
    ">> ROUTE_OPTIMIZED: via satellite_link_alpha",
    "!! DROPPED_PACKET: resending seq_552",
    ">> TRACE: hopping to hop_22_east"
  ]);

  const [packets, setPackets] = useState<PacketFlag[]>([
    { pid: "#8080", lag: 12.1, status: "SYNC" },
    { pid: "#1024", lag: 84.5, status: "REPL" },
    { pid: "#0042", lag: 214.2, status: "LAG" },
    { pid: "#9911", lag: 15.8, status: "SYNC" },
    { pid: "#3221", lag: 11.2, status: "SYNC" },
    { pid: "#5512", lag: 24.7, status: "SYNC" }
  ]);

  const [throughput, setThroughput] = useState(98.42);
  const [pulseState, setPulseState] = useState(false);

  // Live trace console updates
  useEffect(() => {
    const messages = [
      ">> ROUTE_CACHE_CLEARED",
      ">> NODE_SYST_SYNCING...",
      "!! LATENCY_SPIKE_US_EAST",
      ">> REDIRECTING_TRAFFIC_ASIA",
      ">> TOPOLOGY_GRAPH_RECALIBRATED",
      ">> PACKET_PRIORITY_ADJUSTED",
      ">> REPLICATION_THROUGHPUT_MAX",
      ">> HOPS_EXCEEDED: rerouting path 4"
    ];

    const interval = setInterval(() => {
      const msg = messages[Math.floor(Math.random() * messages.length)];
      setConsoleMsgs(prev => [...prev, msg].slice(-15));
      
      setThroughput(t => Math.max(95, Math.min(99.99, t + (Math.random() - 0.5) * 0.5)));

      setPackets(prev => prev.map(p => {
        const delta = (Math.random() - 0.5) * 5;
        const nextLag = Math.max(8, Number((p.lag + delta).toFixed(1)));
        let nextStatus = p.status;
        if (nextLag > 150) nextStatus = "LAG";
        else if (nextLag > 50) nextStatus = "REPL";
        else nextStatus = "SYNC";
        return { ...p, lag: nextLag, status: nextStatus };
      }));

      setPulseState(p => !p);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-[#0A0A0A] text-[#e5e2e1] font-body-mono selection:bg-primary-container selection:text-on-primary-container overflow-hidden h-screen flex flex-col">
      <div className="flex flex-1 overflow-hidden relative">

        {/* Main Content Area */}
        <div className="flex-grow relative overflow-hidden bg-[#0A0A0A] flex z-10 h-screen">
          {/* Scanline Overlay */}
          <div className="absolute inset-0 scanline z-10 pointer-events-none"></div>
          
          {/* Left Sidebar Data Panel */}
          <div className="w-80 h-full border-r border-[#3b4b37] bg-[#131313]/40 backdrop-blur-sm z-20 flex flex-col p-4 gap-4 overflow-y-auto custom-scrollbar">
            
            {/* Latency Index Card */}
            <div className="tactical-bracket p-3 bg-[#1c1b1b]/80 border border-[#3b4b37] relative">
              <div className="flex justify-between items-center mb-2">
                <span className="font-label-code text-[#00e639] text-[10px]">[NODE_LATENCY_INDEX]</span>
                <span className="material-symbols-outlined text-[12px] opacity-40 text-[#84967e]">close</span>
              </div>
              <div className="space-y-2">
                {latencies.map((node, i) => (
                  <div key={i} className="flex justify-between text-[12px]">
                    <span className="opacity-50 text-[#b9ccb2]">{node.name}</span>
                    <span className={`${node.color} font-bold`}>{node.lat}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Connection Pool Gauge */}
            <div className="tactical-bracket p-3 bg-[#1c1b1b]/80 border border-[#3b4b37] relative">
              <div className="flex justify-between items-center mb-2">
                <span className="font-label-code text-[#00e639] text-[10px]">[CONNECTION_POOL]</span>
              </div>
              <div className="text-[24px] font-display-tech font-bold text-white mb-1">{throughput.toFixed(2)}%</div>
              <div className="font-body-mono-sm text-[12px] text-[#b9ccb2] mb-4">THROUGHPUT_STABLE</div>
              <div className="segment-bar flex">
                <span className="active"></span><span className="active"></span><span className="active"></span><span className="active"></span>
                <span className="active"></span><span className="active"></span><span className="active"></span><span className="active"></span>
                <span className="active"></span><span className={pulseState ? "active" : ""}></span><span></span><span></span>
              </div>
            </div>

            {/* Local Live Console stream */}
            <div className="flex-1 bg-black/60 p-2 font-body-mono-sm border border-[#3b4b37] overflow-hidden flex flex-col rounded-sm">
              <div className="text-[#00e639] opacity-40 mb-1 font-label-code text-[10px] tracking-wider">SYSTEM_STREAM</div>
              <div className="custom-scrollbar overflow-y-auto flex-1 text-[10px] leading-tight space-y-1">
                {consoleMsgs.map((msg, i) => (
                  <p key={i} className={`${msg.startsWith("!!") ? "text-error flicker" : "text-[#00e639]"}`}>
                    {msg}
                  </p>
                ))}
              </div>
            </div>
          </div>

          {/* Central Earth & Knowledge Topology */}
          <div className="flex-1 relative globe-container flex items-center justify-center p-8 overflow-visible">
            {/* Background Grid Texture */}
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: "radial-gradient(#00e639 1px, transparent 1px)", backgroundSize: "32px 32px" }}></div>
            
            {/* Interactive 3D Globe Component */}
            <InteractiveGlobe />

            {/* Floating Telemetry Coordinates */}
            <div className="absolute top-8 left-8 space-y-4 pointer-events-none">
              <div className="font-label-code text-[12px] bg-black/55 p-3 border-l-2 border-[#00ff41] text-[#b9ccb2] leading-relaxed">
                LAT: 40.7128° N<br/>
                LON: 74.0060° W<br/>
                ALT: 22,400 KM<br/>
                LAG_MS: 12.04
              </div>
            </div>

            <div className="absolute bottom-8 right-8 text-right pointer-events-none">
              <div className="font-display-tech text-[20px] text-[#00ff41] opacity-40">REAL-TIME_KNOWLEDGE_SYNTHESIS</div>
              <div className="font-label-code text-[#b9ccb2] text-[10px] mt-1">NODE_DENSITY: 30,000 // TOPOLOGY_DEPTH: LEVEL_4</div>
            </div>
          </div>

          {/* Right Sidebar Data Panel */}
          <div className="w-80 h-full border-l border-[#3b4b37] bg-[#131313]/40 backdrop-blur-sm z-20 flex flex-col p-4 gap-4 overflow-y-auto custom-scrollbar">
            
            {/* Global Node Health */}
            <div className="tactical-bracket p-3 bg-[#1c1b1b]/80 border border-[#3b4b37] relative">
              <div className="font-label-code text-[#00e639] text-[10px] mb-3">GLOBAL_NODE_HEALTH</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-black/40 border border-[#3b4b37]">
                  <div className="text-[9px] opacity-50 mb-1 text-[#b9ccb2] uppercase">CPU_LOAD</div>
                  <div className="text-[20px] font-bold text-[#00e639]">24%</div>
                </div>
                <div className="p-2 bg-black/40 border border-[#3b4b37]">
                  <div className="text-[9px] opacity-50 mb-1 text-[#b9ccb2] uppercase">MEM_USAGE</div>
                  <div className="text-[20px] font-bold text-[#00e639]">12.8G</div>
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

            {/* Packet routing flags table */}
            <div className="tactical-bracket p-3 bg-[#1c1b1b]/80 border border-[#3b4b37] flex-1 overflow-hidden flex flex-col">
              <div className="font-label-code text-[#00e639] text-[10px] mb-2 uppercase">packet_routing_flags</div>
              <div className="overflow-y-auto custom-scrollbar flex-1">
                <table className="w-full text-left font-body-mono-sm">
                  <thead className="text-[9px] opacity-40 sticky top-0 bg-[#1c1b1b] z-10 text-[#b9ccb2]">
                    <tr>
                      <th className="pb-2">PID</th>
                      <th className="pb-2">LAG_MS</th>
                      <th className="pb-2 text-right">STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="text-[11px] divide-y divide-[#3b4b37]/20 text-[#e5e2e1]/80">
                    {packets.map((p, idx) => (
                      <tr key={idx}>
                        <td className="py-1">{p.pid}</td>
                        <td className="py-1">{p.lag}</td>
                        <td className={`py-1 text-right font-bold ${
                          p.status === "SYNC" ? "text-[#00e639]" :
                          p.status === "REPL" ? "text-[#00f1fe]" :
                          "text-error"
                        }`}>{p.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
