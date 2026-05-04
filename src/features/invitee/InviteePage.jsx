import React, { useEffect, useRef, useState, useCallback } from 'react';
import '../../styles/invitee.css';
import { delay, dataUrlToBlob, getPos } from '../editor/utils/canvas.js';
import { useToast } from '../editor/hooks/useToast.js';
import { useStickerSystem } from '../editor/hooks/useStickerSystem.js';
import StickerPanel from '../editor/components/StickerPanel.jsx';
import DrawingToolOverlays from '../editor/components/DrawingToolOverlays.jsx';
import ConfirmDialog from '../editor/components/ConfirmDialog.jsx';
import InviteeToolbar from './components/InviteeToolbar.jsx';
import SolidIconButton from '../../components/ui/SolidIconButton.jsx';
import { INVITEE_FLOW_STATES } from './state.js';

const TIMER_STEPS = [0, 3, 6, 10];
const DEFAULT_FRAME_NAME = 'babe, wake up';
const DEFAULT_FRAME_URL = 'canvas-frame-teletubby.png';

export default function InviteePage() {
  // ── DOM refs ──
  const screenRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const photoContainerRef = useRef(null);
  const photoOverlayRef = useRef(null);
  const tmLeftPanelRef = useRef(null);
  const tmSizeHandleRef = useRef(null);
  const brushCursorRef = useRef(null);
  const brushCursorSvgRef = useRef(null);
  const brushCursorCircleRef = useRef(null);
  const eraserOpacitySliderRef = useRef(null);
  const photoLibraryInputRef = useRef(null);
  const countdownNumberRef = useRef(null);
  const flashOverlayRef = useRef(null);
  const darkFlashRef = useRef(null);

  // ── Imperative state refs ──
  const activeStreamRef = useRef(null);
  const currentFacingRef = useRef('environment');
  const capturedDataUrlRef = useRef(null);
  const compositeBlobRef = useRef(null);
  const transitionInProgressRef = useRef(false);
  const captureInProgressRef = useRef(false);
  const countdownActiveRef = useRef(false);
  const timerIndexRef = useRef(0);
  const lastPinchEndTimeRef = useRef(0);
  const photoScaleRef = useRef(1);
  const photoRotationRef = useRef(0);
  const gestureRef = useRef({ active: false, initDist: 0, initAngle: 0, initScale: 1, initRot: 0 });

  // ── Drawing state refs ──
  const activeToolRef = useRef(null);
  const toolRadiusRef = useRef(32);
  const doodleColorRef = useRef('#FFFFFF');
  const penTypeRef = useRef('pen');
  const paintingRef = useRef(false);
  const lastXRef = useRef(0);
  const lastYRef = useRef(0);
  const toolUndoStackRef = useRef([]);
  const toolRedoStackRef = useRef([]);
  const sessionEntrySnapRef = useRef(null);
  const lpCollapseTimerRef = useRef(null);
  const trackDraggingRef = useRef(false);
  const labelPressTimerRef = useRef(null);
  const labelCollapseTimerRef = useRef(null);

  // ── Timer refs ──
  const confirmResolveRef = useRef(null);
  const hintTimerRef = useRef(null);

  // Track constants
  const PANEL_W = 56, TRACK_TOP_Y = 38, TRACK_BOT_Y = 210;
  const HANDLE_MIN = 6, HANDLE_MAX = 38;

  // ── React state (affects JSX) ──
  const [screenClass, setScreenClass] = useState('');
  const [activeTool, setActiveTool] = useState(null);
  const [doodleColor, setDoodleColor] = useState('#FFFFFF');
  const [penType, setPenType] = useState('pen');
  const [frameUrl] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('frame') || DEFAULT_FRAME_URL;
  });
  const [frameName] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('name') || DEFAULT_FRAME_NAME;
  });
  const isCustomFrame = frameUrl !== DEFAULT_FRAME_URL;

  // Visibility states
  const [inviteCardVisible, setInviteCardVisible] = useState(false);
  const [scrimVisible, setScrimVisible] = useState(false);
  const [bottomSheetVisible, setBottomSheetVisible] = useState(false);
  const [screen4CardVisible, setScreen4CardVisible] = useState(false);
  const [camTopBarVisible, setCamTopBarVisible] = useState(false);
  const [camTopBarMode, setCamTopBarMode] = useState(''); // '' | 'gallery-mode' | 'capture-mode'
  const [camBottomBarVisible, setCamBottomBarVisible] = useState(false);
  const [camTopGradientVisible, setCamTopGradientVisible] = useState(false);
  const [tapHintVisible, setTapHintVisible] = useState(false);
  const [tapHintHiding, setTapHintHiding] = useState(false);
  const [countdownVisible, setCountdownVisible] = useState(false);
  const [countdownNum, setCountdownNum] = useState('');
  const [timerValue, setTimerValue] = useState(0);
  const [cutoutGlowHidden, setCutoutGlowHidden] = useState(false);
  const [camPopupVisible, setCamPopupVisible] = useState(false);

  // S6 states
  const [s6Visible, setS6Visible] = useState(false);
  const [s6ExitVisible, setS6ExitVisible] = useState(false);
  const [s6ToolsVisible, setS6ToolsVisible] = useState(false);
  const [s6ToolsOut, setS6ToolsOut] = useState(false);
  const [s6BottomBarVisible, setS6BottomBarVisible] = useState(false);
  const [s7PopVisible, setS7PopVisible] = useState(false);
  const [s7PopCode, setS7PopCode] = useState('');
  const [labelsExpanded, setLabelsExpanded] = useState(false);
  const s6BottomBarVisibleBeforeStickerDragRef = useRef(false);

  // Tool mode states
  const [tmIn, setTmIn] = useState(false);
  const [tmLeftIn, setTmLeftIn] = useState(false);
  const [tmPenBarIn, setTmPenBarIn] = useState(false);
  const [tmUndoBtnDisabled, setTmUndoBtnDisabled] = useState(true);
  const [tmRedoBtnDisabled, setTmRedoBtnDisabled] = useState(true);

  // Confirm dialog
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmScrimVisible, setConfirmScrimVisible] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState('');
  const [confirmOkLabel, setConfirmOkLabel] = useState('');
  const [confirmDanger, setConfirmDanger] = useState(false);
  const [confirmCancelLabel, setConfirmCancelLabel] = useState('Stay');

  // ── Toast ──
  const { toastMsg, toastVisible, showToast } = useToast(1600);

  // ── Sticker system ──
  const handleStickerItemDragStart = useCallback(() => {
    setS6BottomBarVisible(prev => {
      s6BottomBarVisibleBeforeStickerDragRef.current = prev;
      return false;
    });
  }, []);
  const handleStickerItemDragEnd = useCallback(() => {
    if (s6BottomBarVisibleBeforeStickerDragRef.current) {
      setS6BottomBarVisible(true);
    }
    s6BottomBarVisibleBeforeStickerDragRef.current = false;
  }, []);
  const stickerSys = useStickerSystem({
    ctxRef,
    setScrimVisible,
    onItemDragStart: handleStickerItemDragStart,
    onItemDragEnd: handleStickerItemDragEnd,
    // no onBeforeOpen — InviteePage handles this in its own openStickerPanel
  });
  const {
    stickerOverlayRef, placedStickersRef,
    closePanel: closeStickerPanel,
    placeSticker, drawStickersToContext, clearStickers,
  } = stickerSys;

  // ── Helpers ──
  const showConfirm = useCallback((message, okLabel, danger = false, cancelLabel = 'Stay') => {
    return new Promise(resolve => {
      confirmResolveRef.current = resolve;
      setConfirmMsg(message);
      setConfirmOkLabel(okLabel);
      setConfirmDanger(danger);
      setConfirmCancelLabel(cancelLabel);
      setConfirmScrimVisible(true);
      setConfirmVisible(true);
    });
  }, []);

  const dismissConfirm = useCallback((val) => {
    setConfirmScrimVisible(false);
    setConfirmVisible(false);
    if (confirmResolveRef.current) {
      confirmResolveRef.current(val);
      confirmResolveRef.current = null;
    }
  }, []);

  // ── Track panel ──
  const setHandlePos = useCallback((norm) => {
    const size = Math.round(HANDLE_MIN + norm * (HANDLE_MAX - HANDLE_MIN));
    const trackY = TRACK_TOP_Y + (1 - norm) * (TRACK_BOT_Y - TRACK_TOP_Y);
    const h = tmSizeHandleRef.current;
    if (!h) return;
    h.style.width = size + 'px';
    h.style.height = size + 'px';
    h.style.top = (trackY - size / 2) + 'px';
    h.style.left = ((PANEL_W - size) / 2) + 'px';
  }, []);

  const syncCursor = useCallback(() => {
    const r = toolRadiusRef.current;
    const d = r * 2 + 8;
    const svg = brushCursorSvgRef.current;
    const circle = brushCursorCircleRef.current;
    if (!svg || !circle) return;
    svg.setAttribute('width', d);
    svg.setAttribute('height', d);
    svg.setAttribute('viewBox', `${-d/2} ${-d/2} ${d} ${d}`);
    circle.setAttribute('r', r);
    if (activeToolRef.current === 'doodle') {
      const alpha = doodleColorRef.current === '#FFFFFF' ? '44' : '55';
      circle.setAttribute('fill', doodleColorRef.current + alpha);
      circle.setAttribute('stroke', doodleColorRef.current);
      circle.setAttribute('stroke-dasharray', '');
      circle.setAttribute('stroke-width', '2');
    } else {
      circle.setAttribute('fill', 'rgba(255,255,255,0.06)');
      circle.setAttribute('stroke', 'rgba(255,255,255,0.8)');
      circle.setAttribute('stroke-dasharray', '4 3');
      circle.setAttribute('stroke-width', '1.5');
    }
  }, []);

  const expandLeftPanel = useCallback(() => {
    if (tmLeftPanelRef.current) tmLeftPanelRef.current.style.transform = 'translateX(0)';
    clearTimeout(lpCollapseTimerRef.current);
    lpCollapseTimerRef.current = setTimeout(() => {
      if (activeToolRef.current && tmLeftPanelRef.current) {
        tmLeftPanelRef.current.style.transform = 'translateX(-28px)';
      }
    }, 1800);
  }, []);

  const applyTrackNorm = useCallback((norm) => {
    norm = Math.max(0, Math.min(1, norm));
    toolRadiusRef.current = Math.round(4 + norm * (60 - 4));
    setHandlePos(norm);
    syncCursor();
    expandLeftPanel();
  }, [setHandlePos, syncCursor, expandLeftPanel]);

  const normFromClientY = useCallback((clientY) => {
    const rect = tmLeftPanelRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1,
      1 - (clientY - rect.top - TRACK_TOP_Y) / (TRACK_BOT_Y - TRACK_TOP_Y)));
  }, []);

  const syncToolHistoryBtns = useCallback(() => {
    setTmUndoBtnDisabled(toolUndoStackRef.current.length <= 1);
    setTmRedoBtnDisabled(toolRedoStackRef.current.length === 0);
  }, []);

  // ── Drawing ──
  const paintAt = useCallback((x, y, fx, fy) => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(x, y);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (penTypeRef.current === 'pencil') {
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
      ctx.lineWidth = toolRadiusRef.current * 2;
      ctx.stroke();
    }
    ctx.restore();
  }, []);

  // ── Photo transform ──
  const minScaleForAngle = useCallback((deg) => {
    const r = Math.abs(deg * Math.PI / 180) % (Math.PI / 2);
    const W = 421, H = 748;
    return Math.max(
      1,
      (W * Math.abs(Math.cos(r)) + H * Math.abs(Math.sin(r))) / W,
      (H * Math.abs(Math.cos(r)) + W * Math.abs(Math.sin(r))) / H
    );
  }, []);

  const applyPhotoTransform = useCallback(() => {
    const minS = minScaleForAngle(photoRotationRef.current);
    if (photoScaleRef.current < minS) photoScaleRef.current = minS;
    if (photoOverlayRef.current) {
      photoOverlayRef.current.style.transform =
        `translate(-50%, -50%) scale(${photoScaleRef.current}) rotate(${photoRotationRef.current}deg) scaleX(-1)`;
    }
  }, [minScaleForAngle]);

  // ── Capture ──
  const capturePhoto = useCallback(async () => {
    const canvas = captureCanvasRef.current;
    canvas.width = 414;
    canvas.height = 748;
    const ctx = canvas.getContext('2d');
    const photoContainer = photoContainerRef.current;
    const photoOverlay = photoOverlayRef.current;
    const cameraView = videoRef.current;

    if (photoContainer && photoContainer.classList.contains('active')) {
      ctx.save();
      ctx.translate(414 / 2, 748 / 2);
      ctx.scale(photoScaleRef.current, photoScaleRef.current);
      ctx.rotate(photoRotationRef.current * Math.PI / 180);
      const iw = photoOverlay.naturalWidth, ih = photoOverlay.naturalHeight;
      const boxAr = 414 / 748, imgAr = iw / ih;
      let sx, sy, sw, sh;
      if (imgAr > boxAr) { sh = ih; sw = sh * boxAr; sx = (iw - sw) / 2; sy = 0; }
      else { sw = iw; sh = sw / boxAr; sx = 0; sy = (ih - sh) / 2; }
      ctx.drawImage(photoOverlay, sx, sy, sw, sh, -414 / 2, -748 / 2, 414, 748);
      ctx.restore();
    } else {
      const vw = cameraView.videoWidth || 414;
      const vh = cameraView.videoHeight || 748;
      const boxAr = 414 / 748, vidAr = vw / vh;
      let sx, sy, sw, sh;
      if (vidAr > boxAr) { sh = vh; sw = sh * boxAr; sx = (vw - sw) / 2; sy = 0; }
      else { sw = vw; sh = sw / boxAr; sx = 0; sy = (vh - sh) / 2; }
      ctx.drawImage(cameraView, sx, sy, sw, sh, 0, 0, 414, 748);
    }
    return canvas.toDataURL('image/jpeg', 0.92);
  }, []);

  const buildCompositeBlob = useCallback(async () => {
    const W = 414, H = 750;
    const offscreen = document.createElement('canvas');
    offscreen.width = W; offscreen.height = H;
    const cctx = offscreen.getContext('2d');

    // 1. Photo background
    const photo = new Image();
    await new Promise((res, rej) => { photo.onload = res; photo.onerror = rej; photo.src = capturedDataUrlRef.current; });
    cctx.drawImage(photo, 0, 0, W, H);

    // 2. Doodle canvas (pen/pencil/marker drawings)
    cctx.drawImage(canvasRef.current, 0, 0, W, H);

    // 3. Placed stickers (non-destructive, properly async)
    await drawStickersToContext(cctx);

    // 4. Frame overlay.
    //    Uploaded invite frames are transparent PNG overlays and can be drawn directly.
    //    The built-in demo frame uses a CSS mask, so canvas reproduces that mask.
    //    The live UI uses:
    //      mask-image: radial-gradient(105px 105px at 50% 23%,
    //        rgba(0,0,0,0) 55%, rgba(0,0,0,0.5) 78%, rgb(0,0,0) 100%)
    //    which punches a circular hole for the user's photo. Canvas ignores CSS,
    //    so we reproduce it manually with destination-out on a temp canvas.
    const frameEl = document.getElementById('yunchaiPhoto');
    if (frameEl && frameEl.complete && frameEl.naturalWidth > 0) {
      try {
        if (isCustomFrame) {
          cctx.drawImage(frameEl, 0, 0, W, H);
          return new Promise((res, rej) =>
            offscreen.toBlob(b => b ? res(b) : rej(new Error('toBlob null')), 'image/jpeg', 0.92)
          );
        }

        // 4a. Draw raw demo frame onto a temp canvas
        const fCanvas = document.createElement('canvas');
        fCanvas.width = W; fCanvas.height = H;
        const fCtx = fCanvas.getContext('2d');
        fCtx.drawImage(frameEl, -8, 0, 430, H);

        // 4b. Punch the cutout hole using destination-out + radial gradient.
        //     Frame element is 430px wide, offset -8px → mask centre on canvas:
        //       cx = (50% of 430) - 8 = 207px
        //       cy = 23% of 750     = 172.5px
        //     Gradient stops are the INVERSE of the CSS mask alpha
        //     (CSS alpha=0 → we fully remove; CSS alpha=1 → we don't remove).
        const cx = 207, cy = 172.5, r = 105;
        const grad = fCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0,    'rgba(0,0,0,1)');    // fully remove (CSS alpha=0)
        grad.addColorStop(0.55, 'rgba(0,0,0,1)');    // fully remove
        grad.addColorStop(0.78, 'rgba(0,0,0,0.5)');  // half remove  (CSS alpha=0.5)
        grad.addColorStop(1.0,  'rgba(0,0,0,0)');    // keep intact   (CSS alpha=1)
        fCtx.globalCompositeOperation = 'destination-out';
        fCtx.fillStyle = grad;
        fCtx.fillRect(0, 0, W, H);

        // 4c. Composite the masked frame onto the main offscreen canvas
        cctx.drawImage(fCanvas, 0, 0);
      } catch (_) {
        // Skip frame on security error — drawings/stickers still included
      }
    }

    return new Promise((res, rej) =>
      offscreen.toBlob(b => b ? res(b) : rej(new Error('toBlob null')), 'image/jpeg', 0.92)
    );
  }, [drawStickersToContext, isCustomFrame]);

  const shareImage = useCallback((blob) => {
    if (navigator.share) {
      const file = new File([blob], 'retake.jpg', { type: 'image/jpeg' });
      const data = { title: 'My Retake!', text: frameName };
      const p = (navigator.canShare && navigator.canShare({ files: [file] }))
        ? navigator.share({ ...data, files: [file] })
        : navigator.share(data);
      p.catch(e => { if (e.name !== 'AbortError') showToast('Share failed'); });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'retake-' + Date.now() + '.jpg';
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
      showToast('Saved!');
    }
  }, [frameName, showToast]);

  const doFlash = useCallback(async (peakOpacity, holdMs, fadeMs) => {
    const fl = flashOverlayRef.current;
    if (!fl) return;
    fl.style.transition = 'none';
    fl.style.opacity = peakOpacity;
    await delay(holdMs);
    fl.style.transition = `opacity ${fadeMs}ms ease-out`;
    fl.style.opacity = '0';
    await delay(fadeMs);
  }, []);

  // ── Camera ──
  const activateCameraS3 = useCallback(async () => {
    setBottomSheetVisible(false);
    setScrimVisible(false);
    await delay(200);
    if (videoRef.current) videoRef.current.classList.add('active');
    const mkSlot = document.getElementById('mkSlotBg');
    if (mkSlot) mkSlot.style.opacity = '0';
    await delay(1200);
    setScrimVisible(true);
    setInviteCardVisible(true);
  }, []);

  const simulateCameraAccept = useCallback(async () => {
    setBottomSheetVisible(false);
    setScrimVisible(false);
    await delay(200);
    const mkSlot = document.getElementById('mkSlotBg');
    if (mkSlot) mkSlot.style.opacity = '0';
    if (videoRef.current) {
      videoRef.current.classList.add('active');
      videoRef.current.style.background = '#222';
    }
    await delay(1200);
    setScrimVisible(true);
    setInviteCardVisible(true);
  }, []);

  const handleAllowCamera = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      await simulateCameraAccept();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: 422, height: 750 }
      });
      activeStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      await activateCameraS3();
    } catch (err) {
      console.warn('Camera unavailable:', err.name, err.message);
      await simulateCameraAccept();
    }
  }, [simulateCameraAccept, activateCameraS3]);

  const clearDrawingCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    toolUndoStackRef.current = [];
    toolRedoStackRef.current = [];
    clearStickers();
  }, [clearStickers]);

  const transitionToS6 = useCallback(async () => {
    if (transitionInProgressRef.current || !capturedDataUrlRef.current) return;
    transitionInProgressRef.current = true;

    const fl = flashOverlayRef.current;
    if (fl) { fl.style.transition = 'none'; fl.style.opacity = '0.88'; }
    await delay(45);

    setScreenClass('screen6-bg');
    setCamTopBarVisible(false);
    setCamTopBarMode('');
    setCamBottomBarVisible(false);
    const proc = document.getElementById('btnProceed');
    if (proc) { proc.style.transform = ''; }

    if (fl) {
      fl.style.transition = 'opacity 340ms ease-out';
      fl.style.opacity = '0';
    }
    await delay(200);

    clearDrawingCanvas();

    setS6ExitVisible(true);
    setS6Visible(true);
    await delay(80);
    setS6ToolsVisible(true);
    await delay(70);
    setS6BottomBarVisible(true);

    transitionInProgressRef.current = false;

    compositeBlobRef.current = null;
    buildCompositeBlob()
      .then(b => { compositeBlobRef.current = b; })
      .catch(e => {
        console.error('Pre-built composite failed:', e);
        compositeBlobRef.current = dataUrlToBlob(capturedDataUrlRef.current);
      });
  }, [clearDrawingCanvas, buildCompositeBlob]);

  const executeCapture = useCallback(async () => {
    const isGallery = photoContainerRef.current && photoContainerRef.current.classList.contains('active');
    const dataUrl = await capturePhoto();

    if (!isGallery) {
      photoScaleRef.current = 1; photoRotationRef.current = 0;
      if (photoOverlayRef.current) {
        photoOverlayRef.current.src = dataUrl;
        await new Promise(r => { photoOverlayRef.current.onload = r; photoOverlayRef.current.onerror = r; });
        if (photoContainerRef.current) photoContainerRef.current.classList.add('active');
        applyPhotoTransform();
      }
    }
    capturedDataUrlRef.current = dataUrl;

    const fl = flashOverlayRef.current;
    if (fl) { fl.style.transition = 'none'; fl.style.opacity = '0.88'; }
    await delay(45);

    setCamTopGradientVisible(false);
    setCamPopupVisible(false);

    if (fl) { fl.style.transition = 'opacity 340ms ease-out'; fl.style.opacity = '0'; }
    setCamTopBarMode('capture-mode');
  }, [capturePhoto, applyPhotoTransform]);

  const startCapture = useCallback(async () => {
    if (countdownActiveRef.current || captureInProgressRef.current) return;
    if (!camTopBarVisible) return;

    const seconds = TIMER_STEPS[timerIndexRef.current];
    if (seconds === 0) {
      captureInProgressRef.current = true;
      await executeCapture();
      captureInProgressRef.current = false;
      return;
    }

    countdownActiveRef.current = true;

    async function breatheIn(n) {
      setCountdownNum(String(n));
      countdownNumberRef.current.style.cssText = 'opacity:0; transform:scale(0.38); transition:none;';
      await delay(16);
      countdownNumberRef.current.style.cssText =
        'opacity:1; transform:scale(1);' +
        'transition: opacity 0.2s ease-out, transform 0.52s cubic-bezier(0.34,1.46,0.64,1);';
    }
    async function breatheOut() {
      countdownNumberRef.current.style.cssText =
        'opacity:0; transform:scale(0.52);' +
        'transition: opacity 0.2s ease-in, transform 0.24s ease-in;';
      await delay(220);
    }

    setCountdownVisible(true);
    await breatheIn(seconds);
    await delay(860);

    for (let i = seconds - 1; i >= 1; i--) {
      if (!countdownActiveRef.current) break;
      doFlash('0.09', 20, 160);
      await breatheOut();
      if (!countdownActiveRef.current) break;
      await breatheIn(i);
      await delay(750);
    }

    if (!countdownActiveRef.current) {
      countdownNumberRef.current.style.cssText =
        'opacity:0; transform:scale(0.6);transition: opacity 0.26s ease, transform 0.26s ease;';
      await delay(280);
      setCountdownVisible(false);
      return;
    }

    countdownActiveRef.current = false;
    doFlash('0.09', 20, 160);
    await breatheOut();
    setCountdownVisible(false);
    await delay(40);
    captureInProgressRef.current = true;
    await executeCapture();
    captureInProgressRef.current = false;
  }, [camTopBarVisible, executeCapture, doFlash]);

  const enterCameraUI = useCallback(async () => {
    setScreen4CardVisible(false);
    await delay(280);
    setCamTopBarVisible(true);
    setCamBottomBarVisible(true);
    setCutoutGlowHidden(true);
    await delay(300);
    setTapHintVisible(true);

    const dismissHint = (e) => {
      if (e) e.stopPropagation();
      setTapHintHiding(true);
      setTimeout(() => { setTapHintVisible(false); setTapHintHiding(false); }, 500);
      screenRef.current && screenRef.current.removeEventListener('click', dismissHint, true);
      clearTimeout(hintTimerRef.current);
    };
    hintTimerRef.current = setTimeout(() => dismissHint(null), 10000);
    if (screenRef.current) screenRef.current.addEventListener('click', dismissHint, true);
  }, []);

  // ── Tool mode ──
  const exitToolMode = useCallback(() => {
    activeToolRef.current = null;
    setActiveTool(null);
    clearTimeout(lpCollapseTimerRef.current);
    syncToolHistoryBtns();

    setTmIn(false);
    setTmLeftIn(false);
    setTmPenBarIn(false);
    if (tmLeftPanelRef.current) tmLeftPanelRef.current.style.transform = '';

    setTimeout(() => {
      setS6ExitVisible(true);
      setS6ToolsVisible(true);
      setS6ToolsOut(false);
      setS6BottomBarVisible(true);
    }, 100);

    if (canvasRef.current) canvasRef.current.classList.add('no-tool');
    /* Restore sticker overlay + individual sticker pointer events */
    if (stickerOverlayRef.current) stickerOverlayRef.current.style.pointerEvents = '';
    placedStickersRef.current.forEach(stk => { stk.el.style.pointerEvents = ''; });
    if (brushCursorRef.current) brushCursorRef.current.style.display = 'none';
  }, [syncToolHistoryBtns, stickerOverlayRef, placedStickersRef]);

  const configureLeftPanel = useCallback(() => {
    toolRadiusRef.current = Math.round(4 + 0.1 * (60 - 4));
    setHandlePos(0.1);
    syncCursor();
  }, [setHandlePos, syncCursor]);

  const enterToolMode = useCallback((tool) => {
    activeToolRef.current = tool;
    setActiveTool(tool);
    const canvas = canvasRef.current;
    sessionEntrySnapRef.current = canvas.toDataURL();
    toolUndoStackRef.current = [sessionEntrySnapRef.current];
    toolRedoStackRef.current = [];
    configureLeftPanel();
    syncToolHistoryBtns();

    setS6ExitVisible(false);
    setS6ToolsOut(true);
    setS6BottomBarVisible(false);
    setTimeout(() => { setS6ToolsVisible(false); setS6ToolsOut(false); }, 400);

    setTimeout(() => {
      setTmIn(true);
      setTmLeftIn(true);
      setTmPenBarIn(true);
      expandLeftPanel();
    }, 120);

    if (canvas) canvas.classList.remove('no-tool');
    /* Disable sticker overlay + individual sticker elements so they never block canvas drawing */
    if (stickerOverlayRef.current) stickerOverlayRef.current.style.pointerEvents = 'none';
    placedStickersRef.current.forEach(stk => { stk.el.style.pointerEvents = 'none'; });
    syncCursor();
    if (brushCursorRef.current) brushCursorRef.current.style.display = 'none';
  }, [configureLeftPanel, syncToolHistoryBtns, expandLeftPanel, syncCursor, stickerOverlayRef, placedStickersRef]);

  // Override openPanel to also call exitToolMode first
  const openStickerPanel = useCallback(() => {
    if (activeToolRef.current) exitToolMode();
    stickerSys.openPanel();
  }, [exitToolMode, stickerSys]);

  const toolUndo = useCallback(() => {
    if (toolUndoStackRef.current.length <= 1) return;
    toolRedoStackRef.current.push(toolUndoStackRef.current.pop());
    const img = new Image();
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0); };
    img.src = toolUndoStackRef.current[toolUndoStackRef.current.length - 1];
    syncToolHistoryBtns();
  }, [syncToolHistoryBtns]);

  const toolRedo = useCallback(() => {
    if (!toolRedoStackRef.current.length) return;
    const snap = toolRedoStackRef.current.pop();
    toolUndoStackRef.current.push(snap);
    const img = new Image();
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0); };
    img.src = snap;
    syncToolHistoryBtns();
  }, [syncToolHistoryBtns]);

  // ── Retake / Exit ──
  const retakeFromEdit = useCallback(async () => {
    if (activeToolRef.current) exitToolMode();
    setS6ExitVisible(false);
    setS6ToolsVisible(false);
    setS6BottomBarVisible(false);

    const darkFlash = darkFlashRef.current;
    if (darkFlash) { darkFlash.style.transition = 'none'; darkFlash.style.opacity = '0.22'; }
    await delay(65);

    setScreenClass('screen4-bg');
    if (photoContainerRef.current) photoContainerRef.current.classList.remove('active');
    if (photoOverlayRef.current) photoOverlayRef.current.src = '';
    setCamTopBarMode('');
    setCamTopGradientVisible(true);
    capturedDataUrlRef.current = null; compositeBlobRef.current = null;
    transitionInProgressRef.current = false;
    const proc = document.getElementById('btnProceed');
    if (proc) { proc.style.transform = ''; proc.style.transition = ''; }

    if (darkFlash) { darkFlash.style.transition = 'opacity 280ms ease-out'; darkFlash.style.opacity = '0'; }
    await delay(180);

    setCamTopBarVisible(true);
    setCamBottomBarVisible(true);
    timerIndexRef.current = 0;
    setTimerValue(0);
  }, [exitToolMode]);

  const exitSession = useCallback(async () => {
    if (activeToolRef.current) exitToolMode();
    setS6ExitVisible(false);
    setS6ToolsVisible(false);
    setS6BottomBarVisible(false);

    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach(t => t.stop());
      activeStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.classList.remove('active');
    }

    setScreenClass('');
    if (photoContainerRef.current) photoContainerRef.current.classList.remove('active');
    if (photoOverlayRef.current) photoOverlayRef.current.src = '';
    setCamTopBarVisible(false);
    setCamTopBarMode('');
    setCamBottomBarVisible(false);
    setCamTopGradientVisible(false);
    setCutoutGlowHidden(false);
    setTapHintVisible(false);
    setTapHintHiding(false);
    timerIndexRef.current = 0;
    setTimerValue(0);
    capturedDataUrlRef.current = null; compositeBlobRef.current = null;
    transitionInProgressRef.current = false;
    currentFacingRef.current = 'environment';
    const proc = document.getElementById('btnProceed');
    if (proc) { proc.style.transform = ''; proc.style.transition = ''; }
    const mkSlot = document.getElementById('mkSlotBg');
    if (mkSlot) mkSlot.style.opacity = '1';
    setInviteCardVisible(false);
    setScrimVisible(false);
    setS6Visible(false);
  }, [exitToolMode]);

  // ── Main useEffect ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctxRef.current = ctx;

    setHandlePos(0.1);
    syncCursor();

    // Canvas drawing events
    const onCanvasMouseDown = (e) => {
      if (!activeToolRef.current) return;
      const [x, y] = getPos(e, canvas);
      paintingRef.current = true;
      lastXRef.current = x; lastYRef.current = y;
      paintAt(x, y, x, y);
    };
    const onCanvasMouseMove = (e) => {
      if (!activeToolRef.current) return;
      const [x, y] = getPos(e, canvas);
      const r = canvas.getBoundingClientRect();
      if (brushCursorRef.current) {
        brushCursorRef.current.style.left = (e.clientX - r.left) + 'px';
        brushCursorRef.current.style.top  = (e.clientY - r.top)  + 'px';
        brushCursorRef.current.style.display = 'block';
      }
      if (paintingRef.current) { paintAt(x, y, lastXRef.current, lastYRef.current); lastXRef.current = x; lastYRef.current = y; }
    };
    const onCanvasMouseLeave = () => { if (brushCursorRef.current) brushCursorRef.current.style.display = 'none'; };
    const onDocMouseUp = () => {
      if (paintingRef.current) {
        paintingRef.current = false;
        toolUndoStackRef.current.push(canvas.toDataURL());
        toolRedoStackRef.current = [];
        syncToolHistoryBtns();
      }
    };
    const onCanvasTouchStart = (e) => {
      if (!activeToolRef.current) return; e.preventDefault();
      const [x, y] = getPos(e, canvas);
      paintingRef.current = true; lastXRef.current = x; lastYRef.current = y;
      paintAt(x, y, x, y);
    };
    const onCanvasTouchMove = (e) => {
      if (!activeToolRef.current || !paintingRef.current) return; e.preventDefault();
      const [x, y] = getPos(e, canvas);
      paintAt(x, y, lastXRef.current, lastYRef.current); lastXRef.current = x; lastYRef.current = y;
    };
    const onCanvasTouchEnd = () => {
      if (paintingRef.current) {
        paintingRef.current = false;
        toolUndoStackRef.current.push(canvas.toDataURL());
        toolRedoStackRef.current = [];
        syncToolHistoryBtns();
      }
    };

    canvas.addEventListener('mousedown', onCanvasMouseDown);
    canvas.addEventListener('mousemove', onCanvasMouseMove);
    canvas.addEventListener('mouseleave', onCanvasMouseLeave);
    document.addEventListener('mouseup', onDocMouseUp);
    canvas.addEventListener('touchstart', onCanvasTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onCanvasTouchMove, { passive: false });
    canvas.addEventListener('touchend', onCanvasTouchEnd, { passive: true });

    // Photo container pinch/rotate
    const photoContainer = photoContainerRef.current;
    function touchDist(t) {
      const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    function touchAngle(t) {
      return Math.atan2(t[1].clientY - t[0].clientY, t[1].clientX - t[0].clientX) * 180 / Math.PI;
    }
    const onPhotoTouchStart = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        gestureRef.current = {
          active: true,
          initDist: touchDist(e.touches),
          initAngle: touchAngle(e.touches),
          initScale: photoScaleRef.current,
          initRot: photoRotationRef.current
        };
      }
    };
    const onPhotoTouchMove = (e) => {
      if (!gestureRef.current.active || e.touches.length !== 2) return;
      e.preventDefault();
      photoScaleRef.current = gestureRef.current.initScale * (touchDist(e.touches) / gestureRef.current.initDist);
      photoRotationRef.current = gestureRef.current.initRot + (touchAngle(e.touches) - gestureRef.current.initAngle);
      applyPhotoTransform();
    };
    const onPhotoTouchEnd = () => {
      if (gestureRef.current.active) lastPinchEndTimeRef.current = Date.now();
      gestureRef.current.active = false;
    };
    if (photoContainer) {
      photoContainer.addEventListener('touchstart', onPhotoTouchStart, { passive: false });
      photoContainer.addEventListener('touchmove', onPhotoTouchMove, { passive: false });
      photoContainer.addEventListener('touchend', onPhotoTouchEnd);
    }

    // Left panel track drag
    const panel = tmLeftPanelRef.current;
    const onPanelMouseEnter = () => expandLeftPanel();
    const onPanelMouseDown = (e) => { trackDraggingRef.current = true; applyTrackNorm(normFromClientY(e.clientY)); };
    const onDocTrackMouseMove = (e) => { if (trackDraggingRef.current) applyTrackNorm(normFromClientY(e.clientY)); };
    const onDocTrackMouseUp = () => { trackDraggingRef.current = false; };
    const onPanelTouchStart = (e) => {
      expandLeftPanel(); trackDraggingRef.current = true;
      applyTrackNorm(normFromClientY(e.touches[0].clientY));
    };
    const onDocTouchMove = (e) => { if (trackDraggingRef.current) applyTrackNorm(normFromClientY(e.touches[0].clientY)); };
    const onDocTouchEnd = () => { trackDraggingRef.current = false; };
    if (panel) {
      panel.addEventListener('mouseenter', onPanelMouseEnter);
      panel.addEventListener('mousedown', onPanelMouseDown);
      panel.addEventListener('touchstart', onPanelTouchStart, { passive: true });
    }
    document.addEventListener('mousemove', onDocTrackMouseMove);
    document.addEventListener('mouseup', onDocTrackMouseUp);
    document.addEventListener('touchmove', onDocTouchMove, { passive: true });
    document.addEventListener('touchend', onDocTouchEnd, { passive: true });

    // Fit to viewport
    function fitToViewport() {
      if (window.innerWidth > 500) return;
      const s = document.querySelector('.screen');
      const scale = Math.min(window.innerWidth / 430, window.innerHeight / 932);
      const ox = (window.innerWidth - 430 * scale) / 2;
      const oy = (window.innerHeight - 932 * scale) / 2;
      if (s) s.style.transform = `translate(${ox}px, ${oy}px) scale(${scale})`;
    }
    fitToViewport();
    window.addEventListener('resize', fitToViewport);

    // Show camera permission sheet on load
    setTimeout(() => {
      setScrimVisible(true);
      setBottomSheetVisible(true);
    }, 900);

    return () => {
      canvas.removeEventListener('mousedown', onCanvasMouseDown);
      canvas.removeEventListener('mousemove', onCanvasMouseMove);
      canvas.removeEventListener('mouseleave', onCanvasMouseLeave);
      document.removeEventListener('mouseup', onDocMouseUp);
      canvas.removeEventListener('touchstart', onCanvasTouchStart);
      canvas.removeEventListener('touchmove', onCanvasTouchMove);
      canvas.removeEventListener('touchend', onCanvasTouchEnd);
      if (photoContainer) {
        photoContainer.removeEventListener('touchstart', onPhotoTouchStart);
        photoContainer.removeEventListener('touchmove', onPhotoTouchMove);
        photoContainer.removeEventListener('touchend', onPhotoTouchEnd);
      }
      if (panel) {
        panel.removeEventListener('mouseenter', onPanelMouseEnter);
        panel.removeEventListener('mousedown', onPanelMouseDown);
        panel.removeEventListener('touchstart', onPanelTouchStart);
      }
      document.removeEventListener('mousemove', onDocTrackMouseMove);
      document.removeEventListener('mouseup', onDocTrackMouseUp);
      document.removeEventListener('touchmove', onDocTouchMove);
      document.removeEventListener('touchend', onDocTouchEnd);
      window.removeEventListener('resize', fitToViewport);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Event handlers ──
  const handleAccept = useCallback(() => {
    setInviteCardVisible(false);
    setScrimVisible(false);
    setTimeout(() => enterCameraUI(), 250);
  }, [enterCameraUI]);

  const handleDecline = useCallback(() => {
    setInviteCardVisible(false);
    setScrimVisible(false);
  }, []);

  const handleNotNow = useCallback(() => {
    setBottomSheetVisible(false);
    setScrimVisible(false);
  }, []);

  const handleScrimClick = useCallback(() => {
    // Scrim in camera / S6 context closes sticker panel or nothing by default
    if (stickerSys.stickerPanelVisible) closeStickerPanel();
  }, [stickerSys.stickerPanelVisible, closeStickerPanel]);

  const handleCloseCamera = useCallback(async () => {
    const photoContainer = photoContainerRef.current;
    const hasContributed = (photoContainer && photoContainer.classList.contains('active')) || capturedDataUrlRef.current;
    if (!hasContributed) {
      const ok = await showConfirm(
        "Skip your turn? 👀\nYunchai is waiting for your photo.",
        'Skip for now', true, 'Stay & Shoot'
      );
      if (!ok) return;
    }
    setCamTopBarVisible(false);
    setCamBottomBarVisible(false);
    setCamPopupVisible(false);
    if (activeStreamRef.current) { activeStreamRef.current.getTracks().forEach(t => t.stop()); activeStreamRef.current = null; }
    if (videoRef.current) { videoRef.current.srcObject = null; videoRef.current.classList.remove('active'); }
    setCamTopGradientVisible(false);
    setScreenClass(c => c.replace('screen4-bg', ''));
    setCutoutGlowHidden(false);
    setTapHintVisible(false); setTapHintHiding(false);
  }, [showConfirm]);

  const handleFlipCam = useCallback(async () => {
    if (!navigator.mediaDevices) return;
    currentFacingRef.current = currentFacingRef.current === 'environment' ? 'user' : 'environment';
    if (activeStreamRef.current) activeStreamRef.current.getTracks().forEach(t => t.stop());
    try {
      activeStreamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: currentFacingRef.current }
      });
      if (videoRef.current) videoRef.current.srcObject = activeStreamRef.current;
    } catch(e) { /* ignore */ }
  }, []);

  const handleTimerClick = useCallback(() => {
    const idx = (timerIndexRef.current + 1) % TIMER_STEPS.length;
    timerIndexRef.current = idx;
    setTimerValue(TIMER_STEPS[idx]);
  }, []);

  const handleGalleryBtnClick = useCallback(() => {
    if (photoLibraryInputRef.current) photoLibraryInputRef.current.click();
  }, []);

  const handlePhotoLibraryChange = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    photoScaleRef.current = 1; photoRotationRef.current = 0;
    if (photoOverlayRef.current) {
      photoOverlayRef.current.src = url;
      photoOverlayRef.current.onload = () => {
        applyPhotoTransform();
        if (photoContainerRef.current) photoContainerRef.current.classList.add('active');
        setCamTopBarMode('gallery-mode');
        if (photoLibraryInputRef.current) photoLibraryInputRef.current.value = '';
        const proc = document.getElementById('btnProceed');
        if (proc) {
          proc.style.transition = 'none';
          proc.style.transform = 'scale(0.78)';
          requestAnimationFrame(() => {
            proc.style.transition = 'transform 0.42s cubic-bezier(0.34,1.56,0.64,1)';
            proc.style.transform = 'scale(1)';
          });
        }
      };
    }
  }, [applyPhotoTransform]);

  const handleTakePhotoInstead = useCallback(() => {
    if (photoContainerRef.current) photoContainerRef.current.classList.remove('active');
    if (photoOverlayRef.current) photoOverlayRef.current.src = '';
    setCamTopBarMode('');
    if (!capturedDataUrlRef.current) {
      const proc = document.getElementById('btnProceed');
      if (proc) { proc.style.transform = ''; proc.style.transition = ''; }
    }
  }, []);

  const handleRetakePhoto = useCallback(() => {
    capturedDataUrlRef.current = null;
    if (photoContainerRef.current) photoContainerRef.current.classList.remove('active');
    if (photoOverlayRef.current) photoOverlayRef.current.src = '';
    photoScaleRef.current = 1; photoRotationRef.current = 0;
    setCamTopBarMode('');
    setCamTopGradientVisible(true);
    const proc = document.getElementById('btnProceed');
    if (proc) { proc.style.transform = ''; proc.style.transition = ''; }
  }, []);

  const handleCameraViewClick = useCallback(() => {
    const photoContainer = photoContainerRef.current;
    if (photoContainer && photoContainer.classList.contains('active')) return;
    if (capturedDataUrlRef.current) return;
    startCapture();
  }, [startCapture]);

  const handlePhotoContainerClick = useCallback(() => {
    if (capturedDataUrlRef.current) return;
    if (photoContainerRef.current && photoContainerRef.current.classList.contains('active')) return;
    if (Date.now() - lastPinchEndTimeRef.current < 420) return;
    startCapture();
  }, [startCapture]);

  const handleProceed = useCallback(async () => {
    if (capturedDataUrlRef.current) {
      transitionToS6();
    } else if (photoContainerRef.current && photoContainerRef.current.classList.contains('active')) {
      if (captureInProgressRef.current || transitionInProgressRef.current) return;
      captureInProgressRef.current = true;
      capturedDataUrlRef.current = await capturePhoto();
      captureInProgressRef.current = false;
      await transitionToS6();
    } else {
      if (captureInProgressRef.current || transitionInProgressRef.current) return;
      captureInProgressRef.current = true;
      capturedDataUrlRef.current = await capturePhoto();
      captureInProgressRef.current = false;
      await transitionToS6();
    }
  }, [transitionToS6, capturePhoto]);

  const handleCountdownClick = useCallback(() => { countdownActiveRef.current = false; }, []);

  const handleS6ExitClick = useCallback(async () => {
    const ok = await showConfirm("Exit Retake?\nYour photo won't be saved.", 'Exit', true);
    if (ok) await exitSession();
  }, [showConfirm, exitSession]);

  const handleS6RetakeClick = useCallback(async () => {
    const ok = await showConfirm("Go back and retake?\nYour photo won't be saved.", 'Retake', true);
    if (ok) await retakeFromEdit();
  }, [showConfirm, retakeFromEdit]);

  const handleS6ToolPen = useCallback(() => {
    if (activeTool === 'doodle') { exitToolMode(); return; }
    if (activeTool) exitToolMode();
    setTimeout(() => { enterToolMode('doodle'); }, activeTool ? 120 : 0);
  }, [activeTool, exitToolMode, enterToolMode]);

  const handleS6ToolStickers = useCallback(() => {
    if (activeTool) exitToolMode();
    setTimeout(openStickerPanel, activeTool ? 120 : 0);
  }, [activeTool, exitToolMode, openStickerPanel]);

  const handleS6ToolText = useCallback(() => { if (activeTool) exitToolMode(); }, [activeTool, exitToolMode]);
  const handleS6ToolGallery = useCallback(() => { if (activeTool) exitToolMode(); }, [activeTool, exitToolMode]);

  const handleS6BtnDownload = useCallback(async () => {
    if (!capturedDataUrlRef.current) return;
    /* Always rebuild so any drawings/stickers added after capture are included */
    let blob;
    try {
      blob = await buildCompositeBlob();
    } catch (e) {
      console.error('Composite failed, falling back to photo only:', e);
      blob = dataUrlToBlob(capturedDataUrlRef.current);
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'retake-' + Date.now() + '.jpg';
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
    showToast('Saved!');
  }, [buildCompositeBlob, showToast]);

  const handleS6SharePill = useCallback(async () => {
    if (!capturedDataUrlRef.current) return;
    /* Always rebuild so drawings/stickers are included */
    let blob;
    try {
      blob = await buildCompositeBlob();
    } catch (e) {
      console.error('Composite failed, falling back to photo only:', e);
      blob = dataUrlToBlob(capturedDataUrlRef.current);
    }
    shareImage(blob);
  }, [buildCompositeBlob, shareImage]);

  const generateShareCode = useCallback(() => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let c = '';
    for (let i = 0; i < 7; i++) c += chars[Math.floor(Math.random() * chars.length)];
    return c;
  }, []);

  const handleS6ContribClick = useCallback(async () => {
    try { await navigator.clipboard.writeText(window.location.href); } catch {}
    const code = generateShareCode();
    setS7PopCode(code);
    setS7PopVisible(true);
    setTimeout(() => setS7PopVisible(false), 6000);
  }, [generateShareCode]);

  const handleS7PopCopyClick = useCallback(async (e) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(s7PopCode); } catch {}
  }, [s7PopCode]);

  const handleSwatchClick = useCallback((color) => {
    doodleColorRef.current = color;
    setDoodleColor(color);
    syncCursor();
  }, [syncCursor]);

  const handlePenTypeClick = useCallback((type) => {
    penTypeRef.current = type;
    setPenType(type);
  }, []);

  const handleToolMouseEnter = useCallback(() => {
    clearTimeout(labelPressTimerRef.current);
    labelPressTimerRef.current = setTimeout(() => setLabelsExpanded(true), 800);
  }, []);
  const handleToolMouseLeave = useCallback(() => {
    clearTimeout(labelPressTimerRef.current);
    clearTimeout(labelCollapseTimerRef.current);
    labelCollapseTimerRef.current = setTimeout(() => setLabelsExpanded(false), 500);
  }, []);

  const camTopBarClass = `cam-top-bar${camTopBarVisible ? ' visible' : ''}${camTopBarMode ? ' ' + camTopBarMode : ''}`;
  const flowState = s7PopVisible
    ? INVITEE_FLOW_STATES.SHARING
    : activeTool
      ? INVITEE_FLOW_STATES.TOOL_ACTIVE
      : s6Visible
        ? INVITEE_FLOW_STATES.CAPTURE_COMPLETE
        : bottomSheetVisible
          ? INVITEE_FLOW_STATES.CAMERA_PERMISSION
          : (camTopBarVisible || camBottomBarVisible || screen4CardVisible)
            ? INVITEE_FLOW_STATES.CAMERA_LIVE
            : INVITEE_FLOW_STATES.INTRO;

  return (
    <div className={`screen${screenClass ? ' ' + screenClass : ''}`} id="screen" ref={screenRef} data-flow-state={flowState}>

      {/* Frame container */}
      <div id="frameContainer"
        style={{ position:'absolute',left:'8px',top:'77px',width:'414px',height:'750px',overflow:'hidden',borderRadius:'32px',zIndex:1 }}>

        <div id="mkSlotBg"
          style={{ position:'absolute',left:0,top:0,width:'414px',height:'750px',
            backgroundColor:'#e8e8e8',
            backgroundImage:'linear-gradient(45deg,#d0d0d0 25%,transparent 25%),linear-gradient(-45deg,#d0d0d0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#d0d0d0 75%),linear-gradient(-45deg,transparent 75%,#d0d0d0 75%)',
            backgroundSize:'20px 20px',
            backgroundPosition:'0 0,0 10px,10px -10px,-10px 0' }}>
        </div>

        <video className="camera-view" id="cameraView" ref={videoRef} autoPlay playsInline muted
          onClick={handleCameraViewClick}></video>

        <div className="photo-container" id="photoContainer" ref={photoContainerRef}
          onClick={handlePhotoContainerClick}>
          <img className="photo-overlay" id="photoOverlay" ref={photoOverlayRef} alt="" draggable="false" />
        </div>

        <img
          id="yunchaiPhoto"
          className={isCustomFrame ? 'custom-frame' : ''}
          src={frameUrl}
          crossOrigin="anonymous"
          alt=""
        />

        <canvas id="editCanvas" ref={canvasRef} className="no-tool" width="414" height="750"></canvas>

        {/* Brush cursor — must be inside frameContainer so absolute positioning is relative to the canvas */}
        <svg id="brushCursor" ref={brushCursorRef} width="40" height="40" viewBox="-20 -20 40 40">
          <circle id="brushCursorCircle" ref={brushCursorCircleRef} r="16"
            fill="rgba(255,255,255,0.1)" stroke="white" strokeWidth="1.5" />
        </svg>
      </div>

      {/* Cutout glow */}
      <div id="cutoutGlow" className={cutoutGlowHidden ? 'hidden' : ''}></div>

      {/* Invite card (Screen 2) */}
      <div className={`invite-card${inviteCardVisible ? ' visible' : ''}`} id="inviteCard">
        <div className="app-icon">YS</div>
        <div className="card-content">
          <div className="card-text">
            <span className="card-username">yunchai</span>
            <span className="card-subtitle">invites you to this frame</span>
          </div>
          <div className="card-buttons">
            <button className="btn btn-decline" id="btnDecline" onClick={handleDecline}>Decline</button>
            <button className="btn btn-accept" id="btnAccept" onClick={handleAccept}>View Frame</button>
          </div>
        </div>
      </div>

      {/* Screen 4 card */}
      <div className={`screen4-card${screen4CardVisible ? ' visible' : ''}`} id="screen4Card">
        <div className="screen4-img-wrap">
          <img src="https://www.figma.com/api/mcp/asset/9a4ac1d4-f7db-45ad-870d-9fc3cb88f421" alt="step into the frame" />
        </div>
        <p className="screen4-title">Tap anywhere to take a photo</p>
        <p className="screen4-subtitle">Tap to start</p>
      </div>

      {/* Camera top gradient */}
      <div className={`cam-top-gradient${camTopGradientVisible ? ' visible' : ''}`} id="camTopGradient"></div>

      {/* Camera top bar */}
      <div className={camTopBarClass} id="camTopBar">
        <button className="cam-btn" id="btnCloseCamera" aria-label="Close"
          onClick={handleCloseCamera}>
          <svg width="26" height="26" viewBox="0 0 22 22" fill="none" stroke="white" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round">
            <line x1="4" y1="4" x2="18" y2="18" /><line x1="18" y1="4" x2="4" y2="18" />
          </svg>
        </button>
        <div className="cam-top-middle">
          <button className="cam-btn" id="btnFlash" aria-label="Flash">
            <svg width="26" height="26" viewBox="0 0 22 22" fill="white">
              <path d="M12.5 2L4 12.5H10.5L9.5 20l9-10.5H13L12.5 2Z" />
            </svg>
          </button>
          <button className={`cam-btn${timerValue > 0 ? ' timer-active' : ''}`} id="btnTimer"
            aria-label="Timer" onClick={handleTimerClick}>
            <svg width="26" height="26" viewBox="0 0 22 22" fill="none" stroke="white" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round">
              <circle cx="11" cy="13" r="7" /><path d="M11 10v3l2 1.5" /><path d="M8.5 2.5h5M11 2.5V5" />
            </svg>
            <span className={`timer-badge${timerValue > 0 ? '' : ''}`} id="timerBadge"
              style={{ opacity: timerValue > 0 ? 1 : 0, transform: timerValue > 0 ? 'scale(1)' : 'scale(0.5)' }}>
              {timerValue > 0 ? `${timerValue}s` : ''}
            </span>
          </button>
        </div>
        <button className="cam-btn" id="btnTakePhotoInstead" aria-label="Take photo instead"
          onClick={handleTakePhotoInstead}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          Take photo instead
        </button>
        <button className="cam-btn" id="btnRetakePhoto" aria-label="Retake photo"
          onClick={handleRetakePhoto}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 109-9 9 9 0 00-6.37 2.63" /><polyline points="3 3 3 9 9 9" />
          </svg>
          Retake photo
        </button>
        <button className="cam-btn" id="btnFlipCam" aria-label="Flip camera"
          onClick={handleFlipCam}>
          <svg width="26" height="26" viewBox="0 0 22 22" fill="none" stroke="white" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4v5h5" /><path d="M20 18v-5h-5" />
            <path d="M18.49 8A8 8 0 005.5 5.5L2 9" /><path d="M3.51 14a8 8 0 0013 3L20 13" />
          </svg>
        </button>
      </div>

      {/* Camera popup */}
      <div className={`cam-popup${camPopupVisible ? ' visible' : ''}`} id="camPopup">
        Tap anywhere to take a photo 📸
      </div>

      {/* Tap anywhere indicator */}
      <div id="tapHint" className={`${tapHintVisible ? 'visible' : ''}${tapHintHiding ? ' hiding' : ''}`}>
        <div className="tap-rings">
          <div className="tap-ring"></div>
          <div className="tap-ring"></div>
          <div className="tap-ring"></div>
          <div className="tap-hint-dot"></div>
        </div>
        <span className="tap-hint-label">tap anywhere to capture</span>
      </div>

      {/* Hidden file inputs */}
      <input type="file" id="photoLibraryInput" ref={photoLibraryInputRef}
        accept="image/*" style={{ display: 'none' }}
        onChange={handlePhotoLibraryChange} />

      {/* Camera bottom bar */}
      <div className={`cam-bottom-bar${camBottomBarVisible ? ' visible' : ''}`} id="camBottomBar">
        <SolidIconButton className="cam-gallery-btn" id="btnGallery" label="Photo library"
          shape="square" onClick={handleGalleryBtnClick} />
        <div className="cam-marquee-wrap">
          <span className="cam-marquee-text">
            <span className="marquee-username">yunchai</span> <span className="marquee-sep">|</span> {frameName} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span className="marquee-username">yunchai</span> <span className="marquee-sep">|</span> {frameName} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
          </span>
        </div>
        <button className="cam-proceed-btn" id="btnProceed" aria-label="Proceed"
          onClick={handleProceed}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#1A1A2E" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="11 15 16 10 11 5" /><polyline points="5 15 10 10 5 5" />
          </svg>
        </button>
      </div>

      {/* Scrim (screen 3) */}
      <div className={`scrim${scrimVisible ? ' visible' : ''}`} id="scrim"
        onClick={handleScrimClick}></div>

      {/* Camera permission sheet */}
      <div className={`bottom-sheet${bottomSheetVisible ? ' visible' : ''}`} id="bottomSheet">
        <div className="sheet-handle"></div>
        <div className="sheet-inner">
          <div className="sheet-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>
          <div className="sheet-body">
            <div className="sheet-text">
              <p className="sheet-title">Allow camera access</p>
              <p className="sheet-subtitle">Retake! needs your camera to let you shoot inside this frame.</p>
            </div>
            <div className="sheet-actions">
              <button className="btn-allow-camera" id="btnAllowCamera" onClick={handleAllowCamera}>
                Allow Camera
              </button>
              <button className="btn-not-now" id="btnNotNow" onClick={handleNotNow}>Not now</button>
            </div>
          </div>
        </div>
      </div>

      {/* Countdown overlay */}
      <div className={`countdown-overlay${countdownVisible ? ' visible' : ''}`} id="countdownOverlay"
        onClick={handleCountdownClick}>
        <div className="countdown-number" id="countdownNumber" ref={countdownNumberRef}>{countdownNum}</div>
        <div className="countdown-hint">Tap to cancel</div>
      </div>

      {/* Flash overlay */}
      <div className="flash-overlay" id="flashOverlay" ref={flashOverlayRef}></div>
      {/* Dark flash */}
      <div className="dark-flash-overlay" id="darkFlashOverlay" ref={darkFlashRef}></div>

      {/* Hidden capture canvas */}
      <canvas id="captureCanvas" ref={captureCanvasRef} style={{ display: 'none' }}></canvas>

      {/* S6 edge gradient */}
      <div id="s6ScrimOverlay"></div>

      {/* S6 Exit button */}
      <button className={`s6-exit-btn${s6ExitVisible ? ' visible' : ''}`} id="s6ExitBtn"
        aria-label="Exit session" onClick={handleS6ExitClick}>
        <svg width="26" height="26" viewBox="0 0 22 22" fill="none" stroke="white" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round">
          <line x1="4" y1="4" x2="18" y2="18" /><line x1="18" y1="4" x2="4" y2="18" />
        </svg>
      </button>

      <InviteeToolbar
        visible={s6ToolsVisible}
        out={s6ToolsOut}
        labelsExpanded={labelsExpanded}
        activeTool={activeTool}
        onText={handleS6ToolText}
        onStickers={handleS6ToolStickers}
        onGallery={handleS6ToolGallery}
        onDraw={handleS6ToolPen}
        onDownload={handleS6BtnDownload}
        onToolMouseEnter={handleToolMouseEnter}
        onToolMouseLeave={handleToolMouseLeave}
      />

      {/* Drawing tool overlays (undo/redo, done, left panel, pen bar) */}
      <DrawingToolOverlays
        tmLeftPanelRef={tmLeftPanelRef}
        tmSizeHandleRef={tmSizeHandleRef}
        tmIn={tmIn}
        tmLeftIn={tmLeftIn}
        tmPenBarIn={tmPenBarIn}
        doodleColor={doodleColor}
        penType={penType}
        tmUndoBtnDisabled={tmUndoBtnDisabled}
        tmRedoBtnDisabled={tmRedoBtnDisabled}
        onDone={exitToolMode}
        onUndo={toolUndo}
        onRedo={toolRedo}
        onSwatchClick={handleSwatchClick}
        onPenTypeClick={handlePenTypeClick}
      />

      {/* S6 bottom action bar */}
      <div className={`s6-bottom-bar${s6BottomBarVisible ? ' visible' : ''}`} id="s6BottomBar">
        <button className="s6-circle-btn" id="s6RetakeBtn" aria-label="Back"
          onClick={handleS6RetakeClick}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 15 4 10 9 5" /><polyline points="15 15 10 10 15 5" />
          </svg>
        </button>
        <span className="s6-bar-label">Share your Retake!</span>
        <div className="s6-bar-actions">
          <button className="s6-send-btn" id="s6SharePill" aria-label="Share your Retake"
            onClick={handleS6SharePill}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 2 15 22 11 13 2 9 22 2" fill="#1A1A2E" />
            </svg>
          </button>
          <button className="s6-circle-btn" id="s6ContribBtn" aria-label="Copy link"
            onClick={handleS6ContribClick}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Toast */}
      <div className={`s6-toast${toastVisible ? ' visible' : ''}`} id="s6Toast">{toastMsg}</div>

      {/* S7 pop */}
      <div className={`s7-pop${s7PopVisible ? ' visible' : ''}`} id="s7Pop"
        onClick={() => setS7PopVisible(false)}>
        <div className="s7-pop-content">
          <p className="s7-pop-title">Your turn's done! Pass it on</p>
          <p className="s7-pop-subtitle">Share the code and let a friend retake this frame</p>
        </div>
        <div className="s7-pop-code-row">
          <span className="s7-pop-code" id="s7PopCode">{s7PopCode}</span>
          <button className="s7-pop-copy-btn" id="s7PopCopyBtn" aria-label="Copy code"
            onClick={handleS7PopCopyClick}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1A1A2E" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Confirm dialog */}
      <ConfirmDialog
        confirmScrimVisible={confirmScrimVisible}
        confirmVisible={confirmVisible}
        confirmMsg={confirmMsg}
        confirmOkLabel={confirmOkLabel}
        confirmDanger={confirmDanger}
        cancelLabel={confirmCancelLabel}
        onConfirm={() => dismissConfirm(true)}
        onCancel={() => dismissConfirm(false)}
      />

      {/* Sticker panel, new sticker screen, overlay, file input */}
      <StickerPanel sys={stickerSys} />

    </div>
  );
}
