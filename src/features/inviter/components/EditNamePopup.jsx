import React from 'react';

export default function EditNamePopup({ visible, inputValue, onChange, onSave }) {
  return (
    <div className={`share-pop${visible ? ' visible' : ''}`} id="editNamePop">
      <p className="s7-pop-title">Name your frame</p>
      <div className="edit-name-field">
        <input className="edit-name-input" id="editNameInput" type="text"
          placeholder="what's this frame called?" maxLength="32"
          autoComplete="off" autoCorrect="off" spellCheck="false"
          value={inputValue}
          onChange={onChange}
          onKeyDown={e => { if (e.key === 'Enter') onSave(); }} />
      </div>
      <button className="edit-name-save" id="btnEditNameDone" onClick={onSave}>Save</button>
    </div>
  );
}
