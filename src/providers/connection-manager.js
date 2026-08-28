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

export async function testConnectionProfile(context, profileId, label) {
  if (!profileId) throw new Error(`${label} profile is not selected`);
  const service = context?.ConnectionManagerRequestService;
  if (!service) throw new Error('ConnectionManagerRequestService is not available');

  const profile = service.getProfile?.(profileId);
  const resolved = {
    profileId,
    profileName: profile?.name || '',
    api: profile?.api || '',
    model: profile?.model || '',
    mode: profile?.mode || '',
    preset: profile?.preset || '',
  };

  addDebugEntry('connection_test_started', { label, ...resolved });

  const messages = [
    {
      role: 'user',
      content: 'Reply with exactly: OK',
    },
  ];
  const started = performance.now();
  const response = await service.sendRequest(
    profileId,
    messages,
    16,
    { stream: false, extractData: true, includePreset: true },
  );
  const latencyMs = Math.round(performance.now() - started);
  const content = typeof response === 'function'
    ? '[streaming function returned]'
    : String(response?.content ?? response ?? '').trim();

  addDebugEntry('connection_test_completed', {
    label,
    latencyMs,
    content: content.slice(0, 200),
    ...resolved,
  });

  return { latencyMs, content, ...resolved };
}
