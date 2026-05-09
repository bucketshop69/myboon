import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';

type IntervalCallback = (isCurrent: () => boolean) => void | Promise<void>;

interface FocusedAppStateIntervalOptions {
  enabled?: boolean;
  runImmediately?: boolean;
  resetKey?: unknown;
}

export function useFocusedAppStateInterval(
  callback: IntervalCallback,
  delayMs: number,
  {
    enabled = true,
    runImmediately = false,
    resetKey = null,
  }: FocusedAppStateIntervalOptions = {},
) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useFocusEffect(
    useCallback(() => {
      void resetKey;

      let timer: ReturnType<typeof globalThis.setInterval> | null = null;
      let appState = AppState.currentState;
      let active = false;
      let runId = 0;

      const clearTimer = () => {
        active = false;
        runId += 1;
        if (timer) {
          globalThis.clearInterval(timer);
          timer = null;
        }
      };
      const tick = () => {
        const currentRunId = runId;
        void callbackRef.current(() => active && runId === currentRunId);
      };
      const startTimer = () => {
        if (!enabled || appState !== 'active' || timer) return;
        active = true;
        runId += 1;
        if (runImmediately) tick();
        timer = globalThis.setInterval(tick, delayMs);
      };

      const subscription = AppState.addEventListener('change', (nextAppState) => {
        appState = nextAppState;
        if (appState === 'active') {
          startTimer();
        } else {
          clearTimer();
        }
      });

      startTimer();

      return () => {
        clearTimer();
        subscription.remove();
      };
    }, [delayMs, enabled, runImmediately, resetKey]),
  );
}
