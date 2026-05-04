import React from 'react';
import GlassIconButton from '../../../components/ui/GlassIconButton.jsx';

export default function ExitButton({ visible, out, onClick, label = 'Close' }) {
  return (
    <GlassIconButton
      className={`s6-exit-btn${visible ? ' visible' : ''}${out ? ' out' : ''}`}
      id="btnExit"
      icon="close"
      label={label}
      onClick={onClick}
    />
  );
}
