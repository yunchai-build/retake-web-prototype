import React from 'react';
import GlassSurface from '../../../components/ui/GlassSurface.jsx';
import ToolbarToolButton from '../../editor/components/ToolbarToolButton.jsx';

const INVITEE_TOOLS = [
  { id: 's6BtnText', icon: 'text', label: 'Text', handler: 'text', activeTool: 'text' },
  { id: 's6BtnStickers', icon: 'stickers', label: 'Stickers', handler: 'stickers' },
  { id: 's6BtnGalleryEdit', icon: 'photo', label: 'Photo', handler: 'gallery' },
  { id: 's6BtnPen', icon: 'draw', label: 'Draw', handler: 'draw', activeTool: 'doodle' },
  { id: 's6BtnDownload', icon: 'save', label: 'Save', handler: 'download' },
];

export default function InviteeToolbar({
  visible,
  out,
  labelsExpanded,
  activeTool,
  onText,
  onStickers,
  onGallery,
  onDraw,
  onDownload,
  onToolMouseEnter,
  onToolMouseLeave,
}) {
  const handlers = {
    text: onText,
    stickers: onStickers,
    gallery: onGallery,
    draw: onDraw,
    download: onDownload,
  };

  return (
    <GlassSurface
      className={`s6-tools${visible ? ' visible' : ''}${out ? ' out' : ''}${labelsExpanded ? ' labels-expanded' : ''}`}
      id="s6Tools"
    >
      {INVITEE_TOOLS.map(tool => (
        <ToolbarToolButton
          key={tool.id}
          id={tool.id}
          icon={tool.icon}
          label={tool.label}
          active={tool.activeTool === activeTool}
          onClick={handlers[tool.handler]}
          onMouseEnter={onToolMouseEnter}
          onMouseLeave={onToolMouseLeave}
        />
      ))}
    </GlassSurface>
  );
}
