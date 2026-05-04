import React from 'react';
import SolidIconButton from '../../../components/ui/SolidIconButton.jsx';

export default function ToolbarToolButton({
  id,
  icon,
  label,
  active = false,
  hidden = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
}) {
  const className = [
    's6-tool-btn',
  ].filter(Boolean).join(' ');

  return (
    <SolidIconButton
      className={className}
      id={id}
      icon={icon}
      label={label}
      active={active}
      hidden={hidden}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span className="tool-label">{label}</span>
    </SolidIconButton>
  );
}
