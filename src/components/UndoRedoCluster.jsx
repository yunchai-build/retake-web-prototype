import React from 'react';
import GlassIconButton from './GlassIconButton.jsx';
import GlassSurface from './GlassSurface.jsx';

export default function UndoRedoCluster({ visible, out, undoDisabled, redoDisabled, onUndo, onRedo }) {
  return (
    <GlassSurface id="undoRedoCluster" className={`${visible ? 'visible' : ''}${out ? ' out' : ''}`}>
      <GlassIconButton className="history-btn" id="btnUndo" icon="undo" label="Undo"
        contained={false} disabled={undoDisabled} onClick={onUndo} />
      <GlassIconButton className="history-btn" id="btnRedo" icon="redo" label="Redo"
        contained={false} disabled={redoDisabled} onClick={onRedo} />
    </GlassSurface>
  );
}
