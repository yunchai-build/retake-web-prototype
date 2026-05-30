import React, { forwardRef } from 'react';
import Surface from './Surface.jsx';

const GlassSurface = forwardRef(function GlassSurface({ id, className = '', children, ...props }, ref) {
  return (
    <Surface ref={ref} id={id} variant="glass" className={className} {...props}>
      {children}
    </Surface>
  );
});

export default GlassSurface;
