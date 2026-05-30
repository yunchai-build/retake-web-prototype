import React, { forwardRef } from 'react';

const SURFACE_VARIANTS = {
  glass: 'glass-surface',
  solid: 'solid-surface',
  brand: 'brand-surface',
  plain: '',
};

const Surface = forwardRef(function Surface({
  as: Component = 'div',
  variant = 'plain',
  className = '',
  children,
  ...props
}, ref) {
  const classes = [
    SURFACE_VARIANTS[variant] ?? '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <Component ref={ref} className={classes} {...props}>
      {children}
    </Component>
  );
});

export default Surface;
