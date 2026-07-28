/**
 * useContainerStream — SSE client hook for live container status updates.
 *
 * Security: implements two-step ticket auth (Fix #1):
 *   1. POST /api/v1/containers/stream/token  (with JWT in Authorization header)
 *      → server returns a short-lived one-time ticket (30s TTL)
 *   2. EventSource connects with ?ticket=<ticket>
 *      → long-lived JWT never appears in a URL, browser history, or proxy logs
 *   3. On reconnect, a fresh ticket is obtained first.
 */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { API_BASE_URL } from "@/lib/api";

export interface ContainerState {
  container_id: string;
  operator_id: string;
  callsign_alias: string;
  from_state?: string;
  to_state: string;
  occurred_at: string;
  detail?: string;
}

interface UseContainerStreamResult {
  containers: Map<string, ContainerState>;
  connected: boolean;
  error: string | null;
}

const MAX_RECONNECT_DELAY_MS = 30_000;
const BASE_RECONNECT_DELAY_MS = 1_000;

export function useContainerStream(token: string | null): UseContainerStreamResult {
  const [containers, setContainers] = useState<Map<string, ContainerState>>(new Map());
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // ── Step 1: fetch one-time SSE ticket ─────────────────────────────────────
  const fetchTicket = useCallback(async (): Promise<string | null> => {
    if (!token) return null;
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/containers/stream/token`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        console.warn("[useContainerStream] ticket fetch failed:", res.status);
        return null;
      }
      const data = await res.json();
      return data.ticket as string;
    } catch (e) {
      console.warn("[useContainerStream] ticket fetch error:", e);
      return null;
    }
  }, [token]);

  // ── Step 2: open EventSource with the ticket ───────────────────────────────
  const connect = useCallback(async () => {
    if (!token || !mountedRef.current) return;

    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const ticket = await fetchTicket();
    if (!ticket || !mountedRef.current) return;

    const url = `${API_BASE_URL}/api/v1/containers/stream?ticket=${encodeURIComponent(ticket)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      if (!mountedRef.current) return;
      setConnected(true);
      setError(null);
      reconnectAttempt.current = 0;
      console.log("[useContainerStream] SSE connected");
    };

    es.addEventListener("container_update", (evt: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const update: ContainerState = JSON.parse(evt.data);
        setContainers((prev) => {
          const next = new Map(prev);
          next.set(update.container_id, update);
          return next;
        });
        window.dispatchEvent(new CustomEvent("containerStatusUpdated", { detail: update }));
      } catch {
        console.warn("[useContainerStream] failed to parse event:", evt.data);
      }
    });

    es.addEventListener("disconnect", () => {
      if (!mountedRef.current) return;
      console.warn("[useContainerStream] server evicted slow client, reconnecting...");
      es.close();
      scheduleReconnect();
    });

    es.onerror = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      es.close();
      scheduleReconnect();
    };
  }, [token, fetchTicket]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Exponential backoff reconnect ─────────────────────────────────────────
  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    const attempt = reconnectAttempt.current++;
    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * Math.pow(2, attempt),
      MAX_RECONNECT_DELAY_MS
    );
    setError(`Reconnecting in ${Math.round(delay / 1000)}s…`);
    reconnectTimer.current = setTimeout(() => {
      if (mountedRef.current) connect();
    }, delay);
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    if (token) connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [token, connect]);

  return { containers, connected, error };
}
