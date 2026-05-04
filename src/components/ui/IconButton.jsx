import React from 'react';
import ToolIcon from '../icons/ToolIcon.jsx';

const VARIANT_CLASS = {
  glass: 'glass-icon-button glass-control',
  plain: 'glass-icon-button',
  brand: 'brand-button',
};

const SIZE_CLASS = {
  default: '',
  circle: '',
};

export default function IconButton({
  icon,
  label,
  buttonRef,
  material,
  shape = 'circle',
  active = false,
  hidden = false,
  disabled = false,
  variant = 'glass',
  size = 'default',
  className = '',
  children,
  ...props
}) {
  const resolvedMaterial = material ?? (variant === 'plain' ? 'plain' : variant === 'brand' ? 'brand' : 'glass');
  const classes = [
    'control-icon',
    `control-icon--${resolvedMaterial}`,
    shape ? `control-icon--${shape}` : '',
    VARIANT_CLASS[variant] ?? VARIANT_CLASS.glass,
    SIZE_CLASS[size] ?? '',
    active ? 'active' : '',
    hidden ? 'btn-hidden' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      ref={buttonRef}
      aria-label={label}
      disabled={disabled}
      className={classes}
      {...props}
    >
      {icon ? <ToolIcon type={icon} /> : null}
      {children}
    </button>
  );
}
