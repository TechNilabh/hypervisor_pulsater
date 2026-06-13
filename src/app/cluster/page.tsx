"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

interface NodeData {
  id: string;
  name: string;
  status: "ONLINE" | "THROTTLED" | "STANDBY";
  cpu: number;
  mem: number;
  contextSwitches: number;
  gcLatency: number;
  history: number[];
}

export default function ClusterHealth() {
  const [nodes, setNodes] = useState<NodeData[]>([
    { id: "N-001-A", name: "NODE_ALPHA", status: "ONLINE", cpu: 75, mem: 38, contextSwitches: 12402, gcLatency: 0.42, history: [1, 2, 3, 2, 4] },
    { id: "N-002-B", name: "NODE_BRAVO", status: "ONLINE", cpu: 20, mem: 80, contextSwitches: 9112, gcLatency: 0.08, history: [2, 1, 4, 3, 2] },
    { id: "N-003-C", name: "NODE_CHARLIE", status: "THROTTLED", cpu: 94, mem: 66, contextSwitches: 45100, gcLatency: 1.52, history: [4, 4, 4, 3, 4] },
    { id: "N-004-D", name: "NODE_DELTA", status: "ONLINE", cpu: 54, mem: 32, contextSwitches: 15002, gcLatency: 0.11, history: [1, 3, 2, 1, 2] },
    { id: "N-005-E", name: "NODE_ECHO", status: "ONLINE", cpu: 15, mem: 10, contextSwitches: 2400, gcLatency: 0.02, history: [1, 1, 2, 1, 1] },
    { id: "N-006-F", name: "NODE_FOXTROT", status: "ONLINE", cpu: 44, mem: 32, contextSwitches: 12122, gcLatency: 0.12, history: [2, 2, 1, 2, 2] },
    { id: "N-007-G", name: "NODE_GOLF", status: "STANDBY", cpu: 3, mem: 2, contextSwitches: 12, gcLatency: 0.00, history: [0, 0, 1, 0, 0] },
    { id: "N-008-H", name: "NODE_HOTEL", status: "ONLINE", cpu: 48, mem: 58, contextSwitches: 22400, gcLatency: 0.14, history: [3, 4, 2, 3, 3] },
  ]);

  // Heatmap values state
  const cols = 60;
  const rows = 20;
  const totalPixels = cols * rows;
  const [heatmap, setHeatmap] = useState<number[]>([]);

  // Initialize heatmap matching the diagonal scatter cluster pattern of the HTML
  useEffect(() => {
    const initialHeatmap = Array.from({ length: totalPixels }).map((_, index) => {
      return getPixelHeat(index);
    });
    setHeatmap(initialHeatmap);
  }, []);

  const getPixelHeat = (index: number) => {
    const x = index % cols;
    const y = Math.floor(index / cols);
    const distFromPath = Math.abs(y - (rows - (x / cols * rows) * 0.8));
    let level = 0;
    
    const rand = Math.random();
    if (distFromPath < 3) {
      level = rand > 0.3 ? Math.floor(Math.random() * 5) + 1 : 1;
    } else if (distFromPath < 6) {
      level = rand > 0.7 ? Math.floor(Math.random() * 3) + 1 : 0;
    } else {
      level = rand > 0.95 ? 1 : 0;
    }
    return level;
  };

  // Dynamic Heatmap & Node updates
  useEffect(() => {
    const interval = setInterval(() => {
      // Update heatmap cells
      setHeatmap(prev => {
        const next = [...prev];
        for (let i = 0; i < 15; i++) {
          const randomIndex = Math.floor(Math.random() * totalPixels);
          next[randomIndex] = getPixelHeat(randomIndex);
        }
        return next;
      });

      // Update Node CPU and memory slightly
      setNodes(prev => prev.map(node => {
        if (node.status === "STANDBY") return node;
        const cpuDelta = Math.floor((Math.random() - 0.5) * 8);
        const memDelta = Math.floor((Math.random() - 0.5) * 4);
        
        let nextCpu = Math.max(10, Math.min(98, node.cpu + cpuDelta));
        let nextStatus = node.status;
        if (nextCpu > 90) {
          nextStatus = "THROTTLED";
        } else if (node.name !== "NODE_CHARLIE") {
          nextStatus = "ONLINE";
        }

        const nextHist = [...node.history.slice(1), Math.floor((nextCpu / 100) * 4) + 1];

        return {
          ...node,
          cpu: nextCpu,
          mem: Math.max(10, Math.min(95, node.mem + memDelta)),
          status: nextStatus,
          contextSwitches: node.contextSwitches + Math.floor((Math.random() - 0.5) * 200),
          history: nextHist
        };
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleOptimize = () => {
    // Override throttled nodes and normalize loads
    setNodes(prev => prev.map(node => {
      if (node.status === "STANDBY") return node;
      return {
        ...node,
        status: "ONLINE",
        cpu: Math.floor(40 + Math.random() * 20),
        mem: Math.floor(30 + Math.random() * 20),
        gcLatency: 0.05 + Math.random() * 0.05,
        contextSwitches: Math.floor(8000 + Math.random() * 4000)
      };
    }));
  };

  const getHeatColorClass = (level: number) => {
    switch (level) {
      case 1: return "bg-[#1e3a8a]"; // Blue
      case 2: return "bg-[#3b82f6]"; // Light Blue
      case 3: return "bg-[#8b5cf6]"; // Violet
      case 4: return "bg-[#d946ef]"; // Magenta
      case 5: return "bg-[#f472b6]"; // Pink
      default: return "bg-[#1c1b1b]"; // Idle gray
    }
  };

  return (
    <div className="bg-[#0A0A0A] text-[#e5e2e1] font-body-mono selection:bg-primary-container selection:text-on-primary-container min-h-screen flex flex-col">
      <div className="fixed inset-0 scanline-overlay z-50 pointer-events-none opacity-20"></div>

      {/* TopNavBar */}
      <nav className="fixed top-0 left-0 w-full z-40 flex justify-between items-center px-6 py-2 bg-[#131313]/80 backdrop-blur-xl border-b border-[#3b4b37] shadow-[0_0_8px_rgba(0,242,255,0.1)]">
        <Link href="/" className="font-display-tech text-[20px] tracking-tighter text-[#00e639]">
          HYPERVISOR PULSATER // SYSTEMS ENGINE v1.0.4
        </Link>
        <div className="flex items-center gap-6">
          <div className="flex gap-4">
            <Link className="font-label-code text-[10px] text-[#b9ccb2] hover:text-[#00f1fe] transition-colors" href="/live-cdc">
              NODE_X01
            </Link>
            <span className="text-[#00e639] border-b-2 border-[#00e639] pb-1 font-label-code text-[10px] transition-colors cursor-default">
              CLUSTER_HEALTH
            </span>
            <Link className="font-label-code text-[10px] text-[#b9ccb2] hover:text-[#00f1fe] transition-colors" href="/routing">
              TRAFFIC_ROUTING
            </Link>
          </div>
          <div className="flex gap-4 text-[#ebffe2]">
            <Link href="/routing" className="material-symbols-outlined cursor-pointer hover:text-[#00f1fe] transition-colors">hub</Link>
            <span className="material-symbols-outlined cursor-pointer hover:text-[#00f1fe] transition-colors">settings_input_antenna</span>
            <span className="material-symbols-outlined cursor-pointer hover:text-[#00f1fe] transition-colors">lan</span>
          </div>
        </div>
      </nav>

      {/* SideNavBar */}
      <aside className="fixed left-0 top-0 h-full z-35 flex flex-col pt-16 bg-[#0e0e0e]/90 backdrop-blur-md border-r border-[#3b4b37] w-64 hidden md:flex">
        <div className="p-4 border-b border-[#3b4b37]">
          <div className="font-label-code text-[#ebffe2] text-xs">NODE_ACTIVE</div>
          <div className="text-body-mono opacity-60 text-sm">US-EAST-01</div>
        </div>
        <div className="flex flex-col mt-4">
          <Link href="/live-cdc" className="text-[#b9ccb2] px-4 py-3 opacity-70 flex items-center gap-3 cursor-pointer hover:bg-[#353534]/30 hover:text-white transition-all">
            <span className="material-symbols-outlined">settings_ethernet</span>
            <span className="font-label-code text-[10px]">LIVE_CDC</span>
          </Link>
          <div className="bg-[#00f1fe]/20 text-[#00f1fe] border-l-4 border-[#00f1fe] px-4 py-3 font-bold flex items-center gap-3 cursor-default">
            <span className="material-symbols-outlined">monitor_heart</span>
            <span className="font-label-code text-[10px]">CLUSTER_HEALTH</span>
          </div>
          <Link href="/routing" className="text-[#b9ccb2] px-4 py-3 opacity-70 flex items-center gap-3 cursor-pointer hover:bg-[#353534]/30 hover:text-white transition-all">
            <span className="material-symbols-outlined">language</span>
            <span className="font-label-code text-[10px]">GLOBAL_ROUTING</span>
          </Link>
        </div>
        <div className="mt-auto p-4">
          <div className="bg-[#201f1f] p-3 border border-[#3b4b37] rounded-sm">
            <div className="text-label-code mb-2 opacity-50 uppercase tracking-widest text-[9px]">System Load</div>
            <div className="flex gap-1">
              <div className="progress-segment active"></div>
              <div className="progress-segment active"></div>
              <div className="progress-segment active"></div>
              <div className="progress-segment active"></div>
              <div className="progress-segment active"></div>
              <div className="progress-segment"></div>
              <div className="progress-segment"></div>
              <div className="progress-segment"></div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="md:ml-64 pt-20 pb-12 px-6 min-h-screen bg-[#0A0A0A]">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="font-display-tech text-[32px] font-bold uppercase tracking-tighter">Cluster Resource Health</h1>
            <p className="font-label-code text-[#00e639] opacity-80 mt-1 text-[10px]">REAL-TIME TELEMETRY // PERSISTENT CONNECTION: US-EAST-CDC-12</p>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={handleOptimize}
              className="bg-[#00ff41] text-[#003907] px-6 py-2 font-label-code tracking-widest flex items-center gap-2 hover:opacity-90 active:scale-95 transition-all text-xs font-bold"
            >
              <span className="material-symbols-outlined text-sm">bolt</span>
              OPTIMIZE_ALL
            </button>
          </div>
        </div>

        {/* 8 Server Nodes Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {nodes.map(node => (
            <div 
              key={node.id}
              className="node-card bg-[#201f1f]/60 backdrop-blur-md border border-[#3b4b37] p-4 relative group rounded-sm"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="font-label-code text-[#b9ccb2] opacity-60 text-[9px]">ID: {node.id}</div>
                  <div className="font-display-tech text-[18px] text-[#00e639] font-bold">{node.name}</div>
                </div>
                <div className={`px-2 py-0.5 border text-[9px] font-label-code ${
                  node.status === "ONLINE" 
                    ? "bg-[#72ff70]/10 border-[#72ff70]/30 text-[#72ff70]" 
                    : node.status === "THROTTLED"
                    ? "bg-error-container/20 border-error/30 text-error animate-pulse"
                    : "bg-[#353534]/40 border-[#3b4b37] text-[#b9ccb2]"
                }`}>
                  {node.status}
                </div>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  {/* CPU radial loading */}
                  <div className="flex flex-col items-center justify-center border border-[#3b4b37] py-4 relative corner-bracket bracket-tl bracket-br bg-black/20">
                    <svg className="w-16 h-16 transform -rotate-90">
                      <circle className="text-[#353534]" cx="32" cy="32" fill="transparent" r="24" stroke="currentColor" strokeWidth="4"></circle>
                      <circle 
                        className={`${node.status === "THROTTLED" ? "text-error" : "text-[#00e639]"} transition-all duration-500`} 
                        cx="32" 
                        cy="32" 
                        fill="transparent" 
                        r="24" 
                        stroke="currentColor" 
                        strokeDasharray="150.8" 
                        strokeDashoffset={150.8 - (150.8 * node.cpu) / 100} 
                        strokeWidth="4"
                      ></circle>
                    </svg>
                    <span className="absolute text-[10px] font-label-code text-white mt-[-10px]">{node.cpu}%</span>
                    <span className="text-[9px] font-label-code mt-2 opacity-50">CPU LOAD</span>
                  </div>

                  {/* MEM radial loading */}
                  <div className="flex flex-col items-center justify-center border border-[#3b4b37] py-4 relative corner-bracket bracket-tr bracket-bl bg-black/20">
                    <svg className="w-16 h-16 transform -rotate-90">
                      <circle className="text-[#353534]" cx="32" cy="32" fill="transparent" r="24" stroke="currentColor" strokeWidth="4"></circle>
                      <circle 
                        className="text-[#00f1fe] transition-all duration-500" 
                        cx="32" 
                        cy="32" 
                        fill="transparent" 
                        r="24" 
                        stroke="currentColor" 
                        strokeDasharray="150.8" 
                        strokeDashoffset={150.8 - (150.8 * node.mem) / 100} 
                        strokeWidth="4"
                      ></circle>
                    </svg>
                    <span className="absolute text-[10px] font-label-code text-white mt-[-10px]">{node.mem}%</span>
                    <span className="text-[9px] font-label-code mt-2 opacity-50">MEM ALLOC</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center text-[10px] font-label-code">
                    <span className="opacity-50">CONTEXT SWITCH</span>
                    <span className="text-[#72ff70]">{node.contextSwitches.toLocaleString()} / s</span>
                  </div>
                  {/* Micro timeline bars */}
                  <div className="h-6 w-full bg-[#353534]/30 flex items-end gap-[2px] px-1 py-1">
                    {node.history.map((h, i) => (
                      <div 
                        key={i} 
                        className={`w-full transition-all duration-300 ${node.status === "THROTTLED" ? "bg-error" : "bg-[#00e639]"}`} 
                        style={{ height: `${h * 25}%`, opacity: 0.3 + (i / 4) * 0.7 }}
                      ></div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-label-code">
                    <span className="opacity-50">GC LATENCY</span>
                    <span className={node.gcLatency > 1.0 ? "text-error" : "text-[#72ff70]"}>{node.gcLatency.toFixed(2)}ms</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Throughput Heatmap Matrix */}
        <section className="mt-8 bg-[#1c1b1b]/40 backdrop-blur-md border border-[#3b4b37] p-6 relative overflow-hidden rounded-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="font-display-tech text-[20px] font-bold uppercase tracking-tighter text-[#00f1fe] flex items-center gap-2">
                <span className="material-symbols-outlined">grid_view</span>
                Packet Throughput Heatmap Matrix
              </h2>
              <p className="font-label-code text-[#b9ccb2] text-[10px] opacity-60">DISTRIBUTED PROCESSING SECTOR ANALYSIS // REAL-TIME PACKET DENSITY</p>
            </div>
            <div className="flex items-center gap-4 font-label-code text-[8px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-[#1c1b1b]"></span> <span>IDLE</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-[#1e3a8a]"></span> <span>NOMINAL</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-[#8b5cf6]"></span> <span>ELEVATED</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-[#f472b6]"></span> <span>CRITICAL</span>
              </div>
            </div>
          </div>
          
          <div className="relative">
            {/* Y-Axis Labels */}
            <div className="absolute -left-10 top-0 bottom-8 flex flex-col justify-between font-label-code text-[8px] opacity-40">
              <span>9.0</span><span>7.5</span><span>6.0</span><span>4.5</span><span>3.0</span><span>1.5</span>
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
              <span>2.5</span><span>17.5</span><span>32.5</span><span>47.5</span><span>62.5</span><span>77.5</span><span>92.5</span>
            </div>
            <div className="text-center mt-2 font-label-code text-[9px] opacity-40 tracking-widest uppercase">Sector Processing Coordinate (x, y)</div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 w-full z-50 h-8 flex items-center px-6 justify-between bg-[#1c1b1b] border-t border-error/30 text-error font-label-code text-[10px]">
        <div>[SYSTEM_READY] // INTERRUPT_LISTENER_ACTIVE</div>
        <div className="flex gap-6">
          <a className="text-[#ffdad6] hover:bg-error-container hover:text-on-error-container px-2 h-full flex items-center transition-colors" href="#">V1.0.4_STABLE</a>
          <a className="text-[#ffdad6] hover:bg-error-container hover:text-on-error-container px-2 h-full flex items-center transition-colors" href="#">RECOVERY_MODE</a>
          <a className="text-[#ffdad6] hover:bg-error-container hover:text-on-error-container px-2 h-full flex items-center transition-colors" href="#">DEBUG_CONSOLE</a>
        </div>
      </footer>
    </div>
  );
}
