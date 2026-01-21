const bus = new EventTarget();

export function emitQuickPrompt(text) {
  bus.dispatchEvent(new CustomEvent('quickPrompt', { detail: text }));
}

export function onQuickPrompt(cb) {
  const handler = (e) => cb(e.detail);
  bus.addEventListener('quickPrompt', handler);
  return () => bus.removeEventListener('quickPrompt', handler);
}
