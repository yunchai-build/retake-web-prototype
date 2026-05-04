import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import '../../styles/inviter.css';
import GlassSurface from '../../components/ui/GlassSurface';
import SolidIconButton from '../../components/ui/SolidIconButton';
import { useToast } from '../editor/hooks/useToast';
import { useStickerSystem } from '../editor/hooks/useStickerSystem';
import { useMagicEraser } from '../editor/hooks/useMagicEraser';
import { useCanvasDrawing } from '../editor/hooks/useCanvasDrawing';
import { useConfirmDialog } from '../editor/hooks/useConfirmDialog';
import { useToolbarState } from '../editor/hooks/useToolbarState';
import { useHistory } from '../editor/hooks/useHistory';
import { useTextTool } from '../editor/hooks/useTextTool';
import { useSharePanel } from './hooks/useSharePanel';
import { useEditName } from './hooks/useEditName';
import StickerPanel from '../editor/components/StickerPanel';
import TextToolOverlay from '../editor/components/TextToolOverlay';
import DrawingToolOverlays from '../editor/components/DrawingToolOverlays';
import ConfirmDialog from '../editor/components/ConfirmDialog';
import FrameCanvas from '../editor/components/FrameCanvas';
import ExitButton from '../editor/components/ExitButton';
import UndoRedoCluster from '../editor/components/UndoRedoCluster';
import EraserBar from '../editor/components/EraserBar';
import Toast from '../../components/ui/Toast';
import VerticalToolbar from './components/VerticalToolbar';
import BottomBar from './components/BottomBar';
import EditNamePopup from './components/EditNamePopup';
import SharePopup from './components/SharePopup';
import IntroCard from './components/IntroCard';
import { INVITER_FLOW_STATES } from './state.js';
import { loadImage } from '../editor/utils/canvas.js';

const STEP3_MODE = {
  LIVE: 'live',
  PHOTO: 'photo',
  VIDEO: 'video',
};

const SAVED_FRAMES_KEY = 'retake.savedFrames.v1';
const STEP3_LONG_PRESS_MS = 420;
const STEP3_MAX_RECORD_MS = 10000;
const STEP3_VIDEO_TYPES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
];

function loadSavedFrames() {
  try {
    const raw = window.localStorage?.getItem(SAVED_FRAMES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedFrames(frames) {
  window.localStorage?.setItem(SAVED_FRAMES_KEY, JSON.stringify(frames));
}

function drawCoverImage(ctx, source, width, height) {
  const sourceWidth = source.videoWidth || source.naturalWidth || source.width || width;
  const sourceHeight = source.videoHeight || source.naturalHeight || source.height || height;
  const targetRatio = width / height;
  const sourceRatio = sourceWidth / sourceHeight;
  let sx = 0, sy = 0, sw = sourceWidth, sh = sourceHeight;

  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx = (sourceWidth - sw) / 2;
  } else {
    sh = sourceWidth / targetRatio;
    sy = (sourceHeight - sh) / 2;
  }

  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);
}

function drawRetakeWatermark(ctx, width, height) {
  ctx.save();
  ctx.font = '18px Bedstead, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText('retake', width - 18, height - 18);
  ctx.restore();
}

function chooseVideoMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  return STEP3_VIDEO_TYPES.find(type => MediaRecorder.isTypeSupported(type)) || '';
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

export default function InviterPage() {
  // ── Canvas / ctx refs ──
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const selectionCanvasRef = useRef(null);
  const frameElRef = useRef(null);

  // ── Tool state refs ──
  const activeToolRef = useRef(null);
  const toolRadiusRef = useRef(32);
  const eraserOpacityRef = useRef(1.0);
  const eraserModeRef = useRef('freehand');
  const doodleColorRef = useRef('#FFFFFF');
  const penTypeRef = useRef('pen');

  // ── Timer / element refs ──
  const lpCollapseTimerRef = useRef(null);
  const toolsHideTimerRef = useRef(null);
  const brushCursorRef = useRef(null);
  const brushCursorSvgRef = useRef(null);
  const brushCursorCircleRef = useRef(null);
  const tmSizeHandleRef = useRef(null);
  const tmLeftPanelRef = useRef(null);
  const eraserOpacitySliderRef = useRef(null);
  const galleryInputRef = useRef(null);
  const introPhotoFlowRef = useRef(false);
  const step3VideoRef = useRef(null);
  const step3StreamRef = useRef(null);
  const step3RecorderRef = useRef(null);
  const step3RecordChunksRef = useRef([]);
  const step3RecordCanvasRef = useRef(null);
  const step3RecordRafRef = useRef(null);
  const step3RecordStopTimerRef = useRef(null);
  const step3RecordStartedAtRef = useRef(0);
  const step3LongPressTimerRef = useRef(null);
  const step3PointerIdRef = useRef(null);
  const step3PointerDownRef = useRef(false);
  const step3RecordingRef = useRef(false);
  const step3RecordingStartingRef = useRef(false);
  const step3PendingStopRef = useRef(false);
  const step3VideoBlobRef = useRef(null);
  const step3VideoObjectUrlRef = useRef(null);

  // ── UI visibility state ──
  const [activeTool, setActiveTool] = useState(null);
  const [eraserMode, setEraserMode] = useState('freehand');
  const [doodleColor, setDoodleColor] = useState('#FFFFFF');
  const [penType, setPenType] = useState('pen');
  const [frameName, setFrameName] = useState('my frame');
  const [editorVisible, setEditorVisible] = useState(false);
  const [introCardVisible, setIntroCardVisible] = useState(false);
  const [scrimVisible, setScrimVisible] = useState(false);
  const [frameScrimVisible, setFrameScrimVisible] = useState(false);
  const [exitBtnVisible, setExitBtnVisible] = useState(false);
  const [undoRedoVisible, setUndoRedoVisible] = useState(false);
  const [toolsVisible, setToolsVisible] = useState(false);
  const [toolsOut, setToolsOut] = useState(false);
  const [bottomBarVisible, setBottomBarVisible] = useState(false);
  const [bottomBarOut, setBottomBarOut] = useState(false);
  const [exitBtnOut, setExitBtnOut] = useState(false);
  const [undoRedoOut, setUndoRedoOut] = useState(false);
  const [tmIn, setTmIn] = useState(false);
  const [tmBarMode, setTmBarMode] = useState(null); // 'doodle' | 'eraser' | null
  const [tmLeftIn, setTmLeftIn] = useState(false);
  const [step3Mode, setStep3Mode] = useState(null);
  const [step3PhotoUrl, setStep3PhotoUrl] = useState('');
  const [step3VideoUrl, setStep3VideoUrl] = useState('');
  const [step3Recording, setStep3Recording] = useState(false);
  const [step3RecordingProgress, setStep3RecordingProgress] = useState(1);
  const [step3CameraReady, setStep3CameraReady] = useState(false);
  const [savedFrames, setSavedFrames] = useState(() => loadSavedFrames());
  const [savedFramesVisible, setSavedFramesVisible] = useState(false);
  const bottomBarOutBeforeStickerDragRef = useRef(false);

  // ── Hooks ──
  const { toastMsg, toastVisible, showToast } = useToast(1800);
  const handleStickerItemDragStart = useCallback(() => {
    setBottomBarOut(prev => {
      bottomBarOutBeforeStickerDragRef.current = prev;
      return true;
    });
  }, []);
  const handleStickerItemDragEnd = useCallback(() => {
    setBottomBarOut(bottomBarOutBeforeStickerDragRef.current);
    bottomBarOutBeforeStickerDragRef.current = false;
  }, []);
  const stickerSys = useStickerSystem({
    ctxRef,
    setScrimVisible,
    showToast,
    onItemDragStart: handleStickerItemDragStart,
    onItemDragEnd: handleStickerItemDragEnd,
  });

  const {
    confirmVisible, confirmScrimVisible, confirmMsg, confirmOkLabel, confirmDanger,
    showConfirm, dismissConfirm,
  } = useConfirmDialog();

  const {
    mainUndoStackRef, mainRedoStackRef,
    toolUndoStackRef, toolRedoStackRef,
    sessionEntrySnapRef,
    undoBtnDisabled, redoBtnDisabled,
    tmUndoBtnDisabled, tmRedoBtnDisabled,
    snapshot, restoreSnapshot, syncHistoryBtns, pushHistory,
    mainUndo, mainRedo, toolUndo, toolRedo,
  } = useHistory({ canvasRef, ctxRef, activeToolRef, showToast });

  const {
    toolsCollapsed, setToolsCollapsed,
    toolsCollapsedRef, toolsCollapseTimerRef,
    labelsExpanded,
    orderedToolIds, addRecentTool,
    handleToggleTools, handleToolbarInteraction, handleToolMouseEnter, handleToolMouseLeave,
  } = useToolbarState();
  const step2ToolIds = useMemo(
    () => orderedToolIds.filter(toolId => toolId !== 'download'),
    [orderedToolIds]
  );
  const step3ToolIds = useMemo(
    () => orderedToolIds.filter(toolId => ['text', 'stickers', 'doodle', 'download'].includes(toolId)),
    [orderedToolIds]
  );

  const {
    sharePanelVisible, setSharePanelVisible,
    shareCode, shareUrl,
    handleCopyLink, handleCopyCode, handleShare,
  } = useSharePanel({
    frameName,
    showToast,
    setScrimVisible,
    getFrameDataUrl: async () => {
      if (activeToolRef.current) exitCurrentTool(true);
      const source = canvasRef.current;
      const out = document.createElement('canvas');
      out.width = source.width;
      out.height = source.height;
      const outCtx = out.getContext('2d');
      outCtx.drawImage(source, 0, 0);
      await stickerSys.drawStickersToContext(outCtx);
      return out.toDataURL('image/png');
    },
  });

  const {
    editNameVisible, editNameInputValue, setEditNameInputValue,
    openEditName, saveEditName,
  } = useEditName({ frameName, setFrameName, setScrimVisible });

  const {
    textToolActive,
    txtFont, setTxtFont,
    txtColor, setTxtColor,
    txtSize, setTxtSize,
    txtWrapWidth, setTxtWrapWidth,
    txtOpacity, setTxtOpacity,
    txtAlign, setTxtAlign,
    textPreviewRef,
    enterTextTool, exitTextTool,
  } = useTextTool({
    activeToolRef, setActiveTool,
    setExitBtnOut, setUndoRedoOut, setToolsOut, setBottomBarOut,
    toolsHideTimerRef, setToolsVisible,
    setTmIn,
    setToolsCollapsed, toolsCollapsedRef, toolsCollapseTimerRef,
    placeText: stickerSys.placeText,
  });

  // ── Size panel / brush cursor constants ──
  const PANEL_W = 56, HANDLE_MIN = 6, HANDLE_MAX = 38;
  const TRACK_TOP_Y = 38, TRACK_BOT_Y = 210;

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
  }, [setHandlePos, syncCursor]);

  const normFromClientY = useCallback((clientY) => {
    const rect = tmLeftPanelRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1,
      1 - (clientY - rect.top - TRACK_TOP_Y) / (TRACK_BOT_Y - TRACK_TOP_Y)));
  }, []);

  const {
    magicPhaseRef,
    magicLassoRef,
    magicDrawingRef,
    magicRefiningRef,
    magicPhase,
    magicConfirmDisabled,
    magicDetecting,
    magicRefMode,
    magicOpacity,
    clearOverlay: clearMagicOverlay,
    renderLasso: renderMagicLasso,
    reset: resetMagicMode,
    paintRefine: paintMagicRefine,
    pushMaskHistory: pushMagicMaskHistory,
    confirmLasso: confirmMagicLasso,
    apply: applyMagicErase,
    setConfirmDisabled: setMagicConfirmDisabled,
    setRefMode: handleMagicRefMode,
    handleOpacityInput: handleMagicOpacityInput,
  } = useMagicEraser({
    canvasRef,
    ctxRef,
    selectionCanvasRef,
    toolRadiusRef,
    brushCursorRef,
    showToast,
    syncCursor,
    pushHistory,
  });

  const { resetInteractionState } = useCanvasDrawing({
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
    magic: {
      phaseRef: magicPhaseRef,
      lassoRef: magicLassoRef,
      drawingRef: magicDrawingRef,
      refiningRef: magicRefiningRef,
      clearOverlay: clearMagicOverlay,
      renderLasso: renderMagicLasso,
      paintRefine: paintMagicRefine,
      pushMaskHistory: pushMagicMaskHistory,
      setConfirmDisabled: setMagicConfirmDisabled,
    },
    pushHistory,
    syncHistoryBtns,
    setHandlePos,
    syncCursor,
    expandLeftPanel,
    applyTrackNorm,
    normFromClientY,
    onInitialIntro: () => {
      mainUndoStackRef.current = [canvasRef.current.toDataURL()];
      setTimeout(() => { setScrimVisible(true); setIntroCardVisible(true); }, 400);
    },
  });

  // ── Configure left panel per tool ──
  const configureLeftPanel = useCallback((tool) => {
    if (tool === 'eraser') {
      eraserOpacityRef.current = 0.5;
      if (eraserOpacitySliderRef.current) {
        eraserOpacitySliderRef.current.value = 50;
        eraserOpacitySliderRef.current.style.setProperty('--fill', '50%');
      }
      const val = document.getElementById('eraserOpacityVal');
      if (val) val.textContent = '50%';
      toolRadiusRef.current = Math.round(4 + 0.5 * (60 - 4));
      setHandlePos(0.5);
      eraserModeRef.current = 'freehand';
      setEraserMode('freehand');
      resetMagicMode();
      if (canvasRef.current) canvasRef.current.style.cursor = 'none';
    } else {
      toolRadiusRef.current = Math.round(4 + 0.5 * (60 - 4));
      setHandlePos(0.5);
    }
    syncCursor();
  }, [resetMagicMode, setHandlePos, syncCursor]);

  // ── Tool mode enter/exit ──
  const enterToolMode = useCallback((tool) => {
    activeToolRef.current = tool;
    setActiveTool(tool);

    const snap = snapshot();
    mainUndoStackRef.current.push(snap);
    mainRedoStackRef.current = [];
    sessionEntrySnapRef.current = snap;
    toolUndoStackRef.current = [snap];
    toolRedoStackRef.current = [];
    configureLeftPanel(tool);
    syncHistoryBtns();

    setExitBtnOut(true);
    setUndoRedoOut(true);
    setToolsOut(true);
    setBottomBarOut(true);

    clearTimeout(toolsHideTimerRef.current);
    toolsHideTimerRef.current = setTimeout(() => {
      setToolsVisible(false);
      setToolsOut(false);
    }, 400);

    setTimeout(() => {
      setTmIn(true);
      setTmLeftIn(true);
      setTmBarMode(tool);
      expandLeftPanel();
    }, 120);

    if (canvasRef.current) canvasRef.current.classList.remove('no-tool');
    if (stickerSys.stickerOverlayRef.current) stickerSys.stickerOverlayRef.current.style.pointerEvents = 'none';
    stickerSys.placedStickersRef.current.forEach(stk => { stk.el.style.pointerEvents = 'none'; });
    syncCursor();
    if (brushCursorRef.current) brushCursorRef.current.style.display = 'none';
  }, [snapshot, configureLeftPanel, syncHistoryBtns, expandLeftPanel, syncCursor,
      mainUndoStackRef, mainRedoStackRef, sessionEntrySnapRef, toolUndoStackRef, toolRedoStackRef, stickerSys]);

  const exitToolMode = useCallback(() => {
    const didChange = toolUndoStackRef.current.length > 1;
    if (!didChange && mainUndoStackRef.current.length > 0) {
      mainUndoStackRef.current.pop();
    } else if (didChange) {
      mainUndoStackRef.current.push(snapshot());
      mainRedoStackRef.current = [];
    }
    toolUndoStackRef.current = [];
    toolRedoStackRef.current = [];
    sessionEntrySnapRef.current = null;

    resetInteractionState();
    if (canvasRef.current) canvasRef.current.style.cursor = '';
    resetMagicMode();

    activeToolRef.current = null;
    setActiveTool(null);
    clearTimeout(lpCollapseTimerRef.current);
    clearTimeout(toolsHideTimerRef.current);
    syncHistoryBtns();

    setTmIn(false);
    setTmLeftIn(false);
    setTmBarMode(null);
    if (tmLeftPanelRef.current) tmLeftPanelRef.current.style.transform = '';

    setToolsOut(false);
    setToolsCollapsed(false);
    toolsCollapsedRef.current = false;
    clearTimeout(toolsCollapseTimerRef.current);
    setToolsVisible(true);
    setTimeout(() => {
      setExitBtnOut(false);
      setUndoRedoOut(false);
      setBottomBarOut(false);
    }, 100);

    if (canvasRef.current) canvasRef.current.classList.add('no-tool');
    if (stickerSys.stickerOverlayRef.current) stickerSys.stickerOverlayRef.current.style.pointerEvents = '';
    stickerSys.placedStickersRef.current.forEach(stk => { stk.el.style.pointerEvents = ''; });
    if (brushCursorRef.current) brushCursorRef.current.style.display = 'none';
  }, [resetInteractionState, resetMagicMode, snapshot, syncHistoryBtns, setToolsCollapsed, toolsCollapsedRef, toolsCollapseTimerRef,
      mainUndoStackRef, mainRedoStackRef, toolUndoStackRef, toolRedoStackRef, sessionEntrySnapRef, stickerSys]);

  // ── Editor enter/exit ──
  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  const enterEditor = useCallback(async () => {
    setIntroCardVisible(false);
    setScrimVisible(false);
    await delay(260);
    setFrameScrimVisible(true);
    setExitBtnVisible(true);
    setExitBtnOut(false);
    await delay(50);
    setUndoRedoVisible(true);
    setUndoRedoOut(false);
    await delay(40);
    setToolsCollapsed(false);
    toolsCollapsedRef.current = false;
    clearTimeout(toolsCollapseTimerRef.current);
    setToolsVisible(true);
    setToolsOut(false);
    await delay(60);
    setBottomBarVisible(true);
    setBottomBarOut(false);
    setEditorVisible(true);
    if (canvasRef.current) canvasRef.current.classList.add('no-tool');
  }, [setToolsCollapsed, toolsCollapsedRef, toolsCollapseTimerRef]);

  const exitToIntro = useCallback(async () => {
    if (activeToolRef.current === 'text') exitTextTool(false);
    else if (activeToolRef.current) exitToolMode();
    setToolsCollapsed(false);
    toolsCollapsedRef.current = false;
    clearTimeout(toolsCollapseTimerRef.current);
    await delay(180);
    setExitBtnVisible(false);
    setUndoRedoVisible(false);
    setToolsVisible(false);
    setBottomBarVisible(false);
    setFrameScrimVisible(false);
    await delay(280);
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stickerSys.clearStickers();
    mainUndoStackRef.current = [];
    mainRedoStackRef.current = [];
    toolUndoStackRef.current = [];
    toolRedoStackRef.current = [];
    mainUndoStackRef.current.push(canvas.toDataURL());
    syncHistoryBtns();
    await delay(100);
    setScrimVisible(true);
    setIntroCardVisible(true);
    setEditorVisible(false);
  }, [exitToolMode, exitTextTool, syncHistoryBtns, setToolsCollapsed, toolsCollapsedRef, toolsCollapseTimerRef,
      mainUndoStackRef, mainRedoStackRef, toolUndoStackRef, toolRedoStackRef, stickerSys]);

  // ── Body layout lock ──
  useEffect(() => {
    document.documentElement.style.cssText = 'height:100%;overflow:hidden;';
    document.body.classList.add('inviter-mode');
    const onScreenScroll = () => {
      const s = document.querySelector('.screen');
      if (s && s.scrollTop !== 0) s.scrollTop = 0;
    };
    document.querySelector('.screen')?.addEventListener('scroll', onScreenScroll, { passive: true });
    return () => {
      document.body.classList.remove('inviter-mode');
      document.documentElement.style.cssText = '';
      document.querySelector('.screen')?.removeEventListener('scroll', onScreenScroll);
    };
  }, []);

  // ── Exit any active tool (canvas tool or text tool) ──
  const exitCurrentTool = useCallback((commit = true) => {
    if (activeToolRef.current === 'text') exitTextTool(commit);
    else if (activeToolRef.current) exitToolMode();
  }, [exitTextTool, exitToolMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tool button handlers ──
  const handleToolDoodle = useCallback(() => {
    addRecentTool('doodle');
    if (activeToolRef.current === 'doodle') { exitToolMode(); return; }
    const wasActive = !!activeToolRef.current;
    exitCurrentTool(true);
    setTimeout(() => enterToolMode('doodle'), wasActive ? 120 : 0);
  }, [exitCurrentTool, exitToolMode, enterToolMode, addRecentTool]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToolEraser = useCallback(() => {
    addRecentTool('eraser');
    if (activeToolRef.current === 'eraser') { exitToolMode(); return; }
    const wasActive = !!activeToolRef.current;
    exitCurrentTool(true);
    setTimeout(() => enterToolMode('eraser'), wasActive ? 120 : 0);
  }, [exitCurrentTool, exitToolMode, enterToolMode, addRecentTool]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToolStickers = useCallback(() => {
    addRecentTool('stickers');
    const wasActive = !!activeToolRef.current;
    exitCurrentTool(true);
    setTimeout(stickerSys.openPanel, wasActive ? 120 : 0);
  }, [exitCurrentTool, stickerSys, addRecentTool]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToolText = useCallback(() => {
    addRecentTool('text');
    if (activeToolRef.current === 'text') { exitTextTool(true); return; }
    const wasActive = !!activeToolRef.current;
    if (wasActive) exitCurrentTool(true);
    setTimeout(enterTextTool, wasActive ? 140 : 0);
  }, [exitCurrentTool, enterTextTool, exitTextTool, addRecentTool]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDone = useCallback(() => {
    if (activeToolRef.current === 'text') exitTextTool(true);
    else exitToolMode();
  }, [exitToolMode, exitTextTool]); // eslint-disable-line react-hooks/exhaustive-deps

  const getCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    return {
      width: canvas?.width || 414,
      height: canvas?.height || 736,
    };
  }, []);

  const revokeStep3VideoUrl = useCallback(() => {
    if (step3VideoObjectUrlRef.current) {
      URL.revokeObjectURL(step3VideoObjectUrlRef.current);
      step3VideoObjectUrlRef.current = null;
    }
  }, []);

  const stopStep3Camera = useCallback(() => {
    if (step3StreamRef.current) {
      step3StreamRef.current.getTracks().forEach(track => track.stop());
      step3StreamRef.current = null;
    }
    if (step3VideoRef.current) step3VideoRef.current.srcObject = null;
    setStep3CameraReady(false);
  }, []);

  const startStep3Camera = useCallback(async () => {
    stopStep3Camera();
    setStep3CameraReady(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast('Camera unavailable - photo upload still works');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1080 },
          height: { ideal: 1920 },
        },
        audio: false,
      });
      step3StreamRef.current = stream;
      if (step3VideoRef.current) {
        step3VideoRef.current.srcObject = stream;
        await step3VideoRef.current.play().catch(() => {});
      }
      setStep3CameraReady(true);
      return true;
    } catch (err) {
      console.warn('[step3] Camera unavailable:', err?.name, err?.message);
      showToast('Camera unavailable - try again from browser settings');
      return false;
    }
  }, [showToast, stopStep3Camera]);

  const buildFrameDataUrl = useCallback(async () => {
    if (activeToolRef.current) exitCurrentTool(true);
    const source = canvasRef.current;
    const { width, height } = getCanvasSize();
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const outCtx = out.getContext('2d');
    if (source) outCtx.drawImage(source, 0, 0, width, height);
    await stickerSys.drawStickersToContext(outCtx);
    return out.toDataURL('image/png');
  }, [exitCurrentTool, getCanvasSize, stickerSys]);

  const captureStep3CameraPhoto = useCallback(async () => {
    const video = step3VideoRef.current;
    if (!video || video.readyState < 2) throw new Error('Camera is not ready');
    const { width, height } = getCanvasSize();
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    drawCoverImage(out.getContext('2d'), video, width, height);
    return out.toDataURL('image/jpeg', 0.92);
  }, [getCanvasSize]);

  const buildStep3PhotoBlob = useCallback(async () => {
    if (!step3PhotoUrl) throw new Error('No photo captured');
    const { width, height } = getCanvasSize();
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const outCtx = out.getContext('2d');
    const photo = await loadImage(step3PhotoUrl);
    outCtx.drawImage(photo, 0, 0, width, height);
    const frame = await loadImage(await buildFrameDataUrl());
    outCtx.drawImage(frame, 0, 0, width, height);
    drawRetakeWatermark(outCtx, width, height);
    return new Promise((resolve, reject) => {
      out.toBlob(blob => blob ? resolve(blob) : reject(new Error('Photo export failed')), 'image/jpeg', 0.92);
    });
  }, [buildFrameDataUrl, getCanvasSize, step3PhotoUrl]);

  const buildStep3VideoBlob = useCallback(async () => {
    if (!step3VideoUrl) throw new Error('No video captured');
    if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
      if (step3VideoBlobRef.current) return step3VideoBlobRef.current;
      throw new Error('Video export is not supported');
    }

    const { width, height } = getCanvasSize();
    const video = document.createElement('video');
    video.src = step3VideoUrl;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error('Video load failed'));
    });

    const frameImage = await loadImage(await buildFrameDataUrl());
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const outCtx = out.getContext('2d');
    const stream = out.captureStream(30);
    const mimeType = chooseVideoMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];

    return new Promise((resolve, reject) => {
      let rafId = null;
      let settled = false;
      const maxMs = Math.min(Math.max((video.duration || 10) * 1000 + 700, 1200), STEP3_MAX_RECORD_MS + 1400);
      const stopTimer = setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, maxMs);

      const cleanup = () => {
        clearTimeout(stopTimer);
        cancelAnimationFrame(rafId);
        stream.getTracks().forEach(track => track.stop());
        video.pause();
      };

      const draw = () => {
        drawCoverImage(outCtx, video, width, height);
        outCtx.drawImage(frameImage, 0, 0, width, height);
        drawRetakeWatermark(outCtx, width, height);
        if (!video.ended && recorder.state === 'recording') {
          rafId = requestAnimationFrame(draw);
        }
      };

      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Video export failed'));
      };
      recorder.onstop = () => {
        if (settled) return;
        settled = true;
        cleanup();
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' });
        resolve(blob);
      };
      video.onended = () => {
        if (recorder.state === 'recording') recorder.stop();
      };

      recorder.start();
      video.currentTime = 0;
      video.play()
        .then(() => {
          draw();
        })
        .catch(err => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(err);
        });
    });
  }, [buildFrameDataUrl, getCanvasSize, step3VideoUrl]);

  const shareBlob = useCallback(async (blob, filename, title, text) => {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    if (navigator.share) {
      try {
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({ title, text, files: [file] });
        } else {
          await navigator.share({ title, text });
        }
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
        console.warn('[step3] Share failed:', err);
      }
    }

    downloadBlob(blob, filename);
    showToast('Saved!');
  }, [showToast]);

  const stopStep3Recording = useCallback(() => {
    clearTimeout(step3RecordStopTimerRef.current);
    if (step3RecordingStartingRef.current && !step3RecorderRef.current) {
      step3PendingStopRef.current = true;
      return;
    }

    const recorder = step3RecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
    }
  }, []);

  const startStep3Recording = useCallback(async () => {
    const video = step3VideoRef.current;
    if (step3RecordingRef.current || step3RecordingStartingRef.current) return;
    if (!video || video.readyState < 2) {
      showToast('Camera is still warming up');
      return;
    }
    if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
      showToast('Video recording is not supported here');
      return;
    }

    step3RecordingStartingRef.current = true;
    step3PendingStopRef.current = false;
    step3RecordChunksRef.current = [];

    try {
      const { width, height } = getCanvasSize();
      const recordCanvas = document.createElement('canvas');
      recordCanvas.width = width;
      recordCanvas.height = height;
      step3RecordCanvasRef.current = recordCanvas;
      const recordCtx = recordCanvas.getContext('2d');
      const stream = recordCanvas.captureStream(30);
      const mimeType = chooseVideoMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      step3RecorderRef.current = recorder;

      const drawFrame = () => {
        drawCoverImage(recordCtx, video, width, height);
        step3RecordRafRef.current = requestAnimationFrame(drawFrame);
      };

      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) step3RecordChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        cancelAnimationFrame(step3RecordRafRef.current);
        clearTimeout(step3RecordStopTimerRef.current);
        stream.getTracks().forEach(track => track.stop());
        const blobType = recorder.mimeType || mimeType || 'video/webm';
        const blob = new Blob(step3RecordChunksRef.current, { type: blobType });
        step3VideoBlobRef.current = blob;
        revokeStep3VideoUrl();
        const url = URL.createObjectURL(blob);
        step3VideoObjectUrlRef.current = url;
        setStep3VideoUrl(url);
        setStep3PhotoUrl('');
        setStep3Mode(STEP3_MODE.VIDEO);
        setToolsCollapsed(false);
        toolsCollapsedRef.current = false;
        clearTimeout(toolsCollapseTimerRef.current);
        setToolsVisible(true);
        setToolsOut(false);
        setBottomBarOut(false);
        setStep3Recording(false);
        setStep3RecordingProgress(1);
        step3RecordingRef.current = false;
        step3RecorderRef.current = null;
        step3RecordingStartingRef.current = false;
        stopStep3Camera();
        showToast('Video ready to share');
      };

      drawFrame();
      recorder.start();
      step3RecordingRef.current = true;
      step3RecordStartedAtRef.current = performance.now();
      setStep3RecordingProgress(1);
      setStep3Recording(true);
      step3RecordStopTimerRef.current = setTimeout(stopStep3Recording, STEP3_MAX_RECORD_MS);
    } catch (err) {
      console.warn('[step3] Recording failed:', err);
      setStep3Recording(false);
      setStep3RecordingProgress(1);
      step3RecordingRef.current = false;
      step3RecorderRef.current = null;
      showToast('Could not start video recording');
    } finally {
      step3RecordingStartingRef.current = false;
      if (step3PendingStopRef.current) {
        step3PendingStopRef.current = false;
        setTimeout(stopStep3Recording, 300);
      }
    }
  }, [buildFrameDataUrl, getCanvasSize, revokeStep3VideoUrl, setToolsCollapsed, showToast, stopStep3Camera, stopStep3Recording,
      toolsCollapsedRef, toolsCollapseTimerRef]);

  const handleStep3PointerDown = useCallback((e) => {
    if (step3Mode !== STEP3_MODE.LIVE || activeToolRef.current) return;
    if (e.isPrimary === false) return;
    e.preventDefault();
    step3PointerDownRef.current = true;
    step3PointerIdRef.current = e.pointerId;
    if (e.currentTarget.setPointerCapture) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture can fail if the pointer was already released.
      }
    }
    clearTimeout(step3LongPressTimerRef.current);
    step3LongPressTimerRef.current = setTimeout(() => {
      step3LongPressTimerRef.current = null;
      if (!step3PointerDownRef.current) return;
      startStep3Recording();
    }, STEP3_LONG_PRESS_MS);
  }, [startStep3Recording, step3Mode]);

  const handleStep3PointerUp = useCallback(async (e) => {
    if (step3Mode !== STEP3_MODE.LIVE) return;
    e.preventDefault();
    if (step3PointerIdRef.current !== null && e.pointerId !== step3PointerIdRef.current) return;
    if (e.currentTarget.releasePointerCapture && e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore release races; the recording stop path below is what matters.
      }
    }
    const shouldCapturePhoto = !!step3LongPressTimerRef.current;
    step3PointerDownRef.current = false;
    step3PointerIdRef.current = null;
    clearTimeout(step3LongPressTimerRef.current);
    step3LongPressTimerRef.current = null;

    if (step3RecordingRef.current || step3RecordingStartingRef.current) {
      stopStep3Recording();
      return;
    }
    if (!shouldCapturePhoto) return;

    try {
      const photoUrl = await captureStep3CameraPhoto();
      setStep3PhotoUrl(photoUrl);
      revokeStep3VideoUrl();
      setStep3VideoUrl('');
      step3VideoBlobRef.current = null;
      setStep3Mode(STEP3_MODE.PHOTO);
      stopStep3Camera();
      setToolsCollapsed(false);
      toolsCollapsedRef.current = false;
      clearTimeout(toolsCollapseTimerRef.current);
      setToolsVisible(true);
      setToolsOut(false);
      setBottomBarOut(false);
      if (canvasRef.current) canvasRef.current.classList.add('no-tool');
      if (stickerSys.stickerOverlayRef.current) stickerSys.stickerOverlayRef.current.style.pointerEvents = '';
      showToast('Add stickers, text, or draw');
    } catch (err) {
      console.warn('[step3] Photo capture failed:', err);
      showToast('Camera is still warming up');
    }
  }, [captureStep3CameraPhoto, revokeStep3VideoUrl, showToast, step3Mode, stickerSys, stopStep3Camera,
      setToolsCollapsed, toolsCollapsedRef, toolsCollapseTimerRef]);

  const handleStep3PointerCancel = useCallback((e) => {
    if (step3Mode !== STEP3_MODE.LIVE) return;
    e.preventDefault();
    if (step3PointerIdRef.current !== null && e.pointerId !== step3PointerIdRef.current) return;
    if (e.currentTarget.releasePointerCapture && e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore release races; cancel still clears local recording state.
      }
    }
    step3PointerDownRef.current = false;
    step3PointerIdRef.current = null;
    clearTimeout(step3LongPressTimerRef.current);
    step3LongPressTimerRef.current = null;
    if (step3RecordingRef.current || step3RecordingStartingRef.current) {
      stopStep3Recording();
    }
  }, [step3Mode, stopStep3Recording]);

  const enterStep3 = useCallback(async () => {
    exitCurrentTool(true);
    stickerSys.closePanel();
    setSharePanelVisible(false);
    setScrimVisible(false);
    setIntroCardVisible(false);
    setStep3PhotoUrl('');
    revokeStep3VideoUrl();
    setStep3VideoUrl('');
    step3VideoBlobRef.current = null;
    setSavedFramesVisible(false);
    setStep3Mode(STEP3_MODE.LIVE);
    setEditorVisible(false);
    setUndoRedoVisible(false);
    setUndoRedoOut(false);
    setToolsVisible(false);
    setToolsOut(false);
    setBottomBarVisible(false);
    setBottomBarOut(false);
    setFrameScrimVisible(true);
    setExitBtnVisible(true);
    setExitBtnOut(false);
    if (canvasRef.current) canvasRef.current.classList.add('no-tool');
    if (stickerSys.stickerOverlayRef.current) stickerSys.stickerOverlayRef.current.style.pointerEvents = 'none';
    await delay(80);
    await startStep3Camera();
    showToast('Tap for photo. Hold for video.');
  }, [exitCurrentTool, revokeStep3VideoUrl, setSharePanelVisible, showToast, startStep3Camera, stickerSys]);

  const exitStep3ToEditor = useCallback(async () => {
    stopStep3Recording();
    stopStep3Camera();
    setStep3Recording(false);
    setStep3RecordingProgress(1);
    step3RecordingRef.current = false;
    setStep3Mode(null);
    setStep3PhotoUrl('');
    revokeStep3VideoUrl();
    setStep3VideoUrl('');
    step3VideoBlobRef.current = null;
    setSavedFramesVisible(false);
    setScrimVisible(false);
    setEditorVisible(true);
    setFrameScrimVisible(true);
    setExitBtnVisible(true);
    setExitBtnOut(false);
    setUndoRedoVisible(true);
    setUndoRedoOut(false);
    setToolsCollapsed(false);
    toolsCollapsedRef.current = false;
    clearTimeout(toolsCollapseTimerRef.current);
    setToolsVisible(true);
    setToolsOut(false);
    setBottomBarVisible(true);
    setBottomBarOut(false);
    if (stickerSys.stickerOverlayRef.current) stickerSys.stickerOverlayRef.current.style.pointerEvents = '';
    if (canvasRef.current) canvasRef.current.classList.add('no-tool');
  }, [revokeStep3VideoUrl, setToolsCollapsed, stickerSys, stopStep3Camera, stopStep3Recording,
      toolsCollapsedRef, toolsCollapseTimerRef]);

  const returnStep3ToLive = useCallback(async () => {
    if (activeToolRef.current) exitCurrentTool(true);
    setStep3PhotoUrl('');
    revokeStep3VideoUrl();
    setStep3VideoUrl('');
    step3VideoBlobRef.current = null;
    setStep3Mode(STEP3_MODE.LIVE);
    setToolsVisible(false);
    setToolsOut(false);
    setBottomBarOut(false);
    if (canvasRef.current) canvasRef.current.classList.add('no-tool');
    if (stickerSys.stickerOverlayRef.current) stickerSys.stickerOverlayRef.current.style.pointerEvents = 'none';
    await delay(80);
    await startStep3Camera();
    showToast('Tap for photo. Hold for video.');
  }, [exitCurrentTool, revokeStep3VideoUrl, showToast, startStep3Camera, stickerSys]);

  const handleStep3Back = useCallback(async () => {
    if (savedFramesVisible) {
      setSavedFramesVisible(false);
      setScrimVisible(false);
      return;
    }
    if (step3Mode === STEP3_MODE.LIVE) {
      await exitStep3ToEditor();
      return;
    }
    await returnStep3ToLive();
  }, [exitStep3ToEditor, returnStep3ToLive, savedFramesVisible, step3Mode]);

  const saveFrameLocal = useCallback(async (source = 'made') => {
    try {
      const frameDataUrl = await buildFrameDataUrl();
      const item = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: frameName.trim() || 'my frame',
        frameDataUrl,
        createdAt: new Date().toISOString(),
        source,
      };
      const next = [item, ...loadSavedFrames().filter(frame => frame.id !== item.id)].slice(0, 24);
      persistSavedFrames(next);
      setSavedFrames(next);
      showToast('Frame saved');
      return item;
    } catch (err) {
      console.warn('[step3] Save frame failed:', err);
      showToast('Could not save frame');
      return null;
    }
  }, [buildFrameDataUrl, frameName, showToast]);

  const openSavedFrames = useCallback(() => {
    setSavedFrames(loadSavedFrames());
    setSavedFramesVisible(true);
    setScrimVisible(true);
  }, []);

  const closeSavedFrames = useCallback(() => {
    setSavedFramesVisible(false);
    setScrimVisible(false);
  }, []);

  const handleSavedFrameSelect = useCallback(async (frame) => {
    try {
      const img = await loadImage(frame.frameDataUrl);
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      const { width, height } = getCanvasSize();
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      stickerSys.clearStickers();
      mainUndoStackRef.current = [canvas.toDataURL()];
      mainRedoStackRef.current = [];
      syncHistoryBtns();
      closeSavedFrames();
      showToast('Frame loaded');
    } catch (err) {
      console.warn('[step3] Saved frame load failed:', err);
      showToast('Could not load frame');
    }
  }, [closeSavedFrames, getCanvasSize, mainRedoStackRef, mainUndoStackRef, showToast, stickerSys, syncHistoryBtns]);

  const handleSavedFrameDelete = useCallback((frameId) => {
    const next = loadSavedFrames().filter(frame => frame.id !== frameId);
    persistSavedFrames(next);
    setSavedFrames(next);
    showToast('Frame removed');
  }, [showToast]);

  const handleStep3SaveRetake = useCallback(async () => {
    if (step3Mode === STEP3_MODE.VIDEO && step3VideoBlobRef.current) {
      try {
        const blob = await buildStep3VideoBlob();
        downloadBlob(blob, `retake-${Date.now()}.webm`);
        showToast('Saved!');
      } catch (err) {
        console.warn('[step3] Save video failed:', err);
        downloadBlob(step3VideoBlobRef.current, `retake-${Date.now()}.webm`);
        showToast('Saved original video');
      }
      return;
    }
    if (step3Mode === STEP3_MODE.PHOTO) {
      try {
        const blob = await buildStep3PhotoBlob();
        downloadBlob(blob, `retake-${Date.now()}.jpg`);
        showToast('Saved!');
      } catch (err) {
        console.warn('[step3] Save retake failed:', err);
        showToast('Could not save Retake');
      }
      return;
    }
    await saveFrameLocal();
    openSavedFrames();
  }, [buildStep3PhotoBlob, buildStep3VideoBlob, openSavedFrames, saveFrameLocal, showToast, step3Mode]);

  const handleStep3ShareRetake = useCallback(async () => {
    if (step3Mode === STEP3_MODE.VIDEO && step3VideoBlobRef.current) {
      try {
        const blob = await buildStep3VideoBlob();
        await shareBlob(blob, `retake-${Date.now()}.webm`, 'My Retake', frameName);
      } catch (err) {
        console.warn('[step3] Share video failed:', err);
        await shareBlob(step3VideoBlobRef.current, `retake-${Date.now()}.webm`, 'My Retake', frameName);
      }
      return;
    }
    if (step3Mode === STEP3_MODE.PHOTO) {
      try {
        const blob = await buildStep3PhotoBlob();
        await shareBlob(blob, `retake-${Date.now()}.jpg`, 'My Retake', frameName);
      } catch (err) {
        console.warn('[step3] Share retake failed:', err);
        showToast('Could not share Retake');
      }
      return;
    }
    await handleShare();
  }, [buildStep3PhotoBlob, buildStep3VideoBlob, frameName, handleShare, shareBlob, showToast, step3Mode]);

  const handleSavedFramesCopyLink = useCallback(async () => {
    setSavedFramesVisible(false);
    await handleCopyLink();
  }, [handleCopyLink]);

  useEffect(() => {
    if (step3Mode !== STEP3_MODE.LIVE) return undefined;

    const stopActiveRecording = () => {
      if (!step3RecordingRef.current && !step3RecordingStartingRef.current) return;
      step3PointerDownRef.current = false;
      step3PointerIdRef.current = null;
      clearTimeout(step3LongPressTimerRef.current);
      step3LongPressTimerRef.current = null;
      stopStep3Recording();
    };
    const stopOnVisibilityChange = () => {
      if (document.visibilityState === 'hidden') stopActiveRecording();
    };

    document.addEventListener('pointerup', stopActiveRecording, true);
    document.addEventListener('pointercancel', stopActiveRecording, true);
    document.addEventListener('mouseup', stopActiveRecording, true);
    document.addEventListener('touchend', stopActiveRecording, true);
    document.addEventListener('touchcancel', stopActiveRecording, true);
    document.addEventListener('visibilitychange', stopOnVisibilityChange);
    window.addEventListener('blur', stopActiveRecording);

    return () => {
      document.removeEventListener('pointerup', stopActiveRecording, true);
      document.removeEventListener('pointercancel', stopActiveRecording, true);
      document.removeEventListener('mouseup', stopActiveRecording, true);
      document.removeEventListener('touchend', stopActiveRecording, true);
      document.removeEventListener('touchcancel', stopActiveRecording, true);
      document.removeEventListener('visibilitychange', stopOnVisibilityChange);
      window.removeEventListener('blur', stopActiveRecording);
    };
  }, [step3Mode, stopStep3Recording]);

  useEffect(() => {
    if (!step3Recording) {
      setStep3RecordingProgress(1);
      return undefined;
    }

    let rafId = 0;
    const updateProgress = () => {
      const elapsed = performance.now() - step3RecordStartedAtRef.current;
      const progress = Math.max(0, Math.min(1, 1 - elapsed / STEP3_MAX_RECORD_MS));
      setStep3RecordingProgress(progress);
      rafId = window.requestAnimationFrame(updateProgress);
    };

    updateProgress();
    return () => window.cancelAnimationFrame(rafId);
  }, [step3Recording]);

  useEffect(() => {
    return () => {
      stopStep3Recording();
      stopStep3Camera();
      revokeStep3VideoUrl();
      clearTimeout(step3LongPressTimerRef.current);
      clearTimeout(step3RecordStopTimerRef.current);
      cancelAnimationFrame(step3RecordRafRef.current);
    };
  }, [revokeStep3VideoUrl, stopStep3Camera, stopStep3Recording]);

  const handleBgGallery = useCallback(() => {
    if (galleryInputRef.current) galleryInputRef.current.click();
  }, []);

  const handleProceedToStep3 = useCallback(() => {
    enterStep3();
  }, [enterStep3]);

  const handleToolDownload = useCallback(() => {
    exitCurrentTool(true);
    if (stickerSys.placedStickersRef.current.length > 0) {
      stickerSys.commitStickersToCanvas();
      pushHistory();
    }
    try {
      const dataURL = canvasRef.current.toDataURL('image/png');
      const a = document.createElement('a');
      const name = (frameName.trim() || 'retake-frame').replace(/[^a-z0-9\-_]/gi, '-').toLowerCase();
      a.download = name + '.png'; a.href = dataURL; a.click();
      showToast('Saved!');
    } catch(e) {
      showToast('Unable to save — try from a server');
    }
  }, [exitCurrentTool, stickerSys, pushHistory, frameName, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGalleryChange = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) { introPhotoFlowRef.current = false; return; }
    const url = URL.createObjectURL(file);
    const newImg = new Image();
    newImg.onload = async () => {
      const canvas = canvasRef.current, ctx = ctxRef.current;
      const W = canvas.width, H = canvas.height;
      const scale = Math.max(W / newImg.width, H / newImg.height);
      const sw = W / scale, sh = H / scale;
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(newImg, (newImg.width-sw)/2, (newImg.height-sh)/2, sw, sh, 0, 0, W, H);
      mainUndoStackRef.current = [canvas.toDataURL()];
      mainRedoStackRef.current = [];
      syncHistoryBtns();
      URL.revokeObjectURL(url);
      if (introPhotoFlowRef.current) { introPhotoFlowRef.current = false; await enterEditor(); }
    };
    newImg.src = url;
    e.target.value = '';
  }, [syncHistoryBtns, enterEditor, mainUndoStackRef, mainRedoStackRef]);

  const handleChoosePhoto = useCallback(() => {
    introPhotoFlowRef.current = true;
    if (galleryInputRef.current) galleryInputRef.current.click();
  }, []);

  const handleStartBlank = useCallback(async () => {
    introPhotoFlowRef.current = false;
    const ctx = ctxRef.current, canvas = canvasRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    mainUndoStackRef.current = [canvas.toDataURL()];
    mainRedoStackRef.current = [];
    syncHistoryBtns();
    await enterEditor();
  }, [syncHistoryBtns, enterEditor, mainUndoStackRef, mainRedoStackRef]);

  const handleExitBtn = useCallback(async () => {
    if (step3Mode) {
      const ok = await showConfirm('Leave camera preview?', 'Leave', true);
      if (!ok) return;
      stopStep3Recording();
      stopStep3Camera();
      revokeStep3VideoUrl();
      setStep3Mode(null);
      setStep3PhotoUrl('');
      setStep3VideoUrl('');
      step3VideoBlobRef.current = null;
      await exitToIntro();
      return;
    }
    if (mainUndoStackRef.current.length > 1) {
      const ok = await showConfirm('Discard this frame?', 'Discard', true);
      if (!ok) return;
    }
    await exitToIntro();
  }, [exitToIntro, mainUndoStackRef, revokeStep3VideoUrl, showConfirm, step3Mode, stopStep3Camera, stopStep3Recording]);

  const handleScrimClick = useCallback(() => {
    if (editNameVisible) { saveEditName(); return; }
    if (savedFramesVisible) { closeSavedFrames(); return; }
    if (sharePanelVisible) { setSharePanelVisible(false); setScrimVisible(false); }
    if (stickerSys.stickerPanelVisible) stickerSys.closePanel();
  }, [closeSavedFrames, editNameVisible, saveEditName, savedFramesVisible, sharePanelVisible, setSharePanelVisible, stickerSys]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEraserOpacityInput = useCallback((e) => {
    eraserOpacityRef.current = parseInt(e.target.value) / 100;
    const val = e.target.value;
    e.target.style.setProperty('--fill', val + '%');
    document.getElementById('eraserOpacityVal').textContent = val + '%';
  }, []);

  const handleSwatchClick = useCallback((color) => {
    doodleColorRef.current = color;
    setDoodleColor(color);
    syncCursor();
  }, [syncCursor]);

  const handlePenTypeClick = useCallback((type) => {
    penTypeRef.current = type;
    setPenType(type);
  }, []);

  const handleEraserShapeClick = useCallback((shape) => {
    eraserModeRef.current = shape;
    setEraserMode(shape);
    if (shape === 'freehand') {
      resetMagicMode();
      if (canvasRef.current) canvasRef.current.style.cursor = 'none';
    } else if (shape === 'magic') {
      resetMagicMode();
      if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair';
      if (brushCursorRef.current) brushCursorRef.current.style.display = 'none';
    } else {
      resetMagicMode();
      if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair';
      if (brushCursorRef.current) brushCursorRef.current.style.display = 'none';
    }
  }, [resetMagicMode]);

  const isStep3 = step3Mode !== null;
  const isStep3Live = step3Mode === STEP3_MODE.LIVE;
  const isStep3PhotoReview = step3Mode === STEP3_MODE.PHOTO;
  const isStep3VideoReview = step3Mode === STEP3_MODE.VIDEO;
  const isStep3Review = isStep3PhotoReview || isStep3VideoReview;
  const flowState = sharePanelVisible
    ? INVITER_FLOW_STATES.SHARING
    : savedFramesVisible
      ? INVITER_FLOW_STATES.STEP3_SAVED_FRAMES
    : isStep3Live
      ? INVITER_FLOW_STATES.STEP3_LIVE
    : isStep3VideoReview
      ? INVITER_FLOW_STATES.STEP3_VIDEO_REVIEW
    : isStep3PhotoReview && !(activeTool || textToolActive)
      ? INVITER_FLOW_STATES.STEP3_PHOTO_REVIEW
    : (activeTool || textToolActive)
      ? INVITER_FLOW_STATES.TOOL_ACTIVE
      : editorVisible
        ? INVITER_FLOW_STATES.EDITING
        : INVITER_FLOW_STATES.INTRO;

  return (
    <div className="screen" id="screen" data-flow-state={flowState}>

      <FrameCanvas
        canvasRef={canvasRef}
        selectionCanvasRef={selectionCanvasRef}
        frameElRef={frameElRef}
        brushCursorRef={brushCursorRef}
        brushCursorSvgRef={brushCursorSvgRef}
        brushCursorCircleRef={brushCursorCircleRef}
        frameScrimVisible={frameScrimVisible}
      >
        {isStep3 && (
          <div
            className={`step3-media-layer step3-media-layer--${step3Mode}${step3Recording ? ' is-recording' : ''}`}
            onPointerDown={handleStep3PointerDown}
            onPointerUp={handleStep3PointerUp}
            onPointerCancel={handleStep3PointerCancel}
          >
            {isStep3Live && (
              <>
                <video
                  className="step3-camera-video"
                  ref={step3VideoRef}
                  autoPlay
                  playsInline
                  muted
                />
                {!step3CameraReady && <div className="step3-camera-fallback">Camera preview</div>}
              </>
            )}
            {isStep3PhotoReview && step3PhotoUrl && (
              <img className="step3-captured-photo" src={step3PhotoUrl} alt="" draggable="false" />
            )}
            {isStep3VideoReview && step3VideoUrl && (
              <video
                className="step3-review-video"
                src={step3VideoUrl}
                autoPlay
                loop
                muted
                playsInline
              />
            )}
          </div>
        )}
      </FrameCanvas>

      {step3Recording && (
        <svg
          className="step3-recording-stroke"
          viewBox="0 0 414 736"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            className="step3-recording-stroke-path"
            d="M 207 0 H 20 Q 0 0 0 20 V 716 Q 0 736 20 736 H 394 Q 414 736 414 716 V 20 Q 414 0 394 0 H 207"
            pathLength="1"
            style={{ strokeDasharray: `${step3RecordingProgress} 1` }}
          />
        </svg>
      )}

      {!step3Recording && (
        <ExitButton
          visible={exitBtnVisible}
          out={exitBtnOut}
          label={isStep3 ? 'Leave camera preview' : 'Close frame editor'}
          onClick={handleExitBtn}
        />
      )}

      {!isStep3 && (
        <>
          <UndoRedoCluster
            visible={undoRedoVisible}
            out={undoRedoOut}
            undoDisabled={undoBtnDisabled}
            redoDisabled={redoBtnDisabled}
            onUndo={mainUndo}
            onRedo={mainRedo}
          />

          <VerticalToolbar
            visible={toolsVisible}
            out={toolsOut}
            collapsed={toolsCollapsed}
            labelsExpanded={labelsExpanded}
            activeTool={activeTool}
            orderedToolIds={step2ToolIds}
            onToolText={handleToolText}
            onToolStickers={handleToolStickers}
            onToolDoodle={handleToolDoodle}
            onToolEraser={handleToolEraser}
            onToolDownload={handleToolDownload}
            onToggle={handleToggleTools}
            onInteraction={handleToolbarInteraction}
            onToolMouseEnter={handleToolMouseEnter}
            onToolMouseLeave={handleToolMouseLeave}
          />

          <BottomBar
            visible={bottomBarVisible}
            out={bottomBarOut}
            frameName={frameName}
            galleryInputRef={galleryInputRef}
            onGalleryChange={handleGalleryChange}
            onGalleryClick={handleBgGallery}
            onEditName={openEditName}
            onProceed={handleProceedToStep3}
          />
        </>
      )}

      {isStep3Review && !step3Recording && (
        <VerticalToolbar
          visible={toolsVisible}
          out={toolsOut}
          collapsed={toolsCollapsed}
          labelsExpanded={labelsExpanded}
          activeTool={activeTool}
          orderedToolIds={step3ToolIds}
          onToolText={handleToolText}
          onToolStickers={handleToolStickers}
          onToolDoodle={handleToolDoodle}
          onToolEraser={() => {}}
          onToolDownload={handleStep3SaveRetake}
          onToggle={handleToggleTools}
          onInteraction={handleToolbarInteraction}
          onToolMouseEnter={handleToolMouseEnter}
          onToolMouseLeave={handleToolMouseLeave}
        />
      )}

      {isStep3 && !step3Recording && (
        <GlassSurface className={`step3-bottom-bar visible${bottomBarOut ? ' out' : ''}`} id="step3BottomBar">
          <SolidIconButton
            className={isStep3Review ? 'step3-retake-btn' : 'step3-circle-btn'}
            icon="arrowLeft"
            label={isStep3Review ? 'Retake photo or video' : 'Back'}
            shape={isStep3Review ? 'pill' : 'circle'}
            onClick={handleStep3Back}
          >
            {isStep3Review ? <span className="step3-retake-label">Retake</span> : null}
          </SolidIconButton>
          <button
            type="button"
            className="s6-frame-title-btn step3-frame-title-btn"
            aria-label="Name your frame"
            onClick={openEditName}
          >
            <span className="s6-frame-title-text">{frameName}</span>
          </button>
          <div className="step3-bottom-actions">
            <SolidIconButton
              className="step3-circle-btn"
              icon="library"
              label="Saved frames"
              onClick={openSavedFrames}
            />
            <SolidIconButton
              className="step3-share-btn"
              icon="share"
              label={isStep3Review ? 'Share Retake' : 'Share frame'}
              onClick={handleStep3ShareRetake}
            />
          </div>
        </GlassSurface>
      )}

      <DrawingToolOverlays
        tmLeftPanelRef={tmLeftPanelRef}
        tmSizeHandleRef={tmSizeHandleRef}
        tmIn={tmIn}
        tmLeftIn={tmLeftIn}
        tmPenBarIn={tmBarMode === 'doodle'}
        doodleColor={doodleColor}
        penType={penType}
        tmUndoBtnDisabled={tmUndoBtnDisabled}
        tmRedoBtnDisabled={tmRedoBtnDisabled}
        onDone={handleDone}
        onUndo={toolUndo}
        onRedo={toolRedo}
        onSwatchClick={handleSwatchClick}
        onPenTypeClick={handlePenTypeClick}
      />

      <EraserBar
        active={!isStep3 && tmBarMode === 'eraser'}
        eraserMode={eraserMode}
        eraserOpacitySliderRef={eraserOpacitySliderRef}
        magicPhase={magicPhase}
        magicConfirmDisabled={magicConfirmDisabled}
        magicDetecting={magicDetecting}
        magicRefMode={magicRefMode}
        magicOpacity={magicOpacity}
        onShapeClick={handleEraserShapeClick}
        onOpacityInput={handleEraserOpacityInput}
        onMagicBack={() => handleEraserShapeClick('freehand')}
        onMagicConfirm={confirmMagicLasso}
        onMagicRefMode={handleMagicRefMode}
        onMagicOpacityInput={handleMagicOpacityInput}
        onMagicApply={applyMagicErase}
      />

      {!step3Recording && (
        <Toast className="s6-toast" id="toast" visible={toastVisible}>{toastMsg}</Toast>
      )}

      <EditNamePopup
        visible={editNameVisible}
        inputValue={editNameInputValue}
        onChange={e => setEditNameInputValue(e.target.value)}
        onSave={saveEditName}
      />

      <SharePopup visible={sharePanelVisible} shareCode={shareCode} shareUrl={shareUrl} onCopyCode={handleCopyCode} />

      <div className={`saved-frames-sheet${savedFramesVisible ? ' visible' : ''}`} id="savedFramesSheet">
        <div className="saved-frames-handle"></div>
        <div className="saved-frames-header">
          <div>
            <p className="saved-frames-title">Saved frames</p>
            <p className="saved-frames-subtitle">Keep your best frames close.</p>
          </div>
          <SolidIconButton className="saved-frames-close" icon="close" label="Close saved frames" onClick={closeSavedFrames} />
        </div>
        <div className="saved-frames-actions">
          <button className="saved-frame-action" onClick={() => saveFrameLocal('made')}>Save this frame</button>
          <button className="saved-frame-action" onClick={handleSavedFramesCopyLink}>Copy invite link</button>
        </div>
        <div className="saved-frames-grid">
          {savedFrames.length === 0 ? (
            <div className="saved-frames-empty">No saved frames yet.</div>
          ) : savedFrames.map(frame => (
            <div className="saved-frame-card" key={frame.id}>
              <button className="saved-frame-preview" onClick={() => handleSavedFrameSelect(frame)}>
                <img src={frame.frameDataUrl} alt="" />
              </button>
              <div className="saved-frame-meta">
                <button className="saved-frame-name" onClick={() => handleSavedFrameSelect(frame)}>{frame.name}</button>
                <button className="saved-frame-delete" onClick={() => handleSavedFrameDelete(frame.id)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`scrim${scrimVisible ? ' visible' : ''}`} id="scrim" onClick={handleScrimClick} />

      <IntroCard visible={introCardVisible} onChoosePhoto={handleChoosePhoto} onStartBlank={handleStartBlank} />

      <ConfirmDialog
        confirmScrimVisible={confirmScrimVisible}
        confirmVisible={confirmVisible}
        confirmMsg={confirmMsg}
        confirmOkLabel={confirmOkLabel}
        confirmDanger={confirmDanger}
        cancelLabel="Cancel"
        onConfirm={() => dismissConfirm(true)}
        onCancel={() => dismissConfirm(false)}
      />

      <TextToolOverlay
        active={textToolActive}
        textPreviewRef={textPreviewRef}
        txtFont={txtFont} setTxtFont={setTxtFont}
        txtColor={txtColor} setTxtColor={setTxtColor}
        txtSize={txtSize} setTxtSize={setTxtSize}
        txtWrapWidth={txtWrapWidth} setTxtWrapWidth={setTxtWrapWidth}
        txtOpacity={txtOpacity} setTxtOpacity={setTxtOpacity}
        txtAlign={txtAlign} setTxtAlign={setTxtAlign}
        onConfirm={() => exitTextTool(true)}
      />

      <StickerPanel sys={stickerSys} />

    </div>
  );
}
