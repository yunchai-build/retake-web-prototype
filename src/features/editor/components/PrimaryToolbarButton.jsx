import React from 'react';
import IconButton from '../../../components/ui/IconButton.jsx';

export default function PrimaryToolbarButton({
  className = '',
  icon,
  label,
  active = false,
  disabled = false,
  onClick,
}) {
  return (
    <IconButton
      className={['primary-toolbar-button', className].filter(Boolean).join(' ')}
      icon={icon}
      label={label}
      material="brand"
      variant="plain"
      shape="circle"
      active={active}
      disabled={disabled}
      onClick={onClick}
    />
  );
}
