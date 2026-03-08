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
  predict: {
    cardFeatured: 'rgba(200, 184, 112, 0.2)',
    rowBorderSoft: 'rgba(48, 47, 32, 0.35)',
    badgeGeoBg: 'rgba(200, 184, 112, 0.1)',
    badgeSportBg: 'rgba(74, 140, 111, 0.1)',
    outcomeYesBg: 'rgba(74, 140, 111, 0.12)',
    outcomeYesBorder: 'rgba(74, 140, 111, 0.3)',
    outcomeNoBg: 'rgba(217, 79, 61, 0.12)',
    outcomeNoBorder: 'rgba(217, 79, 61, 0.3)',
    outcomeDrawBg: 'rgba(90, 88, 64, 0.18)',
    outcomeDrawBorder: 'rgba(90, 88, 64, 0.3)',
  },
} as const;

export type SemanticTheme = typeof semantic;
