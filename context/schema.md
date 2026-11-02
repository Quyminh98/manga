# schema.md — StoryPrompt Desktop

Nguồn: [spec.md](../spec.md)

---

## Schema

### SQLite (dữ liệu quan hệ, theo từng project)

#### `projects`

| Field | Type | Bắt buộc | Ghi chú |
|---|---|---|---|
| id | uuid | required | PK |
| name | string | required | |
| transcript | text | required | plain text, không timestamp |
| status | enum | required | xem [Project.status](#projectstatus) |
| channel_id | uuid (FK → channels.id) | required (application layer) | thêm ngày 2026-08-10 (migration `0004_add_channels`, xem Changelog Phase 18) — channel project thuộc về, chọn đúng 1 lần lúc tạo project, không đổi được sau đó. **Không có `NOT NULL` ở tầng DB** — SQLite từ chối `ALTER TABLE ADD COLUMN ... NOT NULL REFERENCES ... DEFAULT` khi bảng đã có sẵn row (lỗi "Cannot add a REFERENCES column with non-NULL default value"), nên cột được thêm nullable rồi backfill bằng `UPDATE` riêng; `ProjectService.create()` (code path insert project duy nhất) luôn set giá trị thật nên trong thực tế không bao giờ NULL |
| selected_model | string | optional | model_id từ Vilao; optional vì Draft có thể chưa chọn. Không service nào ghi field này tới Phase 9 — từ Phase 9, ghi đúng 1 lần cùng lúc với `selected_model_snapshot` khi Run đầu tiên (xem Changelog) |
| avg_characters | integer | required | đổi tên từ `max_characters` ngày 2026-08-10 (migration `0005_rename_avg_characters_and_add_variance`, xem Changelog Phase 19) — default 300, range 30–2000 (min hạ từ 100 xuống 30 ngày 2026-08-12, theo yêu cầu trực tiếp user). **Không còn là giới hạn cứng** — xem `variance_percent` ngay dưới và `src/main/pipeline/splitSrt.ts` |
| variance_percent | integer | required | thêm ngày 2026-08-10 (cùng migration trên) — default 30, range 0–90. SRT block dao động trong khoảng `[avg_characters × (1 − variance_percent/100), avg_characters × (1 + variance_percent/100)]` thay vì bị cắt cứng tại `avg_characters` — tránh câu bị cắt quá ngắn (yêu cầu trực tiếp của user) |
| fake_duration_sec | integer | required | default 3, range 1–30 |
| max_retry | integer | required | default 1 (hạ từ 3 ngày 2026-08-10, xem Changelog), không còn chỉnh được qua UI |
| scene_concurrency | integer | required | default 4 (nâng từ 2 ngày 2026-08-09, xem Changelog), range 1–10 (nới từ 1–5 ngày 2026-10-21) |
| scene_batch_size | integer | required | default 10, range 1–30 (nới từ 1–20 ngày 2026-10-21) — thêm ngày 2026-08-10 (migration `0003_add_scene_batch_size`, xem Changelog Phase 17); số SRT block gộp vào 1 request Scene/Image Prompt Generation, chỉnh được qua Settings > Advanced > Pipeline Tuning |
| has_characters | boolean (INTEGER 0/1) | required | default `1` (true) — thêm ngày 2026-08-11 (migration `0006_add_has_characters`, xem Changelog Phase 21). Copy 1 lần từ `channels.has_characters` lúc tạo project, cùng pattern các field channel khác. `false` ⇒ `PipelineService` bỏ qua hẳn Character Detection/Character Prompt Generation (không gọi LLM) — Scene Generation không đổi, đã tự hỗ trợ 0 nhân vật từ trước |
| character_detection_prompt_snapshot | text | optional | set đúng 1 lần khi Run đầu tiên |
| character_generation_prompt_snapshot | text | optional | |
| scene_generation_prompt_snapshot | text | optional | |
| selected_model_snapshot | string | optional | |
| avg_characters_snapshot | integer | optional | đổi tên từ `max_characters_snapshot` — cùng migration `0005` ở trên |
| fake_duration_snapshot | integer | optional | |
| created_at | datetime | required | |
| updated_at | datetime | required | |
| last_opened_at | datetime | optional | |

6 field `*_snapshot` nằm trực tiếp trên `projects` (không tách bảng riêng) vì quan hệ 1–1 tuyệt đối, tạo đúng 1 lần, không version hoá — tách bảng chỉ thêm JOIN không cần thiết. Nullable vì project ở trạng thái `draft` (chưa Run) chưa có snapshot.

#### `channels`

Thêm ngày 2026-08-10 (migration `0004_add_channels`, xem Changelog Phase 18). Ngoài phạm vi V1 gốc.

| Field | Type | Bắt buộc | Ghi chú |
|---|---|---|---|
| id | uuid | required | PK |
| name | string | required | không unique — cùng convention `projects.name` |
| avg_characters | integer | required | đổi tên từ `max_characters` ngày 2026-08-10 (migration `0005_rename_avg_characters_and_add_variance`, xem Changelog Phase 19) — default 300, range 30–2000 (min hạ từ 100 xuống 30 ngày 2026-08-12, theo yêu cầu trực tiếp user), không còn là giới hạn cứng |
| variance_percent | integer | required | thêm cùng migration trên — default 30, range 0–90 |
| fake_duration_sec | integer | required | default 3, range 1–30 |
| selected_model | string | optional | model_id từ Vilao, nullable |
| character_detection_prompt | text | required | |
| character_generation_prompt | text | required | |
| scene_generation_prompt | text | required | |
| scene_concurrency | integer | required | default 4, range 1–10 |
| scene_batch_size | integer | required | default 10, range 1–30 |
| has_characters | boolean (INTEGER 0/1) | required | default `1` (true) — thêm ngày 2026-08-11 (migration `0006_add_has_characters`, xem Changelog Phase 21). `false` = transcript không có nhân vật/cốt truyện — project tạo trong channel này bỏ qua Character Detection/Character Prompt Generation |
| scene_generation_prompt_no_characters | text | required | thêm ngày 2026-08-11 (migration `0007_add_scene_generation_prompt_no_characters`, xem Changelog Phase 22) — dùng thay `scene_generation_prompt` khi `has_characters=false`; không có placeholder `{{RELEVANT_CHARACTERS}}`/`{{RELEVANT_CHARACTER_PROMPTS}}` (không có dữ liệu nhân vật để bơm vào). Luôn có giá trị (như 2 prompt nhân vật) dù chỉ 1 trong 2 prompt scene generation thực sự được dùng tuỳ `has_characters` của project |
| created_at | datetime | required | |
| updated_at | datetime | required | |

Mỗi channel là 1 bộ setting đầy đủ (Average Characters/Variance/Duration/Model/3 prompt template/Scene Concurrency/Scene Batch Size) — đúng những field mà project đã tự giữ riêng từ trước (mục `projects` phía trên), cộng thêm 3 prompt (trước đây chỉ nằm trong `AppSettings.promptSettings` global, xem [Non-DB data shapes](#non-db-data-shapes)). Khi tạo project mới, toàn bộ các giá trị này được **copy 1 lần** từ channel đã chọn vào field riêng của project (đúng pattern `AppSettings` → project đã có từ Phase 4, không phải tham chiếu sống) — sửa setting channel sau đó không ảnh hưởng project đã tạo. `AppSettings` (Settings > General/Prompts) đổi vai trò từ "default cho project mới" thành **"default cho channel mới"** — `NewChannelPage.tsx` prefill từ đó, không phải `ProjectService.create()` đọc thẳng nữa.

Không có bảng join hay field nào cho "đổi channel của project đã tạo" — theo yêu cầu, channel chọn 1 lần lúc tạo, cố định vĩnh viễn.

Migration `0004_add_channels` tạo sẵn đúng 1 channel `"Default"` (id cố định, giá trị bằng đúng các hằng số default đã có sẵn trong `ProjectService.ts` + 3 prompt mặc định `src/shared/prompts.ts`) và gán toàn bộ project đã tồn tại trước đó vào channel này — mọi project trong hệ thống luôn thuộc đúng 1 channel, không có trạng thái "project không channel" nào cần xử lý.

Xoá 1 channel còn project tham chiếu bị chặn ở tầng application (`ChannelService.delete()`, kiểm tra chủ động trước khi đụng DB) — cũng được chặn thêm bởi chính foreign key `projects.channel_id → channels.id` (không có `ON DELETE CASCADE`) nếu lỡ bỏ qua bước kiểm tra đó. Không xoá được channel cuối cùng còn lại trong hệ thống (New Project luôn cần ít nhất 1 channel để chọn).

#### `srt_blocks`

| Field | Type | Bắt buộc |
|---|---|---|
| id | uuid | required |
| project_id | uuid (FK → projects.id) | required |
| block_index | integer | required |
| start_ms | integer | required |
| end_ms | integer | required |
| text | text | required |
| character_count | integer | required |
| created_at | datetime | required |

Kết quả bước Split SRT — không qua LLM. Unique `(project_id, block_index)`, đánh số liên tục từ 1.

#### `characters`

| Field | Type | Bắt buộc | Ghi chú |
|---|---|---|---|
| id | uuid | required | PK nội bộ |
| project_id | uuid (FK → projects.id) | required | |
| character_id | string | required | business key dạng `@Qin_Hong_Adult`, dùng xuyên suốt prompt/UI |
| name | string | required | |
| gender | string | required | |
| age_range | string | required | |
| appearance | text | required | |
| hair | string | required | |
| clothing | string | required | |
| personality | text | required | |
| role | string | required | |
| unique_features | text | required | |
| visual_dna | text | required | nguồn nhất quán chính cho mọi Scene Prompt |
| created_at | datetime | required | |
| updated_at | datetime | required | |

Character Database — dữ liệu tĩnh mô tả nhân vật, kết quả bước Character Detection. Unique `(project_id, character_id)`.

Giữ cả `id` (uuid, PK ổn định cho FK) lẫn `character_id` (business key, human-readable, LLM tái sử dụng trong mọi prompt sau) — tách 2 field để không phải re-key toàn hệ thống nếu sau này đổi cách sinh UUID.

#### `character_prompts`

| Field | Type | Bắt buộc | Ghi chú |
|---|---|---|---|
| id | uuid | required | |
| project_id | uuid (FK → projects.id) | required | |
| character_id | string (FK → characters.character_id) | required | |
| prompt | text | optional | rỗng cho tới khi status = success |
| status | enum | required | xem [Task/Prompt status](#taskprompt-status) |
| attempts | integer | required | default 0 |
| error | string | optional | |
| updated_at | datetime | required | |

Kết quả bước Character Prompt Generation — tách khỏi `characters` vì có vòng đời task riêng (status/attempts/error), có thể Regenerate độc lập mà không đụng Visual DNA gốc. Unique `(project_id, character_id)` — đúng 1 prompt/nhân vật.

#### `scene_prompts`

| Field | Type | Bắt buộc | Ghi chú |
|---|---|---|---|
| id | uuid | required | |
| project_id | uuid (FK → projects.id) | required | |
| srt_block_id | uuid (FK → srt_blocks.id) | required | |
| block_index | integer | required | denormalized từ srt_blocks để export nhanh không cần JOIN |
| relevant_character_ids | JSON array\<string\> | required | mảng `character_id`, default `[]` |
| prompt | text | optional | |
| status | enum | required | |
| attempts | integer | required | |
| error | string | optional | |
| updated_at | datetime | required | |

Kết quả bước Scene Prompt Generation — đúng 1 prompt/SRT block. Unique `(project_id, srt_block_id)`.

`relevant_character_ids` lưu JSON array phẳng thay vì bảng join N–M chuẩn hoá — quan hệ chỉ-đọc, V1 không cần query ngược "scene nào chứa nhân vật X".

#### `pipeline_tasks`

| Field | Type | Bắt buộc | Ghi chú |
|---|---|---|---|
| id | uuid | required | |
| project_id | uuid (FK → projects.id) | required | |
| task_type | enum | required | xem [PipelineTask.task_type](#pipelinetasktask_type) |
| entity_id | uuid | optional | trỏ tới srt_block_id / character_id / scene_prompt_id tuỳ task_type (polymorphic, không FK cứng) |
| status | enum | required | |
| attempts | integer | required | |
| error | string | optional | |
| created_at | datetime | required | |
| updated_at | datetime | required | |

Đơn vị resume/retry — mỗi task độc lập, một task lỗi không restart cả pipeline.

Từ Phase 9 (`PipelineService`), bảng này chỉ thật sự có row cho **3/6 giá trị `task_type`**: `SPLIT_SRT`, `DETECT_CHARACTERS`, `GENERATE_CHARACTER_PROMPTS` (mỗi loại đúng 1 row/project, `entity_id = NULL`). `SELECT_RELEVANT_CHARACTERS`/`GENERATE_SCENE_PROMPT` vẫn không dùng (xem Changelog Phase 8) — granularity đó đã có sẵn ở `scene_prompts` (1 row/SRT block, có `status/attempts/error`), không ghi trùng để tránh 2 nguồn sự thật. `EXPORT` **vẫn không dùng** (quyết định giữ nguyên sau khi implement Phase 11, xem Changelog) — Export không nằm trong Run All, là hành động ghi-toàn-bộ-hoặc-không cho cả project chứ không phải N đơn vị resume/retry độc lập.

`entity_id` không có FK constraint vì mỗi `task_type` trỏ tới bảng khác nhau (SPLIT_SRT không có entity cụ thể, GENERATE_SCENE_PROMPT trỏ `scene_prompts.id`, v.v.) — SQLite không hỗ trợ FK điều kiện. Đánh đổi chấp nhận được ở V1, xem [Open Questions](#open-questions).

---

#### `llm_calls`

Phase 27 (user duyệt thêm bảng): mỗi dòng = 1 request gửi tới model của 1 project (mỗi lần retry là 1 dòng riêng). Phục vụ tab "API Calls".

| Field | Type | Bắt buộc | Ghi chú |
|---|---|---|---|
| id | uuid | required | |
| project_id | uuid (FK → projects.id, ON DELETE CASCADE) | required | |
| step | enum | required | giá trị `task_type` đã phát request: `DETECT_CHARACTERS` / `GENERATE_CHARACTER_PROMPTS` / `SELECT_RELEVANT_CHARACTERS` / `GENERATE_SCENE_PROMPT` |
| model | string | required | đúng chuỗi model đã dùng, gồm cả prefix provider và hậu tố thinking (vd `deepseek:deepseek-flash@high`) |
| status | enum | required | `success` / `failed` (xét ở mức request API; response trả về nhưng parse JSON lỗi vẫn là `success`) |
| error | string | optional | vd `HTTP 429: ...`; null khi success |
| duration_ms | integer | required | |
| prompt_tokens / completion_tokens / total_tokens | integer | optional | null nếu provider không trả `usage` |
| created_at | datetime | required | |
| updated_at | datetime | required | |

Index `idx_llm_calls_project_id (project_id)`. Hard delete theo project (cascade), như mọi bảng con khác. Chỉ ghi từ Phase 27 trở đi — project chạy trước đó không có lịch sử.

### Non-DB data shapes

#### `AppSettings` (electron-store, JSON — không nhạy cảm)

```ts
interface AppSettings {
  avgCharacters: number;         // đổi tên từ maxCharacters, default cho channel mới (Phase 19)
  variancePercent: number;       // thêm ở Phase 19 — default cho channel mới
  fakeSrtDurationSec: number;
  selectedModel: string | null;
  promptSettings: {
    characterDetection: string;   // nội dung prompt hiện hành (editable)
    characterGeneration: string;
    sceneGeneration: string;
    sceneGenerationNoCharacters: string; // thêm Phase 22 — default template cho channels.scene_generation_prompt_no_characters
  };
  uiPreferences: Record<string, unknown>;
  lastExportFolder: string | null;
}
```

Đây là nguồn mà `projects.*_prompt_snapshot` sao chép lại tại thời điểm Run đầu tiên — global settings có thể đổi sau, snapshot thì không đổi theo.

**Đổi vai trò từ Phase 18 (xem Changelog):** `maxCharacters`/`fakeSrtDurationSec`/`selectedModel`/`promptSettings.*` không còn là default trực tiếp cho project mới nữa — giờ là default cho **channel mới** (`NewChannelPage.tsx` prefill từ đây). Project mới copy setting từ channel đã chọn (`channels` table), không đọc thẳng `AppSettings`. `sceneConcurrency`/`sceneBatchSize` không có field tương ứng trong `AppSettings` (chỉ tồn tại per-channel/per-project) — không thêm để tránh 1 schema change không cần thiết, `NewChannelPage.tsx` prefill 2 field này bằng hằng số cố định (4/10, khớp `ProjectService.ts`).

#### `SecureCredential` (Electron `safeStorage`, không phải file JSON đọc được)

```ts
interface SecureCredential {
  encryptedApiKey: Buffer; // qua safeStorage, không log, không SQLite, không plaintext
}
```

Triển khai thật (Phase 3, `SecureStorageService`) chỉ ghi **raw bytes** của `encryptedApiKey` ra file riêng trong `userData` — không có `provider`/`updatedAt` trên đĩa (xem [Changelog](#changelog)). Từ Phase 25 mỗi provider có 1 file riêng: `vilao.cred`, `deepseek.cred`, `gemini.cred` (tên file = provider).

#### `ModelInfo` (runtime-only, không persist)

```ts
interface ModelInfo {
  id: string;
  name: string;
}
```

Fetch lại mỗi lần cần (Refresh Models / API key đổi) — không cần bảng vì danh sách model cũ phải bị clear và fetch lại khi API key thay đổi.

---

## Quan hệ giữa các entity

```
channels 1───N projects               (channel_id chọn 1 lần lúc tạo project, không đổi được sau đó)
projects 1───N srt_blocks
projects 1───N characters
characters 1───1 character_prompts   (unique project_id+character_id)
projects 1───N scene_prompts
srt_blocks 1───1 scene_prompts        (unique project_id+srt_block_id)
scene_prompts N───M characters        (denormalized: relevant_character_ids JSON, không FK)
projects 1───N pipeline_tasks         (entity_id polymorphic → srt_blocks | characters | character_prompts | scene_prompts)
```

---

## Enum / Status

#### `Project.status`

```
draft | ready | processing | paused | completed | completed_with_errors | failed
```

#### Task/Prompt status

Dùng chung cho `pipeline_tasks.status`, `character_prompts.status`, `scene_prompts.status`:

```
pending | running | success | failed
```

UI hiển thị thêm `retrying` (= running với attempts > 1) và `skipped` (= success, bị bỏ qua khi Resume) — đây là trạng thái **suy ra ở UI**, không lưu riêng trong DB, tránh 2 nguồn sự thật.

#### `PipelineTask.task_type`

```
SPLIT_SRT
DETECT_CHARACTERS
GENERATE_CHARACTER_PROMPTS
SELECT_RELEVANT_CHARACTERS
GENERATE_SCENE_PROMPT
EXPORT
```

#### Error codes

Giá trị hợp lệ cho field `.error` (không phải cột riêng, không phải enum DB):

```
INVALID_API_KEY
MODEL_NOT_AVAILABLE
NETWORK_ERROR
TIMEOUT
RATE_LIMIT
CONTEXT_TOO_LARGE
INVALID_JSON
EMPTY_RESPONSE
API_ERROR
DATABASE_ERROR
EXPORT_ERROR
```

**Format thật đã lưu (Phase 12, xem Changelog):** cột `error` (`character_prompts`/`scene_prompts`/`pipeline_tasks`) lưu `"<CODE>: <detail message>"` — luôn bắt đầu bằng đúng 1 trong 11 giá trị trên, theo sau là message mô tả cụ thể (giữ nguyên từ Phase 3-9, hữu ích để debug), không phải bare code đứng một mình. `src/shared/errorCode.ts` (`formatStoredError()`/`parseStoredError()`) là nguồn tạo/đọc format này.

---

## Ràng buộc dữ liệu quan trọng

- `srt_blocks.block_index` và `scene_prompts.block_index` phải map 1:1 tuyệt đối — enforce bằng unique constraint `scene_prompts(project_id, srt_block_id)`.
- `characters.character_id` unique trong phạm vi project, là business key tái sử dụng ở `character_prompts.character_id` và trong `scene_prompts.relevant_character_ids`.
- Xoá `projects` → xoá thật toàn bộ `srt_blocks`, `characters`, `character_prompts`, `scene_prompts`, `pipeline_tasks` liên quan (cascade).
- `attempts` không được vượt `max_retry` (default 1, xem Changelog 2026-08-10) trước khi task chuyển `failed` vĩnh viễn.
- Prompt snapshot (`projects.*_prompt_snapshot`) chỉ được set **một lần** khi Run đầu tiên — Resume/Retry không được ghi đè bằng `AppSettings.promptSettings` hiện hành.
- API key không bao giờ lưu plaintext trong `localStorage`, JSON settings, SQLite hay source code — chỉ qua `safeStorage`/Keychain từ Main Process.

---

## Conventions

- UUID cho tất cả primary key.
- Mỗi lần delete là xoá thật (hard delete), không phải soft delete.
- Timestamps: `created_at`, `updated_at` trên mọi table.
- Business key con người đọc được (`character_id` dạng `@Name`) luôn tách biệt khỏi `id` (uuid) — uuid dùng cho FK nội bộ, business key dùng để hiển thị/tham chiếu trong nội dung prompt.
- Dữ liệu không nhạy cảm nhưng không cần quan hệ (global settings, prompt templates editable) đi qua `electron-store`, không vào SQLite.
- Dữ liệu nhạy cảm (API key) chỉ đi qua secure storage của OS (`safeStorage`), không bao giờ vào SQLite hay electron-store.
- Trạng thái suy ra được ở tầng UI (`retrying`, `skipped`) không lưu thành cột riêng trong DB — tránh 2 nguồn sự thật.

---

## Open Questions

1. `pipeline_tasks.entity_id` không có FK cứng (polymorphic) — chấp nhận rủi ro integrity ở V1, hay nên tách thêm `entity_type` + validate ở application layer?
2. Semantics của `attempts`: tính từ 0 hay 1? Task "failed" vĩnh viễn khi `attempts >= max_retry` hay `> max_retry`? **Trả lời một phần ở Phase 9 (không nhất quán giữa 2 bảng):** `character_prompts`/`scene_prompts.attempts` ghi đúng số lần thử nội bộ thật sự đã chạy (1..`max_retry`, do `CharacterService`/`ScenePromptService` tự đếm trong vòng lặp retry của chính chúng — batch fail sau khi hết `max_retry` thì `attempts = max_retry`). `pipeline_tasks.attempts` (dùng thật từ Phase 9, chỉ cho 3 task cấp dự án) lại mang nghĩa khác: `0` khi `running`, `1` khi `success`/`failed` — đại diện "đã chạy lệnh Run/Resume này bao nhiêu lần", không phải số lần retry nội bộ (số đó đã nằm trong message lỗi, ví dụ "failed after 3 attempt(s)"). Hai ý nghĩa khác nhau cho cùng tên cột `attempts` ở 2 loại bảng — chưa thống nhất, cân nhắc đổi tên hoặc tài liệu hoá rõ hơn nếu gây nhầm lẫn khi mở rộng.
3. Khi Regenerate Character Detection — tạo `pipeline_tasks` mới hay reset task cũ về `pending` + tăng `attempts`? Ảnh hưởng tới việc có giữ lịch sử lần chạy trước hay không.
4. `scene_prompts.relevant_character_ids` (JSON array) có cần thêm bảng join chuẩn hoá nếu V1.1 muốn filter "scene theo nhân vật" (đã nêu trong roadmap V1.1)?
5. (Phát hiện ở Phase 6) `characters.name` hiện luôn trùng giá trị với `characters.character_id` trên thực tế — default prompt Character Detection (spec.md mục 28) chỉ yêu cầu LLM trả về 1 field `"name"` dạng `@ID`, không có tên người riêng biệt. Có nên gộp `name` vào `character_id` (bỏ 1 cột) hay giữ tách như hiện tại để dành chỗ cho trường hợp tương lai LLM trả tên người thật? Chưa cần quyết ở V1 vì không ảnh hưởng hành vi, chỉ dư 1 cột luôn trùng dữ liệu.

---

## Changelog

### Phase 22 — Post-V1: separate Scene/Image Generation prompt for "No Characters" channels (2026-08-11)

Ngoài phạm vi V1 gốc, theo yêu cầu trực tiếp của user (bước tạo ảnh với channel "Có nhân vật" gọi thêm 1 prompt nội bộ để xác định nhân vật liên quan — muốn 1 prompt Scene/Image Generation riêng, không nhắc tới nhân vật, cho channel "No Characters" thay vì tái dùng prompt cũ với phần nhân vật luôn rỗng). **Đây là schema change thật** (thêm 1 cột) — không hỏi lại qua `AskUserQuestion` vì yêu cầu đã đủ cụ thể, nhưng có tự cân nhắc kỹ chỗ khó nhất (chi tiết ngay dưới) trước khi code. Chi tiết đầy đủ (không phải schema): `context/plan.md` Phase 22.

- **Migration mới `0007_add_scene_generation_prompt_no_characters`** — `ALTER TABLE channels ADD COLUMN scene_generation_prompt_no_characters TEXT NOT NULL DEFAULT '<default prompt text>'` (escape y hệt cách `0004_add_channels` seed 3 prompt gốc). Backfill bằng chính prompt mặc định mới (không phải chuỗi rỗng) để channel cũ chuyển sang `has_characters=false` sau này vẫn có ngay 1 prompt dùng được.
- **Không thêm cột nào vào `projects`** — quyết định thiết kế cốt lõi: `resolvePipelineRuntime()` (`src/main/pipelineRuntime.ts`) chọn đúng 1 trong 2 chuỗi prompt (`channel.sceneGenerationPrompt` hay `channel.sceneGenerationPromptNoCharacters`) dựa vào `project.hasCharacters` **trước khi** đưa vào `runtime.promptSettings.sceneGeneration` — mọi thứ downstream (`PipelineService`, `ProjectService.applyFirstRunSnapshotIfMissing`, cột `projects.scene_generation_prompt_snapshot` có sẵn) chỉ thấy đúng 1 chuỗi đã resolve sẵn, không cần biết có 2 template. Tránh được 1 cột snapshot thừa vì `hasCharacters` của project cố định vĩnh viễn sau khi tạo (mục 6.5) — không bao giờ cả 2 template cùng áp dụng cho 1 project.
- **Bug tự phát hiện khi rà lại code trước khi coi là xong (không có trong yêu cầu ban đầu):** `ScenePromptService.generate()`/`retry()` có sẵn 1 guard validate placeholder (`getMissingPlaceholders('sceneGeneration', params.promptTemplate)`) hard-code key `'sceneGeneration'` — nếu không sửa, guard này sẽ báo lỗi "thiếu `{{RELEVANT_CHARACTERS}}`/`{{RELEVANT_CHARACTER_PROMPTS}}`" cho **mọi** prompt "No Characters" hợp lệ (vì đúng theo thiết kế, prompt đó không có 2 placeholder này) — phá vỡ hoàn toàn pipeline cho channel "No Characters" ngay khi có prompt riêng. Sửa bằng cách chọn key theo `project.hasCharacters` (giống `validateProjectForRun`). Có unit test riêng xác nhận (`scenePromptService.test.ts`) — nếu thiếu fix này, test đó fail ngay.
- **`AppSettings.promptSettings.sceneGenerationNoCharacters`** (electron-store) — default template khi tạo channel mới, cạnh 3 prompt cũ. **Bug tiềm ẩn khác tự phát hiện:** electron-store/`conf` chỉ shallow-merge `defaults` vào file JSON đã có sẵn (`Object.assign`, không deep) — user nâng cấp từ bản cũ sẽ có `promptSettings` thiếu hẳn field mới này trên đĩa, `getAppSettings()` trả về `undefined` cho field đó nếu đọc thẳng. Sửa bằng cách spread `DEFAULT_SETTINGS.promptSettings` trước rồi mới ghi đè bằng `s.get('promptSettings')` thật trong `getAppSettings()` — an toàn cho mọi field tương lai thêm sau này, không chỉ field này.
- **UI:** Settings > Prompts (`PromptsSettingsPage.tsx`) thêm card thứ 4 "Scene / Image Generation (No Characters)" — tái dùng nguyên `PromptEditorCard` (đã generic theo `PromptKey` từ trước, không cần sửa). `ChannelForm.tsx` đổi từ luôn hiện card "Scene / Image Generation Prompt" sang **hiện đúng 1 trong 2 card** tuỳ checkbox "Has Story Characters" (khác 2 card Character Detection/Generation vốn chỉ ẩn/hiện đơn thuần — ở đây có 1 card thay thế cho card kia, không phải ẩn không thay).
- Verify: `tsc --noEmit` sạch cả 3 tsconfig, `eslint` sạch — xem `context/plan.md` Phase 22 cho số liệu `vitest` cụ thể.

### Phase 21 — Post-V1: Channel option "No Characters" (2026-08-11)

Ngoài phạm vi V1 gốc, theo yêu cầu trực tiếp của user (bên cạnh kịch bản có nhân vật cốt truyện cụ thể — giữ làm default — cần thêm 1 lựa chọn cho transcript không có nhân vật/cốt truyện, bỏ qua các bước liên quan tới nhân vật). **Đây là schema change thật** (thêm 2 cột boolean) — đã hỏi lại qua `AskUserQuestion` 2 quyết định UX trước khi implement theo CLAUDE.md (ẩn hẳn vs disable 2 ô prompt nhân vật trong Channel form khi tắt option — chọn ẩn hẳn; ẩn hẳn vs giữ-empty-state-khác cho tab Characters trong sidebar khi project thuộc channel này — chọn ẩn hẳn). Chi tiết đầy đủ (không phải schema): `context/plan.md` Phase 21.

- **Migration mới `0006_add_has_characters`** — `ALTER TABLE channels/projects ADD COLUMN has_characters INTEGER NOT NULL DEFAULT 1` (không có `REFERENCES` nên hợp lệ dù bảng đã có row, cùng cách `variance_percent` được thêm ở migration `0005`). Mọi channel/project đã tồn tại backfill về `true` (hành vi hiện tại không đổi) — "No Characters" là lựa chọn opt-in cho channel mới, không hồi tố.
- **Phát hiện quan trọng khi khảo sát code trước khi implement, giảm phạm vi thay đổi:** `ScenePromptService.generateBatch()` đã tự xử lý tốt `characters.length === 0` từ trước (gán thẳng `characterIds: []`, không gọi Relevant Character Selector; `buildRelevantCharactersSection([])`/`buildRelevantCharacterPromptsSection([], ...)` trả `(none)`), và `formatCharacterPromptsFile([], [])` (`exportFormat.ts`) đã trả chuỗi rỗng — **không cần sửa** `ScenePromptService`/`generateScenePrompt.ts`/`selectRelevantCharacters.ts`/`ExportService`. Chỉ cần chặn `PipelineService.runProjectInternal()`'s Step 2 (Detect Characters) không gọi `characterService.detect()` khi `!project.hasCharacters` (`ensureTaskSuccess()` thẳng) — Step 3 (Character Prompts) tự skip theo vì `characters.length` luôn 0.
- **`validateProjectForRun()`** (`src/shared/validateRun.ts`) bỏ qua 2 check "Character Detection/Generation prompt trống/thiếu placeholder" khi `project.hasCharacters === false` — 2 prompt đó vẫn tồn tại trên channel (không bắt buộc rỗng), chỉ đơn giản không được dùng tới.
- **UI:** `ChannelForm.tsx` thêm checkbox "Has Story Characters" (mặc định bật cho channel mới) — tắt đi thì **ẩn hẳn** 2 card Character Detection Prompt/Character Generation Prompt khỏi form (React Hook Form giữ nguyên giá trị cũ cho field không mount nên vẫn submit hợp lệ, không cần nới lỏng validate phía `ChannelService`). `Sidebar.tsx` ẩn hẳn mục "Characters" khỏi nav khi `currentProject.hasCharacters === false`; `CharactersPage.tsx` có empty-state riêng phòng trường hợp vào thẳng URL. `ProcessingPage.tsx`/`OverviewPage.tsx` ẩn các card/metric liên quan tới Character. `ChannelsPage.tsx` thêm badge "No Characters" trên card channel tương ứng.
- Verify: `tsc --noEmit` sạch cả 3 tsconfig, `eslint` sạch; `vitest` — xem `context/plan.md` Phase 21 cho số liệu cụ thể.

### Phase 20 — Post-V1: Export folder nested under Channel name (2026-08-11)

Ngoài phạm vi V1 gốc, theo yêu cầu trực tiếp của user (channel dùng Export Folder ở setting chung, nhưng project chạy trong channel nào thì output phải nằm trong 1 thư mục con mang tên channel đó). **Không phải schema change** — không thêm/bớt/đổi field/table nào, chỉ đọc thêm `channels.name` (đã có sẵn từ Phase 18) qua `project.channelId` khi build đường dẫn export. Chi tiết đầy đủ (không phải schema): `context/spec.md` mục 21.

- **`ExportService.ts`** thêm `resolveFolderNames()` (private, dùng chung bởi `resolveFolderPath()`/`export()`) — build đường dẫn `${targetParentDir}/${Channel_Name}/${Project_Name}/` thay vì `${targetParentDir}/${Project_Name}/` cũ. Đọc tên channel **hiện hành** qua `findChannelById(project.channelId)`, không snapshot — cùng nguyên tắc `Project_Name` vốn cũng luôn là tên hiện hành (không snapshot).
- **`sanitizeProjectFolderName()` đổi tên thành `sanitizeFolderName(name, fallback)`** (`src/shared/exportFormat.ts`) — thêm tham số `fallback` vì giờ dùng chung cho cả tên channel (`'Untitled_Channel'`) lẫn tên project (`'Untitled_Project'`), logic sanitize không đổi.
- **`ExportPage.tsx`** (preview) gọi thêm `channels.get(currentProject.channelId)` để hiện đúng `Channel_Name/Project_Name/` trong card "Output Folder" — khớp 100% với đường dẫn thật nhờ dùng chung `sanitizeFolderName()`.
- **Default Export Folder** (Settings > General, `AppSettings.lastExportFolder`) không đổi — vẫn 1 field global duy nhất, chỉ là nơi các thư mục con `Channel_Name/` được tạo bên trong.
- Verify: `tsc --noEmit` sạch cả 3 tsconfig, `eslint` sạch; `vitest` pass — `exportFormat.test.ts` đổi tên describe/test cho `sanitizeFolderName`, `exportService.test.ts` cập nhật path expectation (`{tmpDir}/Default/...` cho project không chỉ định channel) + test mới xác nhận project trong channel tuỳ chỉnh export đúng vào thư mục mang tên channel đó.
- Chưa có bằng chứng end-to-end với Electron app thật (chỉ verify qua `vitest`/`tsc`/`eslint`) — cần user tự chạy Run All cho 1 project thuộc channel không phải Default để xác nhận cấu trúc thư mục thật trên đĩa.

### Phase 19 — Post-V1: Average Characters per SRT + Variance % (2026-08-11)

Ngoài phạm vi V1 gốc, theo yêu cầu trực tiếp của user (nhiều câu bị cắt quá ngắn — đề xuất đổi "Maximum characters per SRT" thành "Average characters per SRT" + biên độ xê dịch %). **Đây là schema change thật** (đổi tên 3 cột + thêm 2 cột mới) — đã hỏi lại 3 quyết định kiến trúc qua `AskUserQuestion` trước khi implement theo đúng CLAUDE.md (biên độ cố định hay field riêng, đổi tên cột hay chỉ đổi label, ưu tiên đạt tối thiểu hay luôn tôn trọng ngưỡng trên), rồi vào Plan Mode viết plan chi tiết chờ user duyệt trước khi code. Chi tiết đầy đủ (không phải schema): `context/spec.md` mục 10.1/11.2/11.3/11.5.

- **Migration mới `0005_rename_avg_characters_and_add_variance`** — `ALTER TABLE ... RENAME COLUMN` cho `projects.max_characters → avg_characters`, `projects.max_characters_snapshot → avg_characters_snapshot`, `channels.max_characters → avg_characters` (SQLite ≥ 3.25, tự cập nhật mọi index/reference nội bộ); `ALTER TABLE ... ADD COLUMN variance_percent INTEGER NOT NULL DEFAULT 30` cho cả `projects` và `channels` (không có `REFERENCES` nên không dính giới hạn "Cannot add a REFERENCES column with non-NULL default value" đã gặp ở `0004_add_channels` — giới hạn đó chỉ áp dụng cho cột có FK).
- **`projects.avg_characters`/`channels.avg_characters`** không còn là giới hạn cứng — `src/main/pipeline/splitSrt.ts`'s `gatherBlocks()` giờ nhắm tới khoảng `[avg × (1 − variance/100), avg × (1 + variance/100)]`, ưu tiên đạt ngưỡng dưới trước khi ngắt block (chấp nhận vượt nhẹ ngưỡng trên) thay vì luôn tôn trọng ngưỡng trên tuyệt đối — đúng quyết định #3 đã hỏi user. `variance_percent = 0` ⇒ khoảng co lại thành 1 điểm ⇒ hành vi y hệt thuật toán cũ.
  **Bug phát hiện khi implement (không có trong plan ban đầu):** bản đầu tiên của `gatherBlocks()` dùng điều kiện `currentLength < min` để quyết định "ưu tiên đạt tối thiểu" — nhưng ở `variance_percent = 0` thì `min === max === avgCharacters`, khiến điều kiện này gần như luôn đúng (currentLength hiếm khi bằng đúng avgCharacters), ép mọi câu gộp vào **1 block duy nhất** bất kể ngưỡng trên, phá vỡ hoàn toàn cam kết "variance 0 = y hệt thuật toán cũ". Lộ ra qua 4 test fail trong `tests/unit/srtSplitter.test.ts` (các case dùng `variance=0` để giữ assertion `<= max` tuyệt đối) + 1 test fail trong `scenePromptService.test.ts` (số block thực tế đổi do `variance` mặc định 30% áp dụng ngay cả khi test không quan tâm tới thuật toán chia). Fix: thêm điều kiện `min < max` vào override (`candidateLength <= max || (currentLength < min && min < max)`) — vô hiệu hoá nhánh "ưu tiên đạt tối thiểu" khi không có khoảng thật sự (`variance = 0`).
- **`AppSettings.avgCharacters`/`variancePercent`** (đổi tên + thêm field, electron-store) — vẫn đóng vai trò default cho **channel mới** (không đổi vai trò, chỉ đổi tên field, xem Changelog Phase 18).
- Range validate mới cho `variancePercent`: **0–90** (`ChannelService.ts`) — 0 = hành vi ngưỡng cứng như cũ, 90 = rất co giãn.
- **UI:** Settings > General thêm ô "VARIANCE (±%)" cạnh "AVERAGE CHARACTERS PER SRT" (đổi tên từ "MAXIMUM..."); `ChannelForm.tsx` (New/Edit Channel) thêm ô tương ứng; `ChannelsPage.tsx` đổi dòng tóm tắt "Max N chars" → "Avg N chars ±M%".
- Verify: `tsc --noEmit` sạch cả 3 tsconfig, `eslint` sạch; `vitest` 300/300 pass — thêm `channelService.test.ts` (2 case range `variancePercent`), `migrations.test.ts` (3 case cho `0005` — rename giữ nguyên data cũ trên `projects`/`channels`, backfill `variance_percent=30`, insert mới tự chọn giá trị riêng), `srtSplitter.test.ts` (4 case mới cho semantics average±variance% + case `variance=0` xác nhận không phá vỡ hành vi cũ).
- Chưa có bằng chứng end-to-end với Electron app thật (chỉ verify qua `vitest`/`tsc`/`eslint`) — cần user tự mở app sau khi build lại để xác nhận Settings > General/Channel form + kết quả Split SRT thật (tab SRT) không còn block quá ngắn bất thường.

### Phase 18 — Post-V1: Channels (per-channel settings, projects grouped by channel) (2026-08-10)

Ngoài phạm vi V1 gốc, theo yêu cầu trực tiếp của user (thêm tab Channel, mỗi channel 1 bộ setting riêng, setting chung là default khi tạo channel mới, project dùng setting của channel nó thuộc về). **Đây là schema change thật** (bảng mới + cột mới) — đã hỏi lại 4 quyết định kiến trúc qua `AskUserQuestion` trước khi implement theo đúng CLAUDE.md (phạm vi setting theo channel, copy-lúc-tạo vs tham chiếu sống, cách backfill project cũ, có cho đổi channel sau khi tạo không), rồi vào Plan Mode viết plan chi tiết chờ user duyệt trước khi code. Chi tiết đầy đủ (không phải schema): `context/spec.md` mục 4.2/6/7/8.1.

- **Migration mới `0004_add_channels`** (`src/main/db/migrations/0004_add_channels.ts`) — tạo bảng `channels` (xem field list phía trên), insert đúng 1 row `"Default"` (id cố định, giá trị bằng hằng số default sẵn có trong `ProjectService.ts` + 3 prompt mặc định `shared/prompts.ts`), rồi `ALTER TABLE projects ADD COLUMN channel_id TEXT REFERENCES channels (id)` (**nullable**, không `NOT NULL DEFAULT` trong cùng câu ALTER) + `UPDATE projects SET channel_id = '<Default id>' WHERE channel_id IS NULL` backfill riêng.
  **Phát hiện khi implement (không có trong plan ban đầu):** dự định ban đầu là 1 câu `ALTER TABLE ... NOT NULL REFERENCES channels (id) DEFAULT '<uuid>'` duy nhất (giống pattern `0003_add_scene_batch_size`) — nhưng SQLite từ chối thẳng với lỗi `Cannot add a REFERENCES column with non-NULL default value` bất cứ khi nào bảng `projects` đã có sẵn row (đúng use case chính của migration này: DB thật của user đã có project). Phát hiện qua test thất bại (`tests/unit/migrations.test.ts`, case chạy `0004` sau khi đã insert 1 project — khác `channelService.test.ts`/`projectService.test.ts` vốn chạy `createDatabase(':memory:')` trên DB rỗng nên không lộ ra lỗi này). Fix bằng tách `ADD COLUMN` (nullable) + `UPDATE` backfill — 2 câu SQL riêng thay vì 1, tránh hẳn giới hạn đó.
- **`projects.channel_id`** (uuid, FK → `channels.id`, "required" ở tầng application chứ không phải `NOT NULL` ở tầng DB — xem ghi chú field phía trên) — bảng `projects`.
- **`ProjectService.create()`** đổi signature — `input.channelId` (optional, fallback `DEFAULT_CHANNEL_ID` export từ chính file migration `0004`, để unit test gọi thẳng `ProjectService` không cần sửa hàng loạt ~60 call site); `defaults` thêm 2 field `sceneConcurrency`/`sceneBatchSize` (trước đây 2 field này luôn là hằng số cố định, giờ copy từ channel khi IPC handler resolve được 1 channel thật). **`projects:create` IPC handler** (`projects.ipc.ts`) luôn resolve `channelId` bắt buộc từ Renderer, gọi `ChannelService.get()`, throw nếu không tồn tại — đường thật duy nhất (New Project qua UI) không bao giờ dùng tới fallback nói trên.
- **`resolvePipelineRuntime()`** (`src/main/pipelineRuntime.ts`, dùng bởi `pipeline.ipc.ts`/`queue.ipc.ts` cho Run All/Resume/Retry Failed) đổi từ đọc `model`/`promptSettings` thẳng từ `getAppSettings()` global sang đọc từ **channel của project** (`project.channelId` → `ChannelService.get()`) — đây là chỗ áp dụng thật "project nào nằm trong channel nào thì dùng setting của channel đó" cho pipeline chạy thật, không chỉ lúc tạo project. `exportFolder` vẫn đọc `AppSettings` (ngoài phạm vi channel). Tương tự, `projects.ipc.ts`'s `characters.detect`/`generatePrompts`/`retryPrompt`/`scenePrompts.generate`/`retry` (IPC còn tồn tại nhưng không còn nút UI nào gọi từ Phase 14/15) đổi theo cùng nguồn, tránh lệch dữ liệu với Run All nếu sau này có nút gọi lại.
- **`AppSettings` đổi vai trò sử dụng, không đổi field/type** — xem ghi chú ở mục [Non-DB data shapes](#non-db-data-shapes) phía trên. Không phải schema change: interface `AppSettings` giữ nguyên 100%.
- **`ProjectSummary`/`listProjectSummaries()`** thêm field tính toán `channelName` (JOIN `channels`, không phải cột DB) — Home/Queue row hiện tên channel của mỗi project.
- **IPC mới** `channels.list/get/create/update/delete` (`channels.ipc.ts`, domain file riêng — Channel không phải sub-resource của Project) — chỉ mở rộng `AppApi`/`ipc-types.ts`, không đụng Schema nêu ở tài liệu này ngoài phần đã liệt kê trên. `projects.create` input thêm field bắt buộc `channelId`.
- UI mới (không thuộc Schema): tab **Channels** (`/channels`, `/channels/new`, `/channels/:channelId/edit`) trong `HomeSidebar.tsx`; New Project thêm dropdown Channel bắt buộc (không đổi được sau khi tạo, theo yêu cầu user).
- Verify: `tsc --noEmit` sạch cả 3 tsconfig, `eslint` sạch; `vitest` **291/291 pass** (test mới: `channelService.test.ts` 20 test — CRUD, validate range, chặn xoá channel còn project, chặn xoá channel cuối cùng; `migrations.test.ts` +4 test cho `0004` — tạo Default + backfill, insert mới tự chọn channel, FK chặn channel không tồn tại, FK chặn xoá channel còn project tham chiếu; `projectService.test.ts` +3 test cho fallback/override `channelId`). Chưa có bằng chứng end-to-end với Electron app thật (chỉ verify qua `vitest`/`tsc`/`eslint`) — cần user tự mở app sau khi build lại để xác nhận Channels tab + New Project channel picker hoạt động đúng trên UI thật.

### Phase 17 — Post-V1: thêm setting Scene Generation Batch Size (2026-08-10)

Ngoài phạm vi V1 gốc, theo yêu cầu trực tiếp của user (chỉ vào card "Pipeline Tuning" hỏi thêm setting "gom bao nhiêu SRT vào mỗi prompt tạo ảnh"). **Đây là schema change thật** (thêm cột) — đã hỏi lại phạm vi giá trị hợp lệ qua `AskUserQuestion` trước khi implement theo đúng CLAUDE.md, user chọn range 1–20. Chi tiết đầy đủ (không phải schema): `context/spec.md` mục 17/17.1/33.

- **Migration mới `0003_add_scene_batch_size`** (`src/main/db/migrations/0003_add_scene_batch_size.ts`) — `ALTER TABLE projects ADD COLUMN scene_batch_size INTEGER NOT NULL DEFAULT 10;`. Backfill mọi project có sẵn về `10` (đúng hành vi cũ của hằng số `SCENE_PROMPT_BATCH_SIZE` mà field này thay thế) — project mới tạo sau đó luôn nhận giá trị tường minh từ `ProjectService.create()` (`DEFAULT_SCENE_BATCH_SIZE = 10`), giống hệt convention `max_retry`/`scene_concurrency`. `DEFAULT 10` trong SQL chỉ là lưới an toàn cho riêng bước backfill 1 lần này, không phải nguồn giá trị thật cho insert mới.
- **`projects.scene_batch_size`** (integer, required, default 10, range 1–20 validate ở application layer — `ProjectService.updatePipelineSettings()`) — bảng `projects`, xem field list phía trên.
- **`ScenePromptService.generate()`** đổi từ gọi `chunkSrtBlocks(blocks)` (dùng fallback default `SCENE_PROMPT_BATCH_SIZE = 10` của hàm thuần) sang `chunkSrtBlocks(blocks, project.sceneBatchSize)` — batch size giờ đọc từ DB per-project thay vì hằng số cố định app-wide. `SCENE_PROMPT_BATCH_SIZE` không bị xoá (vẫn là default của `chunkSrtBlocks()` cho caller/test không truyền `batchSize` tường minh) nhưng không còn là giá trị thật app dùng.
- **Settings > Advanced > Pipeline Tuning** thêm ô "SCENE GENERATION BATCH SIZE" (cùng card với Scene Generation Concurrency) — `pipelineSettingsSchema` (Zod) thêm field `sceneBatchSize` (int, 1–20). `updatePipelineSettings` IPC/service/query đổi từ nhận 2 field (`maxRetry`, `sceneConcurrency`) sang 3 field (thêm `sceneBatchSize`) trong cùng 1 lời gọi — đổi shape thật (khác Phase 16, nơi shape giữ nguyên vì chỉ bớt UI).
- Verify: `tsc --noEmit` sạch cả 3 tsconfig, `eslint` sạch; `vitest` **264/264 pass** (2 test mới cho migration `0003` — backfill đúng `10` cho project cũ, insert mới nhận giá trị riêng; 1 test mới cho `ScenePromptService` xác nhận `sceneBatchSize` tuỳ chỉnh thật sự đổi số request gửi lên; test `updatePipelineSettings` cũ mở rộng thêm assertion cho `sceneBatchSize` + validate range 1–20; các test khác gọi thẳng `updatePipelineSettings()` để set `maxRetry` cao (từ Phase 16) cập nhật thêm `sceneBatchSize` bắt buộc trong payload).
- Chưa có bằng chứng end-to-end với Electron app thật cho riêng thay đổi này (chỉ verify qua `vitest`/`tsc`/`eslint`) — cần user tự mở Settings > Advanced sau khi build lại để xác nhận ô mới hoạt động đúng trên UI thật.

### Phase 16 — Post-V1: hạ Max Retry mặc định, bỏ UI chỉnh Max Retry (2026-08-10)

Ngoài phạm vi V1 gốc, theo yêu cầu trực tiếp của user ("Để retry là 1, không cần setting nữa"). Chi tiết đầy đủ (không phải schema): `context/spec.md` mục 10.3/33.

- **`projects.max_retry` đổi *giá trị mặc định*, không đổi field/type/constraint** — `DEFAULT_MAX_RETRY` (`src/main/services/ProjectService.ts`) hạ từ `3` xuống `1`. Cột vẫn `integer required`, `updatePipelineSettings()` vẫn validate `>= 1` như cũ (không đổi range/constraint nào) — chỉ đổi giá trị hằng số dùng khi tạo project mới.
- **Bỏ hẳn ô "Max Retry" khỏi Settings > Advanced > Pipeline Tuning** (`AdvancedSettingsPage.tsx`) — user không còn cách nào tự chỉnh `max_retry` qua UI, mọi project mới đều cố định 1 lần thử/task-batch. `pipelineSettingsSchema` (Zod, `src/renderer/lib/validation/pipelineSettings.schema.ts`) bớt field `maxRetry`, chỉ còn validate `sceneConcurrency`.
  **Không phải schema change, không xoá cơ chế:** `ProjectService.updatePipelineSettings()`, cột `max_retry`, và toàn bộ retry loop (`CharacterService`/`ScenePromptService`) giữ nguyên 100% — form giờ luôn gửi `maxRetry: currentProject.maxRetry` (pass-through, không đổi) cùng `sceneConcurrency` đã sửa trong 1 lời gọi `updatePipelineSettings` như cũ (backend vẫn yêu cầu cả 2 field cùng lúc, không đổi shape). Unit test vẫn gọi thẳng `updatePipelineSettings()` để set `maxRetry` cao hơn 1 khi cần kiểm thử logic nhiều lần thử (backoff, escalate context-too-large, Pause giữa lúc retry) — chỉ bề mặt UI biến mất, không phải cơ chế.
- Verify: `tsc --noEmit`/`eslint` sạch xuyên suốt; `vitest` **261/261 pass** (2 assertion cũ giả định default `3` sửa thành `1`; 3 test cần thật sự nhiều lần thử — rate-limit backoff, Context Too Large escalation, Pause giữa lúc retry trong 1 batch — tự nâng `maxRetry` qua `updatePipelineSettings()` ngay trong test thay vì dựa vào default toàn cục).

### Phase 15 — Post-V1: đồng bộ Queue/Dashboard, xoá Resume, chuẩn hoá format prompt, đóng gói Windows (2026-08-10)

Ngoài phạm vi V1 gốc, cùng phiên với Phase 14 — phát sinh trực tiếp từ user tự chạy/test app thật và report từng vấn đề qua screenshot. Chi tiết đầy đủ (không phải schema): `context/plan.md` → Phase 15, `context/spec.md` → mục 1/6.2/6.4/7/8.2/8.5/8.6/24/30/37/39.

- **Có 1 migration mới — lần đầu tiên kể từ `0001_init` (Phase 2, các Phase 3–14 đều xác nhận "không có migration mới").** `0002_normalize_scene_prompt_newlines` (`src/main/db/migrations/0002_normalize_scene_prompt_newlines.ts`).
  **Không phải structural schema change:** không `ALTER TABLE`, không thêm/bớt/đổi kiểu cột hay bảng nào — chỉ đúng 1 câu `UPDATE scene_prompts SET prompt = ... WHERE prompt LIKE '%'||char(10)||'%' OR ...`, thay ký tự xuống dòng thật (`\r`/`\n`) trong giá trị cột `prompt` (đã khai báo `text`, `optional` — giữ nguyên) bằng khoảng trắng rồi gộp khoảng trắng thừa. Chạy đúng 1 lần, tracked qua bảng `_migrations` như `0001_init`, idempotent.
  **Lý do:** phát hiện qua nhiều lần export thật — model đôi khi trả prompt có xuống dòng thật giữa các panel dù prompt template yêu cầu nằm trên 1 dòng duy nhất (spec.md mục 30 rule 10, thêm mới ở Phase 15). Bản vá ở tầng code (`normalizePromptText()`, `src/main/pipeline/generateScenePrompt.ts`) chỉ áp dụng cho prompt sinh **mới** — batch đã `status=success` từ trước không bao giờ tự chạy lại (spec.md mục 19.2, "không chạy lại success task"), nên dữ liệu cũ sẽ giữ format sai vĩnh viễn nếu không dọn riêng. Migration là cách duy nhất chạm vào dữ liệu **đã có sẵn** trong DB thật của user mà không cần gọi lại LLM (tốn phí, có thể đổi nội dung prompt).
- **Không có thay đổi field/table/constraint nào khác trong Phase 15.** Toàn bộ phần còn lại (đồng bộ Queue↔Dashboard, xoá nút Resume/toolbar Transcript/nút Generate Image Prompts, thêm Delete All/Open in Folder, đổi format file export, bắt đầu đóng gói Windows) chỉ đọc/ghi cột đã có sẵn hoặc là thay đổi UI/IPC-surface/build-config thuần, không đụng `Schema` (SQLite hay Non-DB data shapes) nêu ở tài liệu này:
  - **`projects.get(id)`** (IPC mới, `context/spec.md` mục 4.2) — đọc thuần bảng `projects` qua `ProjectService.get()` (đã có sẵn nội bộ từ trước, giờ mới expose ra IPC để `usePipelineStore`'s live status refresh dùng thay `projects.open()` — tránh side-effect ngoài ý muốn của `open()`, xem mục dưới). Không field/type mới.
  - **`ProjectService.open()`** thêm tham số bắt buộc `isActuallyRunning` — chỉ đổi *điều kiện* khi nào downgrade `projects.status: processing → paused` (chỉ downgrade khi thật sự không có gì đang chạy, tránh downgrade nhầm 1 project đang chạy thật qua Run Queue). Cột `status` (enum, đã khai báo ở [`Project.status`](#projectstatus)) không đổi field/type/giá trị hợp lệ nào — chỉ đổi *khi nào* application layer ghi giá trị `paused` vào đó, cùng loại quyết định đã ghi nhiều lần ở các Changelog phase trước cho các cột khác.
  - **`AppSettings.promptSettings.sceneGeneration`** (default value, `src/shared/prompts.ts`) đổi *nội dung* prompt mặc định (siết format `@Character_ID [Visual DNA]`, đánh số panel, ép 1 dòng duy nhất — spec.md mục 30) — cùng loại quyết định đã ghi ở Changelog Phase 6 cho cả 3 prompt default: field vẫn giữ nguyên `type: string` như interface `AppSettings` đã khai báo, chỉ đổi giá trị mặc định.
  - `formatImagePromptsFile()` (`src/shared/exportFormat.ts`, đổi format file `image_prompts.txt` xuất ra đĩa — spec.md mục 24) là hàm format thuần, không đọc/ghi DB — không liên quan `Schema`.
  - Không có field mới trong `AppSettings`/`SecureCredential`/`ModelInfo`, không đụng `electron-builder.yml`/`package.json` (build config, ngoài phạm vi tài liệu này).
- Verify: `tsc --noEmit`/`eslint` sạch xuyên suốt; `vitest` từ 243 (baseline Phase 14) → **248/248 pass** — riêng cho migration `0002`: 3 test mới (`tests/unit/migrations.test.ts`), verify trực tiếp qua `node:sqlite` (built-in Node) khi `better-sqlite3` bị khoá ABI bởi môi trường dev lúc đó, không phải giả định suông. 2 test còn lại không liên quan `Schema` (`ProjectService.open()` không downgrade khi đang chạy thật; `normalizePromptText()`).

### Phase 14 — Post-V1: dọn UI thừa + Run Queue nhiều project + Delete-while-running (2026-08-10)

Ngoài phạm vi V1 gốc (V1 đã hoàn thành ở Phase 13) — phát sinh trực tiếp từ yêu cầu user trong lúc tự chạy/test app thật trên Windows sau khi V1 xong, không có kế hoạch trước. Chi tiết đầy đủ (không phải schema): `context/plan.md` → Phase 14, `context/spec.md` → mục 6.4/7/8.3/8.4/8.6/8.7/21/37.

- **Không có migration mới.** Xác nhận bằng cách kiểm tra `src/main/db/migrations/`: vẫn chỉ có đúng 1 migration (`0001_init`, từ Phase 2) — không bảng/cột/index nào được thêm/sửa/xoá. Toàn bộ Phase 14 (dọn 3 nút thao tác thủ công, auto-export, Run Queue, Delete-while-running) chỉ đọc/ghi các bảng/field đã có sẵn, hoặc là state runtime thuần Renderer/in-memory.
- **`AppSettings.lastExportFolder` đổi *ý nghĩa sử dụng*, không đổi field/type** — từ "gợi ý `defaultPath` cho dialog chọn thư mục, hỏi lại mỗi lần export" (Phase 11) sang **"Default Export Folder"**: cấu hình đúng 1 lần ở Settings > General (nút Browse, IPC mới `settings.chooseExportFolder`), dùng thẳng cho mọi lần export tự động sau đó, không còn dialog nào ngoài lần đầu tiên chưa từng cấu hình (lúc đó tự fallback về Documents rồi lưu lại, không hỏi — vì lần export tự động này chạy không có tương tác người dùng, có thể do Run Queue kích hoạt).
  **Không phải schema change:** field vẫn giữ nguyên `string | null` như đã khai báo từ Phase 1 — cùng loại quyết định đã ghi ở chính Changelog Phase 11 cho field này (khi nó lần đầu được đọc/ghi thật), và ở Phase 9 cho `selected_model`.
- **Cân nhắc nhưng không thêm bảng/field mới cho Run Queue** (`QueueService`, tính năng hoàn toàn mới — chạy nhiều project tuần tự, project kế tiếp tự chạy khi project hiện tại xong).
  **Lý do:** đã hỏi lại user trước khi làm (theo đúng CLAUDE.md) — xác nhận queue **không cần sống sót qua việc tắt/mở lại app**, nên toàn bộ trạng thái (`queued: string[]`, `currentProjectId: string | null`) chỉ giữ **in-memory** trong `QueueService` (`src/main/services/QueueService.ts`), mất khi tắt app — quyết định có chủ đích, không phải thiếu sót. Không có bảng `run_queue`/tương tự trong SQLite, không có field mới trong `AppSettings`.
- **`PipelineService` thêm `runningPromises: Map<projectId, Promise<void>>`** (song song với `controllers` map đã có từ Phase 9) để hỗ trợ `stopAndWait()` (method mới, đứng sau nút **Delete** thay cho Pause/Cancel khi 1 project đang chạy — spec.md mục 37) — đợi thật sự cho tới khi run đang chạy dở settle hẳn rồi mới cho phép Main xoá row `projects` tương ứng, tránh 1 write dở dang (`upsertPipelineTask`/`upsertCharacterPrompt`/...) vi phạm foreign key vào project vừa bị xoá.
  **Không phải schema change:** `runningPromises` là state runtime thuần trong bộ nhớ Main Process (như `controllers` map đã có từ Phase 9), không persist xuống SQLite hay `AppSettings` — không bảng/field/constraint nào trong tài liệu này bị đụng tới.
- **`getPipelineService()`/`getQueueService()`** (2 singleton getter mới, cùng pattern `getDatabase()` ở `DatabaseService.ts` từ Phase 1) đảm bảo `pipeline.ipc.ts` và `queue.ipc.ts` dùng chung đúng 1 `PipelineService`/`QueueService` — không liên quan Schema, chỉ là kiến trúc Main Process (xem `context/spec.md` mục 4).
- **`export.project` (IPC) bị xoá hẳn**, thay bằng `export.getFolderPath` (chỉ đọc); `queue.add`/`queue.remove`/`queue.list`/`queue.onUpdate` (IPC mới) và `settings.chooseExportFolder` (IPC mới) — tất cả chỉ mở rộng/thu hẹp bề mặt `AppApi`/`ipc-types.ts`, không đụng tới `Schema` (SQLite hay Non-DB data shapes) nêu ở tài liệu này, cùng loại quyết định đã ghi cho các IPC method mới ở những Changelog phase trước.
- **Xoá UI thuần renderer, không ảnh hưởng Schema:** nút "Split SRT"/"Detect Characters"/"Generate Character Prompts" (3 nút thao tác thủ công đứng thay Run All từ Phase 5-7); 2 nút Pause/Cancel (thay bằng Delete); action Rename/Show in Finder/Export và field Model hiển thị ở Home row. Toàn bộ IPC backend đứng sau các nút này (`srt.split`, `characters.detect`, `characters.generatePrompts`, `pipeline.pause`, `pipeline.cancel`, `projects.rename`) **vẫn còn nguyên**, chỉ không còn UI nào gọi tới — không table/field nào trong SQLite/`AppSettings` bị đụng tới bởi các thay đổi UI này. `RenameProjectModal`/`renameProjectSchema` (component + validation schema cục bộ trong Renderer, không phải Schema của tài liệu này) bị xoá theo vì không còn nơi nào dùng.
- Verify: `tsc --noEmit`/`eslint` sạch xuyên suốt; `vitest` từ 233 → **243/243 pass** (thêm test cho `QueueService` và `PipelineService.stopAndWait()`, không test nào đụng tới schema/migration vì không có gì để test ở tầng đó).

### Phase 13 — Polish: Responsive, Animation, Edge Cases (2026-08-09)

- **Không có thay đổi schema nào.** Xác nhận bằng cách kiểm tra `src/main/db/migrations/`: vẫn chỉ có đúng 1 migration (`0001_init`, từ Phase 2) — không bảng/cột/index nào được thêm/sửa/xoá. Phase 13 là phase polish thuần UI (responsive sidebar/drawer, progress bar theo DESIGN.md, focus states, fix layout tràn ở `ProjectsListPage`) + verify edge case (transcript rỗng, transcript cực lớn, 0 characters, không SRT, đóng app giữa lúc export) — không service/pipeline nào trong phase này đọc/ghi field mới hay đổi kiểu dữ liệu.
- **`useUiStore` (Zustand, `src/renderer/stores/useUiStore.ts`) đổi field `sidebarCollapsed` (scaffold từ Phase 1, chưa từng được import ở đâu) thành `isSidebarOpen`/`toggleSidebar`/`closeSidebar`, dùng thật để điều khiển drawer responsive.**
  **Không phải schema change:** đây là UI state thuần renderer-side (bật/tắt drawer khi resize dưới breakpoint `lg`), không persist xuống `AppSettings`/`electron-store` (không đụng `uiPreferences`, field generic đã có sẵn từ đầu trong `AppSettings` — mục [Non-DB data shapes](#non-db-data-shapes) — vẫn `Record<string, unknown>` rỗng, chưa có key nào thật sự dùng), không persist xuống SQLite. Mất trạng thái khi đóng app là hành vi đúng ý (không cần nhớ drawer đang mở hay đóng giữa các phiên).
- **`BrowserWindow.minWidth` (`src/main/index.ts`) đổi từ `1024` xuống `768`** — cấu hình cửa sổ Electron, không phải dữ liệu ứng dụng (không nằm trong `AppSettings`/SQLite ở tài liệu này). Lý do: `1024` trùng breakpoint `lg` mà `.stitch/DESIGN.md`'s "Responsive Behavior" dùng làm điểm Sidebar collapse thành drawer, khiến cửa sổ không bao giờ resize được tới ngưỡng đó — tính năng responsive vừa thêm không thể trigger được trên thực tế. Ghi lại ở đây để nhất quán với convention "mọi thay đổi thật, kể cả không phải schema, đều có lý do trong Changelog" đã áp dụng xuyên suốt các phase trước; xem thêm `context/spec.md` mục 3.1.
- Không có IPC method mới, không có field mới trong `AppApi`/`ipc-types.ts` — Phase 13 không mở rộng bề mặt IPC nào.

### Phase 12 — Regenerate + Error Handling Polish (2026-08-09)

- **Không có thay đổi schema nào.** Xác nhận bằng cách kiểm tra `src/main/db/migrations/`: vẫn chỉ có đúng 1 migration (`0001_init`, từ Phase 2) — không bảng/cột/index nào được thêm/sửa/xoá. Toàn bộ Phase 12 (`classifyError`, chunking Character Detection, batch-split Character Generation, trim escalation Scene Generation, backoff, Regenerate) chỉ đọc/ghi các cột đã có sẵn.
- **Cột `error` (`character_prompts`/`scene_prompts`/`pipeline_tasks`) đổi *giá trị* được ghi vào, không đổi field/type/constraint:** từ chỉ message thô (Phase 3-9) sang `"<CODE>: <detail message>"`, với `CODE` luôn là 1 trong 11 giá trị đã liệt kê sẵn ở mục [Error codes](#error-codes) từ đầu dự án (enum `ErrorCode` trong `src/shared/enums.ts` cũng có sẵn từ đầu, tới giờ mới thật sự dùng).
  **Không phải schema change:** cột `error` vẫn giữ nguyên `string`, `optional` như đã khai báo — chỉ là quyết định ở application layer (`classifyError()` + `formatStoredError()`, `src/main/pipeline/errorClassification.ts`/`src/shared/errorCode.ts`) về *nội dung* ghi vào, cùng loại quyết định đã ghi cho `character_prompts.prompt` (giữ giá trị cũ khi fail, Changelog Phase 7) hay `characters.character_id`/`name` (Changelog Phase 6). Cân nhắc thêm cột `error_code` riêng (tách khỏi `error` message) nhưng chọn gộp vào 1 cột string hiện có để không phải thêm cột — schema.md mục Error codes vốn đã mô tả `.error` là nơi chứa 1 trong 11 giá trị này, prefix-format chỉ là cách hiện thực hoá đúng mô tả đó mà không mất phần detail message đã hữu ích từ trước.
- **`character_prompts` giờ luôn bị xoá sạch cùng lúc với `characters` mỗi khi Character Detection chạy lại** (`CharacterService.detect()`, cùng 1 transaction với `deleteCharactersByProjectId`) — trước đó chỉ `characters` bị xoá+insert lại, `character_prompts` (không có FK cứng tới `characters`, chỉ liên kết qua business key `character_id`) bị bỏ sót nên 1 lần regenerate đổi/xoá Character ID để lại row mồ côi vĩnh viễn trong DB thật (chỉ bị xoá ở local state UI). Phát hiện khi làm tính năng Regenerate (spec.md mục 20).
  **Không phải schema change:** không có FK/constraint nào bị thêm/bớt — `character_prompts.character_id` vẫn là business-key string như đã khai báo, chỉ là bug fix ở tầng ghi dữ liệu (bảng vốn đã được thiết kế để business-key này khớp với `characters.character_id` hiện hành, code trước đó chỉ chưa đảm bảo đúng invariant đó).
- 2 query function mới (`deleteCharacterPromptsByProjectId` trong `characterPrompts.queries.ts`, `deleteScenePromptsByProjectId` trong `scenePrompts.queries.ts`) — thao tác `DELETE ... WHERE project_id = ?` trên field đã có sẵn, không cần field/index mới.
- IPC `characters.detect` mở rộng signature thêm tham số thứ 2 tuỳ chọn (`options?: { clearScenePrompts?: boolean }`, dùng cho "Regenerate characters + all scene prompts" — spec.md mục 20) — cùng loại quyết định "chỉ mở rộng bề mặt `AppApi`/`ipc-types.ts`, không đụng `Schema`" đã ghi ở nhiều Changelog phase trước, không phải channel IPC mới.
- **`VilaoApiError`** (`src/main/services/VilaoService.ts`, không phải Non-DB data shape trong tài liệu này — là exception class nội bộ, không persist) mở rộng thêm field runtime `apiErrorType`/`apiErrorCode` (đọc từ `error.type`/`error.code` trong response lỗi thật của Vilao) để `classifyError()` phân biệt `MODEL_NOT_AVAILABLE`/`CONTEXT_TOO_LARGE` chính xác hơn — không liên quan tới Schema/Changelog vì không phải dữ liệu được lưu trữ.

### Phase 11 — Export (2026-08-09)

- **Không có thay đổi schema nào.** `ExportService` (mới, `src/main/services/ExportService.ts`) chỉ **đọc** — `projects`/`srt_blocks`/`characters`/`character_prompts`/`scene_prompts` qua các query đã có sẵn từ trước — để ghi 3 file ra đĩa (spec.md mục 21-24), không ghi/thêm/sửa bảng hay cột nào.
- **`AppSettings.lastExportFolder` được đọc/ghi thật lần đầu tiên** kể từ khi field này tồn tại trong interface `AppSettings` ở tài liệu này (có từ Phase 1, luôn `null` tới trước Phase 11 vì chưa có tính năng Export nào dùng tới) — cùng dạng "field khai báo sẵn, dùng thật ở phase sau" như `projects.selected_model` (Changelog Phase 9). IPC `export.project()` đọc field này làm `defaultPath` gợi ý cho dialog chọn thư mục, rồi ghi lại thư mục user vừa chọn sau mỗi lần export thành công.
  **Không phải schema change:** field vẫn giữ nguyên `string | null` như đã khai báo, chỉ là lần đầu có code path thật sự đọc/ghi vào đó — giống hệt lý do đã ghi cho `selected_model`.
- **`pipeline_tasks.task_type = EXPORT`** (giá trị enum đã liệt kê sẵn từ đầu) **tiếp tục không dùng** — quyết định *giữ nguyên*, không phải "để dành phase sau" nữa vì Phase 11 đã hoàn thành. Export là 1 hành động ghi-toàn-bộ-hoặc-không cho cả project (thành công → 3 file trên đĩa, thất bại/huỷ → không ghi gì), không phải N đơn vị resume/retry độc lập như `SPLIT_SRT`/`DETECT_CHARACTERS`/`GENERATE_CHARACTER_PROMPTS`, nên không cần vòng đời `pending/running/success/failed` của bảng này. Đã cập nhật lại "Ghi chú" của bảng `pipeline_tasks` phía trên để phản ánh đây là quyết định chốt, không còn là "chưa quyết".
- 2 IPC method mới (`export.project`, `export.showInFinder`) thêm ở Phase 11 (xem `context/spec.md` mục 4.2/8.7) chỉ mở rộng bề mặt `AppApi`/`ipc-types.ts` — không đụng tới `Schema` (SQLite hay Non-DB data shapes) nêu ở tài liệu này, cùng loại quyết định đã ghi cho các IPC method mới ở những Changelog phase trước.

### Phase 11 follow-up — hạ Scene batch size, nâng scene_concurrency mặc định (2026-08-09)

- **Không có thay đổi schema.** User yêu cầu trực tiếp: batch 20 SRT/request "chạy hơi lâu" → hạ `SCENE_PROMPT_BATCH_SIZE` (hằng số code, `src/main/pipeline/generateScenePrompt.ts`) từ 20 xuống **10**; đồng thời nâng `DEFAULT_SCENE_CONCURRENCY` (hằng số code, `ProjectService.ts`, dùng khi tạo project mới) từ 2 lên **4** — vẫn trong range 1–5 đã có sẵn trong schema từ Phase 2, không đổi range/constraint.
- `projects.scene_concurrency` (cột DB, bảng ở trên) **chỉ set default mới cho project tạo sau thời điểm này** — project đã tồn tại giữ nguyên giá trị `scene_concurrency` đã lưu (thường vẫn là 2), phải tự đổi qua Settings > Advanced > Pipeline Tuning (`projects.updatePipelineSettings`, có từ Phase 9) nếu muốn áp dụng 4 cho project đang chạy dở.
- Cập nhật đồng bộ `spec.md` mục 17/18.3/18.4/19.3/30/33 (batch size) và mục 17.1/33/1892 (scene_concurrency default) làm nguồn chính thức mới — giữ nguyên các đoạn Changelog lịch sử ở dưới mô tả batch 20/concurrency 2 tại đúng thời điểm chúng còn là default (không sửa lại lịch sử).

### Phase 10 — Autosave đầy đủ + Overview Dashboard (2026-08-09)

- **Không có thay đổi schema nào.** Xác nhận bằng cách kiểm tra `src/main/db/migrations/`: vẫn chỉ có đúng 1 migration (`0001_init`, từ Phase 2). Audit đủ 9/9 sự kiện autosave (spec.md mục 6.3) không phát hiện thiếu sót nào cần vá bằng code mới — mọi bảng/cột vẫn đúng nguyên như đã khai báo, chỉ xác nhận lại các service đã ghi đúng từ Phase 4-9.
- **`ProjectSummary.failedTaskCount` (không phải cột DB — field tính toán trong `ipc-types.ts`) đổi công thức tính**, từ đếm `pipeline_tasks.status='failed'` sang tổng `character_prompts.status='failed'` + `scene_prompts.status='failed'` (sửa trong `listProjectSummaries()`, `src/main/db/queries/projects.queries.ts`).
  **Lý do:** phát hiện khi audit phục vụ Overview tab (spec.md mục 8.1) — `pipeline_tasks` (từ Changelog Phase 9) chỉ có row cho 3 task cấp dự án (`SPLIT_SRT`/`DETECT_CHARACTERS`/`GENERATE_CHARACTER_PROMPTS`), nên đếm `status='failed'` ở đó bỏ sót hoàn toàn số lượng Character Prompt/Scene Prompt lỗi ở cấp đơn vị — đúng ý nghĩa "Failed" trong ví dụ mục 8.1 spec.md (`Failed 2` khi vẫn có prompt đã sinh thành công). Trước bản sửa này, field `failedTaskCount` cũng chưa được UI nào tiêu thụ (chỉ tồn tại trong `ProjectSummary` từ khi type này được tạo ở Phase 9) nên sửa an toàn, không phá vỡ hành vi UI nào đang chạy.
  **Không phải schema change:** `ProjectSummary` không nằm trong phạm vi "Schema" của tài liệu này (chỉ 6 bảng SQLite + 3 Non-DB data shape: `AppSettings`/`SecureCredential`/`ModelInfo`) — đây là type tổng hợp (aggregate) sống trong `src/shared/ipc-types.ts`, tính lại mỗi lần gọi `projects.list()` từ dữ liệu 4 bảng đã có sẵn, không persist riêng. Không table/field/type/constraint nào trong SQLite hay `AppSettings`/`SecureCredential`/`ModelInfo` bị đổi — chỉ đổi công thức SQL ở tầng đọc dữ liệu.
- Overview tab thật (`OverviewPage.tsx`, spec.md mục 8.1) chỉ đọc dữ liệu qua các IPC list đã có sẵn từ trước (`srt.list`/`characters.list`/`characters.listPrompts`/`scenePrompts.list`) — không thêm IPC method mới, không đụng `AppApi`/`ipc-types.ts` ngoài field `failedTaskCount` nói trên.

### Phase 9 — Run All Orchestration + Processing Tab + Retry/Resume/Pause/Cancel (2026-08-09)

- **Không có thay đổi schema nào.** Xác nhận bằng cách kiểm tra `src/main/db/migrations/`: vẫn chỉ có đúng 1 migration (`0001_init`, từ Phase 2) — không có migration mới, không `ALTER TABLE`, không bảng/cột/index nào được thêm. Toàn bộ Phase 9 (`PipelineService`, `pipelineTasks.queries.ts`, các hàm `updateProjectStatus`/`updateProjectRunSnapshot`/`updateProjectPipelineSettings` mới trong `projects.queries.ts`) chỉ đọc/ghi các cột đã có sẵn.
- **`pipeline_tasks` bắt đầu được dùng thật lần đầu tiên** kể từ khi bảng được tạo ở Phase 2 — nhưng chỉ cho 3/6 giá trị `task_type` (`SPLIT_SRT`, `DETECT_CHARACTERS`, `GENERATE_CHARACTER_PROMPTS`, mỗi loại đúng 1 row/project, `entity_id = NULL`). Đóng lại lỗ hổng đã ghi nhận ở Changelog Phase 5-6 ("lỗi cuối cùng chỉ hiển thị tạm trên UI, mất khi rời trang/restart app") — giờ trạng thái/lỗi của 3 bước này sống sót qua restart app. `SELECT_RELEVANT_CHARACTERS`/`GENERATE_SCENE_PROMPT` **tiếp tục không dùng** (đúng quyết định đã ghi ở Changelog Phase 8) — `scene_prompts` đã có granularity đúng (1 row/SRT block, có sẵn `status/attempts/error`), ghi thêm `pipeline_tasks` song song sẽ tạo 2 nguồn sự thật. Đây vẫn là quyết định *chưa dùng* 2 giá trị enum đã tồn tại sẵn, không phải thêm/bớt field/enum.
  **Không phải schema change:** không có unique constraint nào cho `(project_id, task_type)` trong migration (schema.md ghi rõ `entity_id` không có FK cứng, không nói gì về unique) — `upsertPipelineTask()` (mới, `pipelineTasks.queries.ts`) tự làm "find-then-update/insert" ở application layer (SELECT trước rồi mới UPDATE/INSERT) thay vì `ON CONFLICT`, vì không có index/constraint để target. Không thêm constraint mới trong phase này — cân nhắc nhưng không cần thiết ở V1 vì `PipelineService` là code path duy nhất ghi bảng này theo đúng quy tắc "1 row/(project, 3 task_type cố định)".
- **`projects.selected_model` được ghi lần đầu tiên** kể từ khi field này tồn tại trong schema gốc — trước Phase 9, không service nào từng ghi field này (đã ghi nhận ở Changelog Phase 6, dùng `AppSettings.selectedModel` cho mọi lời gọi LLM thay vì field per-project này). Từ Phase 9, `ProjectService.applyFirstRunSnapshotIfMissing()` ghi `selected_model` cùng lúc và cùng giá trị với `selected_model_snapshot` khi Run đầu tiên — hợp lý vì đây là lần đầu tiên có "model thật đã dùng để chạy" cho project đó. TopBar (mục 7 spec.md) đổi sang hiển thị field này (fallback `selectedModelSnapshot`) thay vì luôn hiện "No model selected".
  **Không phải schema change:** field `selected_model` (`string`, `optional`) đã tồn tại nguyên vẹn từ schema gốc — chỉ là lần đầu tiên có code path thật sự ghi vào đó.
- **`projects.max_retry`/`scene_concurrency` lần đầu tiên chỉnh được qua UI** (Settings > Advanced > Pipeline Tuning, trước đó luôn là hằng số mặc định 3/2 từ lúc tạo project, xem Changelog Phase 4) — `ProjectService.updatePipelineSettings()` (mới) UPDATE trực tiếp 2 cột đã có sẵn, có validate range ở application layer (`maxRetry >= 1`, `sceneConcurrency` 1–5) khớp đúng "Ghi chú" đã mô tả sẵn trong bảng `projects` phía trên — không đổi field/type/constraint nào.
- 1 IPC method mới (`projects.updatePipelineSettings`) và việc nối logic thật cho `pipeline.*` (trước đó toàn bộ là stub từ Phase 1) — cùng loại quyết định đã ghi ở Changelog các phase trước: chỉ mở rộng bề mặt `AppApi`/`ipc-types.ts`, không đụng `Schema` nêu ở tài liệu này.
- Đã cập nhật "Ghi chú" của `selected_model` (bảng `projects`) và mô tả bảng `pipeline_tasks` phía trên để phản ánh đúng 2 điểm trên; trả lời một phần [Open Question #2](#open-questions) về semantics của `attempts` (phát hiện 2 bảng dùng cùng tên cột nhưng khác ý nghĩa — chưa thống nhất, chưa cần xử lý ở V1).

### Phase 8 follow-up — chạy batch song song bằng `projects.scene_concurrency` (2026-08-09)

- **Không có thay đổi schema.** `projects.scene_concurrency` (integer, default 2, range 1–5) đã tồn tại sẵn từ Phase 2 nhưng chưa từng được đọc ở bất kỳ service nào tới trước bản cập nhật này. `ScenePromptService.generate()` giờ đọc field này để giới hạn số batch chạy song song — xác nhận thiết kế field này đúng như dự tính ban đầu, không cần điều chỉnh.
- Advanced Settings UI cho field này (`AdvancedSettingsPage.tsx`) **vẫn giữ nguyên disabled** — quyết định "cho user tự chỉnh qua UI" vẫn để dành Phase 9 như ghi chú cũ, chỉ có phần "đọc và áp dụng giá trị default 2" là làm ngay ở bản cập nhật này.

### Phase 8 follow-up — batch nhiều SRT/request cho Scene Generation (2026-08-09)

- **Không có thay đổi schema nào.** User yêu cầu gộp ~20 SRT/request thay vì 1 SRT/request (để giảm số lần gọi LLM) — thay đổi này chỉ nằm ở application layer (`src/main/pipeline/generateScenePrompt.ts`, `ScenePromptService`) và ở `spec.md` (mục 17/18.3/30, cập nhật làm nguồn chính thức mới). `scene_prompts` vẫn ghi đúng 1 row/SRT block (unique `project_id, srt_block_id`) như trước — batch chỉ gộp *request gửi lên LLM*, không gộp *đơn vị lưu trữ*. Mỗi row vẫn có `relevant_character_ids` riêng của chính SRT đó (không phải union của cả batch).
- Không thêm field `sceneBatchSize`/tương tự vào `AppSettings` hay `projects` — batch size là hằng số cố định `SCENE_PROMPT_BATCH_SIZE = 20` trong code, không phải setting có thể chỉnh từ UI. Nếu sau này cần cho user tự chỉnh, đó sẽ là một thay đổi schema (`AppSettings`) cần hỏi lại riêng.

### Phase 8 — Relevant Character Selection + Scene Prompt Generation + màn Image Prompts + Prompt Settings (Scene Generation) (2026-08-09)

- **Không có thay đổi schema nào** — cả 6 bảng SQLite lẫn `AppSettings`/`SecureCredential`/`ModelInfo` (Non-DB data shapes) đều giữ nguyên field/type/constraint như hiện tại. `scene_prompts` (đã tạo sẵn từ migration `0001_init`, Phase 2) được `ScenePromptService.generate()`/`retry()` đọc/ghi đúng nguyên field đã định nghĩa ở đây (`id, project_id, srt_block_id, block_index, relevant_character_ids, prompt, status, attempts, error, updated_at`) — không thêm/bớt/đổi kiểu cột nào.
- Phase 8 là phase **đầu tiên thật sự dùng tới** `scene_prompts.relevant_character_ids` (JSON array) và vòng đời `status`/`attempts`/`error` riêng của bảng này — xác nhận thiết kế "JSON array phẳng thay vì bảng join N–M chuẩn hoá" (đã ghi sẵn ở mô tả bảng) hoạt động đúng như dự tính cho V1, không cần điều chỉnh gì.
- Ghi dữ liệu vào `scene_prompts` dùng **upsert** (`INSERT ... ON CONFLICT (project_id, srt_block_id) DO UPDATE`) — cùng convention `upsertCharacterPrompt` ở Phase 7: mỗi SRT block có đúng 1 row ổn định xuyên suốt các lần Generate/Retry, `id` không đổi qua các lần ghi đè. Khi 1 lần retry sau đó thất bại, `prompt` giữ nguyên giá trị thành công gần nhất thay vì bị ghi đè `NULL` — cùng quyết định bảo toàn dữ liệu đã áp dụng cho `character_prompts` ở Phase 7.
  **Không phải schema change:** cả `id` lẫn `prompt` vẫn giữ nguyên type/constraint đã khai báo — chỉ là quyết định ở application layer (`ScenePromptService`) về cách ghi/giá trị nào được ghi, giống hệt lý do đã ghi cho `character_prompts` ở Changelog Phase 7.
- Cân nhắc nhưng **không** ghi `pipeline_tasks` row cho `SELECT_RELEVANT_CHARACTERS`/`GENERATE_SCENE_PROMPT` ở phase này, dù cả 2 giá trị `PipelineTask.task_type` đã liệt kê sẵn.
  **Lý do:** cùng lý do đã ghi ở Changelog Phase 5-7 — việc `pipeline_tasks` có track 2 task này hay không, và nó tương tác thế nào với `TaskQueueService`/Resume (kể cả concurrency mặc định 2 cho Scene Generation, mục 33), là quyết định thuộc Phase 9. Retry ở Phase 8 (tới `max_retry` lần, cho cả bước chọn relevant characters lẫn bước generate) là vòng lặp nội bộ trong `ScenePromptService`, trạng thái attempt persist trực tiếp vào chính row `scene_prompts` (bảng đã có sẵn cột `status/attempts/error` từ đầu, giống `character_prompts`) chứ không qua `pipeline_tasks`. Đây là quyết định *chưa dùng* 2 giá trị enum đã tồn tại sẵn, không phải thêm/bớt field/enum, nên không phải schema change.
- **Internal Relevant Character Selector (mục 31)** không có bảng/field riêng để persist — output của nó (`character_ids`) chỉ tồn tại tạm trong bộ nhớ khi chạy `ScenePromptService.generate()`/`retry()`, kết quả cuối cùng ghi thẳng vào `scene_prompts.relevant_character_ids`. Khi selector lỗi hết `max_retry` (fallback mục 31), `relevant_character_ids` được ghi `[]` (không phải danh sách "tất cả nhân vật" dù prompt gửi đi lúc đó có inject compact index của tất cả) — vì cột này có ý nghĩa "những Character ID được xác nhận liên quan", không phải "những Character ID được gửi trong request".
  **Không phải schema change:** `relevant_character_ids` vẫn là `JSON array<string>` như đã khai báo, default `[]` — chỉ là quyết định ở application layer về *giá trị* ghi vào khi rơi vào nhánh fallback.
- 2 method IPC mới (`scenePrompts.generate`, `scenePrompts.retry`) thêm ở Phase 8 (xem `context/spec.md` mục 4.2/17) chỉ mở rộng bề mặt `AppApi`/`ipc-types.ts` — không đụng tới `Schema` (SQLite hay Non-DB data shapes) nêu ở tài liệu này, cùng loại quyết định đã ghi cho `characters.detect`/`characters.generatePrompts` ở Changelog Phase 6/7, nên không cần mục riêng cho chúng.

### Phase 7 — Character Prompt Generation + Prompt Settings (Character Generation) (2026-08-09)

- **Không có thay đổi schema nào** — cả 6 bảng SQLite lẫn `AppSettings`/`SecureCredential`/`ModelInfo` (Non-DB data shapes) đều giữ nguyên field/type/constraint như hiện tại. `character_prompts` (đã tạo sẵn từ migration `0001_init`, Phase 2) được `CharacterService.generatePrompts()`/`retryPrompt()` đọc/ghi đúng nguyên field đã định nghĩa ở đây (`id, project_id, character_id, prompt, status, attempts, error, updated_at`) — không thêm/bớt/đổi kiểu cột nào.
- Phase 7 là phase **đầu tiên thật sự dùng tới** vòng đời `status`/`attempts`/`error` riêng của `character_prompts` mà mô tả bảng này (mục [`character_prompts`](#characters)) đã thiết kế sẵn từ đầu ("tách khỏi `characters` vì có vòng đời task riêng... có thể Regenerate độc lập") — xác nhận thiết kế đó đúng như dự tính, không cần điều chỉnh gì.
- Ghi dữ liệu vào `character_prompts` dùng **upsert** (`INSERT ... ON CONFLICT (project_id, character_id) DO UPDATE`) thay vì pattern "xoá sạch + insert lại" đã dùng cho `srt_blocks`/`characters` (Phase 5/6) — mỗi nhân vật có đúng 1 row ổn định xuyên suốt các lần Generate/Retry, `id` không đổi qua các lần ghi đè.
  **Không phải schema change:** cột `id` vẫn là uuid PK như đã khai báo, chỉ khác ở *cách ghi* (upsert theo unique constraint `(project_id, character_id)` đã có sẵn) so với các bảng khác — phù hợp hơn với `character_prompts` vì bảng này cần giữ trạng thái `status`/`attempts`/`error` per-row để hỗ trợ Retry độc lập từng nhân vật (mục 15.1 spec.md), khác với `characters`/`srt_blocks` vốn luôn replace toàn bộ.
- Khi 1 batch/retry thất bại sau khi hết `max_retry`, cột `prompt` (đã khai báo `optional`) được **giữ nguyên giá trị thành công gần nhất** thay vì ghi đè `NULL` — tránh mất dữ liệu khi 1 lần regenerate sau đó thất bại dù trước đó đã có prompt tốt.
  **Không phải schema change:** `prompt` vẫn giữ nguyên `type: text`, `optional` như đã khai báo — chỉ là quyết định ở application layer (`CharacterService.runGenerationBatch()`) về giá trị nào được ghi vào cột đó khi `status` chuyển `failed`, không đổi field/type/constraint nào.
- Cân nhắc nhưng **không** ghi `pipeline_tasks` row cho task `GENERATE_CHARACTER_PROMPTS` ở phase này, dù `PipelineTask.task_type` (mục [Enum/Status](#pipelinetasktask_type)) đã liệt kê sẵn giá trị này.
  **Lý do:** cùng lý do đã ghi ở Changelog Phase 5 (`SPLIT_SRT`) và Phase 6 (`DETECT_CHARACTERS`) — việc `pipeline_tasks` có track `GENERATE_CHARACTER_PROMPTS` hay không, và nó tương tác thế nào với `TaskQueueService`/Resume, là quyết định thuộc Phase 9. Retry ở Phase 7 (tới `max_retry` lần/batch) là vòng lặp nội bộ trong `CharacterService`, trạng thái attempt được persist trực tiếp vào chính row `character_prompts` (khác Phase 5/6 — Split SRT/Character Detection không có cột status riêng để lưu, còn `character_prompts` có sẵn nên tận dụng luôn) chứ không qua `pipeline_tasks`. Đây là quyết định *chưa dùng* một giá trị enum đã tồn tại sẵn, không phải thêm/bớt field/enum, nên không phải schema change.
- 2 method IPC mới (`characters.generatePrompts`, `characters.retryPrompt`) thêm ở Phase 7 (xem `context/spec.md` mục 4.2/15.1) chỉ mở rộng bề mặt `AppApi`/`ipc-types.ts` — không đụng tới `Schema` (SQLite hay Non-DB data shapes) nêu ở tài liệu này, cùng loại quyết định đã ghi cho `characters.detect`/`vilao.hasApiKey` ở Changelog Phase 6, nên không cần mục riêng cho chúng.

### Phase 6 — Character Detection + màn Characters + Prompt Settings (Character Detection) (2026-08-08)

- **Không có thay đổi schema nào** — cả 6 bảng SQLite lẫn `AppSettings`/`SecureCredential`/`ModelInfo` (Non-DB data shapes) đều giữ nguyên field/type/constraint như hiện tại. `characters` (đã tạo sẵn từ migration `0001_init`, Phase 2) được `CharacterService`/`detectCharacters.ts` đọc/ghi đúng nguyên field đã định nghĩa ở đây — không thêm/bớt/đổi kiểu cột nào.
- Cân nhắc nhưng **không** ghi `pipeline_tasks` row cho task `DETECT_CHARACTERS` ở phase này, dù `PipelineTask.task_type` (mục [Enum/Status](#pipelinetasktask_type)) đã liệt kê sẵn giá trị `DETECT_CHARACTERS`.
  **Lý do:** cùng lý do đã ghi ở Changelog Phase 5 cho `SPLIT_SRT` — việc `pipeline_tasks` có track `DETECT_CHARACTERS` hay không, và nó tương tác thế nào với `TaskQueueService`/Resume, là quyết định thuộc Phase 9. Retry ở Phase 6 (tới `max_retry` lần) là vòng lặp nội bộ trong `CharacterService.detect()`, không persist `attempts` ra DB — lỗi cuối cùng (nếu có) chỉ hiển thị tạm trên UI (React state, mất khi rời trang). Đây là quyết định *chưa dùng* một giá trị enum đã tồn tại sẵn, không phải thêm/bớt field/enum, nên không phải schema change.
- `characters.character_id` và `characters.name` cùng nhận giá trị `@Character_Name` khi persist kết quả Character Detection — output JSON của LLM (spec.md mục 28) chỉ có 1 field `"name"` dạng `@ID`, không có tên người riêng biệt để tách ra 2 giá trị khác nhau.
  **Không phải schema change:** cả 2 cột vẫn giữ nguyên `type: string`, `required: true` như đã khai báo — chỉ là cách map dữ liệu ở application layer (`CharacterService.detect()`) khi nguồn dữ liệu đầu vào (LLM) không phân biệt 2 khái niệm mà schema đã tách sẵn.
- `AppSettings.promptSettings.characterDetection`/`characterGeneration`/`sceneGeneration` đổi **giá trị default** khi khởi tạo store lần đầu — từ chuỗi rỗng `''` sang nguyên văn 3 prompt mặc định spec.md mục 28-30 (định nghĩa tập trung ở `src/shared/prompts.ts`, dùng chung Main + Renderer).
  **Không phải schema change:** field `promptSettings.*` vẫn giữ nguyên `type: string` như interface `AppSettings` đã khai báo ở tài liệu này — chỉ đổi giá trị mặc định lúc `electron-store` chưa có key đó trên đĩa, không đổi field/type/constraint nào.
- 3 method IPC mới (`characters.detect`, `vilao.hasApiKey`, `vilao.clearApiKey`) thêm ở Phase 6 (xem `context/spec.md` mục 4.2/5.1) chỉ mở rộng bề mặt `AppApi`/`ipc-types.ts` — không đụng tới `Schema` (SQLite hay Non-DB data shapes) nêu ở tài liệu này, cùng loại quyết định đã ghi cho `projects.updateTranscript`/`projects.loadTranscriptFile` ở Changelog Phase 4, nên không cần mục riêng cho chúng.

### Phase 5 — SRT Splitter (non-LLM) + màn SRT (2026-08-08)

- **Không có thay đổi schema nào** — cả 6 bảng SQLite lẫn `AppSettings`/`SecureCredential`/`ModelInfo` (Non-DB data shapes) đều giữ nguyên field như hiện tại. `srt_blocks` (đã tạo sẵn từ migration `0001_init`, Phase 2) được `SrtService`/`splitSrt.ts` đọc/ghi đúng nguyên field đã định nghĩa ở đây (`id, project_id, block_index, start_ms, end_ms, text, character_count, created_at`) — không thêm/bớt/đổi kiểu cột nào.
- Cân nhắc nhưng **không** ghi `pipeline_tasks` row cho task `SPLIT_SRT` ở phase này, dù `PipelineTask.task_type` (mục [Enum/Status](#pipelinetasktask_type)) đã liệt kê sẵn giá trị `SPLIT_SRT`.
  **Lý do:** Run All pseudo flow (spec.md mục 36) gọi `createSrtBlocks()` **vô điều kiện** mỗi lần Run/Resume — khác Character Detection/Character Prompt vốn có check `if (!xCompleted())` trước khi chạy — nên bước Split SRT không cần vòng đời `pending/running/success/failed` để hoạt động đúng ở V1. Việc có dùng `pipeline_tasks` cho `SPLIT_SRT` hay không, và nó tương tác thế nào với `TaskQueueService`, là quyết định thuộc Phase 9 khi Run All/Resume thật được implement — quyết trước ở đây có nguy cơ xung đột thiết kế đó. Đây là quyết định *chưa dùng* một giá trị enum đã tồn tại sẵn (không phải thêm/bớt field/enum), nên không phải schema change, chỉ ghi lại để tránh hiểu nhầm là bị bỏ sót.
- `SrtService.split()` xoá sạch + insert lại toàn bộ `srt_blocks` của project trong 1 transaction mỗi lần chạy (replace, không diff) — hành vi ghi dữ liệu này tuân theo đúng unique constraint `(project_id, block_index)` đã có sẵn trong schema.md, không đổi ràng buộc nào.
- `srt_blocks.character_count` (sau fix đọc đa ngôn ngữ ở Phase 5) tính bằng số grapheme cluster (`Intl.Segmenter`, đúng ký tự thị giác) thay vì `string.length` (UTF-16 code unit) của JS — vẫn là 1 `integer` đúng kiểu đã khai báo, chỉ đổi công thức tính giá trị ở application layer (`src/main/pipeline/splitSrt.ts`), không đổi field/type/constraint nào trong schema.

### Phase 4 — General Settings + Transcript Input (2026-08-08)

- **Không có thay đổi schema nào** — cả 6 bảng SQLite lẫn `AppSettings`/`SecureCredential`/`ModelInfo` (Non-DB data shapes) đều giữ nguyên field như hiện tại.
- Cân nhắc nhưng **không** thêm field `maxRetry` vào `AppSettings`, dù `context/plan.md` Phase 4 có nhắc "đồng bộ vào `projects.max_characters`/`fake_duration_sec`/`max_retry` khi tạo project mới".
  **Lý do:** `AdvancedSettingsPage.tsx` đã có sẵn quyết định từ trước là gộp Max Retry cùng Scene Concurrency, wiring thật ở Phase 9 (`TaskQueueService`) vì cả hai đều là tham số điều khiển pipeline execution, không phải setting sinh SRT. Thêm `maxRetry` vào `AppSettings` ở Phase 4 sẽ là một thay đổi schema tự quyết, vi phạm CLAUDE.md ("nếu cần thay đổi schema... hỏi lại trước khi làm"), trong khi codebase đã có hướng xử lý tương đương không cần đổi schema. Mỗi project mới vẫn khởi tạo `max_retry = 3` qua hằng số `DEFAULT_MAX_RETRY` trong `ProjectService` (giống Phase 2) — chỉ `max_characters`/`fake_duration_sec` (2 field đã có sẵn trong `AppSettings`) mới thật sự được đồng bộ từ Settings > General khi tạo project mới.
- 2 IPC method mới (`projects.updateTranscript`, `projects.loadTranscriptFile`) thêm ở Phase 4 (xem `context/spec.md` mục 4.2) chỉ mở rộng bề mặt `AppApi`/`ipc-types.ts` — không đụng tới `Schema` (SQLite hay Non-DB data shapes) nêu ở tài liệu này, nên không cần mục Changelog riêng cho chúng.

### Phase 3 — Vilao API Settings (2026-08-08)

- **`SecureCredential`**: bỏ field `provider` và `updatedAt` khỏi shape thật được persist — chỉ còn `encryptedApiKey`.
  **Lý do:** `SecureStorageService` ghi thẳng ciphertext (`Buffer`) từ `safeStorage.encryptString()` ra 1 file riêng (`vilao.cred`) dưới dạng raw bytes, không bọc JSON envelope. `provider` luôn là hằng số `"vilao"` (V1 chỉ có đúng 1 LLM provider, không cần lưu để phân biệt) và `updatedAt` không được UI nào đọc tới (Settings > Vilao API chỉ cần biết đã cấu hình hay chưa, việc đó suy ra từ sự tồn tại của file, không cần timestamp) — giữ 2 field này trong interface sẽ ngụ ý một format JSON có cấu trúc trên đĩa mà thực tế không tồn tại, dễ gây hiểu lầm khi audit bảo mật.
  **Không phải DB schema change:** đây là "Non-DB data shape", không đụng tới bảng SQLite nào — không cần migration.
- Không có thay đổi nào tới 6 bảng SQLite (`projects`, `srt_blocks`, `characters`, `character_prompts`, `scene_prompts`, `pipeline_tasks`) trong Phase 3.

### Phase 25 — Multi-provider API key (DeepSeek + Gemini) (user duyệt phương án A)

- **`SecureCredential`**: không đổi shape (vẫn chỉ `encryptedApiKey`), nhưng giờ có **tối đa 3 file**, mỗi provider 1 file: `vilao.cred` (giữ nguyên tên, key cũ vẫn dùng được), `deepseek.cred`, `gemini.cred`. Provider được suy ra từ tên file, không lưu trong nội dung.
- **`channels.selected_model` / `projects.selected_model` / `projects.selected_model_snapshot` / `AppSettings.selectedModel`**: vẫn `string`, nhưng quy ước giá trị: model Vilao lưu **trần** (như cũ); model của provider khác lưu dạng `"<provider>:<modelId>"` (vd `deepseek:deepseek-chat`, `gemini:gemini-2.5-flash`). Parse/format qua `src/shared/llmProviders.ts` (`parseModelRef`/`formatModelRef`).
  **Không phải schema change:** không thêm/bớt/đổi kiểu cột nào, không migration; dữ liệu cũ (không tiền tố) tự được hiểu là Vilao. Snapshot tự mang theo provider nên Resume/Retry không đổi provider giữa chừng.

### Phase 26 — Thinking level (user chọn encode vào chuỗi model)

- **Cùng các field model của Phase 25** (`channels.selected_model`, `projects.selected_model`, `projects.selected_model_snapshot`, `AppSettings.selectedModel`) có thêm hậu tố tuỳ chọn `@<level>` (`off|low|medium|high|max`), vd `deepseek:deepseek-flash@high`. Parse/format qua `src/shared/llmProviders.ts`.
  **Không phải schema change:** vẫn `string`, không cột/bảng/migration mới; giá trị cũ (không hậu tố) = mặc định của model. Snapshot mang theo mức thinking nên Resume/Retry không đổi giữa chừng.

### Phase 27 — Tab API Calls: bảng `llm_calls` (2026-10-20)

- **Thêm bảng `llm_calls`** (migration `0008_add_llm_calls`) — xem mô tả ở mục Schema. Lý do: cần đếm chính xác số lần gọi model (kể cả retry, batch scene, bước chọn nhân vật) mà `attempts` ở các bảng khác không phản ánh được. User đã duyệt phương án này (so với việc suy ra từ `attempts`).
- Các bảng còn lại và `AppSettings`/`SecureCredential` không đổi.

### Nới range Scene Generation Concurrency / Batch Size (2026-10-21)

- **Không đổi cột/kiểu/default nào, không có migration.** Theo yêu cầu trực tiếp của user, chỉ nới giới hạn validate ở application layer (`ChannelService.validate()`, `ProjectService.updatePipelineSettings()`, Zod `channel.schema.ts`/`pipelineSettings.schema.ts`): `scene_concurrency` 1–5 → **1–10**, `scene_batch_size` 1–20 → **1–30**, áp cho cả bảng `channels` lẫn `projects`. Giá trị đang lưu luôn nằm trong range mới nên không cần backfill.
