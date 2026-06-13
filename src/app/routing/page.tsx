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
      setConsoleMsgs(prev => [...prev, msg].slice(-15)); // Keep last 15
      
      // Slightly fluctuate throughput
      setThroughput(t => Math.max(95, Math.min(99.99, t + (Math.random() - 0.5) * 0.5)));

      // Update packet table values
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
      {/* TopNavBar */}
      <header className="bg-[#131313]/80 backdrop-blur-xl text-[#00e639] flex justify-between items-center px-6 py-2 w-full max-w-full docked border-b border-[#3b4b37] shadow-[0_0_8px_rgba(0,242,255,0.1)] z-50">
        <div className="flex items-center gap-4">
          <span className="material-symbols-outlined text-[#00e639]">hub</span>
          <h1 className="font-display-tech text-[20px] tracking-tighter text-[#00e639]">
            HYPERVISOR PULSATER // SYSTEMS ENGINE v1.0.4
          </h1>
        </div>
        <nav className="hidden md:flex gap-8 items-center">
          <Link className="text-[#b9ccb2] font-label-code hover:text-[#00f1fe] transition-colors text-[10px] tracking-widest" href="/live-cdc">
            LIVE_CDC
          </Link>
          <Link className="text-[#b9ccb2] font-label-code hover:text-[#00f1fe] transition-colors text-[10px] tracking-widest" href="/cluster">
            CLUSTER_HEALTH
          </Link>
          <span className="text-[#00e639] border-b-2 border-[#00e639] pb-1 font-label-code text-[10px] tracking-widest cursor-default flicker">
            GLOBAL_ROUTING
          </span>
        </nav>
        <div className="flex gap-4">
          <span className="material-symbols-outlined hover:text-[#00f1fe] transition-colors cursor-pointer">settings_input_antenna</span>
          <span className="material-symbols-outlined hover:text-[#00f1fe] transition-colors cursor-pointer">lan</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* SideNavBar */}
        <aside className="fixed left-0 top-0 h-full z-35 flex flex-col pt-16 bg-[#0e0e0e]/95 backdrop-blur-md text-[#00dbe7] w-64 border-r border-[#3b4b37]">
          <div className="p-4 border-b border-[#3b4b37]">
            <div className="font-label-code text-[#ebffe2] text-[10px] mb-1">NODE_ACTIVE</div>
            <div className="font-body-mono-sm opacity-60 text-xs">US-EAST-01 // ROOT_AUTH</div>
          </div>
          <nav className="flex-1">
            <Link className="text-[#b9ccb2] px-4 py-3 opacity-70 hover:bg-[#353534]/30 hover:text-white flex items-center gap-3 cursor-pointer group" href="/live-cdc">
              <span className="material-symbols-outlined group-hover:text-[#00e639]">settings_ethernet</span>
              <span className="font-body-mono text-sm">LIVE_CDC</span>
            </Link>
            <Link className="text-[#b9ccb2] px-4 py-3 opacity-70 hover:bg-[#353534]/30 hover:text-white flex items-center gap-3 cursor-pointer group" href="/cluster">
              <span className="material-symbols-outlined group-hover:text-[#00e639]">monitor_heart</span>
              <span className="font-body-mono text-sm">CLUSTER_HEALTH</span>
            </Link>
            <div className="bg-[#00f1fe]/20 text-[#00f1fe] border-l-4 border-[#00f1fe] px-4 py-3 font-bold flex items-center gap-3 cursor-default">
              <span className="material-symbols-outlined">language</span>
              <span className="font-body-mono text-sm">GLOBAL_ROUTING</span>
            </div>
          </nav>
          <div className="p-4 bg-[#1c1b1b]/50 border-t border-[#3b4b37]">
            <div className="text-label-code mb-2 text-[#00e639] text-[10px] tracking-wide">DATA_STREAM_IO</div>
            <div className="h-12 bg-black/40 rounded flex items-end gap-1 p-1">
              <div className="w-1 bg-[#00e639] h-1/2 animate-pulse"></div>
              <div className="w-1 bg-[#00e639] h-3/4"></div>
              <div className="w-1 bg-[#00e639] h-full animate-pulse"></div>
              <div className="w-1 bg-[#00e639] h-1/3"></div>
              <div className="w-1 bg-[#00e639] h-2/3"></div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="ml-64 flex-grow relative overflow-hidden bg-[#0A0A0A] flex z-10">
          {/* Scanline Overlay */}
          <div className="absolute inset-0 scanline z-10"></div>
          
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
            
            <div className="relative w-[500px] h-[500px] flex items-center justify-center">
              {/* Topology SVG Layer */}
              <svg className="absolute inset-0 w-[500px] h-[500px] z-20 pointer-events-none overflow-visible">
                {/* SVG Connections between nodes */}
                <line className="topology-line" opacity="0.6" stroke="#00e639" strokeWidth="3" x1="150" x2="350" y1="200" y2="350"></line>
                <line className="topology-line" opacity="0.4" stroke="#00f1fe" strokeWidth="2" x1="350" x2="420" y1="350" y2="240"></line>
                <line className="topology-line" opacity="0.3" stroke="#ffb4ab" strokeWidth="1.5" x1="150" x2="80" y1="200" y2="300"></line>
                <line className="topology-line" opacity="0.5" stroke="#00f1fe" strokeWidth="2.5" x1="150" x2="250" y1="200" y2="80"></line>
              </svg>

              {/* The Globe Globe projection */}
              <div className="relative w-[400px] h-[400px] rounded-full border border-[#ebffe2]/20 shadow-[0_0_120px_rgba(0,230,57,0.12)] overflow-hidden z-10">
                <img 
                  alt="Atmospheric Globe projection with navigation markers." 
                  className="w-full h-full object-cover opacity-70 mix-blend-screen" 
                  src="https://lh3.googleusercontent.com/aida-earth-globe-projection"
                  onError={(e) => {
                    e.currentTarget.src = "https://lh3.googleusercontent.com/aida-public/AB6AXuA0zxEktgiFQ-hxibs4KAmQ79QymqSX_bNZQhU0UJ9rZynHtNFC72AmFJZz7DIYa8NveiWbwdJ5lDRYiqE6DtpB1-H16z6H3SNwExi44BgAgaYY1Ae6fwtN5XYY5gOo1lpOnsW54j2cEAr5g1FSVilWsAtOb2bkXcyYBCnvW5x2p5dBSk8TOkygWLs_czanyTO3OxwOjGngcThrZXInVFNj3EgmeoGQNmNvaVC3dHwAWEGDZcgVKad3u0RLXkmxCiSq6hWUv6XlQR0";
                  }}
                />
              </div>

              {/* Luminous Node: US_EAST */}
              <div className="absolute top-[200px] left-[150px] w-10 h-10 bg-[#ebffe2] rounded-full z-30 node-glow-primary border-2 border-white/40 flex flex-wrap p-1 items-center justify-center translate-x-[-50%] translate-y-[-50%] overflow-hidden">
                {Array.from({ length: 16 }).map((_, idx) => (
                  <div key={idx} className="w-1.5 h-1.5 bg-[#00ff41]/80 rounded-[1px] m-[1px]"></div>
                ))}
              </div>

              {/* Luminous Node: EU_WEST */}
              <div className="absolute top-[350px] left-[350px] w-12 h-12 bg-[#00f1fe] rounded-full z-30 node-glow-secondary border-2 border-white/50 flex flex-wrap p-1 items-center justify-center translate-x-[-50%] translate-y-[-50%] overflow-hidden">
                {Array.from({ length: 25 }).map((_, idx) => (
                  <div key={idx} className="w-1.5 h-1.5 bg-[#00f1fe]/80 rounded-[1px] m-[1px]"></div>
                ))}
              </div>

              {/* Luminous Node: ASIA */}
              <div className="absolute top-[240px] left-[420px] w-8 h-8 bg-[#ffb4ab] rounded-full z-30 node-glow-tertiary border border-white/30 translate-x-[-50%] translate-y-[-50%]"></div>

              {/* Labels */}
              <div className="absolute top-[120px] left-[150px] p-2 bg-[#201f1f]/90 backdrop-blur-md border border-[#00e639] text-xs z-40 tactical-bracket translate-x-[-50%]">
                <div className="text-[#00ff41] font-label-code mb-1 font-bold text-[10px]">NODE_US_EAST_01</div>
                <div className="flex gap-2 items-center text-[9px] text-[#b9ccb2]">
                  <span className="w-2 h-2 rounded-full bg-[#00ff41] animate-ping"></span>
                  <span>THROUGHPUT: 18.2 TB/s</span>
                </div>
              </div>

              <div className="absolute top-[400px] left-[350px] p-2 bg-[#201f1f]/90 backdrop-blur-md border border-[#00f1fe] text-xs z-40 tactical-bracket translate-x-[-50%]">
                <div className="text-[#00f1fe] font-label-code mb-1 font-bold text-[10px]">NODE_EU_CENT_04</div>
                <div className="flex gap-2 items-center text-[9px] text-[#b9ccb2]">
                  <span className="w-2 h-2 rounded-full bg-[#00f1fe] animate-pulse"></span>
                  <span>SYNC_RATE: 120.4 Gbit</span>
                </div>
              </div>
            </div>

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
        </main>
      </div>

      {/* Footer */}
      <footer className="bg-[#1c1b1b] text-error flex items-center px-6 justify-between fixed bottom-0 w-full z-50 h-8 border-t border-error/30 font-label-code text-[10px]">
        <div className="flex gap-4 items-center">
          <span className="flicker font-bold">[SYSTEM_READY] // KNOWLEDGE_GRAPH_ONLINE</span>
          <span className="opacity-40">|</span>
          <span className="text-[#b9ccb2]">MEMORY_STATUS: <span className="text-[#00e639]">OPTIMAL</span></span>
        </div>
        <div className="flex gap-6">
          <a className="text-[#ffdad6] hover:bg-error-container hover:text-on-error-container px-2 h-full flex items-center transition-all" href="#">HYBRID_V5_STABLE</a>
          <a className="text-[#ffdad6] hover:bg-error-container hover:text-on-error-container px-2 h-full flex items-center transition-all" href="#">RECOVERY_MODE</a>
          <a className="text-[#ffdad6] hover:bg-error-container hover:text-on-error-container px-2 h-full flex items-center transition-all" href="#">DEBUG_CONSOLE</a>
        </div>
      </footer>
    </div>
  );
}
