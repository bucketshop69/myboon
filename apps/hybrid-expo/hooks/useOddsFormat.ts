import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type OddsFormat = 'probability' | 'decimal' | 'points';

const STORAGE_KEY = 'odds_format';

export function formatOdds(price: number | null, format: OddsFormat): string {
  if (price === null || price <= 0 || price >= 1) {
    if (price === null) return '—';
    if (price <= 0) return format === 'probability' ? '0%' : format === 'decimal' ? '∞' : '+∞';
    if (price >= 1) return format === 'probability' ? '100%' : format === 'decimal' ? '1.00' : '+0';
  }
  switch (format) {
    case 'probability':
      return `${Math.round(price * 100)}%`;
    case 'decimal':
      return (1 / price).toFixed(2);
    case 'points':
      return `+${Math.round(((1 / price) - 1) * 100)}`;
  }
}

export function useOddsFormat() {
  const [format, setFormatState] = useState<OddsFormat>('probability');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'decimal' || stored === 'points' || stored === 'probability') {
        setFormatState(stored);
      }
    });
  }, []);

  const setFormat = useCallback((f: OddsFormat) => {
    setFormatState(f);
    AsyncStorage.setItem(STORAGE_KEY, f);
  }, []);

  return { format, setFormat, formatOdds: (price: number | null) => formatOdds(price, format) };
}
