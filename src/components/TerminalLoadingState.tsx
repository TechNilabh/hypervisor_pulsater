"use client";

import React from "react";

interface TerminalLoadingStateProps {
  label?: string;
}

/**
 * TerminalLoadingState — full-panel loading state matching the tactical aesthetic.
 * Renders a centred neon-cyan glowing spinner block with a blinking cursor.
 * Drop this in where a page section is waiting on a fetch.
 */
export function TerminalLoadingState({
  label = "LOADING...",
}: TerminalLoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 select-none">
      <div className="relative w-12 h-12">
        <span
          className="absolute inset-0 rounded-full border-2 border-[#00f1fe]/20"
          style={{ borderTopColor: "#00f1fe" }}
        >
          <style jsx>{`
            span {
              animation: spin 900ms linear infinite;
            }
            @keyframes spin {
              to {
                transform: rotate(360deg);
              }
            }
          `}</style>
        </span>
        <span className="absolute inset-[6px] rounded-full border border-[#00e639]/30" />
      </div>

      <div className="flex items-center gap-1 font-mono text-[11px] tracking-widest text-[#00f1fe]/80 uppercase">
        <span className="animate-pulse">{label}</span>
        <span
          className="inline-block w-[7px] h-[13px] bg-[#00f1fe] ml-1"
          style={{ animation: "blink 1.1s step-end infinite" }}
        />
        <style jsx>{`
          @keyframes blink {
            0%,
            100% {
              opacity: 1;
            }
            50% {
              opacity: 0;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
