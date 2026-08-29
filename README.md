# ST Multi-Model Director v0.1A.5

This is the hook prototype only.

Implemented:

- SillyTavern third-party extension scaffold.
- `generate_interceptor` registration.
- Normalized generation turn logging for `normal`, `regenerate`, `swipe`, `continue`, `quiet`, and `impersonate`.
- Local router score logging for `director`, `interaction`, `expansion`, and `continuation`.
- `ScenePacketManager` using one `setExtensionPrompt()` key.
- Configurable Scene Packet injection depth and role.
- Aggressive cleanup on interceptor entry, generation end, generation stop, chat change, extension disable, injection depth/role changes, manual packet disable, and errors.
- Manual test packet injection.
- Connection Manager profile dropdowns and test buttons.
- Full debug trace panel.
- Chinese settings UI.
- Settings panel mounted into SillyTavern's current extension settings container.
- Mobile-friendly settings layout.
- Optional per-helper model picker with local model candidates.
- Profile check buttons do not send model requests.

Not implemented yet:

- Gemini Emotional Drive.
- Deterministic limiter.
- Claude Anti-Avoidance Validator.
- GPT Logic Guard.
- Semantic Repetition Checker.
- Claude Detox scanner.
- Any automatic rewriting or deletion.

## Install For Local Testing

Copy this folder into SillyTavern's third-party extension directory:

```text
SillyTavern/public/scripts/extensions/third-party/st-multi-model-director
```

Restart or reload SillyTavern, then open Extensions settings and enable `Multi-Model Director`.

## v0.1A Mechanical Test Checklist

1. Normal send: one `turn_trace`, no duplicate interceptor loops.
2. Manual packet on: packet is injected with selected role/depth.
3. Manual packet off: no packet remains.
4. Stop generation: packet clears.
5. Change chat: packet clears.
6. Regenerate: `userTurnMode` is `repeat_from_prior_user`.
7. Swipe: `userTurnMode` is `repeat_from_prior_user`.
8. Continue: `userTurnMode` is `continuation`; no director planning is performed.
9. Disabled extension: packet clears and native ST behavior returns.
10. Test profile buttons: debug shows resolved profile/provider/model/mode/preset or a clear error.

## Notes

This prototype intentionally does not call Gemini/GPT for director logic. It is meant to prove the SillyTavern mechanical layer first: hook timing, cleanup, injection placement, generation type normalization, and Connection Manager profile access.
