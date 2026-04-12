import { useEffect, useRef, useState } from 'react';
import type { LivePriceUpdate } from '@/features/perps/perps.types';

// Uses React Native's native global WebSocket — no isomorphic-ws needed.
// The shared PacificWebSocket class uses isomorphic-ws (Node.js ws package)
// which doesn't work in RN's JS runtime. This hook bypasses that entirely.

const PACIFIC_WS_URL = 'wss://ws.pacifica.fi/ws';
const HEARTBEAT_INTERVAL_MS = 30_000;

export function usePerpsLivePrice(symbol: string): LivePriceUpdate | null {
  const [livePrice, setLivePrice] = useState<LivePriceUpdate | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let active = true;

    function connect() {
      const ws = new WebSocket(PACIFIC_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'prices', symbol } }));

        heartbeatRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ method: 'ping' }));
          }
        }, HEARTBEAT_INTERVAL_MS);
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        if (!active) return;
        try {
          const msg = JSON.parse(event.data) as { channel?: string; data?: Record<string, string> };
          if (msg.channel === 'prices' && msg.data) {
            const d = msg.data;
            setLivePrice({
              mark: d['mark'] ?? '',
              oracle: d['oracle'] ?? '',
              funding: d['funding'] ?? '',
              openInterest: d['open_interest'] ?? '',
            });
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => {
        // error is followed by close — reconnect handled in onclose
      };

      ws.onclose = () => {
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
      };
    }

    connect();

    return () => {
      active = false;
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onmessage = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [symbol]);

  return livePrice;
}
