import { Platform } from 'react-native';

/**
 * Resolve the API base URL from the environment or fall back to local defaults.
 * Single source of truth — replaces the 4 copies across the codebase.
 */
export function resolveApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Fetch wrapper with a default 15 s timeout via AbortController.
 * Drop-in replacement for global fetch — same signature, just adds timeout.
 */
export function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchInit } = init ?? {};

  const controller = new AbortController();
  // Respect an existing signal by forwarding abort
  if (fetchInit.signal) {
    fetchInit.signal.addEventListener('abort', () => controller.abort());
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(input, { ...fetchInit, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}
