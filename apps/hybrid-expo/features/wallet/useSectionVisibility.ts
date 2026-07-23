import { useCallback, useRef, useState } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

// Hysteresis: entering "visible" requires clearing a bigger margin than
// leaving it does. Using one shared margin for both directions let the
// computed boolean flip back and forth on ordinary scroll wobble right at
// the boundary line, which visibly jittered the row between its pending
// and resolved states. A wider ENTER margin than EXIT margin creates a dead
// zone the scroll position has to fully cross before it can flip again.
const VISIBILITY_MARGIN_ENTER = 80;
const VISIBILITY_MARGIN_EXIT = 24;

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
  const wasVisibleRef = useRef(false);
  const sectionTop = useRef(0);
  const sectionHeight = useRef(0);
  const scrollOffset = useRef(0);
  const viewportHeight = useRef(0);

  const recompute = useCallback(() => {
    if (sectionHeight.current === 0 || viewportHeight.current === 0) return;
    const margin = wasVisibleRef.current ? VISIBILITY_MARGIN_EXIT : VISIBILITY_MARGIN_ENTER;
    const sectionBottom = sectionTop.current + sectionHeight.current;
    const viewportBottom = scrollOffset.current + viewportHeight.current;
    const visible = sectionBottom > scrollOffset.current + margin
      && sectionTop.current < viewportBottom - margin;
    if (visible !== wasVisibleRef.current) {
      wasVisibleRef.current = visible;
      setIsVisible(visible);
    }
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
