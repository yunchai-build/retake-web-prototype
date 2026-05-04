import React from 'react';

export default function FrameCanvas({
  canvasRef,
  selectionCanvasRef,
  frameElRef,
  brushCursorRef,
  brushCursorSvgRef,
  brushCursorCircleRef,
  frameScrimVisible,
}) {
  return (
    <>
      <div id="frameContainer" ref={frameElRef}>
        <div id="checkerBg"></div>
        <canvas id="editCanvas" ref={canvasRef} width="414" height="736" className="no-tool" />
        <canvas id="selectionCanvas" ref={selectionCanvasRef} width="414" height="736" />
        <div id="brushCursor" ref={brushCursorRef}>
          <svg id="brushCursorSvg" ref={brushCursorSvgRef} viewBox="-20 -20 40 40" fill="none">
            <circle id="brushCursorCircle" ref={brushCursorCircleRef} cx="0" cy="0" r="14"
              fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.8)"
              strokeWidth="1.5" strokeDasharray="4 3" />
          </svg>
        </div>
      </div>
      <div id="frameScrim" className={frameScrimVisible ? 'visible' : ''}></div>
    </>
  );
}
