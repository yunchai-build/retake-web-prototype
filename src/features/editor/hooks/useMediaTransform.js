import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  beginTransformGesture,
  clampTransform,
  pointFromClientEvent,
  updateTransformGesture,
} from '../utils/transformGesture.js';

const DEFAULT_SIZE = { width: 414, height: 736 };
// Allow generous zoom-out so background photos can shrink inside the canvas
// (Instagram-style polaroid look). The empty area is filled with the photo's
// average color by drawContainedImageWithBackground at composition time.
const MIN_SCALE = 0.3;
const MAX_SCALE = 4;

export default function useMediaTransform({
  initialMirror = false,
  width = DEFAULT_SIZE.width,
  height = DEFAULT_SIZE.height,
  minScale = MIN_SCALE,
  maxScale = MAX_SCALE,
  lockOffset = false,
  lockRotation = false,
  maxOffsetX = width * 0.85,
  maxOffsetY = height * 0.85,
} = {}) {
  const size = useMemo(() => ({ width, height }), [width, height]);
  const [transform, setTransform] = useState({
    scale: 1,
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
    mirror: initialMirror,
  });
  const transformRef = useRef(transform);
  const pendingTransformRef = useRef(transform);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const movedRef = useRef(false);
  const rafRef = useRef(0);

  const commitTransform = useCallback((next) => {
    const normalized = {
      ...next,
      rotation: lockRotation ? 0 : (next.rotation ?? 0),
      offsetX: lockOffset ? 0 : (next.offsetX ?? 0),
      offsetY: lockOffset ? 0 : (next.offsetY ?? 0),
    };
    const clamped = clampTransform(normalized, {
      minScale,
      maxScale,
      maxOffsetX: lockOffset ? 0 : maxOffsetX,
      maxOffsetY: lockOffset ? 0 : maxOffsetY,
    });
    transformRef.current = clamped;
    pendingTransformRef.current = clamped;
    if (rafRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0;
      setTransform(pendingTransformRef.current);
    });
  }, [lockOffset, lockRotation, maxOffsetX, maxOffsetY, maxScale, minScale]);

  const reset = useCallback((mirror = transformRef.current.mirror) => {
    commitTransform({ scale: 1, rotation: 0, offsetX: 0, offsetY: 0, mirror });
  }, [commitTransform]);

  const setMirror = useCallback((mirror) => {
    commitTransform({ ...transformRef.current, mirror });
  }, [commitTransform]);

  const setScale = useCallback((scale) => {
    commitTransform({ ...transformRef.current, scale });
  }, [commitTransform]);

  const setTransformPartial = useCallback((partial) => {
    commitTransform({ ...transformRef.current, ...partial });
  }, [commitTransform]);

  const startGesture = useCallback((target) => {
    const pointers = Array.from(pointersRef.current.values());
    movedRef.current = false;
    gestureRef.current = pointers.length >= 2
      ? beginTransformGesture({
        points: pointers,
        target,
        transform: transformRef.current,
        size,
      })
      : null;
  }, [size]);

  const handlePointerDown = useCallback((event) => {
    if (event.isPrimary === false && pointersRef.current.size === 0) return false;
    pointersRef.current.set(event.pointerId, pointFromClientEvent(event));
    startGesture(event.currentTarget);
    return false;
  }, [startGesture]);

  const handlePointerMove = useCallback((event) => {
    if (!pointersRef.current.has(event.pointerId)) return false;
    pointersRef.current.set(event.pointerId, pointFromClientEvent(event));
    const pointers = Array.from(pointersRef.current.values());
    const result = updateTransformGesture(gestureRef.current, pointers, {
      allowSinglePointer: false,
      minScale,
      maxScale,
      maxOffsetX: lockOffset ? 0 : maxOffsetX,
      maxOffsetY: lockOffset ? 0 : maxOffsetY,
    });
    if (!result.moved || !result.transform) return false;
    movedRef.current = true;
    commitTransform(result.transform);
    return true;
  }, [commitTransform, lockOffset, maxOffsetX, maxOffsetY, maxScale, minScale]);

  const handlePointerUp = useCallback((event) => {
    const moved = movedRef.current || pointersRef.current.size > 1;
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size > 0) startGesture(event.currentTarget);
    else gestureRef.current = null;
    return moved;
  }, [startGesture]);

  const getActivePointerCount = useCallback(() => pointersRef.current.size, []);

  const cancel = useCallback(() => {
    const moved = movedRef.current;
    pointersRef.current.clear();
    gestureRef.current = null;
    movedRef.current = false;
    return moved;
  }, []);

  const style = useMemo(() => ({
    transform: [
      `translate3d(${(transform.offsetX / width) * 100}%, ${(transform.offsetY / height) * 100}%, 0)`,
      `rotate(${transform.rotation}deg)`,
      `scale(${transform.mirror ? -transform.scale : transform.scale}, ${transform.scale})`,
    ].join(' '),
  }), [height, transform, width]);

  useEffect(() => () => {
    if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
  }, []);

  return {
    transform,
    transformRef,
    style,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    getActivePointerCount,
    cancel,
    reset,
    setMirror,
    setScale,
    setTransform: setTransformPartial,
  };
}
