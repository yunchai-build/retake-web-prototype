import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  drawMagicSelectionStroke,
  MAGIC_SELECTION_DASH_CYCLE,
} from '../utils/canvas.js';
import { detectSmartSelectionMask } from '../utils/smartSelection.js';
import {
  applyMaskOperation,
  buildPolyMask,
  buildShapeMask,
  cloneMask,
  countMask,
  createEmptyMask,
  createFullMask,
  DEFAULT_SELECTION_BRUSH_RADIUS,
  drawShapePath,
  maskIsUseful,
  MAX_SELECTION_BRUSH_RADIUS,
  MIN_SELECTION_BRUSH_RADIUS,
  MIN_SMART_SELECTION_POINTS,
  paintMaskCircle,
  paintMaskLine,
  shapeBounds,
} from './selectionMask.js';

function getCanvasPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  };
}

export default function useSelectionEngine({ logPrefix = 'edit-selection' } = {}) {
  const sourceCanvasRef = useRef(null);
  const dimCanvasRef = useRef(null);
  const outlineCanvasRef = useRef(null);
  const inputCanvasRef = useRef(null);
  const maskRef = useRef(null);
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const interactionRef = useRef(null);
  const outlineDashRef = useRef(0);
  const outlineRafRef = useRef(null);

  const [sourceSize, setSourceSize] = useState(null);
  const [selectionOperation, setSelectionOperation] = useState('add');
  const [selectionMethod, setSelectionMethod] = useState('lasso');
  const [activeShape, setActiveShape] = useState('circle');
  const [brushRadius, setBrushRadius] = useState(DEFAULT_SELECTION_BRUSH_RADIUS);
  const [detecting, setDetecting] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncHistoryState = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current >= 0 && historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  const renderDimOverlay = useCallback(() => {
    const canvas = dimCanvasRef.current;
    const mask = maskRef.current;
    if (!canvas || !canvas.width || !canvas.height) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(20, 20, 28, 0.48)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!mask || countMask(mask) === 0) return;
    const punch = document.createElement('canvas');
    punch.width = canvas.width;
    punch.height = canvas.height;
    const punchCtx = punch.getContext('2d');
    const id = punchCtx.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < mask.length; i += 1) {
      if (!mask[i]) continue;
      id.data[i * 4 + 3] = 255;
    }
    punchCtx.putImageData(id, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(punch, 0, 0);
    ctx.restore();
  }, []);

  const renderOutline = useCallback(() => {
    const canvas = outlineCanvasRef.current;
    const mask = maskRef.current;
    if (!canvas || !canvas.width || !canvas.height || !mask || countMask(mask) === 0) {
      if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const ctx = canvas.getContext('2d');
    const id = ctx.createImageData(canvas.width, canvas.height);
    const width = canvas.width;
    const height = canvas.height;
    const dash = Math.floor(outlineDashRef.current);
    const setPixel = (x, y, alpha = 235) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const p = (y * width + x) * 4;
      id.data[p] = 255;
      id.data[p + 1] = 255;
      id.data[p + 2] = 255;
      id.data[p + 3] = alpha;
    };

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        if (!mask[i]) continue;
        const boundary = (
          x === 0 || y === 0 || x === width - 1 || y === height - 1
          || !mask[i - 1] || !mask[i + 1] || !mask[i - width] || !mask[i + width]
        );
        if (!boundary) continue;
        if (((x + y + dash) % MAGIC_SELECTION_DASH_CYCLE) > 5) continue;
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) setPixel(x + ox, y + oy);
        }
      }
    }
    ctx.putImageData(id, 0, 0);
  }, []);

  const renderSelection = useCallback(() => {
    renderDimOverlay();
    renderOutline();
  }, [renderDimOverlay, renderOutline]);

  const commitMask = useCallback((mask) => {
    const next = cloneMask(mask);
    maskRef.current = next;
    const index = historyIndexRef.current;
    historyRef.current = historyRef.current.slice(0, index + 1);
    historyRef.current.push(cloneMask(next));
    historyIndexRef.current = historyRef.current.length - 1;
    setHasSelection(countMask(next) > 0);
    syncHistoryState();
    requestAnimationFrame(renderSelection);
  }, [renderSelection, syncHistoryState]);

  const setMaskFromHistory = useCallback((mask) => {
    maskRef.current = cloneMask(mask);
    setHasSelection(countMask(maskRef.current) > 0);
    requestAnimationFrame(renderSelection);
  }, [renderSelection]);

  const initialize = useCallback(({ width, height, initialMask }) => {
    const empty = createEmptyMask(width, height);
    const startingMask = cloneMask(initialMask) || empty;
    maskRef.current = startingMask;
    historyRef.current = [cloneMask(startingMask)];
    historyIndexRef.current = 0;
    setSourceSize({ width, height });
    setSelectionOperation('add');
    setSelectionMethod('lasso');
    setActiveShape('circle');
    setBrushRadius(DEFAULT_SELECTION_BRUSH_RADIUS);
    setHasSelection(countMask(startingMask) > 0);
    syncHistoryState();
    requestAnimationFrame(renderSelection);
  }, [renderSelection, syncHistoryState]);

  const reset = useCallback(() => {
    maskRef.current = null;
    historyRef.current = [];
    historyIndexRef.current = -1;
    interactionRef.current = null;
    setSourceSize(null);
    setDetecting(false);
    setHasSelection(false);
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  const clearInputCanvas = useCallback(() => {
    const canvas = inputCanvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const drawLassoPreview = useCallback((points) => {
    const canvas = inputCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (points.length < 2) return;
    drawMagicSelectionStroke(ctx, {
      points,
      closed: false,
      dashOffset: outlineDashRef.current,
    });
  }, []);

  const drawShapePreview = useCallback((start, end) => {
    const canvas = inputCanvasRef.current;
    const bounds = shapeBounds(start, end);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!bounds) return;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    drawShapePath(ctx, activeShape, bounds);
    ctx.fill('nonzero');
    ctx.restore();
    drawMagicSelectionStroke(ctx, {
      drawPath: (pathCtx) => drawShapePath(pathCtx, activeShape, bounds),
      dashOffset: outlineDashRef.current,
    });
  }, [activeShape]);

  const applyDetectedOrBoundaryMask = useCallback(async (points, operation = selectionOperation) => {
    const sourceCanvas = sourceCanvasRef.current;
    if (!sourceCanvas || points.length < MIN_SMART_SELECTION_POINTS) return;
    setDetecting(true);
    try {
      const poly = points.map(point => [point.x, point.y]);
      const detected = await detectSmartSelectionMask(sourceCanvas, poly, { logPrefix });
      const fallback = buildPolyMask(sourceCanvas.width, sourceCanvas.height, points);
      const change = maskIsUseful(detected, sourceCanvas.width * sourceCanvas.height)
        ? detected
        : fallback;
      if (!change) return;
      commitMask(applyMaskOperation(maskRef.current, change, operation));
    } finally {
      setDetecting(false);
      clearInputCanvas();
    }
  }, [clearInputCanvas, commitMask, logPrefix, selectionOperation]);

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    setMaskFromHistory(historyRef.current[historyIndexRef.current]);
    syncHistoryState();
  }, [setMaskFromHistory, syncHistoryState]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    setMaskFromHistory(historyRef.current[historyIndexRef.current]);
    syncHistoryState();
  }, [setMaskFromHistory, syncHistoryState]);

  const selectAll = useCallback(() => {
    if (!sourceSize) return;
    setSelectionOperation('selectAll');
    setSelectionMethod('selectAll');
    commitMask(createFullMask(sourceSize.width, sourceSize.height));
  }, [commitMask, sourceSize]);

  const selectOperation = useCallback((operation) => {
    if (operation === 'selectAll') {
      selectAll();
      return;
    }
    setSelectionOperation(operation);
    setSelectionMethod(current => (
      current === 'selectAll' ? (operation === 'erase' ? 'pixel' : 'lasso') : current
    ));
  }, [selectAll]);

  const selectMethod = useCallback((method) => {
    setSelectionMethod(method);
  }, []);

  const handlePointerDown = useCallback((event) => {
    const canvas = inputCanvasRef.current;
    if (!canvas || !sourceSize || detecting) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    const point = getCanvasPoint(event, canvas);

    if (selectionMethod === 'lasso') {
      interactionRef.current = { type: 'lasso', operation: selectionOperation, points: [point] };
      drawLassoPreview([point]);
      return;
    }

    if (selectionMethod === 'pixel') {
      const draft = cloneMask(maskRef.current) || createEmptyMask(sourceSize.width, sourceSize.height);
      const value = selectionOperation === 'erase' ? 0 : 1;
      paintMaskCircle(draft, sourceSize.width, sourceSize.height, point, brushRadius, value);
      maskRef.current = draft;
      setHasSelection(countMask(draft) > 0);
      renderSelection();
      interactionRef.current = { type: 'paint', last: point, radius: brushRadius, value };
      return;
    }

    if (selectionMethod === 'shape') {
      interactionRef.current = { type: 'shape', operation: selectionOperation, start: point, end: point };
      drawShapePreview(point, point);
    }
  }, [brushRadius, detecting, drawLassoPreview, drawShapePreview, renderSelection, selectionMethod, selectionOperation, sourceSize]);

  const handlePointerMove = useCallback((event) => {
    const canvas = inputCanvasRef.current;
    const interaction = interactionRef.current;
    if (!canvas || !interaction || !sourceSize) return;
    event.preventDefault();
    const point = getCanvasPoint(event, canvas);

    if (interaction.type === 'lasso') {
      interaction.points.push(point);
      drawLassoPreview(interaction.points);
      return;
    }

    if (interaction.type === 'paint') {
      const draft = maskRef.current;
      paintMaskLine(draft, sourceSize.width, sourceSize.height, interaction.last, point, interaction.radius, interaction.value);
      interaction.last = point;
      setHasSelection(countMask(draft) > 0);
      renderSelection();
      return;
    }

    if (interaction.type === 'shape') {
      interaction.end = point;
      drawShapePreview(interaction.start, interaction.end);
    }
  }, [drawLassoPreview, drawShapePreview, renderSelection, sourceSize]);

  const finishPointerInteraction = useCallback((event) => {
    const canvas = inputCanvasRef.current;
    const interaction = interactionRef.current;
    if (!canvas || !interaction || !sourceSize) return;
    event.preventDefault();
    canvas.releasePointerCapture?.(event.pointerId);
    const end = getCanvasPoint(event, canvas);
    interactionRef.current = null;

    if (interaction.type === 'lasso') {
      const points = [...interaction.points, end];
      if (points.length >= MIN_SMART_SELECTION_POINTS) {
        applyDetectedOrBoundaryMask(points, interaction.operation);
      } else {
        clearInputCanvas();
      }
      return;
    }

    if (interaction.type === 'paint') {
      paintMaskLine(maskRef.current, sourceSize.width, sourceSize.height, interaction.last, end, interaction.radius, interaction.value);
      commitMask(maskRef.current);
      clearInputCanvas();
      return;
    }

    if (interaction.type === 'shape') {
      const bounds = shapeBounds(interaction.start, end);
      const change = buildShapeMask(sourceSize.width, sourceSize.height, activeShape, bounds);
      if (change) commitMask(applyMaskOperation(maskRef.current, change, interaction.operation));
      clearInputCanvas();
    }
  }, [activeShape, applyDetectedOrBoundaryMask, clearInputCanvas, commitMask, sourceSize]);

  useEffect(() => {
    if (!sourceSize) return undefined;
    let disposed = false;
    const tick = () => {
      if (disposed) return;
      outlineDashRef.current = (outlineDashRef.current + 0.65) % MAGIC_SELECTION_DASH_CYCLE;
      renderOutline();
      outlineRafRef.current = requestAnimationFrame(tick);
    };
    outlineRafRef.current = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      if (outlineRafRef.current) cancelAnimationFrame(outlineRafRef.current);
      outlineRafRef.current = null;
    };
  }, [renderOutline, sourceSize]);

  const showBrushSlider = (
    (selectionOperation === 'add' || selectionOperation === 'erase')
    && selectionMethod === 'pixel'
  );

  return useMemo(() => ({
    activeShape,
    brushRadius,
    canRedo,
    canUndo,
    clearInputCanvas,
    commitMask,
    detecting,
    dimCanvasRef,
    handlePointerDown,
    handlePointerMove,
    finishPointerInteraction,
    handleRedo,
    handleUndo,
    hasSelection,
    initialize,
    inputCanvasRef,
    maskRef,
    outlineCanvasRef,
    renderSelection,
    reset,
    selectMethod,
    selectOperation,
    selectionMethod,
    selectionOperation,
    setActiveShape,
    setBrushRadius,
    setDetecting,
    showBrushSlider,
    sourceCanvasRef,
    sourceSize,
    minBrushRadius: MIN_SELECTION_BRUSH_RADIUS,
    maxBrushRadius: MAX_SELECTION_BRUSH_RADIUS,
  }), [
    activeShape,
    brushRadius,
    canRedo,
    canUndo,
    clearInputCanvas,
    commitMask,
    detecting,
    finishPointerInteraction,
    handlePointerDown,
    handlePointerMove,
    handleRedo,
    handleUndo,
    hasSelection,
    initialize,
    renderSelection,
    reset,
    selectMethod,
    selectOperation,
    selectionMethod,
    selectionOperation,
    setDetecting,
    showBrushSlider,
    sourceSize,
  ]);
}
