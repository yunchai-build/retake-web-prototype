import { useState, useRef, useCallback } from 'react';

export const TXT_FONTS = {
  mono:  { family: "'Bedstead', monospace",                weight: '400', style: 'normal' },
  bold:  { family: "system-ui, -apple-system, sans-serif", weight: '900', style: 'normal' },
  serif: { family: "Georgia, 'Times New Roman', serif",   weight: '400', style: 'italic' },
};

export const TXT_PALETTE = ['#FFFFFF', '#1A1A2E', '#EEFF01', '#FF5C8A', '#5CE8FF', '#00FFA3'];

export function useTextTool({
  activeToolRef, setActiveTool,
  setExitBtnOut, setUndoRedoOut, setToolsOut, setBottomBarOut,
  toolsHideTimerRef, setToolsVisible,
  setTmIn,
  setToolsCollapsed, toolsCollapsedRef, toolsCollapseTimerRef,
  placeText,
}) {
  const [textToolActive, setTextToolActive] = useState(false);
  const [txtFont, setTxtFont] = useState('mono');
  const [txtColor, setTxtColor] = useState('#FFFFFF');
  const [txtSize, setTxtSize] = useState(44);
  const [txtWrapWidth, setTxtWrapWidth] = useState(280);
  const [txtOpacity, setTxtOpacity] = useState(100);
  const [txtAlign, setTxtAlign] = useState('center');
  const textPreviewRef = useRef(null);

  const enterTextTool = useCallback(() => {
    activeToolRef.current = 'text';
    setActiveTool('text');

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
      setTextToolActive(true);
      if (textPreviewRef.current) {
        textPreviewRef.current.textContent = '';
        textPreviewRef.current.focus();
      }
    }, 120);
  }, [activeToolRef, setActiveTool, setExitBtnOut, setUndoRedoOut, setToolsOut, setBottomBarOut,
      toolsHideTimerRef, setToolsVisible, setTmIn]);

  const exitTextTool = useCallback((commit = true) => {
    const preview = textPreviewRef.current;
    const txt = preview ? preview.textContent.trim() : '';

    if (preview) preview.blur();

    setTextToolActive(false);
    setTmIn(false);
    activeToolRef.current = null;
    setActiveTool(null);

    clearTimeout(toolsHideTimerRef.current);
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

    if (commit && txt) placeText(txt, txtFont, txtSize, txtColor, txtAlign, txtWrapWidth, txtOpacity / 100);
    if (preview) preview.textContent = '';
  }, [activeToolRef, setActiveTool, setTextToolActive, setTmIn,
      setExitBtnOut, setUndoRedoOut, setToolsOut, setBottomBarOut,
      toolsHideTimerRef, setToolsVisible, setToolsCollapsed, toolsCollapsedRef,
      toolsCollapseTimerRef, placeText, txtFont, txtSize, txtColor, txtAlign, txtWrapWidth, txtOpacity]);

  return {
    textToolActive,
    txtFont, setTxtFont,
    txtColor, setTxtColor,
    txtSize, setTxtSize,
    txtWrapWidth, setTxtWrapWidth,
    txtOpacity, setTxtOpacity,
    txtAlign, setTxtAlign,
    textPreviewRef,
    enterTextTool, exitTextTool,
  };
}
