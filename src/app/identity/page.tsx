"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

interface AvatarSlot {
  id: string;
  name: string;
  code: string;
  status: string;
  img: string;
  active: boolean;
  locked: boolean;
  progress: number;
}

export default function IdentityAuth() {
  const [slots, setSlots] = useState<AvatarSlot[]>([
    {
      id: "Node_01",
      name: "AV-X2-CORE-22.7",
      code: "PX-101",
      status: "STANDBY",
      img: "https://lh3.googleusercontent.com/aida-public/AB6AXuANiRp2jG9NlKt2AGeR6gxF0gA9GZGloUmt5AUifQmLJ3xSgMqpgPKnz22yNXHMlFh4wePeXijv5mCHiCpEtyxRcTIBQHXh1RL01JUCgv8qFqb_oLnr_AjZowLkULQWh92KC3SnaISF1Ty4UzZ0a_fRPBYElQKzmLXI_wUWXjzEwCTm3XVcrkc-V_9z9va-K9J0VIuy98JgzmuvsdBqYWi8niD5ldh3f_V9jWVkghBcTa5jpclPiwsekZDIXKoVSeCMw79C4Vh1Xok",
      active: false,
      locked: false,
      progress: 30
    },
    {
      id: "Node_02",
      name: "ASY06.5_STABLE",
      code: "PX-808",
      status: "ACCESS DENIED",
      img: "https://lh3.googleusercontent.com/aida-public/AB6AXuANiRp2jG9NlKt2AGeR6gxF0gA9GZGloUmt5AUifQmLJ3xSgMqpgPKnz22yNXHMlFh4wePeXijv5mCHiCpEtyxRcTIBQHXh1RL01JUCgv8qFqb_oLnr_AjZowLkULQWh92KC3SnaISF1Ty4UzZ0a_fRPBYElQKzmLXI_wUWXjzEwCTm3XVcrkc-V_9z9va-K9J0VIuy98JgzmuvsdBqYWi8niD5ldh3f_V9jWVkghBcTa5jpclPiwsekZDIXKoVSeCMw79C4Vh1Xok",
      active: true,
      locked: false,
      progress: 100
    },
    {
      id: "Node_03",
      name: "R.XCOMM_4.5",
      code: "PX-302",
      status: "INACTIVE",
      img: "https://lh3.googleusercontent.com/aida-public/AB6AXuANiRp2jG9NlKt2AGeR6gxF0gA9GZGloUmt5AUifQmLJ3xSgMqpgPKnz22yNXHMlFh4wePeXijv5mCHiCpEtyxRcTIBQHXh1RL01JUCgv8qFqb_oLnr_AjZowLkULQWh92KC3SnaISF1Ty4UzZ0a_fRPBYElQKzmLXI_wUWXjzEwCTm3XVcrkc-V_9z9va-K9J0VIuy98JgzmuvsdBqYWi8niD5ldh3f_V9jWVkghBcTa5jpclPiwsekZDIXKoVSeCMw79C4Vh1Xok",
      active: false,
      locked: false,
      progress: 0
    },
    {
      id: "Node_04",
      name: "LOCKED_BY_ROOT",
      code: "ERR_LOCK",
      status: "RESTRICTED",
      img: "https://lh3.googleusercontent.com/aida-public/AB6AXuANiRp2jG9NlKt2AGeR6gxF0gA9GZGloUmt5AUifQmLJ3xSgMqpgPKnz22yNXHMlFh4wePeXijv5mCHiCpEtyxRcTIBQHXh1RL01JUCgv8qFqb_oLnr_AjZowLkULQWh92KC3SnaISF1Ty4UzZ0a_fRPBYElQKzmLXI_wUWXjzEwCTm3XVcrkc-V_9z9va-K9J0VIuy98JgzmuvsdBqYWi8niD5ldh3f_V9jWVkghBcTa5jpclPiwsekZDIXKoVSeCMw79C4Vh1Xok",
      active: false,
      locked: true,
      progress: 0
    }
  ]);

  const [activeSlot, setActiveSlot] = useState<AvatarSlot>(slots[1]);
  const [overrideState, setOverrideState] = useState<"idle" | "running" | "success">("idle");
  const [pulseIndex, setPulseIndex] = useState(0);

  // Animate the neural handshake loading bar
  useEffect(() => {
    const interval = setInterval(() => {
      setPulseIndex(idx => (idx + 1) % 20);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const handleSelectSlot = (slot: AvatarSlot) => {
    if (slot.locked) return;
    setSlots(prev => prev.map(s => ({ ...s, active: s.id === slot.id })));
    setActiveSlot(slot);
    setOverrideState("idle");
  };

  const handleOverride = () => {
    if (overrideState !== "idle") return;
    setOverrideState("running");
    setTimeout(() => {
      setOverrideState("success");
    }, 3000);
  };

  return (
    <div className="bg-[#0A0A0A] text-[#e5e2e1] font-body-mono selection:bg-[#00ff41]/20 selection:text-[#00ff41] h-[calc(100vh-64px)] flex flex-col overflow-hidden">
      {/* SideNavBar */}
      <aside className="fixed left-0 top-16 h-[calc(100vh-64px)] w-64 z-40 flex flex-col pt-4 bg-[#0e0e0e]/90 backdrop-blur-md border-r border-[#3b4b37] hidden md:flex">
        <div className="px-6 py-4 border-b border-[#3b4b37]/30">
          <div className="font-label-code text-[#ebffe2] uppercase text-xs">NODE_ACTIVE</div>
          <div className="font-body-mono text-[#00dbe7] text-lg font-semibold">US-EAST-01</div>
        </div>
        <div className="flex flex-col mt-4">
          <Link href="/live-cdc" className="text-[#b9ccb2] px-4 py-3 opacity-70 flex items-center gap-3 hover:bg-[#353534]/30 hover:opacity-100 hover:text-white transition-all">
            <span className="material-symbols-outlined text-xl">settings_ethernet</span>
            <span className="font-label-code uppercase text-[10px] tracking-wider">LIVE_CDC</span>
          </Link>
          <Link href="/cluster" className="text-[#b9ccb2] px-4 py-3 opacity-70 flex items-center gap-3 hover:bg-[#353534]/30 hover:opacity-100 hover:text-white transition-all">
            <span className="material-symbols-outlined text-xl">monitor_heart</span>
            <span className="font-label-code uppercase text-[10px] tracking-wider">CLUSTER_HEALTH</span>
          </Link>
          <Link href="/routing" className="text-[#b9ccb2] px-4 py-3 opacity-70 flex items-center gap-3 hover:bg-[#353534]/30 hover:opacity-100 hover:text-white transition-all">
            <span className="material-symbols-outlined text-xl">language</span>
            <span className="font-label-code uppercase text-[10px] tracking-wider">GLOBAL_ROUTING</span>
          </Link>
        </div>
        <div className="mt-auto p-4 bg-[#1c1b1b]/50 border-t border-[#3b4b37]">
          <div className="text-[10px] font-label-code text-[#84967e] uppercase mb-2">System Diagnostics</div>
          <div className="h-1 bg-[#353534] w-full relative overflow-hidden">
            <div className="absolute inset-0 bg-[#00e639] w-3/4 animate-pulse"></div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-grow md:pl-64 p-6 overflow-y-auto scanline-overlay h-[calc(100vh-64px)]">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
          
          {/* Left Pane: Identity Grid Scanner */}
          <section className="flex flex-col relative min-h-[400px]">
            <div className="flex items-center justify-between bg-[#353534] px-3 py-1 border border-[#3b4b37]">
              <span className="text-[10px] font-label-code text-[#72ff70] uppercase tracking-widest">
                Identity Grid Scanner // {activeSlot.id}
              </span>
              <span className="material-symbols-outlined text-sm text-[#84967e] cursor-pointer hover:text-white">close</span>
            </div>
            <div className="relative flex-grow bg-[#0e0e0e] border border-[#3b4b37] overflow-hidden p-6 flex flex-col aspect-[4/5] lg:aspect-auto">
              {/* Tactical Brackets */}
              <div className="absolute bracket-tl"></div>
              <div className="absolute bracket-tr"></div>
              <div className="absolute bracket-bl"></div>
              <div className="absolute bracket-br"></div>
              
              {/* Laser Scan Line */}
              <div className="absolute inset-x-0 z-10 scanning-line pointer-events-none"></div>
              
              {/* Avatar Display */}
              <div className="w-full h-full relative bg-[#201f1f] overflow-hidden border border-[#3b4b37]/30 flex-1 flex items-center justify-center">
                <img 
                  className="w-full h-full object-cover grayscale brightness-75 contrast-125 opacity-80" 
                  alt="Futuristic cybernetic pilot with data streams reflecting off visor."
                  src={activeSlot.img}
                />
                {/* HUD Overlays */}
                <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-black/90 to-transparent">
                  <div className="font-label-code text-[#72ff70] text-[10px] mb-1">
                    {overrideState === "success" ? "BYPASS SUCCESSFUL: CORE UNLOCKED" : "NODE ACCESS DEPLOYMENT: SCANNING ID..."}
                  </div>
                  
                  {overrideState === "success" ? (
                    <div className="flex items-end justify-between">
                      <div className="text-[20px] font-display-tech text-[#00ff41] tracking-widest uppercase font-bold animate-pulse">
                        ACCESS GRANTED
                      </div>
                      <div className="text-[10px] font-label-code text-[#72ff70]">AUTH_KEY: OK-200</div>
                    </div>
                  ) : overrideState === "running" ? (
                    <div className="flex items-end justify-between">
                      <div className="text-[20px] font-display-tech text-[#00f1fe] tracking-widest uppercase font-bold animate-pulse">
                        BYPASSING...
                      </div>
                      <div className="text-[10px] font-label-code text-[#b9ccb2]">OVERRIDE SEQUENCE ACTIVE</div>
                    </div>
                  ) : (
                    <div className="flex items-end justify-between">
                      <div className="text-[20px] font-display-tech text-error tracking-widest uppercase font-bold flicker">
                        {activeSlot.status}
                      </div>
                      <div className="text-[10px] font-label-code text-[#84967e]">ERR_CODE: {activeSlot.code}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Right Pane: Node Avatar Selector */}
          <section className="flex flex-col justify-between gap-6 min-h-[400px]">
            <div className="flex flex-col">
              <div className="flex items-center justify-between bg-[#353534] px-3 py-1 border border-[#3b4b37] mb-4">
                <span className="text-[10px] font-label-code text-[#00dbe7] uppercase tracking-widest">
                  Node Avatar Selector // CLUSTER_POOL
                </span>
                <div className="flex gap-2">
                  <span className="material-symbols-outlined text-sm text-[#00dbe7] cursor-pointer">filter_list</span>
                  <span className="material-symbols-outlined text-sm text-[#84967e] cursor-pointer">more_vert</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {slots.map(slot => (
                  <div 
                    key={slot.id}
                    onClick={() => handleSelectSlot(slot)}
                    className={`border p-4 transition-all relative ${
                      slot.locked 
                        ? "bg-[#1c1b1b] border-[#3b4b37] opacity-40 cursor-not-allowed" 
                        : slot.active 
                        ? "bg-[#00f1fe]/10 border-[#00f1fe] cursor-pointer" 
                        : "bg-[#1c1b1b] border-[#3b4b37] hover:border-[#00dbe7] cursor-pointer"
                    }`}
                  >
                    {slot.active && (
                      <div className="absolute top-0 right-0 p-1 bg-[#00f1fe] text-[#002022] font-label-code text-[8px] px-2 font-bold">
                        ACTIVE
                      </div>
                    )}
                    <div className="flex justify-between items-start mb-3">
                      <div className={`w-8 h-8 flex items-center justify-center rounded ${slot.active ? "bg-[#00f1fe]/20 text-[#00f1fe]" : "bg-[#353534]/50 text-[#84967e]"}`}>
                        <span className="material-symbols-outlined text-lg">
                          {slot.locked ? "lock" : slot.id === "Node_02" ? "psychology" : slot.id === "Node_03" ? "memory" : "person_search"}
                        </span>
                      </div>
                      <div className="text-[10px] font-label-code text-[#84967e] uppercase">{slot.id}</div>
                    </div>
                    <div className={`font-body-mono-sm text-[12px] truncate ${slot.active ? "text-[#00f1fe] font-bold" : "text-[#b9ccb2]"}`}>
                      {slot.name}
                    </div>
                    {!slot.locked && (
                      <div className="mt-2 h-1 bg-[#201f1f] overflow-hidden">
                        <div className={`h-full ${slot.active ? "bg-[#00f1fe]" : "bg-[#84967e]"} transition-all duration-300`} style={{ width: `${slot.progress}%` }}></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Validation Progress Tier */}
            <div className="bg-[#0e0e0e] border border-[#3b4b37] p-6 flex flex-col gap-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-[#00e639] text-sm">security</span>
                <h3 className="font-label-code text-[10px] text-white uppercase tracking-widest">
                  Validation Progress Tier // DEC_SEQ
                </h3>
              </div>

              {/* Track 1 */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-[10px] font-label-code uppercase text-[#84967e]">
                  <span>Core_Hash_Verification</span>
                  <span className="text-[#00e639]">84%</span>
                </div>
                <div className="segment-bar h-3 flex w-full">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div key={i} className={`flex-1 h-full mr-[2px] ${i < 17 ? "bg-[#00e639] shadow-[0_0_4px_#00e639]" : "bg-[#1c1b1b]"}`}></div>
                  ))}
                </div>
              </div>

              {/* Track 2 */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-[10px] font-label-code uppercase text-[#84967e]">
                  <span>Sub-millisecond_Sync</span>
                  <span className="text-[#00e639]">42%</span>
                </div>
                <div className="segment-bar h-3 flex w-full">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div key={i} className={`flex-1 h-full mr-[2px] ${i < 8 ? "bg-[#00e639] shadow-[0_0_4px_#00e639]" : "bg-[#1c1b1b]"}`}></div>
                  ))}
                </div>
              </div>

              {/* Track 3 */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-[10px] font-label-code uppercase text-[#84967e]">
                  <span>Neural_Handshake</span>
                  <span>{overrideState === "success" ? "SYNC COMPLETED" : "COMPUTING..."}</span>
                </div>
                <div className="segment-bar h-3 flex w-full">
                  {Array.from({ length: 20 }).map((_, i) => {
                    const isActive = overrideState === "success" ? true : Math.abs(i - pulseIndex) < 3;
                    const opacity = overrideState === "success" ? 1 : isActive ? (3 - Math.abs(i - pulseIndex)) / 3 : 0;
                    return (
                      <div 
                        key={i} 
                        className={`flex-1 h-full mr-[2px] transition-all duration-100 ${isActive ? "bg-[#00e639] shadow-[0_0_4px_#00e639]" : "bg-[#1c1b1b]"}`}
                        style={{ opacity: isActive ? opacity : 1 }}
                      ></div>
                    );
                  })}
                </div>
              </div>

              <button 
                onClick={handleOverride}
                disabled={overrideState !== "idle"}
                className={`w-full font-label-code py-3 text-[12px] uppercase tracking-widest transition-all border-b-4 ${
                  overrideState === "success"
                    ? "bg-[#00e639] text-[#002203] border-[#00530e]"
                    : overrideState === "running"
                    ? "bg-[#00f1fe]/20 text-[#00f1fe] border-[#004f54] cursor-not-allowed"
                    : "bg-[#00e639] text-[#002203] hover:brightness-110 active:opacity-90 border-[#00530e]"
                }`}
              >
                {overrideState === "success" 
                  ? "Identity Overridden" 
                  : overrideState === "running" 
                  ? "Bypassing Protocol..." 
                  : "Override Identity Protocol"}
              </button>
            </div>
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 w-full z-50 h-8 flex items-center px-6 justify-between bg-[#1c1b1b] border-t border-error/30">
        <div className="flex items-center gap-4">
          <span className="material-symbols-outlined text-error text-[14px] animate-pulse">radio_button_checked</span>
          <div className="font-label-code text-[10px] text-error uppercase">[SYSTEM_READY] // INTERRUPT_LISTENER_ACTIVE</div>
        </div>
        <div className="flex gap-6">
          <a className="text-[#ffdad6] font-label-code text-[10px] hover:text-error transition-all uppercase" href="#">V1.0.4_STABLE</a>
          <a className="text-[#ffdad6] font-label-code text-[10px] hover:text-error transition-all uppercase" href="#">RECOVERY_MODE</a>
          <a className="text-[#ffdad6] font-label-code text-[10px] hover:text-error transition-all uppercase" href="#">DEBUG_CONSOLE</a>
        </div>
      </footer>
    </div>
  );
}
