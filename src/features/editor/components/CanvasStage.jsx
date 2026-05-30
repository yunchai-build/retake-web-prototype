import React, { useRef } from 'react';
import DotGridCanvas from './DotGridCanvas.jsx';

export default function CanvasStage({
  canvasRef,
  selectionCanvasRef,
  frameElRef,
  frameId = 'frameContainer',
  canvasId = 'editCanvas',
  selectionCanvasId = 'selectionCanvas',
  frameScrimId = 'frameScrim',
  frameClassName = '',
  canvasClassName = 'no-tool',
  frameStyle,
  canvasWidth = 414,
  canvasHeight = 736,
  showCheckerBg = true,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onPaste,
  frameScrimVisible,
  children,
}) {
  const pasteTargetRef = useRef(null);

  const handlePointerDown = (event) => {
    if (!event.target.closest?.('button, input, textarea, [contenteditable], .placed-sticker, .placed-text, .placed-photo')) {
      pasteTargetRef.current?.focus({ preventScroll: true });
    }
    onPointerDown?.(event);
  };

  const handlePaste = (event) => {
    if (!onPaste) return;
    event.stopPropagation();
    onPaste(event);
  };

  const handleBeforeInput = (event) => {
    if (!onPaste) return;
    event.preventDefault();
  };

  const clearPasteTarget = (event) => {
    event.currentTarget.textContent = '';
  };

  return (
    <>
      <div className="canvas-stage">
        <div
          id={frameId}
          ref={frameElRef}
          className={['retake-canvas-frame', frameClassName].filter(Boolean).join(' ')}
          style={frameStyle}
          tabIndex={0}
          aria-label="Retake canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          {onPaste && (
            <div
              ref={pasteTargetRef}
              className="canvas-paste-target"
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
              inputMode="none"
              tabIndex={-1}
              aria-hidden="true"
              onBeforeInput={handleBeforeInput}
              onInput={clearPasteTarget}
              onPaste={handlePaste}
            />
          )}
          {showCheckerBg && <DotGridCanvas />}
          {children}
          <canvas
            id={canvasId}
            ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
            className={['edit-canvas', canvasClassName].filter(Boolean).join(' ')}
          />
          {selectionCanvasRef && (
            <canvas
              id={selectionCanvasId}
              ref={selectionCanvasRef}
              width={canvasWidth}
              height={canvasHeight}
            />
          )}
        </div>
      </div>
      <div id={frameScrimId} className={`frame-scrim${frameScrimVisible ? ' visible' : ''}`}></div>
    </>
  );
}
