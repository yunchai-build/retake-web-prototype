import React from 'react';
import GlassSurface from '../../../components/ui/GlassSurface.jsx';
import SolidIconButton from '../../../components/ui/SolidIconButton.jsx';

export default function ExitButton({ visible, out, onClick }) {
  return (
    <GlassSurface className={`s6-exit-surface${visible ? ' visible' : ''}${out ? ' out' : ''}`}>
      <SolidIconButton
        className="s6-exit-btn"
        id="btnExit"
        icon="close"
        label="Back"
        onClick={onClick}
      />
    </GlassSurface>
  );
}
