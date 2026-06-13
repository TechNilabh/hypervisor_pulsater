"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

// Interactive 3D Wireframe Sphere Component for Homepage Background
function WireframeSphere() {
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

    const points: { x: number; y: number; z: number }[] = [];
    const numLat = 8;
    const numLon = 14;
    const radius = 140;

    for (let i = 1; i < numLat; i++) {
      const lat = (Math.PI * i) / numLat - Math.PI / 2;
      for (let j = 0; j < numLon; j++) {
        const lon = (2 * Math.PI * j) / numLon;
        points.push({
          x: radius * Math.cos(lat) * Math.sin(lon),
          y: radius * Math.sin(lat),
          z: radius * Math.cos(lat) * Math.cos(lon),
        });
      }
    }

    const lines: [number, number][] = [];
    for (let i = 1; i < numLat; i++) {
      const startIdx = (i - 1) * numLon;
      for (let j = 0; j < numLon; j++) {
        const current = startIdx + j;
        const next = startIdx + ((j + 1) % numLon);
        lines.push([current, next]);

        if (i < numLat - 1) {
          const below = current + numLon;
          lines.push([current, below]);
        }
      }
    }

    let angleX = 0.2;
    let angleY = 0.3;
    let targetAngleX = 0.2;
    let targetAngleY = 0.3;
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left - width / 2;
        const my = e.clientY - rect.top - height / 2;
        targetAngleY += mx * 0.00001;
        targetAngleX += my * 0.00001;
        return;
      }
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      targetAngleY += dx * 0.004;
      targetAngleX += dy * 0.004;
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

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      angleX += (targetAngleX - angleX) * 0.1;
      angleY += (targetAngleY - angleY) * 0.1;

      if (!isDragging) {
        targetAngleY += 0.0015;
        targetAngleX += 0.0003;
      }

      const projected: { px: number; py: number; zVal: number }[] = [];
      const centerX = width / 2;
      const centerY = height / 2;
      const fov = 300;

      for (const p of points) {
        const cosY = Math.cos(angleY);
        const sinY = Math.sin(angleY);
        let x1 = p.x * cosY - p.z * sinY;
        let z1 = p.x * sinY + p.z * cosY;

        const cosX = Math.cos(angleX);
        const sinX = Math.sin(angleX);
        let y2 = p.y * cosX - z1 * sinX;
        let z2 = p.y * sinX + z1 * cosX;

        const scale = fov / (fov + z2 + radius);
        projected.push({
          px: centerX + x1 * scale,
          py: centerY + y2 * scale,
          zVal: z2,
        });
      }

      // Draw wireframe lines
      for (const [start, end] of lines) {
        const p1 = projected[start];
        const p2 = projected[end];
        const avgZ = (p1.zVal + p2.zVal) / 2;
        const opacity = Math.max(0.02, Math.min(0.5, (radius - avgZ) / (2 * radius)));

        ctx.beginPath();
        ctx.moveTo(p1.px, p1.py);
        ctx.lineTo(p2.px, p2.py);
        ctx.strokeStyle = `rgba(0, 241, 254, ${opacity * 0.5})`;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }

      // Draw point nodes
      for (const p of projected) {
        const opacity = Math.max(0.05, Math.min(0.7, (radius - p.zVal) / (2 * radius)));
        ctx.beginPath();
        ctx.arc(p.px, p.py, 1.5, 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(0, 255, 65, ${opacity * 0.8})`;
        ctx.fill();
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
    <canvas 
      ref={canvasRef}
      className="w-full h-full cursor-grab active:cursor-grabbing"
    />
  );
}

export default function Home() {
  const [logs, setLogs] = useState([
    { line: 102, time: "14:22:01.004", type: "INSERT", color: "text-secondary-fixed", payload: 'payload: { "id": "uuid-808", "state": "active", "val": 420.69 }' },
    { line: 103, time: "14:22:01.012", type: "UPDATE", color: "text-surface-tint", payload: 'delta: { "prev_state": "idle", "new_state": "active" }' },
    { line: 104, time: "14:22:01.045", type: "DELETE", color: "text-error", payload: 'target: { "id": "tmp-991" }' },
    { line: 105, time: "14:22:01.050", type: "INSERT", color: "text-secondary-fixed", payload: 'payload: { "id": "uuid-809", "state": "init", "val": 100.00 }' },
    { line: 106, time: "14:22:01.102", type: "SYSTEM", color: "text-primary-fixed", payload: "> Syncing to BigQuery shard [us-east-1a]..." },
    { line: 107, time: "14:22:01.115", type: "SYSTEM", color: "text-on-surface", payload: "> COMMIT_SUCCESS: TxID: 0x9f1a23" }
  ]);
  const [lineCounter, setLineCounter] = useState(108);

  // Live log simulation in the Toolkit editor
  useEffect(() => {
    const payloads = [
      'payload: { "id": "uuid-810", "state": "active", "val": 12.04 }',
      'delta: { "prev_state": "active", "new_state": "idle" }',
      'target: { "id": "tmp-882" }',
      'payload: { "id": "uuid-811", "state": "init", "val": 300.22 }',
      "> Syncing to BigQuery shard [us-east-1b]...",
      "> COMMIT_SUCCESS: TxID: 0x9f1a24",
      ">> WORKER_POOL: running thread 12",
      ">> CHANNEL_SATURATION: 12% nominal"
    ];

    const types = ["INSERT", "UPDATE", "DELETE", "INSERT", "SYSTEM", "SYSTEM", "SYSTEM", "SYSTEM"];
    const colors = ["text-secondary-fixed", "text-surface-tint", "text-error", "text-secondary-fixed", "text-primary-fixed", "text-on-surface", "text-secondary-fixed-dim", "text-primary-fixed-dim"];

    const interval = setInterval(() => {
      const idx = Math.floor(Math.random() * payloads.length);
      const now = new Date();
      const timeStr = now.toTimeString().split(" ")[0] + "." + String(now.getMilliseconds()).padStart(3, "0");
      
      setLogs(prev => [
        ...prev,
        {
          line: lineCounter,
          time: timeStr,
          type: types[idx],
          color: colors[idx],
          payload: payloads[idx]
        }
      ].slice(-12)); // keep last 12 logs
      setLineCounter(c => c + 1);
    }, 2500);

    return () => clearInterval(interval);
  }, [lineCounter]);

  return (
    <div className="font-body-mono selection:bg-secondary-fixed selection:text-on-secondary-fixed min-h-screen bg-[#0A0A0A] text-[#e5e2e1] overflow-x-hidden flex flex-col">
      {/* Hero Section */}
      <section className="relative h-[calc(100vh-64px)] flex flex-col items-center justify-center pt-0 overflow-hidden">
        {/* Starry Coordinates Background */}
        <div className="absolute inset-0 z-0 opacity-40 pointer-events-none" style={{ backgroundImage: "radial-gradient(rgba(0, 241, 254, 0.15) 1px, transparent 1px)", backgroundSize: "48px 48px" }}></div>
        <div className="relative z-10 text-center px-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#1c1b1b] border border-[#3b4b37] rounded mb-8">
            <span className="w-2 h-2 bg-[#72ff70] rounded-full animate-pulse"></span>
            <span className="font-label-code text-[10px] text-[#b9ccb2] tracking-widest uppercase">Sub-Millisecond CDC Logic</span>
          </div>
          <h1 className="font-display-tech text-[48px] md:text-[84px] text-[#72ff70] mb-4 tracking-tighter leading-none">
            HYPERVISOR PULSATER
          </h1>
          <p className="font-body-mono text-[20px] md:text-[24px] text-[#b9ccb2] max-w-3xl mx-auto mb-12">
            Asynchronous Change Data Capture Middleware <br/>
            <span className="text-[#00e639]">Core Status: Ready for Deployment</span>
          </p>
          <Link href="/error-terminal" className="px-10 py-5 bg-transparent border-2 border-[#74f5ff] text-[#74f5ff] font-headline-md rounded-full hover:bg-[#74f5ff]/10 transition-all group flex items-center gap-4 mx-auto glow-cyan w-fit">
            INITIALIZE TERMINAL LINK
            <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
          </Link>
        </div>
        {/* Floating Metric Chips */}
        <div className="absolute left-6 top-1/2 -translate-y-1/2 flex flex-col gap-6 hidden lg:flex">
          <div className="p-4 bg-[#131313]/40 backdrop-blur-md border-l-2 border-[#72ff70] tactical-bracket relative">
            <div className="font-label-code text-[10px] text-[#b9ccb2]">LENCY_MS</div>
            <div className="font-display-tech text-[24px] text-[#72ff70]">0.024</div>
          </div>
          <div className="p-4 bg-[#131313]/40 backdrop-blur-md border-l-2 border-[#74f5ff] tactical-bracket relative">
            <div className="font-label-code text-[10px] text-[#b9ccb2]">OPS_RATE</div>
            <div className="font-display-tech text-[24px] text-[#74f5ff]">840K</div>
          </div>
        </div>
        {/* Interactive 3D Wireframe Sphere Background */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[100%] max-w-[800px] h-[350px] z-0 pointer-events-auto opacity-70">
          <WireframeSphere />
        </div>
      </section>

      {/* Flow Section (Transactions + Analytics) */}
      <section className="py-32 px-6 relative border-t border-[#3b4b37] bg-[#0e0e0e]">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-24 items-center">
          <div className="order-2 md:order-1">
            <div className="font-label-code text-[10px] text-[#00e639] mb-4">[MODULE: TRANSACTION_PIPELINE]</div>
            <h2 className="font-headline-lg text-[32px] text-white mb-8">Transactions + Analytics.</h2>
            <p className="font-body-mono text-[14px] text-[#b9ccb2] mb-10 leading-relaxed">
              Powered by high-performance Go execution worker pools and thread-safe channels. Pulsater ensures zero-data loss during high-velocity state changes, bridging the gap between volatile transactional streams and analytical cold storage with sub-millisecond precision.
            </p>
            <div className="flex flex-col gap-2 mb-10">
              <div className="flex items-center gap-4 text-white">
                <span className="material-symbols-outlined text-[#72ff70]">check_circle</span>
                <span className="text-[14px]">Lock-free channel orchestration</span>
              </div>
              <div className="flex items-center gap-4 text-white">
                <span className="material-symbols-outlined text-[#72ff70]">check_circle</span>
                <span className="text-[14px]">Atomic batch-flush sequencing</span>
              </div>
            </div>
            <Link href="/live-cdc" className="px-8 py-3 border border-[#3b4b37] hover:border-[#74f5ff] text-[#b9ccb2] hover:text-[#74f5ff] transition-all font-label-code text-[10px] block w-fit">
              LEARN_MORE
            </Link>
          </div>
          <div className="order-1 md:order-2">
            <div className="bg-[#131313] border border-[#3b4b37] rounded-xl p-6 shadow-2xl relative overflow-hidden">
              <div className="scanline absolute inset-0"></div>
              <div className="flex justify-between items-center mb-6 border-b border-[#3b4b37] pb-2">
                <div className="flex gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#ffb4ab]"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-[#ffdad6]"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-[#00e639]"></div>
                </div>
                <div className="font-label-code text-[10px] opacity-50 text-[#b9ccb2]">NODE_08_TELEMETRY</div>
              </div>
              <div className="grid grid-cols-2 gap-4 h-64">
                <div className="bg-[#1c1b1b] rounded border border-[#3b4b37] p-4 flex flex-col justify-between">
                  <div className="font-label-code text-[10px] text-[#74f5ff]">CPU_LOAD</div>
                  <div className="flex flex-wrap gap-0.5 mt-2">
                    <div className="w-2 h-6 bg-[#00f1fe]"></div>
                    <div className="w-2 h-6 bg-[#00f1fe]"></div>
                    <div className="w-2 h-6 bg-[#00f1fe]"></div>
                    <div className="w-2 h-6 bg-[#00f1fe]/30"></div>
                    <div className="w-2 h-6 bg-[#00f1fe]/30"></div>
                  </div>
                </div>
                <div className="bg-[#1c1b1b] rounded border border-[#3b4b37] p-4">
                  <div className="font-label-code text-[10px] text-[#72ff70]">NET_THROUGHPUT</div>
                  <div className="mt-4 flex flex-col gap-2">
                    <div className="segmented-progress flex">
                      <span className="active"></span>
                      <span className="active"></span>
                      <span className="active"></span>
                      <span className="active"></span>
                      <span className="active"></span>
                      <span className="active"></span>
                      <span></span>
                      <span></span>
                    </div>
                    <div className="font-display-tech text-[24px] text-white">12.4 GB/s</div>
                  </div>
                </div>
                <div className="col-span-2 bg-[#1c1b1b] rounded border border-[#3b4b37] p-4 relative overflow-hidden flex items-center justify-center">
                  <div className="absolute top-2 left-4 font-label-code text-[10px] text-[#b9ccb2]">PIPELINE_STAGES_3D</div>
                  <div className="w-full flex items-center justify-between px-6 mt-4">
                    <span className="text-[10px] text-[#72ff70] bg-[#72ff70]/10 border border-[#72ff70]/30 px-2 py-0.5">STAGE_1: ACTIVE</span>
                    <span className="text-[10px] text-[#00f1fe] bg-[#00f1fe]/10 border border-[#00f1fe]/30 px-2 py-0.5">STAGE_2: BUFFERING</span>
                    <span className="text-[10px] text-[#b9ccb2] bg-[#353534]/30 px-2 py-0.5">STAGE_3: IDLE</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Matrix Section (Proof of Ingestion) */}
      <section className="py-32 px-6 relative bg-[#131313]">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-24 items-center">
          <div className="relative h-[360px] border border-[#3b4b37] rounded bg-[#0e0e0e] tactical-bracket p-8 overflow-hidden group">
            <div className="absolute inset-0 opacity-20 group-hover:opacity-40 transition-opacity" style={{ backgroundImage: "linear-gradient(45deg, #00ff41 1px, transparent 1px)", backgroundSize: "24px 24px" }}></div>
            <div className="relative z-10 font-body-mono-sm text-[12px] text-[#72ff70] space-y-4">
              <div>&gt; INITIALIZING HANDSHAKE...</div>
              <div className="text-[#b9ccb2]">&gt; PUBLIC_KEY: 0x82...FA21</div>
              <div className="text-[#b9ccb2]">&gt; CHALLENGE: PENDING_RESPONSE</div>
              <div className="text-[#74f5ff]">&gt; ENCRYPTION_LAYER: ASYNC_AES_256</div>
              <div className="text-white font-bold">&gt; HANDSHAKE_SUCCESSFUL.</div>
              <div className="pt-4 flex gap-4">
                <div className="w-8 h-8 border border-[#72ff70] flex items-center justify-center animate-pulse">
                  <span className="material-symbols-outlined text-[16px]">radar</span>
                </div>
                <div className="w-8 h-8 border border-[#3b4b37] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[16px] text-[#b9ccb2]">qr_code_2</span>
                </div>
              </div>
            </div>
          </div>
          <div>
            <div className="font-label-code text-[10px] text-[#74f5ff] mb-4">[CRYPTO_LAYER: INGESTION_PROOF]</div>
            <h2 className="font-headline-lg text-[32px] text-white mb-8">Proof of Ingestion.</h2>
            <p className="font-body-mono text-[14px] text-[#b9ccb2] mb-10 leading-relaxed">
              Utilizing atomic architecture, every block flush is cryptographically verified. Pulsater converts raw .jsonl streams into immutable ledger entries before persistence, ensuring your data warehouse reflects absolute truth with verifiable lineage.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-6 bg-[#2a2a2a] border border-[#3b4b37] rounded">
                <div className="font-display-tech text-[24px] text-[#72ff70]">99.999%</div>
                <div className="font-label-code text-[10px] text-[#b9ccb2] uppercase mt-1">Consistency Rate</div>
              </div>
              <div className="p-6 bg-[#2a2a2a] border border-[#3b4b37] rounded">
                <div className="font-display-tech text-[24px] text-[#74f5ff]">0ms</div>
                <div className="font-label-code text-[10px] text-[#b9ccb2] uppercase mt-1">Data Drift</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Toolkit Section (IDE Panel) */}
      <section className="py-32 px-6 border-y border-[#3b4b37] bg-[#0e0e0e]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-headline-lg text-[32px] text-white">Developer Toolkit</h2>
            <p className="text-[#b9ccb2] font-body-mono mt-4">Native console access to the heartbeat of your data streams.</p>
          </div>
          <div className="bg-[#1E1E1E] rounded-xl border border-[#3b4b37] shadow-2xl overflow-hidden font-body-mono-sm text-[12px]">
            {/* Editor Header */}
            <div className="bg-[#2D2D2D] px-4 py-2 flex items-center justify-between border-b border-[#3b4b37]">
              <div className="flex items-center gap-4">
                <span className="text-[#74f5ff] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[14px]">description</span> live_cdc_stream.log
                </span>
                <span className="text-[#b9ccb2] opacity-50 cursor-pointer hover:opacity-100 transition-opacity">sys_config.yaml</span>
                <span className="text-[#b9ccb2] opacity-50 cursor-pointer hover:opacity-100 transition-opacity">metrics_export.go</span>
              </div>
              <div className="flex gap-2">
                <span className="material-symbols-outlined text-[16px] text-[#b9ccb2] cursor-pointer">search</span>
                <span className="material-symbols-outlined text-[16px] text-[#b9ccb2] cursor-pointer">close</span>
              </div>
            </div>
            {/* Editor Content */}
            <div className="p-6 h-96 overflow-y-auto space-y-2 bg-[#0A0A0A] custom-scrollbar">
              {logs.map((log, i) => (
                <div key={i} className="flex gap-4 items-start">
                  <span className="text-[#b9ccb2] opacity-30 select-none w-8">{log.line}</span>
                  <span className="text-[#b9ccb2] opacity-50">{log.time}</span>
                  <span className={`px-2 py-0.5 text-[8px] font-bold rounded ${
                    log.type === "INSERT" ? "bg-primary-container/20 text-[#00ff41]" :
                    log.type === "UPDATE" ? "bg-secondary-container/20 text-[#00f1fe]" :
                    log.type === "DELETE" ? "bg-error-container/20 text-error" : "bg-[#353534]/50 text-white"
                  }`}>{log.type}</span>
                  <span className={`${log.color} break-all flex-1`}>{log.payload}</span>
                </div>
              ))}
              <div className="flex gap-4">
                <span className="text-[#b9ccb2] opacity-30 select-none w-8">{lineCounter}</span>
                <span className="text-white">&gt; <span className="cursor-blink font-bold text-[#72ff70]">_</span></span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Metrics Section */}
      <section className="py-32 px-6 bg-[#131313]">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Col 1 */}
          <div className="p-8 border border-[#3b4b37] bg-[#201f1f] rounded-lg tactical-bracket relative group hover:border-[#72ff70] transition-colors flex flex-col justify-between">
            <div>
              <div className="mb-8">
                <span className="material-symbols-outlined text-[48px] text-[#72ff70]">storage</span>
              </div>
              <h3 className="font-headline-md text-[24px] text-white mb-4">Block-Partition Storage</h3>
              <p className="font-body-mono-sm text-[12px] text-[#b9ccb2] mb-8 leading-relaxed">
                Distributed cold storage with sub-millisecond indexing. Data is sliced across nodes for parallelized retrieval.
              </p>
            </div>
            <div className="h-28 overflow-hidden rounded border border-[#3b4b37]">
              <img 
                className="w-full h-full object-cover opacity-40 group-hover:opacity-100 transition-opacity" 
                alt="Stylized 3D isometric representation of digital data slices and server rack modules."
                src="https://lh3.googleusercontent.com/aida-data-slices-rack"
                onError={(e) => {
                  e.currentTarget.src = "https://lh3.googleusercontent.com/aida-public/AB6AXuBofeEZBQg2HUxNJ9s2s42JtXcF7YNauchchUSdxe-luMsX5zFqxaaO-1jURAw4-jAn3Xq55LqB948r2AD9fby5ZCVRKcydFf_XGyp77Mtx80twql9Wg3bweNY3WrqzyE-TugUE8TgU73zDDX91SqLzXALaoL9lqQ5s0_SQdVctzxbzC3GN0ld17bb3oKTEaA2jEVtATXUWUqMuOZwKQvkgGdnpmDftBzpoasjGfEqM1qx49CXG-a0-Yb1BrTzjoL1HzOcC-Y7aNx8";
                }}
              />
            </div>
          </div>
          {/* Col 2 */}
          <div className="p-8 border border-[#3b4b37] bg-[#201f1f] rounded-lg tactical-bracket relative group hover:border-[#74f5ff] transition-colors flex flex-col justify-between">
            <div>
              <div className="mb-8">
                <span className="material-symbols-outlined text-[48px] text-[#74f5ff]">shield_lock</span>
              </div>
              <h3 className="font-headline-md text-[24px] text-white mb-4">Channel Isolation</h3>
              <p className="font-body-mono-sm text-[12px] text-[#b9ccb2] mb-8 leading-relaxed">
                Encapsulated communication tunnels for every worker routine. Zero-leak memory safety by design.
              </p>
            </div>
            <div className="flex items-end gap-2 h-24 pb-2">
              <div className="flex-1 bg-[#74f5ff]/20 h-[20%] rounded-t group-hover:h-[80%] transition-all duration-700"></div>
              <div className="flex-1 bg-[#74f5ff]/20 h-[40%] rounded-t group-hover:h-[60%] transition-all duration-700 delay-75"></div>
              <div className="flex-1 bg-[#74f5ff]/20 h-[60%] rounded-t group-hover:h-[90%] transition-all duration-700 delay-150"></div>
              <div className="flex-1 bg-[#74f5ff]/20 h-[30%] rounded-t group-hover:h-[40%] transition-all duration-700 delay-220"></div>
              <div className="flex-1 bg-[#74f5ff]/20 h-[50%] rounded-t group-hover:h-[70%] transition-all duration-700 delay-300"></div>
            </div>
          </div>
          {/* Col 3 */}
          <div className="p-8 border border-[#3b4b37] bg-[#201f1f] rounded-lg tactical-bracket relative group hover:border-[#00e639] transition-colors flex flex-col justify-between">
            <div>
              <div className="mb-8">
                <span className="material-symbols-outlined text-[48px] text-[#00e639]">bolt</span>
              </div>
              <h3 className="font-headline-md text-[24px] text-white mb-4">High-Throughput</h3>
              <p className="font-body-mono-sm text-[12px] text-[#b9ccb2] mb-8 leading-relaxed">
                Elastic scalability capable of handling massive transactional bursts without back-pressure.
              </p>
            </div>
            <div className="text-center pb-2">
              <div className="font-display-tech text-[42px] text-[#00e639] leading-none animate-pulse">14,250</div>
              <div className="font-label-code text-[10px] text-[#b9ccb2] mt-2 uppercase">Rows / Sec</div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#131313] border-t border-[#3b4b37] w-full py-8 px-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="font-label-code text-[10px] text-[#00e639]">
          © 2024 HYPERVISOR_PULSATER // ASYNCHRONOUS_CDC_ENGINE
        </div>
        <div className="flex gap-6 font-body-mono-sm text-[12px] text-[#b9ccb2]">
          <Link className="hover:text-[#72ff70] transition-colors" href="/live-cdc">DOCUMENTATION</Link>
          <Link className="hover:text-[#72ff70] transition-colors" href="/cluster">SYSTEM_STATUS</Link>
          <Link className="hover:text-[#72ff70] transition-colors" href="/routing">SECURITY_LABS</Link>
          <Link className="hover:text-[#72ff70] transition-colors" href="/settings">API_REFERENCE</Link>
        </div>
        <div className="flex gap-4">
          <Link href="/routing" className="material-symbols-outlined text-[#b9ccb2] hover:text-[#74f5ff] transition-colors">hub</Link>
          <Link href="/error-terminal" className="material-symbols-outlined text-[#b9ccb2] hover:text-[#74f5ff] transition-colors">code</Link>
        </div>
      </footer>
    </div>
  );
}
