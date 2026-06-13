"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";

export default function SystemConfiguration() {
  // Worker pool states
  const [goroutineThreshold, setGoroutineThreshold] = useState(16384);
  const [ingestChanBuffer, setIngestChanBuffer] = useState(512); // out of 1024
  const [outboundQueue, setOutboundQueue] = useState(25.4); // k pkts

  // Persistence states
  const [flushInterval, setFlushInterval] = useState(500);
  const [writeStrategy, setWriteStrategy] = useState<"WRITE_THROUGH" | "ASYNC_APPEND" | "JOURNALED_SYNC">("ASYNC_APPEND");

  // Network states
  const [regions, setRegions] = useState({
    "US-EAST-1": true,
    "EU-WEST-3": false,
    "AP-SOUTH-1": true,
    "SA-EAST-1": false,
  });
  const [replicationFactor, setReplicationFactor] = useState("x3");
  const [verbosity, setVerbosity] = useState({
    err: 100,
    info: 70,
    debug: 30,
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleRegionToggle = (r: keyof typeof regions) => {
    setRegions((prev) => ({ ...prev, [r]: !prev[r] }));
  };

  // 3D Cluster Map Animation (Canvas)
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
      { x: -50, y: 70, z: 60, label: "EU-WEST-3", color: "#ffb4ab" },
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

      // Project and rotate nodes
      const projected = nodes.map((node) => {
        let p = rotateY(node, angle);
        p = rotateX(p, angle * 0.5);

        // Perspective projection
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

      // Draw lines between SYS_ROOT and child nodes
      ctx.lineWidth = 1;
      projected.forEach((node, i) => {
        if (i === 0) return; // Skip SYS_ROOT
        ctx.strokeStyle = "rgba(59, 75, 55, 0.4)";
        ctx.beginPath();
        ctx.moveTo(projected[0].x, projected[0].y);
        ctx.lineTo(node.x, node.y);
        ctx.stroke();
      });

      // Draw nodes
      projected.forEach((node) => {
        ctx.fillStyle = node.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = node.color;
        
        ctx.beginPath();
        ctx.arc(node.x, node.y, 4 * node.scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;

        // Draw labels
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

  return (
    <div className="bg-[#0A0A0A] text-[#e5e2e1] font-body-mono selection:bg-[#00ff41]/20 selection:text-[#00ff41] overflow-hidden h-[calc(100vh-64px)] flex flex-col">
      {/* SideNavBar */}
      <aside className="fixed left-0 top-16 h-[calc(100vh-64px)] w-64 z-40 bg-[#0e0e0e]/95 backdrop-blur-xl border-r border-[#3b4b37] flex flex-col py-4 space-y-1">
        <div className="px-6 py-2 mb-4 border-b border-[#3b4b37]/30">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-sm bg-[#00ff41]/10 flex items-center justify-center overflow-hidden border border-[#00e639]/30">
              <span className="material-symbols-outlined text-xs text-[#00e639]">person</span>
            </div>
            <div>
              <p className="font-label-code text-[10px] text-white font-bold leading-none">OPERATOR_01</p>
              <p className="font-label-code text-[8px] opacity-50 text-[#00dbe7] leading-none mt-1">[NODE: US-EAST-1]</p>
            </div>
          </div>
        </div>
        <nav className="flex-1">
          <Link className="text-[#b9ccb2] flex items-center gap-3 px-4 py-3 opacity-70 hover:bg-[#353534]/30 hover:opacity-100 hover:text-white transition-all" href="/live-cdc">
            <span className="material-symbols-outlined">sensors</span>
            <span className="font-label-code text-[10px]">LIVE_CDC</span>
          </Link>
          <Link className="text-[#b9ccb2] flex items-center gap-3 px-4 py-3 opacity-70 hover:bg-[#353534]/30 hover:opacity-100 hover:text-white transition-all" href="/cluster">
            <span className="material-symbols-outlined">dns</span>
            <span className="font-label-code text-[10px]">CLUSTER_HEALTH</span>
          </Link>
          <Link className="text-[#b9ccb2] flex items-center gap-3 px-4 py-3 opacity-70 hover:bg-[#353534]/30 hover:opacity-100 hover:text-white transition-all" href="/routing">
            <span className="material-symbols-outlined">hub</span>
            <span className="font-label-code text-[10px]">GLOBAL_ROUTING</span>
          </Link>
          <Link className="text-[#b9ccb2] flex items-center gap-3 px-4 py-3 opacity-70 hover:bg-[#353534]/30 hover:opacity-100 hover:text-white transition-all" href="/connections">
            <span className="material-symbols-outlined">settings_ethernet</span>
            <span className="font-label-code text-[10px]">CONNECTIONS</span>
          </Link>
          <Link className="text-[#b9ccb2] flex items-center gap-3 px-4 py-3 opacity-70 hover:bg-[#353534]/30 hover:opacity-100 hover:text-white transition-all" href="/alerts">
            <span className="material-symbols-outlined">warning</span>
            <span className="font-label-code text-[10px]">ALERTS</span>
          </Link>
          <div className="bg-[#00ff41]/20 text-[#00e639] border-l-4 border-[#00e639] flex items-center gap-3 px-4 py-3 font-bold cursor-default">
            <span className="material-symbols-outlined">terminal</span>
            <span className="font-label-code text-[10px]">SETTINGS</span>
          </div>
        </nav>
      </aside>

      {/* Main Canvas Area */}
      <main className="ml-64 p-6 h-[calc(100vh-64px)] overflow-y-auto bg-[#0A0A0A]">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-container-max mx-auto">
          
          {/* Card 1: Worker Pool Orchestrator */}
          <section className="bg-[#1c1b1b]/80 backdrop-blur-md border border-[#3b4b37] p-4 relative chamfer-br flex flex-col gap-6 overflow-hidden min-h-[460px] rounded-sm">
            <div className="flex justify-between items-center border-b border-[#3b4b37] pb-2">
              <h2 className="font-label-code text-[10px] text-[#00e639] flex items-center gap-2 font-bold uppercase">
                <span className="material-symbols-outlined text-sm">precision_manufacturing</span>
                [MODULE: WORKER_POOL_ORCHESTRATOR]
              </h2>
              <span className="material-symbols-outlined text-sm text-[#b9ccb2] cursor-pointer hover:text-error transition-colors">close</span>
            </div>
            
            <div className="space-y-6">
              {/* Goroutine Thresholds */}
              <div>
                <p className="font-label-code text-[10px] text-[#b9ccb2] mb-2 opacity-60">GOROUTINE_THRESHOLD</p>
                <div className="flex items-center gap-4">
                  <input 
                    className="w-full h-1 bg-[#2a2a2a] rounded-none appearance-none cursor-pointer accent-[#00e639]" 
                    max="65536" 
                    min="1024" 
                    step="1024"
                    type="range" 
                    value={goroutineThreshold}
                    onChange={(e) => setGoroutineThreshold(Number(e.target.value))}
                  />
                  <span className="font-label-code text-[12px] text-[#00e639] font-bold w-12 text-right">
                    {(goroutineThreshold / 1000).toFixed(1)}k
                  </span>
                </div>
              </div>
              
              {/* Channel Depths */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 border border-[#3b4b37]/30 bg-[#0e0e0e] relative">
                  <div className="absolute top-0 right-0 w-2 h-2 bg-[#00e639]/20"></div>
                  <p className="font-label-code text-[8px] text-[#00dbe7] uppercase">INGEST_CHAN_BUFF</p>
                  <div className="flex gap-[2px] mt-2 segment-bar">
                    <span className="active"></span><span className="active"></span><span className="active"></span><span className="active"></span>
                    <span></span><span></span><span></span>
                  </div>
                  <p className="mt-2 font-label-code text-[10px] text-[#e5e2e1] font-semibold">{ingestChanBuffer}/1024 MB</p>
                </div>

                <div className="p-3 border border-[#3b4b37]/30 bg-[#0e0e0e] relative">
                  <div className="absolute top-0 right-0 w-2 h-2 bg-[#00e639]/20"></div>
                  <p className="font-label-code text-[8px] text-[#00dbe7] uppercase">OUTBOUND_QUEUE</p>
                  <div className="flex gap-[2px] mt-2 segment-bar">
                    <span className="active"></span><span className="active"></span><span className="active"></span><span></span>
                    <span></span><span></span><span></span>
                  </div>
                  <p className="mt-2 font-label-code text-[10px] text-[#e5e2e1] font-semibold">{outboundQueue}k PKTS</p>
                </div>
              </div>

              {/* Radial Telemetry */}
              <div className="flex justify-around items-center pt-4">
                <div className="relative w-28 h-28 flex items-center justify-center border-2 border-dashed border-[#3b4b37] rounded-full group cursor-pointer">
                  <div className="absolute inset-1 border border-[#00e639] rounded-full opacity-20 group-hover:opacity-100 transition-opacity animate-[spin_10s_linear_infinite]"></div>
                  <div className="text-center">
                    <p className="font-display-tech text-[20px] text-[#00e639] leading-none font-bold">82%</p>
                    <p className="font-label-code text-[8px] text-[#b9ccb2]">CPU_LOAD</p>
                  </div>
                </div>
                
                <div className="relative w-28 h-28 flex items-center justify-center border-2 border-dashed border-[#3b4b37] rounded-full group cursor-pointer">
                  <div className="absolute inset-1 border border-[#00f1fe] rounded-full opacity-20 group-hover:opacity-100 transition-opacity animate-[spin_15s_linear_infinite_reverse]"></div>
                  <div className="text-center">
                    <p className="font-display-tech text-[20px] text-[#00dbe7] leading-none font-bold">4.2ms</p>
                    <p className="font-label-code text-[8px] text-[#b9ccb2]">LAT_P99</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Card 2: Persistence Layer */}
          <section className="bg-[#1c1b1b]/80 backdrop-blur-md border border-[#3b4b37] p-4 relative chamfer-tl flex flex-col gap-6 min-h-[460px] rounded-sm">
            <div className="flex justify-between items-center border-b border-[#3b4b37] pb-2">
              <h2 className="font-label-code text-[10px] text-[#00dbe7] flex items-center gap-2 font-bold uppercase">
                <span className="material-symbols-outlined text-sm">database</span>
                [MODULE: PERSISTENCE_LAYER]
              </h2>
              <span className="material-symbols-outlined text-sm text-[#b9ccb2] cursor-pointer hover:text-error transition-colors">close</span>
            </div>

            <div className="space-y-6">
              {/* Flush Intervals */}
              <div>
                <p className="font-label-code text-[10px] text-[#b9ccb2] mb-2 opacity-60">FLUSH_INTERVAL_MS</p>
                <div className="flex gap-2">
                  {[250, 500, 1000].map((val) => (
                    <button 
                      key={val}
                      onClick={() => setFlushInterval(val)}
                      className={`flex-1 py-2 border font-label-code text-[11px] transition-colors rounded-sm ${
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

              {/* Partition Paths */}
              <div className="bg-[#0e0e0e] p-3 border-l-2 border-[#00dbe7] rounded-r-sm">
                <p className="font-label-code text-[8px] text-[#b9ccb2] mb-1">DATA_PARTITION_PATH</p>
                <code className="font-label-code text-[10px] text-[#00dbe7] break-all leading-tight">
                  /mnt/nvme0n1p1/hot_shards/pulsater/v2/
                </code>
                <div className="flex gap-2 mt-4">
                  <span className="px-2 py-0.5 bg-[#353534] font-label-code text-[8px] text-[#e5e2e1]">WRITABLE</span>
                  <span className="px-2 py-0.5 bg-[#353534] font-label-code text-[8px] text-[#e5e2e1]">EXT4</span>
                  <span className="px-2 py-0.5 bg-[#00ff41]/10 border border-[#00e639]/30 font-label-code text-[8px] text-[#00e639] font-bold">ACTIVE</span>
                </div>
              </div>

              {/* Segmented Toggles */}
              <div>
                <p className="font-label-code text-[10px] text-[#b9ccb2] mb-2 opacity-60">WRITE_STRATEGY</p>
                <div className="flex flex-col gap-1.5">
                  {[
                    { id: "WRITE_THROUGH", label: "WRITE_THROUGH" },
                    { id: "ASYNC_APPEND", label: "ASYNC_APPEND" },
                    { id: "JOURNALED_SYNC", label: "JOURNALED_SYNC" }
                  ].map((strategy) => (
                    <div 
                      key={strategy.id}
                      onClick={() => setWriteStrategy(strategy.id as any)}
                      className={`flex items-center justify-between p-2.5 transition-colors cursor-pointer border rounded-sm ${
                        writeStrategy === strategy.id 
                          ? "bg-[#00ff41]/5 border-[#00e639]/60 text-[#00e639] border-l-2 border-l-[#00e639]" 
                          : "bg-[#0e0e0e] border-[#3b4b37] text-[#b9ccb2] hover:bg-[#201f1f]"
                      }`}
                    >
                      <span className="font-label-code text-[10px] font-bold">{strategy.label}</span>
                      <div className={`w-8 h-4 relative flex items-center p-0.5 transition-all ${writeStrategy === strategy.id ? "bg-[#00ff41]/20" : "bg-[#353534]"}`}>
                        <div className={`w-3.5 h-3 bg-[#00e639] transition-transform ${writeStrategy === strategy.id ? "translate-x-4" : "translate-x-0"}`}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Card 3: Network Controls */}
          <section className="bg-[#1c1b1b]/80 backdrop-blur-md border border-[#3b4b37] p-4 relative chamfer-br flex flex-col gap-6 min-h-[460px] rounded-sm">
            <div className="flex justify-between items-center border-b border-[#3b4b37] pb-2">
              <h2 className="font-label-code text-[10px] text-[#ffb4ab] flex items-center gap-2 font-bold uppercase">
                <span className="material-symbols-outlined text-sm">wifi_tethering</span>
                [MODULE: NETWORK_INTERFACE]
              </h2>
              <span className="material-symbols-outlined text-sm text-[#b9ccb2] cursor-pointer hover:text-error transition-colors">close</span>
            </div>

            <div className="space-y-6">
              {/* Node Regions */}
              <div>
                <p className="font-label-code text-[10px] text-[#b9ccb2] mb-2 opacity-60">ACTIVE_REPLICATION_REGIONS</p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(regions) as (keyof typeof regions)[]).map((reg) => (
                    <div 
                      key={reg}
                      onClick={() => handleRegionToggle(reg)}
                      className={`flex items-center justify-between px-3 py-2 border cursor-pointer transition-colors ${
                        regions[reg] 
                          ? "border-[#00e639] bg-[#00ff41]/10 text-[#00e639] font-bold" 
                          : "border-[#3b4b37] bg-[#0e0e0e] text-[#b9ccb2] opacity-60 hover:opacity-100"
                      }`}
                    >
                      <span className="font-label-code text-[10px]">{reg}</span>
                      <span className="material-symbols-outlined text-xs">
                        {regions[reg] ? "check_circle" : "radio_button_unchecked"}
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
                      onClick={() => setReplicationFactor(factor)}
                      className={`px-4 h-full font-label-code text-[10px] transition-colors ${
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
                    <span className="font-label-code text-[9px]">ERR_ONLY</span>
                    <input 
                      type="range" 
                      className="w-24 h-1 accent-[#93000a] bg-[#2a2a2a] appearance-none cursor-pointer"
                      value={verbosity.err} 
                      onChange={(e) => setVerbosity(v => ({ ...v, err: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-label-code text-[9px]">INFO_WARN</span>
                    <input 
                      type="range" 
                      className="w-24 h-1 accent-[#00f1fe] bg-[#2a2a2a] appearance-none cursor-pointer"
                      value={verbosity.info} 
                      onChange={(e) => setVerbosity(v => ({ ...v, info: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-label-code text-[9px] text-[#00e639]">DEBUG_VERBOSE</span>
                    <input 
                      type="range" 
                      className="w-24 h-1 accent-[#00e639] bg-[#2a2a2a] appearance-none cursor-pointer"
                      value={verbosity.debug} 
                      onChange={(e) => setVerbosity(v => ({ ...v, debug: Number(e.target.value) }))}
                    />
                  </div>
                </div>
              </div>

              {/* Live Visualization Map */}
              <div className="mt-2 border border-[#3b4b37] bg-[#0e0e0e] relative overflow-hidden h-32 flex flex-col justify-end">
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
      </main>

      {/* Footer Status Bar */}
      <footer className="fixed bottom-0 w-full h-8 z-50 bg-[#2a2a2a] border-t border-[#00e639]/30 flex justify-between items-center px-6">
        <div className="flex items-center gap-6">
          <p className="font-label-code text-[#00e639] text-[10px] animate-pulse">● SYSTEM_STATUS: NOMINAL</p>
          <p className="font-body-mono-sm text-[#b9ccb2]/60 text-[10px] hidden md:block">[THREAD_COUNT: 1024] [UPTIME: 99.998%]</p>
        </div>
        <div className="flex items-center gap-4 text-[10px]">
          <a className="text-[#b9ccb2]/60 hover:text-[#74f5ff] transition-colors" href="#">DOCS</a>
          <a className="text-[#b9ccb2]/60 hover:text-[#74f5ff] transition-colors underline" href="#">API_REF</a>
          <a className="text-[#b9ccb2]/60 hover:text-[#74f5ff] transition-colors" href="#">SYS_LOGS</a>
          <div className="flex gap-0.5 ml-2">
            <div className="w-1 h-3 bg-[#00e639]"></div>
            <div className="w-1 h-3 bg-[#00e639]/40"></div>
            <div className="w-1 h-3 bg-[#00e639]"></div>
          </div>
        </div>
      </footer>
    </div>
  );
}
