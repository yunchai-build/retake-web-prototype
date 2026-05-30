import { useCallback, useMemo, useState } from 'react';

export const TOOLBAR_MODES = Object.freeze({
  EXPANDED: 'expanded',
  COLLAPSED: 'collapsed',
  HIDDEN: 'hidden',
});

export default function useToolbarVisibility({
  isInteractingWithCanvas = false,
  hasToolbarCollision = false,
  disabled = false,
} = {}) {
  const [manualCollapsed, setManualCollapsed] = useState(false);

  const toolbarMode = useMemo(() => {
    if (disabled || isInteractingWithCanvas) return TOOLBAR_MODES.HIDDEN;
    if (manualCollapsed || hasToolbarCollision) return TOOLBAR_MODES.COLLAPSED;
    return TOOLBAR_MODES.EXPANDED;
  }, [disabled, hasToolbarCollision, isInteractingWithCanvas, manualCollapsed]);

  const collapseToolbar = useCallback(() => {
    setManualCollapsed(true);
  }, []);

  const expandToolbar = useCallback(() => {
    setManualCollapsed(false);
  }, []);

  const toggleToolbar = useCallback(() => {
    setManualCollapsed(prev => !prev);
  }, []);

  return {
    toolbarMode,
    manualCollapsed,
    hiddenDuringInteraction: !disabled && isInteractingWithCanvas,
    collapseToolbar,
    expandToolbar,
    toggleToolbar,
  };
}
