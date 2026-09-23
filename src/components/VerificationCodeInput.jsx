import React, { useEffect, useId, useRef, useState } from 'react';
import './AccountSecurity.css';

// One native input preserves autofill, pasting and keyboard editing.
// The six decorative cells are hidden from assistive technology.
export default function VerificationCodeInput({ value, onChange, disabled, invalid, autoFocus = true }) {
  const id = useId();
  const input = useRef(null);
  const [focused, setFocused] = useState(false);
  const [position, setPosition] = useState(0);
  useEffect(() => { if (autoFocus && !disabled) input.current?.focus(); }, [autoFocus, disabled]);
  const update = (text) => onChange(text.replace(/\D/g, '').slice(0, 6));
  return <div className="security-code">
    <label htmlFor={id} className="security-label">Код из письма <span>6 цифр</span></label>
    <div className={`security-code-control${focused ? ' is-focused' : ''}${invalid ? ' is-invalid' : ''}${disabled ? ' is-disabled' : ''}`}>
      <div className="security-code-cells" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => <span key={index} className={`security-code-cell${value[index] ? ' is-filled' : ''}${focused && index === Math.min(position, 5) ? ' is-current' : ''}`}>
          {value[index] || <span className="security-code-dot" />}
        </span>)}
      </div>
      <input ref={input} id={id} name="verification-code" className="security-code-native" type="text"
        autoFocus={autoFocus} required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}"
        maxLength={6} value={value} disabled={disabled} aria-invalid={invalid || undefined}
        onChange={(event) => update(event.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onSelect={(event) => setPosition(event.target.selectionStart ?? 0)}
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const next = Math.max(0, Math.min(value.length, Math.floor((event.clientX - bounds.left) / (bounds.width / 6))));
          event.currentTarget.setSelectionRange(next, next); setPosition(next);
        }}
        onPaste={(event) => {
          event.preventDefault(); update(event.clipboardData.getData('text'));
          requestAnimationFrame(() => {
            const next = input.current?.value.length || 0;
            input.current?.setSelectionRange(next, next); setPosition(next);
          });
        }} />
    </div>
  </div>;
}
