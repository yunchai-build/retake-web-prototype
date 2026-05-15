import { useState, useRef, useCallback, useMemo } from 'react';

export const TOOL_IDS = Object.freeze({
  TEXT: 'text',
  STICKERS: 'stickers',
  DOODLE: 'doodle',
  MAGIC_PEN: 'magicPen',
  DOWNLOAD: 'download',
});

export const ALL_TOOL_IDS = Object.freeze([
  TOOL_IDS.TEXT,
  TOOL_IDS.STICKERS,
  TOOL_IDS.DOODLE,
  TOOL_IDS.MAGIC_PEN,
  TOOL_IDS.DOWNLOAD,
]);

export const RETAKE_REVIEW_TOOL_IDS = Object.freeze([
  TOOL_IDS.TEXT,
  TOOL_IDS.STICKERS,
  TOOL_IDS.DOODLE,
  TOOL_IDS.DOWNLOAD,
]);

export function filterOrderedToolIds(orderedToolIds, allowedToolIds) {
  const allowed = new Set(allowedToolIds);
  return orderedToolIds.filter(toolId => allowed.has(toolId));
}

export function useToolbarState() {
  const [toolsCollapsed, setToolsCollapsed] = useState(true);
  const toolsCollapsedRef = useRef(true);
  const toolsCollapseTimerRef = useRef(null);

  const [labelsExpanded, setLabelsExpanded] = useState(false);
  const labelPressTimerRef = useRef(null);
  const labelCollapseTimerRef = useRef(null);

  const [recentTools, setRecentTools] = useState(['text', 'doodle']);
  const orderedToolIds = useMemo(() => {
    const recentSet = new Set(recentTools);
    const rest = ALL_TOOL_IDS.filter(id => !recentSet.has(id));
    return [...recentTools, ...rest];
  }, [recentTools]);

  const addRecentTool = useCallback((toolId) => {
    setRecentTools(prev => {
      const filtered = prev.filter(id => id !== toolId);
      return [toolId, ...filtered].slice(0, 2);
    });
  }, []);

  const scheduleIdleCollapse = useCallback(() => {
    clearTimeout(toolsCollapseTimerRef.current);
    if (toolsCollapsedRef.current) return;

    toolsCollapseTimerRef.current = setTimeout(() => {
      setToolsCollapsed(true);
      toolsCollapsedRef.current = true;
    }, 6000);
  }, []);

  const handleToggleTools = useCallback((e) => {
    e.stopPropagation();
    const nextCollapsed = !toolsCollapsedRef.current;
    clearTimeout(toolsCollapseTimerRef.current);
    setToolsCollapsed(nextCollapsed);
    toolsCollapsedRef.current = nextCollapsed;
    if (!nextCollapsed) scheduleIdleCollapse();
  }, [scheduleIdleCollapse]);

  const handleToolbarInteraction = useCallback(() => {
    scheduleIdleCollapse();
  }, [scheduleIdleCollapse]);

  const handleToolMouseEnter = useCallback(() => {
    scheduleIdleCollapse();
    clearTimeout(labelPressTimerRef.current);
    labelPressTimerRef.current = setTimeout(() => setLabelsExpanded(true), 800);
  }, [scheduleIdleCollapse]);

  const handleToolMouseLeave = useCallback(() => {
    clearTimeout(labelPressTimerRef.current);
    clearTimeout(labelCollapseTimerRef.current);
    labelCollapseTimerRef.current = setTimeout(() => setLabelsExpanded(false), 500);
  }, []);

  return {
    toolsCollapsed, setToolsCollapsed,
    toolsCollapsedRef, toolsCollapseTimerRef,
    labelsExpanded,
    orderedToolIds, addRecentTool,
    handleToggleTools, handleToolbarInteraction, handleToolMouseEnter, handleToolMouseLeave,
  };
}
