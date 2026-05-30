import React, { forwardRef, useRef } from 'react';
import GlassSurface from '../../../components/ui/GlassSurface.jsx';

const SWIPE_COLLAPSE_DISTANCE = 18;

const FloatingToolbar = forwardRef(function FloatingToolbar({
  className = '',
  mode = 'expanded',
  onCollapse,
  children,
}, ref) {
  const swipeStartRef = useRef(null);

  const handlePointerDown = (event) => {
    swipeStartRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
  };

  const handlePointerUp = (event) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;

    const deltaY = event.clientY - start.y;
    const deltaX = Math.abs(event.clientX - start.x);
    if (deltaY > SWIPE_COLLAPSE_DISTANCE && deltaY > deltaX) {
      onCollapse?.();
    }
  };

  return (
    <GlassSurface
      className={['floating-toolbar', `floating-toolbar--${mode}`, className].filter(Boolean).join(' ')}
      ref={ref}
      role="presentation"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { swipeStartRef.current = null; }}
    >
      {children}
    </GlassSurface>
  );
});

export default FloatingToolbar;
