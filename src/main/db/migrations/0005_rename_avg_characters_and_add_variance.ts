// Real schema change (rename 3 columns + add 2 new ones) — confirmed with
// the user before implementing, per CLAUDE.md (see the Phase 18 plan for
// this session). "Maximum characters per SRT" was a hard ceiling — the
// splitter (src/main/pipeline/splitSrt.ts) flushed a block the instant the
// next sentence wouldn't fit, which could leave a block (or the next one)
// too short. Renamed to "Average characters per SRT" + a new "Variance %"
// field: the splitter now targets a [avg-variance%, avg+variance%] range and
// prefers reaching the lower bound over flushing a too-short block.
//
// `variance_percent` has no REFERENCES clause, so — unlike
// 0004_add_channels's `channel_id` — `ADD COLUMN ... NOT NULL DEFAULT 30` in
// one statement is fine here (that restriction only fires for a REFERENCES
// column with a non-NULL default on a non-empty table).
export const migration0005RenameAvgCharactersAndAddVariance = {
  name: '0005_rename_avg_characters_and_add_variance',
  sql: `
ALTER TABLE projects RENAME COLUMN max_characters TO avg_characters;
ALTER TABLE projects RENAME COLUMN max_characters_snapshot TO avg_characters_snapshot;
ALTER TABLE projects ADD COLUMN variance_percent INTEGER NOT NULL DEFAULT 30;

ALTER TABLE channels RENAME COLUMN max_characters TO avg_characters;
ALTER TABLE channels ADD COLUMN variance_percent INTEGER NOT NULL DEFAULT 30;
`
}
