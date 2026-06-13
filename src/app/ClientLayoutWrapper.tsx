"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { playClick, playHover, playNotificationSound } from "./useTerminalAudio";

interface ToastMessage {
  id: string;
  type: "success" | "error" | "info";
  message: string;
  metadata?: Record<string, any>;
}

export default function ClientLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [operatorId, setOperatorId] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("selected_operator_id") || "US-EAST-01";
    }
    return "US-EAST-01";
  });
  const [operatorAvatar, setOperatorAvatar] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("selected_operator_avatar");
    }
    return null;
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Setup Global Toast listener
  useEffect(() => {
    const showToast = (type: "success" | "error" | "info", message: string, metadata?: Record<string, any>) => {
      playNotificationSound();
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: ToastMessage = { id, type, message, metadata };
      
      setToasts(prev => [...prev, newToast]);

      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 6000);
    };

    (window as any).toast = {
      success: (msg: string, meta?: Record<string, any>) => showToast("success", msg, meta),
      error: (msg: string, meta?: Record<string, any>) => showToast("error", msg, meta),
      info: (msg: string, meta?: Record<string, any>) => showToast("info", msg, meta),
    };
  }, []);

  // Read operator status and register listeners
  useEffect(() => {
    setMounted(true);
    const loadOperator = () => {
      const stored = localStorage.getItem("selected_operator_id");
      if (stored) {
        setOperatorId(stored);
      }
      const avatar = localStorage.getItem("selected_operator_avatar");
      if (avatar) {
        setOperatorAvatar(avatar);
      } else {
        setOperatorAvatar(null);
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

  // Close mobile sidebar on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  const navLinks = [
    { name: "LIVE_CDC", path: "/live-cdc", icon: "sensors" },
    { name: "CLUSTER_HEALTH", path: "/cluster", icon: "dns" },
    { name: "GLOBAL_ROUTING", path: "/routing", icon: "hub" },
    { name: "CONNECTIONS", path: "/connections", icon: "settings_ethernet" },
    { name: "ALERTS", path: "/alerts", icon: "warning" },
    { name: "SETTINGS", path: "/settings", icon: "terminal" },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[#0A0A0A] overflow-x-hidden text-[#e5e2e1] font-body-mono selection:bg-[#00ff41]/20 selection:text-[#00ff41]">
      
      {/* Background scanline */}
      <div className="fixed inset-0 scanline pointer-events-none opacity-25 z-50"></div>

      {/* Fixed Top horizontal navigation bar (stretched 100% wide) */}
      <nav className="fixed top-0 left-0 right-0 h-16 z-50 bg-[#0e0e0e]/80 backdrop-blur-xl border-b border-[#3b4b37]/50 shadow-[0_0_15px_rgba(0,241,254,0.1)] flex justify-between items-center px-4 md:px-6">
        <div className="flex items-center">
          {/* Mobile hamburger menu toggle */}
          <button
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            className="md:hidden mr-3 flex items-center justify-center p-1.5 rounded border border-[#3b4b37] bg-[#131313] text-[#00f1fe] hover:text-[#00ff41] hover:border-[#00ff41] transition-all"
            title="Toggle Menu"
          >
            <span className="material-symbols-outlined text-xl">
              {isMobileOpen ? "close" : "menu"}
            </span>
          </button>
          
          <Link href="/" className="font-display-tech text-md md:text-lg text-[#00e639] tracking-tighter hover:opacity-85 font-bold transition-all">
            HYPERVISOR_PULSATER
          </Link>
        </div>
        
        {/* Navigation links synced to routes - Hidden on Mobile */}
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
        <div className="flex items-center gap-2 md:gap-4 pl-2 md:pl-4 border-l border-[#3b4b37]/40">
          <div className="flex items-center gap-1 md:gap-2 mr-1">
            <Link href="/settings" className="material-symbols-outlined p-1.5 text-[#b9ccb2] hover:text-[#00f1fe] hover:bg-[#1c1b1b] rounded transition-all">settings_input_component</Link>
            <Link href="/error-terminal" className="material-symbols-outlined p-1.5 text-[#b9ccb2] hover:text-[#00ff41] hover:bg-[#1c1b1b] rounded transition-all">terminal</Link>
          </div>
          
          <div className="flex items-center gap-2 md:gap-3">
            {mounted ? (
              <>
                <div className="text-right hidden lg:block">
                  <div className="font-label-code text-[9px] text-[#00e639] leading-none font-bold">OPERATOR</div>
                  <div className="font-body-mono text-[10px] text-[#00f1fe] mt-1 max-w-[120px] truncate" title={operatorId}>
                    {operatorId.split(" // ")[0] || operatorId}
                  </div>
                </div>
                <Link href="/identity" className="w-8 h-8 rounded bg-[#1c1b1b] border border-[#3b4b37] flex items-center justify-center hover:border-[#00f1fe] group overflow-hidden transition-colors" title="Select Avatar Identity">
                  {operatorAvatar ? (
                    <img src={operatorAvatar} alt="Operator Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-[#00f1fe] text-lg group-hover:scale-110 transition-transform">person</span>
                  )}
                </Link>
              </>
            ) : (
              <div className="w-8 h-8 rounded bg-[#1c1b1b] border border-[#3b4b37]/50 flex items-center justify-center animate-pulse" />
            )}
          </div>

          <Link href="/connections" className="hidden sm:block px-3 py-1.5 bg-[#00f1fe]/10 border border-[#00f1fe]/40 text-[#00f1fe] font-label-code text-[10px] rounded hover:bg-[#00f1fe]/20 active:skew-x-2 transition-all">
            DEPLOY_NODE
          </Link>
        </div>
      </nav>

      {/* Backdrop overlay for mobile menu */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 top-16 bg-black/60 backdrop-blur-sm z-30 md:hidden transition-all duration-300"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Global Collapsible Sidebar positioned directly underneath top navbar */}
      <aside 
        className={`fixed left-0 top-16 h-[calc(100vh-64px)] z-40 bg-[#0e0e0e] border-r border-[#3b4b37] flex flex-col pt-4 transition-all duration-300 md:translate-x-0 ${
          isMobileOpen ? "translate-x-0 shadow-[0_0_15px_rgba(0,0,0,0.5)]" : "-translate-x-full"
        } ${isCollapsed ? "md:w-16" : "md:w-64"} w-64`}
      >
        {/* Collapsible toggle boundary button - Hidden on Mobile */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden md:flex absolute -right-3 top-10 w-6 h-6 rounded-full bg-[#131313] border border-[#3b4b37] flex items-center justify-center text-[#00f1fe] hover:text-[#00ff41] hover:border-[#00ff41] active:scale-95 transition-all shadow-[0_0_8px_rgba(0,241,254,0.2)] z-50"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <span className="material-symbols-outlined text-[14px]">
            {isCollapsed ? "chevron_right" : "chevron_left"}
          </span>
        </button>

        {/* Sidebar Header: Active Operator Identifier */}
        <div className="px-4 border-b border-[#3b4b37]/30 pb-3 mb-3 relative overflow-hidden flex items-center justify-between">
          {mounted ? (
            !isCollapsed ? (
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
            )
          ) : (
            <div className="w-full h-6 bg-[#131313] animate-pulse rounded" />
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
                onClick={() => setIsMobileOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 transition-all relative ${
                  isActive 
                    ? "bg-[#00f1fe]/10 text-[#00f1fe] border-l-4 border-[#00f1fe] font-bold" 
                    : "text-[#b9ccb2] hover:bg-[#353534]/30 hover:text-white"
                }`}
              >
                <span className="material-symbols-outlined text-lg">{link.icon}</span>
                {(!isCollapsed || isMobileOpen) && (
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
              <Link href="/login" onClick={() => setIsMobileOpen(false)} className="text-[#b9ccb2] hover:text-[#00f1fe] transition-colors">
                OPERATOR_GATE
              </Link>
              <Link href="/identity" onClick={() => setIsMobileOpen(false)} className="text-[#b9ccb2] hover:text-[#00ff41] transition-colors">
                IDENTITY
              </Link>
            </div>
          ) : (
            <Link 
              href="/login" 
              onClick={() => setIsMobileOpen(false)}
              className="material-symbols-outlined text-center text-[#b9ccb2] hover:text-[#00f1fe] w-full"
              title="Operator Gate / Identity"
            >
              logout
            </Link>
          )}
        </div>
      </aside>

      {/* Main content shifted right by sidebar width on desktop, and down by top header height (pt-16) */}
      <main 
        className={`flex-grow min-h-[calc(100vh-64px)] pt-16 bg-[#0A0A0A] transition-all duration-300 pl-0 ${
          isCollapsed ? "md:pl-16" : "md:pl-64"
        }`}
      >
        {children}
      </main>

      {/* HUD Glassmorphic Toast Notifications Overlay */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-4 bg-[#0e0e0e]/95 backdrop-blur-md border border-t-4 rounded-sm shadow-2xl flex flex-col gap-2 transition-all duration-300 transform translate-y-0 animate-slide-in-right ${
              toast.type === "success" 
                ? "border-emerald-500/30 border-t-[#00ff41]" 
                : toast.type === "error"
                ? "border-red-500/30 border-t-error"
                : "border-cyan-500/30 border-t-[#00f1fe]"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className={`material-symbols-outlined text-sm ${
                  toast.type === "success" ? "text-[#00ff41]" : toast.type === "error" ? "text-error" : "text-[#00f1fe]"
                }`}>
                  {toast.type === "success" ? "check_circle" : toast.type === "error" ? "warning" : "info"}
                </span>
                <span className="font-label-code text-[10px] uppercase tracking-wider text-white">
                  {toast.type === "success" ? "REPLICATION_EVENT_SUCCESS" : toast.type === "error" ? "TELEMETRY_SYSTEM_FAULT" : "SYSTEM_NOTIFICATION"}
                </span>
              </div>
              <button 
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                className="text-[#b9ccb2] hover:text-white cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-xs">close</span>
              </button>
            </div>
            
            <div className="font-body-mono text-xs text-[#b9ccb2]">
              {toast.message}
            </div>

            {toast.metadata && Object.keys(toast.metadata).length > 0 && (
              <div className="mt-1.5 pt-1.5 border-t border-[#3b4b37]/30 font-body-mono-sm text-[9px] text-[#84967e] flex flex-col gap-0.5">
                {Object.entries(toast.metadata).map(([key, val]) => (
                  <div key={key} className="flex justify-between gap-4">
                    <span className="uppercase text-left">{key.replace(/_/g, " ")}:</span>
                    <span className="text-[#00f1fe] text-right truncate max-w-[180px]">{String(val)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
