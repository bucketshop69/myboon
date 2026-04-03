import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Wallet } from 'lucide-react-native';
import { WalletModal } from './WalletModal';
import { WalletDetailsModal } from './WalletDetailsModal';
import { useWallet } from '@/hooks/useWallet';

/**
 * Wallet button for the page.
 * - Disconnected: Shows wallet icon, opens connection modal on click
 * - Connected: Shows wallet icon + truncated address, opens details modal on click
 *
 * Uses MWA via useWallet() hook — works on Seeker and any MWA-compatible Android wallet.
 */
export function WalletButton() {
  const { connected, shortAddress } = useWallet();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const openModal = () => {
    setModalKey((k) => k + 1); // Force remount to reset state
    setIsModalOpen(true);
  };
  const closeModal = () => setIsModalOpen(false);

  const openDetails = () => setIsDetailsOpen(true);
  const closeDetails = () => setIsDetailsOpen(false);

  // Connected state - clicking opens details modal
  if (connected && shortAddress) {
    return (
      <>
        <View style={styles.connectedContainer}>
          <TouchableOpacity onPress={openDetails} style={styles.connectedButton}>
            <Wallet size={18} color="#00ffff" />
            <Text style={styles.addressText}>{shortAddress}</Text>
          </TouchableOpacity>
          <Text style={styles.helperText}>Click to Transfer or Swap</Text>
        </View>

        <WalletDetailsModal isOpen={isDetailsOpen} onClose={closeDetails} />
      </>
    );
  }

  // Disconnected state
  return (
    <>
      <TouchableOpacity onPress={openModal} style={styles.connectButton}>
        <Text style={styles.connectButtonText}>Connect Wallet</Text>
      </TouchableOpacity>

      <WalletModal key={modalKey} isOpen={isModalOpen} onClose={closeModal} />
    </>
  );
}

const styles = StyleSheet.create({
  connectedContainer: {
    alignItems: 'center',
    gap: 8,
  },
  connectedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1f1f1f',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ffffff1a',
  },
  addressText: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: '#ffffff',
  },
  helperText: {
    fontSize: 12,
    color: '#aaaaaa',
  },
  connectButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
  },
  connectButtonText: {
    fontFamily: 'monospace',
    fontWeight: 'bold',
    color: '#0a0a0a',
    fontSize: 16,
  },
});
