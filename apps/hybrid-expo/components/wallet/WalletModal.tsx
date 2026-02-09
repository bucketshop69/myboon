import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WalletModal({ isOpen, onClose }: WalletModalProps) {
  // TODO: Implement wallet connection options
  return (
    <Modal visible={isOpen} transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Connect Wallet</Text>
          
          {/* Placeholder for wallet options */}
          <TouchableOpacity style={styles.walletOption}>
            <Text>Phantom</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.walletOption}>
            <Text>Solflare</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.walletOption}>
            <Text>Lazorkit</Text>
          </TouchableOpacity>
          
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1f1f1f',
    borderRadius: 12,
    padding: 20,
    minWidth: 300,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
    color: '#ffffff',
  },
  walletOption: {
    backgroundColor: '#333',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  closeButton: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#555',
    borderRadius: 8,
  },
  closeButtonText: {
    textAlign: 'center',
    color: '#fff',
  },
});