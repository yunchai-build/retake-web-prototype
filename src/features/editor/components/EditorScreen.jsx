import React, { useEffect, useRef } from 'react';

export default function EditorScreen({ flowState, children }) {
  const screenRef = useRef(null);

  useEffect(() => {
    const screen = screenRef.current;
    if (!screen || typeof window === 'undefined') return undefined;

    const syncVisualViewport = () => {
      const visualViewport = window.visualViewport;
      const viewportHeight = visualViewport?.height || window.innerHeight;
      const viewportOffsetTop = visualViewport?.offsetTop || 0;

      screen.style.setProperty('--editor-visual-viewport-height', `${viewportHeight}px`);
      screen.style.setProperty('--editor-visual-viewport-offset-top', `${viewportOffsetTop}px`);
    };

    syncVisualViewport();

    window.visualViewport?.addEventListener('resize', syncVisualViewport);
    window.visualViewport?.addEventListener('scroll', syncVisualViewport);
    window.addEventListener('orientationchange', syncVisualViewport);
    window.addEventListener('resize', syncVisualViewport);

    return () => {
      window.visualViewport?.removeEventListener('resize', syncVisualViewport);
      window.visualViewport?.removeEventListener('scroll', syncVisualViewport);
      window.removeEventListener('orientationchange', syncVisualViewport);
      window.removeEventListener('resize', syncVisualViewport);
    };
  }, []);

  return (
    <div ref={screenRef} className="screen editor-screen" id="screen" data-flow-state={flowState}>
      {children}
    </div>
  );
}
