import WebSocket from 'isomorphic-ws';
import { PACIFIC_CONFIG } from './client';

export type PacificWSEventMap = {
  prices: (data: any) => void;
  orderbook: (data: any) => void;
  trades: (data: any) => void;
  funding: (data: any) => void;
  positions: (data: any) => void;
};

export class PacificWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private isConnected = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private baseDelayMs = 1000;
  private maxDelayMs = 30000;
  private reconnectAttempt = 0;
  private activeSubscriptions = new Map<string, any>(); // Track subs to resubscribe on reconnect
  private connectionPromise: Promise<void> | null = null;

  // Typed EventEmitter equivalent for callbacks
  private listeners: { [K in keyof PacificWSEventMap]?: Set<PacificWSEventMap[K]> } = {};

  constructor(env: 'mainnet' | 'testnet' = 'mainnet') {
    this.url = PACIFIC_CONFIG[env].ws;
  }

  public connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return Promise.resolve(); // Already connecting or connected
    }

    this.ws = new WebSocket(this.url);

    this.connectionPromise = new Promise((resolve, reject) => {
      const connectionTimeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
        this.connectionPromise = null;
      }, 10000);

      this.ws!.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log(`[PacificWebSocket] Connected to ${this.url}`);
        this.isConnected = true;
        this.reconnectAttempt = 0;
        this.startHeartbeat();

        // Resubscribe to existing channels
        for (const [key, params] of this.activeSubscriptions.entries()) {
          this.send({ method: 'subscribe', params });
        }
        resolve();
      };

      this.ws!.onerror = (error: WebSocket.ErrorEvent) => {
        clearTimeout(connectionTimeout);
        this.connectionPromise = null;
        reject(new Error(error.message || 'WebSocket connection error'));
      };
    });

    this.ws.onmessage = (event: WebSocket.MessageEvent) => {
      try {
        const message = JSON.parse(event.data.toString());
        if (message.channel && message.channel !== 'pong') {
          this.emit(message.channel as keyof PacificWSEventMap, message.data);
        }
      } catch (err) {
        console.error('[PacificWebSocket] Failed to parse message', err);
      }
    };

    this.ws.onclose = () => {
      console.log(`[PacificWebSocket] Disconnected`);
      this.cleanup();
      this.connectionPromise = null;
      this.scheduleReconnect();
    };

    return this.connectionPromise;
  }

  public disconnect() {
    this.reconnectAttempt = 0; // Prevent further auto-reconnects
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private cleanup() {
    this.isConnected = false;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    // Ping every 30 seconds as required
    this.heartbeatInterval = setInterval(() => {
      this.send({ method: 'ping' });
    }, 30000);
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    
    // Exponential backoff
    const delay = Math.min(this.baseDelayMs * Math.pow(2, this.reconnectAttempt), this.maxDelayMs);
    this.reconnectAttempt++;

    console.log(`[PacificWebSocket] Attempting reconnect in ${delay}ms...`);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private send(payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  // --- Subscriptions ---

  public subscribeToPrices(symbol: string) {
    const params = { channel: 'prices', symbol };
    const subKey = JSON.stringify(params);
    this.activeSubscriptions.set(subKey, params);
    this.send({ method: 'subscribe', params });
  }

  public unsubscribeFromPrices(symbol: string) {
    const params = { channel: 'prices', symbol };
    const subKey = JSON.stringify(params);
    this.activeSubscriptions.delete(subKey);
    this.send({ method: 'unsubscribe', params });
  }

  // Add more specific sub methods like subscribeToPositions as needed...

  // --- Event Handling ---

  public on<K extends keyof PacificWSEventMap>(event: K, listener: PacificWSEventMap[K]) {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set();
    }
    this.listeners[event]!.add(listener);
  }

  public off<K extends keyof PacificWSEventMap>(event: K, listener: PacificWSEventMap[K]) {
    const listeners = this.listeners[event];
    if (listeners) {
      listeners.delete(listener);
    }
  }

  private emit<K extends keyof PacificWSEventMap>(event: K, data: any) {
    const listeners = this.listeners[event];
    if (listeners) {
      for (const listener of listeners) {
        listener(data);
      }
    }
  }
}
