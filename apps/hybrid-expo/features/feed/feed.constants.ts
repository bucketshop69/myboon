// Category pill colors — shared between FeedCard and NarrativeSheet
export const CATEGORY_STYLES: Record<
  string,
  { backgroundColor: string; color: string }
> = {
  Geopolitics: { backgroundColor: 'rgba(199,183,112,0.12)', color: '#c7b770' },
  Macro:       { backgroundColor: 'rgba(90,88,64,0.30)',    color: '#8A7A50' },
  Markets:     { backgroundColor: 'rgba(74,140,111,0.12)',  color: '#4A8C6F' },
  Tech:        { backgroundColor: 'rgba(100,120,200,0.12)', color: '#7A9AC8' },
  Crypto:      { backgroundColor: 'rgba(245,158,11,0.12)',  color: '#F59E0B' },
  AI:          { backgroundColor: 'rgba(168,85,247,0.12)',  color: '#A855F7' },
  Energy:      { backgroundColor: 'rgba(34,197,94,0.12)',   color: '#22C55E' },
  Conflict:    { backgroundColor: 'rgba(239,68,68,0.12)',   color: '#EF4444' },
  Trade:       { backgroundColor: 'rgba(59,130,246,0.12)',  color: '#3B82F6' },
  Climate:     { backgroundColor: 'rgba(6,182,212,0.12)',   color: '#06B6D4' },
};

export const DEFAULT_CATEGORY_STYLE = CATEGORY_STYLES.Macro;
