import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatShortcut } from './ShortcutKey.jsx';

export function Tooltip({ label, shortcut, side = 'bottom', children }) {
  const [visible, setVisible] = useState(false);
  const [style, setStyle] = useState({ top: -9999, left: -9999, opacity: 0 });
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const timerRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setVisible(false);
  }, [clearTimer]);

  const show = useCallback(() => {
    if (!label) return;
    clearTimer();
    timerRef.current = setTimeout(() => {
      setVisible(true);
    }, 150);
  }, [label, clearTimer]);

  useLayoutEffect(() => {
    if (!visible || !triggerRef.current || !tooltipRef.current) return;
    const tr = triggerRef.current.getBoundingClientRect();
    const tt = tooltipRef.current.getBoundingClientRect();
    const gap = 7;
    const margin = 8;

    let placement = side;
    if (side === 'top' && tr.top - tt.height - gap < margin) placement = 'bottom';
    if (side === 'bottom' && tr.bottom + tt.height + gap > window.innerHeight - margin) {
      placement = 'top';
    }

    const top = placement === 'bottom' ? tr.bottom + gap : tr.top - tt.height - gap;
    const centeredLeft = tr.left + tr.width / 2 - tt.width / 2;
    const left = Math.max(margin, Math.min(window.innerWidth - tt.width - margin, centeredLeft));

    setStyle({ top, left, opacity: 1 });
  }, [visible, side, label, shortcut]);

  useEffect(() => {
    if (!visible) return;
    const onScrollOrResize = () => hide();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [visible, hide]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return (
    <span
      ref={triggerRef}
      className="tooltip-anchor"
      onMouseEnter={show}
      onMouseLeave={hide}
      onMouseDown={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            ref={tooltipRef}
            className="custom-tooltip"
            style={style}
            role="tooltip"
          >
            <span className="custom-tooltip-text">{label}</span>
            {shortcut && (
              <span className="custom-tooltip-shortcut">{formatShortcut(shortcut)}</span>
            )}
          </span>,
          document.body
        )}
    </span>
  );
}
