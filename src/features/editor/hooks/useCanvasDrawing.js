import { useCallback, useEffect, useRef } from 'react';

export function useCanvasDrawing({
  canvasRef,
  ctxRef,
  activeToolRef,
  toolRadiusRef,
  eraserOpacityRef,
  eraserModeRef,
  doodleColorRef,
  penTypeRef,
  frameElRef,
  brushCursorRef,
  tmLeftPanelRef,
  stickerSys,
  magic,
  pushHistory,
  syncHistoryBtns,
  setHandlePos,
  syncCursor,
  expandLeftPanel,
  applyTrackNorm,
  normFromClientY,
  onInitialIntro,
}) {
  const scratchCanvasRef = useRef(null);
  const scratchCtxRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastXRef = useRef(0);
  const lastYRef = useRef(0);
  const shapeDraggingRef = useRef(false);
  const shapeStartXRef = useRef(0);
  const shapeStartYRef = useRef(0);
  const shapePreviewDataRef = useRef(null);
  const strokeBaseDataRef = useRef(null);
  const trackDraggingRef = useRef(false);

  const getXY = useCallback((e) => {
    const canvas = canvasRef.current;
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return {
      x: (t.clientX - r.left) * (canvas.width / r.width),
      y: (t.clientY - r.top) * (canvas.height / r.height),
    };
  }, [canvasRef]);

  const getXYFromClient = useCallback((cx, cy) => {
    const canvas = canvasRef.current;
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvas.width, (cx - r.left) * (canvas.width / r.width))),
      y: Math.max(0, Math.min(canvas.height, (cy - r.top) * (canvas.height / r.height))),
    };
  }, [canvasRef]);

  const paintAt = useCallback((x, y, fx, fy) => {
    const ctx = ctxRef.current;
    const scratchCtx = scratchCtxRef.current;
    const scratchCanvas = scratchCanvasRef.current;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(x, y);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (activeToolRef.current === 'eraser') {
      scratchCtx.save();
      scratchCtx.beginPath(); scratchCtx.moveTo(fx, fy); scratchCtx.lineTo(x, y);
      scratchCtx.lineCap = 'round'; scratchCtx.lineJoin = 'round';
      scratchCtx.globalCompositeOperation = 'source-over';
      scratchCtx.globalAlpha = 1;
      scratchCtx.strokeStyle = 'rgba(0,0,0,1)';
      scratchCtx.lineWidth = toolRadiusRef.current * 2;
      scratchCtx.stroke();
      scratchCtx.restore();
      if (strokeBaseDataRef.current) ctx.putImageData(strokeBaseDataRef.current, 0, 0);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = eraserOpacityRef.current;
      ctx.drawImage(scratchCanvas, 0, 0);
    } else if (penTypeRef.current === 'pencil') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = doodleColorRef.current;
      ctx.lineWidth = Math.max(1, toolRadiusRef.current * 0.8);
      ctx.globalAlpha = 0.55; ctx.stroke();
      ctx.lineWidth = toolRadiusRef.current * 1.6; ctx.globalAlpha = 0.08; ctx.stroke();
    } else if (penTypeRef.current === 'marker') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = doodleColorRef.current;
      ctx.lineWidth = toolRadiusRef.current * 3.5;
      ctx.lineCap = 'square'; ctx.lineJoin = 'miter';
      ctx.globalAlpha = 0.38; ctx.stroke();
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.strokeStyle = doodleColorRef.current;
      const n = (toolRadiusRef.current - 4) / 56;
      ctx.lineWidth = Math.max(1, 1 - 11 * n + 58 * n * n);
      ctx.stroke();
    }
    ctx.restore();
  }, [activeToolRef, ctxRef, doodleColorRef, eraserOpacityRef, penTypeRef, toolRadiusRef]);

  const drawShapePreview = useCallback((x1, y1, x2, y2) => {
    const ctx = ctxRef.current;
    if (!shapePreviewDataRef.current) return;
    ctx.putImageData(shapePreviewDataRef.current, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.38;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    if (eraserModeRef.current === 'circle') {
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      const rx = Math.max(1, Math.abs(x2 - x1) / 2), ry = Math.max(1, Math.abs(y2 - y1) / 2);
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
    } else {
      const x = Math.min(x1, x2), y = Math.min(y1, y2);
      ctx.fillRect(x, y, Math.abs(x2 - x1), Math.abs(y2 - y1));
      ctx.globalAlpha = 1; ctx.strokeRect(x, y, Math.abs(x2 - x1), Math.abs(y2 - y1));
    }
    ctx.restore();
  }, [ctxRef, eraserModeRef]);

  const commitShape = useCallback((x1, y1, x2, y2) => {
    const ctx = ctxRef.current;
    if (shapePreviewDataRef.current) ctx.putImageData(shapePreviewDataRef.current, 0, 0);
    shapePreviewDataRef.current = null;
    const minSize = 4;
    if (Math.abs(x2 - x1) < minSize && Math.abs(y2 - y1) < minSize) return;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = eraserOpacityRef.current;
    if (eraserModeRef.current === 'circle') {
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      const rx = Math.max(1, Math.abs(x2 - x1) / 2), ry = Math.max(1, Math.abs(y2 - y1) / 2);
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      const x = Math.min(x1, x2), y = Math.min(y1, y2);
      ctx.fillRect(x, y, Math.abs(x2 - x1), Math.abs(y2 - y1));
    }
    ctx.restore();
  }, [ctxRef, eraserModeRef, eraserOpacityRef]);

  const moveCursor = useCallback((cx, cy) => {
    const r = frameElRef.current.getBoundingClientRect();
    const el = brushCursorRef.current;
    if (!el) return;
    el.style.left = (cx - r.left) + 'px';
    el.style.top = (cy - r.top) + 'px';
  }, [brushCursorRef, frameElRef]);

  const resetInteractionState = useCallback(() => {
    if (shapeDraggingRef.current && shapePreviewDataRef.current) {
      ctxRef.current.putImageData(shapePreviewDataRef.current, 0, 0);
    }
    shapeDraggingRef.current = false;
    shapePreviewDataRef.current = null;
    strokeBaseDataRef.current = null;
    if (scratchCtxRef.current && scratchCanvasRef.current) {
      scratchCtxRef.current.clearRect(0, 0, scratchCanvasRef.current.width, scratchCanvasRef.current.height);
    }
  }, [ctxRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctxRef.current = ctx;

    const sc = document.createElement('canvas');
    sc.width = canvas.width; sc.height = canvas.height;
    scratchCanvasRef.current = sc;
    scratchCtxRef.current = sc.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    syncHistoryBtns();
    setHandlePos(0.5);
    syncCursor();

    const onMouseDown = (e) => {
      if (!activeToolRef.current) return;
      const p = getXY(e);
      if (activeToolRef.current === 'eraser' && eraserModeRef.current === 'magic') {
        if (magic.phaseRef.current === 'lasso') {
          magic.lassoRef.current = [{ x: p.x, y: p.y }];
          magic.drawingRef.current = true;
          magic.setConfirmDisabled(true);
          magic.renderLasso();
        } else if (magic.phaseRef.current === 'refine') {
          magic.refiningRef.current = true;
          magic.paintRefine(p.x, p.y);
        }
      } else if (activeToolRef.current === 'eraser' && eraserModeRef.current !== 'freehand') {
        shapeDraggingRef.current = true;
        shapeStartXRef.current = p.x; shapeStartYRef.current = p.y;
        shapePreviewDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      } else {
        isDrawingRef.current = true; lastXRef.current = p.x; lastYRef.current = p.y;
        if (activeToolRef.current === 'eraser') {
          strokeBaseDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
          scratchCtxRef.current.clearRect(0, 0, sc.width, sc.height);
        }
        paintAt(p.x, p.y, p.x, p.y);
      }
    };
    const onMouseMove = (e) => {
      if (!activeToolRef.current) return;
      moveCursor(e.clientX, e.clientY);
      if (activeToolRef.current === 'eraser' && eraserModeRef.current === 'magic') {
        const p = getXYFromClient(e.clientX, e.clientY);
        if (magic.phaseRef.current === 'lasso' && magic.drawingRef.current) {
          magic.lassoRef.current.push({ x: p.x, y: p.y });
          if (magic.lassoRef.current.length >= 10) magic.setConfirmDisabled(false);
          magic.renderLasso();
        } else if (magic.phaseRef.current === 'refine' && magic.refiningRef.current) {
          magic.paintRefine(p.x, p.y);
        }
      } else if (shapeDraggingRef.current) {
        const p = getXYFromClient(e.clientX, e.clientY);
        drawShapePreview(shapeStartXRef.current, shapeStartYRef.current, p.x, p.y);
      } else if (isDrawingRef.current) {
        const p = getXY(e);
        paintAt(p.x, p.y, lastXRef.current, lastYRef.current);
        lastXRef.current = p.x; lastYRef.current = p.y;
      }
    };
    const onMouseUp = (e) => {
      if (activeToolRef.current === 'eraser' && eraserModeRef.current === 'magic') {
        if (magic.phaseRef.current === 'lasso' && magic.drawingRef.current) {
          magic.drawingRef.current = false;
          magic.renderLasso(true);
          if (magic.lassoRef.current.length < 10) {
            magic.lassoRef.current = [];
            magic.setConfirmDisabled(true);
            magic.clearOverlay();
          }
        } else if (magic.phaseRef.current === 'refine' && magic.refiningRef.current) {
          magic.refiningRef.current = false;
          magic.pushMaskHistory();
        }
      } else if (shapeDraggingRef.current) {
        const p = getXYFromClient(e.clientX, e.clientY);
        commitShape(shapeStartXRef.current, shapeStartYRef.current, p.x, p.y);
        shapeDraggingRef.current = false; pushHistory();
      } else if (isDrawingRef.current) {
        strokeBaseDataRef.current = null; pushHistory(); isDrawingRef.current = false;
      }
    };
    const onMouseLeave = () => {
      if (isDrawingRef.current) {
        strokeBaseDataRef.current = null; pushHistory(); isDrawingRef.current = false;
      }
      if (brushCursorRef.current) brushCursorRef.current.style.display = 'none';
    };
    const onMouseEnter = () => {
      if (
        activeToolRef.current
        && (eraserModeRef.current === 'freehand' || (eraserModeRef.current === 'magic' && magic.phaseRef.current === 'refine'))
        && brushCursorRef.current
      ) {
        brushCursorRef.current.style.display = 'block';
      }
    };
    const onTouchStart = (e) => {
      if (!activeToolRef.current) return; e.preventDefault();
      const p = getXY(e);
      if (activeToolRef.current === 'eraser' && eraserModeRef.current === 'magic') {
        if (magic.phaseRef.current === 'lasso') {
          magic.lassoRef.current = [{ x: p.x, y: p.y }];
          magic.drawingRef.current = true;
          magic.setConfirmDisabled(true);
          magic.renderLasso();
        } else if (magic.phaseRef.current === 'refine') {
          magic.refiningRef.current = true;
          magic.paintRefine(p.x, p.y);
        }
      } else if (activeToolRef.current === 'eraser' && eraserModeRef.current !== 'freehand') {
        shapeDraggingRef.current = true;
        shapeStartXRef.current = p.x; shapeStartYRef.current = p.y;
        shapePreviewDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      } else {
        isDrawingRef.current = true; lastXRef.current = p.x; lastYRef.current = p.y;
        if (activeToolRef.current === 'eraser') {
          strokeBaseDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
          scratchCtxRef.current.clearRect(0, 0, sc.width, sc.height);
        }
        paintAt(p.x, p.y, p.x, p.y);
      }
    };
    const onTouchMove = (e) => {
      if (!activeToolRef.current) return; e.preventDefault();
      if (activeToolRef.current === 'eraser' && eraserModeRef.current === 'magic') {
        const p = getXY(e);
        if (magic.phaseRef.current === 'lasso' && magic.drawingRef.current) {
          magic.lassoRef.current.push({ x: p.x, y: p.y });
          if (magic.lassoRef.current.length >= 10) magic.setConfirmDisabled(false);
          magic.renderLasso();
        } else if (magic.phaseRef.current === 'refine' && magic.refiningRef.current) {
          magic.paintRefine(p.x, p.y);
        }
      } else if (shapeDraggingRef.current) {
        const t = e.touches[0], r = canvas.getBoundingClientRect();
        drawShapePreview(shapeStartXRef.current, shapeStartYRef.current,
          Math.max(0, Math.min(canvas.width, (t.clientX - r.left) * (canvas.width / r.width))),
          Math.max(0, Math.min(canvas.height, (t.clientY - r.top) * (canvas.height / r.height))));
      } else if (isDrawingRef.current) {
        const p = getXY(e);
        paintAt(p.x, p.y, lastXRef.current, lastYRef.current);
        lastXRef.current = p.x; lastYRef.current = p.y;
      }
    };
    const onTouchEnd = (e) => {
      if (activeToolRef.current === 'eraser' && eraserModeRef.current === 'magic') {
        if (magic.phaseRef.current === 'lasso' && magic.drawingRef.current) {
          magic.drawingRef.current = false;
          magic.renderLasso(true);
          if (magic.lassoRef.current.length < 10) {
            magic.lassoRef.current = [];
            magic.setConfirmDisabled(true);
            magic.clearOverlay();
          }
        } else if (magic.phaseRef.current === 'refine' && magic.refiningRef.current) {
          magic.refiningRef.current = false;
          magic.pushMaskHistory();
        }
      } else if (shapeDraggingRef.current) {
        const t = e.changedTouches[0], r = canvas.getBoundingClientRect();
        commitShape(shapeStartXRef.current, shapeStartYRef.current,
          Math.max(0, Math.min(canvas.width, (t.clientX - r.left) * (canvas.width / r.width))),
          Math.max(0, Math.min(canvas.height, (t.clientY - r.top) * (canvas.height / r.height))));
        shapeDraggingRef.current = false; pushHistory();
      } else if (isDrawingRef.current) {
        strokeBaseDataRef.current = null; pushHistory(); isDrawingRef.current = false;
      }
    };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);
    canvas.addEventListener('mouseenter', onMouseEnter);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);

    const onDocMouseUp = (e) => {
      if (activeToolRef.current === 'eraser' && eraserModeRef.current === 'magic') {
        onMouseUp(e);
        return;
      }
      if (!shapeDraggingRef.current) return;
      const p = getXYFromClient(e.clientX, e.clientY);
      commitShape(shapeStartXRef.current, shapeStartYRef.current, p.x, p.y);
      shapeDraggingRef.current = false; pushHistory();
    };
    const onDocMouseMove = (e) => {
      if (activeToolRef.current === 'eraser' && eraserModeRef.current === 'magic' && (magic.drawingRef.current || magic.refiningRef.current)) {
        onMouseMove(e);
        return;
      }
      if (!shapeDraggingRef.current) return;
      const p = getXYFromClient(e.clientX, e.clientY);
      drawShapePreview(shapeStartXRef.current, shapeStartYRef.current, p.x, p.y);
    };
    document.addEventListener('mouseup', onDocMouseUp);
    document.addEventListener('mousemove', onDocMouseMove);

    const panel = tmLeftPanelRef.current;
    const onPanelMouseEnter = () => expandLeftPanel();
    const startTrackDrag = () => {
      trackDraggingRef.current = true;
      panel?.classList.add('tm-resizing');
      expandLeftPanel();
    };
    const endTrackDrag = () => {
      trackDraggingRef.current = false;
      panel?.classList.remove('tm-resizing');
      expandLeftPanel();
    };
    const onPanelMouseDown = (e) => { startTrackDrag(); applyTrackNorm(normFromClientY(e.clientY)); };
    const onDocTrackMouseMove = (e) => { if (trackDraggingRef.current) applyTrackNorm(normFromClientY(e.clientY)); };
    const onDocTrackMouseUp = () => { if (trackDraggingRef.current) endTrackDrag(); };
    const onPanelTouchStart = (e) => { startTrackDrag(); applyTrackNorm(normFromClientY(e.touches[0].clientY)); };
    const onDocTouchMove = (e) => { if (trackDraggingRef.current) applyTrackNorm(normFromClientY(e.touches[0].clientY)); };
    const onDocTouchEnd = () => { if (trackDraggingRef.current) endTrackDrag(); };

    if (panel) {
      panel.addEventListener('mouseenter', onPanelMouseEnter);
      panel.addEventListener('mousedown', onPanelMouseDown);
      panel.addEventListener('touchstart', onPanelTouchStart, { passive: true });
    }
    document.addEventListener('mousemove', onDocTrackMouseMove);
    document.addEventListener('mouseup', onDocTrackMouseUp);
    document.addEventListener('touchmove', onDocTouchMove, { passive: true });
    document.addEventListener('touchend', onDocTouchEnd, { passive: true });

    const overlay = stickerSys.stickerOverlayRef.current;
    if (overlay) overlay.addEventListener('click', stickerSys.deselectAllStickers);

    onInitialIntro();

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      canvas.removeEventListener('mouseenter', onMouseEnter);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('mouseup', onDocMouseUp);
      document.removeEventListener('mousemove', onDocMouseMove);
      if (panel) {
        panel.removeEventListener('mouseenter', onPanelMouseEnter);
        panel.removeEventListener('mousedown', onPanelMouseDown);
        panel.removeEventListener('touchstart', onPanelTouchStart);
      }
      document.removeEventListener('mousemove', onDocTrackMouseMove);
      document.removeEventListener('mouseup', onDocTrackMouseUp);
      document.removeEventListener('touchmove', onDocTouchMove);
      document.removeEventListener('touchend', onDocTouchEnd);
      if (overlay) overlay.removeEventListener('click', stickerSys.deselectAllStickers);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { resetInteractionState };
}
