import React from 'react';
import IconButton from './IconButton.jsx';

export default function GlassIconButton({
  id,
  icon,
  label,
  className = '',
  contained = true,
  shape = 'circle',
  active = false,
  hidden = false,
  disabled = false,
  buttonRef,
  children,
  onClick,
  onMouseEnter,
  onMouseLeave,
}) {
  return (
    <IconButton
      className={className}
      id={id}
      aria-label={label}
      icon={icon}
      label={label}
      buttonRef={buttonRef}
      material={contained ? 'glass' : 'plain'}
      variant={contained ? 'glass' : 'plain'}
      shape={shape}
      active={active}
      hidden={hidden}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </IconButton>
  );
}
