import React from 'react';
import Surface from './Surface.jsx';

export default function Toolbar({
  visible = true,
  out = false,
  className = '',
  children,
  ...props
}) {
  const classes = [
    className,
    visible ? 'visible' : '',
    out ? 'out' : '',
  ].filter(Boolean).join(' ');

  return (
    <Surface variant="glass" className={classes} {...props}>
      {children}
    </Surface>
  );
}
