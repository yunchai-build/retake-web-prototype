import React from 'react';
import GlassSurface from '../../../components/ui/GlassSurface.jsx';
import GlassIconButton from '../../../components/ui/GlassIconButton.jsx';
import ToolbarToolButton from '../../editor/components/ToolbarToolButton.jsx';

const TOOL_META = {
  text: { id: 'btnToolText', icon: 'text', label: 'Text', activeTool: 'text' },
  stickers: { id: 'btnToolStickers', icon: 'stickers', label: 'Stickers' },
  doodle: { id: 'btnToolDoodle', icon: 'draw', label: 'Draw', activeTool: 'doodle' },
  magicPen: { id: 'btnToolMagicPen', icon: 'magicPen', label: 'Magic Pen', activeTool: 'magicPen' },
  download: { id: 'btnToolDownload', icon: 'save', label: 'Save' },
  photo: { id: 'btnDockPhoto', icon: 'photo', label: 'Change photo' },
};

const DOCK_ORDER = ['doodle', 'text', 'magicPen', 'download', 'photo', 'stickers'];
const TOOL_GROUPS = [
  { id: 'marking', label: 'Marking tools', toolIds: ['doodle', 'text'] },
  { id: 'media', label: 'Media tools', toolIds: ['photo', 'stickers'] },
  { id: 'output', label: 'Advanced and save tools', toolIds: ['magicPen', 'download'] },
];

export default function VerticalToolbar({
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
  onPhoto,
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
    photo: onPhoto,
  };

  const allowedTools = new Set(orderedToolIds);
  const dockToolIds = DOCK_ORDER.filter(toolId => {
    if (toolId === 'photo') return Boolean(onPhoto);
    return allowedTools.has(toolId);
  });
  const dockTools = new Set(dockToolIds);

  const renderToolButton = (toolId) => {
    if (!dockTools.has(toolId)) return null;

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
  };

  return (
    <GlassSurface
      className={`s6-tools${visible ? ' visible' : ''}${out ? ' out' : ''}${collapsed ? ' tools-collapsed' : ''}${labelsExpanded ? ' labels-expanded' : ''}`}
      id="s6Tools"
      onPointerDown={onInteraction}
      onFocus={onInteraction}
    >
      {TOOL_GROUPS.map((group) => {
        const groupTools = group.toolIds.filter(toolId => dockTools.has(toolId));
        if (groupTools.length === 0) return null;

        return (
          <div
            key={group.id}
            className={`s6-tool-group s6-tool-group--${group.id}`}
            role="group"
            aria-label={group.label}
          >
            {groupTools.map(renderToolButton)}
          </div>
        );
      })}

      <div className="s6-tool-group s6-tool-group--toggle" role="group" aria-label="Toolbar options">
        <GlassIconButton
          contained={false}
          icon="plus"
          label="Toggle toolbar"
          className="s6-tools-chevron"
          onClick={onToggle}
        />
      </div>
    </GlassSurface>
  );
}
