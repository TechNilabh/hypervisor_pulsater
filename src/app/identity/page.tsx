"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

export default function IdentityAuth() {
  const router = useRouter();
  const [slots, setSlots] = useState<AvatarSlot[]>([
    {
      id: "Node_01",
      name: "Tactical Mech",
      code: "PX-101",
      status: "STANDBY",
      img: "/presets/node1.png",
      active: false,
      locked: false,
      progress: 30
    },
    {
      id: "Node_02",
      name: "AI Synth Core",
      code: "PX-808",
      status: "ACCESS DENIED",
      img: "/presets/node2.png",
      active: true,
      locked: false,
      progress: 100
    },
    {
      id: "Node_03",
      name: "Cybernetic Operator Matrix",
      code: "PX-302",
      status: "INACTIVE",
      img: "/presets/node3.png",
      active: false,
      locked: false,
      progress: 0
    },
    {
      id: "Node_04",
      name: "LOCKED_BY_ROOT",
      code: "ERR_LOCK",
      status: "RESTRICTED",
      img: "/presets/node1.png",
      active: false,
      locked: true,
      progress: 0
    }
  ]);

  const [activeSlot, setActiveSlot] = useState<AvatarSlot>(slots[1]);
  const [overrideState, setOverrideState] = useState<"idle" | "running" | "success">("idle");
  const [pulseIndex, setPulseIndex] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [sessionMetadata, setSessionMetadata] = useState<{ username: string; email: string } | null>(null);

  // Redirect if unauthenticated and load existing avatar selection with robust local storage checks
  useEffect(() => {
    const token = localStorage.getItem("session_token");
    if (!token) {
      router.push("/login");
      return;
    }

    // Decode session_token to extract username & email dynamically
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

    const storedId = localStorage.getItem("selected_operator_id");
    const storedAvatar = localStorage.getItem("selected_operator_avatar");

    let currentAvatarId = "";
    if (storedId) {
      currentAvatarId = storedId.split(" // ")[0];
    }

    const initialPresets = [
      {
        id: "Node_01",
        name: "Tactical Mech",
        code: "PX-101",
        status: "STANDBY",
        img: "/presets/node1.png",
        active: false,
        locked: false,
        progress: 30
      },
      {
        id: "Node_02",
        name: "AI Synth Core",
        code: "PX-808",
        status: "ACCESS DENIED",
        img: "/presets/node2.png",
        active: true,
        locked: false,
        progress: 100
      },
      {
        id: "Node_03",
        name: "Cybernetic Operator Matrix",
        code: "PX-302",
        status: "INACTIVE",
        img: "/presets/node3.png",
        active: false,
        locked: false,
        progress: 0
      },
      {
        id: "Node_04",
        name: "LOCKED_BY_ROOT",
        code: "ERR_LOCK",
        status: "RESTRICTED",
        img: "/presets/node1.png",
        active: false,
        locked: true,
        progress: 0
      }
    ];

    if (currentAvatarId === "Custom_Upload" && storedAvatar) {
      const customSlot = {
        id: "Custom_Upload",
        name: "USER_UPLOAD_CORE",
        code: "PX-CUSTOM",
        status: "CUSTOM PORTRAIT LOADED",
        img: storedAvatar,
        active: true,
        locked: false,
        progress: 100
      };
      const updated = [customSlot, ...initialPresets.map(s => ({ ...s, active: false }))];
      setSlots(updated);
      setActiveSlot(customSlot);
    } else if (currentAvatarId) {
      const foundSlot = initialPresets.find(s => s.id === currentAvatarId);
      if (foundSlot) {
        setSlots(initialPresets.map(s => ({ ...s, active: s.id === currentAvatarId })));
        setActiveSlot(foundSlot);
      } else {
        setSlots(initialPresets);
        setActiveSlot(initialPresets[1]);
      }
    } else {
      setSlots(initialPresets);
      setActiveSlot(initialPresets[1]);
    }
  }, [router]);

  // Animate the neural handshake loading bar
  useEffect(() => {
    const interval = setInterval(() => {
      setPulseIndex(idx => (idx + 1) % 20);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const handleSelectSlot = (slot: AvatarSlot) => {
    if (slot.locked) return;
    setSlots(prev => prev.map(s => ({ ...s, active: s.id === slot.id })));
    setActiveSlot(slot);
    setOverrideState("idle");
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
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
            progress: 100
          };
          
          setSlots(prev => {
            const filtered = prev.filter(s => s.id !== "Custom_Upload");
            return [customSlot, ...filtered.map(s => ({ ...s, active: false }))];
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

  const handleOverride = async () => {
    if (overrideState !== "idle") return;
    setOverrideState("running");

    const token = localStorage.getItem("session_token");
    const username = localStorage.getItem("username") || "US-EAST-01";

    if (!token) {
      setOverrideState("idle");
      if ((window as any).toast) {
        (window as any).toast.error("Bypass Aborted: No Session Token", {
          status: "UNAUTHORIZED",
        });
      } else {
        alert("Authentication token not found. Please log in first.");
      }
      router.push("/login");
      return;
    }

    try {
      const res = await fetch("http://localhost:8080/api/v1/users/avatar", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          avatar_id: activeSlot.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update avatar");
      }

      // We wait a brief moment for visual animation before proceeding
      setTimeout(() => {
        setOverrideState("success");
        // Save identity to localStorage using format expected by sidebar/navbar
        localStorage.setItem("selected_operator_id", `${activeSlot.id} // ${username}`);
        localStorage.setItem("selected_operator_avatar", activeSlot.img);
        
        // Dispatch event to refresh layout sidebar
        window.dispatchEvent(new Event("operatorChanged"));

        if ((window as any).toast) {
          (window as any).toast.success("Identity Bypass Synchronized", {
            operator: username,
            avatar_id: activeSlot.id,
            status: "SUCCESS",
          });
        }

        setTimeout(() => {
          router.push("/live-cdc");
        }, 800);
      }, 1500);

    } catch (err: any) {
      setOverrideState("idle");
      if ((window as any).toast) {
        (window as any).toast.error("Override Execution Fault", {
          error: err.message,
          status: "ABORTED",
        });
      } else {
        alert(err.message || "An error occurred while updating identity");
      }
    }
  };

  return (
    <div className="bg-[#0A0A0A] text-[#e5e2e1] font-body-mono selection:bg-[#00ff41]/20 selection:text-[#00ff41] h-[calc(100vh-64px)] flex flex-col overflow-hidden">
      
      {/* Main Content Area (Layout sidebar handles pl-64 / pl-16 offset) */}
      <main className="flex-grow p-6 overflow-y-auto scanline-overlay h-[calc(100vh-64px)]">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Left Pane: Identity Grid Scanner + Status panel */}
          <section className="flex flex-col gap-6">
            {/* Identity Grid Scanner */}
            <div className="flex flex-col relative min-h-[400px]">
              <div className="flex items-center justify-between bg-[#353534] px-3 py-1 border border-[#3b4b37]">
                <span className="text-[10px] font-label-code text-[#72ff70] uppercase tracking-widest">
                  Identity Grid Scanner // {activeSlot.id}
                </span>
                <span className="material-symbols-outlined text-sm text-[#84967e] cursor-pointer hover:text-white">close</span>
              </div>
              <div className="relative flex-grow bg-[#0e0e0e] border border-[#3b4b37] overflow-hidden p-6 flex flex-col aspect-[4/5] lg:aspect-auto">
                {/* Tactical Brackets */}
                <div className="absolute bracket-tl"></div>
                <div className="absolute bracket-tr"></div>
                <div className="absolute bracket-bl"></div>
                <div className="absolute bracket-br"></div>
                
                {/* Laser Scan Line */}
                <div className="absolute inset-x-0 z-10 scanning-line pointer-events-none"></div>
                
                {/* Avatar Display */}
                <div className="w-full h-full relative bg-[#201f1f] overflow-hidden border border-[#3b4b37]/30 flex-1 flex items-center justify-center min-h-[300px]">
                  <img 
                    className="w-full h-full object-cover grayscale brightness-75 contrast-125 opacity-80" 
                    alt="Futuristic cybernetic pilot with data streams reflecting off visor."
                    src={activeSlot.img}
                  />
                  {/* HUD Overlays */}
                  <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-black/90 to-transparent">
                    <div className="font-label-code text-[#72ff70] text-[10px] mb-1">
                      {overrideState === "success" ? "BYPASS SUCCESSFUL: CORE UNLOCKED" : "NODE ACCESS DEPLOYMENT: SCANNING ID..."}
                    </div>
                    
                    {overrideState === "success" ? (
                      <div className="flex items-end justify-between">
                        <div className="text-[20px] font-display-tech text-[#00ff41] tracking-widest uppercase font-bold animate-pulse">
                          ACCESS GRANTED
                        </div>
                        <div className="text-[10px] font-label-code text-[#72ff70]">AUTH_KEY: OK-200</div>
                      </div>
                    ) : overrideState === "running" ? (
                      <div className="flex items-end justify-between">
                        <div className="text-[20px] font-display-tech text-[#00f1fe] tracking-widest uppercase font-bold animate-pulse">
                          BYPASSING...
                        </div>
                        <div className="text-[10px] font-label-code text-[#b9ccb2]">OVERRIDE SEQUENCE ACTIVE</div>
                      </div>
                    ) : (
                      <div className="flex items-end justify-between">
                        <div className="text-[20px] font-display-tech text-error tracking-widest uppercase font-bold flicker">
                          {activeSlot.status}
                        </div>
                        <div className="text-[10px] font-label-code text-[#84967e]">ERR_CODE: {activeSlot.code}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Profile details & Telemetry panel */}
            <div className="bg-[#0e0e0e] border border-[#3b4b37] p-6 relative overflow-hidden rounded-sm flex flex-col gap-4">
              {/* Brackets */}
              <div className="absolute bracket-tl"></div>
              <div className="absolute bracket-tr"></div>
              <div className="absolute bracket-bl"></div>
              <div className="absolute bracket-br"></div>

              <div className="flex items-center gap-2 border-b border-[#3b4b37]/30 pb-2">
                <span className="material-symbols-outlined text-[#00ff41] text-md animate-pulse">analytics</span>
                <span className="font-label-code text-[10px] text-white uppercase tracking-widest">Operator Core Status Panel</span>
              </div>

              {/* Dynamic Session Info */}
              <div className="grid grid-cols-2 gap-4 bg-black/60 p-3 border border-[#3b4b37]/30 font-body-mono text-xs">
                <div>
                  <span className="text-[#84967e] block text-[8px] uppercase tracking-widest">AUTHENTICATED_OPERATOR</span>
                  <span className="text-[#00ff41] font-bold truncate block">{sessionMetadata?.username || "GHOST_IN_THE_SHELL"}</span>
                </div>
                <div>
                  <span className="text-[#84967e] block text-[8px] uppercase tracking-widest">OAUTH_EMAIL_PROTOCOL</span>
                  <span className="text-[#00f1fe] break-all block truncate">{sessionMetadata?.email || "unknown@pulsater.net"}</span>
                </div>
              </div>

              {/* Active container telemetry */}
              <div className="space-y-2">
                <div className="font-label-code text-[9px] text-[#00f1fe] uppercase tracking-wider">[ ACTIVE_CONTAINER_TELEMETRY ]</div>
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

              {/* System Log History Grid */}
              <div className="space-y-2">
                <div className="font-label-code text-[9px] text-[#00ff41] uppercase tracking-wider">[ PROTOCOL_INGESTION_LOGS ]</div>
                <div className="bg-black/80 border border-[#3b4b37]/30 p-3 font-mono text-[9px] text-[#b9ccb2] space-y-1.5 max-h-28 overflow-y-auto custom-scrollbar">
                  <div>[16:01:04] <span className="text-[#00ff41]">SYS_INIT:</span> Neural socket loaded successfully.</div>
                  <div>[16:01:05] <span className="text-[#00f1fe]">OAUTH_LINK:</span> Secure gateway handshake authenticated.</div>
                  <div>[16:01:08] <span className="text-[#00ff41]">DB_MIGRATE:</span> Verification ledger active on shard.</div>
                  <div>[16:02:11] <span className="text-error">BYPASS_SEC:</span> Protocol bypass standing by for Operator lock.</div>
                  {overrideState === "running" && (
                    <div className="text-[#00ff41] animate-pulse">&gt; [16:02:50] OVERRIDE: Deploying secure avatar bypass core...</div>
                  )}
                  {overrideState === "success" && (
                    <div className="text-[#00ff41] font-bold">&gt; [16:02:52] SECURE: Bypass complete. Session fully authorized.</div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Right Pane: Node Avatar Selector */}
          <section className="flex flex-col justify-between gap-6 min-h-[400px]">
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
                {slots.map(slot => (
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
                      <div className={`w-8 h-8 flex items-center justify-center rounded ${slot.active ? "bg-[#00f1fe]/20 text-[#00f1fe]" : "bg-[#353534]/50 text-[#84967e]"}`}>
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
                        <div className={`h-full ${slot.active ? "bg-[#00f1fe]" : "bg-[#84967e]"} transition-all duration-300`} style={{ width: `${slot.progress}%` }}></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              
              {/* Custom Uploader Zone */}
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
                  <input 
                    type="file" 
                    id="file-upload-input" 
                    className="hidden" 
                    accept="image/*"
                    onChange={handleFileChange}
                  />
                  <label htmlFor="file-upload-input" className="cursor-pointer flex flex-col items-center gap-2 w-full">
                    <span className="material-symbols-outlined text-3xl text-[#00f1fe] animate-pulse">cloud_upload</span>
                    <div className="font-label-code text-[11px] text-white">DRAG & DROP PORTRAIT OR CLICK TO BROWSE</div>
                    <div className="font-body-mono text-[9px] text-[#b9ccb2]">Supports JPEG, PNG, WEBP (Max 2MB)</div>
                  </label>
                </div>
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
                    <div key={i} className={`flex-1 h-full mr-[2px] ${i < 17 ? "bg-[#00e639] shadow-[0_0_4px_#00e639]" : "bg-[#1c1b1b]"}`}></div>
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
                    <div key={i} className={`flex-1 h-full mr-[2px] ${i < 8 ? "bg-[#00e639] shadow-[0_0_4px_#00e639]" : "bg-[#1c1b1b]"}`}></div>
                  ))}
                </div>
              </div>

              {/* Track 3 */}
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
                      ></div>
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
