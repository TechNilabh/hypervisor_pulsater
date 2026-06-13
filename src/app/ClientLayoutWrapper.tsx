"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { playClick, playHover } from "./useTerminalAudio";

export default function ClientLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [operatorId, setOperatorId] = useState("US-EAST-01");

  // Read operator status and register listeners
  useEffect(() => {
    const loadOperator = () => {
      const stored = localStorage.getItem("selected_operator_id");
      if (stored) {
        setOperatorId(stored);
      }
    };

    loadOperator();

    // Listen for custom events when operator identity changes
    window.addEventListener("operatorChanged", loadOperator);

    // Audio triggers
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("button, a, [role='button'], input[type='submit'], input[type='button']")) {
        playClick();
      }
    };

    const handleGlobalMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isLink = target.closest("a, button, [role='button']");
      if (isLink && !isLink.contains(e.relatedTarget as Node)) {
        playHover();
      }
    };

    document.addEventListener("click", handleGlobalClick);
    document.addEventListener("mouseover", handleGlobalMouseOver);

    return () => {
      window.removeEventListener("operatorChanged", loadOperator);
      document.removeEventListener("click", handleGlobalClick);
      document.removeEventListener("mouseover", handleGlobalMouseOver);
    };
  }, []);

  const navLinks = [
    { name: "LIVE_CDC", path: "/live-cdc", icon: "sensors" },
    { name: "CLUSTER_HEALTH", path: "/cluster", icon: "dns" },
    { name: "GLOBAL_ROUTING", path: "/routing", icon: "hub" },
    { name: "CONNECTIONS", path: "/connections", icon: "settings_ethernet" },
    { name: "ALERTS", path: "/alerts", icon: "warning" },
    { name: "SETTINGS", path: "/settings", icon: "terminal" },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[#0A0A0A] overflow-hidden text-[#e5e2e1] font-body-mono selection:bg-[#00ff41]/20 selection:text-[#00ff41]">
      
      {/* Background scanline */}
      <div className="fixed inset-0 scanline pointer-events-none opacity-25 z-50"></div>

      {/* Fixed Top horizontal navigation bar (stretched 100% wide) */}
      <nav className="fixed top-0 left-0 right-0 h-16 z-50 bg-[#0e0e0e]/80 backdrop-blur-xl border-b border-[#3b4b37]/50 shadow-[0_0_15px_rgba(0,241,254,0.1)] flex justify-between items-center px-6">
        <Link href="/" className="font-display-tech text-lg text-[#00e639] tracking-tighter hover:opacity-85 font-bold transition-all">
          HYPERVISOR_PULSATER
        </Link>
        
        {/* Navigation links synced to routes */}
        <div className="hidden md:flex items-center gap-6">
          <Link href="/live-cdc" className={`font-body-mono text-xs ${pathname === "/live-cdc" ? "text-[#00f1fe] border-b-2 border-[#00f1fe] pb-1" : "text-[#b9ccb2] hover:text-[#00f1fe] transition-colors"}`}>
            TRANSACTIONS
          </Link>
          <Link href="/routing" className={`font-body-mono text-xs ${pathname === "/routing" ? "text-[#00f1fe] border-b-2 border-[#00f1fe] pb-1" : "text-[#b9ccb2] hover:text-[#00f1fe] transition-colors"}`}>
            REPLICATION
          </Link>
          <Link href="/settings" className={`font-body-mono text-xs ${pathname === "/settings" ? "text-[#00f1fe] border-b-2 border-[#00f1fe] pb-1" : "text-[#b9ccb2] hover:text-[#00f1fe] transition-colors"}`}>
            TOOLKIT
          </Link>
          <Link href="/cluster" className={`font-body-mono text-xs ${pathname === "/cluster" ? "text-[#00f1fe] border-b-2 border-[#00f1fe] pb-1" : "text-[#b9ccb2] hover:text-[#00f1fe] transition-colors"}`}>
            METRICS
          </Link>
        </div>

        {/* Action controls and active identity avatar state */}
        <div className="flex items-center gap-4 pl-4 border-l border-[#3b4b37]/40">
          <div className="flex items-center gap-2 mr-2">
            <Link href="/settings" className="material-symbols-outlined p-1.5 text-[#b9ccb2] hover:text-[#00f1fe] hover:bg-[#1c1b1b] rounded transition-all">settings_input_component</Link>
            <Link href="/error-terminal" className="material-symbols-outlined p-1.5 text-[#b9ccb2] hover:text-[#00ff41] hover:bg-[#1c1b1b] rounded transition-all">terminal</Link>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="text-right hidden lg:block">
              <div className="font-label-code text-[9px] text-[#00e639] leading-none font-bold">OPERATOR</div>
              <div className="font-body-mono text-[10px] text-[#00f1fe] mt-1 max-w-[120px] truncate" title={operatorId}>
                {operatorId.split(" // ")[0] || operatorId}
              </div>
            </div>
            <Link href="/identity" className="w-8 h-8 rounded bg-[#1c1b1b] border border-[#3b4b37] flex items-center justify-center hover:border-[#00f1fe] group transition-colors" title="Select Avatar Identity">
              <span className="material-symbols-outlined text-[#00f1fe] text-lg group-hover:scale-110 transition-transform">person</span>
            </Link>
          </div>

          <Link href="/connections" className="hidden lg:block px-4 py-1.5 bg-[#00f1fe]/10 border border-[#00f1fe]/40 text-[#00f1fe] font-label-code text-[10px] rounded hover:bg-[#00f1fe]/20 active:skew-x-2 transition-all">
            DEPLOY_NODE
          </Link>
        </div>
      </nav>

      {/* Global Collapsible Sidebar positioned directly underneath top navbar */}
      <aside 
        className={`fixed left-0 top-16 h-[calc(100vh-64px)] z-40 bg-[#0e0e0e] border-r border-[#3b4b37] flex flex-col pt-4 transition-all duration-300 ${
          isCollapsed ? "w-16" : "w-64"
        }`}
      >
        {/* Collapsible toggle boundary button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-10 w-6 h-6 rounded-full bg-[#131313] border border-[#3b4b37] flex items-center justify-center text-[#00f1fe] hover:text-[#00ff41] hover:border-[#00ff41] active:scale-95 transition-all shadow-[0_0_8px_rgba(0,241,254,0.2)] z-50"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <span className="material-symbols-outlined text-[14px]">
            {isCollapsed ? "chevron_right" : "chevron_left"}
          </span>
        </button>

        {/* Sidebar Header: Active Operator Identifier */}
        <div className="px-4 border-b border-[#3b4b37]/30 pb-3 mb-3 relative overflow-hidden flex items-center justify-between">
          {!isCollapsed ? (
            <div className="flex flex-col">
              <span className="font-label-code text-[8px] text-[#00e639] leading-none tracking-widest font-bold">
                NODE_ACTIVE
              </span>
              <span className="font-body-mono text-[10px] text-[#00f1fe] mt-1 truncate max-w-[170px]" title={operatorId}>
                {operatorId}
              </span>
            </div>
          ) : (
            <div className="w-full flex justify-center">
              <span className="w-2 h-2 rounded-full bg-[#00ff41] animate-pulse shadow-[0_0_8px_#00ff41]" title={`Active: ${operatorId}`}></span>
            </div>
          )}
        </div>

        {/* Sidebar Navigation Links */}
        <nav className="flex-grow flex flex-col space-y-1">
          {navLinks.map((link) => {
            const isActive = pathname === link.path;
            return (
              <Link
                key={link.path}
                href={link.path}
                className={`flex items-center gap-3 px-4 py-3 transition-all relative ${
                  isActive 
                    ? "bg-[#00f1fe]/10 text-[#00f1fe] border-l-4 border-[#00f1fe] font-bold" 
                    : "text-[#b9ccb2] hover:bg-[#353534]/30 hover:text-white"
                }`}
              >
                <span className="material-symbols-outlined text-lg">{link.icon}</span>
                {!isCollapsed && (
                  <span className="font-label-code text-[11px] tracking-wider truncate">
                    {link.name}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer / Extra links */}
        <div className="p-4 border-t border-[#3b4b37]/30 flex flex-col gap-2">
          {!isCollapsed ? (
            <div className="flex justify-between items-center text-[10px]">
              <Link href="/login" className="text-[#b9ccb2] hover:text-[#00f1fe] transition-colors">
                OPERATOR_GATE
              </Link>
              <Link href="/identity" className="text-[#b9ccb2] hover:text-[#00ff41] transition-colors">
                IDENTITY
              </Link>
            </div>
          ) : (
            <Link 
              href="/login" 
              className="material-symbols-outlined text-center text-[#b9ccb2] hover:text-[#00f1fe] w-full"
              title="Operator Gate / Identity"
            >
              logout
            </Link>
          )}
        </div>
      </aside>

      {/* Main content shifted right by sidebar width and down by top header height (pt-16) */}
      <main 
        className={`flex-grow min-h-[calc(100vh-64px)] pt-16 bg-[#0A0A0A] transition-all duration-300 ${
          isCollapsed ? "pl-16" : "pl-64"
        }`}
      >
        {children}
      </main>
    </div>
  );
}
