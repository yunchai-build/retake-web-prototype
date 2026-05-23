import React, { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react';
import '../../styles/inviter.css';
import SolidIconButton from '../../components/ui/SolidIconButton';
import GlassIconButton from '../../components/ui/GlassIconButton.jsx';
import { useToast } from '../editor/hooks/useToast';
import { useStickerSystem } from '../editor/hooks/useStickerSystem';
import { useCanvasDrawing } from '../editor/hooks/useCanvasDrawing';
import { useConfirmDialog } from '../editor/hooks/useConfirmDialog';
import { filterOrderedToolIds, RETAKE_REVIEW_TOOL_IDS, useToolbarState } from '../editor/hooks/useToolbarState';
import { useHistory } from '../editor/hooks/useHistory';
import { useTextTool } from '../editor/hooks/useTextTool';
import useInviterLayerStack from '../editor/hooks/useInviterLayerStack.js';
import useMediaTransform from '../editor/hooks/useMediaTransform';
import { useEditName } from './hooks/useEditName';
import useStep3Camera from './hooks/useStep3Camera.js';
import { createInvite, uploadFrame } from '../../lib/api.js';
import StickerPanel from '../editor/components/StickerPanel';
import TextToolOverlay from '../editor/components/TextToolOverlay';
import DrawingToolOverlays from '../editor/components/DrawingToolOverlays';
import ConfirmDialog from '../editor/components/ConfirmDialog';
import FrameCanvas from '../editor/components/FrameCanvas';
import ExitButton from '../editor/components/ExitButton';
import UndoRedoCluster from '../editor/components/UndoRedoCluster';
import Toast from '../../components/ui/Toast';
import VerticalToolbar from './components/VerticalToolbar';
import BottomBar from './components/BottomBar';
import RetakeCameraBottomBar from '../editor/components/RetakeCameraBottomBar.jsx';
import CameraGestureToast from '../editor/components/CameraGestureToast.jsx';
import { RetakeCountdownOverlay, RetakeRecordingStroke, RetakeScreenFlash } from '../editor/components/RetakeCameraOverlays.jsx';
import RetakeCameraStage from '../editor/components/RetakeCameraStage.jsx';
import RetakeReviewToolbar from '../editor/components/RetakeReviewToolbar.jsx';
import RetakeZoomControl from '../editor/components/RetakeZoomControl.jsx';
import PhotoInputs from './components/PhotoInputs';
import EditNamePopup from './components/EditNamePopup';
import IntroCard from './components/IntroCard';
import { INVITER_FLOW_STATES } from './state.js';
import { buildInviteUrl } from '../../lib/routes.js';
import {
  drawContainedImageWithBackground,
  drawMediaCoverWithTransform,
  getAverageImageColor,
  loadImage,
} from '../editor/utils/canvas.js';

const delay = (ms) => new Promise(r => setTimeout(r, ms));

const STEP3_MODE = {
  LIVE: 'live',
  PHOTO: 'photo',
  VIDEO: 'video',
};

const SAVED_FRAMES_KEY = 'retake.savedFrames.v1';
const STEP3_MAX_RECORD_MS = 10000;
const STEP3_DOUBLE_TAP_MS = 260;
const STEP3_GESTURE_HINT_MS = 2600;
const STEP3_TIMER_STEPS = [0, 3, 10];
const STEP3_MIN_SOFTWARE_SCALE = 0.05;
const STEP3_MAX_SOFTWARE_SCALE = 4;
const STEP3_FLASH_WARMUP_MS = 120;
const STEP3_FLASH_FADE_MS = 240;
const STEP3_VIDEO_TYPES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
];
const STEP3_DEFAULT_CAPABILITIES = {
  torch: false,
  zoom: false,
  zoomMin: 1,
  zoomMax: 1,
};

function loadSavedFrames() {
  try {
    const raw = window.localStorage?.getItem(SAVED_FRAMES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// iOS Safari caps localStorage at ~5 MB per origin. Saved frames carry a full
// data URL (1–2 MB each), so the quota is gone in a handful of saves. Try to
// persist; on QuotaExceededError, drop the oldest frames and retry. If we
// still can't fit, silently skip — the frames stay in the in-memory React
// state for the current session.
function isQuotaError(err) {
  if (!err) return false;
  return err.name === 'QuotaExceededError'
    || err.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || err.code === 22
    || err.code === 1014;
}

function persistSavedFrames(frames) {
  if (!window.localStorage) return;
  let attempt = Array.isArray(frames) ? frames.slice() : [];
  for (let i = 0; i < 5; i += 1) {
    try {
      window.localStorage.setItem(SAVED_FRAMES_KEY, JSON.stringify(attempt));
      return;
    } catch (err) {
      if (!isQuotaError(err) || attempt.length <= 1) {
        if (isQuotaError(err)) {
          console.warn('[inviter] localStorage quota exceeded; skipping savedFrames persistence.');
          try { window.localStorage.removeItem(SAVED_FRAMES_KEY); } catch { /* ignore */ }
        }
        return;
      }
      // Drop the oldest entry and retry. The most recent saved frames are the
      // ones the user is most likely to want back.
      attempt = attempt.slice(1);
    }
  }
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

function getStep3CameraConstraints(facingMode) {
  return [
    {
      video: {
        facingMode: { ideal: facingMode },
        resizeMode: { ideal: 'none' },
      },
      audio: false,
    },
    {
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        resizeMode: { ideal: 'none' },
      },
      audio: false,
    },
    {
      video: {
        facingMode: { ideal: facingMode },
      },
      audio: false,
    },
    {
      video: true,
      audio: false,
    },
  ];
}

function getStep3TrackCapabilities(track) {
  const capabilities = track?.getCapabilities?.() || {};
  const zoom = capabilities.zoom;
  const zoomMin = Number.isFinite(zoom?.min) ? zoom.min : 1;
  const zoomMax = Number.isFinite(zoom?.max) ? zoom.max : zoomMin;

  return {
    torch: Boolean(capabilities.torch),
    zoom: Boolean(zoom && zoomMax >= zoomMin),
    zoomMin,
    zoomMax,
  };
}

function clampStep3Zoom(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundStep3Zoom(value) {
  return Math.round(value * 100) / 100;
}

function logStep3CameraSettings(track, video) {
  if (!import.meta.env.DEV) return;
  console.info('[step3] Camera settings', {
    track: track?.getSettings?.() || null,
    video: {
      width: video?.videoWidth || 0,
      height: video?.videoHeight || 0,
    },
  });
}

function shouldRetryStep3Camera(err) {
  return ![
    'NotAllowedError',
    'PermissionDeniedError',
    'SecurityError',
    'NotReadableError',
    'TrackStartError',
  ].includes(err?.name);
}

async function requestStep3CameraStream(facingMode) {
  let lastError;
  const constraintsList = getStep3CameraConstraints(facingMode);

  for (const constraints of constraintsList) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
      console.warn('[step3] Camera attempt failed:', err?.name, err?.message, constraints);
      if (!shouldRetryStep3Camera(err)) break;
    }
  }

  throw lastError || new Error('Camera request failed');
}

function formatStep3CameraError(err) {
  if (!err?.name) return '';
  return ` (${err.name})`;
}

function getStep3CameraIssue(err) {
  const hasCameraApi = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  if (!hasCameraApi && typeof window !== 'undefined' && !window.isSecureContext) {
    return {
      fallback: 'Open with HTTPS to use camera',
      toast: 'Camera needs HTTPS on mobile Safari',
    };
  }
  if (!hasCameraApi) {
    return {
      fallback: 'Camera unavailable in this browser',
      toast: 'Camera unavailable in this browser',
    };
  }

  const detail = formatStep3CameraError(err);
  switch (err?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return {
        fallback: `Camera permission blocked${detail}`,
        toast: `Allow camera access${detail}`,
      };
    case 'SecurityError':
      return {
        fallback: `Camera blocked by browser security${detail}`,
        toast: `Camera blocked${detail}`,
      };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return {
        fallback: `No camera found${detail}`,
        toast: `No camera found${detail}`,
      };
    case 'NotReadableError':
    case 'TrackStartError':
      return {
        fallback: `Camera is already in use${detail}`,
        toast: `Camera is already in use${detail}`,
      };
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return {
        fallback: `Camera settings unsupported${detail}`,
        toast: `Camera settings unsupported${detail}`,
      };
    default:
      return {
        fallback: `Camera unavailable${detail}`,
        toast: `Camera unavailable${detail}`,
      };
  }
}

function waitForVideoMetadata(video) {
  if (!video || video.readyState >= 1) return Promise.resolve();

  return new Promise((resolve) => {
    let timeoutId;
    const done = () => {
      clearTimeout(timeoutId);
      video.removeEventListener('loadedmetadata', done);
      resolve();
    };
    timeoutId = setTimeout(done, 1200);
    video.addEventListener('loadedmetadata', done, { once: true });
  });
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
  const s2GalleryCanvasRef = useRef(null);
  const ctxRef = useRef(null);
  const selectionCanvasRef = useRef(null);
  const frameElRef = useRef(null);

  // ── Tool state refs ──
  const activeToolRef = useRef(null);
  const toolRadiusRef = useRef(32);
  const eraserOpacityRef = useRef(1.0);
  const magicPenModeRef = useRef('freehand');
  const magicPenOpacityRef = useRef(100);
  const doodleColorRef = useRef('#FFFFFF');
  const doodleOpacityRef = useRef(100);
  const doodleModeRef = useRef('draw');
  const penTypeRef = useRef('pen');

  // ── Timer / element refs ──
  const lpCollapseTimerRef = useRef(null);
  const toolsHideTimerRef = useRef(null);
  const brushCursorRef = useRef(null);
  const brushCursorSvgRef = useRef(null);
  const brushCursorCircleRef = useRef(null);
  const tmSizeHandleRef = useRef(null);
  const tmLeftPanelRef = useRef(null);
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  // Separate file input for the step3 LIVE preview: lets the user drop in a
  // gallery photo *instead of* the live camera feed, without re-entering the
  // step2 (frame editing) flow. The S2 galleryInput is bound to placePhotoFile
  // which would jump back to editing — that's not what we want here.
  const step3GalleryInputRef = useRef(null);
  const introPhotoFlowRef = useRef(false);
  // step3 camera refs (videoRef, streamRef, flashTimerRef, hardwareZoomRef)
  // are now owned by useStep3Camera — accessed via step3Camera.* below.
  const step3RecorderRef = useRef(null);
  const step3RecordChunksRef = useRef([]);
  const step3RecordCanvasRef = useRef(null);
  const step3RecordRafRef = useRef(null);
  const step3RecordStopTimerRef = useRef(null);
  const step3RecordStartedAtRef = useRef(0);
  const step3LongPressTimerRef = useRef(null);
  const step3TapCaptureTimerRef = useRef(null);
  const step3GestureHintTimerRef = useRef(null);
  const step3LastTapAtRef = useRef(0);
  const step3CountdownTimersRef = useRef([]);
  const step3CountdownModeRef = useRef(null);
  const step3PointerIdRef = useRef(null);
  const step3PointerDownRef = useRef(false);
  const step3PointerMovedRef = useRef(false);
  const s2GalleryImageRef = useRef(null);
  const s2GalleryBackgroundRef = useRef('#F7F5F2');
  const s2GalleryGestureActiveRef = useRef(false);
  const s2GalleryGestureMovedRef = useRef(false);
  const step3RecordingRef = useRef(false);
  const step3RecordingStartingRef = useRef(false);
  const step3PendingStopRef = useRef(false);
  const step3VideoBlobRef = useRef(null);
  const step3VideoObjectUrlRef = useRef(null);

  // ── UI visibility state ──
  const [activeTool, setActiveTool] = useState(null);
  const [doodleColor, setDoodleColor] = useState('#FFFFFF');
  const [doodleOpacity, setDoodleOpacity] = useState(100);
  const [doodleMode, setDoodleMode] = useState('draw');
  const [magicPenMode, setMagicPenMode] = useState('freehand');
  const [magicPenOpacity, setMagicPenOpacity] = useState(100);
  const [penType, setPenType] = useState('pen');
  const [frameName, setFrameName] = useState('my frame');
  const [editorVisible, setEditorVisible] = useState(false);
  const [introCardVisible, setIntroCardVisible] = useState(true);
  const [scrimVisible, setScrimVisible] = useState(true);
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
  const [tmBarMode, setTmBarMode] = useState(null); // 'doodle' | 'magicPen' | null
  const [tmLeftIn, setTmLeftIn] = useState(false);
  // step3 camera state (cameraReady, cameraIssue, facingMode, flashEnabled,
  // screenFlashActive, cameraCapabilities, zoomMode) lives in useStep3Camera
  // — access via step3Camera.* below.
  const [step3Mode, setStep3Mode] = useState(null);
  const [step3PhotoUrl, setStep3PhotoUrl] = useState('');
  const [step3VideoUrl, setStep3VideoUrl] = useState('');
  const [step3Recording, setStep3Recording] = useState(false);
  const [step3RecordingProgress, setStep3RecordingProgress] = useState(1);
  const [step3GestureHintVisible, setStep3GestureHintVisible] = useState(false);
  const [step3TimerSeconds, setStep3TimerSeconds] = useState(0);
  const [step3CountdownValue, setStep3CountdownValue] = useState(null);
  const [editNameSaveLabel, setEditNameSaveLabel] = useState('Save');
  const [s2GalleryAdjustable, setS2GalleryAdjustable] = useState(false);
  const [savedFrames, setSavedFrames] = useState(() => loadSavedFrames());
  const [savedFramesVisible, setSavedFramesVisible] = useState(false);
  const [savedFrameTitleEditing, setSavedFrameTitleEditing] = useState(false);
  const [savedFrameSavedTitle, setSavedFrameSavedTitle] = useState(null);
  const pendingShareAfterNameRef = useRef(false);
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
  const s2GalleryTransform = useMediaTransform();
  // Defined before useStep3Camera since the hook closes over it for photo
  // capture composition.
  const getCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    return {
      width: canvas?.width || 414,
      height: canvas?.height || 736,
    };
  }, []);

  // Note: initialMirror seeds from 'environment' since useStep3Camera owns
  // facingMode internally now. The hook flips the mirror via setMirror() when
  // the user toggles to front camera.
  const step3CameraTransform = useMediaTransform({
    initialMirror: false,
    minScale: STEP3_MIN_SOFTWARE_SCALE,
    maxScale: STEP3_MAX_SOFTWARE_SCALE,
    maxOffsetX: Infinity,
    maxOffsetY: Infinity,
  });

  // Camera lifecycle for step3 (preview/capture screen). Owns the stream,
  // capabilities, zoom/flash/facing state, and the screen-flash timing.
  // Recording, countdown, pointer gestures, and blob composition stay below
  // because they cross concerns with the frame editor.
  const step3Camera = useStep3Camera({
    cameraTransform: step3CameraTransform,
    getCanvasSize,
    showToast,
    defaultCapabilities: STEP3_DEFAULT_CAPABILITIES,
    flashWarmupMs: STEP3_FLASH_WARMUP_MS,
    flashFadeMs: STEP3_FLASH_FADE_MS,
    zoomPresets: [0.5, 1, 2],
    clampZoom: clampStep3Zoom,
    roundZoom: roundStep3Zoom,
    getCameraIssue: getStep3CameraIssue,
    requestCameraStream: requestStep3CameraStream,
    getTrackCapabilities: getStep3TrackCapabilities,
    logCameraSettings: logStep3CameraSettings,
    waitForVideoMetadata,
    delay,
  });
  const drawS2GalleryBase = useCallback((targetCtx) => {
    const image = s2GalleryImageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas || !targetCtx) return false;
    drawContainedImageWithBackground(targetCtx, image, canvas.width, canvas.height, {
      backgroundColor: s2GalleryBackgroundRef.current,
      fit: 'portrait-height',
      transform: s2GalleryTransform.transformRef.current,
      // Allow zoom-out below "fill canvas height" — empty area is painted with
      // the photo's average color (Instagram polaroid style).
      allowZoomOut: true,
    });
    return true;
  }, [s2GalleryTransform.transformRef]);
  const layerStack = useInviterLayerStack({
    frameElRef,
    canvasRef,
    drawGalleryBase: drawS2GalleryBase,
  });
  const createInviterSnapshot = useCallback(() => ({
    canvas: (() => {
      try { return canvasRef.current?.toDataURL() || null; } catch { return null; }
    })(),
    layers: layerStack.createSnapshot(),
    gallery: {
      image: s2GalleryImageRef.current,
      background: s2GalleryBackgroundRef.current,
      adjustable: s2GalleryAdjustable,
      transform: { ...s2GalleryTransform.transformRef.current },
    },
  }), [layerStack, s2GalleryAdjustable, s2GalleryTransform.transformRef]);
  const restoreInviterSnapshot = useCallback((snap) => new Promise(resolve => {
    if (!snap) { resolve(); return; }
    const restoreCanvas = () => {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return Promise.resolve();
      if (!snap.canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return Promise.resolve();
      }
      return new Promise(res => {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          res();
        };
        img.onerror = () => res();
        img.src = snap.canvas;
      });
    };

    restoreCanvas().then(() => {
      layerStack.restoreSnapshot(snap.layers);
      s2GalleryImageRef.current = snap.gallery?.image || null;
      s2GalleryBackgroundRef.current = snap.gallery?.background || '#F7F5F2';
      setS2GalleryAdjustable(!!snap.gallery?.adjustable);
      if (snap.gallery?.transform) s2GalleryTransform.setTransform(snap.gallery.transform);
      const galleryCanvas = s2GalleryCanvasRef.current;
      const galleryCtx = galleryCanvas?.getContext('2d');
      if (galleryCanvas && galleryCtx) {
        galleryCtx.clearRect(0, 0, galleryCanvas.width, galleryCanvas.height);
        drawS2GalleryBase(galleryCtx);
      }
      resolve();
    });
  }), [drawS2GalleryBase, layerStack, s2GalleryTransform]);
  const stickerSys = useStickerSystem({
    ctxRef,
    setScrimVisible,
    showToast,
    onItemDragStart: handleStickerItemDragStart,
    onItemDragEnd: handleStickerItemDragEnd,
    overlayParentRef: frameElRef,
    onItemPlaced: layerStack.registerItemLayer,
    onItemTouched: layerStack.touchLayer,
    onItemRemoved: layerStack.removeLayer,
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
  } = useHistory({
    canvasRef,
    ctxRef,
    activeToolRef,
    showToast,
    createSnapshot: createInviterSnapshot,
    restoreSnapshot: restoreInviterSnapshot,
  });

  const {
    toolsCollapsed, setToolsCollapsed,
    toolsCollapsedRef, toolsCollapseTimerRef,
    labelsExpanded,
    orderedToolIds, addRecentTool,
    handleToggleTools, handleToolbarInteraction, handleToolMouseEnter, handleToolMouseLeave,
  } = useToolbarState();
  const step2ToolIds = orderedToolIds;
  const step3ToolIds = useMemo(
    () => filterOrderedToolIds(orderedToolIds, RETAKE_REVIEW_TOOL_IDS),
    [orderedToolIds]
  );
  // The rest of InviterPage references step3* directly. Rather than rewrite
  // hundreds of call sites in one PR, alias the hook's API back onto the old
  // identifiers. The hook still owns lifecycle/state — these are just
  // forwarders. Future PRs can collapse the aliases by inlining `step3Camera.*`.
  const step3VideoRef = step3Camera.videoRef;
  const step3StreamRef = step3Camera.streamRef;
  const step3FlashTimerRef = step3Camera.flashTimerRef;
  const step3HardwareZoomRef = step3Camera.hardwareZoomRef;
  const step3CameraReady = step3Camera.cameraReady;
  const step3CameraIssue = step3Camera.cameraIssue;
  const step3FacingMode = step3Camera.facingMode;
  const step3FlashEnabled = step3Camera.flashEnabled;
  const step3ScreenFlashActive = step3Camera.screenFlashActive;
  const step3CameraCapabilities = step3Camera.cameraCapabilities;
  const step3ZoomMode = step3Camera.zoomMode;
  const step3ZoomOptions = step3Camera.zoomOptions;
  const step3UsesHardwareTorch = step3Camera.usesHardwareTorch;
  const step3UsesScreenFlash = step3Camera.usesScreenFlash;
  const setStep3FacingMode = step3Camera.setFacingMode;
  const setStep3FlashEnabled = step3Camera.setFlashEnabled;
  const setStep3ScreenFlashActive = step3Camera.setScreenFlashActive;
  const setStep3CameraCapabilities = step3Camera.setCameraCapabilities;
  const setStep3ZoomMode = step3Camera.setZoomMode;
  const setStep3CameraIssue = step3Camera.setCameraIssue;
  const setStep3CameraReady = step3Camera.setCameraReady;
  const startStep3Camera = step3Camera.startCamera;
  const stopStep3Camera = step3Camera.stopCamera;
  const applyStep3HardwareZoom = step3Camera.applyHardwareZoom;
  const resetStep3CameraTransform = step3Camera.resetCameraTransform;
  const handleStep3FlipCamera = step3Camera.flipCamera;
  const warmStep3ScreenFlash = step3Camera.warmScreenFlash;
  const releaseStep3ScreenFlash = step3Camera.releaseScreenFlash;
  const captureStep3CameraPhoto = step3Camera.capturePhoto;
  const handleStep3FlashToggle = step3Camera.toggleFlash;
  const handleStep3Zoom = step3Camera.applyHardwareZoom;

  const {
    editNameVisible,
    editNameInputValue, setEditNameInputValue,
    editUsernameInputValue, setEditUsernameInputValue,
    usernameRef,
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
    if (activeToolRef.current === 'doodle' && doodleModeRef.current === 'draw') {
      const baseAlpha = doodleColorRef.current === '#FFFFFF' ? 0.27 : 0.33;
      const alpha = Math.round(baseAlpha * (doodleOpacityRef.current / 100) * 255)
        .toString(16)
        .padStart(2, '0')
        .toUpperCase();
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

  const getMagicSelectionSourceCanvas = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const source = document.createElement('canvas');
    source.width = canvas.width;
    source.height = canvas.height;
    const sourceCtx = source.getContext('2d');
    await layerStack.renderFrameLayersToContext(sourceCtx, {
      width: canvas.width,
      height: canvas.height,
      preview: true,
    });
    sourceCtx.drawImage(canvas, 0, 0);
    return source;
  }, [canvasRef, layerStack]);

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
    onCommitStroke: layerStack.addStrokeLayer,
    onCommitCanvasFill: layerStack.setCanvasFillFromCanvas,
    onInitialIntro: () => {
      mainUndoStackRef.current = [snapshot()];
    },
  });

  // ── Configure left panel per tool ──
  const configureLeftPanel = useCallback((tool) => {
    if (tool === 'magicPen') {
      eraserOpacityRef.current = 1;
      magicPenModeRef.current = 'freehand';
      magicPenOpacityRef.current = 100;
      setMagicPenMode('freehand');
      setMagicPenOpacity(100);
      toolRadiusRef.current = Math.round(4 + 0.5 * (60 - 4));
      setHandlePos(0.5);
      if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair';
    } else {
      toolRadiusRef.current = Math.round(4 + 0.5 * (60 - 4));
      setHandlePos(0.5);
    }
    syncCursor();
  }, [setHandlePos, syncCursor]);

  const renderS2GalleryBase = useCallback((targetCtx) => {
    return drawS2GalleryBase(targetCtx);
  }, [drawS2GalleryBase]);

  const renderS2GalleryPlacement = useCallback(() => {
    const galleryCanvas = s2GalleryCanvasRef.current;
    const galleryCtx = galleryCanvas?.getContext('2d');
    if (!galleryCanvas || !galleryCtx) return;
    renderS2GalleryBase(galleryCtx);
  }, [renderS2GalleryBase]);

  const renderStep3ArtworkPlacement = useCallback(async () => {
    const galleryCanvas = s2GalleryCanvasRef.current;
    const galleryCtx = galleryCanvas?.getContext('2d');
    if (!galleryCanvas || !galleryCtx) return;
    const { width, height } = getCanvasSize();
    await layerStack.renderFrameLayersToContext(galleryCtx, {
      width,
      height,
    });
  }, [getCanvasSize, layerStack]);

  const syncS2GalleryPlacementHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !s2GalleryImageRef.current) return;
    mainUndoStackRef.current = [snapshot()];
    mainRedoStackRef.current = [];
    syncHistoryBtns();
  }, [canvasRef, mainRedoStackRef, mainUndoStackRef, snapshot, syncHistoryBtns]);

  const finalizeS2GalleryPlacement = useCallback(() => {
    if (!s2GalleryAdjustable) return;
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx || !s2GalleryImageRef.current) return;

    const composite = document.createElement('canvas');
    composite.width = canvas.width;
    composite.height = canvas.height;
    const compositeCtx = composite.getContext('2d');
    renderS2GalleryBase(compositeCtx);
    compositeCtx.drawImage(canvas, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(composite, 0, 0);

    const galleryCanvas = s2GalleryCanvasRef.current;
    const galleryCtx = galleryCanvas?.getContext('2d');
    galleryCtx?.clearRect(0, 0, galleryCanvas.width, galleryCanvas.height);
    syncS2GalleryPlacementHistory();
    s2GalleryImageRef.current = null;
    s2GalleryGestureActiveRef.current = false;
    s2GalleryGestureMovedRef.current = false;
    setS2GalleryAdjustable(false);
  }, [canvasRef, ctxRef, renderS2GalleryBase, s2GalleryAdjustable, syncS2GalleryPlacementHistory]);

  // ── Tool mode enter/exit ──
  const enterToolMode = useCallback(async (tool) => {
    if (s2GalleryTransform.getActivePointerCount() > 0) s2GalleryTransform.cancel();

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
  }, [snapshot, s2GalleryTransform, configureLeftPanel, syncHistoryBtns, expandLeftPanel, syncCursor,
      mainUndoStackRef, mainRedoStackRef, sessionEntrySnapRef, toolUndoStackRef, toolRedoStackRef, stickerSys]);

  const exitToolMode = useCallback(() => {
    const didChange = toolUndoStackRef.current.length > 1;
    if (!didChange && mainUndoStackRef.current.length > 0) {
      mainUndoStackRef.current.pop();
    } else if (didChange) {
      if (s2GalleryAdjustable) {
        renderS2GalleryPlacement();
      }
      if (step3Mode) {
        renderStep3ArtworkPlacement();
      }
      mainUndoStackRef.current.push(snapshot());
      mainRedoStackRef.current = [];
    }
    toolUndoStackRef.current = [];
    toolRedoStackRef.current = [];
    sessionEntrySnapRef.current = null;

    resetInteractionState();
    if (canvasRef.current) canvasRef.current.style.cursor = '';

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
  }, [renderS2GalleryPlacement, renderStep3ArtworkPlacement, resetInteractionState, snapshot, step3Mode, syncHistoryBtns, setToolsCollapsed, toolsCollapsedRef, toolsCollapseTimerRef,
      mainUndoStackRef, mainRedoStackRef, toolUndoStackRef, toolRedoStackRef, sessionEntrySnapRef, stickerSys]);

  // ── Editor enter/exit ──

  const hideStep3GestureHint = useCallback(() => {
    clearTimeout(step3GestureHintTimerRef.current);
    step3GestureHintTimerRef.current = null;
    setStep3GestureHintVisible(false);
  }, []);

  const showStep3GestureHint = useCallback(() => {
    clearTimeout(step3GestureHintTimerRef.current);
    setStep3GestureHintVisible(true);
    step3GestureHintTimerRef.current = setTimeout(() => {
      setStep3GestureHintVisible(false);
      step3GestureHintTimerRef.current = null;
    }, STEP3_GESTURE_HINT_MS);
  }, []);

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
    const galleryCanvas = s2GalleryCanvasRef.current;
    const galleryCtx = galleryCanvas?.getContext('2d');
    galleryCtx?.clearRect(0, 0, galleryCanvas.width, galleryCanvas.height);
    s2GalleryImageRef.current = null;
    setS2GalleryAdjustable(false);
    stickerSys.clearStickers();
    layerStack.clearLayers();
    mainUndoStackRef.current = [];
    mainRedoStackRef.current = [];
    toolUndoStackRef.current = [];
    toolRedoStackRef.current = [];
    mainUndoStackRef.current.push(snapshot());
    syncHistoryBtns();
    await delay(100);
    setScrimVisible(true);
    setIntroCardVisible(true);
    setEditorVisible(false);
  }, [exitToolMode, exitTextTool, syncHistoryBtns, setToolsCollapsed, toolsCollapsedRef, toolsCollapseTimerRef,
      mainUndoStackRef, mainRedoStackRef, toolUndoStackRef, toolRedoStackRef, stickerSys, layerStack, snapshot]);

  // ── Body layout lock ──
  useLayoutEffect(() => {
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

  const finalizeS2LiveDecoratorsToCanvas = useCallback(async (saveHistory = false) => {
    if (activeToolRef.current) exitCurrentTool(true);
    if (saveHistory) pushHistory();
  }, [exitCurrentTool, pushHistory]);

  // ── Tool button handlers ──
  const handleToolDoodle = useCallback(() => {
    addRecentTool('doodle');
    if (activeToolRef.current === 'doodle') { exitToolMode(); return; }
    const wasActive = !!activeToolRef.current;
    exitCurrentTool(true);
    setTimeout(() => enterToolMode('doodle'), wasActive ? 120 : 0);
  }, [exitCurrentTool, exitToolMode, enterToolMode, addRecentTool]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToolMagicPen = useCallback(() => {
    addRecentTool('magicPen');
    if (activeToolRef.current === 'magicPen') { exitToolMode(); return; }
    const wasActive = !!activeToolRef.current;
    exitCurrentTool(true);
    setTimeout(() => enterToolMode('magicPen'), wasActive ? 120 : 0);
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

  const revokeStep3VideoUrl = useCallback(() => {
    if (step3VideoObjectUrlRef.current) {
      URL.revokeObjectURL(step3VideoObjectUrlRef.current);
      step3VideoObjectUrlRef.current = null;
    }
  }, []);

  // stopStep3Camera + startStep3Camera moved into useStep3Camera.
  // Aliased as `stopStep3Camera` / `startStep3Camera` near the hook call.

  const buildFrameDataUrl = useCallback(async () => {
    if (activeToolRef.current) exitCurrentTool(true);
    const { width, height } = getCanvasSize();
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const outCtx = out.getContext('2d');
    await layerStack.renderFrameLayersToContext(outCtx, { width, height });
    return out.toDataURL('image/png');
  }, [exitCurrentTool, getCanvasSize, layerStack]);

  // captureStep3CameraPhoto moved into useStep3Camera. Aliased above.

  const buildStep3PhotoBlob = useCallback(async () => {
    if (!step3PhotoUrl) throw new Error('No photo captured');
    const { width, height } = getCanvasSize();
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const outCtx = out.getContext('2d');
    const photo = await loadImage(step3PhotoUrl);
    // Apply the user's pan/zoom/rotate so the saved photo matches what they
    // composed on screen. Captured photos already bake in the live-camera
    // transform (and we reset the transform on capture), so this only carries
    // post-capture adjustments. Gallery imports use this for *all* of their
    // pan/zoom/rotate.
    const photoTransform = step3CameraTransform.transformRef.current;
    if (photoTransform) {
      drawMediaCoverWithTransform(outCtx, photo, width, height, photoTransform);
    } else {
      outCtx.drawImage(photo, 0, 0, width, height);
    }
    const frame = await loadImage(await buildFrameDataUrl());
    outCtx.drawImage(frame, 0, 0, width, height);
    drawRetakeWatermark(outCtx, width, height);
    return new Promise((resolve, reject) => {
      out.toBlob(blob => blob ? resolve(blob) : reject(new Error('Photo export failed')), 'image/jpeg', 0.92);
    });
  }, [buildFrameDataUrl, getCanvasSize, step3CameraTransform, step3PhotoUrl]);

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
        drawMediaCoverWithTransform(outCtx, video, width, height);
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
        // navigator.share resolves only when the user picks a destination and
        // the system share sheet completes. Confirm success so the user knows
        // the action actually went through (otherwise the modal just vanishes
        // silently and they wonder if anything happened).
        showToast('Shared!');
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
        drawMediaCoverWithTransform(recordCtx, video, width, height, step3CameraTransform.transformRef.current);
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
      step3CameraTransform.transformRef, toolsCollapsedRef, toolsCollapseTimerRef]);

  const cancelStep3Countdown = useCallback(() => {
    step3CountdownTimersRef.current.forEach(timer => clearTimeout(timer));
    step3CountdownTimersRef.current = [];
    step3CountdownModeRef.current = null;
    setStep3CountdownValue(null);
  }, []);

  const startStep3TimedAction = useCallback((mode, action) => {
    cancelStep3Countdown();
    if (!step3TimerSeconds) {
      action();
      return;
    }

    step3CountdownModeRef.current = mode;
    let remaining = step3TimerSeconds;
    setStep3CountdownValue(remaining);

    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) {
        step3CountdownTimersRef.current = [];
        step3CountdownModeRef.current = null;
        setStep3CountdownValue(null);
        action();
        return;
      }
      setStep3CountdownValue(remaining);
      step3CountdownTimersRef.current = [setTimeout(tick, 1000)];
    };

    step3CountdownTimersRef.current = [setTimeout(tick, 1000)];
  }, [cancelStep3Countdown, step3TimerSeconds]);

  // applyStep3HardwareZoom / resetStep3CameraTransform / handleStep3FlipCamera /
  // warmStep3ScreenFlash / releaseStep3ScreenFlash all moved into
  // useStep3Camera and aliased near the hook call.

  const completeStep3PhotoCapture = useCallback(async () => {
    try {
      await warmStep3ScreenFlash();
      const photoUrl = await captureStep3CameraPhoto();
      releaseStep3ScreenFlash();
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
      releaseStep3ScreenFlash();
      console.warn('[step3] Photo capture failed:', err);
      showToast('Camera is still warming up');
    }
  }, [captureStep3CameraPhoto, releaseStep3ScreenFlash, revokeStep3VideoUrl, showToast, setToolsCollapsed, stickerSys, stopStep3Camera, warmStep3ScreenFlash,
      toolsCollapsedRef, toolsCollapseTimerRef]);

  // Step3 transforms (pan/zoom/rotate) are allowed in two modes:
  //   - LIVE: pinch the live camera feed before capture
  //   - PHOTO: pinch/drag/rotate a still photo imported from the gallery
  // The double-tap-to-flip gesture still only fires in LIVE.
  const isStep3Transformable = (m) => (
    m === STEP3_MODE.LIVE || m === STEP3_MODE.PHOTO
  );

  const handleStep3PointerDown = useCallback((e) => {
    if (!isStep3Transformable(step3Mode) || activeToolRef.current) return;
    e.preventDefault();
    if (e.isPrimary === false) {
      step3CameraTransform.handlePointerDown(e);
      step3PointerMovedRef.current = true;
      clearTimeout(step3LongPressTimerRef.current);
      step3LongPressTimerRef.current = null;
      return;
    }
    step3CameraTransform.handlePointerDown(e);
    step3PointerMovedRef.current = false;
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
    step3LongPressTimerRef.current = null;
  }, [step3CameraTransform, step3Mode]);

  const handleStep3PointerMove = useCallback((e) => {
    if (!isStep3Transformable(step3Mode)) return;
    if (step3Mode === STEP3_MODE.LIVE && (step3RecordingRef.current || step3RecordingStartingRef.current)) return;
    const moved = step3CameraTransform.handlePointerMove(e);
    if (!moved) return;
    step3PointerMovedRef.current = true;
    clearTimeout(step3LongPressTimerRef.current);
    step3LongPressTimerRef.current = null;
  }, [step3CameraTransform, step3Mode]);

  const handleStep3PointerUp = useCallback(async (e) => {
    if (!isStep3Transformable(step3Mode)) return;
    e.preventDefault();
    const movedCamera = step3CameraTransform.handlePointerUp(e) || step3PointerMovedRef.current;
    if (step3PointerIdRef.current !== null && e.pointerId !== step3PointerIdRef.current) {
      step3PointerMovedRef.current = movedCamera;
      return;
    }
    if (e.currentTarget.releasePointerCapture && e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore release races; the recording stop path below is what matters.
      }
    }
    step3PointerDownRef.current = false;
    step3PointerIdRef.current = null;
    step3PointerMovedRef.current = false;
    clearTimeout(step3LongPressTimerRef.current);
    step3LongPressTimerRef.current = null;

    // Recording / countdown / tap-to-capture / double-tap-flip all only make
    // sense for the live camera feed. In PHOTO mode the pointer just drives
    // pan/zoom/rotate of the still image.
    if (step3Mode !== STEP3_MODE.LIVE) return;

    if (step3RecordingRef.current || step3RecordingStartingRef.current) {
      stopStep3Recording();
      return;
    }
    if (step3CountdownModeRef.current === 'video') {
      cancelStep3Countdown();
      return;
    }
    clearTimeout(step3TapCaptureTimerRef.current);
    step3TapCaptureTimerRef.current = null;
    if (movedCamera) {
      step3LastTapAtRef.current = 0;
      return;
    }

    const now = Date.now();
    if (now - step3LastTapAtRef.current < STEP3_DOUBLE_TAP_MS) {
      step3LastTapAtRef.current = 0;
      await handleStep3FlipCamera();
      return;
    }
    step3LastTapAtRef.current = now;
    step3TapCaptureTimerRef.current = setTimeout(() => {
      step3LastTapAtRef.current = 0;
      step3TapCaptureTimerRef.current = null;
    }, STEP3_DOUBLE_TAP_MS);
  }, [cancelStep3Countdown, handleStep3FlipCamera, step3CameraTransform, step3Mode, stopStep3Recording]);

  const handleStep3PointerCancel = useCallback((e) => {
    if (!isStep3Transformable(step3Mode)) return;
    e.preventDefault();
    const movedCamera = step3CameraTransform.handlePointerUp(e) || step3PointerMovedRef.current;
    if (step3PointerIdRef.current !== null && e.pointerId !== step3PointerIdRef.current) {
      step3PointerMovedRef.current = movedCamera;
      return;
    }
    if (e.currentTarget.releasePointerCapture && e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore release races; cancel still clears local recording state.
      }
    }
    step3PointerDownRef.current = false;
    step3PointerIdRef.current = null;
    step3PointerMovedRef.current = false;
    clearTimeout(step3LongPressTimerRef.current);
    step3LongPressTimerRef.current = null;
    if (step3CountdownModeRef.current === 'video') cancelStep3Countdown();
    if (step3RecordingRef.current || step3RecordingStartingRef.current) {
      stopStep3Recording();
    }
  }, [cancelStep3Countdown, step3CameraTransform, step3Mode, stopStep3Recording]);

  const enterStep3 = useCallback(async () => {
    cancelStep3Countdown();
    clearTimeout(step3TapCaptureTimerRef.current);
    step3TapCaptureTimerRef.current = null;
    step3LastTapAtRef.current = 0;
    exitCurrentTool(true);
    await renderStep3ArtworkPlacement();
    stickerSys.closePanel();
    setScrimVisible(false);
    setIntroCardVisible(false);
    setStep3PhotoUrl('');
    revokeStep3VideoUrl();
    setStep3VideoUrl('');
    step3VideoBlobRef.current = null;
    setSavedFramesVisible(false);
    setStep3Mode(STEP3_MODE.LIVE);
    showStep3GestureHint();
    setStep3FlashEnabled(false);
    setStep3ZoomMode(1);
    step3CameraTransform.reset(step3FacingMode === 'user');
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
  }, [cancelStep3Countdown, exitCurrentTool, renderStep3ArtworkPlacement, revokeStep3VideoUrl, showStep3GestureHint, startStep3Camera,
      step3CameraTransform, step3FacingMode, stickerSys]);

  const exitStep3ToEditor = useCallback(async () => {
    cancelStep3Countdown();
    clearTimeout(step3TapCaptureTimerRef.current);
    step3TapCaptureTimerRef.current = null;
    step3LastTapAtRef.current = 0;
    hideStep3GestureHint();
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
    renderS2GalleryPlacement();
  }, [cancelStep3Countdown, hideStep3GestureHint, revokeStep3VideoUrl, setToolsCollapsed, stickerSys, stopStep3Camera, stopStep3Recording,
      toolsCollapsedRef, toolsCollapseTimerRef, renderS2GalleryPlacement]);

  const returnStep3ToLive = useCallback(async () => {
    cancelStep3Countdown();
    clearTimeout(step3TapCaptureTimerRef.current);
    step3TapCaptureTimerRef.current = null;
    step3LastTapAtRef.current = 0;
    if (activeToolRef.current) exitCurrentTool(true);
    setStep3PhotoUrl('');
    revokeStep3VideoUrl();
    setStep3VideoUrl('');
    step3VideoBlobRef.current = null;
    setStep3Mode(STEP3_MODE.LIVE);
    showStep3GestureHint();
    setStep3FlashEnabled(false);
    setStep3ZoomMode(1);
    setToolsVisible(false);
    setToolsOut(false);
    setBottomBarOut(false);
    if (canvasRef.current) canvasRef.current.classList.add('no-tool');
    if (stickerSys.stickerOverlayRef.current) stickerSys.stickerOverlayRef.current.style.pointerEvents = 'none';
    await delay(80);
    await startStep3Camera();
  }, [cancelStep3Countdown, exitCurrentTool, revokeStep3VideoUrl, showStep3GestureHint, startStep3Camera, stickerSys]);

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
      setSavedFrameSavedTitle(item.name);
      setSavedFrameTitleEditing(false);
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
      layerStack.clearLayers();
      setFrameName(frame.name || 'my frame');
      setSavedFrameSavedTitle(frame.name || 'my frame');
      setSavedFrameTitleEditing(false);
      mainUndoStackRef.current = [snapshot()];
      mainRedoStackRef.current = [];
      syncHistoryBtns();
      closeSavedFrames();
      showToast('Frame loaded');
    } catch (err) {
      console.warn('[step3] Saved frame load failed:', err);
      showToast('Could not load frame');
    }
  }, [closeSavedFrames, getCanvasSize, layerStack, mainRedoStackRef, mainUndoStackRef, showToast, snapshot, stickerSys, syncHistoryBtns]);

  const handleSavedFrameDelete = useCallback((frameId) => {
    const removed = loadSavedFrames().find(frame => frame.id === frameId);
    const next = loadSavedFrames().filter(frame => frame.id !== frameId);
    persistSavedFrames(next);
    setSavedFrames(next);
    if (removed?.name === savedFrameSavedTitle) setSavedFrameSavedTitle(null);
    showToast('Frame removed');
  }, [savedFrameSavedTitle, showToast]);

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

  const handleStep3ShareRetake = useCallback(async (nameOverride) => {
    const activeFrameName = nameOverride || frameName;
    if (step3Mode === STEP3_MODE.VIDEO && step3VideoBlobRef.current) {
      try {
        const blob = await buildStep3VideoBlob();
        await shareBlob(blob, `retake-${Date.now()}.webm`, 'My Retake', activeFrameName);
      } catch (err) {
        console.warn('[step3] Share video failed:', err);
        await shareBlob(step3VideoBlobRef.current, `retake-${Date.now()}.webm`, 'My Retake', activeFrameName);
      }
      return;
    }
    if (step3Mode === STEP3_MODE.PHOTO) {
      try {
        const blob = await buildStep3PhotoBlob();
        await shareBlob(blob, `retake-${Date.now()}.jpg`, 'My Retake', activeFrameName);
      } catch (err) {
        console.warn('[step3] Share retake failed:', err);
        showToast('Could not share Retake');
      }
      return;
    }
    try {
      const frameDataUrl = await buildFrameDataUrl();
      const upload = await uploadFrame({ frameDataUrl, frameName: activeFrameName });
      const invite = await createInvite({
        frameUrl: upload.url,
        frameName: activeFrameName,
        // Use the name the user entered in the share popup (persisted across
        // sessions in localStorage). Fall back to a friendly placeholder so
        // the API never sees an empty string.
        username: usernameRef.current || 'friend',
      });
      const inviteUrl = invite.id ? buildInviteUrl(invite.id) : invite.inviteUrl;
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Retake invite',
            text: `${activeFrameName} is ready for your Retake`,
            url: inviteUrl,
          });
          showToast('Invite shared!');
          return;
        } catch (err) {
          if (err?.name === 'AbortError') return;
        }
      }
      await navigator.clipboard?.writeText(inviteUrl);
      showToast('Invite link copied');
    } catch (err) {
      console.warn('[step3] Invite creation failed:', err);
      showToast(err?.message || 'Could not create invite');
    }
  }, [buildFrameDataUrl, buildStep3PhotoBlob, buildStep3VideoBlob, frameName, shareBlob, showToast, step3Mode]);

  const handleStep3ShareTap = useCallback(() => {
    pendingShareAfterNameRef.current = true;
    setEditNameSaveLabel('Share');
    openEditName();
  }, [openEditName]);

  const handleEditNameSave = useCallback(() => {
    const result = saveEditName();
    const nextName = typeof result === 'string' ? result : result?.name;
    setEditNameSaveLabel('Save');
    if (!pendingShareAfterNameRef.current) return;
    pendingShareAfterNameRef.current = false;
    handleStep3ShareRetake(nextName);
  }, [handleStep3ShareRetake, saveEditName]);

  // handleStep3FlashToggle moved into useStep3Camera (toggleFlash). Aliased above.

  const handleStep3TimerToggle = useCallback(() => {
    const index = STEP3_TIMER_STEPS.indexOf(step3TimerSeconds);
    const next = STEP3_TIMER_STEPS[(index + 1) % STEP3_TIMER_STEPS.length];
    setStep3TimerSeconds(next);
    showToast(next ? `${next}s timer` : 'Timer off');
  }, [showToast, step3TimerSeconds]);

  // handleStep3Zoom is just `step3Camera.applyHardwareZoom` — aliased above.

  const canHandleS2GalleryGesture = useCallback(() => (
    s2GalleryAdjustable
    && !step3Mode
    && editorVisible
    && !activeToolRef.current
    && !textToolActive
    && !savedFramesVisible
    && !editNameVisible
    && !confirmVisible
    && !stickerSys.stickerPanelVisible
  ), [
    confirmVisible,
    editNameVisible,
    editorVisible,
    s2GalleryAdjustable,
    savedFramesVisible,
    step3Mode,
    stickerSys.stickerPanelVisible,
    textToolActive,
  ]);

  const handleS2GalleryPointerDown = useCallback((e) => {
    const target = e.target;
    if (target.closest?.('.placed-sticker, .placed-text, .placed-photo')) {
      return;
    }
    stickerSys.deselectAllStickers?.();
    if (!canHandleS2GalleryGesture()) return;
    e.preventDefault();
    if (!s2GalleryGestureActiveRef.current && s2GalleryTransform.getActivePointerCount() > 0) {
      s2GalleryTransform.cancel();
    }
    s2GalleryGestureActiveRef.current = true;
    s2GalleryGestureMovedRef.current = false;
    if (e.currentTarget.setPointerCapture) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture is best-effort for Safari/WebKit.
      }
    }
    s2GalleryTransform.handlePointerDown(e);
  }, [canHandleS2GalleryGesture, s2GalleryTransform, stickerSys]);

  const handleS2GalleryPointerMove = useCallback((e) => {
    if (!s2GalleryGestureActiveRef.current || !canHandleS2GalleryGesture()) return;
    e.preventDefault();
    const moved = s2GalleryTransform.handlePointerMove(e);
    if (moved) s2GalleryGestureMovedRef.current = true;
  }, [canHandleS2GalleryGesture, s2GalleryTransform]);

  const handleS2GalleryPointerUp = useCallback((e) => {
    if (!s2GalleryGestureActiveRef.current && s2GalleryTransform.getActivePointerCount() === 0) return;
    e.preventDefault();
    const moved = s2GalleryTransform.handlePointerUp(e) || s2GalleryGestureMovedRef.current;
    if (e.currentTarget.releasePointerCapture && e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Pointer capture is best-effort for Safari/WebKit.
      }
    }
    if (moved) {
      renderS2GalleryPlacement();
    }
    if (s2GalleryTransform.getActivePointerCount() === 0) {
      s2GalleryGestureActiveRef.current = false;
      s2GalleryGestureMovedRef.current = false;
    } else {
      s2GalleryGestureMovedRef.current = moved;
    }
  }, [renderS2GalleryPlacement, s2GalleryTransform]);

  const handleS2GalleryPointerCancel = useCallback((e) => {
    if (!s2GalleryGestureActiveRef.current) return;
    e.preventDefault();
    const moved = s2GalleryTransform.cancel() || s2GalleryGestureMovedRef.current;
    if (moved) {
      renderS2GalleryPlacement();
    }
    s2GalleryGestureActiveRef.current = false;
    s2GalleryGestureMovedRef.current = false;
  }, [renderS2GalleryPlacement, s2GalleryTransform]);

  useEffect(() => {
    if (!s2GalleryAdjustable || !s2GalleryImageRef.current) return;
    renderS2GalleryPlacement();
  }, [renderS2GalleryPlacement, s2GalleryAdjustable, s2GalleryTransform.transform]);

  useEffect(() => {
    if (step3Mode !== STEP3_MODE.LIVE) return undefined;

    const stopActiveRecording = () => {
      if (
        !step3RecordingRef.current
        && !step3RecordingStartingRef.current
        && step3CountdownModeRef.current !== 'video'
      ) return;
      step3PointerDownRef.current = false;
      step3PointerIdRef.current = null;
      clearTimeout(step3LongPressTimerRef.current);
      step3LongPressTimerRef.current = null;
      if (step3CountdownModeRef.current === 'video') cancelStep3Countdown();
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
  }, [cancelStep3Countdown, step3Mode, stopStep3Recording]);

  useEffect(() => {
    step3CameraTransform.setMirror(step3FacingMode === 'user');
  }, [step3CameraTransform.setMirror, step3FacingMode]);

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
      clearTimeout(step3TapCaptureTimerRef.current);
      clearTimeout(step3GestureHintTimerRef.current);
      clearTimeout(step3FlashTimerRef.current);
      clearTimeout(step3RecordStopTimerRef.current);
      step3CountdownTimersRef.current.forEach(timer => clearTimeout(timer));
      cancelAnimationFrame(step3RecordRafRef.current);
    };
  }, [revokeStep3VideoUrl, stopStep3Camera, stopStep3Recording]);

  const handleBgGallery = useCallback(() => {
    if (galleryInputRef.current) galleryInputRef.current.click();
  }, []);

  // Step3 LIVE: open the device gallery to pick a still photo to compose with
  // the current frame, bypassing the live camera. Switches step3Mode to PHOTO
  // so the review tools (drawing, stickers, share) immediately apply.
  const handleStep3GalleryClick = useCallback(() => {
    step3GalleryInputRef.current?.click();
  }, []);

  const handleStep3GalleryChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    const url = URL.createObjectURL(file);
    cancelStep3Countdown();
    stopStep3Recording();
    stopStep3Camera();
    step3CameraTransform.reset(false);
    setStep3PhotoUrl(url);
    revokeStep3VideoUrl();
    setStep3VideoUrl('');
    step3VideoBlobRef.current = null;
    setStep3Mode(STEP3_MODE.PHOTO);
    showToast('Photo loaded — add stickers or share');
  }, [cancelStep3Countdown, revokeStep3VideoUrl, showToast, step3CameraTransform, stopStep3Camera, stopStep3Recording]);

  const handleProceedToStep3 = useCallback(async () => {
    await finalizeS2LiveDecoratorsToCanvas(true);
    await enterStep3();
  }, [enterStep3, finalizeS2LiveDecoratorsToCanvas]);

  const handleToolDownload = useCallback(async () => {
    await finalizeS2LiveDecoratorsToCanvas(true);
    try {
      const dataURL = await buildFrameDataUrl();
      const a = document.createElement('a');
      const name = (frameName.trim() || 'retake-frame').replace(/[^a-z0-9\-_]/gi, '-').toLowerCase();
      a.download = name + '.png'; a.href = dataURL; a.click();
      showToast('Saved!');
    } catch(e) {
      showToast('Unable to save — try from a server');
    }
  }, [buildFrameDataUrl, finalizeS2LiveDecoratorsToCanvas, frameName, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  const placePhotoFile = useCallback(async (file) => {
    if (!file) { introPhotoFlowRef.current = false; return; }
    const url = URL.createObjectURL(file);
    const newImg = new Image();
    newImg.onload = async () => {
      const canvas = canvasRef.current, ctx = ctxRef.current;
      const W = canvas.width, H = canvas.height;
      const fallback = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-canvas')
        .trim() || '#F7F5F2';
      const backgroundColor = getAverageImageColor(newImg, fallback);
      s2GalleryImageRef.current = newImg;
      s2GalleryBackgroundRef.current = backgroundColor || fallback;
      s2GalleryTransform.reset(false);
      setS2GalleryAdjustable(true);
      if (introPhotoFlowRef.current && !editorVisible) {
        stickerSys.clearStickers();
        layerStack.clearLayers();
      }
      ctx.clearRect(0, 0, W, H);
      renderS2GalleryPlacement();
      mainUndoStackRef.current = [snapshot()];
      mainRedoStackRef.current = [];
      syncHistoryBtns();
      URL.revokeObjectURL(url);
      if (introPhotoFlowRef.current) { introPhotoFlowRef.current = false; await enterEditor(); }
      showToast('Use two fingers to adjust photo');
    };
    newImg.src = url;
  }, [editorVisible, enterEditor, layerStack, mainRedoStackRef, mainUndoStackRef, renderS2GalleryPlacement, s2GalleryTransform, showToast, snapshot, stickerSys, syncHistoryBtns]);

  const handleGalleryChange = useCallback(async (e) => {
    await placePhotoFile(e.target.files[0]);
    e.target.value = '';
  }, [placePhotoFile]);

  const handleChoosePhoto = useCallback(async () => {
    introPhotoFlowRef.current = true;
    if (window.showOpenFilePicker) {
      try {
        const [fileHandle] = await window.showOpenFilePicker({
          multiple: false,
          excludeAcceptAllOption: true,
          types: [{
            description: 'Images',
            accept: {
              'image/*': ['.avif', '.gif', '.heic', '.heif', '.jpeg', '.jpg', '.png', '.webp'],
            },
          }],
        });
        if (fileHandle) {
          await placePhotoFile(await fileHandle.getFile());
          return;
        }
      } catch (err) {
        if (err?.name === 'AbortError') {
          introPhotoFlowRef.current = false;
          return;
        }
      }
    }
    if (galleryInputRef.current) galleryInputRef.current.click();
  }, [placePhotoFile]);

  const handleTakePhoto = useCallback(() => {
    introPhotoFlowRef.current = true;
    if (cameraInputRef.current) cameraInputRef.current.click();
  }, []);

  const handleStartBlank = useCallback(async () => {
    introPhotoFlowRef.current = false;
    s2GalleryImageRef.current = null;
    setS2GalleryAdjustable(false);
    const ctx = ctxRef.current, canvas = canvasRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const galleryCanvas = s2GalleryCanvasRef.current;
    const galleryCtx = galleryCanvas?.getContext('2d');
    galleryCtx?.clearRect(0, 0, galleryCanvas.width, galleryCanvas.height);
    stickerSys.clearStickers();
    layerStack.clearLayers();
    mainUndoStackRef.current = [snapshot()];
    mainRedoStackRef.current = [];
    syncHistoryBtns();
    await enterEditor();
  }, [syncHistoryBtns, enterEditor, layerStack, mainUndoStackRef, mainRedoStackRef, snapshot, stickerSys]);

  const handleExitBtn = useCallback(async () => {
    if (step3Mode) {
      const ok = await showConfirm('Leave camera preview?', 'Leave', true);
      if (!ok) return;
      cancelStep3Countdown();
      clearTimeout(step3TapCaptureTimerRef.current);
      step3TapCaptureTimerRef.current = null;
      step3LastTapAtRef.current = 0;
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
    const ok = await showConfirm('Discard this frame?', 'Discard', true);
    if (!ok) return;
    await exitToIntro();
  }, [cancelStep3Countdown, exitToIntro, revokeStep3VideoUrl, showConfirm, step3Mode, stopStep3Camera, stopStep3Recording]);

  const handleScrimClick = useCallback(() => {
    if (editNameVisible) {
      pendingShareAfterNameRef.current = false;
      setEditNameSaveLabel('Save');
      saveEditName();
      return;
    }
    if (savedFramesVisible) { closeSavedFrames(); return; }
    if (stickerSys.stickerPanelVisible) stickerSys.closePanel();
  }, [closeSavedFrames, editNameVisible, saveEditName, savedFramesVisible, stickerSys]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSwatchClick = useCallback((color) => {
    doodleColorRef.current = color;
    setDoodleColor(color);
    syncCursor();
  }, [syncCursor]);

  const handleColorPickerChange = useCallback((e) => {
    const color = e.target.value.toUpperCase();
    doodleColorRef.current = color;
    setDoodleColor(color);
    syncCursor();
  }, [syncCursor]);

  const handleDoodleModeClick = useCallback((mode) => {
    doodleModeRef.current = mode;
    setDoodleMode(mode);
    if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair';
    syncCursor();
  }, [syncCursor]);

  const handleDoodleOpacityInput = useCallback((e) => {
    const value = Math.max(5, Math.min(100, Number(e.target.value) || 100));
    doodleOpacityRef.current = value;
    setDoodleOpacity(value);
    e.target.style.setProperty('--fill', `${value}%`);
    syncCursor();
  }, [syncCursor]);

  const handlePenTypeClick = useCallback((type) => {
    penTypeRef.current = type;
    setPenType(type);
  }, []);

  const handleMagicPenModeClick = useCallback((mode) => {
    resetMagicSelection();
    magicPenModeRef.current = mode;
    setMagicPenMode(mode);
    if (canvasRef.current) canvasRef.current.style.cursor = mode === 'freehand' || mode === 'magic' ? 'crosshair' : 'default';
    if (mode !== 'freehand' && brushCursorRef.current) brushCursorRef.current.style.display = 'none';
    syncCursor();
  }, [resetMagicSelection, syncCursor]);

  const handleMagicPenOpacityInput = useCallback((e) => {
    const value = Math.max(5, Math.min(100, Number(e.target.value) || 100));
    magicPenOpacityRef.current = value;
    setMagicPenOpacity(value);
    e.target.style.setProperty('--fill', `${value}%`);
    refreshMagicSelectionPreview();
  }, [refreshMagicSelectionPreview]);

  const handleMagicSelectApply = useCallback(() => {
    if (applyMagicSelection()) exitToolMode();
  }, [applyMagicSelection, exitToolMode]);

  const isMagicRefining = magicPenMode === 'magic' && magicSelectPhase === 'refine';

  const isStep3 = step3Mode !== null;
  const isStep3Live = step3Mode === STEP3_MODE.LIVE;
  const isStep3PhotoReview = step3Mode === STEP3_MODE.PHOTO;
  const isStep3VideoReview = step3Mode === STEP3_MODE.VIDEO;
  const isStep3Review = isStep3PhotoReview || isStep3VideoReview;
  const isStep3Countdown = step3CountdownValue !== null;
  const isStep3CaptureBusy = step3Recording || isStep3Countdown;
  const stickerMakerVisible = stickerSys.newStickerVisible;
  const normalizedFrameName = frameName.trim() || 'my frame';
  const isSavedFrameTitleSaved = !!savedFrameSavedTitle && savedFrameSavedTitle === normalizedFrameName;

  const flowState = savedFramesVisible
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
        frameClassName={s2GalleryAdjustable && !isStep3 ? 's2-gallery-adjusting' : ''}
        onPointerDown={handleS2GalleryPointerDown}
        onPointerMove={handleS2GalleryPointerMove}
        onPointerUp={handleS2GalleryPointerUp}
        onPointerCancel={handleS2GalleryPointerCancel}
        brushCursorRef={brushCursorRef}
        brushCursorSvgRef={brushCursorSvgRef}
        brushCursorCircleRef={brushCursorCircleRef}
        frameScrimVisible={frameScrimVisible}
      >
        <canvas
          id="s2GalleryCanvas"
          ref={s2GalleryCanvasRef}
          width="414"
          height="736"
          aria-hidden="true"
        />
        <RetakeCameraStage
          mode={step3Mode}
          recording={step3Recording}
          videoRef={step3VideoRef}
          cameraStyle={step3CameraTransform.style}
          cameraReady={step3CameraReady}
          cameraIssue={step3CameraIssue}
          photoUrl={step3PhotoUrl}
          videoUrl={step3VideoUrl}
          onPointerDown={handleStep3PointerDown}
          onPointerMove={handleStep3PointerMove}
          onPointerUp={handleStep3PointerUp}
          onPointerCancel={handleStep3PointerCancel}
        />
      </FrameCanvas>

      <RetakeRecordingStroke visible={step3Recording} progress={step3RecordingProgress} />

      <RetakeCountdownOverlay value={step3CountdownValue} />

      {isStep3Live && (
        <RetakeScreenFlash
          visible={step3ScreenFlashActive || (step3Recording && step3UsesScreenFlash)}
          recording={step3Recording && step3UsesScreenFlash}
        />
      )}

      {isStep3Live && !isStep3CaptureBusy && !stickerMakerVisible && (
        <div className="step3-preview-label" aria-live="polite">Preview</div>
      )}

      <RetakeZoomControl
        visible={isStep3Live && !isStep3CaptureBusy && !stickerMakerVisible}
        zoomOptions={step3ZoomOptions}
        zoomMode={step3ZoomMode}
        onZoom={handleStep3Zoom}
      />

      <CameraGestureToast visible={isStep3Live && step3GestureHintVisible && !isStep3CaptureBusy && !stickerMakerVisible} />

      {!isStep3CaptureBusy && !stickerMakerVisible && (
        <ExitButton
          visible={exitBtnVisible}
          out={exitBtnOut}
          label={isStep3 ? 'Leave camera preview' : 'Close frame editor'}
          onClick={handleExitBtn}
        />
      )}

      {!isStep3 && !stickerMakerVisible && (
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
            onToolMagicPen={handleToolMagicPen}
            onToolDownload={handleToolDownload}
            onToggle={handleToggleTools}
            onInteraction={handleToolbarInteraction}
            onToolMouseEnter={handleToolMouseEnter}
            onToolMouseLeave={handleToolMouseLeave}
          />

          <BottomBar
            visible={bottomBarVisible}
            out={bottomBarOut}
            onGalleryClick={handleBgGallery}
            onProceed={handleProceedToStep3}
          />
        </>
      )}

      {isStep3Review && !isStep3CaptureBusy && !stickerMakerVisible && (
        <RetakeReviewToolbar
          visible={toolsVisible}
          out={toolsOut}
          collapsed={toolsCollapsed}
          labelsExpanded={labelsExpanded}
          activeTool={activeTool}
          orderedToolIds={step3ToolIds}
          onToolText={handleToolText}
          onToolStickers={handleToolStickers}
          onToolDoodle={handleToolDoodle}
          onToolMagicPen={() => {}}
          onToolDownload={handleStep3SaveRetake}
          onToggle={handleToggleTools}
          onInteraction={handleToolbarInteraction}
          onToolMouseEnter={handleToolMouseEnter}
          onToolMouseLeave={handleToolMouseLeave}
        />
      )}

      {/* Step3 LIVE preview gets a custom 3-button bottom layout matching the
          invitee camera screen: gallery on the left, Share centered, flip on
          the right. RetakeCameraBottomBar (Back + Share) is kept for the
          PHOTO/VIDEO review modes where the user is making a final decision
          on a captured Retake. */}
      {isStep3Live && !isStep3CaptureBusy && !stickerMakerVisible && (
        <>
          <GlassIconButton
            className="inviter-step3-gallery-btn"
            icon="photo"
            label="Pick a photo from library"
            onClick={handleStep3GalleryClick}
          />
          <GlassIconButton
            className="inviter-step3-share-btn"
            icon="share"
            label="Share frame"
            shape="pill"
            onClick={openSavedFrames}
          >
            <span className="inviter-step3-share-label">Share</span>
          </GlassIconButton>
          <GlassIconButton
            className="inviter-step3-flip-btn"
            icon="flipCamera"
            label="Flip camera"
            onClick={handleStep3FlipCamera}
          />
        </>
      )}
      {isStep3 && !isStep3Live && !isStep3CaptureBusy && !stickerMakerVisible && (
        <RetakeCameraBottomBar
          visible
          out={bottomBarOut}
          className="retake-camera-bottom-bar--split-actions inviter-s3-bottom-bar"
          glassControls
          hideTitle
          review={false}
          title={frameName}
          titleLabel="Name your frame"
          leftLabel="Back"
          onLeft={handleStep3Back}
          showSecondary={false}
          primaryLabel="Share"
          primaryText="Share"
          onPrimary={openSavedFrames}
        />
      )}
      {/* Hidden file input that handleStep3GalleryClick targets. */}
      <input
        type="file"
        ref={step3GalleryInputRef}
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleStep3GalleryChange}
      />

      <DrawingToolOverlays
        tmLeftPanelRef={tmLeftPanelRef}
        tmSizeHandleRef={tmSizeHandleRef}
        tmIn={tmIn && !stickerMakerVisible}
        tmLeftIn={tmLeftIn && !stickerMakerVisible}
        tmPenBarIn={tmBarMode === 'doodle' && !stickerMakerVisible}
        tmMagicPenBarIn={tmBarMode === 'magicPen' && !stickerMakerVisible}
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

      {!isStep3CaptureBusy && (
        <Toast className="s6-toast" id="toast" visible={toastVisible}>{toastMsg}</Toast>
      )}

      <EditNamePopup
        visible={editNameVisible}
        inputValue={editNameInputValue}
        onChange={e => setEditNameInputValue(e.target.value)}
        usernameValue={editUsernameInputValue}
        onUsernameChange={e => setEditUsernameInputValue(e.target.value)}
        onSave={handleEditNameSave}
        saveLabel={editNameSaveLabel}
      />

      <div className={`saved-frames-sheet${savedFramesVisible ? ' visible' : ''}`} id="savedFramesSheet">
        <div className="saved-frames-topbar">
          <div className="saved-frames-handle"></div>
          <SolidIconButton className="saved-frames-close" icon="close" label="Close saved frames" onClick={closeSavedFrames} />
        </div>
        <div className="saved-frame-current">
          <div className="saved-frame-title-row">
            <div className="saved-frame-title-main">
              <p className="saved-frame-title-label">Frame title</p>
              {savedFrameTitleEditing ? (
                <input
                  className="saved-frame-title-input"
                  id="savedFrameTitle"
                  type="text"
                  value={frameName}
                  maxLength="32"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                  autoFocus
                  onChange={e => setFrameName(e.target.value)}
                  onFocus={e => e.currentTarget.select()}
                  onKeyDown={e => { if (e.key === 'Enter') setSavedFrameTitleEditing(false); }}
                />
              ) : (
                <button
                  type="button"
                  className="saved-frame-title-display"
                  onClick={() => setSavedFrameTitleEditing(true)}
                >
                  {normalizedFrameName}
                </button>
              )}
            </div>
            <div className="saved-frame-title-actions" aria-label="Frame title actions">
              {savedFrameTitleEditing ? (
                <button
                  type="button"
                  className="saved-frame-done-action"
                  onClick={() => setSavedFrameTitleEditing(false)}
                >
                  Done
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="saved-frame-edit-action"
                    onClick={() => setSavedFrameTitleEditing(true)}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className={`saved-frame-action${isSavedFrameTitleSaved ? ' saved' : ''}`}
                    disabled={isSavedFrameTitleSaved}
                    onClick={() => saveFrameLocal('made')}
                  >
                    {isSavedFrameTitleSaved ? 'Saved' : 'Save'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="saved-frame-share-action"
          onClick={() => handleStep3ShareRetake(normalizedFrameName)}
        >
          Share
        </button>
        <div className="saved-frames-library-header">
          <p className="saved-frames-title">Saved frames</p>
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

      <PhotoInputs
        galleryInputRef={galleryInputRef}
        cameraInputRef={cameraInputRef}
        onPhotoChange={handleGalleryChange}
      />

      <IntroCard
        visible={introCardVisible}
        onChoosePhoto={handleChoosePhoto}
        onTakePhoto={handleTakePhoto}
        onStartBlank={handleStartBlank}
      />

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
