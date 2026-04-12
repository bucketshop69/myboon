import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { semantic, tokens } from '@/theme';

function resolveApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
}

const API_BASE = resolveApiBaseUrl();

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  polygonAddress: string;
}

interface DepositAddresses {
  svm?: string;
  evm?: string;
  btc?: string;
  tron?: string;
  [key: string]: string | undefined;
}

const CHAIN_META: Record<string, { label: string; color: string; note: string; min: string }> = {
  svm: { label: 'Solana', color: '#9945ff', note: 'Send USDC on Solana', min: 'Min: $1 USDC' },
  evm: { label: 'Ethereum / Polygon / Base', color: '#627eea', note: 'Send USDC from any EVM chain', min: 'Min: $1 USDC' },
  btc: { label: 'Bitcoin', color: '#f7931a', note: 'Send BTC', min: 'Min: 0.0001 BTC' },
  tron: { label: 'Tron', color: '#ff0013', note: 'Send USDT on Tron', min: 'Min: $1 USDT' },
};

function truncateAddress(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 10)}···${addr.slice(-8)}`;
}

export function DepositModal({ isOpen, onClose, polygonAddress }: DepositModalProps) {
  const [addresses, setAddresses] = useState<DepositAddresses | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !polygonAddress) return;

    setLoading(true);
    setError(null);

    console.log('[deposit] Fetching from:', `${API_BASE}/clob/deposit/${polygonAddress}`);
    fetch(`${API_BASE}/clob/deposit/${polygonAddress}`)
      .then((res) => {
        console.log('[deposit] Response status:', res.status);
        if (!res.ok) throw new Error('Failed to fetch deposit addresses');
        return res.json();
      })
      .then((data) => {
        console.log('[deposit] Raw response:', JSON.stringify(data));
        const addrs = data.address ?? data;
        console.log('[deposit] Parsed addresses:', JSON.stringify(addrs));
        console.log('[deposit] Keys:', Object.keys(addrs));
        setAddresses(addrs);
      })
      .catch((err) => {
        console.error('[deposit] Error:', err.message);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [isOpen, polygonAddress]);

  const handleCopy = async (chain: string, address: string) => {
    await Clipboard.setStringAsync(address);
    setCopied(chain);
    setTimeout(() => setCopied(null), 2000);
  };

  const chains = addresses
    ? Object.entries(addresses).filter(([, v]) => typeof v === 'string' && v.length > 0)
    : [];

  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Deposit</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <MaterialIcons name="close" size={18} color={semantic.text.dim} />
            </Pressable>
          </View>

          <Text style={styles.subtitle}>
            Send funds to any address below.{'\n'}Auto-bridges to your Polymarket account.
          </Text>

          {/* Content */}
          {loading && (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={tokens.colors.primary} />
              <Text style={styles.loadingText}>Fetching deposit addresses...</Text>
            </View>
          )}

          {error && (
            <View style={styles.errorWrap}>
              <MaterialIcons name="error-outline" size={16} color={tokens.colors.vermillion} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {!loading && !error && chains.length > 0 && (
            <View style={styles.list}>
              {chains.map(([chain, address]) => {
                const meta = CHAIN_META[chain] ?? {
                  label: chain.toUpperCase(),
                  color: '#888',
                  note: `Send to ${chain}`,
                  min: '',
                };
                const isCopied = copied === chain;

                return (
                  <Pressable
                    key={chain}
                    onPress={() => handleCopy(chain, address!)}
                    style={styles.chainCard}
                  >
                    <View style={styles.chainHeader}>
                      <View style={[styles.chainDot, { backgroundColor: meta.color }]} />
                      <Text style={styles.chainLabel}>{meta.label}</Text>
                      <View style={[styles.copyChip, isCopied && styles.copyChipActive]}>
                        <MaterialIcons
                          name={isCopied ? 'check' : 'content-copy'}
                          size={10}
                          color={isCopied ? '#fff' : tokens.colors.primary}
                        />
                        <Text style={[styles.copyText, isCopied && styles.copiedText]}>
                          {isCopied ? 'Copied!' : 'Tap to copy'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="middle">
                      {address}
                    </Text>
                    <View style={styles.noteRow}>
                      <Text style={styles.noteText}>{meta.note}</Text>
                      {meta.min ? <Text style={styles.minText}>{meta.min}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {!loading && !error && chains.length === 0 && addresses && (
            <Text style={styles.emptyText}>No deposit addresses available.</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: semantic.background.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: semantic.border.muted,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '700',
    color: semantic.text.primary,
    letterSpacing: 1,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: semantic.background.lift,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: semantic.text.primary,
    lineHeight: 14,
    marginBottom: 14,
    opacity: 0.7,
  },
  loadingWrap: {
    paddingVertical: 30,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: semantic.text.dim,
  },
  errorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 16,
  },
  errorText: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: tokens.colors.vermillion,
  },
  list: {
    gap: 6,
  },
  chainCard: {
    backgroundColor: semantic.background.lift,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 8,
    padding: 11,
    marginBottom: 6,
    gap: 4,
  },
  chainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chainDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chainLabel: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: '700',
    color: semantic.text.primary,
  },
  copyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(232,197,71,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(232,197,71,0.25)',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  copyChipActive: {
    backgroundColor: tokens.colors.viridian,
    borderColor: tokens.colors.viridian,
  },
  copyText: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: tokens.colors.primary,
  },
  copiedText: {
    color: '#fff',
  },
  addressText: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: semantic.text.accent,
    letterSpacing: 0.3,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noteText: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    color: semantic.text.dim,
  },
  minText: {
    fontFamily: 'monospace',
    fontSize: 7,
    fontWeight: '700',
    color: tokens.colors.primary,
    letterSpacing: 0.3,
  },
  emptyText: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: semantic.text.dim,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
