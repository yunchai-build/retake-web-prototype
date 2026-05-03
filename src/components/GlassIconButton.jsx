import React from 'react';
import ToolIcon from './ToolIcon.jsx';

export default function GlassIconButton({
  id,
  icon,
  label,
  className = '',
  contained = true,
  active = false,
  hidden = false,
  disabled = false,
  children,
  onClick,
  onMouseEnter,
  onMouseLeave,
}) {
  const classes = [
    'glass-icon-button',
    contained ? 'glass-control' : '',
    className,
    active ? 'active' : '',
    hidden ? 'btn-hidden' : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={classes}
      id={id}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {icon ? <ToolIcon type={icon} /> : null}
      {children}
    </button>
  );
}
