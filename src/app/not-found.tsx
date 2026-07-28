"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

export default function NotFound() {
  const [mounted, setMounted] = useState(false);
  const [timestamp, setTimestamp] = useState("");

  useEffect(() => {
    setMounted(true);
    setTimestamp(new Date().toISOString());
  }, []);

  return (
    <div className="bg-[#0A0A0A] text-[#e5e2e1] font-body-mono min-h-screen flex items-center justify-center p-6 relative scanlines">
      {/* Grid Texture Layer */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: "radial-gradient(#00f1fe 1px, transparent 1px)", backgroundSize: "32px 32px" }}></div>

      <div className="w-full max-w-2xl bg-[#0e0e0e] border border-[#3b4b37] p-8 relative overflow-hidden flex flex-col rounded-sm shadow-[0_0_50px_rgba(0,0,0,0.85)]">
        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#00f1fe] z-30"></div>
        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#00f1fe] z-30"></div>
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#00f1fe] z-30"></div>
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#00f1fe] z-30"></div>

        <div className="mb-6 border-b border-[#3b4b37]/30 pb-4">
          <div className="flex items-center gap-2 text-[#00f1fe]">
            <span className="material-symbols-outlined text-sm">warning</span>
            <span className="font-label-code text-[10px] tracking-widest uppercase">SOCKET_UNMAPPED_NODE_EXCEPTION</span>
          </div>
        </div>

        <div className="space-y-6 text-left">
          <div className="p-4 bg-black border border-[#93000a]/50 text-error font-body-mono text-xs rounded-sm whitespace-pre-line leading-relaxed">
            FATAL: INVALID UNMAPPED NODE DIRECTION // DISCONNECTED
            {"\n"}TIMESTAMP: {mounted ? timestamp : "2026-06-19T00:00:00.000Z"}
            {"\n"}REQUEST_PATH: unmapped_routing_segment
            {"\n"}STATUS_CODE: ERR_CODE_404
          </div>

          <p className="font-body-mono-sm text-[12px] text-[#b9ccb2] leading-relaxed">
            The unmapped router coordinates did not connect to any active replication container or data warehouse shard. Ensure your address routing table is synchronized.
          </p>

          <div className="pt-4 flex justify-between items-center border-t border-[#3b4b37]/20">
            <Link 
              href="/" 
              className="text-[#00f1fe] hover:text-[#00ff41] font-label-code text-xs tracking-wider flex items-center gap-2 transition-colors group"
            >
              <span className="material-symbols-outlined text-sm group-hover:-translate-x-1 transition-transform">arrow_back</span>
              RETURN TO GATEWAY DASHBOARD <span className="cursor-blink font-bold text-[#00f1fe]">_</span>
            </Link>
            <span className="font-label-code text-[8px] text-[#84967e]">PORT: 3000 // STATUS: STANDBY</span>
          </div>
        </div>
      </div>
    </div>
  );
}
