import React from 'react';
import { Command } from 'lucide-react';

export function detectMacOS() {
  if (typeof navigator === 'undefined') return false;
  const platform =
    navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export const isMac = detectMacOS();

export function formatShortcut(letter) {
  return isMac ? `⌘${letter}` : `Ctrl+${letter}`;
}

export function ShortcutKey({ letter }) {
  return (
    <kbd className="kbd" aria-label={formatShortcut(letter)}>
      {isMac ? (
        <Command size={11} strokeWidth={2.1} className="kbd-icon" aria-hidden="true" />
      ) : (
        <span className="kbd-mod">Ctrl</span>
      )}
      <span className="kbd-key">{letter}</span>
    </kbd>
  );
}
