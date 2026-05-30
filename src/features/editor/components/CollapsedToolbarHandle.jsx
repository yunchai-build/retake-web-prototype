import React from 'react';
import SolidIconButton from '../../../components/ui/SolidIconButton.jsx';

export default function CollapsedToolbarHandle({ onExpand }) {
  return (
    <SolidIconButton
      className="floating-toolbar-handle"
      icon="chevron"
      label="Show editor tools"
      onClick={onExpand}
    />
  );
}
