import React from 'react';
import GlassIconButton from '../../../components/ui/GlassIconButton.jsx';
import ToolIcon from '../../../components/icons/ToolIcon.jsx';

const SWATCH_COLORS = [
  { color: '#FFFFFF', label: 'White' },
  { color: '#1A1A2E', label: 'Black' },
  { color: '#F0E84A', label: 'Yellow' },
  { color: '#FF3B30', label: 'Red' },
  { color: '#6A00FF', label: 'Purple' },
  { color: '#00C2A8', label: 'Teal' },
];

/**
 * DrawingToolOverlays — the shared tool-mode UI that appears when the user
 * is drawing on the canvas:
 *   • Undo / redo buttons
 *   • "Done" pill button
 *   • Left size-track panel
 *   • Pen bar (color swatches + pen type buttons)
 *
 * NOTE: The brush cursor SVG is NOT rendered here because it must live inside
 * the #frameContainer div in each page (absolute positioning is relative to it).
 * Render it directly in the page JSX:
 *   <svg id="brushCursor" ref={brushCursorRef}>
 *     <circle id="brushCursorCircle" ref={brushCursorCircleRef} ... />
 *   </svg>
 *
 * InviterPage renders extra eraser-specific UI after this component.
 */
export default function DrawingToolOverlays({
  tmLeftPanelRef,
  tmSizeHandleRef,
  tmIn,
  tmLeftIn,
  tmPenBarIn,
  doodleColor,
  penType,
  tmUndoBtnDisabled,
  tmRedoBtnDisabled,
  onDone,
  onUndo,
  onRedo,
  onSwatchClick,
  onPenTypeClick,
}) {
  return (
    <>
      {/* ── Undo / redo ── */}
      <div id="tmUndoRedo" className={`tool-mode-el${tmIn ? ' tm-in' : ''}`}>
        <GlassIconButton className="history-btn" id="tmBtnUndo" icon="undo" label="Undo"
          contained={false} disabled={tmUndoBtnDisabled} onClick={onUndo} />
        <GlassIconButton className="history-btn" id="tmBtnRedo" icon="redo" label="Redo"
          contained={false} disabled={tmRedoBtnDisabled} onClick={onRedo} />
      </div>

      {/* ── Done pill ── */}
      <button
        id="tmDoneBtn"
        className={`tool-mode-el${tmIn ? ' tm-in' : ''}`}
        aria-label="Done"
        onClick={onDone}
      >
        <ToolIcon type="check" />
      </button>

      {/* ── Left size-track panel ── */}
      <div id="tmLeftPanel" ref={tmLeftPanelRef} className={tmLeftIn ? 'tm-in' : ''}>
        <div id="tmTrackTop"></div>
        <div id="tmTrackBottom"></div>
        <div id="tmSizeHandle" ref={tmSizeHandleRef}></div>
      </div>

      {/* ── Pen bar (color swatches + pen type) ── */}
      <div id="tmPenBar" className={tmPenBarIn ? 'tm-in' : ''}>
        <div className="tm-swatches">
          {SWATCH_COLORS.map(({ color, label }) => (
            <button
              key={color}
              className={`tm-swatch${doodleColor === color ? ' active' : ''}`}
              data-color={color}
              style={{ background: color }}
              aria-label={label}
              onClick={() => onSwatchClick(color)}
            />
          ))}
        </div>
        <div className="tm-divider"></div>
        <div className="tm-pen-types">
          <button className={`pen-type-btn${penType === 'pen' ? ' active' : ''}`}
            data-pen="pen" title="Pen" onClick={() => onPenTypeClick('pen')}>
            <svg width="16" height="16" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="4" fill="white" />
            </svg>
          </button>
          <button className={`pen-type-btn${penType === 'pencil' ? ' active' : ''}`}
            data-pen="pencil" title="Pencil" onClick={() => onPenTypeClick('pencil')}>
            <svg width="16" height="16" viewBox="0 0 16 16">
              <rect x="6" y="1" width="4" height="10" rx="1.5" fill="white" />
              <polygon points="6,11 10,11 8,15" fill="white" />
            </svg>
          </button>
          <button className={`pen-type-btn${penType === 'marker' ? ' active' : ''}`}
            data-pen="marker" title="Marker" onClick={() => onPenTypeClick('marker')}>
            <svg width="16" height="16" viewBox="0 0 16 16">
              <rect x="1" y="6" width="14" height="4" rx="2" fill="white" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
