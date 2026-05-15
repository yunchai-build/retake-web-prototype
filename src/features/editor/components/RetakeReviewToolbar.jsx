import React from 'react';
import GlassSurface from '../../../components/ui/GlassSurface.jsx';
import GlassIconButton from '../../../components/ui/GlassIconButton.jsx';
import ToolbarToolButton from './ToolbarToolButton.jsx';

const TOOL_META = {
  text: { id: 'btnToolText', icon: 'text', label: 'Text', activeTool: 'text' },
  stickers: { id: 'btnToolStickers', icon: 'stickers', label: 'Stickers' },
  doodle: { id: 'btnToolDoodle', icon: 'draw', label: 'Draw', activeTool: 'doodle' },
  magicPen: { id: 'btnToolMagicPen', icon: 'magicPen', label: 'Magic Pen', activeTool: 'magicPen' },
  download: { id: 'btnToolDownload', icon: 'save', label: 'Save' },
};

const DOCK_ORDER = ['doodle', 'text', 'magicPen', 'download', 'stickers'];

export default function RetakeReviewToolbar({
  visible,
  out,
  collapsed,
  labelsExpanded,
  activeTool,
  orderedToolIds,
  onToolText,
  onToolStickers,
  onToolDoodle,
  onToolMagicPen,
  onToolDownload,
  onToggle,
  onInteraction,
  onToolMouseEnter,
  onToolMouseLeave,
}) {
  const handlers = {
    text: onToolText,
    stickers: onToolStickers,
    doodle: onToolDoodle,
    magicPen: onToolMagicPen,
    download: onToolDownload,
  };
  const allowedTools = new Set(orderedToolIds);
  const dockToolIds = DOCK_ORDER.filter(toolId => allowedTools.has(toolId));

  return (
    <GlassSurface
      className={`retake-review-tools${visible ? ' visible' : ''}${out ? ' out' : ''}${collapsed ? ' tools-collapsed' : ''}${labelsExpanded ? ' labels-expanded' : ''}`}
      onPointerDown={onInteraction}
      onFocus={onInteraction}
    >
      {dockToolIds.map((toolId) => {
        const meta = TOOL_META[toolId];
        if (!meta) return null;

        return (
          <ToolbarToolButton
            key={toolId}
            toolId={toolId}
            {...meta}
            active={meta.activeTool === activeTool}
            hidden={collapsed && ['magicPen', 'download'].includes(toolId)}
            onClick={handlers[toolId]}
            onMouseEnter={onToolMouseEnter}
            onMouseLeave={onToolMouseLeave}
          />
        );
      })}

      <GlassIconButton
        contained={false}
        icon="plus"
        label="Toggle toolbar"
        className="s6-tools-chevron"
        onClick={onToggle}
      />
    </GlassSurface>
  );
}
