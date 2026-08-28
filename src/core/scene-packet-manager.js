import {
  extension_prompt_types,
  getExtensionPromptRoleByName,
  setExtensionPrompt,
} from '../../../../../../script.js';

import { settings } from '../settings.js';
import { addDebugEntry } from '../state/debug-log.js';

export const SCENE_PACKET_KEY = 'st_multi_model_director_scene_packet';

export async function clearScenePacket(reason = 'manual') {
  const role = resolveRole(settings.injectionRole);
  const depth = resolveDepth(settings.injectionDepth);
  await setExtensionPrompt(SCENE_PACKET_KEY, '', extension_prompt_types.IN_CHAT, depth, false, role);
  addDebugEntry('scene_packet_cleared', { reason, depth, roleName: settings.injectionRole });
}

export async function setScenePacket(packet, reason = 'manual_test') {
  const text = String(packet || '').trim();
  if (!text) {
    await clearScenePacket('empty_packet');
    return false;
  }
  const role = resolveRole(settings.injectionRole);
  const depth = resolveDepth(settings.injectionDepth);
  await setExtensionPrompt(SCENE_PACKET_KEY, text, extension_prompt_types.IN_CHAT, depth, false, role);
  addDebugEntry('scene_packet_injected', {
    reason,
    depth,
    roleName: settings.injectionRole,
    length: text.length,
    preview: text.slice(0, 500),
  });
  return true;
}

function resolveDepth(value) {
  return Math.max(0, Number(value) || 0);
}

function resolveRole(value) {
  try {
    return getExtensionPromptRoleByName(String(value || 'system'));
  } catch (_) {
    return 0;
  }
}
