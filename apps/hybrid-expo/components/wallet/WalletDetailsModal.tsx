import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';

interface WalletDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WalletDetailsModal({ isOpen, onClose }: WalletDetailsModalProps) {
  // TODO: Implement wallet details and actions
  return (
    <Modal visible={isOpen} transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Wallet Details</Text>
          
          {/* Placeholder for wallet details */}
          <View style={styles.detailItem}>
            <Text style={styles.label}>Address:</Text>
            <Text style={styles.value}>TODO: Display wallet address</Text>
          </View>
          
          <View style={styles.actionsContainer}>
            <TouchableOpacity style={styles.actionButton}>
              <Text style={styles.actionButtonText}>Transfer</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton}>
              <Text style={styles.actionButtonText}>Swap</Text>
            </TouchableOpacity>
          </View>
          
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
  detailItem: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: '#aaa',
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    color: '#fff',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    marginHorizontal: 4,
    padding: 12,
    backgroundColor: '#333',
    borderRadius: 8,
  },
  actionButtonText: {
    textAlign: 'center',
    color: '#fff',
  },
  closeButton: {
    padding: 12,
    backgroundColor: '#555',
    borderRadius: 8,
  },
  closeButtonText: {
    textAlign: 'center',
    color: '#fff',
  },
});