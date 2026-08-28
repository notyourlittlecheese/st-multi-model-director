import { clearScenePacket } from '../core/scene-packet-manager.js';
import { getConnectionProfiles, testConnectionProfile } from '../providers/connection-manager.js';
import { clearDebugEntries, setDebugRenderCallback, addDebugEntry } from '../state/debug-log.js';
import { saveSettings, settings } from '../settings.js';

let contextRef;

export async function mountSettings(context) {
  contextRef = context;
  const html = await $.get(`${context.extensionFolderPath}/html/settings.html`);
  $('#extensions_settings').append(html);
  bindControls();
  refreshProfileSelects();
  renderSettings();
  setDebugRenderCallback(renderDebugTrace);
}

export function refreshProfileSelects() {
  const profiles = getConnectionProfiles(contextRef);
  fillProfileSelect($('#mmd_gemini_profile'), profiles, settings.profiles.gemini);
  fillProfileSelect($('#mmd_gpt_profile'), profiles, settings.profiles.gpt);
  fillProfileSelect($('#mmd_validator_profile'), profiles, settings.profiles.validator);
}

function bindControls() {
  $('#mmd_enabled').on('change', async function onChange() {
    settings.enabled = Boolean(this.checked);
    saveSettings();
    addDebugEntry('setting_changed', { key: 'enabled', value: settings.enabled });
    if (!settings.enabled) await clearScenePacket('extension_disabled');
  });

  $('#mmd_manual_packet_enabled').on('change', function onChange() {
    settings.manualPacketEnabled = Boolean(this.checked);
    saveSettings();
    addDebugEntry('setting_changed', { key: 'manualPacketEnabled', value: settings.manualPacketEnabled });
  });

  $('#mmd_injection_depth').on('change', function onChange() {
    settings.injectionDepth = Number(this.value) || 0;
    saveSettings();
    addDebugEntry('setting_changed', { key: 'injectionDepth', value: settings.injectionDepth });
  });

  $('#mmd_injection_role').on('change', function onChange() {
    settings.injectionRole = String(this.value || 'system');
    saveSettings();
    addDebugEntry('setting_changed', { key: 'injectionRole', value: settings.injectionRole });
  });

  $('#mmd_manual_packet').on('input', function onInput() {
    settings.manualPacket = String(this.value || '');
    saveSettings();
  });

  $('#mmd_gemini_profile').on('change', function onChange() {
    settings.profiles.gemini = String(this.value || '');
    saveSettings();
  });

  $('#mmd_gpt_profile').on('change', function onChange() {
    settings.profiles.gpt = String(this.value || '');
    saveSettings();
  });

  $('#mmd_validator_profile').on('change', function onChange() {
    settings.profiles.validator = String(this.value || '');
    saveSettings();
  });

  $('#mmd_refresh_profiles').on('click', () => {
    refreshProfileSelects();
    addDebugEntry('profiles_refreshed', { count: getConnectionProfiles(contextRef).length });
  });

  $('#mmd_clear_packet').on('click', async () => {
    await clearScenePacket('manual_button');
  });

  $('#mmd_clear_debug').on('click', () => {
    clearDebugEntries();
  });

  $('#mmd_test_gemini').on('click', () => runProfileTest('gemini', settings.profiles.gemini));
  $('#mmd_test_gpt').on('click', () => runProfileTest('gpt', settings.profiles.gpt));
  $('#mmd_test_validator').on('click', () => runProfileTest('validator', settings.profiles.validator));
}

function renderSettings() {
  $('#mmd_enabled').prop('checked', settings.enabled);
  $('#mmd_manual_packet_enabled').prop('checked', settings.manualPacketEnabled);
  $('#mmd_injection_depth').val(String(settings.injectionDepth));
  $('#mmd_injection_role').val(settings.injectionRole);
  $('#mmd_manual_packet').val(settings.manualPacket);
}

function fillProfileSelect($select, profiles, selectedId) {
  if (!$select?.length) return;
  const options = ['<option value="">Not selected</option>']
    .concat(profiles.map((profile) => {
      const label = escapeHtml(`${profile.name} (${profile.api || 'unknown'}${profile.mode ? `/${profile.mode}` : ''})`);
      return `<option value="${escapeHtml(profile.id)}">${label}</option>`;
    }));
  $select.html(options.join(''));
  $select.val(selectedId || '');
}

async function runProfileTest(label, profileId) {
  try {
    const result = await testConnectionProfile(contextRef, profileId, label);
    toastr?.success?.(`${label} profile OK (${result.latencyMs} ms)`);
  } catch (error) {
    addDebugEntry('connection_test_failed', { label, error: error?.message || String(error) });
    toastr?.error?.(`${label} profile failed: ${error?.message || error}`);
  }
}

function renderDebugTrace(entries) {
  const text = entries.map((entry) => JSON.stringify(entry, null, 2)).join('\n\n');
  $('#mmd_debug_trace').val(text);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
