// One-time data cleanup, not a schema change (schema.md untouched) — scene
// prompts generated before generateScenePrompt.ts's normalizePromptText()
// fix could have real newline characters between panels (the model didn't
// follow spec.md 30 rule 10's "single line" instruction). Batches whose
// blocks are already `status=success` are skipped on every future run
// (spec.md 19.2), so those old rows would otherwise never get cleaned up —
// this runs once, idempotently, replacing any CR/LF with a space and
// collapsing doubled-up whitespace, matching normalizePromptText()'s
// behavior for anything generated from here on.
export const migration0002NormalizeScenePromptNewlines = {
  name: '0002_normalize_scene_prompt_newlines',
  sql: `
UPDATE scene_prompts
SET prompt = TRIM(
  REPLACE(
    REPLACE(
      REPLACE(
        REPLACE(prompt, char(13) || char(10), ' '),
        char(10), ' '
      ),
      char(13), ' '
    ),
    '  ', ' '
  )
)
WHERE prompt IS NOT NULL AND (prompt LIKE '%' || char(10) || '%' OR prompt LIKE '%' || char(13) || '%');
`
}
