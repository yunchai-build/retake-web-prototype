import React from 'react';
import GlassSurface from '../../../components/ui/GlassSurface.jsx';
import SolidIconButton from '../../../components/ui/SolidIconButton.jsx';

export default function UndoRedoCluster({ visible, out, undoDisabled, redoDisabled, onUndo, onRedo }) {
  return (
    <GlassSurface id="undoRedoCluster" className={`${visible ? 'visible' : ''}${out ? ' out' : ''}`}>
      <SolidIconButton className="history-btn" id="btnUndo" icon="undo" label="Undo"
        disabled={undoDisabled} onClick={onUndo} />
      <SolidIconButton className="history-btn" id="btnRedo" icon="redo" label="Redo"
        disabled={redoDisabled} onClick={onRedo} />
    </GlassSurface>
  );
}
