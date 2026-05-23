import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useMediaTransform from './useMediaTransform.js';
import {
  captureRetakeCameraPhoto,
  chooseRetakeVideoMimeType,
  getRetakeCameraIssue,
  getRetakeTrackCapabilities,
  logRetakeCameraSettings,
  requestRetakeCameraStream,
  RETAKE_CAMERA_DEFAULT_CAPABILITIES,
  RETAKE_CAMERA_DOUBLE_TAP_MS,
  RETAKE_CAMERA_FLASH_FADE_MS,
  RETAKE_CAMERA_FLASH_WARMUP_MS,
  RETAKE_CAMERA_LONG_PRESS_MS,
  RETAKE_CAMERA_MAX_RECORD_MS,
  RETAKE_CAMERA_MODE,
  RETAKE_CAMERA_TIMER_STEPS,
  roundRetakeZoom,
  waitForVideoMetadata,
} from '../utils/retakeCamera.js';
import { drawMediaCoverWithTransform } from '../utils/canvas.js';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function safelySetPointerCapture(target, pointerId) {
  if (!target?.setPointerCapture) return;
  try {
    target.setPointerCapture(pointerId);
  } catch {
    // Pointer capture can fail if Safari has already released the pointer.
  }
}

function safelyReleasePointerCapture(target, pointerId) {
  if (!target?.releasePointerCapture || !target.hasPointerCapture?.(pointerId)) return;
  try {
    target.releasePointerCapture(pointerId);
  } catch {
    // Ignore release races; local pointer state still gets cleared.
  }
}

export default function useRetakeCamera({
  getCanvasSize,
  onToast,
  label = 'retake-camera',
} = {}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordRafRef = useRef(null);
  const recordStopTimerRef = useRef(null);
  const recordStartedAtRef = useRef(0);
  const longPressTimerRef = useRef(null);
  const tapCaptureTimerRef = useRef(null);
  const flashTimerRef = useRef(null);
  const lastTapAtRef = useRef(0);
  const lastPreviewTapAtRef = useRef(0);
  const countdownTimersRef = useRef([]);
  const countdownModeRef = useRef(null);
  const pointerIdRef = useRef(null);
  const pointerDownRef = useRef(false);
  const pointerMovedRef = useRef(false);
  const recordingRef = useRef(false);
  const recordingStartingRef = useRef(false);
  const pendingStopRef = useRef(false);
  const videoBlobRef = useRef(null);
  const videoObjectUrlRef = useRef(null);

  const [mode, setMode] = useState(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(1);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraIssue, setCameraIssue] = useState('');
  const [facingMode, setFacingMode] = useState('environment');
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [screenFlashActive, setScreenFlashActive] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [zoomMode, setZoomMode] = useState(1);
  const [cameraCapabilities, setCameraCapabilities] = useState(RETAKE_CAMERA_DEFAULT_CAPABILITIES);
  const [countdownValue, setCountdownValue] = useState(null);

  const cameraTransform = useMediaTransform({
    initialMirror: facingMode === 'user',
    minScale: 0.05,
    maxScale: 4,
    lockRotation: true,
  });

  const zoomOptions = useMemo(() => {
    if (!cameraCapabilities.zoom) return [];
    return [0.5, 1, 2, 3].filter(
      zoom => cameraCapabilities.zoomMin <= zoom && cameraCapabilities.zoomMax >= zoom
    );
  }, [cameraCapabilities]);

  const usesHardwareTorch = facingMode === 'environment' && cameraCapabilities.torch;
  const usesScreenFlash = flashEnabled && !usesHardwareTorch;

  const revokeVideoUrl = useCallback(() => {
    if (videoObjectUrlRef.current) {
      URL.revokeObjectURL(videoObjectUrlRef.current);
      videoObjectUrlRef.current = null;
    }
  }, []);

  const cancelCountdown = useCallback(() => {
    countdownTimersRef.current.forEach(timer => clearTimeout(timer));
    countdownTimersRef.current = [];
    countdownModeRef.current = null;
    setCountdownValue(null);
  }, []);

  const stopCamera = useCallback(() => {
    clearTimeout(flashTimerRef.current);
    flashTimerRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
    setFlashEnabled(false);
    setScreenFlashActive(false);
    setCameraCapabilities(RETAKE_CAMERA_DEFAULT_CAPABILITIES);
  }, []);

  const startCamera = useCallback(async (nextFacingMode = facingMode) => {
    stopCamera();
    setCameraReady(false);
    setCameraIssue('');
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      const issue = getRetakeCameraIssue();
      setCameraIssue(issue.fallback);
      onToast?.(issue.toast);
      return false;
    }

    try {
      const stream = await requestRetakeCameraStream(nextFacingMode);
      streamRef.current = stream;
      if (videoRef.current) {
        const video = videoRef.current;
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.srcObject = stream;
        await waitForVideoMetadata(video);
        await video.play();
      } else {
        throw new Error('Camera view not mounted');
      }

      const [track] = stream.getVideoTracks();
      const capabilities = getRetakeTrackCapabilities(track);
      logRetakeCameraSettings(label, track, videoRef.current);
      setCameraCapabilities(capabilities);
      setZoomMode(roundRetakeZoom(capabilities.zoom ? capabilities.zoomMin : 1));
      cameraTransform.reset(nextFacingMode === 'user');
      setCameraIssue('');
      setCameraReady(true);
      return true;
    } catch (err) {
      console.warn(`[${label}] Camera unavailable:`, err?.name, err?.message);
      stopCamera();
      const issue = getRetakeCameraIssue(err);
      setCameraIssue(issue.fallback);
      onToast?.(issue.toast);
      return false;
    }
  }, [cameraTransform, facingMode, label, onToast, stopCamera]);

  const applyHardwareZoom = useCallback(async (zoom) => {
    if (!cameraCapabilities.zoom) return;
    const [track] = streamRef.current?.getVideoTracks?.() || [];
    if (!track?.applyConstraints) return;
    const nextZoom = Math.max(cameraCapabilities.zoomMin, Math.min(cameraCapabilities.zoomMax, zoom));
    try {
      await track.applyConstraints({ advanced: [{ zoom: nextZoom }] });
      setZoomMode(roundRetakeZoom(nextZoom));
    } catch (err) {
      console.warn(`[${label}] Hardware zoom unavailable:`, err);
    }
  }, [cameraCapabilities, label]);

  const warmScreenFlash = useCallback(async () => {
    if (!usesScreenFlash) return;
    clearTimeout(flashTimerRef.current);
    flashTimerRef.current = null;
    setScreenFlashActive(true);
    await delay(RETAKE_CAMERA_FLASH_WARMUP_MS);
  }, [usesScreenFlash]);

  const releaseScreenFlash = useCallback(() => {
    clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => {
      setScreenFlashActive(false);
      flashTimerRef.current = null;
    }, RETAKE_CAMERA_FLASH_FADE_MS);
  }, []);

  const capturePhoto = useCallback(async () => {
    const size = getCanvasSize?.() || { width: 414, height: 736 };
    await warmScreenFlash();
    try {
      const url = await captureRetakeCameraPhoto({
        video: videoRef.current,
        width: size.width,
        height: size.height,
        transform: cameraTransform.transformRef.current,
      });
      releaseScreenFlash();
      setPhotoUrl(url);
      revokeVideoUrl();
      setVideoUrl('');
      videoBlobRef.current = null;
      setMode(RETAKE_CAMERA_MODE.PHOTO);
      stopCamera();
      // The captured frame already has the live-camera transform baked in, so
      // reset the transform here. The user can now apply a *new* pan/zoom on
      // the review screen which will be composed in at save time.
      cameraTransform.reset(false);
      onToast?.('Add stickers, text, or draw');
    } catch (err) {
      releaseScreenFlash();
      console.warn(`[${label}] Photo capture failed:`, err);
      onToast?.('Camera is still warming up');
    }
  }, [cameraTransform.transformRef, getCanvasSize, label, onToast, releaseScreenFlash, revokeVideoUrl, stopCamera, warmScreenFlash]);

  const usePhotoFile = useCallback((file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPhotoUrl(url);
    revokeVideoUrl();
    setVideoUrl('');
    videoBlobRef.current = null;
    setMode(RETAKE_CAMERA_MODE.PHOTO);
    stopCamera();
    // Gallery imports start from a fresh transform so the user can pan/zoom
    // the photo into place. Avoid inheriting any prior live-camera zoom.
    cameraTransform.reset(false);
    onToast?.('Pinch to zoom or drag to position');
  }, [cameraTransform, onToast, revokeVideoUrl, stopCamera]);

  const stopRecording = useCallback(() => {
    clearTimeout(recordStopTimerRef.current);
    if (recordingStartingRef.current && !recorderRef.current) {
      pendingStopRef.current = true;
      return;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') recorder.stop();
  }, []);

  const startRecording = useCallback(async () => {
    const video = videoRef.current;
    if (recordingRef.current || recordingStartingRef.current) return;
    if (!video || video.readyState < 2) {
      onToast?.('Camera is still warming up');
      return;
    }
    if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
      onToast?.('Video recording is not supported here');
      return;
    }

    recordingStartingRef.current = true;
    pendingStopRef.current = false;
    recordChunksRef.current = [];

    try {
      const size = getCanvasSize?.() || { width: 414, height: 736 };
      const recordCanvas = document.createElement('canvas');
      recordCanvas.width = size.width;
      recordCanvas.height = size.height;
      const recordCtx = recordCanvas.getContext('2d');
      const stream = recordCanvas.captureStream(30);
      const mimeType = chooseRetakeVideoMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;

      const drawFrame = () => {
        drawMediaCoverWithTransform(recordCtx, video, size.width, size.height, cameraTransform.transformRef.current);
        recordRafRef.current = requestAnimationFrame(drawFrame);
      };

      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) recordChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        cancelAnimationFrame(recordRafRef.current);
        clearTimeout(recordStopTimerRef.current);
        stream.getTracks().forEach(track => track.stop());
        const blobType = recorder.mimeType || mimeType || 'video/webm';
        const blob = new Blob(recordChunksRef.current, { type: blobType });
        videoBlobRef.current = blob;
        revokeVideoUrl();
        const url = URL.createObjectURL(blob);
        videoObjectUrlRef.current = url;
        setVideoUrl(url);
        setPhotoUrl('');
        setMode(RETAKE_CAMERA_MODE.VIDEO);
        setRecording(false);
        setRecordingProgress(1);
        recordingRef.current = false;
        recorderRef.current = null;
        recordingStartingRef.current = false;
        stopCamera();
        onToast?.('Video ready');
      };

      drawFrame();
      recorder.start();
      recordingRef.current = true;
      recordStartedAtRef.current = performance.now();
      setRecordingProgress(1);
      setRecording(true);
      recordStopTimerRef.current = setTimeout(stopRecording, RETAKE_CAMERA_MAX_RECORD_MS);
    } catch (err) {
      console.warn(`[${label}] Recording failed:`, err);
      setRecording(false);
      setRecordingProgress(1);
      recordingRef.current = false;
      recorderRef.current = null;
      onToast?.('Could not start video recording');
    } finally {
      recordingStartingRef.current = false;
      if (pendingStopRef.current) {
        pendingStopRef.current = false;
        setTimeout(stopRecording, 300);
      }
    }
  }, [cameraTransform.transformRef, getCanvasSize, label, onToast, revokeVideoUrl, stopCamera, stopRecording]);

  const startTimedAction = useCallback((actionMode, action) => {
    cancelCountdown();
    if (!timerSeconds) {
      action();
      return;
    }

    countdownModeRef.current = actionMode;
    let remaining = timerSeconds;
    setCountdownValue(remaining);
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) {
        countdownTimersRef.current = [];
        countdownModeRef.current = null;
        setCountdownValue(null);
        action();
        return;
      }
      setCountdownValue(remaining);
      countdownTimersRef.current = [setTimeout(tick, 1000)];
    };
    countdownTimersRef.current = [setTimeout(tick, 1000)];
  }, [cancelCountdown, timerSeconds]);

  const flipCamera = useCallback(async () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    cameraTransform.setMirror(next === 'user');
    setFlashEnabled(false);
    setScreenFlashActive(false);
    await startCamera(next);
  }, [cameraTransform, facingMode, startCamera]);

  const handlePointerDown = useCallback((e) => {
    if (mode !== RETAKE_CAMERA_MODE.LIVE) return;
    e.preventDefault();
    if (e.isPrimary === false) {
      cameraTransform.handlePointerDown(e);
      pointerMovedRef.current = true;
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      return;
    }
    if (Date.now() - lastTapAtRef.current < RETAKE_CAMERA_DOUBLE_TAP_MS) {
      clearTimeout(tapCaptureTimerRef.current);
      tapCaptureTimerRef.current = null;
    }
    cameraTransform.handlePointerDown(e);
    pointerMovedRef.current = false;
    pointerDownRef.current = true;
    pointerIdRef.current = e.pointerId;
    safelySetPointerCapture(e.currentTarget, e.pointerId);
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      if (!pointerDownRef.current) return;
      startTimedAction('video', startRecording);
    }, RETAKE_CAMERA_LONG_PRESS_MS);
  }, [cameraTransform, mode, startRecording, startTimedAction]);

  const handlePointerMove = useCallback((e) => {
    if (mode !== RETAKE_CAMERA_MODE.LIVE || recordingRef.current || recordingStartingRef.current) return;
    const moved = cameraTransform.handlePointerMove(e);
    if (!moved) return;
    pointerMovedRef.current = true;
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }, [cameraTransform, mode]);

  const handlePointerUp = useCallback(async (e) => {
    if (mode !== RETAKE_CAMERA_MODE.LIVE) return;
    e.preventDefault();
    const movedCamera = cameraTransform.handlePointerUp(e) || pointerMovedRef.current;
    if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) {
      pointerMovedRef.current = movedCamera;
      return;
    }
    safelyReleasePointerCapture(e.currentTarget, e.pointerId);
    const shouldCapturePhoto = !!longPressTimerRef.current;
    pointerDownRef.current = false;
    pointerIdRef.current = null;
    pointerMovedRef.current = false;
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;

    if (recordingRef.current || recordingStartingRef.current) {
      stopRecording();
      return;
    }
    if (countdownModeRef.current === 'video') {
      cancelCountdown();
      return;
    }
    if (!shouldCapturePhoto || movedCamera) return;

    clearTimeout(tapCaptureTimerRef.current);
    tapCaptureTimerRef.current = null;
    lastTapAtRef.current = 0;
    startTimedAction('photo', capturePhoto);
  }, [cameraTransform, cancelCountdown, capturePhoto, mode, startTimedAction, stopRecording]);

  const handlePointerCancel = useCallback((e) => {
    if (mode !== RETAKE_CAMERA_MODE.LIVE) return;
    e.preventDefault();
    cameraTransform.handlePointerUp(e);
    pointerDownRef.current = false;
    pointerIdRef.current = null;
    pointerMovedRef.current = false;
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    if (countdownModeRef.current === 'video') cancelCountdown();
    if (recordingRef.current || recordingStartingRef.current) stopRecording();
  }, [cameraTransform, cancelCountdown, mode, stopRecording]);

  const isTransformableMode = (m) => (
    m === RETAKE_CAMERA_MODE.LIVE || m === RETAKE_CAMERA_MODE.PHOTO
  );

  const handlePreviewPointerDown = useCallback((e) => {
    if (!isTransformableMode(mode)) return;
    e.preventDefault();
    cameraTransform.handlePointerDown(e);
    pointerMovedRef.current = e.isPrimary === false;
    pointerDownRef.current = true;
    pointerIdRef.current = e.pointerId;
    safelySetPointerCapture(e.currentTarget, e.pointerId);
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }, [cameraTransform, mode]);

  const handlePreviewPointerMove = useCallback((e) => {
    if (!isTransformableMode(mode)) return;
    if (mode === RETAKE_CAMERA_MODE.LIVE && (recordingRef.current || recordingStartingRef.current)) return;
    const moved = cameraTransform.handlePointerMove(e);
    if (moved) pointerMovedRef.current = true;
  }, [cameraTransform, mode]);

  const handlePreviewPointerUp = useCallback(async (e) => {
    if (!isTransformableMode(mode)) return;
    e.preventDefault();
    const movedCamera = cameraTransform.handlePointerUp(e) || pointerMovedRef.current;
    if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) {
      pointerMovedRef.current = movedCamera;
      return;
    }
    safelyReleasePointerCapture(e.currentTarget, e.pointerId);
    pointerDownRef.current = false;
    pointerIdRef.current = null;
    pointerMovedRef.current = false;
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;

    // Double-tap-to-flip only makes sense while the live camera is showing.
    if (mode !== RETAKE_CAMERA_MODE.LIVE) {
      lastPreviewTapAtRef.current = 0;
      return;
    }

    if (movedCamera || recordingRef.current || recordingStartingRef.current || countdownModeRef.current) {
      lastPreviewTapAtRef.current = 0;
      return;
    }

    const now = Date.now();
    if (now - lastPreviewTapAtRef.current < RETAKE_CAMERA_DOUBLE_TAP_MS) {
      lastPreviewTapAtRef.current = 0;
      await flipCamera();
      return;
    }
    lastPreviewTapAtRef.current = now;
  }, [cameraTransform, flipCamera, mode]);

  const handlePreviewPointerCancel = useCallback((e) => {
    if (!isTransformableMode(mode)) return;
    e.preventDefault();
    cameraTransform.handlePointerUp(e);
    pointerDownRef.current = false;
    pointerIdRef.current = null;
    pointerMovedRef.current = false;
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }, [cameraTransform, mode]);

  const enterLive = useCallback(async () => {
    cancelCountdown();
    clearTimeout(tapCaptureTimerRef.current);
    tapCaptureTimerRef.current = null;
    lastTapAtRef.current = 0;
    lastPreviewTapAtRef.current = 0;
    setPhotoUrl('');
    revokeVideoUrl();
    setVideoUrl('');
    videoBlobRef.current = null;
    setMode(RETAKE_CAMERA_MODE.LIVE);
    setFlashEnabled(false);
    setZoomMode(1);
    cameraTransform.reset(facingMode === 'user');
    await delay(80);
    return startCamera();
  }, [cameraTransform, cancelCountdown, facingMode, revokeVideoUrl, startCamera]);

  const returnToLive = useCallback(async () => {
    stopRecording();
    stopCamera();
    setRecording(false);
    setRecordingProgress(1);
    recordingRef.current = false;
    return enterLive();
  }, [enterLive, stopCamera, stopRecording]);

  const toggleTimer = useCallback(() => {
    const index = RETAKE_CAMERA_TIMER_STEPS.indexOf(timerSeconds);
    const next = RETAKE_CAMERA_TIMER_STEPS[(index + 1) % RETAKE_CAMERA_TIMER_STEPS.length];
    setTimerSeconds(next);
    onToast?.(next ? `${next}s timer` : 'Timer off');
  }, [onToast, timerSeconds]);

  const toggleFlash = useCallback(async () => {
    if (!cameraReady) return;
    const [track] = streamRef.current?.getVideoTracks?.() || [];
    const next = !flashEnabled;
    if (usesHardwareTorch && track?.applyConstraints) {
      try {
        await track.applyConstraints({ advanced: [{ torch: next }] });
      } catch (err) {
        console.warn(`[${label}] Torch unavailable, using screen flash:`, err);
        setCameraCapabilities(prev => ({ ...prev, torch: false }));
        onToast?.('Using screen flash');
      }
    }
    setFlashEnabled(next);
    if (!next) setScreenFlashActive(false);
  }, [cameraReady, flashEnabled, label, onToast, usesHardwareTorch]);

  useEffect(() => {
    if (!recording) {
      setRecordingProgress(1);
      return undefined;
    }
    let rafId = 0;
    const tick = () => {
      const elapsed = performance.now() - recordStartedAtRef.current;
      const progress = Math.max(0, 1 - (elapsed / RETAKE_CAMERA_MAX_RECORD_MS));
      setRecordingProgress(progress);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [recording]);

  useEffect(() => () => {
    stopRecording();
    stopCamera();
    revokeVideoUrl();
    clearTimeout(longPressTimerRef.current);
    clearTimeout(tapCaptureTimerRef.current);
    clearTimeout(flashTimerRef.current);
    clearTimeout(recordStopTimerRef.current);
    countdownTimersRef.current.forEach(timer => clearTimeout(timer));
    cancelAnimationFrame(recordRafRef.current);
  }, [revokeVideoUrl, stopCamera, stopRecording]);

  return {
    mode,
    setMode,
    live: mode === RETAKE_CAMERA_MODE.LIVE,
    photoReview: mode === RETAKE_CAMERA_MODE.PHOTO,
    videoReview: mode === RETAKE_CAMERA_MODE.VIDEO,
    review: mode === RETAKE_CAMERA_MODE.PHOTO || mode === RETAKE_CAMERA_MODE.VIDEO,
    videoRef,
    photoUrl,
    videoUrl,
    videoBlobRef,
    recording,
    recordingProgress,
    cameraReady,
    cameraIssue,
    cameraStyle: cameraTransform.style,
    cameraTransformRef: cameraTransform.transformRef,
    flashEnabled,
    screenFlashActive,
    usesScreenFlash,
    timerSeconds,
    zoomMode,
    zoomOptions,
    countdownValue,
    captureBusy: recording || countdownValue !== null,
    enterLive,
    returnToLive,
    usePhotoFile,
    startCamera,
    stopCamera,
    stopRecording,
    flipCamera,
    toggleTimer,
    toggleFlash,
    setZoom: applyHardwareZoom,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handlePreviewPointerDown,
    handlePreviewPointerMove,
    handlePreviewPointerUp,
    handlePreviewPointerCancel,
  };
}
