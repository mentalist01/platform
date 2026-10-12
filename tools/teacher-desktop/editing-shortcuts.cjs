'use strict';

const isPageHistoryShortcut = input => {
  if (input?.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return false;
  const key = String(input.key || '').toLowerCase();
  return ['KeyZ', 'KeyY'].includes(input.code) || ['z', 'y', 'я', 'н'].includes(key);
};

// Native Edit/Undo consumes its accelerator before the canvas or Monaco can
// handle it. Let Chromium deliver these trusted key events to the page instead;
// normal inputs keep their built-in undo and other menu shortcuts keep working.
const routeEditingShortcuts = contents => {
  const input = (_event, value) => contents.setIgnoreMenuShortcuts(isPageHistoryShortcut(value));
  const reset = () => { if (!contents.isDestroyed()) contents.setIgnoreMenuShortcuts(false); };
  const dispose = () => {
    contents.off('before-input-event', input);
    contents.off('blur', reset);
  };
  contents.on('before-input-event', input);
  contents.on('blur', reset);
  contents.once('destroyed', dispose);
  return dispose;
};

module.exports = { isPageHistoryShortcut, routeEditingShortcuts };
