import { useCallback, useEffect, useRef, useState } from 'react';

export default function useActiveCanvasInteraction({ restoreDelay = 220 } = {}) {
  const [isInteractingWithCanvas, setIsInteractingWithCanvas] = useState(false);
  const restoreTimerRef = useRef(null);

  const startCanvasInteraction = useCallback(() => {
    clearTimeout(restoreTimerRef.current);
    setIsInteractingWithCanvas(true);
  }, []);

  const endCanvasInteraction = useCallback(() => {
    clearTimeout(restoreTimerRef.current);
    restoreTimerRef.current = setTimeout(() => {
      setIsInteractingWithCanvas(false);
    }, restoreDelay);
  }, [restoreDelay]);

  useEffect(() => () => {
    clearTimeout(restoreTimerRef.current);
  }, []);

  return {
    isInteractingWithCanvas,
    startCanvasInteraction,
    endCanvasInteraction,
  };
}
