const REPEAT_TYPES = new Set(['regenerate', 'swipe']);
const SKIP_TYPES = new Set(['quiet', 'impersonate']);

export function normalizeGenerationTurn(chat, type, options = {}, rawLastUserMessage = '', liveChat = []) {
  const generationType = normalizeType(type);
  const targetAssistantIndex = findTargetAssistantIndex(chat, generationType);
  const priorUserIndex = findPriorUserIndex(chat, targetAssistantIndex);
  const lastUserIndex = findLastUserIndex(chat);
  const effectiveUserIndex = REPEAT_TYPES.has(generationType) ? priorUserIndex : lastUserIndex;
  const effectiveInput = resolveEffectiveInput(chat, liveChat, effectiveUserIndex, rawLastUserMessage, generationType);

  let userTurnMode = 'fresh_user_turn';
  if (REPEAT_TYPES.has(generationType)) userTurnMode = 'repeat_from_prior_user';
  if (generationType === 'continue') userTurnMode = 'continuation';
  if (SKIP_TYPES.has(generationType) || options?.automatic_trigger) userTurnMode = 'background';
  if (generationType === 'impersonate') userTurnMode = 'impersonation';

  return {
    generationType,
    userTurnMode,
    rawLastUserMessage: String(rawLastUserMessage || ''),
    effectiveLastUserMessage: effectiveInput.text,
    effectiveInputSource: effectiveInput.source,
    targetAssistantMessage: targetAssistantIndex >= 0 ? summarizeMessage(getMessage(chat, liveChat, targetAssistantIndex), targetAssistantIndex) : null,
    isFreshUserTurn: userTurnMode === 'fresh_user_turn',
    indexes: {
      targetAssistantIndex,
      priorUserIndex,
      lastUserIndex,
      effectiveUserIndex,
    },
  };
}

function normalizeType(type) {
  if (type === undefined || type === null || type === '' || type === 'normal') return 'normal';
  return String(type);
}

function findTargetAssistantIndex(chat, generationType) {
  if (generationType === 'normal' || generationType === 'group_chat') return -1;
  for (let i = chat.length - 1; i >= 0; i -= 1) {
    const message = chat[i];
    if (!message || message.is_system || message.is_user) continue;
    return i;
  }
  return -1;
}

function findPriorUserIndex(chat, fromIndex) {
  const start = fromIndex >= 0 ? fromIndex - 1 : chat.length - 1;
  for (let i = start; i >= 0; i -= 1) {
    const message = chat[i];
    if (!message || message.is_system || !message.is_user) continue;
    return i;
  }
  return -1;
}

function findLastUserIndex(chat) {
  for (let i = chat.length - 1; i >= 0; i -= 1) {
    const message = chat[i];
    if (!message || message.is_system || !message.is_user) continue;
    return i;
  }
  return -1;
}

function getMessageText(chat, index) {
  if (index < 0 || !chat[index]) return '';
  return String(chat[index].mes || '').trim();
}

function getMessage(primaryChat, fallbackChat, index) {
  if (index < 0) return null;
  return primaryChat[index] || fallbackChat[index] || null;
}

function resolveEffectiveInput(chat, liveChat, index, rawLastUserMessage, generationType) {
  const promptText = getMessageText(chat, index);
  if (promptText) return { text: promptText, source: 'interceptor_chat' };

  const liveText = getMessageText(liveChat, index);
  if (liveText) return { text: liveText, source: 'live_context_chat' };

  const rawText = String(rawLastUserMessage || '').trim();
  if (rawText && !REPEAT_TYPES.has(generationType)) return { text: rawText, source: 'raw_last_user_message' };

  return { text: '', source: 'empty' };
}

function summarizeMessage(message, index) {
  return {
    index,
    name: message?.name || '',
    is_user: Boolean(message?.is_user),
    length: String(message?.mes || '').length,
  };
}
