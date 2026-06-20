"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";

export default function VerifyOTPPage() {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(300);
  const [expired, setExpired] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ─── Read pending email from sessionStorage; redirect to login if missing ─
  useEffect(() => {
    const pendingEmail = sessionStorage.getItem("mfa_pending_email");
    if (!pendingEmail) {
      router.replace("/login");
      return;
    }
    setEmail(pendingEmail);
  }, [router]);

  // ─── 5-minute countdown ────────────────────────────────────────────────────
  useEffect(() => {
    if (expired) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setExpired(true);
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [expired]);

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // ─── 30-second resend cooldown ticker ──────────────────────────────────────
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // ─── Segmented input handlers ──────────────────────────────────────────────
  const handleDigitChange = useCallback((index: number, value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = cleaned;
      return next;
    });
    if (cleaned && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace") {
        if (digits[index] === "" && index > 0) {
          setDigits((prev) => {
            const next = [...prev];
            next[index - 1] = "";
            return next;
          });
          inputRefs.current[index - 1]?.focus();
        } else {
          setDigits((prev) => {
            const next = [...prev];
            next[index] = "";
            return next;
          });
        }
      } else if (e.key === "ArrowLeft" && index > 0) {
        inputRefs.current[index - 1]?.focus();
      } else if (e.key === "ArrowRight" && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [digits]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
      if (!pasted) return;
      const next = [...digits];
      for (let i = 0; i < pasted.length; i++) {
        next[i] = pasted[i];
      }
      setDigits(next);
      const focusIndex = Math.min(pasted.length, 5);
      inputRefs.current[focusIndex]?.focus();
    },
    [digits]
  );

  // ─── Resend verification token handler ─────────────────────────────────────
  const handleResendOTP = async () => {
    if (resendCooldown > 0 || loading || expired) return;
    setResendStatus("sending");
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/resend-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to resend token");
      }
      setResendStatus("success");
      setCountdown(300); // Reset main 5-minute countdown
      setExpired(false);
      setResendCooldown(30); // 30-second cooldown
      setDigits(["", "", "", "", "", ""]); // Reset inputs
      if ((window as any).toast) {
        (window as any).toast.success("Verification Token Resent", {
          email,
          status: "DISPATCHED",
        });
      }
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err: any) {
      setResendStatus("error");
      setError(err.message || "RESEND_FAILED — failed to request new token");
    }
  };

  // ─── Form submission ───────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || expired) return;

    const otp = digits.join("");
    if (otp.length < 6) {
      setError("INCOMPLETE_TOKEN — enter all 6 digits to proceed.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/verify-mfa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "MFA verification failed");
      }

      // Commit session state
      localStorage.setItem("session_token", data.session_token);
      localStorage.setItem("user_id", data.user_id);
      localStorage.setItem("username", data.username);
      localStorage.setItem(
        "selected_operator_id",
        `${data.avatar_id} // ${data.username}`
      );
      sessionStorage.removeItem("mfa_pending_email");
      window.dispatchEvent(new Event("operatorChanged"));

      if ((window as any).toast) {
        (window as any).toast.success("MFA Verification Successful", {
          operator: data.username,
          status: "AUTHENTICATED",
        });
      }

      router.push("/identity");
    } catch (err: any) {
      setError(err.message || "AUTH_FAULT — unexpected verification error");
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="font-body-mono text-[#b9ccb2] min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#050505]">
      {/* Dot-grid texture */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(#00f1fe 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Central radial glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 50% 50%, rgba(0,241,254,0.04) 0%, transparent 70%)",
        }}
      />

      {/* ── Main card ──────────────────────────────────────────────────────── */}
      <div className="w-full max-w-[440px] relative z-10">
        {/* Corner brackets */}
        <div className="absolute -top-2 -left-2 w-5 h-5 border-t border-l border-[#00f1fe]/40" />
        <div className="absolute -top-2 -right-2 w-5 h-5 border-t border-r border-[#00f1fe]/40" />
        <div className="absolute -bottom-2 -left-2 w-5 h-5 border-b border-l border-[#00f1fe]/40" />
        <div className="absolute -bottom-2 -right-2 w-5 h-5 border-b border-r border-[#00f1fe]/40" />

        <div className="glass-card border border-[#3b4b37]/30 bg-[#131313] shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden">
          {/* Scanning line animation */}
          <div className="absolute inset-x-0 z-10 scanning-line pointer-events-none" />

          {/* ── Header bar ──────────────────────────────────────────────── */}
          <div className="border-b border-[#3b4b37]/30 px-5 py-4 flex items-center justify-between bg-[#0e0e0e]/90">
            <div className="flex items-center gap-2.5">
              <div className="flex gap-[3px] items-center">
                <div className="w-1 h-1 rounded-full bg-[#00f1fe] animate-ping" />
                <div className="w-1 h-1 rounded-full bg-[#00f1fe]/60" />
              </div>
              <span className="font-label-code text-[10px] text-[#00dbe7] uppercase tracking-widest">
                [ IDENTITY_VERIFICATION_PROTOCOL // SECURE_NODE_ACCESS ]
              </span>
            </div>
            <span className="font-label-code text-[8px] text-[#84967e] tracking-widest">
              v2.0
            </span>
          </div>

          <div className="px-7 py-8 flex flex-col gap-6 relative z-10">
            {/* ── Instruction block ──────────────────────────────────────── */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="material-symbols-outlined text-[#00f1fe] text-base"
                  style={{ filter: "drop-shadow(0 0 8px rgba(0,241,254,0.45))" }}
                >
                  shield_lock
                </span>
                <span className="font-label-code text-[10px] text-[#00dbe7] uppercase tracking-widest">
                  [ MFA_TOKEN_REQUIRED ]
                </span>
              </div>
              <p className="font-body-mono text-[11px] text-[#b9ccb2] leading-relaxed pl-[26px]">
                A 6-digit token was dispatched to your registered operator address.
                Enter it below to complete access.
              </p>
            </div>

            {/* ── Error / Expired banners ──────────────────────────────── */}
            {error && (
              <div className="border border-red-500/30 px-4 py-2.5 flex items-center gap-2 bg-red-950/20">
                <span className="material-symbols-outlined text-xs text-red-400">
                  warning
                </span>
                <span className="font-label-code text-[10px] text-red-400 uppercase tracking-widest">
                  [ {error} ]
                </span>
              </div>
            )}

            {expired && (
              <div className="border border-amber-500/30 px-4 py-2.5 text-center bg-amber-950/20">
                <span className="font-label-code text-[10px] text-amber-400 uppercase tracking-widest">
                  [ TOKEN EXPIRED — RE-AUTHENTICATE ]
                </span>
              </div>
            )}

            {/* ── OTP form ─────────────────────────────────────────────── */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              {/* Token label */}
              <div className="flex flex-col gap-3">
                <span className="font-label-code text-[10px] text-[#00dbe7] uppercase tracking-widest">
                  [ VERIFICATION_TOKEN ]
                </span>

                {/* Six segmented inputs */}
                <div className="flex gap-2 justify-center">
                  {digits.map((digit, i) => (
                    <input
                      key={i}
                      id={`otp-digit-${i}`}
                      ref={(el) => {
                        inputRefs.current[i] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      onPaste={i === 0 ? handlePaste : undefined}
                      disabled={loading || expired}
                      autoFocus={i === 0}
                      className="w-12 h-14 bg-[#1c1b1b] border-b-2 border-[#3b4b37] focus:border-[#00f1fe] text-center font-display-tech text-xl text-[#74f5ff] outline-none transition-all focus:ring-0 rounded-none disabled:opacity-35 disabled:cursor-not-allowed"
                    />
                  ))}
                </div>
              </div>

              {/* Countdown */}
              <div className="flex items-center justify-center gap-1.5">
                <span className="material-symbols-outlined text-xs text-[#84967e]">
                  timer
                </span>
                <span
                  className={`font-label-code text-[10px] tracking-widest transition-colors ${
                    countdown < 60
                      ? "text-red-400 animate-pulse font-bold"
                      : "text-[#84967e]"
                  }`}
                >
                  TOKEN_TTL: {formatCountdown(countdown)}
                </span>
              </div>

              {/* Submit */}
              <button
                type="submit"
                id="verify-otp-submit"
                disabled={loading || expired || digits.join("").length < 6}
                className="w-full bg-[#00f1fe]/10 border border-[#00f1fe] text-[#00f1fe] font-label-code py-4 hover:bg-[#00f1fe]/20 hover:shadow-[0_0_20px_rgba(0,241,254,0.4)] tracking-widest uppercase transition-all flex items-center justify-center gap-2.5 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined text-sm animate-spin">
                      progress_activity
                    </span>
                    AUTHENTICATING...
                  </>
                ) : (
                  <>
                    VERIFY NODE ACCESS
                    <span className="material-symbols-outlined text-sm">
                      arrow_forward
                    </span>
                  </>
                )}
              </button>

              {/* Resend button */}
              <button
                type="button"
                onClick={handleResendOTP}
                disabled={loading || expired || resendCooldown > 0}
                className="font-label-code text-[10px] text-[#b9ccb2] hover:text-[#00f1fe] disabled:opacity-35 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5 cursor-pointer bg-transparent border-none p-0 tracking-wider"
              >
                <span className="material-symbols-outlined text-xs">
                  {resendStatus === "sending" ? "sync" : "mail"}
                </span>
                {resendStatus === "sending"
                  ? "REQUESTING_NEW_TOKEN..."
                  : resendCooldown > 0
                  ? `RESEND_AVAILABLE_IN_${resendCooldown}S`
                  : "RESEND_VERIFICATION_TOKEN"}
              </button>

              {/* Back link */}
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem("mfa_pending_email");
                  router.push("/login");
                }}
                className="font-label-code text-[10px] text-[#84967e] hover:text-[#00f1fe] transition-colors flex items-center justify-center gap-1.5 cursor-pointer bg-transparent border-none p-0 tracking-wider"
              >
                <span className="material-symbols-outlined text-xs">
                  arrow_back
                </span>
                RETURN TO OPERATOR GATE
              </button>
            </form>
          </div>
        </div>

        {/* Footer signature */}
        <div className="mt-4 flex items-center justify-center gap-2 opacity-25">
          <div className="h-[1px] flex-1 bg-[#3b4b37]" />
          <span className="font-label-code text-[8px] uppercase tracking-[0.35em] text-[#00f1fe]">
            PULSATER_SECURE_HANDSHAKE
          </span>
          <div className="h-[1px] flex-1 bg-[#3b4b37]" />
        </div>
      </div>
    </div>
  );
}
