import React from 'react';

const VARIANT_CLASS = {
  primary: 'brand-button btn-primary',
  secondary: 'brand-button btn-secondary',
};

export default function Button({
  variant = 'primary',
  material,
  shape = 'pill',
  className = '',
  type = 'button',
  buttonRef,
  children,
  ...props
}) {
  const hasVariant = typeof variant === 'string' && variant.length > 0;
  const resolvedMaterial = material ?? (
    hasVariant && variant === 'danger' ? 'danger' : 'brand'
  );
  const variantClass = hasVariant ? VARIANT_CLASS[variant] : '';
  const classes = [
    'control-pill',
    `control-pill--${resolvedMaterial}`,
    shape ? `control-pill--${shape}` : '',
    variantClass,
    className,
  ].filter(Boolean).join(' ');

  return (
    <button type={type} ref={buttonRef} className={classes} {...props}>
      {children}
    </button>
  );
}
