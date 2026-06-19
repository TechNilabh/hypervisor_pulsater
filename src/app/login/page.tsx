"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";

export default function Login() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"auth" | "register">("auth");
  const [showPassword, setShowPassword] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Go Backend Auth States
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Mouse tilt effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!mainRef.current) return;
      const moveX = (e.clientX / window.innerWidth - 0.5) * 4;
      const moveY = (e.clientY / window.innerHeight - 0.5) * 4;
      mainRef.current.style.transform = `perspective(1000px) rotateY(${moveX}deg) rotateX(${-moveY}deg)`;
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // 3D wireframe rotating globe canvas with hardened projection logic
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let angle = 0;

    const points: { x: number; y: number; z: number }[] = [];
    const numLat = 12;
    const numLng = 16;
    const radius = 120;

    for (let i = 0; i <= numLat; i++) {
      const lat = (Math.PI * i) / numLat - Math.PI / 2;
      const cosLat = Math.cos(lat);
      const sinLat = Math.sin(lat);

      for (let j = 0; j < numLng; j++) {
        const lng = (2 * Math.PI * j) / numLng;
        const cosLng = Math.cos(lng);
        const sinLng = Math.sin(lng);

        points.push({
          x: radius * cosLat * cosLng,
          y: radius * sinLat,
          z: radius * cosLat * sinLng,
        });
      }
    }

    const particles: { x: number; y: number; z: number; speed: number }[] = [];
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: (Math.random() - 0.5) * 350,
        y: (Math.random() - 0.5) * 350,
        z: (Math.random() - 0.5) * 350,
        speed: 0.2 + Math.random() * 0.5,
      });
    }

    const resizeCanvas = () => {
      canvas.width = canvas.parentElement?.clientWidth || 400;
      canvas.height = canvas.parentElement?.clientHeight || 500;
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const fov = 350;

      angle += 0.006;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const pulse = 1 + Math.sin(angle * 2) * 0.03;

      const projected = points.map((p) => {
        const x1 = p.x * cosA - p.z * sinA;
        const z1 = p.x * sinA + p.z * cosA;
        const y1 = p.y * pulse;
        
        // Safety guard for denominator clipping paths
        const denominator = fov + z1;
        const scale = fov / (denominator <= 0 ? 0.1 : denominator);
        
        return {
          sx: cx + x1 * scale,
          sy: cy + y1 * scale,
          depth: z1,
          visible: z1 > -radius,
        };
      });

      ctx.strokeStyle = "rgba(0, 255, 65, 0.15)";
      ctx.lineWidth = 1.2;
      for (let i = 0; i <= numLat; i++) {
        ctx.beginPath();
        for (let j = 0; j < numLng; j++) {
          const idx = i * numLng + j;
          const p = projected[idx];
          if (j === 0) ctx.moveTo(p.sx, p.sy);
          else ctx.lineTo(p.sx, p.sy);
        }
        ctx.closePath();
        ctx.stroke();
      }

      for (let j = 0; j < numLng; j++) {
        ctx.beginPath();
        for (let i = 0; i <= numLat; i++) {
          const idx = i * numLng + j;
          const p = projected[idx];
          if (i === 0) ctx.moveTo(p.sx, p.sy);
          else ctx.lineTo(p.sx, p.sy);
        }
        ctx.stroke();
      }

      particles.forEach((p) => {
        p.z -= p.speed;
        if (p.z < -fov) p.z = fov;
        const x1 = p.x * cosA - p.z * sinA;
        const z1 = p.x * sinA + p.z * cosA;
        
        const zDenominator = fov + z1;
        const scale = fov / (zDenominator <= 0 ? 0.1 : zDenominator);
        
        const sx = cx + x1 * scale;
        const sy = cy + p.y * scale;
        
        if (sx > 0 && sx < canvas.width && sy > 0 && sy < canvas.height) {
          const alpha = Math.max(0.1, 1 - (z1 + fov) / (2 * fov));
          ctx.fillStyle = `rgba(0, 242, 255, ${alpha * 0.7})`;
          ctx.beginPath();
          
          // HARDENED PERSPECTIVE MATRIX FIX: Ensure radius calculation cannot go negative
          const calculatedRadius = 1.5 * scale;
          const safeRadius = Math.max(0.1, calculatedRadius);
          
          ctx.arc(sx, sy, safeRadius, 0, 2 * Math.PI);
          ctx.fill();
        }
      });

      animationId = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, []);

  const redirectToMFA = (email: string) => {
    sessionStorage.setItem("mfa_pending_email", email);
    router.push("/verify-otp");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (activeTab === "auth") {
        const res = await fetch(`${BACKEND_URL}/api/v1/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: loginIdentifier,
            password: loginPassword,
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Authentication failed");
        }

        if (data.mfa_required) {
          redirectToMFA(data.email);
          return;
        }

        if (data.token || data.session_token) {
          const token = data.token || data.session_token;
          localStorage.setItem("session_token", token);
          localStorage.setItem("user_id", data.user_id);
          localStorage.setItem("username", data.username);
          localStorage.setItem(
            "selected_operator_id",
            `${data.avatar_id} // ${data.username}`
          );
          window.dispatchEvent(new Event("operatorChanged"));
          router.push("/identity");
        }
      } else {
        if (regPassword !== regConfirmPassword) {
          throw new Error("Passwords do not match");
        }
        const res = await fetch(`${BACKEND_URL}/api/v1/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: regUsername,
            email: regEmail,
            password: regPassword,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Registration failed");
        }
        setSuccessMsg("Registration successful! Please authenticate below.");
        setActiveTab("auth");
        setLoginIdentifier(regUsername);
        setLoginPassword("");
        setRegUsername("");
        setRegEmail("");
        setRegPassword("");
        setRegConfirmPassword("");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  // ─── OAuth Click Handler (Fixed URL Serialization Vector) ──────────────────
  const handleOAuthClick = (provider: string) => {
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    // CRITICAL CORRECTION: Use BACKEND_URL variable to clear path routing errors
    window.location.href = `${BACKEND_URL}/api/v1/auth/oauth/${provider}`;
  };

  return (
    <div className="font-body-mono bg-[#050505] text-[#e5e2e1] min-h-screen flex items-center justify-center p-4">
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(#00f1fe 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div
        ref={mainRef}
        className="w-full max-w-[1200px] min-h-[700px] grid grid-cols-1 md:grid-cols-2 bg-[#0e0e0e] overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.9)] relative border border-[#3b4b37] rounded-lg mt-12 transition-transform duration-300 ease-out"
        id="main-interface"
      >
        <section className="relative hidden md:flex flex-col items-center justify-center overflow-hidden bg-black scanlines">
          <div className="absolute inset-0 z-0 w-full h-full">
            <canvas ref={canvasRef} className="w-full h-full block" />
          </div>
          <div className="relative z-20 p-6 flex flex-col items-center pointer-events-none w-full h-full justify-center">
            <div className="relative w-[360px] lg:w-[450px] h-[450px] lg:h-[550px] flex items-center justify-center">
              <div className="tactical-bracket-tl" />
              <div className="tactical-bracket-br" />
            </div>
            <div className="mt-4 flex flex-col items-center">
              <span className="font-label-code text-[10px] text-[#74f5ff] opacity-60 uppercase tracking-[0.2em]">
                [ SYSTEM_STATUS: MONITORING ]
              </span>
              <div className="flex gap-1 mt-2">
                <div className="w-1 h-4 bg-[#74f5ff]" />
                <div className="w-1 h-4 bg-[#74f5ff]/60" />
                <div className="w-1 h-4 bg-[#74f5ff]/40" />
                <div className="w-1 h-4 bg-[#74f5ff]/20 animate-pulse" />
              </div>
            </div>
          </div>
          <div className="absolute top-6 left-6 font-label-code text-[10px] text-[#00e639] flex flex-col gap-1 z-20">
            <span>COORD_X: 42.088</span>
            <span>COORD_Y: 19.992</span>
            <span className="text-error">LATENCY: 12ms</span>
          </div>
          <div className="absolute bottom-6 right-6 font-label-code text-[10px] text-[#00dbe7] z-20">
            <span>NODE: //PULSATER_01</span>
          </div>
        </section>

        <section className="p-8 md:p-16 flex flex-col justify-center bg-[#131313] relative glass-card border-l border-[#3b4b37]/30">
          <div className="mb-12">
            <h1 className="font-display-tech text-[32px] text-[#74f5ff] tracking-tighter mb-2">
              HYPERVISOR PULSATER
            </h1>
            <p className="font-body-mono text-[14px] text-[#b9ccb2] flex items-center gap-2">
              <span className="material-symbols-outlined text-[14px]">terminal</span>
              ESTABLISHING ASYNCHRONOUS_CDC_ENGINE...
            </p>
          </div>

          <div className="flex border-b border-[#3b4b37] mb-10 w-full" id="auth-tabs">
            <button
              onClick={() => setActiveTab("auth")}
              className={`flex-1 py-4 font-label-code text-[10px] tracking-widest text-center transition-all ${
                activeTab === "auth"
                  ? "text-[#00f1fe] border-b-2 border-[#00f1fe] font-bold"
                  : "text-[#b9ccb2] hover:text-[#00f1fe]"
              }`}
            >
              AUTHENTICATE NODE ACCESS
            </button>
            <button
              onClick={() => setActiveTab("register")}
              className={`flex-1 py-4 font-label-code text-[10px] tracking-widest text-center transition-all ${
                activeTab === "register"
                  ? "text-[#00f1fe] border-b-2 border-[#00f1fe] font-bold"
                  : "text-[#b9ccb2] hover:text-[#00f1fe]"
              }`}
            >
              REGISTER NODE ACCESS
            </button>
          </div>

          <div className="space-y-4">
            {error && (
              <div className="p-3 bg-red-950/40 border border-red-500/50 text-red-400 font-label-code text-[11px] uppercase tracking-wider flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">warning</span>
                {error}
              </div>
            )}
            {successMsg && (
              <div className="p-3 bg-[#002203]/80 border border-[#00ff41]/50 text-[#00ff41] font-label-code text-[11px] uppercase tracking-wider flex items-center gap-2 animate-pulse">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                {successMsg}
              </div>
            )}

            {activeTab === "auth" && (
              <form onSubmit={handleSubmit} className="space-y-6" id="form-auth">
                <div className="space-y-2">
                  <label className="font-label-code text-[10px] text-[#00dbe7] block">
                    [ EMAIL / USERNAME ]
                  </label>
                  <div className="relative group">
                    <input
                      required
                      className="w-full bg-[#1c1b1b] border-b-2 border-[#3b4b37] focus:border-[#00f1fe] text-white font-body-mono p-3 transition-all placeholder:opacity-20 border-t-0 border-l-0 border-r-0 focus:ring-0 focus:outline-none"
                      placeholder="UID@PULSATER.NET"
                      type="text"
                      value={loginIdentifier}
                      onChange={(e) => setLoginIdentifier(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="font-label-code text-[10px] text-[#00dbe7] block">
                    [ ACCESS_TOKEN_PASSWORD ]
                  </label>
                  <div className="relative">
                    <input
                      required
                      className="w-full bg-[#1c1b1b] border-b-2 border-[#3b4b37] focus:border-[#00f1fe] text-white font-body-mono p-3 transition-all placeholder:opacity-20 border-t-0 border-l-0 border-r-0 focus:ring-0 focus:outline-none pr-10"
                      placeholder="••••••••"
                      type={showPassword ? "text" : "password"}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                    />
                    <span
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[#b9ccb2] cursor-pointer hover:text-[#00f1fe]"
                    >
                      {showPassword ? "visibility_off" : "visibility"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between font-body-mono-sm text-[12px]">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      className="rounded-none bg-[#131313] border-[#84967e] text-[#00f1fe] focus:ring-0"
                      type="checkbox"
                    />
                    <span className="text-[#b9ccb2] group-hover:text-white transition-colors">
                      PERSIST_SESSION
                    </span>
                  </label>
                  <a className="text-[#00dbe7] hover:underline decoration-[#00dbe7]/30" href="#">
                    RECOVER_CREDENTIALS
                  </a>
                </div>

                <div className="flex items-start gap-2 bg-[#00f0ff]/5 border border-[#00f0ff]/20 px-3 py-2">
                  <span className="material-symbols-outlined text-[#00f0ff] text-xs mt-0.5">info</span>
                  <p className="font-label-code text-[9px] text-[#4a9ead] leading-relaxed">
                    MFA ENABLED — A one-time token will be dispatched to your registered
                    email address after credential validation.
                  </p>
                </div>

                <button
                  disabled={loading}
                  className="w-full bg-[#00f1fe]/10 border border-[#00f1fe] text-[#00f1fe] py-4 font-label-code text-[14px] tracking-widest hover:bg-[#00f1fe]/20 active:scale-[0.98] hover:shadow-[0_0_20px_rgba(0,241,254,0.4)] transition-all glitch-hover mt-4 flex items-center justify-center gap-4 group disabled:opacity-50 disabled:cursor-not-allowed"
                  type="submit"
                >
                  {loading ? "AUTHENTICATING..." : "AUTHENTICATE NODE ACCESS"}
                  <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">
                    login
                  </span>
                </button>
              </form>
            )}

            {activeTab === "register" && (
              <form onSubmit={handleSubmit} className="space-y-6" id="form-register">
                <div className="space-y-2">
                  <label className="font-label-code text-[10px] text-[#00dbe7] block">
                    [ NODE_IDENTIFIER ]
                  </label>
                  <input
                    required
                    className="w-full bg-[#1c1b1b] border-b-2 border-[#3b4b37] focus:border-[#00f1fe] text-white font-body-mono p-3 transition-all placeholder:opacity-20 border-t-0 border-l-0 border-r-0 focus:ring-0 focus:outline-none"
                    placeholder="GHOST_IN_THE_SHELL"
                    type="text"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="font-label-code text-[10px] text-[#00dbe7] block">
                    [ EMAIL_PROTOCOL ]
                  </label>
                  <input
                    required
                    className="w-full bg-[#1c1b1b] border-b-2 border-[#3b4b37] focus:border-[#00f1fe] text-white font-body-mono p-3 transition-all placeholder:opacity-20 border-t-0 border-l-0 border-r-0 focus:ring-0 focus:outline-none"
                    placeholder="USER@PULSATER.NET"
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="font-label-code text-[10px] text-[#00dbe7] block">
                      [ NEW_TOKEN ]
                    </label>
                    <input
                      required
                      className="w-full bg-[#1c1b1b] border-b-2 border-[#3b4b37] focus:border-[#00f1fe] text-white font-body-mono p-3 transition-all placeholder:opacity-20 border-t-0 border-l-0 border-r-0 focus:ring-0 focus:outline-none"
                      placeholder="••••••••"
                      type="password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="font-label-code text-[10px] text-[#00dbe7] block">
                      [ CONFIRM_TOKEN ]
                    </label>
                    <input
                      required
                      className="w-full bg-[#1c1b1b] border-b-2 border-[#3b4b37] focus:border-[#00f1fe] text-white font-body-mono p-3 transition-all placeholder:opacity-20 border-t-0 border-l-0 border-r-0 focus:ring-0 focus:outline-none"
                      placeholder="••••••••"
                      type="password"
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  disabled={loading}
                  className="w-full border border-[#74f5ff] text-[#74f5ff] py-4 font-label-code text-[14px] tracking-widest hover:bg-[#74f5ff]/10 active:scale-[0.98] transition-all glitch-hover mt-4 flex items-center justify-center gap-4 group disabled:opacity-50 disabled:cursor-not-allowed"
                  type="submit"
                >
                  {loading ? "REGISTERING..." : "REGISTER NODE ACCESS"}
                  <span className="material-symbols-outlined group-hover:rotate-12 transition-transform">
                    key
                  </span>
                </button>
              </form>
            )}
          </div>

          <div className="mt-12 flex flex-col items-center">
            <div className="flex items-center gap-4 w-full mb-8">
              <div className="h-[1px] bg-[#3b4b37] flex-1" />
              <span className="font-label-code text-[10px] text-[#b9ccb2]">
                EXTERNAL_GATEWAYS
              </span>
              <div className="h-[1px] bg-[#3b4b37] flex-1" />
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => handleOAuthClick("google")}
                className="w-12 h-12 flex items-center justify-center border border-[#3b4b37] text-[#b9ccb2] hover:text-[#00f1fe] hover:border-[#00f1fe] hover:bg-[#00f1fe]/5 cursor-pointer transition-all hover:shadow-[0_0_15px_rgba(0,241,254,0.4)]"
                title="Google Developer API Link"
              >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.908 3.152-1.896 4.136-1.248 1.248-3.224 2.536-6.424 2.536-5.176 0-9.272-4.2-9.272-9.36s4.096-9.36 9.272-9.36c2.8 0 4.912 1.112 6.392 2.512l2.312-2.312c-2.088-1.992-4.856-3.488-8.704-3.488-6.616 0-12.04 5.424-12.04 12.04s5.424 12.04 12.04 12.04c3.56 0 6.256-1.176 8.368-3.368 2.16-2.16 2.84-5.216 2.84-7.664 0-.712-.064-1.408-.192-2.04h-11.016z" />
                </svg>
              </button>
              <button
                onClick={() => handleOAuthClick("facebook")}
                className="w-12 h-12 flex items-center justify-center border border-[#3b4b37] text-[#b9ccb2] hover:text-[#00f1fe] hover:border-[#00f1fe] hover:bg-[#00f1fe]/5 cursor-pointer transition-all hover:shadow-[0_0_15px_rgba(0,241,254,0.4)]"
                title="Facebook Graph API Link"
              >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M22.675 0h-21.35c-.732 0-1.325.593-1.325 1.325v21.351c0 .731.593 1.324 1.325 1.324h11.495v-9.294h-3.128v-3.622h3.128v-2.671c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12v9.293h6.116c.73 0 1.323-.593 1.323-1.325v-21.35c0-.732-.593-1.325-1.325-1.325z" />
                </svg>
              </button>
              <button
                onClick={() => handleOAuthClick("github")}
                className="w-12 h-12 flex items-center justify-center border border-[#3b4b37] text-[#b9ccb2] hover:text-[#00f1fe] hover:border-[#00f1fe] hover:bg-[#00f1fe]/5 cursor-pointer transition-all hover:shadow-[0_0_15px_rgba(0,241,254,0.4)]"
                title="GitHub Developer OAuth"
              >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482C19.138 20.197 22 16.44 22 12.017 22 6.484 17.522 2 12 2z"
                  />
                </svg>
              </button>
            </div>
            <Link
              className="mt-12 font-label-code text-[10px] text-[#b9ccb2] hover:text-[#00f1fe] flex items-center gap-2 transition-colors group"
              href="/"
            >
              <span className="material-symbols-outlined text-[12px] group-hover:-translate-x-1 transition-transform">
                arrow_back
              </span>
              BACK TO GATEWAY
            </Link>
          </div>

          <div className="absolute bottom-4 left-6 flex items-center gap-2 opacity-30">
            <div className="w-1.5 h-1.5 rounded-full bg-[#00dbe7] animate-ping" />
            <span className="font-label-code text-[8px] uppercase tracking-widest">
              Secure Handshake: v.4.0.12_BUILD // MFA_ENABLED
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}