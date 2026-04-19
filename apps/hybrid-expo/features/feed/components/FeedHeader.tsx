import { Image, StyleSheet, Text, View } from 'react-native';
import { WalletHeaderButton } from '@/components/wallet/WalletHeaderButton';
import { semantic, tokens } from '@/theme';

export function FeedHeader() {
  return (
    <View style={styles.header}>
      <Image
        source={require('../../../assets/branding/myboon-wordmark-small.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <WalletHeaderButton />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
    paddingHorizontal: tokens.spacing.xl,
    paddingTop: tokens.spacing.xxs,
    paddingBottom: tokens.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: semantic.background.header,
  },
  logo: {
    width: tokens.sizing.headerLogoWidth,
    height: tokens.sizing.headerLogoHeight,
  },
  livePill: {
    backgroundColor: semantic.background.screen,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 6,
    borderRadius: tokens.radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  liveDotOuter: {
    width: tokens.spacing.sm,
    height: tokens.spacing.sm,
    borderRadius: tokens.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.background.liveDotOuter,
  },
  liveDotInner: {
    width: 6,
    height: 6,
    borderRadius: tokens.radius.full,
    backgroundColor: semantic.sentiment.positive,
  },
  liveText: {
    color: semantic.text.primary,
    fontSize: tokens.fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: tokens.letterSpacing.monoWide,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
});
