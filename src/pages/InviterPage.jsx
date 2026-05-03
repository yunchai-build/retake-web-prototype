import React, { useEffect, useRef, useState, useCallback } from 'react';
import '../styles/glass.css';
import '../styles/inviter.css';
import { useToast } from '../hooks/useToast';
import { useStickerSystem } from '../hooks/useStickerSystem';
import { useMagicEraser } from '../hooks/useMagicEraser';
import { useCanvasDrawing } from '../hooks/useCanvasDrawing';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { useSharePanel } from '../hooks/useSharePanel';
import { useEditName } from '../hooks/useEditName';
import { useToolbarState } from '../hooks/useToolbarState';
import { useHistory } from '../hooks/useHistory';
import { useTextTool } from '../hooks/useTextTool';
import StickerPanel from '../components/StickerPanel';
import TextToolOverlay from '../components/TextToolOverlay';
import DrawingToolOverlays from '../components/DrawingToolOverlays';
import ConfirmDialog from '../components/ConfirmDialog';
import FrameCanvas from '../components/FrameCanvas';
import ExitButton from '../components/ExitButton';
import UndoRedoCluster from '../components/UndoRedoCluster';
import VerticalToolbar from '../components/VerticalToolbar';
import BottomBar from '../components/BottomBar';
import EraserBar from '../components/EraserBar';
import EditNamePopup from '../components/EditNamePopup';
import SharePopup from '../components/SharePopup';
import IntroCard from '../components/IntroCard';

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

  const handleBgGallery = useCallback(() => {
    if (galleryInputRef.current) galleryInputRef.current.click();
  }, []);

  const handleProceedToStep3 = useCallback(() => {
    showToast('Step 3 next');
  }, [showToast]);

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
    if (mainUndoStackRef.current.length > 1) {
      const ok = await showConfirm('Discard this frame?', 'Discard', true);
      if (!ok) return;
    }
    await exitToIntro();
  }, [showConfirm, exitToIntro, mainUndoStackRef]);

  const handleScrimClick = useCallback(() => {
    if (editNameVisible) { saveEditName(); return; }
    if (sharePanelVisible) { setSharePanelVisible(false); setScrimVisible(false); }
    if (stickerSys.stickerPanelVisible) stickerSys.closePanel();
  }, [editNameVisible, saveEditName, sharePanelVisible, setSharePanelVisible, stickerSys]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div className="screen" id="screen">

      <FrameCanvas
        canvasRef={canvasRef}
        selectionCanvasRef={selectionCanvasRef}
        frameElRef={frameElRef}
        brushCursorRef={brushCursorRef}
        brushCursorSvgRef={brushCursorSvgRef}
        brushCursorCircleRef={brushCursorCircleRef}
        frameScrimVisible={frameScrimVisible}
      />

      <ExitButton visible={exitBtnVisible} out={exitBtnOut} onClick={handleExitBtn} />

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
        orderedToolIds={orderedToolIds}
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
        active={tmBarMode === 'eraser'}
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

      <div className={`s6-toast${toastVisible ? ' visible' : ''}`} id="toast">{toastMsg}</div>

      <EditNamePopup
        visible={editNameVisible}
        inputValue={editNameInputValue}
        onChange={e => setEditNameInputValue(e.target.value)}
        onSave={saveEditName}
      />

      <SharePopup visible={sharePanelVisible} shareCode={shareCode} shareUrl={shareUrl} onCopyCode={handleCopyCode} />

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
