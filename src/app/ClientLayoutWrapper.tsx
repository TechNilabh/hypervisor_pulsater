"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ClientLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Cyberpunk Audio Hooks
  useEffect(() => {
    // Initialize audio clips
    const clickAudio = new Audio("https://assets.mixkit.co/active_storage/sfx/2568/2568-84.wav");
    const hoverAudio = new Audio("https://assets.mixkit.co/active_storage/sfx/2568/2568-85.wav");
    
    // Low-frequency warning alarm for error states
    const playErrorAlarm = () => {
      const errorAudio = new Audio("https://assets.mixkit.co/active_storage/sfx/951/951-84.wav");
      errorAudio.volume = 0.5;
      errorAudio.play().catch(() => {});
    };

    // Global click listener for buttons and links
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isClickable = target.closest("button, a, [role='button'], input[type='submit'], input[type='button']");
      if (isClickable) {
        clickAudio.currentTime = 0;
        clickAudio.volume = 0.8;
        clickAudio.play().catch(() => {});
      }
    };

    // Global mouseenter/mouseover listener for hover sound ticks
    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isLink = target.closest("a, button, [role='button']");
      // Check that we're moving onto the element from outside
      if (isLink && !isLink.contains(e.relatedTarget as Node)) {
        hoverAudio.currentTime = 0;
        hoverAudio.volume = 0.3; // soft blip
        hoverAudio.play().catch(() => {});
      }
    };

    document.addEventListener("click", handleClick);
    document.addEventListener("mouseover", handleMouseOver);

    // Play error alert if current route is /error-terminal
    if (pathname === "/error-terminal") {
      playErrorAlarm();
    }

    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("mouseover", handleMouseOver);
    };
  }, [pathname]);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Persisted TopNavBar (Page 1 Welcome Gateway Design) */}
      <nav className="fixed top-0 w-full z-50 bg-[#131313]/80 backdrop-blur-xl border-b border-[#3b4b37] shadow-[0_0_15px_rgba(0,241,254,0.1)] flex justify-between items-center px-6 h-16">
        <Link href="/" className="font-display-tech text-[24px] text-[#00e639] tracking-tighter hover:opacity-85 transition-opacity font-bold">
          HYPERVISOR_PULSATER
        </Link>
        <div className="hidden md:flex items-center gap-6">
          <Link 
            className={`font-body-mono text-[14px] transition-colors ${
              pathname === "/live-cdc" 
                ? "text-[#74f5ff] border-b-2 border-[#74f5ff] pb-1 font-bold" 
                : "text-[#b9ccb2] hover:text-[#74f5ff]"
            }`} 
            href="/live-cdc"
          >
            TRANSACTIONS
          </Link>
          <Link 
            className={`font-body-mono text-[14px] transition-colors ${
              pathname === "/cluster" 
                ? "text-[#74f5ff] border-b-2 border-[#74f5ff] pb-1 font-bold" 
                : "text-[#b9ccb2] hover:text-[#74f5ff]"
            }`} 
            href="/cluster"
          >
            REPLICATION
          </Link>
          <Link 
            className={`font-body-mono text-[14px] transition-colors ${
              pathname === "/settings" 
                ? "text-[#74f5ff] border-b-2 border-[#74f5ff] pb-1 font-bold" 
                : "text-[#b9ccb2] hover:text-[#74f5ff]"
            }`} 
            href="/settings"
          >
            TOOLKIT
          </Link>
          <Link 
            className={`font-body-mono text-[14px] transition-colors ${
              pathname === "/routing" 
                ? "text-[#74f5ff] border-b-2 border-[#74f5ff] pb-1 font-bold" 
                : "text-[#b9ccb2] hover:text-[#74f5ff]"
            }`} 
            href="/routing"
          >
            METRICS
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 mr-2">
            <Link 
              href="/connections" 
              className={`material-symbols-outlined p-2 transition-all duration-200 rounded ${
                pathname === "/connections" 
                  ? "text-white bg-[#353534]" 
                  : "text-[#b9ccb2] hover:bg-[#353534] hover:text-white"
              }`}
              title="Connection Setup"
            >
              settings_input_component
            </Link>
            <Link 
              href="/error-terminal" 
              className={`material-symbols-outlined p-2 transition-all duration-200 rounded ${
                pathname === "/error-terminal" 
                  ? "text-white bg-[#353534]" 
                  : "text-[#b9ccb2] hover:bg-[#353534] hover:text-white"
              }`}
              title="Terminal Exceptions"
            >
              terminal
            </Link>
          </div>
          {/* Auth State Container */}
          <div className="flex items-center gap-4 border-l border-[#3b4b37] pl-4">
            <Link 
              href="/login" 
              className="px-4 py-1.5 border border-[#74f5ff] text-[#74f5ff] font-label-code text-[10px] rounded hover:bg-[#74f5ff]/10 transition-all glow-cyan-border whitespace-nowrap"
            >
              LOGIN / SIGNUP
            </Link>
            <Link 
              href="/connections" 
              className="hidden lg:block px-4 py-2 bg-[#00f1fe] text-[#002022] font-label-code text-[10px] rounded active:skew-x-2 transition-transform hover:bg-[#74f5ff]"
            >
              DEPLOY_NODE
            </Link>
          </div>
        </div>
      </nav>

      {/* Main page content area shifted down by header height (16 = 64px) */}
      <div className="flex-grow pt-16">
        {children}
      </div>
    </div>
  );
}
