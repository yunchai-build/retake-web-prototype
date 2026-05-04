import React from 'react';
import Surface from './Surface.jsx';

export default function GlassSurface({ id, className = '', children, ...props }) {
  return (
    <Surface id={id} variant="glass" className={className} {...props}>
      {children}
    </Surface>
  );
}
