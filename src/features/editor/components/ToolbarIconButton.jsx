import React from 'react';
import IconButton from '../../../components/ui/IconButton.jsx';

export default function ToolbarIconButton({
  className = '',
  icon,
  label,
  active = false,
  disabled = false,
  onClick,
}) {
  return (
    <IconButton
      className={['toolbar-icon-button', className].filter(Boolean).join(' ')}
      icon={icon}
      label={label}
      material="solid"
      variant="plain"
      shape="circle"
      active={active}
      disabled={disabled}
      onClick={onClick}
    />
  );
}
