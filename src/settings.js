export const MODULE_NAME = 'st_multi_model_director';

export const defaultSettings = Object.freeze({
  enabled: false,
  manualPacketEnabled: false,
  manualPacket: [
    '<scene_packet>',
    'mode: interaction',
    'note: Manual v0.1A test packet only. Do not treat this as permanent memory.',
    '</scene_packet>',
  ].join('\n'),
  injectionDepth: 1,
  injectionRole: 'system',
  profiles: {
    gemini: '',
    gpt: '',
    validator: '',
  },
  modelOverrides: {
    gemini: '',
    gpt: '',
    validator: '',
  },
  debugLimit: 20,
});

let contextRef;
export let settings = structuredClone(defaultSettings);

export function loadSettings(context) {
  contextRef = context;
  const bucket = context.extensionSettings[MODULE_NAME] || {};
  settings = mergeSettings(defaultSettings, bucket);
  context.extensionSettings[MODULE_NAME] = settings;
  return settings;
}

export function saveSettings() {
  if (!contextRef) return;
  contextRef.extensionSettings[MODULE_NAME] = settings;
  contextRef.saveSettingsDebounced?.();
}

function mergeSettings(base, override) {
  const merged = structuredClone(base);
  for (const [key, value] of Object.entries(override || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && key in merged) {
      merged[key] = { ...merged[key], ...value };
    } else {
      merged[key] = value;
    }
  }
  return merged;
}
