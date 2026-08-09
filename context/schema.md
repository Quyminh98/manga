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
| selected_model | string | optional | model_id từ Vilao; optional vì Draft có thể chưa chọn. Không service nào ghi field này tới Phase 9 — từ Phase 9, ghi đúng 1 lần cùng lúc với `selected_model_snapshot` khi Run đầu tiên (xem Changelog) |
| max_characters | integer | required | default 300, range 100–2000 |
| fake_duration_sec | integer | required | default 3, range 1–30 |
| max_retry | integer | required | default 3 |
| scene_concurrency | integer | required | default 4 (nâng từ 2 ngày 2026-08-09, xem Changelog), range 1–5 |
| character_detection_prompt_snapshot | text | optional | set đúng 1 lần khi Run đầu tiên |
| character_generation_prompt_snapshot | text | optional | |
| scene_generation_prompt_snapshot | text | optional | |
| selected_model_snapshot | string | optional | |
| max_characters_snapshot | integer | optional | |
| fake_duration_snapshot | integer | optional | |
| created_at | datetime | required | |
| updated_at | datetime | required | |
| last_opened_at | datetime | optional | |

6 field `*_snapshot` nằm trực tiếp trên `projects` (không tách bảng riêng) vì quan hệ 1–1 tuyệt đối, tạo đúng 1 lần, không version hoá — tách bảng chỉ thêm JOIN không cần thiết. Nullable vì project ở trạng thái `draft` (chưa Run) chưa có snapshot.

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

### Non-DB data shapes

#### `AppSettings` (electron-store, JSON — không nhạy cảm)

```ts
interface AppSettings {
  maxCharacters: number;        // default cho project mới
  fakeSrtDurationSec: number;
  selectedModel: string | null;
  promptSettings: {
    characterDetection: string;   // nội dung prompt hiện hành (editable)
    characterGeneration: string;
    sceneGeneration: string;
  };
  uiPreferences: Record<string, unknown>;
  lastExportFolder: string | null;
}
```

Đây là nguồn mà `projects.*_prompt_snapshot` sao chép lại tại thời điểm Run đầu tiên — global settings có thể đổi sau, snapshot thì không đổi theo.

#### `SecureCredential` (Electron `safeStorage`, không phải file JSON đọc được)

```ts
interface SecureCredential {
  encryptedApiKey: Buffer; // qua safeStorage, không log, không SQLite, không plaintext
}
```

Triển khai thật (Phase 3, `SecureStorageService`) chỉ ghi **raw bytes** của `encryptedApiKey` ra file riêng `vilao.cred` trong `userData` — không có `provider`/`updatedAt` trên đĩa (xem [Changelog](#changelog)).

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
- `attempts` không được vượt `max_retry` (default 3) trước khi task chuyển `failed` vĩnh viễn.
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
