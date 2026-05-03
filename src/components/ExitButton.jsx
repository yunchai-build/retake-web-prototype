import React from 'react';
import GlassIconButton from './GlassIconButton.jsx';
import GlassSurface from './GlassSurface.jsx';

export default function ExitButton({ visible, out, onClick }) {
  return (
    <GlassSurface className={`s6-exit-surface${visible ? ' visible' : ''}${out ? ' out' : ''}`}>
      <GlassIconButton
        className="s6-exit-btn"
        id="btnExit"
        icon="close"
        label="Back"
        contained={false}
        onClick={onClick}
      />
    </GlassSurface>
  );
}
