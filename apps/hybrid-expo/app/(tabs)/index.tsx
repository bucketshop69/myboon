import { StyleSheet, View, Text } from 'react-native';
import { WalletButton } from '@/components/wallet/WalletButton';
import { AnimatedInput } from '@/components/AnimatedInput';

/**
 * Home page with PNLDOTFUN logo, animated input field, and wallet button.
 * Wallet button opens custom modal for connection.
 */
export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.logo}>
        <Text style={styles.p}>P</Text>N<Text style={styles.l}>L</Text>DOTFUN
      </Text>
      <AnimatedInput style={styles.input} />
      <WalletButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0a',
    gap: 32,
    paddingHorizontal: 16,
  },
  logo: {
    fontSize: 48,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    letterSpacing: -2,
  },
  p: {
    color: '#00ff88', // pnl-green
  },
  l: {
    color: '#ff4d4d', // pnl-red
  },
  input: {
    width: '100%',
    maxWidth: 640,
  },
});