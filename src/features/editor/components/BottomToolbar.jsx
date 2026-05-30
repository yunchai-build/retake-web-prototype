import React from 'react';
import PrimaryToolbarButton from './PrimaryToolbarButton.jsx';
import ToolbarIconButton from './ToolbarIconButton.jsx';

const TOOLBAR_ITEMS = [
  { key: 'doodle', icon: 'draw', label: 'Drawing', activeTool: 'doodle', handler: 'onDrawing' },
  { key: 'text', icon: 'text', label: 'Text', activeTool: 'text', handler: 'onText' },
  { key: 'stickers', icon: 'stickers', label: 'Sticker', activeTool: null, handler: 'onSticker', primary: true },
  { key: 'magicPen', icon: 'magicPen', label: 'Transparent pen', activeTool: 'magicPen', handler: 'onTransparentPen' },
  { key: 'more', icon: 'moreHorizontal', label: 'More', activeTool: null, handler: 'onMore' },
];

export default function BottomToolbar({
  activeTool,
  onDrawing,
  onText,
  onSticker,
  onTransparentPen,
  onMore,
}) {
  const handlers = {
    onDrawing,
    onText,
    onSticker,
    onTransparentPen,
    onMore,
  };

  return (
    <div className="bottom-toolbar" role="toolbar" aria-label="Editor tools">
      {TOOLBAR_ITEMS.map((item) => {
        const Button = item.primary ? PrimaryToolbarButton : ToolbarIconButton;
        const onClick = handlers[item.handler];

        return (
          <Button
            key={item.key}
            className={`bottom-toolbar__item bottom-toolbar__item--${item.key}`}
            icon={item.icon}
            label={item.label}
            active={item.activeTool ? activeTool === item.activeTool : false}
            onClick={onClick}
          />
        );
      })}
    </div>
  );
}
