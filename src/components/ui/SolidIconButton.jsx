import React from 'react';
import IconButton from './IconButton.jsx';

export default function SolidIconButton({
  id,
  icon,
  label,
  className = '',
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
      icon={icon}
      label={label}
      buttonRef={buttonRef}
      material="solid"
      variant="plain"
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
