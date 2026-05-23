import { useCallback, useMemo, useRef, useState } from 'react';
import {
  drawMediaCoverWithTransform,
} from '../../editor/utils/canvas.js';

/**
 * Pure step3 *camera-lifecycle* hook. Owns the live camera stream,
 * capabilities (zoom / torch / facing), screen-flash timing, and the photo
 * capture primitive. Recording, countdown, pointer gestures, blob
 * composition, and share/save flows stay in InviterPage because they cross
 * concerns with the frame editor.
 *
 * Inputs:
 *   - cameraTransform: shared `useMediaTransform` instance for pan/zoom/rotate
 *   - getCanvasSize:   () => ({ width, height })
 *   - showToast:       (message) => void  — surface camera issues to the user
 *   - timerSteps:      array of seconds for the timer cycle (display only)
 *   - constants: STEP3_DEFAULT_CAPABILITIES, STEP3_FLASH_WARMUP_MS,
 *                STEP3_FLASH_FADE_MS, STEP3_ZOOM_PRESETS,
 *                clampZoom, roundZoom, getStep3CameraIssue,
 *                requestStep3CameraStream, getStep3TrackCapabilities,
 *                logStep3CameraSettings, waitForVideoMetadata, delay
 *     (Pass everything from the caller so this hook stays decoupled from
 *      the step3 helper module's specific exports.)
 */
export default function useStep3Camera({
  cameraTransform,
  getCanvasSize,
  showToast,
  defaultCapabilities,
  flashWarmupMs,
  flashFadeMs,
  zoomPresets = [0.5, 1, 2],
  clampZoom,
  roundZoom,
  getCameraIssue,
  requestCameraStream,
  getTrackCapabilities,
  logCameraSettings,
  waitForVideoMetadata,
  delay,
}) {
  // ── Internal refs ──
  const videoRef         = useRef(null);
  const streamRef        = useRef(null);
  const flashTimerRef    = useRef(null);
  const hardwareZoomRef  = useRef(1);

  // ── State ──
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraIssue, setCameraIssue] = useState('');
  const [facingMode, setFacingMode] = useState('environment');
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [screenFlashActive, setScreenFlashActive] = useState(false);
  const [cameraCapabilities, setCameraCapabilities] = useState(defaultCapabilities);
  const [zoomMode, setZoomMode] = useState(1);

  // ── Derived ──
  const zoomOptions = useMemo(() => {
    if (!cameraCapabilities.zoom) return [];
    return zoomPresets.filter(
      z => cameraCapabilities.zoomMin <= z && cameraCapabilities.zoomMax >= z,
    );
  }, [cameraCapabilities, zoomPresets]);
  const usesHardwareTorch = facingMode === 'environment' && cameraCapabilities.torch;
  const usesScreenFlash = flashEnabled && !usesHardwareTorch;

  // ── Camera lifecycle ──
  const stopCamera = useCallback(() => {
    clearTimeout(flashTimerRef.current);
    flashTimerRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    hardwareZoomRef.current = 1;
    setCameraReady(false);
    setFlashEnabled(false);
    setScreenFlashActive(false);
    setCameraCapabilities(defaultCapabilities);
  }, [defaultCapabilities]);

  const startCamera = useCallback(async (nextFacingMode = facingMode) => {
    stopCamera();
    setCameraReady(false);
    setCameraIssue('');
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      const issue = getCameraIssue();
      setCameraIssue(issue.fallback);
      showToast?.(issue.toast);
      return false;
    }

    try {
      const stream = await requestCameraStream(nextFacingMode);
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
      const capabilities = getTrackCapabilities(track);
      let startingZoom = 1;
      if (capabilities.zoom && track?.applyConstraints) {
        startingZoom = capabilities.zoomMin;
        try {
          await track.applyConstraints({ advanced: [{ zoom: startingZoom }] });
        } catch (err) {
          console.warn('[step3] Minimum hardware zoom unavailable:', err);
          capabilities.zoom = false;
          startingZoom = 1;
        }
      }
      logCameraSettings(track, videoRef.current);
      hardwareZoomRef.current = startingZoom;
      setCameraCapabilities(capabilities);
      setZoomMode(roundZoom(startingZoom));
      cameraTransform.reset(nextFacingMode === 'user');
      setCameraIssue('');
      setCameraReady(true);
      return true;
    } catch (err) {
      console.warn('[step3] Camera unavailable:', err?.name, err?.message);
      stopCamera();
      const issue = getCameraIssue(err);
      setCameraIssue(issue.fallback);
      showToast?.(issue.toast);
      return false;
    }
  }, [
    cameraTransform,
    facingMode,
    getCameraIssue,
    getTrackCapabilities,
    logCameraSettings,
    requestCameraStream,
    roundZoom,
    showToast,
    stopCamera,
    waitForVideoMetadata,
  ]);

  const applyHardwareZoom = useCallback(async (zoom) => {
    if (!cameraCapabilities.zoom) return;
    const [track] = streamRef.current?.getVideoTracks?.() || [];
    if (!track?.applyConstraints) return;
    const nextZoom = clampZoom(zoom, cameraCapabilities.zoomMin, cameraCapabilities.zoomMax);
    try {
      await track.applyConstraints({ advanced: [{ zoom: nextZoom }] });
      hardwareZoomRef.current = nextZoom;
      setZoomMode(roundZoom(nextZoom));
    } catch (err) {
      console.warn('[step3] Hardware zoom unavailable:', err);
    }
  }, [cameraCapabilities, clampZoom, roundZoom]);

  const flipCamera = useCallback(async () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    cameraTransform.setMirror(next === 'user');
    setFlashEnabled(false);
    setScreenFlashActive(false);
    await startCamera(next);
  }, [cameraTransform, facingMode, startCamera]);

  const toggleFlash = useCallback(async () => {
    if (!cameraReady) return;
    const [track] = streamRef.current?.getVideoTracks?.() || [];
    const next = !flashEnabled;
    if (usesHardwareTorch && track?.applyConstraints) {
      try {
        await track.applyConstraints({ advanced: [{ torch: next }] });
      } catch (err) {
        console.warn('[step3] Torch unavailable, using screen flash:', err);
        setCameraCapabilities(prev => ({ ...prev, torch: false }));
        showToast?.('Using screen flash');
      }
    }
    setFlashEnabled(next);
    if (!next) setScreenFlashActive(false);
  }, [cameraReady, flashEnabled, showToast, usesHardwareTorch]);

  const warmScreenFlash = useCallback(async () => {
    if (!usesScreenFlash) return;
    clearTimeout(flashTimerRef.current);
    flashTimerRef.current = null;
    setScreenFlashActive(true);
    await delay(flashWarmupMs);
  }, [delay, flashWarmupMs, usesScreenFlash]);

  const releaseScreenFlash = useCallback(() => {
    clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => {
      setScreenFlashActive(false);
      flashTimerRef.current = null;
    }, flashFadeMs);
  }, [flashFadeMs]);

  const resetCameraTransform = useCallback(async () => {
    await applyHardwareZoom(cameraCapabilities.zoomMin);
    cameraTransform.reset(facingMode === 'user');
  }, [applyHardwareZoom, cameraCapabilities.zoomMin, cameraTransform, facingMode]);

  // Capture the current camera frame to a JPEG data URL, framed and
  // transformed to match the canvas. Caller composes the frame artwork on top.
  const capturePhoto = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) throw new Error('Camera is not ready');
    const { width, height } = getCanvasSize();
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    drawMediaCoverWithTransform(
      out.getContext('2d'),
      video,
      width,
      height,
      cameraTransform.transformRef.current,
    );
    return out.toDataURL('image/jpeg', 0.92);
  }, [cameraTransform.transformRef, getCanvasSize]);

  return {
    // Refs — exposed because pointer/recording code still lives outside.
    videoRef,
    streamRef,
    flashTimerRef,
    hardwareZoomRef,
    // State
    cameraReady,
    cameraIssue,
    facingMode,
    flashEnabled,
    screenFlashActive,
    cameraCapabilities,
    zoomMode,
    // Setters (rarely needed; expose for parity with old InviterPage code)
    setFacingMode,
    setFlashEnabled,
    setScreenFlashActive,
    setCameraCapabilities,
    setZoomMode,
    setCameraIssue,
    setCameraReady,
    // Derived
    zoomOptions,
    usesHardwareTorch,
    usesScreenFlash,
    // Actions
    startCamera,
    stopCamera,
    applyHardwareZoom,
    flipCamera,
    toggleFlash,
    warmScreenFlash,
    releaseScreenFlash,
    resetCameraTransform,
    capturePhoto,
  };
}
