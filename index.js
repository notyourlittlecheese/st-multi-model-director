import {
  event_types,
  eventSource,
} from '../../../../script.js';

import {
  getContext,
} from '../../../../scripts/extensions.js';

import { loadSettings, settings } from './src/settings.js';
import { clearScenePacket, setScenePacket } from './src/core/scene-packet-manager.js';
import { normalizeGenerationTurn } from './src/core/turn-normalizer.js';
import { routeTurn } from './src/core/router.js';
import { addDebugEntry } from './src/state/debug-log.js';
import { mountSettings, refreshProfileSelects } from './src/ui/settings-ui.js';

let rawLastUserMessage = '';

jQuery(async () => {
  const context = getContext();
  loadSettings(context);
  await mountSettings(context);
  registerEvents();
  window.stMultiModelDirectorInterceptor = stMultiModelDirectorInterceptor;
  addDebugEntry('extension_loaded', { version: '0.1.6-a' });
});

export async function stMultiModelDirectorInterceptor(chat, contextSize, abort, type) {
  await clearScenePacket('interceptor_entry');

  const trace = {
    contextSize,
    enabled: settings.enabled,
    manualPacketEnabled: settings.manualPacketEnabled,
    generationTypeRaw: type ?? 'normal',
  };

  if (!settings.enabled) {
    addDebugEntry('interceptor_skipped', { ...trace, reason: 'disabled' });
    return;
  }

  try {
    const turn = normalizeGenerationTurn(chat || [], type, {}, rawLastUserMessage);
    const routing = routeTurn(turn);
    const shouldSkip = ['background', 'impersonation'].includes(turn.userTurnMode);

    addDebugEntry('turn_trace', {
      ...trace,
      generation: {
        generationType: turn.generationType,
        userTurnMode: turn.userTurnMode,
        isFreshUserTurn: turn.isFreshUserTurn,
        indexes: turn.indexes,
        targetAssistantMessage: turn.targetAssistantMessage,
      },
      routing,
      agents: {
        gemini: 'not_implemented_v0.1A',
        limiter: 'not_implemented_v0.1A',
        validator: 'disabled_v0.1A',
        semanticRepetition: 'not_implemented_v0.1A',
      },
    });

    if (shouldSkip) {
      await clearScenePacket(`skip_${turn.userTurnMode}`);
      return;
    }

    if (settings.manualPacketEnabled) {
      await setScenePacket(settings.manualPacket, 'manual_v0.1A');
    }
  } catch (error) {
    await clearScenePacket('interceptor_error');
    addDebugEntry('interceptor_error', { error: error?.message || String(error) });
  }
}

function registerEvents() {
  onEvent('MESSAGE_SENT', onMessageSent);
  onEvent('CHAT_CHANGED', () => clearScenePacket('chat_changed'));
  onEvent('GENERATION_ENDED', () => clearScenePacket('generation_ended'));
  onEvent('GENERATION_STOPPED', () => clearScenePacket('generation_stopped'));
  onEvent('CONNECTION_PROFILE_LOADED', () => {
    refreshProfileSelects();
    addDebugEntry('connection_profile_loaded');
  });
}

function onEvent(name, handler) {
  const event = event_types?.[name];
  if (!event) {
    addDebugEntry('event_not_available', { name });
    return;
  }
  eventSource.on(event, handler);
}

function onMessageSent(messageId) {
  try {
    const context = getContext();
    const message = context.chat?.[messageId];
    rawLastUserMessage = message?.is_user ? String(message.mes || '') : '';
    addDebugEntry('message_sent', {
      messageId,
      isUser: Boolean(message?.is_user),
      length: rawLastUserMessage.length,
    });
  } catch (error) {
    addDebugEntry('message_sent_read_failed', { error: error?.message || String(error) });
  }
}
