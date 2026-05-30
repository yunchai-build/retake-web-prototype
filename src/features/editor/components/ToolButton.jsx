import React from 'react';
import IconButton from '../../../components/ui/IconButton.jsx';

export default function ToolButton({
  className = '',
  icon,
  label,
  disabled = false,
  onClick,
}) {
  return (
    <IconButton
      className={['tool-button', className].filter(Boolean).join(' ')}
      icon={icon}
      label={label}
      material="light"
      variant="plain"
      shape="square"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="tool-button__label">{label}</span>
    </IconButton>
  );
}
