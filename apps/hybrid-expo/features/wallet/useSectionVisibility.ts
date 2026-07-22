import { useCallback, useRef, useState } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

const VISIBILITY_MARGIN = 40;

/**
 * Tracks whether a section within a parent ScrollView is currently within
 * the visible viewport, so a fetch can be deferred until the user actually
 * scrolls to it (Home's Wallet section — issue #237's lazy fetch trigger).
 *
 * Usage: attach `onSectionLayout` to the section's own View, `onScroll` and
 * `onViewportLayout` to the parent ScrollView (in addition to any existing
 * scroll handling), and read `isVisible`.
 */
export function useSectionVisibility() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionTop = useRef(0);
  const sectionHeight = useRef(0);
  const scrollOffset = useRef(0);
  const viewportHeight = useRef(0);

  const recompute = useCallback(() => {
    if (sectionHeight.current === 0 || viewportHeight.current === 0) return;
    const sectionBottom = sectionTop.current + sectionHeight.current;
    const viewportBottom = scrollOffset.current + viewportHeight.current;
    const visible = sectionBottom > scrollOffset.current + VISIBILITY_MARGIN
      && sectionTop.current < viewportBottom - VISIBILITY_MARGIN;
    setIsVisible(visible);
  }, []);

  const onSectionLayout = useCallback((event: LayoutChangeEvent) => {
    sectionTop.current = event.nativeEvent.layout.y;
    sectionHeight.current = event.nativeEvent.layout.height;
    recompute();
  }, [recompute]);

  const onViewportLayout = useCallback((event: LayoutChangeEvent) => {
    viewportHeight.current = event.nativeEvent.layout.height;
    recompute();
  }, [recompute]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffset.current = event.nativeEvent.contentOffset.y;
    recompute();
  }, [recompute]);

  return { isVisible, onSectionLayout, onViewportLayout, onScroll };
}
