import { useState } from 'react';

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export default function ColorPicker({ value = '#3B82F6', onChange, onAdd }) {
  const [text, setText] = useState(value.toUpperCase());
  const [isValid, setIsValid] = useState(true);

  function handleNative(e) {
    const hex = e.target.value.toUpperCase();
    setText(hex);
    setIsValid(true);
    onChange?.(hex);
  }

  function handleText(e) {
    let val = e.target.value;
    if (val && !val.startsWith('#')) val = '#' + val;
    setText(val.toUpperCase());
    if (HEX_RE.test(val)) {
      setIsValid(true);
      onChange?.(val.toUpperCase());
    } else {
      setIsValid(false);
    }
  }

  function handleAdd() {
    if (isValid && HEX_RE.test(text)) onAdd?.(text);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleAdd();
  }

  return (
    <div className="color-picker">
      <input
        type="color"
        className="color-picker-native"
        value={isValid && HEX_RE.test(text) ? text : '#000000'}
        onChange={handleNative}
        title="Open color picker"
        aria-label="Color picker"
      />
      <input
        type="text"
        className={`input mono ${isValid ? '' : 'error'}`}
        style={{ width: '112px' }}
        value={text}
        onChange={handleText}
        onKeyDown={handleKeyDown}
        placeholder="#000000"
        spellCheck="false"
        maxLength={7}
        aria-label="Hex color value"
        aria-invalid={!isValid}
      />
      {onAdd && (
        <button
          className="btn btn-primary"
          onClick={handleAdd}
          disabled={!isValid}
          aria-label="Add color to palette"
        >
          Add Color
        </button>
      )}
    </div>
  );
}
