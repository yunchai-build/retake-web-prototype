import { useEffect, useState } from 'react';

const COLLISION_PADDING = 8;

function inflateRect(rect, padding) {
  return {
    left: rect.left - padding,
    right: rect.right + padding,
    top: rect.top - padding,
    bottom: rect.bottom + padding,
  };
}

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function getSelectedObjectRect(frame) {
  const selected = frame?.querySelector?.('.stk-selected');
  return selected?.getBoundingClientRect?.() || null;
}

export default function useToolbarCollision({
  frameRef,
  toolbarRef,
  enabled = true,
  measureDelay = 120,
} = {}) {
  const [hasToolbarCollision, setHasToolbarCollision] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setHasToolbarCollision(false);
      return undefined;
    }

    let mounted = true;

    const measure = () => {
      if (!mounted) return;

      const selectedRect = getSelectedObjectRect(frameRef?.current);
      const toolbarRect = toolbarRef?.current?.getBoundingClientRect?.();

      if (!selectedRect || !toolbarRect || toolbarRect.width <= 0 || toolbarRect.height <= 0) {
        setHasToolbarCollision(false);
        return;
      }

      setHasToolbarCollision(rectsOverlap(
        inflateRect(selectedRect, COLLISION_PADDING),
        inflateRect(toolbarRect, COLLISION_PADDING)
      ));
    };

    measure();
    const intervalId = window.setInterval(measure, measureDelay);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
    };
  }, [enabled, frameRef, measureDelay, toolbarRef]);

  return {
    hasToolbarCollision,
  };
}
