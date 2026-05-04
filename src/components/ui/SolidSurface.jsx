import React from 'react';
import Surface from './Surface.jsx';

export default function SolidSurface({ id, className = '', children, ...props }) {
  return (
    <Surface id={id} variant="solid" className={className} {...props}>
      {children}
    </Surface>
  );
}
