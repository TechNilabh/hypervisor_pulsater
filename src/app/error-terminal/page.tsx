"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";

export default function ErrorTerminal() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [rebooting, setRebooting] = useState(false);
  const [flickerSpeed, setFlickerSpeed] = useState(0.3);

  // Snake Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let gridSize = 20;
    let snake = [{ x: 10, y: 10 }];
    let food = { x: 15, y: 15 };
    let dx = 1;
    let dy = 0;
    let lastTime = 0;
    const speed = 100; // ms per frame update

    const getRandomInt = (max: number) => Math.floor(Math.random() * max);

    const resetFood = () => {
      const cols = Math.floor(canvas.width / gridSize);
      const rows = Math.floor(canvas.height / gridSize);
      food = {
        x: getRandomInt(cols),
        y: getRandomInt(rows)
      };
    };

    const update = (t: number) => {
      if (!lastTime) lastTime = t;
      const dt = t - lastTime;

      if (dt > speed) {
        lastTime = t;
        
        const head = { x: snake[0].x + dx, y: snake[0].y + dy };
        
        const cols = Math.floor(canvas.width / gridSize);
        const rows = Math.floor(canvas.height / gridSize);
        
        // Wall collision or self-collision
        if (
          head.x < 0 || 
          head.x >= cols || 
          head.y < 0 || 
          head.y >= rows || 
          snake.some(s => s.x === head.x && s.y === head.y)
        ) {
          // Reset Game
          snake = [{ x: 10, y: 10 }];
          dx = 1;
          dy = 0;
          setScore(0);
          resetFood();
          return requestAnimationFrame(update);
        }

        snake.unshift(head);

        if (head.x === food.x && head.y === food.y) {
          setScore(prev => prev + 1);
          resetFood();
        } else {
          snake.pop();
        }
      }

      // Render Canvas
      ctx.fillStyle = "#0e0e0e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Grid lines
      ctx.strokeStyle = "#1c1b1b";
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Draw Food (Transaction Block)
      ctx.fillStyle = "#00ff41";
      ctx.shadowBlur = 10;
      ctx.shadowColor = "#00ff41";
      ctx.fillRect(food.x * gridSize + 2, food.y * gridSize + 2, gridSize - 4, gridSize - 4);
      
      // Draw Snake (Data Stream)
      ctx.fillStyle = "#00f2ff";
      ctx.shadowColor = "#00f2ff";
      snake.forEach((s, i) => {
        ctx.globalAlpha = 1 - (i / snake.length) * 0.5;
        ctx.fillRect(s.x * gridSize + 1, s.y * gridSize + 1, gridSize - 2, gridSize - 2);
      });
      ctx.globalAlpha = 1.0;
      ctx.shadowBlur = 0;

      animationId = requestAnimationFrame(update);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // WASD or arrow keys
      if ((e.key === "w" || e.key === "W" || e.key === "ArrowUp") && dy === 0) {
        dx = 0;
        dy = -1;
      }
      if ((e.key === "s" || e.key === "S" || e.key === "ArrowDown") && dy === 0) {
        dx = 0;
        dy = 1;
      }
      if ((e.key === "a" || e.key === "A" || e.key === "ArrowLeft") && dx === 0) {
        dx = -1;
        dy = 0;
      }
      if ((e.key === "d" || e.key === "D" || e.key === "ArrowRight") && dx === 0) {
        dx = 1;
        dy = 0;
      }
    };

    // prevent default arrow keys behavior (scrolling) inside game area
    const preventArrowScroll = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keydown", preventArrowScroll);
    animationId = requestAnimationFrame(update);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keydown", preventArrowScroll);
      cancelAnimationFrame(animationId);
    };
  }, []);

  // Modulate warning chip flicker speed
  useEffect(() => {
    const interval = setInterval(() => {
      setFlickerSpeed(Math.random() * 0.4 + 0.1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleReboot = () => {
    setRebooting(true);
    setTimeout(() => {
      setRebooting(false);
      setScore(0);
    }, 2000);
  };

  return (
    <div className="bg-[#0A0A0A] text-[#e5e2e1] font-body-mono selection:bg-primary-container selection:text-on-primary-container min-h-screen flex flex-col overflow-hidden">
      
      {/* TopNavBar */}
      <header className="fixed top-0 w-full z-50 bg-[#131313]/80 backdrop-blur-md border-b border-[#3b4b37] shadow-[0_0_8px_rgba(0,230,57,0.15)] flex justify-between items-center px-6 h-14">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-display-tech text-[20px] tracking-tighter text-[#00e639]">
            HYPERVISOR_PULSATER_v2.0.4
          </Link>
        </div>
        <div className="hidden md:flex items-center gap-6">
          <nav className="flex gap-4 text-xs">
            <Link className="text-[#b9ccb2] font-medium font-body-mono hover:text-[#00e639] transition-colors" href="/live-cdc">
              DIAGNOSTICS
            </Link>
            <Link className="text-[#b9ccb2] font-medium font-body-mono hover:text-[#00e639] transition-colors" href="/routing">
              NODE_MAP
            </Link>
            <span className="text-[#00e639] font-bold border-b-2 border-[#00e639] cursor-default font-body-mono">
              EXCEPTION_GATE
            </span>
          </nav>
          <div className="flex items-center gap-4 border-l border-[#3b4b37] pl-6">
            <div className="flex items-center gap-2 px-3 py-1 bg-[#2a2a2a] border border-[#3b4b37]">
              <span className="material-symbols-outlined text-sm text-[#00e639]">person</span>
              <span className="font-label-code text-[10px] text-[#b9ccb2]">OPERATOR_01</span>
            </div>
            <div className="flex items-center gap-4 text-[#00e639] text-xs">
              <Link href="/error-terminal" className="material-symbols-outlined hover:bg-[#353534]/50 p-1 cursor-pointer active:scale-95 duration-100">terminal</Link>
              <Link href="/settings" className="material-symbols-outlined hover:bg-[#353534]/50 p-1 cursor-pointer active:scale-95 duration-100">settings_input_component</Link>
              <span className="material-symbols-outlined hover:bg-[#353534]/50 p-1 cursor-pointer active:scale-95 duration-100"><span className="material-symbols-outlined">notifications_active</span></span>
            </div>
          </div>
        </div>
      </header>

      {/* Background Scanlines */}
      <div className="fixed inset-0 scanline z-10 opacity-30"></div>

      {/* Main Content Canvas */}
      <main className="flex-grow flex items-center justify-center p-6 z-20 relative pt-20 pb-12">
        {/* Terminal Container */}
        <div className="w-full max-w-4xl bg-[#0e0e0e]/95 backdrop-blur-xl border border-[#3b4b37] relative overflow-hidden flex flex-col rounded-sm">
          
          {/* Terminal Header */}
          <div className="bg-[#2a2a2a] px-4 py-2 flex justify-between items-center border-b border-[#3b4b37]">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#00e639] text-sm">error</span>
              <span className="font-label-code text-[10px] text-[#00e639]">EXCEPTION_LOG_VIEWER</span>
            </div>
            <div className="flex gap-2">
              <div className="w-3 h-3 border border-[#84967e] opacity-50"></div>
              <div className="w-3 h-3 border border-[#84967e] opacity-50"></div>
              <div className="w-3 h-3 border border-[#3b4b37] bg-[#93000a]"></div>
            </div>
          </div>

          {/* Terminal Content */}
          <div className="p-8 flex flex-col items-center text-center space-y-8">
            
            {/* Warning Chip */}
            <div 
              className="inline-flex items-center gap-3 px-4 py-1.5 bg-[#93000a]/20 border border-[#93000a] text-error font-label-code text-[10px] uppercase tracking-widest flicker"
              style={{ animationDuration: `${flickerSpeed}s` }}
            >
              <span className="w-2 h-2 bg-error rounded-full animate-pulse"></span>
              CRITICAL_INGESTION_FAILURE // SYSTEM HALTED
            </div>

            {/* Snake Game Area */}
            <div className="relative w-full max-w-[640px] border border-[#3b4b37] bg-[#1c1b1b]/30 group overflow-hidden rounded-sm">
              {/* Brackets Decoration */}
              <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#00e639] z-30"></div>
              <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#00e639] z-30"></div>
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#00e639] z-30"></div>
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#00e639] z-30"></div>

              {rebooting ? (
                <div className="w-[640px] h-[400px] bg-black max-w-full flex flex-col items-center justify-center text-[#00ff41] z-40 relative">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00ff41] mb-4"></div>
                  <span className="font-label-code text-xs uppercase tracking-widest">REBOOTING REPLICATION DAEMON...</span>
                </div>
              ) : (
                <canvas 
                  ref={canvasRef} 
                  width="640" 
                  height="400" 
                  className="w-full max-w-full aspect-[8/5] bg-black/50 block" 
                />
              )}

              {/* Score Overlay */}
              <div className="absolute top-4 right-6 bg-black/85 px-4 py-2 border border-[#3b4b37] backdrop-blur-sm z-30">
                <span className="font-label-code text-[10px] text-[#b9ccb2] opacity-70">METRIC: </span>
                <span className="font-label-code text-[18px] text-[#00e639] font-bold" id="score-counter">
                  PACKETS_DRAINED: {score}
                </span>
              </div>

              {/* Input Hint Overlay */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4 pointer-events-none opacity-20 group-hover:opacity-40 transition-opacity z-30">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-8 h-8 border border-[#3b4b37] flex items-center justify-center text-xs text-[#b9ccb2]">W</div>
                  <div className="flex gap-1">
                    <div className="w-8 h-8 border border-[#3b4b37] flex items-center justify-center text-xs text-[#b9ccb2]">A</div>
                    <div className="w-8 h-8 border border-[#3b4b37] flex items-center justify-center text-xs text-[#b9ccb2]">S</div>
                    <div className="w-8 h-8 border border-[#3b4b37] flex items-center justify-center text-xs text-[#b9ccb2]">D</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Footer */}
            <div className="w-full space-y-6">
              <p className="font-body-mono-sm text-[12px] text-[#b9ccb2] max-w-lg mx-auto italic">
                Current go-routine pool is exhausted. Automated recovery agents are offline. 
                Engaging manual packet scavenging to maintain core temperature.
              </p>
              <button 
                onClick={handleReboot}
                className="bg-[#00ff41]/10 border border-[#00ff41] text-[#00ff41] font-label-code text-[14px] px-12 py-4 uppercase tracking-tighter hover:bg-[#00ff41]/20 active:scale-95 transition-all shadow-[0_0_20px_rgba(0,255,65,0.2)] glitch-text font-bold"
              >
                FORCE REBOOT REPLICATION ENGINE
              </button>
            </div>

          </div>
        </div>
      </main>

      {/* Footer Status Bar */}
      <footer className="fixed bottom-0 w-full h-8 z-50 bg-[#2a2a2a] border-t border-[#00e639]/30 flex justify-between items-center px-6 text-[10px]">
        <div className="font-label-code text-[#00e639] flex items-center gap-4">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-error rounded-full"></span> [SYSTEM_STATUS: ERROR]</span>
          <span className="opacity-60">[THREAD_COUNT: 0000]</span>
          <span className="opacity-60">[UPTIME: 00.000%]</span>
        </div>
        <div className="flex gap-4">
          <a className="font-body-mono-sm text-[#b9ccb2]/60 hover:text-[#74f5ff] transition-colors" href="#">DOCS</a>
          <a className="font-body-mono-sm text-[#b9ccb2]/60 hover:text-[#74f5ff] transition-colors" href="#">API_REF</a>
          <a className="font-body-mono-sm text-[#b9ccb2]/60 hover:text-[#74f5ff] transition-colors" href="#">SYS_LOGS</a>
        </div>
      </footer>
    </div>
  );
}
