"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";

const REFRESH_SPEEDS = [500, 1000, 2000, 5000];

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

const initialPresets: AvatarSlot[] = [
  {
    id: "Node_01",
    name: "Tactical Mech",
    code: "PX-101",
    status: "STANDBY",
    img: "/presets/node1.png",
    active: false,
    locked: false,
    progress: 30,
  },
  {
    id: "Node_02",
    name: "AI Synth Core",
    code: "PX-808",
    status: "ACCESS DENIED",
    img: "/presets/node2.png",
    active: true,
    locked: false,
    progress: 100,
  },
  {
    id: "Node_03",
    name: "Cybernetic Operator Matrix",
    code: "PX-302",
    status: "INACTIVE",
    img: "/presets/node3.png",
    active: false,
    locked: false,
    progress: 0,
  },
  {
    id: "Node_04",
    name: "LOCKED_BY_ROOT",
    code: "ERR_LOCK",
    status: "RESTRICTED",
    img: "/presets/node1.png",
    active: false,
    locked: true,
    progress: 0,
  },
];

export default function IdentityAuth() {
  const router = useRouter();
  const [slots, setSlots] = useState<AvatarSlot[]>(initialPresets);
  const [activeSlot, setActiveSlot] = useState<AvatarSlot>(initialPresets[1]);
  const [overrideState, setOverrideState] = useState<"idle" | "running" | "success">("idle");
  const [pulseIndex, setPulseIndex] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [sessionMetadata, setSessionMetadata] = useState<{
    username: string;
    email: string;
  } | null>(null);

  // ─── OPERATOR_CONFIGURATION_MATRIX state ─────────────────────────────────
  const [callsign, setCallsign] = useState("");
  const [refreshSpeed, setRefreshSpeed] = useState<number>(1000);

  // ─── Bootstrap: query token, auth guard, hydration, config ───────────────
  useEffect(() => {
    // ─── Extract query token (?token=) if present ────────────────────────────
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const queryToken = params.get("token");
      if (queryToken) {
        localStorage.setItem("session_token", queryToken);
        // Wipe query parameters from the address bar to prevent session token leaks
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
      }
    }

    const token = localStorage.getItem("session_token");
    if (!token) {
      router.push("/login");
      return;
    }

    // Decode JWT payload to extract username & email for display
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        setSessionMetadata({
          username: payload.username || "Operator",
          email: payload.email || "unknown@pulsater.net",
        });
      }
    } catch (err) {
      console.error("Failed to decode session token:", err);
    }

    // Hydrate avatar selection from localStorage
    const storedId = localStorage.getItem("selected_operator_id");
    const storedAvatar = localStorage.getItem("selected_operator_avatar");
    const currentAvatarId = storedId ? storedId.split(" // ")[0] : "";

    if (currentAvatarId === "Custom_Upload" && storedAvatar) {
      const customSlot: AvatarSlot = {
        id: "Custom_Upload",
        name: "USER_UPLOAD_CORE",
        code: "PX-CUSTOM",
        status: "CUSTOM PORTRAIT LOADED",
        img: storedAvatar,
        active: true,
        locked: false,
        progress: 100,
      };
      setSlots([customSlot, ...initialPresets.map((s) => ({ ...s, active: false }))]);
      setActiveSlot(customSlot);
    } else if (currentAvatarId) {
      const found = initialPresets.find((s) => s.id === currentAvatarId);
      if (found) {
        setSlots(initialPresets.map((s) => ({ ...s, active: s.id === currentAvatarId })));
        setActiveSlot(found);
      }
    }

    // Hydrate OPERATOR_CONFIGURATION_MATRIX from localStorage
    const storedCallsign = localStorage.getItem("operator_callsign") || localStorage["operator_callsign"] || "";
    const storedRefresh = parseInt(localStorage.getItem("telemetry_refresh_ms") || "1000", 10);
    setCallsign(storedCallsign);
    setRefreshSpeed(REFRESH_SPEEDS.includes(storedRefresh) ? storedRefresh : 1000);
  }, [router]);

  // ─── Neural handshake animation ticker ──────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setPulseIndex((idx) => (idx + 1) % 20);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("session_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("username");
    localStorage.removeItem("selected_operator_id");
    localStorage.removeItem("selected_operator_avatar");
    localStorage.removeItem("operator_callsign");
    delete localStorage["operator_callsign"];
    window.dispatchEvent(new Event("operatorChanged"));
    router.push("/login");
  };

  // ─── Callsign handler — instant commit + broadcast ───────────────────────
  const handleCallsignChange = (value: string) => {
    setCallsign(value);
    localStorage["operator_callsign"] = value;
    localStorage.setItem("operator_callsign", value);
    window.dispatchEvent(new Event("operatorChanged"));
  };

  // ─── Telemetry refresh speed handler ─────────────────────────────────────
  const handleRefreshSpeedChange = (index: number) => {
    const ms = REFRESH_SPEEDS[index];
    setRefreshSpeed(ms);
    localStorage.setItem("telemetry_refresh_ms", String(ms));
  };

  const refreshSpeedIndex = REFRESH_SPEEDS.indexOf(refreshSpeed);

  // ─── Avatar slot selection ────────────────────────────────────────────────
  const handleSelectSlot = (slot: AvatarSlot) => {
    if (slot.locked) return;
    setSlots((prev) => prev.map((s) => ({ ...s, active: s.id === slot.id })));
    setActiveSlot(slot);
    setOverrideState("idle");
  };

  // ─── Drag & drop portrait upload ─────────────────────────────────────────
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  };

  const processFile = (file: File) => {
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const base64Str = event.target.result as string;
          const customSlot: AvatarSlot = {
            id: "Custom_Upload",
            name: "USER_UPLOAD_CORE",
            code: "PX-CUSTOM",
            status: "CUSTOM PORTRAIT LOADED",
            img: base64Str,
            active: true,
            locked: false,
            progress: 100,
          };
          setSlots((prev) => {
            const filtered = prev.filter((s) => s.id !== "Custom_Upload");
            return [customSlot, ...filtered.map((s) => ({ ...s, active: false }))];
          });
          setActiveSlot(customSlot);
          if ((window as any).toast) {
            (window as any).toast.success("Custom Portrait Loaded", {
              file_name: file.name,
              file_size: `${(file.size / 1024).toFixed(1)} KB`,
              status: "READY",
            });
          }
        }
      };
      reader.readAsDataURL(file);
    } else {
      if ((window as any).toast) {
        (window as any).toast.error("Portrait Upload Denied", {
          expected: "Image file format",
          status: "REJECTED",
        });
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  // ─── Identity override (avatar save) ─────────────────────────────────────
  const handleOverride = async () => {
    if (overrideState !== "idle") return;
    setOverrideState("running");

    const token = localStorage.getItem("session_token");
    const username = callsign || localStorage.getItem("username") || "US-EAST-01";

    if (!token) {
      setOverrideState("idle");
      router.push("/login");
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/users/avatar`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ avatar_id: activeSlot.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update avatar");
      }

      setTimeout(() => {
        setOverrideState("success");
        localStorage.setItem(
          "selected_operator_id",
          `${activeSlot.id} // ${username}`
        );
        localStorage.setItem("selected_operator_avatar", activeSlot.img);
        window.dispatchEvent(new Event("operatorChanged"));

        if ((window as any).toast) {
          (window as any).toast.success("Identity Bypass Synchronized", {
            operator: username,
            avatar_id: activeSlot.id,
            status: "SUCCESS",
          });
        }

        setTimeout(() => router.push("/live-cdc"), 800);
      }, 1500);
    } catch (err: any) {
      setOverrideState("idle");
      if ((window as any).toast) {
        (window as any).toast.error("Override Execution Fault", {
          error: err.message,
          status: "ABORTED",
        });
      }
    }
  };

  return (
    <div className="bg-[#0A0A0A] text-[#e5e2e1] font-body-mono selection:bg-[#00ff41]/20 selection:text-[#00ff41] h-[calc(100vh-64px)] flex flex-col overflow-hidden">
      <main className="flex-grow p-4 md:p-6 overflow-y-auto h-[calc(100vh-64px)]">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* ─── Left Pane: Identity Grid Scanner ────────────────────────── */}
          <section className="flex flex-col gap-6">

            {/* Identity Grid Scanner panel */}
            <div className="flex flex-col relative min-h-[400px]">
              <div className="flex items-center justify-between bg-[#353534] px-3 py-1 border border-[#3b4b37]">
                <span className="text-[10px] font-label-code text-[#72ff70] uppercase tracking-widest">
                  Identity Grid Scanner // {activeSlot.id}
                </span>
                <span className="material-symbols-outlined text-sm text-[#84967e] cursor-pointer hover:text-white">
                  close
                </span>
              </div>
              <div className="relative flex-grow bg-[#0e0e0e] border border-[#3b4b37] overflow-hidden p-6 flex flex-col aspect-[4/5] lg:aspect-auto">
                <div className="absolute bracket-tl" />
                <div className="absolute bracket-tr" />
                <div className="absolute bracket-bl" />
                <div className="absolute bracket-br" />
                <div className="absolute inset-x-0 z-10 scanning-line pointer-events-none" />
                <div className="w-full h-full relative bg-[#201f1f] overflow-hidden border border-[#3b4b37]/30 flex-1 flex items-center justify-center min-h-[300px]">
                  <img
                    className="w-full h-full object-cover grayscale brightness-75 contrast-125 opacity-80"
                    alt="Cybernetic operator identity scan."
                    src={activeSlot.img}
                  />
                  <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-black/90 to-transparent">
                    <div className="font-label-code text-[#72ff70] text-[10px] mb-1">
                      {overrideState === "success"
                        ? "BYPASS SUCCESSFUL: CORE UNLOCKED"
                        : "NODE ACCESS DEPLOYMENT: SCANNING ID..."}
                    </div>
                    {overrideState === "success" ? (
                      <div className="flex items-end justify-between">
                        <div className="text-[20px] font-display-tech text-[#00ff41] tracking-widest uppercase font-bold animate-pulse">
                          ACCESS GRANTED
                        </div>
                        <div className="text-[10px] font-label-code text-[#72ff70]">
                          AUTH_KEY: OK-200
                        </div>
                      </div>
                    ) : overrideState === "running" ? (
                      <div className="flex items-end justify-between">
                        <div className="text-[20px] font-display-tech text-[#00f1fe] tracking-widest uppercase font-bold animate-pulse">
                          BYPASSING...
                        </div>
                        <div className="text-[10px] font-label-code text-[#b9ccb2]">
                          OVERRIDE SEQUENCE ACTIVE
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-end justify-between">
                        <div className="text-[20px] font-display-tech text-error tracking-widest uppercase font-bold flicker">
                          {activeSlot.status}
                        </div>
                        <div className="text-[10px] font-label-code text-[#84967e]">
                          ERR_CODE: {activeSlot.code}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Operator Core Status Panel */}
            <div className="bg-[#0e0e0e] border border-[#3b4b37] p-6 relative overflow-hidden rounded-sm flex flex-col gap-4">
              <div className="absolute bracket-tl" />
              <div className="absolute bracket-tr" />
              <div className="absolute bracket-bl" />
              <div className="absolute bracket-br" />

              <div className="flex items-center gap-2 border-b border-[#3b4b37]/30 pb-2">
                <span className="material-symbols-outlined text-[#00ff41] text-md animate-pulse">
                  analytics
                </span>
                <span className="font-label-code text-[10px] text-white uppercase tracking-widest">
                  Operator Core Status Panel
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-black/60 p-3 border border-[#3b4b37]/30 font-body-mono text-xs">
                <div>
                  <span className="text-[#84967e] block text-[8px] uppercase tracking-widest">
                    AUTHENTICATED_OPERATOR
                  </span>
                  <span className="text-[#00ff41] font-bold truncate block">
                    {callsign || sessionMetadata?.username || "GHOST_IN_THE_SHELL"}
                  </span>
                </div>
                <div>
                  <span className="text-[#84967e] block text-[8px] uppercase tracking-widest">
                    OAUTH_EMAIL_PROTOCOL
                  </span>
                  <span className="text-[#00f1fe] break-all block truncate">
                    {sessionMetadata?.email || "unknown@pulsater.net"}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-label-code text-[9px] text-[#00f1fe] uppercase tracking-wider">
                  [ ACTIVE_CONTAINER_TELEMETRY ]
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px] font-body-mono bg-[#131313] p-2 border border-[#3b4b37]/20">
                  <div className="border-r border-[#3b4b37]/20 pr-2">
                    <span className="text-[#84967e] block text-[7px]">CONTAINER</span>
                    <span className="text-white truncate block">tracker-node-beta</span>
                  </div>
                  <div className="border-r border-[#3b4b37]/20 px-2">
                    <span className="text-[#84967e] block text-[7px]">ACTIVE_PORTS</span>
                    <span className="text-[#00ff41] block">5432:5432</span>
                  </div>
                  <div className="pl-2">
                    <span className="text-[#84967e] block text-[7px]">UPTIME</span>
                    <span className="text-[#00f1fe] block">2h 14m 08s</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-label-code text-[9px] text-[#00ff41] uppercase tracking-wider">
                  [ PROTOCOL_INGESTION_LOGS ]
                </div>
                <div className="bg-black/80 border border-[#3b4b37]/30 p-3 font-mono text-[9px] text-[#b9ccb2] space-y-1.5 max-h-28 overflow-y-auto custom-scrollbar">
                  <div>[16:01:04] <span className="text-[#00ff41]">SYS_INIT:</span> Neural socket loaded successfully.</div>
                  <div>[16:01:05] <span className="text-[#00f1fe]">OAUTH_LINK:</span> Secure gateway handshake authenticated.</div>
                  <div>[16:01:08] <span className="text-[#00ff41]">DB_MIGRATE:</span> Verification ledger active on shard.</div>
                  <div>[16:02:11] <span className="text-error">BYPASS_SEC:</span> Protocol bypass standing by for Operator lock.</div>
                  {overrideState === "running" && (
                    <div className="text-[#00ff41] animate-pulse">
                      &gt; [16:02:50] OVERRIDE: Deploying secure avatar bypass core...
                    </div>
                  )}
                  {overrideState === "success" && (
                    <div className="text-[#00ff41] font-bold">
                      &gt; [16:02:52] SECURE: Bypass complete. Session fully authorized.
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-[#3b4b37]/30 pt-4 flex justify-between items-center">
                <span className="font-label-code text-[8px] text-[#84967e] uppercase tracking-widest">
                  [ SECURITY_PROTOCOL: LEVEL_01 ]
                </span>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1.5 bg-[#ff4a4a]/10 border border-[#ff4a4a]/40 text-[#ffb4ab] font-label-code text-[10px] rounded hover:bg-[#ff4a4a]/20 hover:text-white transition-all uppercase tracking-widest flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-xs">logout</span>
                  Terminate Session
                </button>
              </div>
            </div>
          </section>

          {/* ─── Right Pane ──────────────────────────────────────────────── */}
          <section className="flex flex-col justify-between gap-6 min-h-[400px]">

            {/* Node Avatar Selector */}
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
                {slots.map((slot) => (
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
                      <div className={`w-8 h-8 flex items-center justify-center rounded ${
                        slot.active ? "bg-[#00f1fe]/20 text-[#00f1fe]" : "bg-[#353534]/50 text-[#84967e]"
                      }`}>
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
                        <div
                          className={`h-full ${slot.active ? "bg-[#00f1fe]" : "bg-[#84967e]"} transition-all duration-300`}
                          style={{ width: `${slot.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Custom Upload Zone */}
              <div className="mt-6">
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 bg-[#0e0e0e] ${
                    dragActive
                      ? "border-[#00ff41] bg-[#00ff41]/5 shadow-[0_0_15px_rgba(0,255,65,0.2)]"
                      : "border-[#3b4b37] hover:border-[#00f1fe] hover:bg-[#00f1fe]/5"
                  }`}
                >
                  <input type="file" id="file-upload-input" className="hidden" accept="image/*" onChange={handleFileChange} />
                  <label htmlFor="file-upload-input" className="cursor-pointer flex flex-col items-center gap-2 w-full">
                    <span className="material-symbols-outlined text-3xl text-[#00f1fe] animate-pulse">cloud_upload</span>
                    <div className="font-label-code text-[11px] text-white">DRAG & DROP PORTRAIT OR CLICK TO BROWSE</div>
                    <div className="font-body-mono text-[9px] text-[#b9ccb2]">Supports JPEG, PNG, WEBP (Max 2MB)</div>
                  </label>
                </div>
              </div>
            </div>

            {/* OPERATOR_CONFIGURATION_MATRIX */}
            <div
              className="border border-[#00f0ff]/30 p-6 relative overflow-hidden flex flex-col gap-5 rounded-sm"
              style={{ backgroundColor: "#0d0f12" }}
            >
              {/* Corner HUD brackets */}
              <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-[#00f0ff] opacity-40" />
              <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-[#00f0ff] opacity-40" />
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-[#00f0ff] opacity-40" />
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-[#00f0ff] opacity-40" />

              {/* Panel header */}
              <div className="flex items-center justify-between border-b border-[#00f0ff]/20 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex gap-[3px] items-center">
                    <div className="w-1 h-1 rounded-full bg-[#00f0ff] animate-ping" />
                    <div className="w-1 h-1 rounded-full bg-[#00f0ff]/40" />
                  </div>
                  <span className="font-label-code text-[9px] text-[#00f0ff] uppercase tracking-[0.25em]">
                    OPERATOR_CONFIGURATION_MATRIX
                  </span>
                </div>
                <span className="font-label-code text-[8px] text-[#2d3748] tracking-widest">
                  RUNTIME_PROFILE
                </span>
              </div>

              {/* ── Operator Callsign Alias ─────────────────────────────── */}
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="callsign-input"
                  className="font-label-code text-[9px] text-[#00f0ff]/80 uppercase tracking-[0.2em]"
                >
                  [ OPERATOR_CALLSIGN_ALIAS ]
                </label>
                <div className="relative">
                  <input
                    id="callsign-input"
                    type="text"
                    value={callsign}
                    onChange={(e) => handleCallsignChange(e.target.value)}
                    placeholder="GHOST_OPERATOR_01"
                    className="w-full font-body-mono p-3 text-[11px] text-white focus:outline-none transition-all placeholder:opacity-20 pr-8"
                    style={{
                      backgroundColor: "#0a0c0f",
                      border: "1px solid rgba(0,240,255,0.25)",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.border = "1px solid rgba(0,240,255,0.7)";
                      e.currentTarget.style.boxShadow = "0 0 10px rgba(0,240,255,0.12)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.border = "1px solid rgba(0,240,255,0.25)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-[#00f0ff]/50 text-sm pointer-events-none">
                    edit
                  </span>
                </div>
                <p className="font-label-code text-[8px] text-[#2d3748] leading-relaxed">
                  Updates HUD navbar display name in real-time. Commits instantly to localStorage["operator_callsign"]
                  and fires the <span className="text-[#00f0ff]/50">operatorChanged</span> event.
                </p>
              </div>

              {/* ── Telemetry Refresh Speed Profile ──────────────────────── */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="refresh-speed-slider"
                    className="font-label-code text-[9px] text-[#00f0ff]/80 uppercase tracking-[0.2em]"
                  >
                    [ TELEMETRY_REFRESH_SPEED ]
                  </label>
                  <div className="flex items-baseline gap-0.5">
                    <span className="font-display-tech text-[#00f0ff] text-base font-bold">
                      {refreshSpeed}
                    </span>
                    <span className="font-label-code text-[8px] text-[#4a9ead]">ms</span>
                  </div>
                </div>

                {/* Slider */}
                <input
                  id="refresh-speed-slider"
                  type="range"
                  min={0}
                  max={REFRESH_SPEEDS.length - 1}
                  step={1}
                  value={refreshSpeedIndex === -1 ? 1 : refreshSpeedIndex}
                  onChange={(e) => handleRefreshSpeedChange(parseInt(e.target.value, 10))}
                  className="w-full h-[3px] appearance-none cursor-pointer rounded-full"
                  style={{
                    background: `linear-gradient(to right, #00f0ff ${
                      ((refreshSpeedIndex === -1 ? 1 : refreshSpeedIndex) /
                        (REFRESH_SPEEDS.length - 1)) *
                      100
                    }%, #1e2938 0%)`,
                  }}
                />

                {/* Speed step labels */}
                <div className="flex justify-between">
                  {REFRESH_SPEEDS.map((ms) => (
                    <button
                      key={ms}
                      type="button"
                      onClick={() => handleRefreshSpeedChange(REFRESH_SPEEDS.indexOf(ms))}
                      className={`font-label-code text-[8px] transition-colors ${
                        refreshSpeed === ms ? "text-[#00f0ff] font-bold" : "text-[#2d3748] hover:text-[#00f0ff]"
                      }`}
                    >
                      {ms}ms
                    </button>
                  ))}
                </div>

                <p className="font-label-code text-[8px] text-[#2d3748] leading-relaxed">
                  Controls data polling loop interval for live telemetry streams.
                  Persists to localStorage["telemetry_refresh_ms"] across reloads.
                </p>
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
                    <div key={i} className={`flex-1 h-full mr-[2px] ${i < 17 ? "bg-[#00e639] shadow-[0_0_4px_#00e639]" : "bg-[#1c1b1b]"}`} />
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
                    <div key={i} className={`flex-1 h-full mr-[2px] ${i < 8 ? "bg-[#00e639] shadow-[0_0_4px_#00e639]" : "bg-[#1c1b1b]"}`} />
                  ))}
                </div>
              </div>

              {/* Track 3 — Neural Handshake (animated) */}
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
                      />
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
    </div>
  );
}
