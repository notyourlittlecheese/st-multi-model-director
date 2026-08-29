import { addDebugEntry } from '../state/debug-log.js';

export function getConnectionProfiles(context) {
  const manager = context?.extensionSettings?.connectionManager;
  const profiles = Array.isArray(manager?.profiles) ? manager.profiles : [];
  return profiles.map((profile) => ({
    id: profile.id,
    name: profile.name || profile.id,
    api: profile.api || '',
    model: profile.model || '',
    mode: profile.mode || '',
    preset: profile.preset || '',
  }));
}

export function getModelCandidates(context) {
  const profiles = getConnectionProfiles(context);
  const candidates = new Set();
  for (const profile of profiles) {
    if (profile.model) candidates.add(profile.model);
  }
  try {
    $('select option').each((_, option) => {
      const value = String(option.value || option.textContent || '').trim();
      if (looksLikeModelName(value)) candidates.add(value);
    });
  } catch (_) {
    // DOM scan is best-effort only.
  }
  return Array.from(candidates).sort((a, b) => a.localeCompare(b));
}

export function checkConnectionProfile(context, profileId, label, modelOverride = '') {
  if (!profileId) throw new Error(`${label} profile is not selected`);
  const service = context?.ConnectionManagerRequestService;
  if (!service) throw new Error('ConnectionManagerRequestService is not available');
  const effectiveModel = String(modelOverride || '').trim();

  const profile = service.getProfile?.(profileId);
  if (!profile) throw new Error(`${label} profile could not be resolved`);
  const resolved = {
    profileId,
    profileName: profile?.name || '',
    api: profile?.api || '',
    model: profile?.model || '',
    modelOverride: effectiveModel,
    effectiveModel: effectiveModel || profile?.model || '',
    mode: profile?.mode || '',
    preset: profile?.preset || '',
    supported: service.isProfileSupported?.(profile) ?? null,
    requestSent: false,
  };

  addDebugEntry('connection_profile_checked', {
    label,
    ...resolved,
  });

  return resolved;
}

function looksLikeModelName(value) {
  if (!value || value.length < 3 || value.length > 120) return false;
  return /(?:gpt|claude|gemini|llama|mistral|qwen|deepseek|yi|glm|sonnet|opus|haiku|flash|pro|turbo|kimi|doubao|ernie)/i.test(value);
}
