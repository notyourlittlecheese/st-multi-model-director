import { clearScenePacket } from '../core/scene-packet-manager.js';
import { checkConnectionProfile, getConnectionProfiles, getModelCandidates } from '../providers/connection-manager.js';
import { clearDebugEntries, setDebugRenderCallback, addDebugEntry } from '../state/debug-log.js';
import { saveSettings, settings } from '../settings.js';

let contextRef;

export async function mountSettings(context) {
  contextRef = context;
  const extensionFolderPath = getExtensionFolderPath();
  const html = await $.get(`${extensionFolderPath}/html/settings.html`);
  const $target = $('#extensions_settings2').length ? $('#extensions_settings2') : $('#extensions_settings');
  if (!$target.length) {
    throw new Error('Could not find SillyTavern extension settings container');
  }
  $target.append(html);
  bindControls();
  refreshProfileSelects();
  renderSettings();
  setDebugRenderCallback(renderDebugTrace);
}

export function refreshProfileSelects() {
  const profiles = getConnectionProfiles(contextRef);
  const models = getModelCandidates(contextRef);
  fillProfileSelect($('#mmd_gemini_profile'), profiles, settings.profiles.gemini);
  fillProfileSelect($('#mmd_gpt_profile'), profiles, settings.profiles.gpt);
  fillProfileSelect($('#mmd_validator_profile'), profiles, settings.profiles.validator);
  fillModelSelect($('#mmd_gemini_model'), models, settings.modelOverrides.gemini);
  fillModelSelect($('#mmd_gpt_model'), models, settings.modelOverrides.gpt);
  fillModelSelect($('#mmd_validator_model'), models, settings.modelOverrides.validator);
}

function bindControls() {
  $('#mmd_enabled').on('change', async function onChange() {
    settings.enabled = Boolean(this.checked);
    saveSettings();
    addDebugEntry('setting_changed', { key: 'enabled', value: settings.enabled });
    if (!settings.enabled) await clearScenePacket('extension_disabled');
  });

  $('#mmd_manual_packet_enabled').on('change', async function onChange() {
    settings.manualPacketEnabled = Boolean(this.checked);
    saveSettings();
    addDebugEntry('setting_changed', { key: 'manualPacketEnabled', value: settings.manualPacketEnabled });
    if (!settings.manualPacketEnabled) await clearScenePacket('manual_packet_disabled');
  });

  $('#mmd_injection_depth').on('change', async function onChange() {
    settings.injectionDepth = Number(this.value) || 0;
    saveSettings();
    addDebugEntry('setting_changed', { key: 'injectionDepth', value: settings.injectionDepth });
    await clearScenePacket('injection_depth_changed');
  });

  $('#mmd_injection_role').on('change', async function onChange() {
    settings.injectionRole = String(this.value || 'system');
    saveSettings();
    addDebugEntry('setting_changed', { key: 'injectionRole', value: settings.injectionRole });
    await clearScenePacket('injection_role_changed');
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

  $('#mmd_gemini_model').on('change', function onChange() {
    settings.modelOverrides.gemini = String(this.value || '').trim();
    saveSettings();
  });

  $('#mmd_gpt_model').on('change', function onChange() {
    settings.modelOverrides.gpt = String(this.value || '').trim();
    saveSettings();
  });

  $('#mmd_validator_model').on('change', function onChange() {
    settings.modelOverrides.validator = String(this.value || '').trim();
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
    const confirmed = window.confirm('确定要清空 Multi-Model Director 的调试追踪吗？');
    if (!confirmed) return;
    clearDebugEntries();
  });

  $('#mmd_copy_debug').on('click', () => {
    copyDebugTrace();
  });

  $('#mmd_test_gemini').on('click', () => runProfileCheck('gemini', settings.profiles.gemini));
  $('#mmd_test_gpt').on('click', () => runProfileCheck('gpt', settings.profiles.gpt));
  $('#mmd_test_validator').on('click', () => runProfileCheck('validator', settings.profiles.validator));
}

function renderSettings() {
  $('#mmd_enabled').prop('checked', settings.enabled);
  $('#mmd_manual_packet_enabled').prop('checked', settings.manualPacketEnabled);
  $('#mmd_injection_depth').val(String(settings.injectionDepth));
  $('#mmd_injection_role').val(settings.injectionRole);
  $('#mmd_manual_packet').val(settings.manualPacket);
  $('#mmd_gemini_model').val(settings.modelOverrides.gemini);
  $('#mmd_gpt_model').val(settings.modelOverrides.gpt);
  $('#mmd_validator_model').val(settings.modelOverrides.validator);
}

function fillProfileSelect($select, profiles, selectedId) {
  if (!$select?.length) return;
  const options = ['<option value="">未选择</option>']
    .concat(profiles.map((profile) => {
      const model = profile.model ? ` - ${profile.model}` : '';
      const label = escapeHtml(`${profile.name} (${profile.api || 'unknown'}${profile.mode ? `/${profile.mode}` : ''}${model})`);
      return `<option value="${escapeHtml(profile.id)}">${label}</option>`;
    }));
  $select.html(options.join(''));
  $select.val(selectedId || '');
}

function fillModelSelect($select, models, selectedModel) {
  if (!$select?.length) return;
  const selected = String(selectedModel || '').trim();
  const uniqueModels = Array.from(new Set([selected, ...models].filter(Boolean)));
  const options = ['<option value="">使用连接配置里的模型</option>']
    .concat(uniqueModels.map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`));
  $select.html(options.join(''));
  $select.val(selected);
}

function runProfileCheck(label, profileId) {
  try {
    const result = checkConnectionProfile(contextRef, profileId, label, settings.modelOverrides[label]);
    const model = result.effectiveModel || '未设置模型';
    toastr?.success?.(`${label} 配置可读取：${model}`);
  } catch (error) {
    addDebugEntry('connection_profile_check_failed', { label, error: error?.message || String(error) });
    toastr?.error?.(`${label} 配置检查失败：${error?.message || error}`);
  }
}

function renderDebugTrace(entries) {
  const text = entries.map((entry) => JSON.stringify(entry, null, 2)).join('\n\n');
  $('#mmd_debug_trace').val(text);
}

async function copyDebugTrace() {
  const text = String($('#mmd_debug_trace').val() || '');
  if (!text.trim()) {
    toastr?.warning?.('调试日志为空');
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    toastr?.success?.('已复制调试日志');
  } catch (_) {
    const textarea = document.getElementById('mmd_debug_trace');
    textarea?.focus();
    textarea?.select();
    const copied = document.execCommand?.('copy');
    toastr?.[copied ? 'success' : 'error']?.(copied ? '已复制调试日志' : '复制失败，请手动长按选择');
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getExtensionFolderPath() {
  return new URL('../../', import.meta.url).pathname.replace(/^\//, '').replace(/\/+$/, '');
}
