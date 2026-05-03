import React from 'react';

export default function GlassSurface({ id, className = '', children, ...props }) {
  const classes = ['glass-surface', className].filter(Boolean).join(' ');

  return (
    <div id={id} className={classes} {...props}>
      {children}
    </div>
  );
}
