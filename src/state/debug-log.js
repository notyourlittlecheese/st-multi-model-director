import { settings } from '../settings.js';

const entries = [];
let renderCallback = null;

export function setDebugRenderCallback(callback) {
  renderCallback = callback;
  render();
}

export function addDebugEntry(kind, payload = {}) {
  const entry = {
    at: new Date().toISOString(),
    kind,
    ...payload,
  };
  entries.unshift(entry);
  const limit = Math.max(1, Number(settings.debugLimit) || 20);
  entries.splice(limit);
  console.debug('[MMD]', kind, payload);
  render();
  return entry;
}

export function clearDebugEntries() {
  entries.splice(0);
  render();
}

export function getDebugEntries() {
  return entries.slice();
}

function render() {
  if (typeof renderCallback === 'function') {
    renderCallback(getDebugEntries());
  }
}
