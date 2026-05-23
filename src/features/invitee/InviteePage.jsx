import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import '../../styles/invitee.css';
import Toast from '../../components/ui/Toast.jsx';
import GlassIconButton from '../../components/ui/GlassIconButton.jsx';
import FrameCanvas from '../editor/components/FrameCanvas.jsx';
import ExitButton from '../editor/components/ExitButton.jsx';
import UndoRedoCluster from '../editor/components/UndoRedoCluster.jsx';
import { useConfirmDialog } from '../editor/hooks/useConfirmDialog.js';
import ConfirmDialog from '../editor/components/ConfirmDialog.jsx';
import StickerPanel from '../editor/components/StickerPanel.jsx';
import TextToolOverlay from '../editor/components/TextToolOverlay.jsx';
import DrawingToolOverlays from '../editor/components/DrawingToolOverlays.jsx';
import RetakeCameraBottomBar from '../editor/components/RetakeCameraBottomBar.jsx';
import CameraGestureToast from '../editor/components/CameraGestureToast.jsx';
import { RetakeCountdownOverlay, RetakeScreenFlash } from '../editor/components/RetakeCameraOverlays.jsx';
import RetakeCameraStage from '../editor/components/RetakeCameraStage.jsx';
import RetakeZoomControl from '../editor/components/RetakeZoomControl.jsx';
import useRetakeCamera from '../editor/hooks/useRetakeCamera.js';
import { useCanvasDrawing } from '../editor/hooks/useCanvasDrawing.js';
import { useStickerSystem } from '../editor/hooks/useStickerSystem.js';
import { useHistory } from '../editor/hooks/useHistory.js';
import { useTextTool } from '../editor/hooks/useTextTool.js';
import { filterOrderedToolIds, RETAKE_REVIEW_TOOL_IDS, useToolbarState } from '../editor/hooks/useToolbarState.js';
import useInviterLayerStack from '../editor/hooks/useInviterLayerStack.js';
import VerticalToolbar from '../inviter/components/VerticalToolbar.jsx';
import BottomBar from '../inviter/components/BottomBar.jsx';
import PhotoInputs from '../inviter/components/PhotoInputs.jsx';
import { chooseRetakeVideoMimeType, drawRetakeWatermark } from '../editor/utils/retakeCamera.js';
import { drawMediaCoverWithTransform } from '../editor/utils/canvas.js';
import { getInvite, recordRetake, uploadRetakeMedia } from '../../lib/api.js';
import { buildInviteUrl } from '../../lib/routes.js';
import { INVITEE_FLOW_STATES } from './state.js';
import InviteAcceptCard from './components/InviteAcceptCard.jsx';
import SubmittedRetakeBanner from './components/SubmittedRetakeBanner.jsx';

const CANVAS_SIZE = { width: 414, height: 736 };
const INVITEE_CAMERA_GESTURE_HINT_MS = 2600;
const INVITEE_SUBMIT_MIN_BUSY_MS = 900;
const INVITEE_COMPOSITION_BG = '#000';

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function waitForMinimumBusy(startedAt) {
  return wait(Math.max(0, INVITEE_SUBMIT_MIN_BUSY_MS - (Date.now() - startedAt)));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https?:\/\//i.test(src)) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image load failed'));
    image.src = src;
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getAvatarText(name) {
  const cleanName = String(name || '').trim();
  if (!cleanName) return '';
  const parts = cleanName.split(/\s+/).filter(Boolean);
  const initials = parts.map(part => part[0]).join('');
  return (initials.length > 1 ? initials : cleanName.slice(0, 2)).toUpperCase();
}

function createSubmittedRetakeFile(preview) {
  if (!preview?.blob || !preview?.filename) return null;
  return new File([preview.blob], preview.filename, {
    type: preview.blob.type || 'application/octet-stream',
  });
}

export default function InviteePage() {
  const { inviteId: routeInviteId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const inviteId = routeInviteId || searchParams.get('id') || '';
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const selectionCanvasRef = useRef(null);
  const frameElRef = useRef(null);
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const activeToolRef = useRef(null);
  const toolsHideTimerRef = useRef(null);
  const tmLeftPanelRef = useRef(null);
  const tmSizeHandleRef = useRef(null);
  const brushCursorRef = useRef(null);
  const lpCollapseTimerRef = useRef(null);
  const toolRadiusRef = useRef(32);
  const doodleColorRef = useRef('#F0E84A');
  const doodleOpacityRef = useRef(100);
  const doodleModeRef = useRef('draw');
  const penTypeRef = useRef('pen');
  const magicPenModeRef = useRef('freehand');
  const magicPenOpacityRef = useRef(100);
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedBannerVisible, setSubmittedBannerVisible] = useState(false);
  const [submittedPreview, setSubmittedPreview] = useState(null);
  const [activeTool, setActiveTool] = useState(null);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [gestureHintVisible, setGestureHintVisible] = useState(false);
  const [scrimVisible, setScrimVisible] = useState(false);
  const [toolsVisible, setToolsVisible] = useState(true);
  const [exitBtnOut, setExitBtnOut] = useState(false);
  const [undoRedoOut, setUndoRedoOut] = useState(false);
  const [toolsOut, setToolsOut] = useState(false);
  const [bottomBarOut, setBottomBarOut] = useState(false);
  const [tmIn, setTmIn] = useState(false);
  const [tmLeftIn, setTmLeftIn] = useState(false);
  const [tmBarMode, setTmBarMode] = useState(null);
  const [doodleColor, setDoodleColor] = useState('#F0E84A');
  const [doodleOpacity, setDoodleOpacity] = useState(100);
  const [doodleMode, setDoodleMode] = useState('draw');
  const [penType, setPenType] = useState('pen');
  const [magicPenMode, setMagicPenMode] = useState('freehand');
  const [magicPenOpacity, setMagicPenOpacity] = useState(100);
  const toastTimerRef = useRef(null);
  const gestureHintTimerRef = useRef(null);

  const showToast = useCallback((message) => {
    clearTimeout(toastTimerRef.current);
    setToastMsg(message);
    setToastVisible(true);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 1800);
  }, []);

  const camera = useRetakeCamera({
    getCanvasSize: () => CANVAS_SIZE,
    onToast: showToast,
    label: 'invitee',
  });

  useEffect(() => {
    return () => {
      if (submittedPreview?.url) URL.revokeObjectURL(submittedPreview.url);
    };
  }, [submittedPreview]);
  const {
    confirmVisible, confirmScrimVisible, confirmMsg, confirmOkLabel, confirmDanger,
    showConfirm, dismissConfirm,
  } = useConfirmDialog();
  const layerStack = useInviterLayerStack({
    frameElRef,
    canvasRef,
  });
  const stickerSys = useStickerSystem({
    ctxRef,
    setScrimVisible,
    showToast,
    overlayParentRef: frameElRef,
    onItemPlaced: layerStack.registerItemLayer,
    onItemTouched: layerStack.touchLayer,
    onItemRemoved: layerStack.removeLayer,
  });
  const createInviteeSnapshot = useCallback(() => ({
    canvas: (() => {
      try { return canvasRef.current?.toDataURL() || null; } catch { return null; }
    })(),
    layers: layerStack.createSnapshot(),
  }), [layerStack]);
  const restoreInviteeSnapshot = useCallback((snap) => new Promise(resolve => {
    if (!snap) {
      resolve();
      return;
    }

    const canvas = canvasRef.current;
    const ctx = ctxRef.current || canvas?.getContext('2d');
    const restoreCanvas = () => {
      if (!canvas || !ctx) return Promise.resolve();
      if (!snap.canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return Promise.resolve();
      }
      return new Promise(res => {
        const image = new Image();
        image.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(image, 0, 0);
          res();
        };
        image.onerror = () => res();
        image.src = snap.canvas;
      });
    };

    restoreCanvas().then(() => {
      layerStack.restoreSnapshot(snap.layers);
      resolve();
    });
  }), [layerStack]);
  const {
    mainUndoStackRef, mainRedoStackRef,
    toolUndoStackRef, toolRedoStackRef,
    sessionEntrySnapRef,
    undoBtnDisabled, redoBtnDisabled,
    tmUndoBtnDisabled, tmRedoBtnDisabled,
    snapshot, syncHistoryBtns, pushHistory,
    mainUndo, mainRedo, toolUndo, toolRedo,
  } = useHistory({
    canvasRef,
    ctxRef,
    activeToolRef,
    showToast,
    createSnapshot: createInviteeSnapshot,
    restoreSnapshot: restoreInviteeSnapshot,
  });
  const {
    toolsCollapsed, setToolsCollapsed,
    toolsCollapsedRef, toolsCollapseTimerRef,
    labelsExpanded,
    orderedToolIds, addRecentTool,
    handleToggleTools, handleToolbarInteraction, handleToolMouseEnter, handleToolMouseLeave,
  } = useToolbarState();
  const reviewToolIds = filterOrderedToolIds(orderedToolIds, RETAKE_REVIEW_TOOL_IDS);
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
    activeToolRef,
    setActiveTool,
    setExitBtnOut,
    setUndoRedoOut,
    setToolsOut,
    setBottomBarOut,
    toolsHideTimerRef,
    setToolsVisible,
    setTmIn,
    setToolsCollapsed,
    toolsCollapsedRef,
    toolsCollapseTimerRef,
    placeText: stickerSys.placeText,
  });

  const flowState = submitted
    ? INVITEE_FLOW_STATES.SUBMITTED
    : error
      ? INVITEE_FLOW_STATES.ERROR
      : !accepted
        ? INVITEE_FLOW_STATES.ACCEPT
        : camera.live
          ? INVITEE_FLOW_STATES.CAMERA_LIVE
          : camera.videoReview
            ? INVITEE_FLOW_STATES.VIDEO_REVIEW
            : camera.photoReview
              ? INVITEE_FLOW_STATES.PHOTO_REVIEW
              : INVITEE_FLOW_STATES.LOADING;

  useLayoutEffect(() => {
    document.body.classList.add('invitee-mode');
    document.body.classList.add('inviter-mode');
    return () => {
      document.body.classList.remove('invitee-mode');
      document.body.classList.remove('inviter-mode');
      clearTimeout(toastTimerRef.current);
      clearTimeout(gestureHintTimerRef.current);
      clearTimeout(toolsHideTimerRef.current);
      clearTimeout(toolsCollapseTimerRef.current);
      clearTimeout(lpCollapseTimerRef.current);
    };
  }, [toolsCollapseTimerRef]);

  useEffect(() => {
    clearTimeout(gestureHintTimerRef.current);
    if (!camera.live) {
      setGestureHintVisible(false);
      return undefined;
    }

    setGestureHintVisible(true);
    gestureHintTimerRef.current = setTimeout(() => {
      setGestureHintVisible(false);
      gestureHintTimerRef.current = null;
    }, INVITEE_CAMERA_GESTURE_HINT_MS);

    return () => {
      clearTimeout(gestureHintTimerRef.current);
      gestureHintTimerRef.current = null;
    };
  }, [camera.live]);

  useEffect(() => {
    let cancelled = false;
    async function loadInvite() {
      setLoading(true);
      setError('');
      if (!inviteId) {
        setError('This invite link is missing an id.');
        setLoading(false);
        return;
      }
      try {
        const nextInvite = await getInvite({ id: inviteId });
        if (!cancelled) setInvite(nextInvite);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Could not load this invite.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadInvite();
    return () => {
      cancelled = true;
    };
  }, [inviteId]);

  const clearReviewCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    stickerSys.clearStickers();
    layerStack.clearLayers();
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctxRef.current = ctx;
    }
    mainUndoStackRef.current = [];
    mainRedoStackRef.current = [];
    toolUndoStackRef.current = [];
    toolRedoStackRef.current = [];
    sessionEntrySnapRef.current = null;
    syncHistoryBtns();
  }, [
    layerStack,
    mainRedoStackRef,
    mainUndoStackRef,
    sessionEntrySnapRef,
    stickerSys,
    syncHistoryBtns,
    toolRedoStackRef,
    toolUndoStackRef,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !camera.review) return;
    ctxRef.current = canvas.getContext('2d');
    mainUndoStackRef.current = [snapshot()];
    mainRedoStackRef.current = [];
    toolUndoStackRef.current = [];
    toolRedoStackRef.current = [];
    sessionEntrySnapRef.current = null;
    syncHistoryBtns();
  }, [camera.review, camera.photoUrl, camera.videoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const acceptInvite = useCallback(async () => {
    setAccepted(true);
    setSubmitted(false);
    setSubmittedBannerVisible(false);
    setSubmittedPreview(null);
    activeToolRef.current = null;
    setActiveTool(null);
    clearReviewCanvas();
    await camera.enterLive();
  }, [camera, clearReviewCanvas]);

  const handleRetake = useCallback(async () => {
    setSubmitted(false);
    setSubmittedBannerVisible(false);
    setSubmittedPreview(null);
    activeToolRef.current = null;
    setActiveTool(null);
    setScrimVisible(false);
    setTmIn(false);
    setTmLeftIn(false);
    setTmBarMode(null);
    setToolsVisible(true);
    setExitBtnOut(false);
    setUndoRedoOut(false);
    setToolsOut(false);
    setBottomBarOut(false);
    clearReviewCanvas();
    await camera.returnToLive();
  }, [camera, clearReviewCanvas]);

  const handleStartOwnFrame = useCallback(() => {
    navigate('/inviter');
  }, [navigate]);

  const handleDismissSubmittedBanner = useCallback(() => {
    setSubmittedBannerVisible(false);
    setToolsVisible(true);
    setExitBtnOut(false);
    setUndoRedoOut(false);
    setToolsOut(false);
    setBottomBarOut(false);
  }, []);

  const handleBackToInvite = useCallback(() => {
    camera.stopCamera();
    clearReviewCanvas();
    activeToolRef.current = null;
    setActiveTool(null);
    setAccepted(false);
  }, [camera, clearReviewCanvas]);

  const confirmBackToInvite = useCallback(async () => {
    const ok = await showConfirm('Leave this invite?', 'Leave', true);
    if (ok) handleBackToInvite();
  }, [handleBackToInvite, showConfirm]);

  const confirmRetake = useCallback(async () => {
    const ok = await showConfirm('Leave camera preview?', 'Leave', true);
    if (ok) await handleRetake();
  }, [handleRetake, showConfirm]);

  const handleBgGallery = useCallback(() => {
    galleryInputRef.current?.click();
  }, []);

  const handlePhotoChange = useCallback((e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSubmitted(false);
    setSubmittedBannerVisible(false);
    activeToolRef.current = null;
    setActiveTool(null);
    clearReviewCanvas();
    camera.usePhotoFile(file);
  }, [camera, clearReviewCanvas]);

  const setHandlePos = useCallback((norm) => {
    const size = Math.round(6 + norm * (38 - 6));
    const trackY = 38 + (1 - norm) * (210 - 38);
    const handle = tmSizeHandleRef.current;
    if (!handle) return;
    handle.style.width = `${size}px`;
    handle.style.height = `${size}px`;
    handle.style.top = `${trackY - size / 2}px`;
    handle.style.left = `${(56 - size) / 2}px`;
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
    const next = Math.max(0, Math.min(1, norm));
    toolRadiusRef.current = Math.round(4 + next * (60 - 4));
    setHandlePos(next);
  }, [setHandlePos]);

  const normFromClientY = useCallback((clientY) => {
    const rect = tmLeftPanelRef.current?.getBoundingClientRect();
    if (!rect) return 0.5;
    return Math.max(0, Math.min(1, 1 - (clientY - rect.top - 38) / (210 - 38)));
  }, []);

  useEffect(() => {
    setHandlePos(0.5);
  }, [setHandlePos]);

  const syncCursor = useCallback(() => {}, []);

  const getMagicSelectionSourceCanvas = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const source = document.createElement('canvas');
    source.width = canvas.width;
    source.height = canvas.height;
    const sourceCtx = source.getContext('2d');
    if (camera.photoUrl) {
      try {
        const photo = await loadImage(camera.photoUrl);
        sourceCtx.drawImage(photo, 0, 0, source.width, source.height);
      } catch (err) {
        console.warn('[invitee] Magic selection photo source failed:', err);
      }
    }
    if (invite?.frameUrl) {
      try {
        const frame = await loadImage(invite.frameUrl);
        sourceCtx.drawImage(frame, 0, 0, source.width, source.height);
      } catch (err) {
        console.warn('[invitee] Magic selection frame source failed:', err);
      }
    }
    sourceCtx.drawImage(canvas, 0, 0);
    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = source.width;
    layerCanvas.height = source.height;
    await layerStack.renderFrameLayersToContext(layerCanvas.getContext('2d'), {
      width: source.width,
      height: source.height,
      preview: true,
    });
    sourceCtx.drawImage(layerCanvas, 0, 0);
    return source;
  }, [camera.photoUrl, canvasRef, invite?.frameUrl, layerStack]);

  const {
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
  } = useCanvasDrawing({
    canvasRef,
    ctxRef,
    selectionCanvasRef,
    activeToolRef,
    toolRadiusRef,
    eraserOpacityRef: { current: 1 },
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
    enabled: accepted,
    onCommitStroke: layerStack.addStrokeLayer,
    onCommitCanvasFill: layerStack.setCanvasFillFromCanvas,
    onInitialIntro: () => {
      mainUndoStackRef.current = [snapshot()];
    },
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.classList.toggle('no-tool', !['doodle', 'magicPen'].includes(activeTool));
  }, [activeTool]);

  const enterToolMode = useCallback((tool) => {
    activeToolRef.current = tool;
    setActiveTool(tool);
    if (tool === 'magicPen') {
      resetMagicSelection();
      magicPenModeRef.current = 'freehand';
      magicPenOpacityRef.current = 100;
      setMagicPenMode('freehand');
      setMagicPenOpacity(100);
    }
    const snap = snapshot();
    mainUndoStackRef.current.push(snap);
    mainRedoStackRef.current = [];
    sessionEntrySnapRef.current = snap;
    toolUndoStackRef.current = [snap];
    toolRedoStackRef.current = [];
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
  }, [
    expandLeftPanel,
    mainRedoStackRef,
    mainUndoStackRef,
    resetMagicSelection,
    sessionEntrySnapRef,
    snapshot,
    syncHistoryBtns,
    toolRedoStackRef,
    toolUndoStackRef,
  ]);

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
    canvasRef.current?.classList.add('no-tool');
  }, [
    mainRedoStackRef,
    mainUndoStackRef,
    resetInteractionState,
    sessionEntrySnapRef,
    setToolsCollapsed,
    snapshot,
    syncHistoryBtns,
    toolRedoStackRef,
    toolUndoStackRef,
    toolsCollapsedRef,
    toolsCollapseTimerRef,
  ]);

  const exitCurrentTool = useCallback((commit = true) => {
    if (activeToolRef.current === 'text') exitTextTool(commit);
    else if (activeToolRef.current) exitToolMode();
  }, [exitTextTool, exitToolMode]);

  const handleToolText = useCallback(() => {
    addRecentTool('text');
    if (activeToolRef.current === 'text') {
      exitTextTool(true);
      return;
    }
    const wasActive = !!activeToolRef.current;
    if (wasActive) exitCurrentTool(true);
    setTimeout(enterTextTool, wasActive ? 140 : 0);
  }, [addRecentTool, enterTextTool, exitCurrentTool, exitTextTool]);

  const handleToolStickers = useCallback(() => {
    addRecentTool('stickers');
    const wasActive = !!activeToolRef.current;
    exitCurrentTool(true);
    setTimeout(stickerSys.openPanel, wasActive ? 120 : 0);
  }, [addRecentTool, exitCurrentTool, stickerSys]);

  const handleToolDoodle = useCallback(() => {
    addRecentTool('doodle');
    if (activeToolRef.current === 'doodle') {
      exitToolMode();
      return;
    }
    const wasActive = !!activeToolRef.current;
    exitCurrentTool(true);
    setTimeout(() => enterToolMode('doodle'), wasActive ? 120 : 0);
  }, [addRecentTool, enterToolMode, exitCurrentTool, exitToolMode]);

  const handleToolMagicPen = useCallback(() => {
    addRecentTool('magicPen');
    if (activeToolRef.current === 'magicPen') {
      exitToolMode();
      return;
    }
    const wasActive = !!activeToolRef.current;
    exitCurrentTool(true);
    setTimeout(() => enterToolMode('magicPen'), wasActive ? 120 : 0);
  }, [addRecentTool, enterToolMode, exitCurrentTool, exitToolMode]);

  const handleDone = useCallback(() => {
    if (activeToolRef.current === 'text') exitTextTool(true);
    else exitToolMode();
  }, [exitTextTool, exitToolMode]);

  const handleSwatchClick = useCallback((color) => {
    doodleColorRef.current = color;
    setDoodleColor(color);
  }, []);

  const handleColorPickerChange = useCallback((event) => {
    const color = event.target.value;
    doodleColorRef.current = color;
    setDoodleColor(color);
  }, []);

  const handleDoodleModeClick = useCallback((mode) => {
    doodleModeRef.current = mode;
    setDoodleMode(mode);
  }, []);

  const handleDoodleOpacityInput = useCallback((event) => {
    const value = Number(event.target.value);
    doodleOpacityRef.current = value;
    setDoodleOpacity(value);
  }, []);

  const handlePenTypeClick = useCallback((type) => {
    penTypeRef.current = type;
    setPenType(type);
  }, []);

  const handleMagicPenModeClick = useCallback((mode) => {
    resetMagicSelection();
    magicPenModeRef.current = mode;
    setMagicPenMode(mode);
  }, [resetMagicSelection]);

  const handleMagicPenOpacityInput = useCallback((event) => {
    const value = Number(event.target.value);
    magicPenOpacityRef.current = value;
    setMagicPenOpacity(value);
    refreshMagicSelectionPreview();
  }, [refreshMagicSelectionPreview]);

  const handleMagicSelectApply = useCallback(() => {
    if (applyMagicSelection()) exitToolMode();
  }, [applyMagicSelection, exitToolMode]);

  const isMagicRefining = magicPenMode === 'magic' && magicSelectPhase === 'refine';

  const composePhotoBlob = useCallback(async () => {
    if (!camera.photoUrl || !invite?.frameUrl) throw new Error('Photo is not ready');
    const out = document.createElement('canvas');
    out.width = CANVAS_SIZE.width;
    out.height = CANVAS_SIZE.height;
    const ctx = out.getContext('2d');
    const photo = await loadImage(camera.photoUrl);
    const frame = await loadImage(invite.frameUrl);
    ctx.fillStyle = INVITEE_COMPOSITION_BG;
    ctx.fillRect(0, 0, out.width, out.height);
    // Apply the same pan/zoom the user set on the review screen so the saved
    // photo matches what they composed (works for both live captures and
    // gallery imports).
    const photoTransform = camera.cameraTransformRef?.current;
    if (photoTransform) {
      drawMediaCoverWithTransform(ctx, photo, out.width, out.height, photoTransform);
    } else {
      ctx.drawImage(photo, 0, 0, out.width, out.height);
    }
    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.width = out.width;
    overlayCanvas.height = out.height;
    const overlayCtx = overlayCanvas.getContext('2d');
    overlayCtx.drawImage(frame, 0, 0, out.width, out.height);
    if (canvasRef.current) overlayCtx.drawImage(canvasRef.current, 0, 0, out.width, out.height);
    await layerStack.renderFrameLayersToContext(overlayCtx, {
      width: out.width,
      height: out.height,
      preserveExisting: true,
    });
    ctx.drawImage(overlayCanvas, 0, 0, out.width, out.height);
    drawRetakeWatermark(ctx, out.width, out.height);
    return new Promise((resolve, reject) => {
      out.toBlob(blob => blob ? resolve(blob) : reject(new Error('Photo export failed')), 'image/jpeg', 0.92);
    });
  }, [camera.photoUrl, invite, layerStack]);

  const composeVideoBlob = useCallback(async () => {
    if (!camera.videoUrl || !invite?.frameUrl) throw new Error('Video is not ready');
    if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
      if (camera.videoBlobRef.current) return camera.videoBlobRef.current;
      throw new Error('Video export is not supported');
    }

    const video = document.createElement('video');
    video.src = camera.videoUrl;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error('Video load failed'));
    });

    const frame = await loadImage(invite.frameUrl);
    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.width = CANVAS_SIZE.width;
    overlayCanvas.height = CANVAS_SIZE.height;
    const overlayCtx = overlayCanvas.getContext('2d');
    overlayCtx.drawImage(frame, 0, 0, CANVAS_SIZE.width, CANVAS_SIZE.height);
    if (canvasRef.current) overlayCtx.drawImage(canvasRef.current, 0, 0, CANVAS_SIZE.width, CANVAS_SIZE.height);
    await layerStack.renderFrameLayersToContext(overlayCtx, {
      width: CANVAS_SIZE.width,
      height: CANVAS_SIZE.height,
      preserveExisting: true,
    });

    const out = document.createElement('canvas');
    out.width = CANVAS_SIZE.width;
    out.height = CANVAS_SIZE.height;
    const ctx = out.getContext('2d');
    const stream = out.captureStream(30);
    const mimeType = chooseRetakeVideoMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];

    return new Promise((resolve, reject) => {
      let rafId = null;
      let settled = false;
      const maxMs = Math.min(Math.max((video.duration || 10) * 1000 + 700, 1200), 11400);
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
        ctx.fillStyle = INVITEE_COMPOSITION_BG;
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(video, 0, 0, out.width, out.height);
        ctx.drawImage(overlayCanvas, 0, 0, out.width, out.height);
        drawRetakeWatermark(ctx, out.width, out.height);
        if (!video.ended && recorder.state === 'recording') rafId = requestAnimationFrame(draw);
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
        resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' }));
      };
      video.onended = () => {
        if (recorder.state === 'recording') recorder.stop();
      };

      recorder.start();
      video.currentTime = 0;
      video.play().then(draw).catch(err => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      });
    });
  }, [camera.videoBlobRef, camera.videoUrl, invite, layerStack]);

  const getSubmissionBlob = useCallback(async () => {
    if (camera.photoReview) return composePhotoBlob();
    if (camera.videoReview && camera.videoBlobRef.current) return composeVideoBlob();
    throw new Error('Retake is not ready');
  }, [camera.photoReview, camera.videoBlobRef, camera.videoReview, composePhotoBlob, composeVideoBlob]);

  const handleDownload = useCallback(async () => {
    try {
      const blob = await getSubmissionBlob();
      const ext = camera.videoReview ? 'webm' : 'jpg';
      downloadBlob(blob, `retake-${Date.now()}.${ext}`);
      showToast('Saved!');
    } catch (err) {
      console.warn('[invitee] Download failed:', err);
      showToast('Could not save Retake');
    }
  }, [camera.videoReview, getSubmissionBlob, showToast]);

  const handleSubmit = useCallback(async () => {
    if (!invite || submitting) return;
    const submitStartedAt = Date.now();
    setSubmitting(true);
    try {
      const blob = await getSubmissionBlob();
      const mode = camera.videoReview ? 'video' : 'photo';
      const ext = mode === 'video' ? 'webm' : 'jpg';
      const filename = `retake-${Date.now()}.${ext}`;
      const uploaded = await uploadRetakeMedia({
        inviteId: invite.id,
        mode,
        filename,
        blob,
      });
      await recordRetake({
        inviteId: invite.id,
        mediaUrl: uploaded.url,
        mediaType: blob.type,
        mode,
        frameName: invite.frameName,
        username: invite.username,
      });
      setSubmittedPreview({
        blob,
        filename,
        mode,
        url: URL.createObjectURL(blob),
      });
      activeToolRef.current = null;
      setActiveTool(null);
      setTmIn(false);
      setTmLeftIn(false);
      setTmBarMode(null);
      setToolsVisible(false);
      await waitForMinimumBusy(submitStartedAt);
      setSubmitted(true);
      setSubmittedBannerVisible(true);
    } catch (err) {
      console.warn('[invitee] Submit failed:', err);
      showToast(err?.message || 'Could not send Retake');
    } finally {
      setSubmitting(false);
    }
  }, [camera.videoReview, getSubmissionBlob, invite, showToast, submitting]);

  const handleSubmittedSave = useCallback(() => {
    if (!submittedPreview?.blob || !submittedPreview?.filename) {
      showToast('Retake is not ready');
      return;
    }
    downloadBlob(submittedPreview.blob, submittedPreview.filename);
    showToast('Saved!');
  }, [showToast, submittedPreview]);

  const handleSubmittedShare = useCallback(async (targetLabel = 'More') => {
    const file = createSubmittedRetakeFile(submittedPreview);
    if (!file) {
      showToast('Retake is not ready');
      return;
    }

    // Include the original invite URL so friends can use the same frame template
    // (viral loop). If for some reason the invite has no id, fall back to the
    // current page URL which already points to the invite.
    const templateUrl = invite?.id ? buildInviteUrl(invite.id) : window.location.href;
    const ownerLabel = invite?.username && invite.username !== 'yunchai'
      ? `${invite.username}'s`
      : 'this';
    // Put the URL ONLY in the `url` field. iOS / Android share sheets append
    // the URL to the message automatically; including it in `text` too causes
    // the link to appear twice in iMessage, WhatsApp, etc.
    const sharePayload = {
      title: 'My Retake',
      text: `My Retake on ${ownerLabel} frame — try the same one`,
      url: templateUrl,
    };

    if (navigator.share) {
      try {
        if (navigator.canShare && !navigator.canShare({ files: [file] })) {
          downloadBlob(submittedPreview.blob, submittedPreview.filename);
          showToast('Saved!');
          return;
        }
        await navigator.share({ ...sharePayload, files: [file] });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
        console.warn(`[invitee] ${targetLabel} share failed:`, err);
      }
    }

    downloadBlob(submittedPreview.blob, submittedPreview.filename);
    showToast('Saved!');
  }, [invite?.username, showToast, submittedPreview]);

  const showReviewChrome = camera.review && !camera.captureBusy && !submittedBannerVisible;

  if (!accepted) {
    return (
      <main className="invitee-screen invitee-screen--entry" data-flow-state={flowState}>
        <InviteAcceptCard
          invite={invite}
          loading={loading}
          error={error}
          onAccept={acceptInvite}
        />
        <Toast className="s6-toast" visible={toastVisible}>{toastMsg}</Toast>
      </main>
    );
  }

  return (
    <main className="invitee-screen" data-flow-state={flowState}>
      <FrameCanvas
        canvasRef={canvasRef}
        selectionCanvasRef={selectionCanvasRef}
        frameElRef={frameElRef}
        showCheckerBg={false}
        frameScrimVisible
      >
        <RetakeCameraStage
          mode={camera.mode}
          recording={camera.recording}
          videoRef={camera.videoRef}
          cameraStyle={camera.cameraStyle}
          cameraReady={camera.cameraReady}
          cameraIssue={camera.cameraIssue}
          photoUrl={camera.photoUrl}
          videoUrl={camera.videoUrl}
          onPointerDown={camera.handlePreviewPointerDown}
          onPointerMove={camera.handlePreviewPointerMove}
          onPointerUp={camera.handlePreviewPointerUp}
          onPointerCancel={camera.handlePreviewPointerCancel}
        />
        {invite?.frameUrl && (
          <img className="invitee-frame-overlay" src={invite.frameUrl} alt="" draggable="false" />
        )}
        {camera.live && (
          <GlassIconButton
            className={`invitee-capture-button${camera.recording ? ' is-recording' : ''}`}
            label="Tap for photo. Hold for video."
            style={{ '--recording-progress': 1 - camera.recordingProgress }}
            onPointerDown={camera.handlePointerDown}
            onPointerMove={camera.handlePointerMove}
            onPointerUp={camera.handlePointerUp}
            onPointerCancel={camera.handlePointerCancel}
          >
            <svg className="invitee-capture-progress" viewBox="0 0 78 78" aria-hidden="true">
              <circle className="invitee-capture-progress-stroke" cx="39" cy="39" r="32" />
            </svg>
            <span className="invitee-capture-inner" aria-hidden="true" />
          </GlassIconButton>
        )}
        {camera.live && !camera.captureBusy && (
          <GlassIconButton
            className="invitee-flip-button"
            icon="flipCamera"
            label="Flip camera"
            onClick={camera.flipCamera}
          />
        )}
      </FrameCanvas>

      <RetakeCountdownOverlay value={camera.countdownValue} />
      {camera.live && (
        <RetakeScreenFlash
          visible={camera.screenFlashActive || (camera.recording && camera.usesScreenFlash)}
          recording={camera.recording && camera.usesScreenFlash}
        />
      )}

      <RetakeZoomControl
        className="invitee-camera-zoom-control"
        visible={camera.live && !camera.captureBusy}
        zoomOptions={camera.zoomOptions}
        zoomMode={camera.zoomMode}
        onZoom={camera.setZoom}
      />

      <CameraGestureToast
        className="invitee-camera-gesture-toast"
        visible={camera.live && gestureHintVisible && !camera.captureBusy}
      />

      {camera.live && !camera.captureBusy && (
        <>
          <ExitButton
            visible
            out={false}
            label="Back to invite"
            onClick={confirmBackToInvite}
          />

          <BottomBar
            visible
            out={false}
            onGalleryClick={handleBgGallery}
            showProceed={false}
          />
        </>
      )}

      {showReviewChrome && (
        <>
          <ExitButton
            visible
            out={exitBtnOut}
            label="Retake photo or video"
            onClick={confirmRetake}
          />

          <UndoRedoCluster
            visible
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
            orderedToolIds={reviewToolIds}
            onToolText={handleToolText}
            onToolStickers={handleToolStickers}
            onToolDoodle={handleToolDoodle}
            onToolMagicPen={handleToolMagicPen}
            onToolDownload={handleDownload}
            onToggle={handleToggleTools}
            onInteraction={handleToolbarInteraction}
            onToolMouseEnter={handleToolMouseEnter}
            onToolMouseLeave={handleToolMouseLeave}
          />
        </>
      )}

      {showReviewChrome && (
        <RetakeCameraBottomBar
          visible
          out={bottomBarOut}
          className="retake-camera-bottom-bar--split-actions invitee-s3-bottom-bar"
          glassControls
          hideTitle
          review={false}
          title={invite?.frameName || 'Retake'}
          titleLabel="Invite frame name"
          leftLabel="Retake photo or video"
          onLeft={handleRetake}
          onTitle={() => {}}
          showSecondary={false}
          primaryIcon={null}
          primaryAvatar={{
            src: invite?.avatarUrl || invite?.inviterAvatarUrl,
            showPlaceholder: true,
            text: getAvatarText(invite?.username) || '?',
          }}
          primaryText="Send"
          primaryBusy={submitting}
          primaryLabel={
            submitting
              ? `Sending Retake to ${invite?.username || 'inviter'}`
              : `Send Retake to ${invite?.username || 'inviter'}`
          }
          onPrimary={handleSubmit}
        />
      )}

      {submittedBannerVisible && (
        <SubmittedRetakeBanner
          preview={submittedPreview}
          username={invite?.username}
          onClose={handleDismissSubmittedBanner}
          onStartOwnFrame={handleStartOwnFrame}
          onRetake={handleRetake}
          onSave={handleSubmittedSave}
          onShare={handleSubmittedShare}
        />
      )}

      <DrawingToolOverlays
        tmLeftPanelRef={tmLeftPanelRef}
        tmSizeHandleRef={tmSizeHandleRef}
        tmIn={tmIn}
        tmLeftIn={tmLeftIn}
        tmPenBarIn={tmBarMode === 'doodle'}
        tmMagicPenBarIn={tmBarMode === 'magicPen'}
        doodleColor={doodleColor}
        doodleMode={doodleMode}
        doodleOpacity={doodleOpacity}
        penType={penType}
        magicPenMode={magicPenMode}
        magicPenOpacity={magicPenOpacity}
        magicSelectPhase={magicSelectPhase}
        magicSelectConfirmDisabled={magicSelectConfirmDisabled}
        magicSelectDetecting={magicSelectDetecting}
        magicSelectRefMode={magicSelectRefMode}
        tmUndoBtnDisabled={isMagicRefining ? magicUndoDisabled : tmUndoBtnDisabled}
        tmRedoBtnDisabled={isMagicRefining ? magicRedoDisabled : tmRedoBtnDisabled}
        onDone={handleDone}
        onUndo={isMagicRefining ? undoMagicSelection : toolUndo}
        onRedo={isMagicRefining ? redoMagicSelection : toolRedo}
        onSwatchClick={handleSwatchClick}
        onDoodleModeClick={handleDoodleModeClick}
        onColorPickerChange={handleColorPickerChange}
        onDoodleOpacityInput={handleDoodleOpacityInput}
        onPenTypeClick={handlePenTypeClick}
        onMagicPenModeClick={handleMagicPenModeClick}
        onMagicPenOpacityInput={handleMagicPenOpacityInput}
        onMagicSelectBack={() => handleMagicPenModeClick('freehand')}
        onMagicSelectConfirm={confirmMagicSelection}
        onMagicSelectRefMode={setMagicSelectionRefMode}
        onMagicSelectApply={handleMagicSelectApply}
      />

      <TextToolOverlay
        active={textToolActive}
        textPreviewRef={textPreviewRef}
        txtFont={txtFont}
        setTxtFont={setTxtFont}
        txtColor={txtColor}
        setTxtColor={setTxtColor}
        txtSize={txtSize}
        setTxtSize={setTxtSize}
        txtWrapWidth={txtWrapWidth}
        setTxtWrapWidth={setTxtWrapWidth}
        txtOpacity={txtOpacity}
        setTxtOpacity={setTxtOpacity}
        txtAlign={txtAlign}
        setTxtAlign={setTxtAlign}
        onConfirm={() => exitTextTool(true)}
      />

      <StickerPanel sys={stickerSys} />

      <div
        className={`scrim${scrimVisible ? ' visible' : ''}`}
        id="scrim"
        onClick={stickerSys.closePanel}
      />

      <Toast className="s6-toast" visible={toastVisible}>{toastMsg}</Toast>
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
      <PhotoInputs
        galleryInputRef={galleryInputRef}
        cameraInputRef={cameraInputRef}
        onPhotoChange={handlePhotoChange}
      />
    </main>
  );
}
