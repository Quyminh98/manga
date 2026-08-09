// Shared base class for "LLM response didn't match the expected structural
// contract" failures across the 3 LLM pipeline steps (detectCharacters/
// generateCharacterPrompts/generateScenePrompt) — lets errorClassification.ts
// map every one of them to ErrorCode.INVALID_JSON with a single instanceof
// check. generateScenePrompt.ts's SceneFormatCollapseError extends this
// rather than replacing it, so its existing `instanceof SceneFormatCollapseError`
// batch-shrinking check (ScenePromptService.generateBatch) keeps working
// unchanged.
export class LlmResponseFormatError extends Error {}
