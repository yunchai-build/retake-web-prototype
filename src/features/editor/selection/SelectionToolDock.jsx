import React from 'react';
import SolidIconButton from '../../../components/ui/SolidIconButton.jsx';

const TOOL_ITEMS = [
  { key: 'selectAll', icon: 'magicPen', label: 'Select all' },
  { key: 'add', icon: 'draw', label: 'Add' },
  { key: 'erase', icon: 'eraser', label: 'Erase' },
];

const METHOD_ITEMS = [
  { key: 'pixel', label: 'Pixel' },
  { key: 'lasso', label: 'Lasso' },
  { key: 'shape', label: 'Shape' },
];

const SHAPE_ITEMS = [
  { key: 'circle', label: 'Circle' },
  { key: 'square', label: 'Square' },
  { key: 'star', label: 'Star' },
  { key: 'flower', label: 'Flower' },
];

function MethodIcon({ method }) {
  if (method === 'lasso') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path strokeDasharray="2 3" d="M6.2 13.5c-1.8-3 .1-6.4 4.3-7.2 4.4-.8 8 1.6 8.3 5.2.3 3.4-2.5 6.1-6.8 6.1-2.9 0-5.2-.8-6.9-2.5" />
        <path strokeDasharray="1.5 3" d="M8 15.8c1.8 1.3 4.8 1.8 7.4.6" />
      </svg>
    );
  }

  if (method === 'shape') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4.5" y="5" width="8" height="8" rx="1.8" />
        <circle cx="16.5" cy="16" r="3.6" />
      </svg>
    );
  }

  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 15.7c2.2-4.9 4.3-6.4 6.2-4.5 1.5 1.5-.6 4.7 1.3 5.5 1.9.8 3.1-3.6 5.4-4.6 1.2-.5 2.1-.2 2.7.9" />
      <path d="M6.2 18.3c2.6-1.1 5.4-.7 8.4 1.1" />
    </svg>
  );
}

function ShapeIcon({ shape }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {shape === 'circle' && <circle cx="12" cy="12" r="7" />}
      {shape === 'square' && <rect x="5" y="5" width="14" height="14" rx="2" />}
      {shape === 'star' && <path d="m12 3.8 2.2 5.1 5.5.5-4.1 3.7 1.2 5.4-4.8-2.8-4.8 2.8 1.2-5.4-4.1-3.7 5.5-.5L12 3.8Z" />}
      {shape === 'flower' && (
        <>
          <path d="M12 8.1c1.2-3.3 5-2.2 4.4 1.3 3.4-.8 4.8 2.8 1.7 4.4 2.2 2.7-.6 5.4-3.5 3.4-.8 3.4-4.7 3.4-5.4 0-2.9 2-5.7-.7-3.5-3.4-3.1-1.6-1.7-5.2 1.7-4.4C6.8 5.9 10.8 4.8 12 8.1Z" />
          <circle cx="12" cy="12.8" r="1.7" />
        </>
      )}
    </svg>
  );
}

export default function SelectionToolDock({ engine }) {
  const showMethodMenu = engine.selectionOperation === 'add' || engine.selectionOperation === 'erase';
  const operationLabel = engine.selectionOperation === 'erase' ? 'Erase' : 'Add';

  return (
    <div className="edit-selection-bottom-zone sticker-editor-bottom-zone">
      {showMethodMenu && (
        <div className="edit-selection-submenu sticker-editor-submenu" role="group" aria-label={`${operationLabel} selection methods`}>
          {METHOD_ITEMS.map(method => (
            <button
              key={method.key}
              type="button"
              className={`edit-selection-submenu-chip sticker-editor-submenu-chip${engine.selectionMethod === method.key ? ' active' : ''}`}
              aria-label={`${method.label} ${operationLabel}`}
              onClick={() => engine.selectMethod(method.key)}
            >
              <MethodIcon method={method.key} />
            </button>
          ))}
        </div>
      )}

      {showMethodMenu && engine.selectionMethod === 'shape' && (
        <div className="edit-selection-submenu edit-selection-shape-bar sticker-editor-submenu sticker-editor-shape-bar" role="group" aria-label={`${operationLabel} shape tools`}>
          {SHAPE_ITEMS.map(shape => (
            <button
              key={shape.key}
              type="button"
              className={`edit-selection-submenu-chip edit-selection-shape-chip sticker-editor-submenu-chip sticker-editor-shape-chip${engine.activeShape === shape.key ? ' active' : ''}`}
              aria-label={`${shape.label} ${operationLabel}`}
              onClick={() => engine.setActiveShape(shape.key)}
            >
              <ShapeIcon shape={shape.key} />
            </button>
          ))}
        </div>
      )}

      <nav className="edit-selection-toolbar sticker-editor-toolbar" role="toolbar" aria-label="Edit selection tools">
        {TOOL_ITEMS.map(tool => {
          const isActive = tool.key === 'selectAll'
            ? engine.selectionMethod === 'selectAll'
            : engine.selectionOperation === tool.key;
          return (
            <div
              key={tool.key}
              className={`edit-selection-tool sticker-editor-tool${isActive ? ' active' : ''}${tool.key === 'add' && engine.selectionMethod === 'pixel' ? ' pixel-mode' : ''}`}
            >
              <SolidIconButton
                className="edit-selection-tool-button sticker-editor-tool-button"
                icon={tool.icon}
                label={tool.label}
                active={isActive}
                onClick={() => engine.selectOperation(tool.key)}
              />
              <span className="edit-selection-tool-label sticker-editor-tool-label">{tool.label}</span>
            </div>
          );
        })}
      </nav>
    </div>
  );
}
