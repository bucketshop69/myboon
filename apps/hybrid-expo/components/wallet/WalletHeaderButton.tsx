import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Wallet } from 'lucide-react-native';
import { WalletModal } from './WalletModal';
import { WalletDetailsModal } from './WalletDetailsModal';
import { useWallet } from '@/hooks/useWallet';
import { semantic, tokens } from '@/theme';

/** Compact wallet button for the header bar. */
export function WalletHeaderButton() {
  const { connected, shortAddress } = useWallet();
  const [showConnect, setShowConnect] = useState(false);
  const [connectKey, setConnectKey] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

  if (connected && shortAddress) {
    return (
      <>
        <TouchableOpacity style={styles.pill} onPress={() => setShowDetails(true)}>
          <View style={styles.dot} />
          <Text style={styles.address}>{shortAddress}</Text>
        </TouchableOpacity>
        <WalletDetailsModal isOpen={showDetails} onClose={() => setShowDetails(false)} />
      </>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={styles.connectPill}
        onPress={() => { setConnectKey((k) => k + 1); setShowConnect(true); }}
      >
        <Wallet size={14} color={semantic.text.accent} />
        <Text style={styles.connectText}>Connect</Text>
      </TouchableOpacity>
      <WalletModal key={connectKey} isOpen={showConnect} onClose={() => setShowConnect(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: semantic.background.screen,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 6,
    borderRadius: tokens.radius.full,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: semantic.sentiment.positive,
  },
  address: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    color: semantic.text.primary,
    letterSpacing: tokens.letterSpacing.mono,
  },
  connectPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: semantic.background.screen,
    borderWidth: 1,
    borderColor: semantic.text.accent,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 6,
    borderRadius: tokens.radius.full,
  },
  connectText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    color: semantic.text.accent,
    letterSpacing: tokens.letterSpacing.mono,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
