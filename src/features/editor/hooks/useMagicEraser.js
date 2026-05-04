import { useCallback, useRef, useState } from 'react';
import { sqDist3, kMeans, keepLargestCC, fillHoles, morphClose, polyContains } from '../utils/imageProcessing';

let magicSegmenter = null;
let magicSegmenterFailed = false;

async function getMagicSegmenter() {
  if (magicSegmenter) return magicSegmenter;
  if (magicSegmenterFailed) return null;
  try {
    const { InteractiveSegmenter, FilesetResolver } = await import(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/vision_bundle.mjs'
    );
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/wasm'
    );
    magicSegmenter = await InteractiveSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite',
        delegate: 'GPU',
      },
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
    return magicSegmenter;
  } catch (e) {
    console.warn('[magic] MediaPipe load failed, using fallback:', e);
    magicSegmenterFailed = true;
    return null;
  }
}

export function useMagicEraser({
  canvasRef,
  ctxRef,
  selectionCanvasRef,
  toolRadiusRef,
  brushCursorRef,
  showToast,
  syncCursor,
  pushHistory,
}) {
  const magicPhaseRef = useRef('lasso');
  const magicLassoRef = useRef([]);
  const magicDrawingRef = useRef(false);
  const magicMaskRef = useRef(null);
  const magicRefModeRef = useRef('pen');
  const magicOpacityRef = useRef(100);
  const magicRefiningRef = useRef(false);
  const magicMaskHistoryRef = useRef([]);
  const magicMaskRedoRef = useRef([]);

  const [magicPhase, setMagicPhase] = useState('lasso');
  const [magicConfirmDisabled, setMagicConfirmDisabled] = useState(true);
  const [magicDetecting, setMagicDetecting] = useState(false);
  const [magicRefMode, setMagicRefMode] = useState('pen');
  const [magicOpacity, setMagicOpacity] = useState(100);

  const clearOverlay = useCallback(() => {
    const sel = selectionCanvasRef.current;
    if (!sel) return;
    sel.getContext('2d').clearRect(0, 0, sel.width, sel.height);
    sel.classList.remove('sel-active');
    sel.style.opacity = '1';
  }, [selectionCanvasRef]);

  const renderLasso = useCallback((closed = false) => {
    const sel = selectionCanvasRef.current;
    const pts = magicLassoRef.current;
    if (!sel || pts.length < 2) return;
    const sx = sel.getContext('2d');
    sx.clearRect(0, 0, sel.width, sel.height);
    sel.classList.add('sel-active');
    sel.style.opacity = '1';
    sx.save();
    sx.strokeStyle = 'rgba(255,255,255,0.96)';
    sx.lineWidth = 2;
    sx.setLineDash([7, 5]);
    sx.beginPath();
    sx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) sx.lineTo(pts[i].x, pts[i].y);
    if (closed) sx.closePath();
    sx.stroke();
    sx.restore();
  }, [selectionCanvasRef]);

  const renderMask = useCallback((mask) => {
    const sel = selectionCanvasRef.current;
    if (!sel || !mask) return;
    const sx = sel.getContext('2d');
    const img = sx.createImageData(sel.width, sel.height);
    const d = img.data;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const p = i * 4;
      d[p] = 255; d[p + 1] = 55; d[p + 2] = 55; d[p + 3] = 210;
    }
    sx.putImageData(img, 0, 0);
    sel.classList.add('sel-active');
    sel.style.opacity = String(magicOpacityRef.current / 100);
  }, [selectionCanvasRef]);

  const reset = useCallback(() => {
    magicPhaseRef.current = 'lasso';
    magicLassoRef.current = [];
    magicDrawingRef.current = false;
    magicMaskRef.current = null;
    magicRefiningRef.current = false;
    magicMaskHistoryRef.current = [];
    magicMaskRedoRef.current = [];
    magicRefModeRef.current = 'pen';
    magicOpacityRef.current = 100;
    setMagicPhase('lasso');
    setMagicConfirmDisabled(true);
    setMagicDetecting(false);
    setMagicRefMode('pen');
    setMagicOpacity(100);
    clearOverlay();
    if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair';
    if (brushCursorRef.current) brushCursorRef.current.style.display = 'none';
  }, [brushCursorRef, canvasRef, clearOverlay]);

  const detectMask = useCallback(async () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx || magicLassoRef.current.length < 6) return null;
    await new Promise(resolve => requestAnimationFrame(resolve));
    const w = canvas.width, h = canvas.height;
    let src;
    try { src = ctx.getImageData(0, 0, w, h); }
    catch (e) { showToast('Select failed - try again'); return null; }
    const px = src.data;
    const poly = magicLassoRef.current;
    const polyPairs = poly.map(pt => [pt.x, pt.y]);
    const inLasso = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (polyContains(x + 0.5, y + 0.5, polyPairs)) inLasso[y * w + x] = 1;
      }
    }
    const lassoArea = inLasso.reduce((a, v) => a + v, 0);
    if (!lassoArea) return null;

    let mnX = w, mxX = 0, mnY = h, mxY = 0, sumX = 0, sumY = 0;
    for (const pt of poly) {
      mnX = Math.min(mnX, pt.x | 0); mxX = Math.max(mxX, pt.x | 0);
      mnY = Math.min(mnY, pt.y | 0); mxY = Math.max(mxY, pt.y | 0);
      sumX += pt.x; sumY += pt.y;
    }
    const cenX = sumX / poly.length, cenY = sumY / poly.length;
    const postProcess = (subject) => {
      const lcc = keepLargestCC(subject, w, h);
      const morphR = lassoArea > 60000 ? 4 : lassoArea > 15000 ? 2 : 1;
      const closed = morphClose(lcc, w, h, morphR);
      fillHoles(closed, w, h);
      const kept = closed.reduce((a, v) => a + v, 0);
      return (kept > lassoArea * 0.04 && kept < lassoArea * 0.96) ? closed : subject;
    };

    const MAX_PTS = 2000, BG_BAND = 50;
    const bbX0 = Math.max(0, mnX - BG_BAND), bbX1 = Math.min(w - 1, mxX + BG_BAND);
    const bbY0 = Math.max(0, mnY - BG_BAND), bbY1 = Math.min(h - 1, mxY + BG_BAND);
    const stride = Math.max(1, Math.ceil(Math.sqrt(lassoArea / MAX_PTS)));
    const innerR = Math.min(mxX - mnX, mxY - mnY) * 0.32;
    const fgPts = [], bgPts = [];
    for (let y = bbY0; y <= bbY1; y += stride) {
      for (let x = bbX0; x <= bbX1; x += stride) {
        const i = y * w + x, p = i * 4;
        if (px[p + 3] === 0) continue;
        const rgb = [px[p], px[p + 1], px[p + 2]];
        if (inLasso[i] && Math.hypot(x - cenX, y - cenY) <= innerR) {
          if (fgPts.length < MAX_PTS) fgPts.push(rgb);
        } else if (!inLasso[i] && bgPts.length < MAX_PTS) {
          bgPts.push(rgb);
        }
      }
    }
    if (fgPts.length < 30) {
      for (let y = bbY0; y <= bbY1; y += stride) {
        for (let x = bbX0; x <= bbX1; x += stride) {
          const i = y * w + x, p = i * 4;
          if (inLasso[i] && px[p + 3] > 0 && fgPts.length < MAX_PTS) fgPts.push([px[p], px[p + 1], px[p + 2]]);
        }
      }
    }
    if (bgPts.length < 80) {
      for (let i = 0; i < w * h && bgPts.length < MAX_PTS; i++) {
        if (!inLasso[i] && px[i * 4 + 3] > 0) bgPts.push([px[i * 4], px[i * 4 + 1], px[i * 4 + 2]]);
      }
    }
    if (!fgPts.length || !bgPts.length) return inLasso;

    const fgAvg = [0, 0, 0], bgAvg = [0, 0, 0];
    fgPts.forEach(([r, g, b]) => { fgAvg[0] += r; fgAvg[1] += g; fgAvg[2] += b; });
    bgPts.forEach(([r, g, b]) => { bgAvg[0] += r; bgAvg[1] += g; bgAvg[2] += b; });
    fgAvg[0] /= fgPts.length; fgAvg[1] /= fgPts.length; fgAvg[2] /= fgPts.length;
    bgAvg[0] /= bgPts.length; bgAvg[1] /= bgPts.length; bgAvg[2] /= bgPts.length;
    const colorContrast = sqDist3(fgAvg, bgAvg);

    const seg = await getMagicSegmenter();
    if (seg) {
      try {
        const result = seg.segment(canvas, { keypoint: { x: cenX / w, y: cenY / h } });
        const conf = result.confidenceMasks[0].getAsFloat32Array();
        result.close();
        const subject = new Uint8Array(w * h);
        let kept = 0;
        const confThresh = colorContrast > 5000 ? 0.75 : 0.65;
        for (let i = 0; i < w * h; i++) {
          if (inLasso[i] && conf[i] > confThresh) { subject[i] = 1; kept++; }
        }
        if (kept > lassoArea * 0.04 && kept < lassoArea * 0.96) return postProcess(subject);
      } catch (e) {
        console.warn('[magic] ML error:', e);
      }
    }

    const minDistTo = (rgb, centres) => centres.reduce((best, c) => Math.min(best, sqDist3(rgb, c)), Infinity);
    const classify = (fgC, bgC) => {
      const sub = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        if (!inLasso[i] || px[i * 4 + 3] === 0) continue;
        const p = i * 4, rgb = [px[p], px[p + 1], px[p + 2]];
        if (minDistTo(rgb, fgC) <= minDistTo(rgb, bgC)) sub[i] = 1;
      }
      return sub;
    };
    if (colorContrast >= 5000) {
      const subject = classify([fgAvg], [bgAvg]);
      const kept = subject.reduce((a, v) => a + v, 0);
      if (kept > lassoArea * 0.04 && kept < lassoArea * 0.96) return postProcess(subject);
    }
    const K = 8, ITER = 20;
    let fgC = kMeans(fgPts, K, ITER), bgC = kMeans(bgPts, K, ITER);
    let subject = classify(fgC, bgC);
    const fgPts2 = [], bgPts2 = [...bgPts];
    for (let y = bbY0; y <= bbY1; y += stride) {
      for (let x = bbX0; x <= bbX1; x += stride) {
        const i = y * w + x, p = i * 4;
        if (!inLasso[i] || px[p + 3] === 0) continue;
        const rgb = [px[p], px[p + 1], px[p + 2]];
        if (subject[i] && fgPts2.length < MAX_PTS) fgPts2.push(rgb);
        else if (!subject[i] && bgPts2.length < MAX_PTS) bgPts2.push(rgb);
      }
    }
    if (fgPts2.length > K && bgPts2.length > K) {
      fgC = kMeans(fgPts2, K, ITER); bgC = kMeans(bgPts2, K, ITER);
      subject = classify(fgC, bgC);
    }
    return postProcess(subject);
  }, [canvasRef, ctxRef, showToast]);

  const paintRefine = useCallback((x, y) => {
    const mask = magicMaskRef.current;
    if (!mask) return;
    const r = toolRadiusRef.current;
    const r2 = r * r;
    const val = magicRefModeRef.current === 'pen' ? 1 : 0;
    const x0 = Math.max(0, Math.round(x - r)), x1 = Math.min(413, Math.round(x + r));
    const y0 = Math.max(0, Math.round(y - r)), y1 = Math.min(749, Math.round(y + r));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = px - x, dy = py - y;
        if (dx * dx + dy * dy <= r2) mask[py * 414 + px] = val;
      }
    }
    renderMask(mask);
  }, [renderMask, toolRadiusRef]);

  const pushMaskHistory = useCallback(() => {
    if (!magicMaskRef.current) return;
    magicMaskHistoryRef.current.push(magicMaskRef.current.slice());
    magicMaskRedoRef.current = [];
  }, []);

  const confirmLasso = useCallback(async () => {
    if (magicLassoRef.current.length < 10 || magicDetecting) return;
    renderLasso(true);
    setMagicDetecting(true);
    setMagicConfirmDisabled(true);
    const mask = await detectMask();
    setMagicDetecting(false);
    if (!mask) {
      showToast('No selection found - draw a bigger area');
      reset();
      return;
    }
    magicMaskRef.current = mask;
    magicMaskHistoryRef.current = [mask.slice()];
    magicMaskRedoRef.current = [];
    magicPhaseRef.current = 'refine';
    setMagicPhase('refine');
    renderMask(mask);
    if (canvasRef.current) canvasRef.current.style.cursor = 'none';
    syncCursor();
    if (brushCursorRef.current) brushCursorRef.current.style.display = 'block';
  }, [brushCursorRef, canvasRef, detectMask, magicDetecting, renderLasso, renderMask, reset, showToast, syncCursor]);

  const apply = useCallback(() => {
    const mask = magicMaskRef.current;
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!mask || !canvas || !ctx) return;
    let imgData;
    try { imgData = ctx.getImageData(0, 0, canvas.width, canvas.height); }
    catch (e) { showToast('Cannot apply - try again'); return; }
    const d = imgData.data;
    const targetAlpha = Math.round(255 * (1 - magicOpacityRef.current / 100));
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) d[i * 4 + 3] = Math.min(d[i * 4 + 3], targetAlpha);
    }
    ctx.putImageData(imgData, 0, 0);
    pushHistory();
    reset();
  }, [canvasRef, ctxRef, pushHistory, reset, showToast]);

  const setRefMode = useCallback((mode) => {
    magicRefModeRef.current = mode;
    setMagicRefMode(mode);
  }, []);

  const handleOpacityInput = useCallback((e) => {
    const val = +e.target.value;
    magicOpacityRef.current = val;
    setMagicOpacity(val);
    e.target.style.setProperty('--fill', val + '%');
    if (selectionCanvasRef.current) selectionCanvasRef.current.style.opacity = String(val / 100);
  }, [selectionCanvasRef]);

  return {
    magicPhaseRef,
    magicLassoRef,
    magicDrawingRef,
    magicRefiningRef,
    magicPhase,
    magicConfirmDisabled,
    magicDetecting,
    magicRefMode,
    magicOpacity,
    clearOverlay,
    renderLasso,
    reset,
    paintRefine,
    pushMaskHistory,
    confirmLasso,
    apply,
    setConfirmDisabled: setMagicConfirmDisabled,
    setRefMode,
    handleOpacityInput,
  };
}
