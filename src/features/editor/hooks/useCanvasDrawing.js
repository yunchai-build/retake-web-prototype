import { useCallback, useEffect, useRef, useState } from 'react';
import { drawCheckerboardMasked } from './useInviterLayerStack.js';
import { drawMagicSelectionStroke, MAGIC_SELECTION_DASH_CYCLE } from '../utils/canvas.js';
import { detectSmartSelectionMask } from '../utils/smartSelection.js';

const DOODLE_FILL_LONG_PRESS_MS = 450;
const DOODLE_FILL_MOVE_TOLERANCE = 8;
const FLOOD_FILL_TOLERANCE = 28;

function clamp01(value, fallback = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function getDoodleOpacity(doodleOpacityRef) {
  const raw = doodleOpacityRef?.current;
  const number = Number(raw);
  if (!Number.isFinite(number)) return 1;
  return clamp01(number > 1 ? number / 100 : number);
}

function getMagicPenOpacity(magicPenOpacityRef) {
  const raw = magicPenOpacityRef?.current;
  const number = Number(raw);
  if (!Number.isFinite(number)) return 1;
  return clamp01(number > 1 ? number / 100 : number);
}

function colorToRgba(color, opacity = 1) {
  if (typeof color !== 'string') return [255, 255, 255, 255];
  const alphaScale = clamp01(opacity);
  const value = color.trim();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let raw = hex[1];
    if (raw.length === 3) raw = raw.split('').map(ch => ch + ch).join('');
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    const a = raw.length === 8 ? parseInt(raw.slice(6, 8), 16) : 255;
    return [r, g, b, Math.round(a * alphaScale)];
  }
  const rgb = value.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(',').map(part => part.trim());
    const alpha = parts[3] === undefined ? 1 : Number(parts[3]);
    return [
      Math.max(0, Math.min(255, Number(parts[0]) || 0)),
      Math.max(0, Math.min(255, Number(parts[1]) || 0)),
      Math.max(0, Math.min(255, Number(parts[2]) || 0)),
      Math.round(Math.max(0, Math.min(1, alpha)) * 255 * alphaScale),
    ];
  }
  return [255, 255, 255, Math.round(255 * alphaScale)];
}

function colorsMatch(data, index, target, tolerance) {
  return (
    Math.abs(data[index] - target[0]) <= tolerance
    && Math.abs(data[index + 1] - target[1]) <= tolerance
    && Math.abs(data[index + 2] - target[2]) <= tolerance
    && Math.abs(data[index + 3] - target[3]) <= tolerance
  );
}

function blendSourceOver(data, index, source) {
  const srcA = source[3] / 255;
  const dstA = data[index + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) {
    data[index] = 0;
    data[index + 1] = 0;
    data[index + 2] = 0;
    data[index + 3] = 0;
    return;
  }
  data[index] = Math.round((source[0] * srcA + data[index] * dstA * (1 - srcA)) / outA);
  data[index + 1] = Math.round((source[1] * srcA + data[index + 1] * dstA * (1 - srcA)) / outA);
  data[index + 2] = Math.round((source[2] * srcA + data[index + 2] * dstA * (1 - srcA)) / outA);
  data[index + 3] = Math.round(outA * 255);
}

function floodFill(ctx, startX, startY, fillColor, fillOpacity = 1) {
  const { width, height } = ctx.canvas;
  const x = Math.max(0, Math.min(width - 1, Math.round(startX)));
  const y = Math.max(0, Math.min(height - 1, Math.round(startY)));
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const startIndex = (y * width + x) * 4;
  const target = [
    data[startIndex],
    data[startIndex + 1],
    data[startIndex + 2],
    data[startIndex + 3],
  ];
  const replacement = colorToRgba(fillColor, fillOpacity);
  if (replacement[3] <= 0) return false;
  if (replacement[3] === 255 && colorsMatch(replacement, 0, target, 3)) return false;

  const queue = new Uint32Array(width * height);
  const visited = new Uint8Array(width * height);
  let head = 0;
  let tail = 0;
  queue[tail++] = y * width + x;
  visited[y * width + x] = 1;
  let changed = false;

  while (head < tail) {
    const pos = queue[head++];
    const px = pos % width;
    const py = Math.floor(pos / width);
    const index = pos * 4;
    if (!colorsMatch(data, index, target, FLOOD_FILL_TOLERANCE)) continue;

    blendSourceOver(data, index, replacement);
    changed = true;

    if (px > 0 && !visited[pos - 1]) {
      visited[pos - 1] = 1;
      queue[tail++] = pos - 1;
    }
    if (px < width - 1 && !visited[pos + 1]) {
      visited[pos + 1] = 1;
      queue[tail++] = pos + 1;
    }
    if (py > 0 && !visited[pos - width]) {
      visited[pos - width] = 1;
      queue[tail++] = pos - width;
    }
    if (py < height - 1 && !visited[pos + width]) {
      visited[pos + width] = 1;
      queue[tail++] = pos + width;
    }
  }

  if (changed) ctx.putImageData(imageData, 0, 0);
  return changed;
}

function drawMaskToCanvas(mask, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    data[i * 4] = 0;
    data[i * 4 + 1] = 0;
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function useCanvasDrawing({
  canvasRef,
  ctxRef,
  selectionCanvasRef,
  activeToolRef,
  toolRadiusRef,
  eraserOpacityRef,
  magicPenModeRef,
  magicPenOpacityRef,
  doodleColorRef,
  doodleOpacityRef,
  doodleModeRef,
  penTypeRef,
  frameElRef,
  brushCursorRef,
  tmLeftPanelRef,
  stickerSys,
  pushHistory,
  syncHistoryBtns,
  setHandlePos,
  syncCursor,
  expandLeftPanel,
  applyTrackNorm,
  normFromClientY,
  showToast,
  getMagicSelectionSourceCanvas,
  enabled = true,
  onInitialIntro,
  onCommitStroke,
  onCommitCanvasFill,
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
  const fillLongPressTimerRef = useRef(null);
  const fillPressRef = useRef(null);
  const magicLassoPtsRef = useRef([]);
  const magicLassoDownRef = useRef(false);
  const magicLassoRafRef = useRef(null);
  const magicLassoDashRef = useRef(0);
  const magicMaskRef = useRef(null);
  const magicMaskUndoStackRef = useRef([]);
  const magicMaskRedoStackRef = useRef([]);
  const magicRefineStartMaskRef = useRef(null);
  const magicRefineDownRef = useRef(false);
  const magicRefModeRef = useRef('pen');
  const magicSelectPhaseRef = useRef('lasso');
  const [magicSelectPhase, setMagicSelectPhase] = useState('lasso');
  const [magicSelectConfirmDisabled, setMagicSelectConfirmDisabled] = useState(true);
  const [magicSelectDetecting, setMagicSelectDetecting] = useState(false);
  const [magicSelectRefMode, setMagicSelectRefMode] = useState('pen');
  const [magicUndoDisabled, setMagicUndoDisabled] = useState(true);
  const [magicRedoDisabled, setMagicRedoDisabled] = useState(true);

  const setMagicSelectionPhase = useCallback((phase) => {
    magicSelectPhaseRef.current = phase;
    setMagicSelectPhase(phase);
  }, []);

  const syncMagicHistoryButtons = useCallback(() => {
    setMagicUndoDisabled(magicMaskUndoStackRef.current.length <= 1);
    setMagicRedoDisabled(magicMaskRedoStackRef.current.length === 0);
  }, []);

  const resetMagicMaskHistory = useCallback((mask = null) => {
    magicMaskUndoStackRef.current = mask ? [mask.slice()] : [];
    magicMaskRedoStackRef.current = [];
    magicRefineStartMaskRef.current = null;
    syncMagicHistoryButtons();
  }, [syncMagicHistoryButtons]);

  const masksEqual = useCallback((a, b) => {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }, []);

  const commitMagicMaskHistory = useCallback(() => {
    const mask = magicMaskRef.current;
    const startMask = magicRefineStartMaskRef.current;
    magicRefineStartMaskRef.current = null;
    if (!mask || !startMask || masksEqual(mask, startMask)) return;
    if (magicMaskUndoStackRef.current.length >= 30) magicMaskUndoStackRef.current.shift();
    magicMaskUndoStackRef.current.push(mask.slice());
    magicMaskRedoStackRef.current = [];
    syncMagicHistoryButtons();
  }, [masksEqual, syncMagicHistoryButtons]);

  const getXY = useCallback((e) => {
    const canvas = canvasRef.current;
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return {
      x: (t.clientX - r.left) * (canvas.width / r.width),
      y: (t.clientY - r.top) * (canvas.height / r.height),
    };
  }, [canvasRef]);

  const getXYFromClient = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvas.width, (clientX - r.left) * (canvas.width / r.width))),
      y: Math.max(0, Math.min(canvas.height, (clientY - r.top) * (canvas.height / r.height))),
    };
  }, [canvasRef]);

  const isDoodleEraseMode = useCallback(() => (
    activeToolRef.current === 'doodle' && doodleModeRef?.current === 'erase'
  ), [activeToolRef, doodleModeRef]);

  const isFreehandEraseMode = useCallback(() => (
    (activeToolRef.current === 'magicPen' && (magicPenModeRef?.current || 'freehand') === 'freehand')
    || isDoodleEraseMode()
  ), [activeToolRef, isDoodleEraseMode, magicPenModeRef]);

  const clearActiveCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (scratchCtxRef.current && scratchCanvasRef.current) {
      scratchCtxRef.current.clearRect(0, 0, scratchCanvasRef.current.width, scratchCanvasRef.current.height);
    }
  }, [canvasRef, ctxRef]);

  const clearMagicSelectionOverlay = useCallback(() => {
    const sel = selectionCanvasRef?.current;
    if (!sel) return;
    const selCtx = sel.getContext('2d');
    selCtx.clearRect(0, 0, sel.width, sel.height);
    sel.classList.remove('sel-active');
    sel.style.opacity = '1';
  }, [selectionCanvasRef]);

  const renderMagicLasso = useCallback((closed = false) => {
    const sel = selectionCanvasRef?.current;
    const pts = magicLassoPtsRef.current;
    if (!sel) return;
    const selCtx = sel.getContext('2d');
    selCtx.clearRect(0, 0, sel.width, sel.height);
    if (pts.length < 2) {
      sel.classList.remove('sel-active');
      return;
    }
    sel.classList.add('sel-active');
    // Tie the boundary preview's CSS opacity to the magic-pen strength slider
    // so the slider has *immediate* visible feedback during the lasso stage
    // (otherwise users see no effect until apply time and assume the bar is
    // broken). Floor at 0.55 so the boundary is always visible enough to
    // continue drawing.
    const strengthNorm = Math.max(5, Math.min(100, magicPenOpacityRef?.current ?? 100)) / 100;
    sel.style.opacity = String(Math.max(0.55, strengthNorm));
    drawMagicSelectionStroke(selCtx, {
      points: pts,
      closed,
      dashOffset: magicLassoDashRef.current,
    });
  }, [magicPenOpacityRef, selectionCanvasRef]);

  const animateMagicLasso = useCallback(() => {
    renderMagicLasso(!magicLassoDownRef.current);
    magicLassoDashRef.current = (magicLassoDashRef.current + 0.5) % MAGIC_SELECTION_DASH_CYCLE;
    magicLassoRafRef.current = requestAnimationFrame(animateMagicLasso);
  }, [renderMagicLasso]);

  const renderMagicMask = useCallback((mask = magicMaskRef.current) => {
    const sel = selectionCanvasRef?.current;
    if (!sel || !mask) return;
    const selCtx = sel.getContext('2d');
    const maskCanvas = drawMaskToCanvas(mask, sel.width, sel.height);
    selCtx.clearRect(0, 0, sel.width, sel.height);
    drawCheckerboardMasked(selCtx, maskCanvas, getMagicPenOpacity(magicPenOpacityRef), {
      light: 'rgba(255,255,255,0.95)',
      dark: 'rgba(120,128,148,0.78)',
      size: 18,
    });
    sel.classList.add('sel-active');
    sel.style.opacity = '1';
  }, [magicPenOpacityRef, selectionCanvasRef]);

  const resetMagicSelection = useCallback(() => {
    if (magicLassoRafRef.current) cancelAnimationFrame(magicLassoRafRef.current);
    magicLassoRafRef.current = null;
    magicLassoPtsRef.current = [];
    magicLassoDownRef.current = false;
    magicMaskRef.current = null;
    resetMagicMaskHistory();
    magicRefineDownRef.current = false;
    magicRefModeRef.current = 'pen';
    setMagicSelectionPhase('lasso');
    setMagicSelectConfirmDisabled(true);
    setMagicSelectDetecting(false);
    setMagicSelectRefMode('pen');
    clearMagicSelectionOverlay();
  }, [clearMagicSelectionOverlay, resetMagicMaskHistory, setMagicSelectionPhase]);

  const getMagicEventPoint = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e);
    return {
      x: Math.max(0, Math.min(canvas.width, (t.clientX - rect.left) * (canvas.width / rect.width))),
      y: Math.max(0, Math.min(canvas.height, (t.clientY - rect.top) * (canvas.height / rect.height))),
    };
  }, [canvasRef]);

  const paintMagicSelectionMask = useCallback((point) => {
    const mask = magicMaskRef.current;
    const canvas = canvasRef.current;
    if (!mask || !canvas) return;
    const radius = Math.max(1, toolRadiusRef.current);
    const r2 = radius * radius;
    const val = magicRefModeRef.current === 'pen' ? 1 : 0;
    const x0 = Math.max(0, Math.floor(point.x - radius));
    const x1 = Math.min(canvas.width - 1, Math.ceil(point.x + radius));
    const y0 = Math.max(0, Math.floor(point.y - radius));
    const y1 = Math.min(canvas.height - 1, Math.ceil(point.y + radius));
    for (let py = y0; py <= y1; py += 1) {
      for (let px = x0; px <= x1; px += 1) {
        const dx = px - point.x;
        const dy = py - point.y;
        if (dx * dx + dy * dy <= r2) mask[py * canvas.width + px] = val;
      }
    }
    renderMagicMask(mask);
  }, [canvasRef, renderMagicMask, toolRadiusRef]);

  const confirmMagicSelection = useCallback(async () => {
    if (magicLassoPtsRef.current.length < 5 || magicSelectDetecting) return;
    if (magicLassoRafRef.current) cancelAnimationFrame(magicLassoRafRef.current);
    magicLassoRafRef.current = null;
    renderMagicLasso(true);
    setMagicSelectDetecting(true);
    setMagicSelectConfirmDisabled(true);
    setMagicSelectionPhase('detecting');
    try {
      let sourceCanvas = await getMagicSelectionSourceCanvas?.();
      if (!sourceCanvas) {
        const canvas = canvasRef.current;
        sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = canvas.width;
        sourceCanvas.height = canvas.height;
        sourceCanvas.getContext('2d').drawImage(canvas, 0, 0);
      }
      const poly = magicLassoPtsRef.current.map(point => [point.x, point.y]);
      const mask = await detectSmartSelectionMask(sourceCanvas, poly, { logPrefix: 'transparent-pen' });
      setMagicSelectDetecting(false);
      if (!mask) {
        showToast?.('No selection found - draw a bigger area');
        resetMagicSelection();
        return;
      }
      magicMaskRef.current = mask;
      resetMagicMaskHistory(mask);
      setMagicSelectionPhase('refine');
      renderMagicMask(mask);
      syncCursor?.();
      if (brushCursorRef.current) brushCursorRef.current.style.display = 'none';
    } catch (err) {
      console.warn('[transparent-pen] Magic selection failed:', err);
      setMagicSelectDetecting(false);
      showToast?.('Select failed - try again');
      resetMagicSelection();
    }
  }, [
    brushCursorRef,
    canvasRef,
    getMagicSelectionSourceCanvas,
    magicSelectDetecting,
    renderMagicLasso,
    renderMagicMask,
    resetMagicMaskHistory,
    resetMagicSelection,
    setMagicSelectionPhase,
    showToast,
    syncCursor,
  ]);

  const applyMagicSelection = useCallback(() => {
    const canvas = canvasRef.current;
    const mask = magicMaskRef.current;
    if (!canvas || !mask) return false;
    const maskCanvas = drawMaskToCanvas(mask, canvas.width, canvas.height);
    const committed = onCommitStroke?.({
      type: 'magicPenStroke',
      sourceCanvas: maskCanvas,
      maskCanvas,
      opacity: getMagicPenOpacity(magicPenOpacityRef),
    });
    clearActiveCanvas();
    resetMagicSelection();
    if (committed) pushHistory();
    return !!committed;
  }, [canvasRef, clearActiveCanvas, magicPenOpacityRef, onCommitStroke, pushHistory, resetMagicSelection]);

  const setMagicSelectionRefMode = useCallback((mode) => {
    magicRefModeRef.current = mode;
    setMagicSelectRefMode(mode);
  }, []);

  const undoMagicSelection = useCallback(() => {
    if (magicMaskUndoStackRef.current.length <= 1) {
      showToast?.('Nothing to undo');
      syncMagicHistoryButtons();
      return false;
    }
    const current = magicMaskUndoStackRef.current.pop();
    magicMaskRedoStackRef.current.push(current);
    const previous = magicMaskUndoStackRef.current[magicMaskUndoStackRef.current.length - 1];
    magicMaskRef.current = previous.slice();
    renderMagicMask(magicMaskRef.current);
    syncMagicHistoryButtons();
    return true;
  }, [renderMagicMask, showToast, syncMagicHistoryButtons]);

  const redoMagicSelection = useCallback(() => {
    if (!magicMaskRedoStackRef.current.length) {
      showToast?.('Nothing to redo');
      syncMagicHistoryButtons();
      return false;
    }
    const next = magicMaskRedoStackRef.current.pop();
    magicMaskUndoStackRef.current.push(next.slice());
    magicMaskRef.current = next.slice();
    renderMagicMask(magicMaskRef.current);
    syncMagicHistoryButtons();
    return true;
  }, [renderMagicMask, showToast, syncMagicHistoryButtons]);

  const refreshMagicSelectionPreview = useCallback(() => {
    // If a mask is already built (refine phase), refresh its overlay so the
    // strength slider updates the red preview in real time. Otherwise we're
    // mid-lasso — re-render the boundary so the new slider value updates the
    // boundary's CSS opacity (which is now tied to magicPenOpacityRef).
    if (magicMaskRef.current) {
      renderMagicMask(magicMaskRef.current);
    } else if (magicLassoPtsRef.current.length >= 2) {
      renderMagicLasso(!magicLassoDownRef.current);
    }
  }, [renderMagicLasso, renderMagicMask]);

  const paintAt = useCallback((x, y, fx, fy) => {
    const ctx = ctxRef.current;
    const scratchCtx = scratchCtxRef.current;
    const scratchCanvas = scratchCanvasRef.current;
    const doodleOpacity = getDoodleOpacity(doodleOpacityRef);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(x, y);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (isFreehandEraseMode()) {
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
      if (activeToolRef.current === 'magicPen') {
        ctx.globalCompositeOperation = 'source-over';
        drawCheckerboardMasked(ctx, scratchCanvas, getMagicPenOpacity(magicPenOpacityRef));
      } else {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = activeToolRef.current === 'doodle' ? 1 : eraserOpacityRef.current;
        ctx.drawImage(scratchCanvas, 0, 0);
      }
    } else if (penTypeRef.current === 'pencil') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = doodleColorRef.current;
      ctx.lineWidth = Math.max(1, toolRadiusRef.current * 0.8);
      ctx.globalAlpha = 0.55 * doodleOpacity; ctx.stroke();
      ctx.lineWidth = toolRadiusRef.current * 1.6; ctx.globalAlpha = 0.08 * doodleOpacity; ctx.stroke();
    } else if (penTypeRef.current === 'marker') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = doodleColorRef.current;
      ctx.lineWidth = toolRadiusRef.current * 3.5;
      ctx.lineCap = 'square'; ctx.lineJoin = 'miter';
      ctx.globalAlpha = 0.38 * doodleOpacity; ctx.stroke();
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = doodleOpacity;
      ctx.strokeStyle = doodleColorRef.current;
      const n = (toolRadiusRef.current - 4) / 56;
      ctx.lineWidth = Math.max(1, 1 - 11 * n + 58 * n * n);
      ctx.stroke();
    }
    ctx.restore();
  }, [activeToolRef, ctxRef, doodleColorRef, doodleOpacityRef, eraserOpacityRef, isFreehandEraseMode, magicPenOpacityRef, penTypeRef, toolRadiusRef]);

  const commitCurrentStroke = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const tool = activeToolRef.current;
    const type = tool === 'magicPen' ? 'magicPenStroke' : 'doodleStroke';
    const committed = onCommitStroke?.({
      type,
      sourceCanvas: canvas,
      maskCanvas: tool === 'magicPen' ? scratchCanvasRef.current : null,
      opacity: tool === 'magicPen' ? getMagicPenOpacity(magicPenOpacityRef) : 1,
    });
    clearActiveCanvas();
    return !!committed;
  }, [activeToolRef, canvasRef, clearActiveCanvas, magicPenOpacityRef, onCommitStroke]);

  const drawMagicPenShapeMask = useCallback((ctx, x1, y1, x2, y2) => {
    ctx.beginPath();
    if ((magicPenModeRef?.current || 'freehand') === 'circle') {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.max(1, Math.abs(x2 - x1) / 2);
      const ry = Math.max(1, Math.abs(y2 - y1) / 2);
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    ctx.fillRect(x, y, Math.abs(x2 - x1), Math.abs(y2 - y1));
  }, [magicPenModeRef]);

  const drawMagicPenShapePreview = useCallback((x1, y1, x2, y2) => {
    const ctx = ctxRef.current;
    const scratchCtx = scratchCtxRef.current;
    const scratchCanvas = scratchCanvasRef.current;
    if (!ctx || !scratchCtx || !scratchCanvas || !shapePreviewDataRef.current) return;
    ctx.putImageData(shapePreviewDataRef.current, 0, 0);
    scratchCtx.clearRect(0, 0, scratchCanvas.width, scratchCanvas.height);
    scratchCtx.save();
    scratchCtx.fillStyle = 'rgba(0,0,0,1)';
    drawMagicPenShapeMask(scratchCtx, x1, y1, x2, y2);
    scratchCtx.restore();
    drawCheckerboardMasked(ctx, scratchCanvas, getMagicPenOpacity(magicPenOpacityRef));
  }, [ctxRef, drawMagicPenShapeMask, magicPenOpacityRef]);

  const commitMagicPenShape = useCallback((x1, y1, x2, y2) => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const scratchCtx = scratchCtxRef.current;
    const scratchCanvas = scratchCanvasRef.current;
    if (!canvas || !ctx || !scratchCtx || !scratchCanvas) return false;
    if (shapePreviewDataRef.current) ctx.putImageData(shapePreviewDataRef.current, 0, 0);
    shapePreviewDataRef.current = null;
    const minSize = 4;
    if (Math.abs(x2 - x1) < minSize && Math.abs(y2 - y1) < minSize) {
      scratchCtx.clearRect(0, 0, scratchCanvas.width, scratchCanvas.height);
      return false;
    }
    scratchCtx.clearRect(0, 0, scratchCanvas.width, scratchCanvas.height);
    scratchCtx.save();
    scratchCtx.fillStyle = 'rgba(0,0,0,1)';
    drawMagicPenShapeMask(scratchCtx, x1, y1, x2, y2);
    scratchCtx.restore();
    drawCheckerboardMasked(ctx, scratchCanvas, getMagicPenOpacity(magicPenOpacityRef));
    return commitCurrentStroke();
  }, [canvasRef, commitCurrentStroke, ctxRef, drawMagicPenShapeMask, magicPenOpacityRef]);

  const moveCursor = useCallback((cx, cy) => {
    const r = frameElRef.current.getBoundingClientRect();
    const el = brushCursorRef.current;
    if (!el) return;
    el.style.left = (cx - r.left) + 'px';
    el.style.top = (cy - r.top) + 'px';
  }, [brushCursorRef, frameElRef]);

  const resetInteractionState = useCallback(() => {
    if (shapeDraggingRef.current && shapePreviewDataRef.current && ctxRef.current) {
      ctxRef.current.putImageData(shapePreviewDataRef.current, 0, 0);
    }
    shapeDraggingRef.current = false;
    shapePreviewDataRef.current = null;
    strokeBaseDataRef.current = null;
    clearTimeout(fillLongPressTimerRef.current);
    fillLongPressTimerRef.current = null;
    fillPressRef.current = null;
    if (scratchCtxRef.current && scratchCanvasRef.current) {
      scratchCtxRef.current.clearRect(0, 0, scratchCanvasRef.current.width, scratchCanvasRef.current.height);
    }
    resetMagicSelection();
  }, [ctxRef, resetMagicSelection]);

  const isOverLiveDecorator = useCallback((clientX, clientY) => {
    const items = stickerSys.placedStickersRef?.current || [];
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const rect = items[i].el?.getBoundingClientRect?.();
      if (
        rect
        && clientX >= rect.left
        && clientX <= rect.right
        && clientY >= rect.top
        && clientY <= rect.bottom
      ) return true;
    }
    return false;
  }, [stickerSys]);

  const fillEntireCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return false;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = getDoodleOpacity(doodleOpacityRef);
    ctx.fillStyle = doodleColorRef.current;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    return true;
  }, [canvasRef, ctxRef, doodleColorRef, doodleOpacityRef]);

  const startFillLongPress = useCallback((point, clientX, clientY) => {
    if (activeToolRef.current !== 'doodle' || doodleModeRef?.current === 'erase') return;
    clearTimeout(fillLongPressTimerRef.current);
    fillPressRef.current = { point, clientX, clientY };
    fillLongPressTimerRef.current = setTimeout(() => {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx || activeToolRef.current !== 'doodle' || !fillPressRef.current) return;
      const baseImageData = strokeBaseDataRef.current;
      if (baseImageData) ctx.putImageData(baseImageData, 0, 0);
      const shouldFillAll = isOverLiveDecorator(clientX, clientY);
      const didFill = shouldFillAll
        ? fillEntireCanvas()
        : floodFill(ctx, point.x, point.y, doodleColorRef.current, getDoodleOpacity(doodleOpacityRef));
      fillLongPressTimerRef.current = null;
      isDrawingRef.current = false;
      fillPressRef.current = null;
      strokeBaseDataRef.current = null;
      if (scratchCtxRef.current && scratchCanvasRef.current) {
        scratchCtxRef.current.clearRect(0, 0, scratchCanvasRef.current.width, scratchCanvasRef.current.height);
      }
      if (didFill) {
        onCommitCanvasFill?.(canvas);
        clearActiveCanvas();
        pushHistory();
      }
    }, DOODLE_FILL_LONG_PRESS_MS);
  }, [activeToolRef, canvasRef, ctxRef, doodleColorRef, doodleModeRef, doodleOpacityRef, fillEntireCanvas, isOverLiveDecorator, onCommitCanvasFill, clearActiveCanvas, pushHistory]);

  const cancelFillLongPressIfMoved = useCallback((clientX, clientY) => {
    const press = fillPressRef.current;
    if (!press || !fillLongPressTimerRef.current) return;
    const dx = clientX - press.clientX;
    const dy = clientY - press.clientY;
    if (Math.sqrt(dx * dx + dy * dy) <= DOODLE_FILL_MOVE_TOLERANCE) return;
    clearTimeout(fillLongPressTimerRef.current);
    fillLongPressTimerRef.current = null;
  }, []);

  const clearFillLongPress = useCallback(() => {
    clearTimeout(fillLongPressTimerRef.current);
    fillLongPressTimerRef.current = null;
    fillPressRef.current = null;
  }, []);

  const startMagicSelectionPointer = useCallback((e) => {
    e.preventDefault();
    stickerSys.deselectAllStickers?.();
    const point = getMagicEventPoint(e);
    if (magicSelectPhaseRef.current === 'refine' && magicMaskRef.current) {
      magicRefineDownRef.current = true;
      magicRefineStartMaskRef.current = magicMaskRef.current.slice();
      paintMagicSelectionMask(point);
      return;
    }
    if (magicSelectPhaseRef.current === 'detecting') return;
    if (magicLassoRafRef.current) cancelAnimationFrame(magicLassoRafRef.current);
    magicLassoPtsRef.current = [point];
    magicLassoDownRef.current = true;
    magicLassoDashRef.current = 0;
    setMagicSelectionPhase('lasso');
    setMagicSelectConfirmDisabled(true);
    clearMagicSelectionOverlay();
    animateMagicLasso();
  }, [animateMagicLasso, clearMagicSelectionOverlay, getMagicEventPoint, paintMagicSelectionMask, setMagicSelectionPhase, stickerSys]);

  const moveMagicSelectionPointer = useCallback((e) => {
    if (magicRefineDownRef.current && magicMaskRef.current) {
      e.preventDefault();
      paintMagicSelectionMask(getMagicEventPoint(e));
      return true;
    }
    if (!magicLassoDownRef.current) return false;
    e.preventDefault();
    magicLassoPtsRef.current.push(getMagicEventPoint(e));
    return true;
  }, [getMagicEventPoint, paintMagicSelectionMask]);

  const endMagicSelectionPointer = useCallback((e) => {
    if (magicRefineDownRef.current) {
      e?.preventDefault?.();
      magicRefineDownRef.current = false;
      commitMagicMaskHistory();
      return;
    }
    if (!magicLassoDownRef.current) return;
    e?.preventDefault?.();
    magicLassoDownRef.current = false;
    const valid = magicLassoPtsRef.current.length >= 5;
    setMagicSelectConfirmDisabled(!valid);
    renderMagicLasso(valid);
  }, [commitMagicMaskHistory, renderMagicLasso]);

  useEffect(() => {
    if (!enabled) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
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
      stickerSys.deselectAllStickers?.();
      if (!activeToolRef.current) return;
      const p = getXY(e);
      const magicMode = magicPenModeRef?.current || 'freehand';
      if (activeToolRef.current === 'magicPen' && magicMode === 'magic') {
        startMagicSelectionPointer(e);
        return;
      }
      if (activeToolRef.current === 'magicPen' && magicMode !== 'freehand') {
        shapeDraggingRef.current = true;
        shapeStartXRef.current = p.x;
        shapeStartYRef.current = p.y;
        shapePreviewDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        scratchCtxRef.current.clearRect(0, 0, sc.width, sc.height);
        return;
      }
      isDrawingRef.current = true; lastXRef.current = p.x; lastYRef.current = p.y;
      if (isFreehandEraseMode()) {
        strokeBaseDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        scratchCtxRef.current.clearRect(0, 0, sc.width, sc.height);
      } else {
        strokeBaseDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        startFillLongPress(p, e.clientX, e.clientY);
      }
      paintAt(p.x, p.y, p.x, p.y);
    };
    const onMouseMove = (e) => {
      if (!activeToolRef.current) return;
      if (activeToolRef.current === 'magicPen' && (magicPenModeRef?.current || 'freehand') === 'magic') {
        if (magicLassoDownRef.current || magicRefineDownRef.current) moveMagicSelectionPointer(e);
        return;
      }
      moveCursor(e.clientX, e.clientY);
      if (
        brushCursorRef.current
        && (
          activeToolRef.current === 'doodle'
          || isFreehandEraseMode()
        )
      ) {
        brushCursorRef.current.style.display = 'block';
      }
      if (activeToolRef.current === 'doodle' && !isDoodleEraseMode()) cancelFillLongPressIfMoved(e.clientX, e.clientY);
      if (shapeDraggingRef.current) {
        const p = getXYFromClient(e.clientX, e.clientY);
        drawMagicPenShapePreview(shapeStartXRef.current, shapeStartYRef.current, p.x, p.y);
      } else if (isDrawingRef.current) {
        const p = getXY(e);
        paintAt(p.x, p.y, lastXRef.current, lastYRef.current);
        lastXRef.current = p.x; lastYRef.current = p.y;
      }
    };
    const onMouseUp = (e) => {
      if (activeToolRef.current === 'magicPen' && (magicPenModeRef?.current || 'freehand') === 'magic') {
        endMagicSelectionPointer(e);
      } else if (shapeDraggingRef.current) {
        const p = getXYFromClient(e.clientX, e.clientY);
        if (commitMagicPenShape(shapeStartXRef.current, shapeStartYRef.current, p.x, p.y)) pushHistory();
        shapeDraggingRef.current = false;
      } else if (isDrawingRef.current) {
        clearFillLongPress();
        strokeBaseDataRef.current = null;
        if (commitCurrentStroke()) pushHistory();
        isDrawingRef.current = false;
      }
    };
    const onMouseLeave = () => {
      if (activeToolRef.current === 'magicPen' && (magicPenModeRef?.current || 'freehand') === 'magic') {
        endMagicSelectionPointer();
      }
      if (isDrawingRef.current) {
        clearFillLongPress();
        strokeBaseDataRef.current = null;
        if (commitCurrentStroke()) pushHistory();
        isDrawingRef.current = false;
      }
      if (brushCursorRef.current) brushCursorRef.current.style.display = 'none';
    };
    const onMouseEnter = (e) => {
      if (
        activeToolRef.current
        && (
          activeToolRef.current === 'doodle'
          || isFreehandEraseMode()
        )
        && brushCursorRef.current
      ) {
        moveCursor(e.clientX, e.clientY);
        brushCursorRef.current.style.display = 'block';
      }
    };
    const onTouchStart = (e) => {
      stickerSys.deselectAllStickers?.();
      if (!activeToolRef.current) return; e.preventDefault();
      const p = getXY(e);
      const magicMode = magicPenModeRef?.current || 'freehand';
      if (activeToolRef.current === 'magicPen' && magicMode === 'magic') {
        startMagicSelectionPointer(e);
        return;
      }
      if (activeToolRef.current === 'magicPen' && magicMode !== 'freehand') {
        shapeDraggingRef.current = true;
        shapeStartXRef.current = p.x;
        shapeStartYRef.current = p.y;
        shapePreviewDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        scratchCtxRef.current.clearRect(0, 0, sc.width, sc.height);
        return;
      }
      isDrawingRef.current = true; lastXRef.current = p.x; lastYRef.current = p.y;
      if (isFreehandEraseMode()) {
        strokeBaseDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        scratchCtxRef.current.clearRect(0, 0, sc.width, sc.height);
      } else {
        strokeBaseDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const t = e.touches[0];
        startFillLongPress(p, t.clientX, t.clientY);
      }
      paintAt(p.x, p.y, p.x, p.y);
    };
    const onTouchMove = (e) => {
      if (!activeToolRef.current) return; e.preventDefault();
      if (activeToolRef.current === 'magicPen' && (magicPenModeRef?.current || 'freehand') === 'magic') {
        moveMagicSelectionPointer(e);
        return;
      }
      if (activeToolRef.current === 'doodle' && !isDoodleEraseMode() && e.touches[0]) {
        cancelFillLongPressIfMoved(e.touches[0].clientX, e.touches[0].clientY);
      }
      if (shapeDraggingRef.current && e.touches[0]) {
        const p = getXYFromClient(e.touches[0].clientX, e.touches[0].clientY);
        drawMagicPenShapePreview(shapeStartXRef.current, shapeStartYRef.current, p.x, p.y);
      } else if (isDrawingRef.current) {
        const p = getXY(e);
        paintAt(p.x, p.y, lastXRef.current, lastYRef.current);
        lastXRef.current = p.x; lastYRef.current = p.y;
      }
    };
    const onTouchEnd = (e) => {
      if (activeToolRef.current === 'magicPen' && (magicPenModeRef?.current || 'freehand') === 'magic') {
        endMagicSelectionPointer(e);
      } else if (shapeDraggingRef.current) {
        const t = e.changedTouches[0];
        const p = t ? getXYFromClient(t.clientX, t.clientY) : { x: shapeStartXRef.current, y: shapeStartYRef.current };
        if (commitMagicPenShape(shapeStartXRef.current, shapeStartYRef.current, p.x, p.y)) pushHistory();
        shapeDraggingRef.current = false;
      } else if (isDrawingRef.current) {
        clearFillLongPress();
        strokeBaseDataRef.current = null;
        if (commitCurrentStroke()) pushHistory();
        isDrawingRef.current = false;
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
    const onPanelMouseDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      startTrackDrag();
      applyTrackNorm(normFromClientY(e.clientY));
    };
    const onDocTrackMouseMove = (e) => {
      if (trackDraggingRef.current) {
        e.preventDefault();
        applyTrackNorm(normFromClientY(e.clientY));
        return;
      }
      if (activeToolRef.current === 'magicPen' && (magicPenModeRef?.current || 'freehand') === 'magic') {
        if (magicLassoDownRef.current || magicRefineDownRef.current) moveMagicSelectionPointer(e);
      } else if (shapeDraggingRef.current) {
        const p = getXYFromClient(e.clientX, e.clientY);
        drawMagicPenShapePreview(shapeStartXRef.current, shapeStartYRef.current, p.x, p.y);
      }
    };
    const onDocTrackMouseUp = (e) => {
      if (activeToolRef.current === 'magicPen' && (magicPenModeRef?.current || 'freehand') === 'magic') {
        endMagicSelectionPointer(e);
      } else if (shapeDraggingRef.current) {
        const p = getXYFromClient(e.clientX, e.clientY);
        if (commitMagicPenShape(shapeStartXRef.current, shapeStartYRef.current, p.x, p.y)) pushHistory();
        shapeDraggingRef.current = false;
      }
      if (trackDraggingRef.current) endTrackDrag();
    };
    const onPanelTouchStart = (e) => {
      if (!e.touches[0]) return;
      e.preventDefault();
      e.stopPropagation();
      startTrackDrag();
      applyTrackNorm(normFromClientY(e.touches[0].clientY));
    };
    const onDocTouchMove = (e) => {
      if (trackDraggingRef.current && e.touches[0]) {
        e.preventDefault();
        applyTrackNorm(normFromClientY(e.touches[0].clientY));
        return;
      }
      if (activeToolRef.current === 'magicPen' && (magicPenModeRef?.current || 'freehand') === 'magic') {
        if (e.touches[0] && (magicLassoDownRef.current || magicRefineDownRef.current)) {
          moveMagicSelectionPointer(e);
        }
      } else if (shapeDraggingRef.current && e.touches[0]) {
        const p = getXYFromClient(e.touches[0].clientX, e.touches[0].clientY);
        drawMagicPenShapePreview(shapeStartXRef.current, shapeStartYRef.current, p.x, p.y);
      }
    };
    const onDocTouchEnd = (e) => {
      if (activeToolRef.current === 'magicPen' && (magicPenModeRef?.current || 'freehand') === 'magic') {
        endMagicSelectionPointer(e);
      } else if (shapeDraggingRef.current) {
        const t = e.changedTouches[0];
        const p = t ? getXYFromClient(t.clientX, t.clientY) : { x: shapeStartXRef.current, y: shapeStartYRef.current };
        if (commitMagicPenShape(shapeStartXRef.current, shapeStartYRef.current, p.x, p.y)) pushHistory();
        shapeDraggingRef.current = false;
      }
      if (trackDraggingRef.current) endTrackDrag();
    };

    if (panel) {
      panel.addEventListener('mouseenter', onPanelMouseEnter);
      panel.addEventListener('mousedown', onPanelMouseDown);
      panel.addEventListener('touchstart', onPanelTouchStart, { passive: false });
    }
    document.addEventListener('mousemove', onDocTrackMouseMove);
    document.addEventListener('mouseup', onDocTrackMouseUp);
    document.addEventListener('touchmove', onDocTouchMove, { passive: false });
    document.addEventListener('touchend', onDocTouchEnd, { passive: true });

    const overlay = stickerSys.stickerOverlayRef.current;
    if (overlay) overlay.addEventListener('click', stickerSys.deselectAllStickers);

    onInitialIntro();

    return () => {
      clearTimeout(fillLongPressTimerRef.current);
      fillLongPressTimerRef.current = null;
      fillPressRef.current = null;
      resetMagicSelection();
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      canvas.removeEventListener('mouseenter', onMouseEnter);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
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
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    resetInteractionState,
    resetMagicSelection,
    magicSelectPhase,
    magicSelectConfirmDisabled,
    magicSelectDetecting,
    magicSelectRefMode,
    magicUndoDisabled,
    magicRedoDisabled,
    confirmMagicSelection,
    applyMagicSelection,
    undoMagicSelection,
    redoMagicSelection,
    setMagicSelectionRefMode,
    refreshMagicSelectionPreview,
  };
}
