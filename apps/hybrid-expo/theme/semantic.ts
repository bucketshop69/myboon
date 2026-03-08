import { tokens } from '@/theme/tokens';

export const semantic = {
  background: {
    screen: tokens.colors.backgroundDark,
    surface: tokens.colors.ground,
    surfaceRaised: tokens.colors.surface,
    lift: tokens.colors.lift,
    header: `rgba(29, 28, 21, ${tokens.opacity.headerBackground})`,
    nav: `rgba(48, 47, 32, ${tokens.opacity.navBackground})`,
    topCardOverlay: `rgba(199, 183, 112, ${tokens.opacity.topCardOverlay})`,
    liveDotOuter: `rgba(74, 140, 111, ${tokens.opacity.liveDotOuter})`,
  },
  border: {
    muted: tokens.colors.borderMuted,
    nav: `rgba(199, 183, 112, ${tokens.opacity.navBorder})`,
    imageSoft: `rgba(48, 47, 32, ${tokens.opacity.borderSoft})`,
  },
  text: {
    primary: tokens.colors.bone,
    dim: tokens.colors.textDim,
    faint: tokens.colors.textFaint,
    accent: tokens.colors.primary,
    accentDim: tokens.colors.primaryDim,
    categoryMeta: `rgba(208, 202, 168, ${tokens.opacity.categoryMeta})`,
  },
  sentiment: {
    positive: tokens.colors.viridian,
    negative: tokens.colors.vermillion,
  },
} as const;

export type SemanticTheme = typeof semantic;
