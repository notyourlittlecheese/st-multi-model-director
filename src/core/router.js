const CONTINUATION_CUES = [
  '继续',
  '接着',
  '然后他回答',
  '然后她回答',
  '回答我刚才',
  '她会怎么回应',
  '他会怎么回应',
  '继续写',
  'continue',
];

export function routeTurn(turn) {
  const text = turn.effectiveLastUserMessage || turn.rawLastUserMessage || '';
  const features = extractFeatures(text);
  const scores = scoreFeatures(features, turn);
  const mode = pickMode(scores);
  return { mode, scores, features };
}

function extractFeatures(text) {
  const normalized = String(text || '').trim();
  const paragraphs = normalized ? normalized.split(/\n\s*\n|\n/).filter(Boolean) : [];
  const dialogueSegments = (normalized.match(/[“"][^”"]+[”"]/g) || []).length;
  const asciiDialogueSegments = (normalized.match(/(^|\n)\s*[-—].+/g) || []).length;
  const completedActionCount = (normalized.match(/[。！？.!?]/g) || []).length;
  const explicitContinuationCue = CONTINUATION_CUES.some((cue) => normalized.toLowerCase().includes(cue.toLowerCase()));

  return {
    charCount: normalized.length,
    paragraphCount: paragraphs.length,
    dialogueSegments: dialogueSegments + asciiDialogueSegments,
    completedActionCount,
    explicitContinuationCue,
  };
}

function scoreFeatures(features, turn) {
  if (turn.userTurnMode === 'continuation') {
    return { director: 0.05, interaction: 0.1, expansion: 0.05, continuation: 0.95 };
  }

  const expansion =
    clamp01(features.charCount / 1000) * 0.45 +
    clamp01(features.paragraphCount / 8) * 0.25 +
    clamp01(features.dialogueSegments / 5) * 0.15 +
    clamp01(features.completedActionCount / 10) * 0.15;

  const director =
    (1 - clamp01(features.charCount / 300)) * 0.65 +
    (features.paragraphCount <= 2 ? 0.2 : 0) +
    (features.dialogueSegments <= 1 ? 0.15 : 0);

  const continuation = features.explicitContinuationCue ? 0.75 : 0.05;
  const interaction = clamp01(1 - Math.abs(features.charCount - 500) / 600);

  return {
    director: round(director),
    interaction: round(interaction),
    expansion: round(expansion),
    continuation: round(continuation),
  };
}

function pickMode(scores) {
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] || 'interaction';
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function round(value) {
  return Math.round(clamp01(value) * 100) / 100;
}
