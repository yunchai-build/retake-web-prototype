import React from 'react';
import SolidIconButton from '../../../components/ui/SolidIconButton.jsx';

export default function ToolbarToolButton({
  id,
  toolId,
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
    toolId ? `s6-tool-btn--${toolId}` : '',
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
