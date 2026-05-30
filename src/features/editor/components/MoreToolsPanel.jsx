import React from 'react';
import IconButton from '../../../components/ui/IconButton.jsx';
import ToolButton from './ToolButton.jsx';

const MORE_TOOLS = [
  { key: 'image', icon: 'photo', label: 'Image', handler: 'onImage' },
  { key: 'camera', icon: 'camera', label: 'Camera', handler: 'onCamera' },
  { key: 'layers', icon: 'layers', label: 'Layers', handler: 'onLayers' },
  { key: 'download', icon: 'save', label: 'Download', handler: 'onDownload' },
];

export default function MoreToolsPanel({
  open,
  onClose,
  onImage,
  onCamera,
  onLayers,
  onDownload,
}) {
  const handlers = {
    onImage,
    onCamera,
    onLayers,
    onDownload,
  };

  return (
    <div className={`more-tools-panel-root${open ? ' visible' : ''}`} aria-hidden={!open}>
      <button
        type="button"
        className="more-tools-backdrop"
        aria-label="Close more tools"
        onClick={onClose}
      />

      <section
        className="more-tools-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="moreToolsTitle"
      >
        <header className="more-tools-panel__header">
          <h2 className="more-tools-panel__title" id="moreToolsTitle">More tools</h2>
          <IconButton
            className="more-tools-panel__close"
            icon="close"
            label="Close more tools"
            material="light"
            variant="plain"
            shape="circle"
            onClick={onClose}
          />
        </header>

        <div className="more-tools-panel__grid" role="group" aria-label="More editor tools">
          {MORE_TOOLS.map((tool) => (
            <ToolButton
              key={tool.key}
              className={`more-tools-panel__tool more-tools-panel__tool--${tool.key}`}
              icon={tool.icon}
              label={tool.label}
              onClick={handlers[tool.handler]}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
