"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";

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
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/resend-otp`, {
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
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/verify-mfa`, {
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
    <div
      className="font-body-mono text-[#e5e2e1] min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ backgroundColor: "#0d0f12" }}
    >
      {/* Dot-grid texture */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(rgba(0,240,255,0.12) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          opacity: 0.18,
        }}
      />

      {/* Central radial glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 50% 50%, rgba(0,240,255,0.05) 0%, transparent 70%)",
        }}
      />

      {/* ── Main card ──────────────────────────────────────────────────────── */}
      <div className="w-full max-w-[420px] relative z-10">
        {/* Corner brackets */}
        <div className="absolute -top-2 -left-2 w-5 h-5 border-t border-l border-[#00f0ff] opacity-50" />
        <div className="absolute -top-2 -right-2 w-5 h-5 border-t border-r border-[#00f0ff] opacity-50" />
        <div className="absolute -bottom-2 -left-2 w-5 h-5 border-b border-l border-[#00f0ff] opacity-50" />
        <div className="absolute -bottom-2 -right-2 w-5 h-5 border-b border-r border-[#00f0ff] opacity-50" />

        <div
          className="border border-[#00f0ff]/25 shadow-[0_0_48px_rgba(0,240,255,0.06)]"
          style={{ backgroundColor: "#0d0f12" }}
        >
          {/* ── Header bar ──────────────────────────────────────────────── */}
          <div
            className="border-b border-[#00f0ff]/20 px-5 py-3 flex items-center justify-between"
            style={{ backgroundColor: "#0a0c0f" }}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex gap-[3px] items-center">
                <div className="w-1 h-1 rounded-full bg-[#00f0ff] animate-ping" />
                <div className="w-1 h-1 rounded-full bg-[#00f0ff] opacity-50" />
              </div>
              <span className="font-label-code text-[9px] text-[#00f0ff] uppercase tracking-[0.28em]">
                IDENTITY_VERIFICATION_PROTOCOL // SECURE_NODE_ACCESS
              </span>
            </div>
            <span className="font-label-code text-[8px] text-[#2d3748] tracking-widest">
              v2.0
            </span>
          </div>

          <div className="px-7 py-8 flex flex-col gap-6">
            {/* ── Instruction block ──────────────────────────────────────── */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span
                  className="material-symbols-outlined text-[#00f0ff] text-base"
                  style={{ filter: "drop-shadow(0 0 8px rgba(0,240,255,0.45))" }}
                >
                  shield_lock
                </span>
                <span className="font-label-code text-[10px] text-[#00f0ff] uppercase tracking-[0.2em]">
                  MFA TOKEN REQUIRED
                </span>
              </div>
              <p className="font-body-mono text-[10px] text-[#4a5568] leading-relaxed pl-[26px]">
                A 6-digit token was dispatched to your registered operator address.
                Enter it below to complete access.
              </p>
            </div>

            {/* ── Error / Expired banners ──────────────────────────────── */}
            {error && (
              <div
                className="border border-red-500/30 px-4 py-2.5 flex items-center gap-2"
                style={{ backgroundColor: "rgba(127,29,29,0.25)" }}
              >
                <span className="material-symbols-outlined text-xs text-red-400">
                  warning
                </span>
                <span className="font-label-code text-[9px] text-red-400 uppercase tracking-wider">
                  {error}
                </span>
              </div>
            )}

            {expired && (
              <div
                className="border border-amber-500/30 px-4 py-2.5 text-center"
                style={{ backgroundColor: "rgba(120,53,15,0.25)" }}
              >
                <span className="font-label-code text-[9px] text-amber-400 uppercase tracking-wider">
                  TOKEN EXPIRED — Return to login and authenticate again.
                </span>
              </div>
            )}

            {/* ── OTP form ─────────────────────────────────────────────── */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {/* Token label */}
              <div className="flex flex-col gap-2.5">
                <span className="font-label-code text-[8px] text-[#00f0ff]/70 uppercase tracking-[0.25em]">
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
                      className="w-11 h-[52px] text-center text-xl font-bold font-display-tech transition-all duration-150 focus:outline-none disabled:opacity-35 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: "#090b0e",
                        border: digit
                          ? "1px solid #00f0ff"
                          : "1px solid rgba(0,240,255,0.2)",
                        color: digit ? "#00f0ff" : "#e2e8f0",
                        boxShadow: digit
                          ? "0 0 10px rgba(0,240,255,0.25), inset 0 0 6px rgba(0,240,255,0.05)"
                          : "none",
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Countdown */}
              <div className="flex items-center justify-center gap-1.5">
                <span className="material-symbols-outlined text-xs text-[#2d3748]">
                  timer
                </span>
                <span
                  className={`font-label-code text-[10px] tracking-widest transition-colors ${
                    countdown < 60
                      ? "text-red-400 animate-pulse"
                      : "text-[#2d3748]"
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
                className="w-full py-3.5 font-label-code text-[11px] tracking-[0.25em] uppercase transition-all flex items-center justify-center gap-2.5 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
                style={{
                  backgroundColor:
                    loading || expired || digits.join("").length < 6
                      ? "rgba(0,240,255,0.04)"
                      : "rgba(0,240,255,0.08)",
                  border: "1px solid rgba(0,240,255,0.6)",
                  color: "#00f0ff",
                }}
                onMouseEnter={(e) => {
                  if (!loading && !expired && digits.join("").length === 6) {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                      "rgba(0,240,255,0.14)";
                    (e.currentTarget as HTMLButtonElement).style.boxShadow =
                      "0 0 18px rgba(0,240,255,0.22)";
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    "rgba(0,240,255,0.08)";
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
                }}
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
                className="font-label-code text-[9px] text-[#b9ccb2] hover:text-[#00f0ff] disabled:opacity-35 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5 cursor-pointer bg-transparent border-none p-0"
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
                className="font-label-code text-[9px] text-[#2d3748] hover:text-[#00f0ff] transition-colors flex items-center justify-center gap-1.5 cursor-pointer bg-transparent border-none p-0"
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
        <div className="mt-3 flex items-center justify-center gap-2 opacity-20">
          <div className="h-[1px] flex-1" style={{ backgroundColor: "#00f0ff" }} />
          <span className="font-label-code text-[7px] uppercase tracking-[0.35em] text-[#00f0ff]">
            PULSATER_SECURE_HANDSHAKE
          </span>
          <div className="h-[1px] flex-1" style={{ backgroundColor: "#00f0ff" }} />
        </div>
      </div>
    </div>
  );
}
