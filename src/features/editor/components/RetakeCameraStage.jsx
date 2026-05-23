import React from 'react';
import { RETAKE_CAMERA_MODE } from '../utils/retakeCamera.js';

export default function RetakeCameraStage({
  mode,
  recording,
  videoRef,
  cameraStyle,
  cameraReady,
  cameraIssue,
  photoUrl,
  videoUrl,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}) {
  if (!mode) return null;

  const isLive = mode === RETAKE_CAMERA_MODE.LIVE;
  const isPhotoReview = mode === RETAKE_CAMERA_MODE.PHOTO;
  const isVideoReview = mode === RETAKE_CAMERA_MODE.VIDEO;

  return (
    <div
      className={`retake-camera-media-layer retake-camera-media-layer--${mode}${recording ? ' is-recording' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {isLive && (
        <>
          <video
            className="retake-camera-video"
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={cameraStyle}
          />
          {!cameraReady && (
            <div className="retake-camera-fallback">
              {cameraIssue || 'Camera preview'}
            </div>
          )}
        </>
      )}
      {isPhotoReview && photoUrl && (
        <img
          className="retake-captured-photo"
          src={photoUrl}
          alt=""
          draggable="false"
          style={cameraStyle}
        />
      )}
      {isVideoReview && videoUrl && (
        <video
          className="retake-review-video"
          src={videoUrl}
          autoPlay
          loop
          muted
          playsInline
        />
      )}
    </div>
  );
}
