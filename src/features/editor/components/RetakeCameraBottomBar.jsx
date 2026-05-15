import React from 'react';
import GlassIconButton from '../../../components/ui/GlassIconButton.jsx';
import GlassSurface from '../../../components/ui/GlassSurface.jsx';
import SolidIconButton from '../../../components/ui/SolidIconButton.jsx';
import ToolIcon from '../../../components/icons/ToolIcon.jsx';

export default function RetakeCameraBottomBar({
  visible,
  out,
  review,
  title,
  titleLabel = 'Frame name',
  leftIcon = 'arrowLeft',
  leftLabel,
  onLeft,
  onTitle,
  secondaryIcon = 'library',
  secondaryLabel = 'Saved frames',
  onSecondary,
  primaryIcon = 'share',
  primaryLabel,
  primaryText,
  primaryAvatar,
  primaryVariant = 'default',
  primaryBusy = false,
  onPrimary,
  showLeft = true,
  showSecondary = true,
  showPrimary = true,
  hideTitle = false,
  glassControls = false,
  className = '',
}) {
  if (!visible) return null;

  const ActionButton = glassControls ? GlassIconButton : SolidIconButton;
  const hasPrimaryAvatar = Boolean(primaryAvatar);
  const primaryAvatarSrc = primaryAvatar?.src;
  const primaryAvatarIcon = primaryAvatar?.icon;
  const primaryAvatarText = primaryAvatar?.avatarText || primaryAvatar?.text;
  const primaryAvatarBadgeText = primaryAvatar?.badgeText;
  const classes = [
    'retake-camera-bottom-bar',
    primaryVariant && primaryVariant !== 'default' ? `retake-camera-bottom-bar--${primaryVariant}` : '',
    className,
    'visible',
    out ? ' out' : '',
  ].filter(Boolean).join(' ');

  return (
    <GlassSurface className={classes}>
      {showLeft && (
        <ActionButton
          className={review ? 'retake-camera-retake-btn' : 'retake-camera-circle-btn'}
          icon={leftIcon}
          label={leftLabel}
          shape={review ? 'pill' : 'circle'}
          onClick={onLeft}
        >
          {review ? <span className="retake-camera-retake-label">Retake</span> : null}
        </ActionButton>
      )}
      {!hideTitle && (
        <button
          type="button"
          className="retake-camera-title-btn"
          aria-label={titleLabel}
          onClick={onTitle}
        >
          <span className="retake-camera-title-text">{title}</span>
        </button>
      )}
      {(showSecondary || showPrimary) && (
        <div className="retake-camera-bottom-actions">
          {showSecondary && (
            <ActionButton
              className="retake-camera-circle-btn"
              icon={secondaryIcon}
              label={secondaryLabel}
              onClick={onSecondary}
            />
          )}
          {showPrimary && (
            <ActionButton
              className={`retake-camera-primary-btn${primaryAvatar ? ' has-primary-avatar' : ''}${primaryBusy ? ' is-primary-busy' : ''}`}
              icon={primaryIcon}
              label={primaryLabel}
              onClick={onPrimary}
              disabled={primaryBusy}
              aria-busy={primaryBusy ? 'true' : undefined}
              shape={(primaryText || hasPrimaryAvatar) ? 'pill' : 'circle'}
            >
              {hasPrimaryAvatar ? (
                <span className="retake-camera-primary-avatar-set" aria-hidden="true">
                  {(primaryAvatarSrc || primaryAvatarIcon || primaryAvatar?.showPlaceholder) ? (
                    <span className={`retake-camera-primary-avatar retake-camera-primary-avatar--${primaryAvatarSrc ? 'image' : primaryAvatarIcon ? 'icon' : 'placeholder'}`}>
                      {primaryAvatarSrc ? (
                        <img src={primaryAvatarSrc} alt="" draggable="false" />
                      ) : primaryAvatarIcon ? (
                        <ToolIcon type={primaryAvatarIcon} />
                      ) : (
                        <span>{primaryAvatarText}</span>
                      )}
                    </span>
                  ) : null}
                  {primaryAvatarBadgeText ? (
                    <span className="retake-camera-primary-avatar retake-camera-primary-avatar--badge">
                      <span>{primaryAvatarBadgeText}</span>
                    </span>
                  ) : null}
                </span>
              ) : null}
              {primaryText ? <span className="retake-camera-primary-label">{primaryText}</span> : null}
            </ActionButton>
          )}
        </div>
      )}
    </GlassSurface>
  );
}
