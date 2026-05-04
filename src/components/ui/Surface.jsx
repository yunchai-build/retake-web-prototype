import React from 'react';

const SURFACE_VARIANTS = {
  glass: 'glass-surface',
  solid: 'solid-surface',
  brand: 'brand-surface',
  plain: '',
};

export default function Surface({
  as: Component = 'div',
  variant = 'plain',
  className = '',
  children,
  ...props
}) {
  const classes = [
    SURFACE_VARIANTS[variant] ?? '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <Component className={classes} {...props}>
      {children}
    </Component>
  );
}
