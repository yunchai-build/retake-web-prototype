import React from 'react';
import GlassSurface from '../../../components/ui/GlassSurface.jsx';
import SolidIconButton from '../../../components/ui/SolidIconButton.jsx';
import ToolbarToolButton from '../../editor/components/ToolbarToolButton.jsx';

const TOOL_META = {
  text: { id: 'btnToolText', icon: 'text', label: 'Text', activeTool: 'text' },
  stickers: { id: 'btnToolStickers', icon: 'stickers', label: 'Stickers' },
  doodle: { id: 'btnToolDoodle', icon: 'draw', label: 'Draw', activeTool: 'doodle' },
  eraser: { id: 'btnToolEraser', icon: 'eraser', label: 'Eraser', activeTool: 'eraser' },
  download: { id: 'btnToolDownload', icon: 'save', label: 'Save' },
};

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
  onToolEraser,
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
    eraser: onToolEraser,
    download: onToolDownload,
  };

  return (
    <GlassSurface
      className={`s6-tools${visible ? ' visible' : ''}${out ? ' out' : ''}${collapsed ? ' tools-collapsed' : ''}${labelsExpanded ? ' labels-expanded' : ''}`}
      id="s6Tools"
      onPointerDown={onInteraction}
      onFocus={onInteraction}
    >
      {orderedToolIds.map((toolId, index) => {
        const meta = TOOL_META[toolId];
        if (!meta) return null;

        return (
          <ToolbarToolButton
            key={toolId}
            {...meta}
            active={meta.activeTool === activeTool}
            hidden={collapsed && index >= 2}
            onClick={handlers[toolId]}
            onMouseEnter={onToolMouseEnter}
            onMouseLeave={onToolMouseLeave}
          />
        );
      })}

      <SolidIconButton
        icon="chevron"
        label="Toggle toolbar"
        className="s6-tools-chevron"
        onClick={onToggle}
      />
    </GlassSurface>
  );
}
