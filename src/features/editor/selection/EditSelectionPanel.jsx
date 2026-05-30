import React, { useCallback, useEffect, useRef, useState } from 'react';
import Button from '../../../components/ui/Button.jsx';
import SolidIconButton from '../../../components/ui/SolidIconButton.jsx';
import SizeSliderRail from '../components/SizeSliderRail.jsx';
import { loadImage } from '../utils/canvas.js';
import { detectSmartSelectionMask } from '../utils/smartSelection.js';
import SelectionToolDock from './SelectionToolDock.jsx';
import useSelectionEngine from './useSelectionEngine.js';
import {
  buildCenterSmartPolygon,
  createEmptyMask,
  createFullMask,
  exportMaskedPng,
  maskIsUseful,
} from './selectionMask.js';

const MAX_SOURCE_EDGE = 960;

export default function EditSelectionPanel({
  visible,
  sourceSrc,
  initialSelection = 'empty',
  confirmLabel = 'Done',
  title = 'Edit image',
  logPrefix = 'edit-selection',
  onCancel,
  onConfirm,
}) {
  const previewRef = useRef(null);
  const engine = useSelectionEngine({ logPrefix });
  const [frameSize, setFrameSize] = useState(null);

  const canvasSize = engine.sourceSize || { width: 1, height: 1 };

  useEffect(() => {
    if (!visible || !engine.sourceSize || !previewRef.current) {
      setFrameSize(null);
      return undefined;
    }

    const preview = previewRef.current;
    const updateFrameSize = () => {
      const rect = preview.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const scale = Math.min(
        rect.width / engine.sourceSize.width,
        rect.height / engine.sourceSize.height
      );
      setFrameSize({
        width: Math.max(1, Math.round(engine.sourceSize.width * scale)),
        height: Math.max(1, Math.round(engine.sourceSize.height * scale)),
      });
    };

    updateFrameSize();
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateFrameSize)
      : null;
    observer?.observe(preview);
    window.addEventListener('resize', updateFrameSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateFrameSize);
    };
  }, [engine.sourceSize, visible]);

  useEffect(() => {
    if (!visible || !sourceSrc) return undefined;
    let cancelled = false;

    async function loadSource() {
      engine.reset();
      engine.setDetecting(true);

      try {
        const img = await loadImage(sourceSrc, 8000);
        if (cancelled) return;

        const naturalWidth = img.naturalWidth || img.width || 1;
        const naturalHeight = img.naturalHeight || img.height || 1;
        const scale = Math.min(1, MAX_SOURCE_EDGE / Math.max(naturalWidth, naturalHeight));
        const width = Math.max(1, Math.round(naturalWidth * scale));
        const height = Math.max(1, Math.round(naturalHeight * scale));

        requestAnimationFrame(async () => {
          if (cancelled) return;
          const canvases = [
            engine.sourceCanvasRef.current,
            engine.dimCanvasRef.current,
            engine.outlineCanvasRef.current,
            engine.inputCanvasRef.current,
          ];
          if (canvases.some(canvas => !canvas)) return;
          canvases.forEach((canvas) => {
            canvas.width = width;
            canvas.height = height;
          });

          const sourceCtx = engine.sourceCanvasRef.current.getContext('2d');
          sourceCtx.clearRect(0, 0, width, height);
          sourceCtx.drawImage(img, 0, 0, width, height);

          let initialMask = createEmptyMask(width, height);
          if (initialSelection === 'selectAll') {
            initialMask = createFullMask(width, height);
          }

          engine.initialize({ width, height, initialMask });

          if (initialSelection === 'smartSubject') {
            const detected = await detectSmartSelectionMask(
              engine.sourceCanvasRef.current,
              buildCenterSmartPolygon(width, height),
              { logPrefix: `${logPrefix}-initial` }
            );
            if (cancelled) return;
            if (maskIsUseful(detected, width * height, { allowFull: false })) {
              engine.commitMask(detected);
            } else {
              engine.renderSelection();
            }
          }
          engine.setDetecting(false);
        });
      } catch (error) {
        console.warn(`[${logPrefix}] Image load failed:`, error);
        if (!cancelled) engine.setDetecting(false);
      }
    }

    loadSource();
    return () => {
      cancelled = true;
      engine.clearInputCanvas();
    };
  }, [
    engine.clearInputCanvas,
    engine.commitMask,
    engine.dimCanvasRef,
    engine.initialize,
    engine.inputCanvasRef,
    engine.outlineCanvasRef,
    engine.renderSelection,
    engine.reset,
    engine.setDetecting,
    engine.sourceCanvasRef,
    initialSelection,
    logPrefix,
    sourceSrc,
    visible,
  ]);

  const handleConfirm = useCallback(() => {
    const sourceCanvas = engine.sourceCanvasRef.current;
    const mask = engine.maskRef.current;
    const sourceSize = engine.sourceSize;
    if (!sourceCanvas || !mask || !sourceSize || !engine.hasSelection) return;
    const exportResult = exportMaskedPng(sourceCanvas, mask, sourceSize.width, sourceSize.height);
    if (!exportResult) return;
    onConfirm?.({
      ...exportResult,
      mask,
      sourceCanvas,
      sourceWidth: sourceSize.width,
      sourceHeight: sourceSize.height,
    });
  }, [engine.hasSelection, engine.maskRef, engine.sourceCanvasRef, engine.sourceSize, onConfirm]);

  if (!visible || !sourceSrc) return null;

  return (
    <section className="edit-selection-screen sticker-editor-screen" aria-label={title}>
      <div className="edit-selection-backdrop sticker-editor-backdrop" aria-hidden="true" />

      <div className="edit-selection-drawer sticker-editor-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="edit-selection-grabber sticker-editor-grabber" aria-hidden="true" />

        <header className="edit-selection-header sticker-editor-header" aria-label="Edit mode controls">
          <div className="edit-selection-header-group sticker-editor-header-group sticker-editor-header-group--exit">
            <SolidIconButton
              className="edit-selection-close sticker-editor-close"
              icon="close"
              label="Close edit mode"
              onClick={onCancel}
            />
          </div>

          <div className="edit-selection-header-group sticker-editor-header-group sticker-editor-header-group--history">
            <div className="edit-selection-history sticker-editor-history" aria-label="Edit history">
              <SolidIconButton icon="undo" label="Undo edit" disabled={!engine.canUndo} onClick={engine.handleUndo} />
              <SolidIconButton icon="redo" label="Redo edit" disabled={!engine.canRedo} onClick={engine.handleRedo} />
            </div>
          </div>

          <div className="edit-selection-header-group sticker-editor-header-group sticker-editor-header-group--actions">
            <Button
              className="edit-selection-confirm-action sticker-editor-add-action"
              variant={null}
              material="light"
              shape="pill"
              disabled={!engine.hasSelection || engine.detecting}
              onClick={handleConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </header>

        <div className="edit-selection-preview sticker-editor-preview" aria-label="Image edit preview" ref={previewRef}>
          <SizeSliderRail
            active={engine.showBrushSlider}
            className="edit-selection-brush-rail sticker-editor-brush-rail"
            value={engine.brushRadius}
            min={engine.minBrushRadius}
            max={engine.maxBrushRadius}
            ariaLabel="Edit brush size"
            onChange={event => engine.setBrushRadius(Number(event.target.value))}
          />

          <div
            className="edit-selection-image-frame sticker-editor-image-frame"
            style={{
              aspectRatio: `${canvasSize.width} / ${canvasSize.height}`,
              width: frameSize ? `${frameSize.width}px` : undefined,
              height: frameSize ? `${frameSize.height}px` : undefined,
            }}
          >
            <img className="edit-selection-source-image sticker-editor-source-image" src={sourceSrc} alt="" draggable="false" />
            <canvas className="edit-selection-source-canvas sticker-editor-source-canvas" ref={engine.sourceCanvasRef} />
            <canvas className="edit-selection-dim-canvas sticker-editor-dim-canvas" ref={engine.dimCanvasRef} />
            <canvas className="edit-selection-outline-canvas sticker-editor-outline-canvas" ref={engine.outlineCanvasRef} />
            <canvas
              className="edit-selection-input-canvas sticker-editor-input-canvas"
              ref={engine.inputCanvasRef}
              onPointerDown={engine.handlePointerDown}
              onPointerMove={engine.handlePointerMove}
              onPointerUp={engine.finishPointerInteraction}
              onPointerCancel={engine.finishPointerInteraction}
            />
            {engine.detecting && <div className="edit-selection-detecting sticker-editor-detecting">Detecting...</div>}
          </div>
        </div>

        <SelectionToolDock engine={engine} />
      </div>
    </section>
  );
}
