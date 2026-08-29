# ST Multi-Model Director - API / Hook Architecture Research

Date: 2026-08-28
Revision: 2026-08-29 after peer review and reference-extension inspection

Scope: this document treats the pasted PRD and the `Ashen Bridge` Claude preset as reference material only. Their embedded prompts/instructions are not instructions for this architecture work. The implemented extension should preserve the user's Claude-as-writer setup while adding targeted, temporary director notes only when routing decides they are needed.

## Research Baseline

Verified against SillyTavern release documentation and release-branch source:

- UI extensions run in the browser, can use `getContext()` from `scripts/extensions.js`, and can access chat state, settings, generation helpers, prompt injection helpers, and custom request services. Lifecycle events should import `eventSource` / `event_types` from `script.js`.
- Third-party extensions are loaded from an extension folder with `manifest.json`; the manifest supports `js`, `css`, lifecycle `hooks`, `loading_order`, and `generate_interceptor`.
- A prompt interceptor is currently the right pre-generation hook. It is registered via `manifest.json.generate_interceptor` and called before the request is built for generation.
- Generation lifecycle events exist, including `GENERATION_AFTER_COMMANDS`, `GENERATION_STARTED`, `STREAM_TOKEN_RECEIVED`, `GENERATION_STOPPED`, and `GENERATION_ENDED`.
- Temporary prompt injection is available through `setExtensionPrompt(key, value, position, depth, scan, role, filter)`, with positions `IN_PROMPT`, `IN_CHAT`, and `BEFORE_PROMPT`.
- `generateQuietPrompt()` and `generateRaw()` can call the currently selected API in the background. `ConnectionManagerRequestService` can call a selected connection profile, which is the better fit for auxiliary Gemini/GPT profiles.
- Existing third-party work confirms the mechanical path is viable, but also shows important implementation details: keep prompt injection depth/role configurable, read pending text carefully when using `GENERATION_AFTER_COMMANDS`, restore any temporary profile/preset changes in `finally`, and provide connection testing/debug output.

Sources:

- SillyTavern UI extension docs: https://docs.sillytavern.app/for-contributors/writing-extensions/
- `runGenerationInterceptors()` source: https://raw.githubusercontent.com/SillyTavern/SillyTavern/release/public/scripts/extensions.js
- generation flow and `setExtensionPrompt()` source: https://raw.githubusercontent.com/SillyTavern/SillyTavern/release/public/script.js
- `getContext()` exports: https://raw.githubusercontent.com/SillyTavern/SillyTavern/release/public/scripts/st-context.js
- custom request / connection profile service: https://raw.githubusercontent.com/SillyTavern/SillyTavern/release/public/scripts/custom-request.js and https://raw.githubusercontent.com/SillyTavern/SillyTavern/release/public/scripts/extensions/shared.js
- Reference implementation inspected locally from https://github.com/luisbrandao/SillyTavern-Director. It is not a product match, but it is useful for mechanical patterns around `GENERATION_AFTER_COMMANDS`, `setExtensionPrompt`, Connection Manager calls, configurable depth/role, and fallback behavior.

Implementation correction from v0.1A.3: mount settings UI into `#extensions_settings2` when available, falling back to `#extensions_settings`. Derive the extension folder path from `import.meta.url`; do not assume `context.extensionFolderPath` exists.

Implementation correction from v0.1A.4: settings UI is mobile-friendly and auxiliary requests support optional per-helper `model` override via Connection Manager `overridePayload`. This is not yet an automatic provider model picker; leave the field empty to use the selected profile's model.

Implementation correction from v0.1A.5: profile buttons now perform local configuration checks only and do not call `sendRequest()`. Model fields are dropdowns populated from local candidates gathered from saved Connection Profiles and visible SillyTavern model selectors. The extension settings title keeps the English product name only.

## Answers To Required Questions

### 1. How Current Third-Party Extensions Listen To Generation

Use two mechanisms:

1. Register `generate_interceptor` in `manifest.json`. This is the only verified pre-prompt-build interception point suitable for deciding route, calling helper agents, and injecting a Scene Packet.
2. Subscribe to lifecycle events with `eventSource.on(...)`, importing `eventSource` and `event_types` from `script.js`, for observability, cleanup, debug logging, and post-generation lint reporting.

Do not assume an unverified `beforeGenerate`, `onPromptBuild`, or `afterPromptBuild` hook exists.

Implementation note: a reference Director extension currently uses `GENERATION_AFTER_COMMANDS` instead of `generate_interceptor` and injects with `setExtensionPrompt()`. For this project, keep `generate_interceptor` as the primary architecture because it receives the effective prompt-building `chat` argument. Still, the prototype should compare it against `GENERATION_AFTER_COMMANDS` in real SillyTavern, especially for fresh-send pending input timing.

### 2. How To Obtain Current User Input

Inside `generate_interceptor(chat, contextSize, abort, type)`, the passed `chat` argument is the filtered prompt-building chat after slash-command handling and prompt regex/file processing. For normal user generation, the current user input should be resolved by scanning backward for the latest `is_user === true` message, then normalized by generation type.

Important caveats:

- For `regenerate`, `swipe`, `continue`, `quiet`, and `impersonate`, the last relevant message may not be a fresh user input.
- `MESSAGE_SENT` can cache the raw just-sent user message, but the interceptor should still prefer the generation-time `chat` argument for route decisions because slash commands and prompt filters may have changed what will actually be sent.
- Store both in debug logs: `rawLastUserMessage` from event cache when available, and `effectiveLastUserMessage` from interceptor `chat`.
- If the prototype uses or supports `GENERATION_AFTER_COMMANDS`, the just-submitted message may still be in `#send_textarea` instead of `chat`. That path must treat textarea content as read-only pending input.

The context builder must return a normalized turn object, not just a string:

```js
{
  generationType,          // normal, regenerate, swipe, continue, quiet, impersonate, group_chat, unknown
  userTurnMode,            // fresh_user_turn, repeat_from_prior_user, continuation, background, impersonation
  rawLastUserMessage,
  effectiveLastUserMessage,
  targetAssistantMessage,  // existing bot message for swipe/regenerate/continue when available
  isFreshUserTurn,
}
```

Expected routing behavior:

- `normal`: route from the fresh user input.
- `regenerate`: route from the prior user input that produced the target assistant reply.
- `swipe`: route from the same prior user input; it may re-run helper agents unless configured to reuse the previous packet.
- `continue`: do not treat it as a new user turn; default to direct Claude continuation with no director replanning.
- `quiet` / `impersonate`: skip by default unless a future feature explicitly opts in.

### 3. How To Access Current Chat Context

Use `const context = getContext()` imported from `scripts/extensions.js`.

Relevant fields/functions verified in `st-context.js`:

- `context.chat`: live chat history.
- `context.characters`, `context.characterId`, `context.groups`, `context.groupId`.
- `context.name1`, `context.name2`.
- `context.chatMetadata`.
- `context.getCharacterCardFields()`.
- `context.getWorldInfoPrompt()` is exported, but it is internal-ish and should be used cautiously.
- `context.extensionSettings` and `context.saveSettingsDebounced()` for extension settings.

For MVP, context builder should use:

- the interceptor `chat` argument for recent effective messages,
- `getCharacterCardFields()` for character/persona/scenario fields,
- user-configured `Character Action Profile` from extension settings.

World/lore extraction can be deferred unless needed. The generated prompt already includes SillyTavern's normal world info; helper agents only need a compact action profile plus recent context.

### 4. Whether A Generation Interception Hook Exists

Yes: `generate_interceptor`.

Verified behavior:

- It is declared in the extension manifest.
- SillyTavern calls all extension interceptors sequentially by `loading_order`.
- It passes `(chat, contextSize, abort, type)`.
- It can be async.
- It can abort generation.
- It is skipped for dry runs.

Design implication: this extension should put orchestration here, but it must fail open. If helper agents fail, do not abort. Only abort for an explicit future feature like "block generation when linter hard-fails", not for MVP.

### 5. How To Temporarily Inject Prompt

Preferred MVP path:

```js
const {
  setExtensionPrompt,
  extension_prompt_types,
  extension_prompt_roles,
} = await import('../../../../script.js');

setExtensionPrompt(
  'multi_model_director_scene_packet',
  scenePacketText,
  extension_prompt_types.IN_CHAT,
  configuredDepth,
  false,
  configuredRole,
);
```

If enum imports are avoided, use verified numeric meanings:

- `IN_PROMPT = 0`
- `IN_CHAT = 1`
- `BEFORE_PROMPT = 2`
- role `SYSTEM = 0`, `USER = 1`, `ASSISTANT = 2`

Do not lock the final injection depth/role before real RP testing. A late in-chat system prompt can become stronger than intended, especially beside a heavy Claude preset.

Expose an MVP developer setting:

```text
Scene Packet Injection
Position: [In-chat]
Depth: [0 / 1 / 2 / 4]
Role: [System / User]
Scan for WI: [Off by default]
Debug preview: [Show final packet]
```

First test matrix:

- `SYSTEM depth 1`
- `SYSTEM depth 2`
- `USER depth 1`

Only keep `depth=0` as an explicit experimental option, not the default. The goal is to give Claude action pressure without overriding the existing character/preset stack.

### 6. How To Ensure Temporary Prompt Does Not Enter Chat History

Do not splice directly into the real `context.chat`. The interceptor docs warn that message objects are mutable and direct mutation can affect real chat history.

Use a dedicated `ScenePacketManager` wrapper around a single `setExtensionPrompt()` key:

```js
async function clearScenePacket() {
  await setExtensionPrompt(SCENE_PACKET_KEY, '', position, depth, false, role);
}

async function setScenePacket(packet, options) {
  await setExtensionPrompt(SCENE_PACKET_KEY, packet, options.position, options.depth, false, options.role);
}
```

Use it this way:

- Set it during the interceptor.
- Clear it on `GENERATION_ENDED` and `GENERATION_STOPPED`:

```js
setExtensionPrompt(SCENE_PACKET_KEY, '', extension_prompt_types.IN_CHAT, 0, false);
```

Also clear it at the start of every interceptor call before computing a new packet. This protects against stale packets if a prior generation stopped unexpectedly.

Additional clear points:

- chat changed,
- extension disabled,
- extension unload/deactivate,
- helper-agent exception before main generation starts,
- unsupported generation type,
- settings change that disables injection.

This should be implemented with `try/finally` discipline inside the orchestration code, plus lifecycle listeners as backup. Clearing too often is acceptable; stale director notes are not.

If a future experiment mutates the interceptor `chat` argument, clone any message first with `structuredClone()` and treat it as higher-risk. MVP should avoid chat mutation.

### 7. Whether Current ST Provider / API Config Can Be Reused

Yes, with limitations.

For background calls using the current API:

- `generateQuietPrompt()` uses chat context and a quiet post-history prompt.
- `generateRaw()` creates a raw request through the current selected API.

This is useful for same-provider helper calls, but it does not cleanly solve "Gemini helper while Claude remains the main writer" if the main selected API/profile is Claude.

### 8. Whether Auxiliary Models Can Be Specified Separately

Yes, if using Connection Manager profiles.

`ConnectionManagerRequestService.sendRequest(profileId, prompt, maxTokens, custom, overridePayload)` is exported through `getContext()` and supports Chat Completion and Text Completion profiles. It uses the profile's API, model, preset, instruct preset, secret id, API URL, and proxy settings.

Architecture choice:

- Main writer remains the user's current SillyTavern model/preset, e.g. Claude + Ashen Bridge.
- Emotional Drive profile points to Gemini.
- Logic Guard profile points to GPT/OpenAI or another chosen logic model.
- Validator can be current writer profile, separate Claude profile, or disabled.

Do not store raw API keys in extension settings. Use SillyTavern secrets / connection profiles.

Add `Test Connection` buttons for every auxiliary profile:

```text
Gemini profile: [Test]
GPT profile: [Test]
Validator profile: [Test]
```

Debug output should include resolved profile id, profile name, provider/API type, model, mode, selected preset, max tokens, and a short success/failure result. Connection Manager profile/secret resolution has had provider-specific bugs historically, so the plugin should make profile failures obvious instead of making the user debug 401s as orchestration bugs.

If temporarily overriding a profile's preset for one helper request, restore the original profile value in `finally`.

### 9. Stream Generation Lifecycle

The main writer's streaming remains SillyTavern-native. The director extension should run helper calls before the main stream starts.

Verified events:

- `GENERATION_AFTER_COMMANDS`: after slash-command processing, before generation starts.
- `GENERATION_STARTED`: generation started.
- `STREAM_TOKEN_RECEIVED`: token chunks during stream.
- `GENERATION_STOPPED`: user stopped generation.
- `GENERATION_ENDED`: completed or errored.

MVP behavior:

- Do not stream helper-agent responses into the UI.
- Helper calls should be non-streaming with short max tokens and timeouts.
- Once helper calls finish or fail, main generation proceeds normally and may stream according to the user's SillyTavern setting.
- Linter v0.1 can run after `MESSAGE_RECEIVED` or `GENERATION_ENDED` against the produced assistant message and report in the debug panel only.

### 10. Safe Fallback On Auxiliary Failure

Fallback rule: never block normal Claude writing because Gemini/GPT failed.

Implementation pattern:

- Wrap every helper call in timeout + `try/catch`.
- Validate JSON schema locally after parsing; treat invalid JSON as failure.
- On failure, log `fallbackReason`, clear Scene Packet, and return from interceptor without `abort()`.
- If only one helper failed in a multi-helper path, continue with whatever validated helper notes remain if they are not required for safety. Example: Gemini failed, GPT succeeded, inject only logic constraints.
- If Scene Packet assembly fails, inject nothing.

## Recommended Architecture

```text
manifest.json
  generate_interceptor: "stMultiModelDirectorInterceptor"
  hooks.activate: "activate"

index.js
  activate()
  register global interceptor
  register event cleanup/log listeners
  mount settings UI

src/core/router.js
  local mode + risk heuristics

src/core/context-builder.js
  current user input
  recent effective chat
  character card fields
  manual Character Action Profile

src/agents/emotional-drive.js
  Gemini profile call
  JSON schema parse/validate

src/agents/anti-avoidance-validator.js
  optional Claude/profile call, disabled by default in v0.1
  VALID/SOFTEN/INVALID only

src/agents/deterministic-limiter.js
  clamps Gemini intensity locally before packet assembly

src/core/scene-packet.js
  compact temporary system note
  no prose, no dialogue drafting

src/lint/detector.js
  local Claude Detox scanner
  report-only MVP

src/lint/semantic-repetition.js
  optional GPT repetition clusters
  report-only MVP

src/state/debug-log.js
  ring buffer in memory/localforage
```

## Generation Flow

### Normal Interaction

```text
generate_interceptor
  clear stale Scene Packet
  build effective context
  local router says: interaction, no high risk
  inject nothing
main SillyTavern generation
post-generation linter report
```

### High Emotion Interaction

```text
generate_interceptor
  clear stale Scene Packet
  route: interaction + emotional_high + avoidance_risk
  call Gemini profile for structured action direction
  apply deterministic limiter
  optionally call Claude validator when enabled
  build short Scene Packet
  setExtensionPrompt(SCENE_PACKET_KEY, packet, IN_CHAT, configuredDepth, scan=false, configuredRole)
main Claude writer streams normally
GENERATION_ENDED/STOPPED clears Scene Packet
post-generation linter report
```

### Expansion / Continuation

```text
Expansion:
  preserve user structure
  optionally ask Gemini only for non-user character response direction
  no plot replanning

Continuation:
  default direct Claude
  no helper calls unless manual override or obvious high-risk setting
```

## Preset Compatibility Notes

The attached Ashen Bridge preset is already a heavy Claude writing stack:

- 240 prompt entries, 93 enabled in the inspected file.
- Strong emphasis on independent character agency, multi-POV/co-subject treatment, active desire, emotional consequence, narrative progression, and user authority.
- It already tries to solve general passivity and prose quality at the prompt layer.

So the extension should not add another permanent mega-prompt. It should add narrow, per-turn, discardable Scene Packets:

- "what must be responded to"
- "what action pressure exists"
- "what should not be overdone"
- "what logic constraints apply"
- "what user structure must be preserved"

This directly addresses the user's targeted problem: Claude remains the prose writer, while auxiliary models only supply bounded decision pressure and repetition/logic checks.

The first implementation should avoid paying for an extra Claude validator call on every high-emotion turn. Default flow:

```text
Gemini Emotional Drive
→ deterministic limiter / caps
→ Scene Packet
→ Claude Writer
```

The Scene Packet should explicitly state that auxiliary action suggestions are proposals, not facts; when compatible with character constraints, preserve reasonable initiative by lowering intensity instead of replacing action with waiting, silence, or avoidance.

Claude Anti-Avoidance Validator remains available as a configurable safety layer for cases where Gemini repeatedly proposes infeasible behavior and the writer follows it too literally.

## Action Profile Schema

UI may start as a textarea, but internally the extension should parse/store a structured object. Minimum schema:

```yaml
relationship:
  stage:
  current_dynamic:
  known_mutuality:
  char_feeling_strength:
  char_awareness:
  perceived_user_feeling:
  mutual_commitment:

character:
  core_traits:
  expression_style:
  initiative_style:
  conflict_style:

constraints:
  long_term_goals:
  commitments:
  hard_boundaries:

emotional_caps:
  affection_expression:
  anger_expression:
  possessiveness:
  sacrifice:
  romantic_escalation:
```

Use this schema for Gemini prompts and local clamps. This prevents "emotion high" from becoming "expression extreme".

## Scene Packet Schema

Do not let implementation freely concatenate an unstructured prompt. The packet builder should emit a stable schema and then render that schema into a compact temporary prompt:

```yaml
mode:

user_authority:
  preserve_actions:
  preserve_dialogue:
  preserve_psychology:
  preserve_event_order:

response_obligations:
  - ...

emotional_direction:
  internal:
  expression:
  action_pressure:

recommended_actions:
  - ...

behavior_bounds:
  - ...

logic_constraints:
  - ...

dialogue_constraints:
  adversariality:
  wit_density:

already_established:
  - ...

do_not:
  - ...

ending_boundary:
```

The `already_established` field is important because it can prevent repetition before generation, not only report repetition afterward. Example: if the scene already established that a character broke a personal rule for the user, tell Claude not to repeatedly re-explain what that proves about the relationship.

## Deterministic Limiter Definition

The limiter must have two layers:

```yaml
numeric_caps:
  affection_expression:
  anger_expression:
  possessiveness:
  initiative:

behavior_caps:
  confession: allowed | disallowed
  major_sacrifice: allowed | disallowed
  relationship_escalation: none | minor | major
  coercion: allowed | disallowed
  abandonment_of_long_term_goal: allowed | disallowed
```

Rationale: Gemini can output emotionally moderate numbers while recommending behavior that is narratively extreme. Clamp both intensity values and escalation class.

## Semantic Repetition Categories

Report-only semantic repetition should classify clusters:

```text
FACT_REPEAT
EMOTION_REPEAT
RELATIONSHIP_REPEAT
MOTIVATION_REPEAT
MICROACTION_REPEAT
SUMMARY_REPEAT
INTERPRETATION_REPEAT
```

Do not auto-delete in v0.1. Literary echo and structural callback can look like repetition to a model; collect real RP data first.

## Router Debug Requirements

Router logs must explain decisions:

```json
{
  "mode": "expansion",
  "scores": {
    "interaction": 0.31,
    "expansion": 0.82,
    "continuation": 0.08
  },
  "features": {
    "charCount": 936,
    "paragraphCount": 11,
    "dialogueSegments": 5,
    "sentenceBoundaryCount": 7,
    "explicitContinuationCue": false
  }
}
```

v0.1 should also expose `Emotional Drive: [Auto] [Force On] [Force Off]` once Gemini exists, so model quality can be tested independently from route detection.

## Debug Trace Shape

Every generation attempt should produce one complete trace:

```text
Turn #428
Generation: normal / fresh_user_turn
Routing: Interaction
Triggers: emotional_high=true, avoidance_risk=true
Gemini: not implemented in v0.1A
Limiter: not implemented in v0.1A
Validator: disabled
Packet: injected / SYSTEM / depth 1
Writer: native ST
Post-check: not implemented in v0.1A
```

This trace is a core product surface for debugging taste failures later.

## Risk Register

- **Direct chat mutation risk:** interceptor `chat` and message objects are mutable. Avoid mutation for MVP.
- **Stale Scene Packet risk:** `setExtensionPrompt` writes into a global prompt-injection registry. Always clear on start/end/stop.
- **Ordering risk:** multiple extensions' interceptors run by `loading_order`. Use a late-ish order if this should see vector/regex-adjusted prompt context; use early order if future work must precede other prompt shapers.
- **Provider coupling risk:** `generateRaw()` uses current selected API. Use Connection Manager profiles for separate Gemini/GPT.
- **Connection profile risk:** profile/secret/preset resolution can fail in provider-specific ways. Add per-profile tests and log resolved connection details.
- **Latency risk:** helper calls happen before main generation. Use short prompts, short max tokens, strict timeouts, and route sparingly.
- **Style contamination risk:** helper outputs must be structured JSON/director notes, never prose or dialogue.
- **History pollution risk:** never save Scene Packet into chat messages, chat metadata, lore, or character card.
- **Cost risk:** Claude validator can double Claude calls on high-emotion turns. Keep it optional and disabled by default until real tests show it is needed.

## MVP Recommendation

Proceed with a staged scaffold:

### v0.1A Hook Prototype

1. Scaffold extension with `manifest.json`, `index.js`, settings UI, and debug panel.
2. Implement interceptor that only logs normalized generation type and route decisions.
3. Implement `ScenePacketManager`, manual test packet injection, configurable depth/role, and aggressive cleanup.
4. Add Connection Manager profile dropdowns and `Test Connection`.
5. Do not implement Gemini, semantic repetition, logic guard, or validator business behavior yet.
6. Mechanical test checklist: normal send, swipe, regenerate, continue, stop generation cleanup, chat-change cleanup, depth/role preview, auxiliary profile test, extension disabled behavior.

### v0.1B Director Path

1. Add local router for Interaction / Expansion / Continuation.
2. Add structured Action Profile.
3. Add Gemini Emotional Drive with schema validation.
4. Add deterministic limiter and fail-open behavior.
5. Assemble and inject a compact Scene Packet.

### v0.1C Report-Only Quality Checks

1. Add local Claude Detox scanner.
2. Add GPT Semantic Repetition Checker as report-only debug output.
3. Keep both out of the chat text and out of auto-editing.

### v0.1D Optional Validator

1. Add Claude Anti-Avoidance Validator behind a setting.
2. Keep it off by default because of Opus cost.

### v0.2

1. GPT Logic Guard.
2. Automatic high-risk routing beyond basic heuristics.
3. Automatic patch/remove experiments for high-confidence lint/repetition findings.
