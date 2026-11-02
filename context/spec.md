# SPEC.md — AI Storytelling Prompt Desktop Tool

## 0. Thông tin chung

**Tên tạm thời:** StoryPrompt Desktop  
**Loại ứng dụng:** Desktop app  
**Nền tảng ưu tiên:** macOS trước, Windows sau  
**Tech stack chính:** Electron + React + TypeScript  
**LLM Provider:** Vilao AI  
**Cách vận hành chính:** One-click pipeline  
**Input chính:** Transcript dạng text thuần, không có timestamp  
**Output chính:** 1 file `.srt` + 2 file `.txt`

---

# 1. Mục tiêu sản phẩm

Ứng dụng nhận một transcript dạng text thuần và tự động thực hiện toàn bộ pipeline:

1. Chia transcript thành các block SRT theo giới hạn ký tự.
2. Tạo timeline giả cho từng block SRT.
3. Phân tích toàn bộ transcript để phát hiện và định danh nhân vật.
4. Tạo Visual DNA cho từng nhân vật.
5. Tạo 1 prompt hình ảnh reference cho từng nhân vật.
6. Với mỗi SRT, xác định các nhân vật liên quan.
7. Tạo chính xác 1 prompt hình ảnh cho mỗi SRT.
8. Hiển thị toàn bộ kết quả trong app.
9. Cho phép export ra các file SRT/TXT.
10. Lưu trạng thái project để có thể Resume nếu app bị đóng, API lỗi hoặc pipeline bị dừng.

**Cập nhật (Phase 15, ngoài phạm vi V1 gốc):** mục 10 chỉ còn đúng ở tầng **cơ chế lưu trạng thái** (mọi kết quả đã hoàn thành vẫn được giữ nguyên, không mất) — phần "để có thể Resume" **không còn đúng qua UI nữa** cho trạng thái `paused` cụ thể: nút Resume bị xoá hẳn khỏi TopBar/Processing tab/Home theo yêu cầu trực tiếp của user, không còn cách nào từ giao diện để chạy tiếp 1 project đang `paused` (kể cả trường hợp app bị force-quit giữa chừng rồi mở lại — mục 37). Xem mục 6.2/7/8.6/19.3/37/39 để biết chi tiết từng nơi bị ảnh hưởng.

Mục tiêu UI là đơn giản: người dùng nhập transcript, chọn model, nhấn **Run All**, app tự xử lý toàn bộ.

---

# 2. Phạm vi V1

## 2.1. Có trong V1

- macOS.
- Electron desktop app.
- Input transcript bằng text.
- Paste transcript trực tiếp.
- Có thể load transcript từ file `.txt`.
- Setting API key Vilao.
- Test API key.
- Tự lấy danh sách model khả dụng từ Vilao.
- Dropdown chọn model.
- Cấu hình số ký tự tối đa cho mỗi SRT.
- Cấu hình số giây giả cho mỗi SRT.
- Character Detection.
- Character Database.
- Character Prompt Generation.
- Relevant Character Selection cho từng SRT.
- Scene/Image Prompt Generation.
- Một prompt ảnh cho mỗi SRT.
- Project History.
- Autosave.
- Retry.
- Resume.
- Hiển thị progress.
- Export 3 file chính.
- Prompt Settings có thể chỉnh sửa.
- Nút Reset Prompt về mặc định.

## 2.2. Chưa làm trong V1

- Không tạo ảnh trực tiếp.
- Không tích hợp Midjourney/Flux/Stable Diffusion API.
- Không xử lý video.
- Không trích transcript từ YouTube.
- Không speech-to-text.
- Không cần timestamp transcript thật.
- Không cần timeline SRT chính xác với audio/video.
- Không cần đồng bộ cloud.
- Không cần tài khoản người dùng.
- Không cần cộng tác nhiều người.
- Không cần Global Image Style Prompt riêng.
- Không cần chỉnh sửa thủ công từng bước trước khi pipeline tiếp tục.

---

# 3. Tech Stack

## 3.1. Desktop

- Electron
- TypeScript
- React
- Vite, build/dev qua **`electron-vite`** (không phải `vite.config.ts` trần) — tự tách 3 config con cho main/preload/renderer trong 1 file `electron.vite.config.ts`, có HMR cho renderer và rebuild tự động cho main/preload khi `npm run dev`.
- **`react-router-dom`** (routing renderer) — dùng `createHashRouter` (HashRouter), không phải BrowserRouter, vì bản production load renderer qua `file://` (không có server để fallback History API).
- `package.json` **không** khai báo `"type": "module"`: main + preload build ra CommonJS (`out/main/index.js`, `out/preload/index.js`). Có thử ESM (`"type": "module"` + output `.mjs`) nhưng gây lỗi runtime khi Electron nạp main process (`electron.app` undefined / crash `cjsPreparseModuleExports` khi `require('electron')` trong ngữ cảnh ESM) — CommonJS là lựa chọn ổn định, đúng mặc định của `electron-vite`.
- **UI layer:** Tailwind CSS (token màu/typography/spacing lấy từ `.stitch/DESIGN.md`, khai báo trong `tailwind.config.ts`), `lucide-react` cho icon, `react-hook-form` + `@hookform/resolvers/zod` + `zod` cho mọi form (validate trước khi ghi DB) — theo CLAUDE.md UI Rules.
- **Testing:** `vitest` cho unit test (services/pure function ở Main process, ví dụ `tests/unit/projectService.test.ts`) — cấu hình alias `@shared`/`@renderer` riêng trong `vitest.config.ts` vì Vite/electron-vite alias không tự áp dụng cho test runner.

**Setup Windows lần đầu — implementation thật (Phase 14, ghi lại vì ảnh hưởng việc chạy code, không phải requirement sản phẩm):** 3 vấn đề build native module (`better-sqlite3`) chỉ gặp trên Windows, không gặp trên macOS. (1) Python 3.14 thiếu module `distutils` mà `node-gyp` cần — fix: cài thêm `setuptools`. (2) Node trên Windows build native module bằng `clang-cl` mặc định, nhưng máy chỉ cài toolset MSVC — fix: file `.npmrc` (đã checked-in ở root repo) chứa `clang=0` để ép dùng MSVC. (3) `ELECTRON_RUN_AS_NODE=1` do VS Code tự set sẵn cho terminal tích hợp, khiến `npm run dev`/electron.launch() chạy Electron như Node thuần (window không mở, hoặc Playwright driver báo "Process failed to launch!") — phải `unset ELECTRON_RUN_AS_NODE` trước khi chạy.

**Kích thước cửa sổ — implementation thật (Phase 13):** `BrowserWindow` (`src/main/index.ts`) mở mặc định `1440×900`, `minWidth: 768`/`minHeight: 640`. `minWidth` ban đầu là `1024` — đúng bằng breakpoint `lg` (1024px, mặc định Tailwind) mà `.stitch/DESIGN.md`'s "Layout & Spacing > Responsive Behavior" dùng làm điểm Sidebar collapse thành drawer — nghĩa là cửa sổ không bao giờ resize được xuống dưới ngưỡng đó, vô hiệu hoá tính năng responsive trên thực tế. Hạ xuống `768` để có khoảng resize 768–1024px thật sự đi qua breakpoint này.

## 3.2. State Management

- Zustand

Dùng cho:
- UI state
- selected project
- selected tab
- current progress
- processing state
- temporary editor state

Không dùng Zustand làm database chính.

## 3.3. Local Database

Ưu tiên:

- SQLite

Có thể dùng:
- better-sqlite3

SQLite lưu:
- Project
- Transcript
- SRT blocks
- Character Database
- Character Prompts
- Scene Prompts
- Task status
- Retry count
- Error logs
- Model snapshot
- Prompt snapshot
- Project settings

`better-sqlite3` là native module — ABI Node.js (dùng khi chạy `vitest`) và ABI Electron 33 khác nhau (137 vs 130 tại thời điểm viết), `require()` sai ABI crash ngay lập tức. `package.json` có sẵn `@electron/rebuild` (devDependency) + script tự rebuild đúng target trước khi chạy: `postinstall`/`predev`/`prestart`/`prebuild` chạy `electron-rebuild -f -o better-sqlite3` (cho Electron), `pretest` chạy `npm rebuild better-sqlite3` (cho Node) — không cần nhớ rebuild thủ công khi chuyển qua lại giữa `npm run dev` và `npm test`.

## 3.4. Settings không nhạy cảm

Có thể dùng:
- electron-store

Lưu:
- avgCharacters (đổi tên từ maxCharacters, Phase 19)
- variancePercent (thêm ở Phase 19)
- fakeSrtDurationSec
- selected model
- prompt settings
- UI preferences
- last export folder

Pin `electron-store@8.x` (CommonJS) — **không** dùng v9+ vì bản đó chuyển sang ESM-only (`"type": "module"`), vỡ với main process build ra CommonJS (`externalizeDepsPlugin` của `electron-vite` giữ `require()` cho dependency ngoài) — cùng loại lỗi ESM/CJS đã note ở mục 3.1.

## 3.5. API Key

Không lưu API key dạng plain text trong:
- localStorage
- JSON settings
- SQLite
- source code

API key phải được mã hóa/lưu qua secure storage của hệ điều hành từ Electron Main Process.

Ưu tiên Electron `safeStorage`.

macOS:
- sử dụng hệ thống bảo mật của macOS/Keychain thông qua Electron.

Windows sau này:
- sử dụng cơ chế bảo mật tương ứng của Windows thông qua Electron.

`SecureStorageService` (`src/main/services/SecureStorageService.ts`) ghi ciphertext của `safeStorage.encryptString()` dạng **raw bytes** vào 1 file riêng `vilao.cred` trong `userData` — tách biệt hoàn toàn khỏi `app-settings.json` (electron-store, mục 3.4) và SQLite. Không bọc thêm JSON envelope quanh ciphertext (không cần `provider`/`updatedAt` đọc được ở dạng file — chỉ có 1 provider cố định). Không phụ thuộc Electron ở tầng gọi API (`VilaoService` nhận `apiKey` đã giải mã qua constructor) — chỉ `SecureStorageService` và IPC layer chạm `safeStorage`/`app.getPath('userData')`.

## 3.6. Build / Distribution

Ưu tiên:
- electron-builder

V1:
- build `.dmg` / `.app` cho macOS.

V2:
- build installer Windows.

**Cập nhật (Phase 15, ngoài phạm vi V1 gốc) — bắt đầu đóng gói Windows thật, sớm hơn kế hoạch V2:** `electron-builder.yml` thêm `win.target: nsis`. Quan trọng hơn: **`asar: false`** (tắt hẳn asar, không dùng mặc định `asar: true` + `asarUnpack`) — phát hiện qua build thật + `require()` trực tiếp trên binary đã đóng gói: `better-sqlite3` (native module) tự phụ thuộc package JS thuần `bindings` để tìm file `.node`; heuristic mặc định của electron-builder chỉ tự unpack đúng package có file `.node` (`better-sqlite3`), để `bindings` kẹt lại nén trong `app.asar` — `require('bindings')` từ vị trí đã unpack không "nhảy ngược" vào asar được, app mở lên rồi tắt ngay lập tức lúc chạm SQLite lần đầu (không có crash log, vì đây không phải native crash mà là exception JS khi `require()` thất bại). Tắt hẳn asar tránh cả lớp bug này (mọi file là đường dẫn thật, `require()` hành xử giống hệt lúc dev) thay vì phải tự liệt kê từng transitive dependency cần `asarUnpack`. Thêm script `npm run dist` (`build` + `electron-builder --win`) làm lối tắt duy nhất để đóng gói. **Chưa build/cài thử bản NSIS installer thật trên máy khác** — mới verify được cấu trúc package (`out/`, `node_modules`, native module load thành công) qua build `dir` target, chưa click-through UI thật (môi trường agent lúc debug bị chặn mở GUI thật, không phải hạn chế của app).

---

# 4. Kiến trúc ứng dụng

Ứng dụng chia làm 3 lớp chính.

```text
Renderer Process
    │
    │ IPC
    ▼
Preload / Typed IPC Bridge
    │
    ▼
Electron Main Process
    │
    ├── VilaoService
    ├── ProjectService
    ├── SrtService
    ├── CharacterService
    ├── ScenePromptService
    ├── PipelineService
    ├── QueueService
    ├── ExportService
    ├── SecureStorageService
    └── DatabaseService
```

Danh sách service thật (`src/main/services/`) khác sơ đồ gốc ở 5 điểm:

- **`CharacterService`** (thêm ở Phase 6) không nằm trong danh sách service gốc ban đầu — đóng vai trò sub-resource service cho `characters`/`character_prompts` giống cách `SrtService` đảm nhiệm `srt_blocks`, cùng convention "không import `electron`, unit-test qua `createDatabase(':memory:')`".
- **`ScenePromptService`** (thêm ở Phase 8, cùng convention trên) — sub-resource service cho `scene_prompts`, đảm nhiệm cả Relevant Character Selection (mục 16) lẫn Scene Prompt Generation (mục 17), gồm batching + concurrency nội bộ (mục 33).
- **`PromptService`/`TaskQueueService` (bản gốc, "queue trong 1 pipeline") không tồn tại như class riêng** (quyết định ở Phase 9, xem thêm mục 33/36): prompt chỉ là dữ liệu (`AppSettings.promptSettings` qua `electron-store` + hằng số mặc định `src/shared/prompts.ts`, mục 26/27) không có business logic đủ phức tạp để cần 1 service riêng; concurrency Character Detection/Generation (=1) đã là hành vi tự nhiên của `CharacterService` gọi tuần tự, còn concurrency Scene Generation (mặc định 4, mục 33) implement thẳng trong `ScenePromptService.generate()` (`runWithConcurrency()` nội bộ) — `PipelineService` chỉ điều phối thứ tự gọi các service này theo đúng mục 36, không cần lớp `TaskQueueService` bọc ngoài chỉ để có tên gọi khớp sơ đồ. `PipelineService` (`src/main/services/PipelineService.ts`, mới ở Phase 9) tái dùng 4 service trên thay vì tự viết lại retry/batch/persist. **Không nhầm với `QueueService` bên dưới** — 2 khái niệm "queue" khác nhau, phục vụ 2 nhu cầu khác nhau.
- **`ExportService`** (`src/main/services/ExportService.ts`, thêm ở Phase 11) — đọc `srt_blocks`/`characters`/`character_prompts`/`scene_prompts` qua các query đã có sẵn, ghi 3 file export ra đĩa (mục 21-24); logic format thuần (không đụng Electron/DB) tách riêng ở `src/shared/exportFormat.ts` để Export tab dùng lại y hệt cho phần preview (mục 8.7), tránh 2 nguồn sự thật giữa preview và file ghi thật.
- **`QueueService`** (`src/main/services/QueueService.ts`, thêm ở Phase 14, ngoài phạm vi V1 gốc — xem mục 6.4) — **khác hẳn** ý tưởng `TaskQueueService` bị bác ở trên: đây là hàng đợi chạy **nhiều project** tuần tự (project B tự chạy khi project A xong), không phải hàng đợi task/LLM-call bên trong 1 project. Cùng convention "không import Electron", nhận `runProject` như 1 callback (dependency injection) thay vì giữ tham chiếu `PipelineService` trực tiếp, để unit-test độc lập không cần DB/Electron thật. Chỉ tồn tại in-memory, không có bảng riêng trong schema.md (mất khi tắt app — quyết định có chủ đích, xem mục 6.4).

## 4.1. Renderer Process

Chỉ xử lý:
- UI
- input
- editor
- preview
- progress
- project navigation
- user actions

Renderer KHÔNG được trực tiếp giữ hoặc gọi Vilao API bằng API key.

## 4.2. Preload

Expose các IPC API tối thiểu bằng `contextBridge`.

Interface đầy đủ (nguồn chuẩn: `src/shared/ipc-types.ts` → `AppApi`), nhóm theo domain — `srt`/`characters`/`scenePrompts` là sub-resource của project nên IPC handler tương ứng gộp chung trong `src/main/ipc/projects.ipc.ts` (không tách file riêng như tên domain gợi ý):

```ts
window.appApi.projects.create(input) // input.channelId bắt buộc từ Phase 17 (mục 6.5) — chọn 1 lần, cố định vĩnh viễn
window.appApi.projects.open(id)
window.appApi.projects.get(id) // Phase 15, không có trong danh sách gốc — đọc thuần, KHÔNG có side effect (khác open(), vốn bump last_opened_at và tự downgrade processing→paused nếu isActuallyRunning=false, xem mục 37). usePipelineStore's live status refresh dùng get() thay open() để không tự làm sai status của 1 run đang thật sự chạy.
window.appApi.projects.list()
window.appApi.projects.rename(id, name)
window.appApi.projects.delete(id)
window.appApi.projects.showInFinder(id)
window.appApi.projects.updateTranscript(id, transcript)
window.appApi.projects.loadTranscriptFile() // dialog.showOpenDialog ở Main, trả nội dung file hoặc null nếu cancel
window.appApi.projects.updatePipelineSettings(id, { maxRetry, sceneConcurrency, sceneBatchSize }) // Phase 9, không có trong danh sách gốc — Settings > Advanced ghi trực tiếp vào project đang mở (3 field per-project, không phải AppSettings; sceneBatchSize thêm ở Phase 17, xem mục 17/33 — UI chỉ còn sửa được sceneConcurrency/sceneBatchSize, maxRetry hết chỉnh được từ Phase 16, xem mục 10.3)

window.appApi.srt.list(projectId)
window.appApi.srt.split(projectId)

window.appApi.characters.list(projectId)
window.appApi.characters.listPrompts(projectId)
window.appApi.characters.detect(projectId) // Phase 6, không có trong danh sách gốc — trigger DETECT_CHARACTERS thủ công (thay Run All tới Phase 9)
window.appApi.characters.generatePrompts(projectId) // Phase 7, không có trong danh sách gốc — trigger GENERATE_CHARACTER_PROMPTS thủ công (batch 10/request, xem mục 15)
window.appApi.characters.retryPrompt(projectId, characterId) // Phase 7, regenerate đúng 1 Character Prompt (batch-of-1), không đụng nhân vật khác

window.appApi.scenePrompts.list(projectId)
window.appApi.scenePrompts.generate(projectId) // Phase 8, không có trong danh sách gốc — trigger SELECT_RELEVANT_CHARACTERS + GENERATE_SCENE_PROMPT thủ công (batch 10 SRT/request, xem mục 17)
window.appApi.scenePrompts.retry(projectId, blockIndex) // Phase 8, regenerate đúng 1 Scene Prompt (batch-of-1), không đụng SRT khác
window.appApi.scenePrompts.onProgress(callback) // Phase 8, trả về unsubscribe function — bắn 1 lần/batch trong lúc generate() đang chạy, xem mục 17

window.appApi.pipeline.run(projectId)
window.appApi.pipeline.pause(projectId)
window.appApi.pipeline.resume(projectId)
window.appApi.pipeline.cancel(projectId)
window.appApi.pipeline.retryTask(projectId, taskId)
window.appApi.pipeline.listTasks(projectId)
window.appApi.pipeline.onProgress(callback) // trả về unsubscribe function

window.appApi.settings.get()
window.appApi.settings.save(settings)

window.appApi.vilao.saveApiKey(apiKey)
window.appApi.vilao.testConnection()
window.appApi.vilao.listModels()
window.appApi.vilao.hasApiKey() // Phase 6 (fix UX Settings > Vilao API), check file tồn tại cục bộ — không giải mã, không gọi mạng
window.appApi.vilao.clearApiKey() // Phase 6, xoá hẳn credential đã lưu (SecureStorageService.clear(), có sẵn từ Phase 3 nhưng chưa expose IPC)

window.appApi.export.getFolderPath(projectId) // Phase 14, thay window.appApi.export.project() cũ (đã xoá hẳn) — trả về nơi file đã/sẽ được ghi, không tự ghi gì cả (mục 21)
window.appApi.export.showInFinder(folderPath) // Phase 11, không có trong danh sách gốc — reveals đúng folder export ghi ra (projects.showInFinder luôn trỏ vào file SQLite, không phải folder export riêng)

window.appApi.queue.add(projectId) // Phase 14, mới hoàn toàn, ngoài phạm vi V1 gốc — xem mục 6.4
window.appApi.queue.remove(projectId) // chỉ xoá được item đang `queued`, không xoá được item đang `running`
window.appApi.queue.list()
window.appApi.queue.onUpdate(callback) // trả về unsubscribe function, bắn lại toàn bộ danh sách mỗi khi add/remove/start/finish

window.appApi.channels.list() // Phase 17, mới hoàn toàn, ngoài phạm vi V1 gốc — xem mục 6.5. Trả về Channel[] kèm projectCount mỗi channel
window.appApi.channels.get(id)
window.appApi.channels.create(input) // input = { name, avgCharacters, variancePercent, fakeDurationSec, selectedModel, characterDetectionPrompt, characterGenerationPrompt, sceneGenerationPrompt, sceneConcurrency, sceneBatchSize } — avgCharacters/variancePercent đổi tên/thêm ở Phase 19
window.appApi.channels.update(id, input) // cùng shape input, sửa mọi field kể cả tên
window.appApi.channels.delete(id) // reject nếu channel còn project, hoặc là channel cuối cùng còn lại
```

Bật trong `webPreferences` của `BrowserWindow`:
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: false` — tắt Electron sandbox cấp OS cho tiến trình renderer (khác với `contextIsolation`) để preload script (dùng `contextBridge`/`ipcRenderer` qua bundle CommonJS) chạy ổn định; Renderer vẫn không có quyền Node trực tiếp vì `nodeIntegration: false` + `contextIsolation: true` đã chặn.

Không bật Node integration trực tiếp trong Renderer.

Ở Phase 1, tất cả method là **stub**: trả mock rỗng/mặc định cho các thao tác đọc (`list`, `get`, `testConnection` → `not_configured`), hoặc reject `Error('NOT_IMPLEMENTED: ... — arrives in Phase N')` cho thao tác ghi/hành động — để Renderer không crash khi lỡ gọi trước khi service thật được nối ở các phase sau.

Từ Phase 2, `projects.*` (create/open/list/rename/delete/showInFinder) và `settings.get/save` đã nối logic thật (`ProjectService` + SQLite thật qua `DatabaseService`, `AppSettings` qua `electron-store`). Từ Phase 3, `vilao.*` (saveApiKey/testConnection/listModels) cũng đã nối logic thật (`SecureStorageService` + `VilaoService`, xem mục 5.2). Từ Phase 4, `projects.updateTranscript`/`projects.loadTranscriptFile` cũng đã nối logic thật (autosave transcript debounce + Load `.txt` qua `dialog.showOpenDialog`, xem mục 6.3/8.2) — 2 method này không nằm trong danh sách gốc ban đầu, được thêm khi implement vì kiến trúc 3 lớp (Renderer không đụng filesystem) đòi hỏi Main phải là nơi mở dialog/đọc file. Từ Phase 5, `srt.list`/`srt.split` cũng đã nối logic thật (`SrtService`, xem mục 11.5/13). Từ Phase 6, `characters.list`/`characters.detect` đã nối logic thật (`CharacterService` + `VilaoService.chat()`, xem mục 14) và `vilao.hasApiKey`/`vilao.clearApiKey` được thêm mới (không nằm trong danh sách gốc, fix UX ô API key ở Settings > Vilao API — xem mục 5.1). Từ Phase 7, `characters.listPrompts` cũng đã nối logic thật, và `characters.generatePrompts`/`characters.retryPrompt` được thêm mới (không nằm trong danh sách gốc, cùng lý do "cần 1 trigger thủ công thay Run All" như `characters.detect` — xem mục 15). Từ Phase 8, `scenePrompts.list`/`scenePrompts.generate`/`scenePrompts.retry` cũng đã nối logic thật (`ScenePromptService`, xem mục 16.4/17), và `scenePrompts.onProgress` được thêm mới (không nằm trong danh sách gốc — phát sinh khi implement, để Image Prompts tab hiện tiến trình "Batch X/Y" trong lúc `generate()` đang chạy thay vì chỉ có label "Generating…" tĩnh, xem mục 8.5).

**Từ Phase 9, `pipeline.*` đã nối logic thật** (`PipelineService`, xem mục 36): `pipeline.run`/`pipeline.resume`/`pipeline.retryTask` cả 3 trỏ vào cùng 1 hàm `runProject()` ở Main (mỗi bước bên trong tự gated nên Run/Resume/Retry Failed là cùng 1 lời gọi, không có code path riêng theo từng cái tên — xem mục 19.3/36). `pipeline.pause`/`pipeline.cancel` cũng cùng 1 hàm bên dưới (không có trạng thái "cancelled" riêng, xem mục 37). `pipeline.listTasks` chỉ trả về 3 task cấp dự án (`SPLIT_SRT`/`DETECT_CHARACTERS`/`GENERATE_CHARACTER_PROMPTS`) — breakdown "Scene 001/002/..." đọc thẳng từ `scenePrompts.list()` đã có sẵn từ Phase 8 (xem mục 8.6/25). `projects.updatePipelineSettings` được thêm mới (không nằm trong danh sách gốc — Settings > Advanced > Pipeline Tuning cần 1 IPC ghi trực tiếp `projects.max_retry`/`scene_concurrency` của project đang mở; thêm field thứ 3 `scene_batch_size` ở Phase 17, xem mục 17).

**Từ Phase 11, `export.*` đã nối logic thật** (`ExportService`, xem mục 21-24). **Thay đổi lớn ở Phase 14 (xem mục 8.7/21):** `export.project(projectId)` (mở `dialog.showOpenDialog` mỗi lần bấm) **đã bị xoá hẳn**, không còn trong `AppApi` — thay bằng `export.getFolderPath(projectId)` (chỉ đọc, không ghi gì) vì việc ghi file giờ tự động xảy ra trong `PipelineService.runProject()` ngay khi Run All hoàn tất, không còn qua 1 lời gọi IPC do Renderer chủ động trigger nữa. `export.showInFinder(folderPath)` giữ nguyên (thêm từ Phase 11, không nằm trong danh sách gốc — `projects.showInFinder` có sẵn từ Phase 2 luôn trỏ vào file SQLite, không phải folder export riêng của project).

**Từ Phase 14, `queue.*` là namespace hoàn toàn mới** (`QueueService`, xem mục 6.4) — không nằm trong bất kỳ danh sách gốc nào (tính năng phát sinh sau khi V1 hoàn thành ở Phase 13, theo yêu cầu trực tiếp trong lúc user tự test app). `queue.add`/`queue.remove`/`queue.list` đều là lời gọi đơn giản uỷ quyền thẳng cho `QueueService`; `queue.onUpdate` bắn lại toàn bộ danh sách (không phải diff) mỗi lần có thay đổi, cùng pattern với `pipeline.onProgress`/`scenePrompts.onProgress` đã có từ trước.

**Cũng ở Phase 14:** `pipeline.pause`/`pipeline.cancel` **vẫn còn tồn tại nguyên vẹn trong `AppApi`/IPC** (không bị xoá) nhưng từ phase này **không còn nơi nào trong Renderer gọi tới** — 2 nút Pause/Cancel ở TopBar/Processing tab đã bị bỏ hẳn, thay bằng 1 nút **Delete** duy nhất khi đang chạy (xem mục 7/8.6/37). Tương tự, `srt.split`/`characters.detect`/`characters.generatePrompts` (dùng cho 3 nút tạm thời "Split SRT"/"Detect Characters"/"Generate Character Prompts" ở mục 8.3/8.4) cũng còn nguyên trong `AppApi`/IPC nhưng không còn nút nào gọi tới nữa sau khi 3 nút đó bị xoá ở Phase 14 — Run All (mục 36) giờ là đường duy nhất để chạy các bước này. Quyết định giữ nguyên IPC thay vì xoá luôn: không đụng tới phần Main Process đã test kỹ chỉ để dọn 1 vài dòng khai báo, trong khi việc xoá nút UI là yêu cầu rõ ràng của user.

**Ở Phase 15:** `scenePrompts.generate` gia nhập nhóm "còn IPC, hết UI gọi" ở trên — nút **Generate Image Prompts** (`ImagePromptsPage.tsx`, nút tạm-thời-thay-Run-All cuối cùng còn sót lại từ Phase 8, bị bỏ sót khi Phase 14 dọn 3 nút kia) bị xoá nốt, cùng lý do "Run All đã đủ dùng" (mục 8.5). `pipeline.resume`/`pipeline.retryTask` cũng chưa từng có nút gọi trực tiếp (luôn qua `pipeline.run`, đúng cơ chế 1-hàm-3-tên ở mục 19.3/36) — không đổi gì thêm ở phase này, chỉ xác nhận lại. `projects.loadTranscriptFile` gia nhập nhóm này luôn — toolbar Transcript (Paste/Select All/Clear/Load .txt) bị xoá hẳn khỏi `TranscriptPage.tsx` theo yêu cầu user (mục 8.2); IPC vẫn còn nguyên, không có UI nào gọi Load .txt nữa (khác `Paste`/`Select All`/`Clear`, vốn không đi qua IPC — mất nút không mất chức năng vì làm tay được trực tiếp trong textarea).

## 4.3. Main Process

Main Process chịu trách nhiệm:
- API key
- gọi Vilao API
- SQLite
- file system
- export
- pipeline
- retry
- resume
- secure storage

---

# 5. Tích hợp Vilao AI

Vilao được sử dụng như LLM provider chính.

Integration layer cần thiết kế theo hướng OpenAI-compatible để dễ thay đổi model/provider về sau.

## 5.1. Settings Vilao

Màn Settings > API gồm:

### API Key

- Input password.
- Nút Save.
- Nút Test Connection.
- Trạng thái:
  - Not configured
  - Checking
  - Connected
  - Invalid
  - Error

### Models

Sau khi API key hợp lệ:

1. App gọi API lấy danh sách model khả dụng.
2. Hiển thị model trong dropdown.
3. Người dùng chọn model dùng cho pipeline.
4. Lưu `model_id`.
5. Có nút Refresh Models.

Không hard-code một model duy nhất.

Nếu API key thay đổi:
- clear danh sách model cũ.
- fetch lại model.
- yêu cầu chọn lại model nếu model cũ không còn khả dụng.

**Implementation thật (Phase 3, cập nhật Phase 6 sau feedback test thủ công):** `VilaoApiSettingsPage.tsx` không hiển thị lại API key đã lưu (chỉ Main giữ bản giải mã) — nhưng để phân biệt "chưa từng cấu hình" với "đã lưu, chỉ chưa test lại" (status luôn reset về `Not configured` sau mỗi lần Save), ô input tự **disabled** kèm placeholder dạng chấm + nhãn "SAVED" khi `vilao.hasApiKey()` trả `true`. Khi đã khoá, nút Save được thay bằng nút **Remove** duy nhất (gọi `vilao.clearApiKey()`) để xoá key cũ rồi mở khoá ô nhập — không có nút "sửa tại chỗ" riêng, chỉ 1 đường dẫn để đổi key. Bấm **Save** giờ tự động chạy `testConnection()` (và fetch model nếu Connected) ngay, không bắt người dùng bấm thêm nút Test Connection.

## 5.2. VilaoService

Interface đề xuất:

```ts
interface VilaoService {
  testConnection(): Promise<boolean>;
  listModels(): Promise<ModelInfo[]>;
  chat(request: LlmRequest): Promise<LlmResponse>;
}
```

Không để logic Vilao nằm trực tiếp trong UI component.

### Base URL & Endpoint thật (xác nhận từ docs api.vilao.ai ở Phase 3)

Base URL không có trong bản spec ban đầu — đã hỏi lại và xác nhận với docs Vilao thật. Hard-code làm constant `VILAO_BASE_URL` trong `src/main/services/VilaoService.ts` (không thêm field `baseUrl` vào `AppSettings`/schema.md — chỉ có 1 provider cố định):

```text
Base URL: https://api.vilao.ai/v1
Auth:     Authorization: Bearer <apiKey>
```

Endpoint dùng trong V1 (OpenAI-compatible):

```text
GET  /models            → { object: "list", data: [{ id, object, created, owned_by }] }
POST /chat/completions   → implement từ Phase 6 (DETECT_CHARACTERS; GENERATE_CHARACTER_PROMPTS/GENERATE_SCENE_PROMPT dùng lại ở Phase 7-8)
```

Lỗi trả về dạng `{ error: { message, type, code } }`. HTTP status quan trọng nhất với testConnection: `401` = API key sai/thiếu, còn lại (network, timeout, 429, 5xx...) coi là lỗi kết nối chung.

`VilaoService` (`src/main/services/VilaoService.ts`) không import `electron`, nhận `apiKey` đã giải mã qua constructor, dùng `fetch` global (Node 18+/Electron built-in, không thêm HTTP client mới) — unit test được bằng cách mock `global.fetch` (`tests/unit/vilaoService.test.ts`). Phase 3 chỉ implement `testConnection`/`listModels`.

**`chat()` — implementation thật (Phase 6):** shape cụ thể của `LlmRequest`/`LlmResponse` (không có sẵn trong bản spec ban đầu):

```ts
interface LlmChatMessage {
  role: 'system' | 'user';
  content: string;
}
interface LlmRequest {
  model: string;
  messages: LlmChatMessage[];
  temperature?: number;
}
interface LlmResponse {
  content: string;
}
```

`chat()` gửi `POST /chat/completions` với `{ model, messages, temperature? }`, đọc `choices[0].message.content` từ response. Response rỗng/thiếu content → throw `VilaoApiError('Vilao returned an empty response', null)` (tiền đề tối thiểu cho `EMPTY_RESPONSE`, mục 34 — phân loại đầy đủ 11 error code để Phase 12). Với DETECT_CHARACTERS (mục 14), request chỉ gồm **1 message role `user`** — prompt mặc định mục 28 là 1 khối instruction tự chứa với `{{TRANSCRIPT}}` inline, không tách system/user riêng.

`testConnection(): Promise<boolean>` (interface trên) chỉ là wrapper boolean đơn giản. IPC handler `vilao:testConnection` (`src/main/ipc/vilao.ipc.ts`) **không** dùng wrapper này mà tự gọi `listModels()` và bắt `VilaoApiError` để lấy HTTP status — cần chi tiết đó mới map đúng ra 5 trạng thái UI ở mục 5.1 (`status === 401` → `Invalid`, còn lại → `Error`, chưa có key đã lưu → `Not configured` ngay, không gọi mạng).

## 5.3. Request chung

Mỗi request cần lưu:

```ts
{
  projectId,
  taskId,
  taskType,
  model,
  createdAt,
  attempt,
  inputSize,
  status
}
```

Không bắt buộc lưu toàn bộ raw API response nếu không cần thiết.

Có thể bật debug log trong Advanced Settings.

---

# 6. Project

## 6.1. Tạo project

Người dùng chọn:

**New Project**

Nhập:
- Project Name
- Transcript

Sau khi tạo:
- project được lưu local ngay lập tức.

`projects.max_characters`/`fake_duration_sec` của project mới được khởi tạo từ `AppSettings.maxCharacters`/`fakeSrtDurationSec` hiện hành (Settings > General, mục 10) tại thời điểm tạo — không phải hằng số cố định. `ProjectService.create(input, defaults?)` (Phase 4) nhận `defaults` này qua IPC handler `projects:create` (đọc `AppSettings` trước khi gọi service); nếu không truyền, fallback về default schema.md (300/3). Sau khi tạo, giá trị này thuộc riêng project — đổi Settings > General sau đó không ảnh hưởng project đã tạo (khác snapshot prompt ở mục 32 vốn chỉ set khi Run lần đầu, đây set ngay khi tạo project). `projects.max_retry`/`scene_concurrency` thì luôn khởi tạo bằng hằng số cố định (1/4 — `scene_concurrency` nâng từ 2 lên 4 ngày 2026-08-09, `max_retry` hạ từ 3 xuống 1 ngày 2026-08-10, xem mục 33) bất kể `AppSettings` — không có field tương ứng trong `AppSettings` (xem mục 10.3, thêm sẽ là schema change); `scene_concurrency` vẫn chỉnh được sau khi tạo qua Settings > Advanced > Pipeline Tuning (Phase 9, mục 33), `max_retry` thì không còn UI để chỉnh (mục 10.3, Phase 16).

**Cập nhật (Phase 14, ngoài phạm vi V1 gốc):** nút submit của form New Project đổi tên từ "Create Project" thành **"Add to Queue"** — sau khi tạo project (`projects.create`) xong, gọi luôn `queue.add(project.id)` (mục 6.4) rồi điều hướng thẳng tới tab Processing của project đó thay vì Overview. Hành vi thật sự phụ thuộc trạng thái Run Queue lúc bấm: nếu queue đang rảnh, project mới **chạy Run All ngay lập tức**; nếu đang có project khác chạy, nó xếp hàng chờ tới lượt — cả 2 nhánh dùng chung đúng 1 lời gọi `queue.add()`, không có code path "kiểm tra có đang chạy không rồi tự quyết định" riêng ở Renderer.

**Cập nhật (Phase 15, ngoài phạm vi V1 gốc):** điều hướng sau khi bấm "Add to Queue" đổi từ tab Processing của project mới sang thẳng màn **Queue** (`/queue`, mục 6.4) — theo yêu cầu trực tiếp của user, hợp lý hơn vì project vừa tạo có thể chưa tới lượt chạy ngay (đang queued phía sau project khác), nên xem nó trong danh sách Queue tự nhiên hơn là mở thẳng 1 trang Processing có thể chưa có gì để xem.

## 6.2. Project History

Màn Home hiển thị project gần đây.

Mỗi item:

```text
Project Name
Created
Last updated
Status
Progress
```

Status:

```text
Draft
Ready
Processing
Paused
Completed
Completed with errors
Failed
```

Actions:

```text
Open
Resume
Delete
```

**Implementation thật (Phase 9, Resume):** `ProjectsListPage.tsx` — nút Resume enable khi `status` là `paused`/`failed`/`completed_with_errors` (đứng yên/disable với `draft`/`ready`/`processing`/`completed`), điều hướng thẳng tới tab Processing của project đó (`/projects/:id/processing`) thay vì tự chạy pipeline ngay tại Home — người dùng bấm Resume/Retry Failed thật ở Processing tab hoặc TopBar (mục 8.6/37).

**Cập nhật lớn (Phase 14, ngoài phạm vi V1 gốc):** row Home rút gọn lại, không còn khớp danh sách "Actions"/field gốc phía trên nữa (đã sửa lại đúng thực tế):
- **`Model` bị bỏ khỏi field hiển thị** — không còn lý do hiển thị vì Run All giờ là đường duy nhất để chạy, model chọn ở Settings chung, không còn cần so sánh model giữa các project ngay tại Home.
- **`Rename` bị xoá khỏi Actions** — cùng với đó, `RenameProjectModal` (component cục bộ trong `ProjectsListPage.tsx`) và `renameProjectSchema`/`RenameProjectFormValues` (`project.schema.ts`) bị xoá theo vì không còn nơi nào dùng. **IPC `projects.rename` vẫn còn nguyên** (không bị xoá, chỉ không còn UI nào gọi tới).
- **`Show in Finder` và `Export` bị xoá khỏi Actions** — dư thừa sau khi export chuyển sang tự động (mục 8.7/21): không còn hành động "export thủ công từng project ở Home" nữa vì Run All đã tự ghi file khi xong.
- Action **`Add to Queue`** (thêm ở Phase 14, xem mục 6.4) từng có mặt ở đây một thời gian ngắn trong lúc phát triển nhưng **bị xoá lại** theo yêu cầu — điểm duy nhất để thêm project vào Run Queue hiện tại là nút "Add to Queue" trên màn New Project (mục 6.1) lúc tạo project mới, không có ở Home.
- Row còn lại đúng 3 action: **Open / Resume / Delete**. `Delete` từ Phase 14 xoá được cả project đang `processing` (xem mục 37) — không chỉ project đứng yên như trước.

**Cập nhật (Phase 15, ngoài phạm vi V1 gốc):** row Home (và row Queue tab — mục 6.4, dùng chung component `ProjectRow.tsx` mới tách ra từ `ProjectsListPage.tsx`) đổi tên action thứ 2 thành **Retry Failed**, chỉ enable khi `status` là `failed`/`completed_with_errors` — **`paused` bị bỏ khỏi điều kiện enable**, theo yêu cầu trực tiếp của user (đã xác nhận lại 2 lần, biết rõ hệ quả). Bấm vào vẫn điều hướng tới `/projects/:id/processing` như cũ, nhưng project `paused` giờ không còn nút hành động nào ở đó nữa (mục 8.6) nên link Resume cũ cho `paused` sẽ dẫn tới 1 trang không làm được gì — vì vậy bị disable thẳng ở đây thay vì để user bấm vào ngõ cụt.

**Cập nhật (Phase 15, tiếp) — thêm action thứ 4 "Open in Folder":** row không còn đúng 3 action nữa — thêm **Open in Folder** giữa Retry Failed và Delete, chỉ enable khi `status` là `completed`/`completed_with_errors`. Dùng lại đúng flow "Show in Finder" đã có sẵn ở Export tab (mục 8.7): `export.getFolderPath(projectId)` lấy đường dẫn rồi `export.showInFinder(folderPath)` mở lên — không thêm IPC channel mới, không phải hành động "export thủ công" (export vẫn tự động 100% khi Run All xong, mục 21) mà chỉ là lối tắt mở nhanh thư mục đã ghi sẵn ngay từ Home/Queue thay vì phải mở project → vào tab Export.

**Cập nhật (Phase 15, tiếp) — nút "Delete All" mới ở header Dashboard:** theo yêu cầu trực tiếp của user. Xoá **toàn bộ** project đang hiển thị trong danh sách Recent Projects lúc bấm (tức project không nằm trong Run Queue, xem ngay ở trên) — không đụng tới project đang `queued`/`running` trong Queue tab, giữ đúng ranh giới "Dashboard chỉ hiển thị/thao tác trên project không thuộc Queue" đã có. Chỉ hiện nút khi danh sách không rỗng. Có modal xác nhận riêng (đếm số project sẽ xoá), bấm Delete All thì lặp qua từng project gọi `projects.delete()` (fire-and-forget, cùng cơ chế `DeleteProjectModal`) + `markDeleted()` optimistic ngay lập tức — không phải 1 IPC bulk-delete mới, chỉ là gọi lại đúng IPC xoá-từng-project có sẵn nhiều lần.

**Status/Progress thật (Phase 9, xác nhận lại Phase 10):** `ProjectsListPage.tsx` không dùng giá trị tĩnh — đọc thẳng `ProjectSummary` (`ipc-types.ts`) trả về từ `projects.list()` → `ProjectService.list()` → `listProjectSummaries()` (`src/main/db/queries/projects.queries.ts`), 1 query SQL tính `srtCount`/`characterCount`/`characterPromptDone`/`scenePromptDone`/`progressPercent` trực tiếp từ `srt_blocks`/`characters`/`character_prompts`/`scene_prompts` mỗi lần Home load lại — không có bảng cache/denormalize riêng. `progressPercent` dùng đúng công thức `(character prompt success + scene prompt success) / (characters + srt blocks)`, khớp với công thức Overview (mục 8.1) và Processing tab (mục 8.6) để 3 nơi không bao giờ lệch số nhau.

## 6.3. Autosave

Autosave khi:

- transcript thay đổi
- settings project thay đổi
- SRT được tạo
- character detection hoàn thành
- character prompt hoàn thành
- từng scene prompt hoàn thành
- task lỗi
- pipeline pause
- pipeline complete

Không chờ pipeline hoàn thành mới lưu.

**Transcript autosave (Phase 4, thật):** `TranscriptPage.tsx` debounce 800ms sau lần gõ cuối rồi gọi `window.appApi.projects.updateTranscript(id, transcript)` → `ProjectService.updateTranscript()` → `UPDATE projects SET transcript, updated_at`. Không debounce theo timer cố định (không lưu định kỳ khi không gõ) — chỉ trigger khi nội dung đổi, đúng tinh thần "autosave khi transcript thay đổi". UI hiển thị trạng thái Saving…/Saved/Save failed ngay trong Transcript tab.

**SRT được tạo (Phase 5, thật):** không có debounce riêng — `SrtService.split()` ghi thẳng `srt_blocks` vào SQLite ngay trong cùng lần gọi IPC `srt.split` (xoá + insert lại toàn bộ trong 1 transaction), nên "tạo SRT" và "lưu SRT" là cùng một hành động đồng bộ, tự thoả điều kiện autosave mà không cần cơ chế lưu nền riêng.

**Character detection/character prompt/từng scene prompt hoàn thành, task lỗi (Phase 6-8, thật):** cùng nguyên tắc trên — mỗi bước ghi thẳng kết quả (hoặc lỗi + `attempts`) vào `characters`/`character_prompts`/`scene_prompts` ngay trong transaction của chính nó (`CharacterService`/`ScenePromptService`), không có bước "lưu" tách rời.

**Pipeline pause/pipeline complete (Phase 9, thật):** `PipelineService.runProject()` gọi `ProjectService.updateStatus()` ghi `projects.status` ngay khi chuyển `processing` → `paused`/`completed`/`completed_with_errors`/`failed`, đồng bộ (không debounce). Rà soát chính thức đủ 9/9 sự kiện (không sót) vẫn để dành Phase 10 như kế hoạch — ở đây chỉ xác nhận cơ chế ghi-ngay đã có cho từng sự kiện riêng lẻ qua các phase.

**Audit đủ 9/9 (Phase 10, thật):** rà soát lại toàn bộ 9 sự kiện bằng cách đọc code từng service — không có sự kiện nào sót, không cần sửa gì thêm cho autosave tự thân. Settings project đổi (Advanced Settings) xác nhận ghi ngay khi bấm Save (`updatePipelineSettings`), không debounce. 6/9 sự kiện thuộc pipeline (Character Detection/Character Prompt/Scene Prompt/task lỗi/pause/complete) đã có unit test cover sẵn từ Phase 6-9 (`characterService.test.ts`, `scenePromptService.test.ts`, `pipelineService.test.ts` — bao gồm case `completed_with_errors`, pause giữa chừng rồi Resume, cancel). Audit này phát hiện 1 bug liên quan (không phải ở chính cơ chế autosave mà ở cách đọc lại dữ liệu để hiển thị) — xem "Implementation thật (Phase 10)" ở mục 8.1.

## 6.4. Run Queue (Phase 14 — ngoài phạm vi V1 gốc)

**Không có trong spec.md gốc.** Tính năng mới hoàn toàn, phát sinh trực tiếp từ yêu cầu của user trong lúc tự chạy/test app thật trên máy sau khi V1 đã hoàn thành ở Phase 13 — trùng đúng ý "Batch controls" đã liệt kê sẵn ở mục 40 Roadmap (V1.1), làm sớm hơn kế hoạch.

**Yêu cầu:** cho phép xếp hàng nhiều project để chạy Run All tuần tự, tự động — project kế tiếp bắt đầu ngay khi project hiện tại kết thúc (thành công hay thất bại đều tính là "kết thúc", không chặn hàng đợi).

**Cách thêm vào queue:** duy nhất qua nút **"Add to Queue"** trên form New Project lúc tạo project mới (mục 6.1) — **không có** cách thêm 1 project *đã tồn tại* vào queue từ Home hay từ trong chính project đó (từng có action "Add to Queue" ở Home row một thời gian ngắn trong lúc phát triển, đã bị xoá lại theo yêu cầu — xem mục 6.2).

**Trang Queue** (route `/queue`, mục trong sidebar Home, cạnh "Projects"/"New Project"/"Settings"): danh sách project đang `queued`/`running` theo đúng thứ tự FIFO, item `running` (nếu có, luôn đứng đầu danh sách) hiện icon xoay. Tên project bấm vào điều hướng thẳng tới tab Processing để xem chi tiết từng task.

**Cập nhật (Phase 20, ngoài phạm vi V1 gốc, 2026-08-11 — theo yêu cầu trực tiếp user):** nút **Remove** riêng cho item `queued` (mô tả gốc ở trên) đã bị **xoá khỏi UI** — đứng cạnh action **Delete** chuẩn của `ProjectRow` (dùng chung cho mọi row Home/Queue), 2 nút cùng đọc như "xoá" nhưng hành vi khác nhau (Remove chỉ bỏ khỏi hàng đợi, giữ nguyên project; Delete xoá hẳn project) — gây nhầm lẫn. Giờ **Delete là đường duy nhất** để lấy 1 project ra khỏi Queue: `projects.ipc.ts`'s delete handler đã tự `getQueueService().remove(id)` trước khi xoá project (có sẵn từ Phase 14), nên Delete vẫn xử lý đúng "gỡ khỏi hàng đợi" — chỉ khác là project bị xoá hẳn luôn, không giữ lại được để queue lần sau. IPC `queue.remove`/`useQueueStore.remove()` **vẫn còn nguyên**, chỉ không còn UI nào gọi tới — cùng convention "giữ IPC, bỏ nút" đã áp dụng xuyên suốt từ Phase 14.

**Implementation thật (Phase 14):**
- **`QueueService`** (`src/main/services/QueueService.ts`, mục 4) — thuần logic, không đụng Electron/DB, nhận `runProject` như 1 callback được inject từ `queue.ipc.ts` (không giữ tham chiếu `PipelineService` trực tiếp) để unit-test độc lập bằng fake function. Giữ `queued: string[]` (FIFO) + `currentProjectId: string | null`, vòng lặp `drain()` (`while`-loop, không phải đệ quy) rút từng project ra chạy, guard tái nhập bằng 1 boolean `draining` duy nhất — `add()` gọi giữa lúc `drain()` đang chạy chỉ push vào mảng rồi return ngay, vòng lặp đang chạy tự nhặt item mới ở lượt kế tiếp. Lỗi 1 project (`runProject` reject) bị bắt và log, **không** làm hỏng `drain()` — đúng yêu cầu "lỗi không chặn hàng đợi".
- **Chia sẻ đúng 1 `PipelineService` instance** giữa chạy tay (`pipeline.ipc.ts`) và chạy qua queue (`queue.ipc.ts`) — thêm `getPipelineService()` (singleton getter, cùng pattern `getDatabase()` ở `DatabaseService.ts`) vì 2 nơi này **phải** dùng chung 1 `controllers` map (mục 37) để guard "đang chạy" và Delete-while-running hoạt động đúng bất kể project được khởi động từ đâu.
- **Race condition đã fix:** 1 project đang nằm trong queue (đã `queued`, chưa tới lượt `running`) vẫn có `projects.status` chưa đổi (còn `draft`/`ready`/...), nên nếu không kiểm tra thêm, user vẫn bấm Run All thủ công được ở TopBar/Processing tab của chính project đó — chạy đè lên lượt của queue. Fix: `canRun` ở cả 2 nơi thêm điều kiện `!isQueued` (đọc từ `useQueueStore`, không chỉ dựa vào `status`).
- **In-memory only, không có bảng riêng trong schema.md** — quyết định có chủ đích (không phải thiếu sót): queue mất khi tắt app, không cần khôi phục lại giữa các phiên làm việc.
- **Kênh IPC/store:** `queue.add`/`queue.remove`/`queue.list`/`queue.onUpdate` (mục 4.2), `useQueueStore` (Zustand, Renderer, cùng pattern singleton-subscription với `usePipelineStore`).
- Verify: unit test `tests/unit/queueService.test.ts` (8 case — FIFO, lỗi không chặn queue, `remove()` chỉ xoá được item `queued`, add-dedupe cho cả item `queued` lẫn `running`, thứ tự `list()`, re-entrancy, callback), `vitest` 233 → 241 rồi 243/243 sau khi cộng thêm test cho `stopAndWait()` (mục 37).

## 6.5. Channels (Phase 17 — ngoài phạm vi V1 gốc)

**Không có trong spec.md gốc.** Yêu cầu trực tiếp của user: mỗi channel có 1 bộ setting riêng (Max Characters/Duration/Model/3 prompt template/Scene Concurrency/Scene Batch Size — đúng tập field project đã tự giữ riêng từ trước, mục 6.1), setting chung (Settings > General/Prompts) đổi vai trò thành default khi tạo channel mới (thay vì default khi tạo project mới như trước), project thuộc channel nào dùng đúng setting của channel đó.

**Cách hoạt động:** project chọn đúng 1 channel lúc tạo (`NewProjectPage.tsx`, dropdown bắt buộc) — toàn bộ setting của channel đó được **copy 1 lần** vào field riêng của project ngay lúc tạo (cùng pattern `AppSettings` → project đã có từ Phase 4), **không phải tham chiếu sống**: sửa setting channel sau đó không ảnh hưởng ngược project đã tạo. **Không đổi được channel của project sau khi tạo** — cố định vĩnh viễn, theo yêu cầu trực tiếp của user (đã xác nhận qua `AskUserQuestion` trước khi implement).

Model/3 prompt template của channel còn được dùng trực tiếp mỗi lần Run All/Resume/Retry Failed (không chỉ lúc tạo project) — `resolvePipelineRuntime()` (mục dưới) đọc model/prompt từ channel của project thay vì `AppSettings` global, nên đổi setting channel *trước lần Run đầu tiên* của 1 project vẫn có tác dụng (Prompt Snapshot, mục 32, vẫn chỉ khoá lại đúng 1 lần ở lần Run đầu tiên như cũ — không đổi cơ chế đó).

**Trang Channels** (route `/channels`, mục trong sidebar Home, cạnh "Queue"/"Settings"): danh sách channel dạng card — tên, số project đang thuộc channel đó, tóm tắt setting. Action **New Channel** (`/channels/new`, prefill từ `AppSettings` hiện hành — Settings > General/Prompts — chỉnh được trước khi lưu), **Edit** (`/channels/:channelId/edit`, sửa mọi field kể cả tên), **Delete** (chỉ xoá được channel không còn project nào tham chiếu, và không xoá được nếu đó là channel cuối cùng còn lại trong hệ thống — New Project luôn cần ít nhất 1 channel để chọn).

**Migration `0004_add_channels`** tạo sẵn đúng 1 channel `"Default"` và gán toàn bộ project đã tồn tại trước Phase 17 vào đó — mọi project trong hệ thống luôn thuộc đúng 1 channel, không có trạng thái "project không channel" nào phải xử lý ở nơi khác. Chi tiết schema đầy đủ: `context/schema.md` (bảng `channels`, Changelog Phase 18).

**Vilao API key KHÔNG theo channel** — vẫn dùng chung 1 key cho toàn app (Settings > Vilao API, mục 5.1), không nằm trong phạm vi setting của channel.

---

# 7. Giao diện chính

UI tổng thể:

```text
┌────────────────────────────────────────────────────────────┐
│ Project Name                     Model        [ Run All ]   │
├──────────────┬─────────────────────────────────────────────┤
│              │                                             │
│ Overview     │                                             │
│ Transcript   │              Main Content                   │
│ SRT          │                                             │
│ Characters   │                                             │
│ Image Prompt │                                             │
│ Processing   │                                             │
│ Export       │                                             │
│              │                                             │
├──────────────┴─────────────────────────────────────────────┤
│ Progress / status                                           │
└────────────────────────────────────────────────────────────┘
```

Settings là màn riêng.

**Implementation thật (Phase 9):** nút `[ Run All ]` ở TopBar (`src/renderer/components/layout/TopBar.tsx`) đổi nhãn/hành vi theo `projects.status`: **Run All** khi `draft`/`ready`, **Resume** khi `paused`, **Retry Failed** khi `failed`/`completed_with_errors`, disabled kèm tooltip lý do (mục 38) khi chưa đủ điều kiện chạy. Khi `status=processing`, nút Run All ẩn đi, thay bằng nhãn "Processing…" + ~~2 nút **Pause**/**Cancel**~~ (xem cập nhật Phase 14 ngay dưới, mục 37). Khi `status=completed`, thay bằng badge tĩnh "✓ Completed" (không phải nút bấm được). Model hiển thị cạnh tên project đổi thành `selectedModelSnapshot` sau lần Run đầu tiên (mục 32) thay vì `selectedModel` sống.

**Cập nhật (Phase 14, ngoài phạm vi V1 gốc):** khi `status=processing`, 2 nút Pause/Cancel **bị xoá hẳn**, thay bằng đúng 1 nút **Delete** duy nhất (`variant="danger"`) — xoá được project ngay cả khi đang chạy (mục 37). Lý do: Pause và Cancel vốn gọi cùng 1 hàm ở backend (`PipelineService.pause()`), không có khác biệt hành vi thật nào giữa 2 nút — giữ cả 2 chỉ dư thừa UI. `pipeline.pause`/`pipeline.cancel` (IPC, mục 4.2) vẫn còn nguyên, chỉ không còn nút nào gọi tới.

**Cập nhật lớn (Phase 15, ngoài phạm vi V1 gốc) — nút Resume bị xoá hẳn:** khi `status=paused`, TopBar không còn hiện nút `[Run All]` với nhãn "Resume" nữa — thay bằng đúng 1 badge tĩnh **"Paused"** (không phải nút bấm được, cùng kiểu badge tĩnh với "✓ Completed"). Lý do: theo yêu cầu trực tiếp của user (đã xác nhận lại việc hiểu rõ hệ quả — 1 project `paused` giờ không còn cách nào chạy tiếp được từ UI). `runLabel` giờ chỉ còn 2 giá trị: **Run All** (`draft`/`ready`, và mặc định khi không rơi vào case còn lại) hoặc **Retry Failed** (`failed`/`completed_with_errors`) — case `paused` không bao giờ chạm tới nhánh render nút nữa vì đã tách badge riêng trước đó. `onRunOrResume`/`canRun`/`pipeline.run()` bên dưới không đổi gì — chỉ đơn giản không còn đường nào từ UI gọi tới chúng khi `status=paused`.

---

# 8. Sidebar

## 8.1. Overview

Hiển thị:

- Project name
- Selected model
- Transcript character count
- SRT count
- Character count
- Generated character prompts
- Generated scene prompts
- Failed tasks
- Overall progress

Ví dụ:

```text
Transcript       Ready
SRT              128 blocks
Characters       14
Character Prompt 14 / 14
Image Prompt     94 / 128
Failed           2
Progress         78%
```

**Implementation thật (Phase 10):** `OverviewPage.tsx` — chưa có sẵn trong Stitch, verify lại `get_screen` "StoryPrompt - Dashboard" và "Project Detail - Transcript & SRT" (không có section nào chứa stats per-project) rồi `generate_screen_from_text` màn mới đúng design system của project. Đủ 9 field: Project name/Selected model đọc trực tiếp từ `currentProject` (`selectedModelSnapshot ?? selectedModel`, cùng convention TopBar mục 7); Transcript character count = `currentProject.transcript.length`; SRT/Characters/Character Prompt/Image Prompt/Failed lấy qua các IPC list đã có sẵn (`srt.list`/`characters.list`/`characters.listPrompts`/`scenePrompts.list`, cùng pattern `ProcessingPage.tsx` mục 8.6) — không thêm IPC/aggregate query mới. **Failed** = số `character_prompts` + số `scene_prompts` có `status='failed'` (không tính `pipeline_tasks` — xem lý do ở dưới). **Overall progress** dùng đúng công thức `ProcessingPage`/`listProjectSummaries` (mục 6.2): `(character prompt success + scene prompt success) / (characters + srt blocks)`.

**Bug fix `failedTaskCount` (Phase 10):** trong lúc audit, phát hiện `listProjectSummaries()` (`ProjectSummary.failedTaskCount`, mục 6.2) trước đó tính sai — chỉ đếm `pipeline_tasks.status='failed'`, nhưng bảng này (mục 25) chỉ có row cho 3 task cấp dự án (`SPLIT_SRT`/`DETECT_CHARACTERS`/`GENERATE_CHARACTER_PROMPTS`), không phản ánh số lượng Character Prompt/Scene Prompt lỗi ở cấp đơn vị — đúng ý "Failed" trong ví dụ trên. Sửa lại thành tổng `character_prompts.status='failed'` + `scene_prompts.status='failed'`, khớp cách Overview tính ở trên. Một lỗi ở coarse pipeline_tasks (SPLIT_SRT/DETECT_CHARACTERS thất bại, chặn cả pipeline trước khi có character_prompts/scene_prompts nào) không bị đếm trùng vào đây — nó đã hiện rõ qua `projects.status = 'failed'` ở nơi khác (TopBar, Project History badge, mục 6.2/7).

**Bug fix real-time update (Phase 16, 2026-08-10 — user report):** "project chạy xong mà không được cập nhật khi đang ở project detail, thoát ra vào dashboard mới thấy thành công". Nguyên nhân: `OverviewPage.tsx` (trang mặc định khi mở project, mục 7) chỉ fetch 9 field trên **đúng 1 lần lúc mount**, không subscribe kênh live nào — khác `TopBar.tsx`/`ProcessingPage.tsx` (mục 8.6) vốn đã subscribe `usePipelineStore`/`scenePrompts.onProgress` từ Phase 9. Sửa bằng cách áp đúng pattern đã chứng minh hoạt động ở `ProcessingPage.tsx`: `OverviewPage` giờ cũng subscribe `usePipelineStore` (refetch khi `tasks` đổi — bắt được cả run kích hoạt qua Run Queue, mục 6.4, không chỉ tự bấm Run All), lắng nghe `scenePrompts.onProgress` để merge kết quả batch trực tiếp, và refetch khi `isRunning` chuyển về false. Verify bằng driver Electron/Playwright thật (không mock) — xác nhận `refresh()` gọi lại nhiều lần trong vòng &lt;100ms sau khi 1 task thật đổi trạng thái, khớp đúng lúc backend thật sự chạy, không cần rời trang.

## 8.2. Transcript

Text editor lớn.

Chức năng:
- Paste
- Select all
- Clear
- Load `.txt`
- Character count
- Word count

Không cần Rich Text.

**Implementation thật (Phase 4):** Paste dùng `navigator.clipboard.readText()` ngay trong Renderer (không qua IPC — chỉ là thao tác UI, không phải business logic/API key); nếu bị trình duyệt/OS chặn quyền đọc clipboard, hiển thị thông báo yêu cầu paste trực tiếp (Cmd+V) thay vì crash. Select All gọi `textarea.select()`. Load `.txt` đi qua IPC `projects.loadTranscriptFile()` — Main mở `dialog.showOpenDialog` (filter `.txt`) và đọc file bằng `readFileSync`, trả nội dung string hoặc `null` nếu người dùng cancel; Renderer không có quyền filesystem trực tiếp, đúng kiến trúc mục 4.1. Character count/word count tính live từ state, không cần round-trip IPC.

**Cập nhật lớn (Phase 15, ngoài phạm vi V1 gốc) — cả 4 nút Paste/Select All/Clear/Load .txt bị xoá khỏi `TranscriptPage.tsx`:** theo yêu cầu trực tiếp của user, đã xác nhận lại 2 lần biết rõ hệ quả. Paste/Select All/Clear vẫn làm được bằng thao tác tay ngay trong textarea (Ctrl+V/Ctrl+A/xoá text chọn), không mất chức năng thật — chỉ mất nút tiện dụng. **Load .txt mất hẳn, không có thao tác thay thế nào khác trong app** để nạp file `.txt` vào transcript của 1 project đã tồn tại. IPC `projects.loadTranscriptFile()` vẫn còn nguyên (không xoá, cùng convention Phase 14 — chỉ không còn UI nào gọi tới). Character count/Word count không đổi, vẫn hiển thị.

## 8.3. SRT

Hiển thị:
- danh sách SRT block
- index
- fake timestamp
- text
- character count

Có search.

Không cần chỉnh timestamp chính xác.

**Implementation thật (Phase 5):** `SrtPage.tsx` hiển thị danh sách 1 cột dọc (không phải lưới nhiều cột — đổi từ layout Stitch gốc để dễ đọc block dài nhiều dòng), mỗi card gồm index, `HH:MM:SS,mmm --> HH:MM:SS,mmm` (đúng format mục 22), text, character count. Search lọc theo text hoàn toàn ở Renderer (client-side, không round-trip IPC). Vì `pipeline.run`/Run All chưa nối (đến Phase 9), tab này có thêm nút tạm thời **Split SRT** để trigger `srt.split` thủ công.

**Cập nhật (Phase 9):** Run All thật đã có (mục 36) và cũng chạy `SPLIT_SRT` như bước đầu tiên, nhưng nút **Split SRT** ở đây **không bị xoá** — giữ lại làm trigger thủ công độc lập (hữu ích khi chỉnh transcript rồi muốn tách lại SRT ngay mà chưa muốn chạy cả pipeline). Quyết định khác với kế hoạch ban đầu ("sẽ được thay bằng Run All").

**Cập nhật (Phase 14, ngoài phạm vi V1 gốc):** nút **Split SRT** rốt cuộc **cũng bị xoá** — đảo ngược quyết định Phase 9 ở trên, theo yêu cầu trực tiếp của user sau khi Run All đã chứng minh đủ dùng trong thực tế. Tab giờ chỉ hiển thị block đã có sẵn, thuần đọc (`srt.list`), không còn action nào khác. `srt.split` (IPC, mục 4.2) vẫn còn nguyên ở Main, chỉ không còn nút UI nào gọi tới — Run All (mục 36) là đường duy nhất tạo SRT block.

## 8.4. Characters

Card/table nhân vật.

Hiển thị:
- Character ID
- age
- gender
- role
- Visual DNA
- Character Prompt

Không cần người dùng approve trước khi pipeline chạy tiếp.

Sau khi pipeline xong người dùng có thể xem thông tin đã tạo.

**Implementation thật (Phase 6):** `CharactersPage.tsx` — chưa có Stitch screen sẵn cho màn này (`generate_screen_from_text` timeout 2 lần liên tiếp, không tạo được), build trực tiếp bằng Tailwind theo token DESIGN.md. Danh sách 1 cột dọc, mỗi card: chip `@Character_ID` (mono, `vilao-blue`), role badge, `age_range · gender`, section Visual DNA. Nút tạm thời **Detect Characters** (thay Run All tới Phase 9, xem mục 14.1) — disable kèm tooltip lý do khi chưa có transcript hoặc prompt Character Detection đang thiếu placeholder bắt buộc (mục 27). Có search lọc theo Character ID/tên/role, client-side.

**Implementation thật (Phase 7):** Thêm nút tạm thời **Generate Character Prompts** (cạnh Detect Characters, cùng pattern nút tạm đứng thay Run All, xem mục 15) — disable kèm tooltip khi chưa có `characters` hoặc prompt Character Generation thiếu placeholder `{{CHARACTERS}}` bắt buộc (mục 27). Section Character Prompt trên mỗi card hiển thị 1 trong 3 trạng thái thay vì luôn trống: chưa có row (placeholder "Not generated yet"), `status=failed` (hiện `error` + nút **Retry** riêng cho đúng nhân vật đó, gọi `characters.retryPrompt` — không ảnh hưởng nhân vật khác), `status=success` (hiện prompt tiếng Anh + nút **Copy**). Bấm Detect Characters lại sẽ clear prompt state ở Renderer (Character Database mới không còn khớp prompt cũ) — chờ người dùng bấm Generate lại, không tự động gọi lại LLM.

**Cập nhật (Phase 9):** cả 2 nút **Detect Characters**/**Generate Character Prompts** vẫn giữ nguyên, không bị Run All thay thế — cùng quyết định như mục 8.3's Split SRT, phục vụ việc chạy lại/kiểm tra riêng từng bước mà không cần chạy cả pipeline. `generatePrompts()`/`detect()` vẫn luôn xử lý lại toàn bộ mỗi lần bấm (không bỏ qua nhân vật đã `success`) — khác với Scene Generation (mục 17.1) đã có cơ chế bỏ qua khi Resume.

**Cập nhật (Phase 14, ngoài phạm vi V1 gốc):** cả 2 nút **Detect Characters** và **Generate Character Prompts** (cùng modal xác nhận Regenerate ở mục 20) **bị xoá hẳn** — cùng quyết định/lý do như Split SRT ở mục 8.3, đảo ngược quyết định Phase 9. Nút **Retry** riêng từng nhân vật (khi `character_prompts.status=failed`) **vẫn giữ nguyên** — khác mục đích, sửa lỗi 1 nhân vật lẻ chứ không phải trigger thủ công thay Run All. `characters.detect`/`characters.generatePrompts` (IPC, mục 4.2) vẫn còn nguyên ở Main, chỉ không còn nút UI nào gọi tới nữa — Run All (mục 36) là đường duy nhất chạy 2 bước này.

## 8.5. Image Prompts

Danh sách:

```text
PROMPT 001
PROMPT 002
PROMPT 003
...
```

Mỗi item hiển thị:
- SRT text
- relevant characters
- generated prompt
- status
- retry button nếu lỗi
- copy prompt

Có:
- Search
- Copy
- Copy All

**Implementation thật (Phase 8):** `ImagePromptsPage.tsx` — chưa có Stitch screen sẵn cho màn này (cùng tình huống "chưa có trong Stitch" như Characters ở Phase 6), build trực tiếp bằng Tailwind theo token DESIGN.md, tái dùng layout card 1 cột dọc + search của `CharactersPage.tsx`. Mỗi card: `PROMPT 0NN` (map theo `srt_blocks.block_index`), SRT text, chip relevant characters (rỗng → "None"), generated prompt theo 3 trạng thái (chưa có/`failed` kèm nút **Retry** riêng cho đúng SRT đó/`success` kèm nút **Copy**). Search lọc client-side theo SRT text + prompt + character ID. **Copy All** gộp mọi scene `status=success` theo đúng format mục 24 (`PROMPT 00N:\n\n<prompt>`). Nút tạm thời **Generate Image Prompts** (thay Run All tới Phase 9, cùng pattern "Split SRT"/"Detect Characters") — disable kèm tooltip khi chưa có `srt_blocks` hoặc prompt Scene Generation thiếu placeholder bắt buộc.

**Live progress (phát sinh ngoài spec gốc, thêm sau khi user yêu cầu trong lúc test thủ công Phase 8):** trong lúc `Generate Image Prompts` đang chạy, phía dưới nút hiện "Batch X / Y" + "N / M prompts completed" kèm thanh 2px `emerald-success` (đúng DESIGN.md "Progress Indicators") — cập nhật sau mỗi batch qua `appApi.scenePrompts.onProgress()` (xem mục 17), đồng thời merge kết quả của batch đó vào danh sách ngay (không đợi `generate()` chạy xong toàn bộ mới thấy prompt xuất hiện). Đây là bản rút gọn của khái niệm "Processing" (mục 8.6) áp dụng riêng cho bước Scene Generation, đi trước Phase 9's Processing tab đầy đủ.

**Cập nhật (Phase 9):** nút **Generate Image Prompts** vẫn giữ nguyên (cùng quyết định như 8.3/8.4) — nhưng hành vi bên dưới đổi: `ScenePromptService.generate()` giờ **bỏ qua** (không gọi LLM) bất kỳ batch nào đã có mọi block `status=success` (mục 17.1/19.3), nên bấm lại nút này sau khi đã thành công một phần giờ chỉ xử lý phần còn thiếu/lỗi, không gọi lại LLM cho scene đã xong — khác hành vi ban đầu ("regenerate toàn bộ mỗi lần bấm"). Chạy lại thật sự ép toàn bộ (kể cả scene đã `success`) là tính năng Regenerate riêng, để dành Phase 12 (mục 20).

**Cập nhật lớn (Phase 15, ngoài phạm vi V1 gốc) — nút Generate Image Prompts bị xoá:** đây là nút tạm-thời-thay-Run-All cuối cùng còn sót lại — 3 nút cùng loại (Split SRT/Detect Characters/Generate Character Prompts, mục 8.3/8.4) đã bị dọn ở Phase 14 nhưng nút này bị bỏ sót, giờ dọn nốt theo đúng quyết định cũ ("Run All đã đủ dùng trong thực tế nên không cần nữa", mục 40). Cùng theo đó: banner cảnh báo thiếu placeholder Scene Generation prompt (`missingPlaceholders`) cũng bị xoá — Image Prompts giờ **thuần hiển thị kết quả**, đúng pattern SrtPage/CharactersPage đã áp dụng, validation trước Run chỉ còn ở TopBar (mục 38). Vẫn giữ nguyên: card-per-block, nút **Retry** riêng từng SRT lỗi, **Copy**/**Copy All**, và cập nhật live theo `scenePrompts.onProgress()` (mục 17) bất kể ai kích hoạt run (TopBar/Processing hay Run Queue mục 6.4) — không còn gắn với trạng thái "đang generate" cục bộ của nút đã xoá. **Copy All** đổi sang gọi thẳng `formatImagePromptsFile()` (`src/shared/exportFormat.ts`, mục 24) thay vì tự dựng format riêng — trước đó 2 nơi định dạng độc lập đã lệch nhau sau lần đổi format mục 24 (Phase 15), giờ chỉ còn 1 nguồn duy nhất.

## 8.6. Processing

Hiển thị pipeline task.

Ví dụ:

```text
✓ Split SRT
✓ Detect Characters
✓ Generate Character Prompts
✓ Scene 001
✓ Scene 002
● Scene 003
○ Scene 004
...
```

Status icon:

```text
○ Pending
● Running
✓ Success
! Failed
↻ Retrying
— Skipped
```

Actions:
- Pause
- Resume
- Cancel
- Retry Failed

**Cập nhật (Phase 14, ngoài phạm vi V1 gốc):** **Pause** và **Cancel** bị xoá khỏi Actions — xem "Cập nhật (Phase 14)" ở mục 7/37. **Resume** và **Retry Failed** không đổi.

**Cập nhật lớn (Phase 15, ngoài phạm vi V1 gốc) — thay thế câu "Resume... không đổi" ngay trên:** **Resume bị xoá khỏi Actions.** Khi `status=paused`, tab Processing không còn nút hành động nào — thay bằng badge tĩnh "Paused" (cùng cách TopBar mục 7 làm). **Retry Failed** (`failed`/`completed_with_errors`) là action chạy-tiếp duy nhất còn lại. Xem mục 7 để biết chi tiết implementation (dùng chung `runLabel`/logic render với TopBar).

**Implementation thật (Phase 9):** `ProcessingPage.tsx` — chưa có Stitch screen riêng cho breakdown "Scene 001/002/..." nhưng có screen "Pipeline Status" (bento grid 4 card trạng thái + progress bar + activity log) dùng làm layout tham khảo (`get_screen` trước khi code, theo đúng quy trình bắt buộc). Layout thật: progress bar tổng (`vilao-blue`), bento grid 4 card trạng thái (Split SRT/Detect Characters/Generate Character Prompts/Scene Generation), danh sách "Scene 00N" bên dưới — thay hẳn "Activity Log" giả lập trong mockup Stitch gốc bằng danh sách scene thật (dữ liệu thật quan trọng hơn hiệu ứng terminal giả).

3 card đầu đọc thẳng `pipeline.listTasks()` (3 row `pipeline_tasks` thật, mục 25). Card **Scene Generation** + danh sách "Scene 00N" **không** đọc `pipeline_tasks` — đọc thẳng `scenePrompts.list()` (đã có sẵn từ Phase 8, đã có `status`/`attempts`/`error` per-block) để tránh 2 nguồn sự thật song song cho cùng 1 trạng thái (xem mục 25).

Status icon thật chỉ có 4/6 trạng thái được lưu/hiện trực tiếp: `○ Pending` (chưa có row, hoặc row `pending`), `● Running` (chỉ 3 card đầu có được — `pipeline_tasks` được ghi `running` thật trước khi gọi service; `character_prompts`/`scene_prompts` không có trạng thái `running` persist vì các batch chỉ ghi kết quả cuối cùng, không ghi từng lần thử), `✓ Success`, `! Failed`. **`↻ Retrying` chỉ hiện được cho scene** (đọc `attempts > 1` khi `status=failed`, hiện `(Nx)` cạnh nhãn Failed) — không có "đang retry" live cho 3 card cấp dự án vì lý do trên. **`— Skipped` không được phân biệt riêng** với `✓ Success` — schema.md ghi rõ đây là trạng thái suy ra ở UI, nhưng không có cách phân biệt "vừa skip trong lượt Resume này" với "đã success từ trước" nếu không thêm state phiên làm việc riêng; chấp nhận đơn giản hoá, cả 2 đều hiện `✓ Success`.

Actions Resume/Retry Failed (Pause/Cancel đã xoá, xem Phase 14 ở trên) dùng chung `usePipelineStore` (Zustand, module-level singleton) với TopBar (mục 7) — bấm từ tab nào cũng phản ánh đúng trạng thái ở tab kia. **Retry Failed và Resume là cùng 1 lời gọi** (`pipeline.run`/`resume`/`retryTask` đều trỏ `runProject()`, mục 19.3/36) — không có logic "chỉ retry đúng phần failed, bỏ qua pending" tách biệt, vì gating trong `runProject()` đã tự nhiên chỉ làm lại phần chưa xong. Khi `status=processing`, thay vì Pause/Cancel, tab hiện đúng 1 nút **Delete** (mục 37) — dùng chung `DeleteProjectModal` (component mới, `src/renderer/components/DeleteProjectModal.tsx`) với TopBar và Home (mục 6.2).

**Bug fix real-time update (Phase 20, 2026-08-11 — user report, cùng loại bug đã vá ở Overview mục 8.1 Phase 16):** "Scene Generation xong nhưng không cập nhật real time, phải out project ra mới nhận success". Nguyên nhân: `ProcessingPage.tsx` chỉ refetch `srtBlocks`/`characters`/`characterPrompts` khi `isRunning` (cờ riêng của cửa sổ Renderer, chỉ đúng khi *chính cửa sổ đó* gọi Run All trực tiếp) chuyển `true`→`false` — nhưng cách duy nhất để chạy 1 project **mới** là qua Add to Queue (mục 6.4), nơi `isRunning` của cửa sổ đang xem Processing không bao giờ thành `true`, nên dữ liệu bị đóng băng ở lúc mount (thường là rỗng) suốt cả lượt chạy. Sửa bằng cách áp đúng pattern `OverviewPage.tsx` đã có từ Phase 16: refetch thêm khi `tasks` (từ `usePipelineStore`) đổi — kênh này bắn cho cả 2 trường hợp (chạy trực tiếp lẫn qua Queue). Verify bằng cách tự dựng 1 instance Electron cô lập (Playwright `_electron`, `--user-data-dir` riêng không đụng dữ liệu thật, mock `global.fetch` trong Main để không gọi Vilao thật) — replay đúng luồng Add to Queue, xác nhận card Scene Generation + danh sách Scene Tasks cập nhật live từng batch mà không cần rời trang.

## 8.7. Export

Hiển thị preview file sẽ export.

Nút:

~~**Export Project**~~ — đã xoá ở Phase 14, xem "Cập nhật (Phase 14)" bên dưới. Export giờ **tự động**, không còn nút thủ công.

**Implementation thật (Phase 11):** không có Stitch screen cho Export (`generate_screen_from_text` timeout không tạo ra screen mới, cùng hiện tượng đã note ở Characters/Image Prompts) — `ExportPage.tsx` build thẳng bằng Tailwind theo token DESIGN.md, tái dùng pattern khối preview monospace đã có ở `ImagePromptsPage`. Layout thật: card "Output Folder" liệt kê cây thư mục `Project_Name/` + tên 3 file, 3 card preview (1/file) hiện tối đa 3 entry đầu — dùng **đúng** hàm format trong `src/shared/exportFormat.ts` mà `ExportService` dùng để ghi file thật, nên preview không bao giờ lệch với file xuất ra — kèm `+N more` khi còn entry chưa hiện. Nút **Export Project** (disabled khi chưa có `srt_blocks`) gọi `export.project()`, banner thành công `emerald-success` + nút **Show in Finder** xuất hiện sau khi ghi file xong. Home (Project History, mục 6.2) cũng có action Export riêng ở mỗi row, dùng chung `export.project()`/`export.showInFinder()`, disabled khi project chưa có `srt_blocks`.

**Cập nhật lớn (Phase 14, ngoài phạm vi V1 gốc) — Export tự động hoá hoàn toàn, thay thế mô tả Phase 11 ở trên:**
- **Nút "Export Project" bị xoá hẳn**, cùng với đó `export.project()` (IPC) cũng bị xoá luôn (không giữ lại như các trường hợp khác trong Phase 14 — vì hàm này thật sự không còn ý nghĩa gì khi không còn ai gọi tới cả trực tiếp lẫn gián tiếp). Thay bằng `export.getFolderPath(projectId)`, chỉ đọc (mục 4.2).
- **`PipelineService.runProject()` tự gọi `ExportService.export()`** ngay sau khi Run All đạt `completed`/`completed_with_errors` (mục 21/36) — ghi file xảy ra ở Main, không qua hành động nào của Renderer nữa. Lỗi ghi file (ví dụ Default Export Folder không còn quyền ghi) là best-effort: log ra console, **không** làm cả run bị coi là fail.
- **Export tab giờ chỉ còn preview + banner "Exported to ..."** (hiện khi `project.status` là `completed`/`completed_with_errors` **và** đã xác định được `getFolderPath()`) kèm nút **Show in Finder** — không có hành động nào khác để user bấm trên tab này nữa.
- **Home (mục 6.2) không còn action Export/Show in Finder riêng ở mỗi row** — dư thừa, vì export đã tự động khi Run All xong.
- Xem mục 21 để biết chi tiết **Default Export Folder** (nơi file được ghi vào).

---

# 9. Settings

Settings chia thành:

```text
General
Vilao API
Prompts
Advanced
```

---

# 10. General Settings

## 10.1. Average Characters Per SRT + Variance %

**Cập nhật thật (Phase 19 — Post-V1, ngoài phạm vi V1 gốc, 2026-08-11, theo yêu cầu trực tiếp user):** "Maximum characters per SRT" đổi thành **"Average characters per SRT"** — không còn là giới hạn cứng, mà là mục tiêu trung bình, đi kèm setting mới **"Variance (±%)"** để thuật toán chia SRT (mục 11) co giãn quanh mức trung bình đó thay vì cắt cứng, tránh câu bị cắt quá ngắn. Đây là schema change thật (đổi tên cột `max_characters` → `avg_characters`, thêm cột `variance_percent`) — đã hỏi lại qua `AskUserQuestion` trước khi implement theo CLAUDE.md. Chi tiết đầy đủ: `context/schema.md` Changelog Phase 19, mục 11.2/11.3/11.5 dưới đây.

Tên setting:

```text
Average characters per SRT
```

Default:

```text
300
```

Cho phép thay đổi.

Đề xuất range:

```text
100 – 2000
```

### Variance (±%)

Tên setting:

```text
Variance (±%)
```

Default:

```text
30
```

Range:

```text
0 – 90
```

0 = hành vi ngưỡng cứng như trước Phase 19 (block không bao giờ vượt quá Average). SRT block dao động trong khoảng `[Average × (1 − Variance/100), Average × (1 + Variance/100)]` — ưu tiên đạt ngưỡng dưới của khoảng này trước khi ngắt block, chấp nhận vượt nhẹ ngưỡng trên khi cần, thay vì luôn tôn trọng ngưỡng trên tuyệt đối.

**Không sửa được sau khi project đã tạo** — cùng field `avgCharacters`/`variancePercent` copy 1 lần từ Channel lúc tạo project (mục 6.5), giống hệt `maxCharacters`/`fakeDurationSec` trước đây.

## 10.2. Fake Duration

Tên:

```text
Duration per SRT block
```

Default:

```text
3 seconds
```

Range đề xuất:

```text
1 – 30 seconds
```

## 10.3. Retry

Default:

```text
Max retry = 1
```

**Không còn UI để chỉnh** (mục 33, Phase 16, 2026-08-10 — theo yêu cầu user) — mọi project cố định 1 lần thử/task-batch, không tự động retry.

**Quyết định thật (Phase 4):** Max Retry ban đầu đặt trong Settings > Advanced, wiring thật để dành Phase 9 (cùng `scene_concurrency`, vì cả 2 đều thuộc pipeline execution tuning). Khác với `maxCharacters`/`fakeSrtDurationSec`, Max Retry **không** có field tương ứng trong `AppSettings` (`context/schema.md`) — mỗi project luôn khởi tạo `max_retry` từ hằng số `DEFAULT_MAX_RETRY` trong `ProjectService`, không đọc từ global settings khi tạo project. Thêm field `maxRetry` vào `AppSettings` sẽ là một thay đổi schema, cần hỏi lại trước theo CLAUDE.md.

**Wiring thật (Phase 9):** Settings > Advanced > Pipeline Tuning bật form thật (React Hook Form + Zod) cho `maxRetry` (min 1) và `sceneConcurrency` (1–5) — nhưng sửa **project đang mở**, không phải một default toàn cục, vì 2 field này luôn thuộc về 1 project cụ thể (không có ở `AppSettings`, xem trên). Route Settings là route global (`/settings`, ngoài `/projects/:id`) nên trang đọc `useProjectStore.currentProject` (không bị clear khi rời route project) để biết đang sửa project nào — vào Settings từ TopBar (đang có project mở) thì form enable, vào từ Home Sidebar (chưa mở project nào) thì disable kèm hướng dẫn. IPC mới `projects.updatePipelineSettings` (mục 4.2).

**Cập nhật thật (Phase 16, 2026-08-10 — theo yêu cầu user "Để retry là 1, không cần setting nữa"):** `DEFAULT_MAX_RETRY` hạ từ 3 xuống 1; ô "Max Retry" bị xoá khỏi form Pipeline Tuning (chỉ còn Scene Generation Concurrency lúc này). `updatePipelineSettings` IPC/service/cột DB giữ nguyên hoàn toàn (vẫn nhận cả `maxRetry`+`sceneConcurrency` trong 1 lời gọi) — form giờ luôn gửi lại đúng `maxRetry` hiện tại của project (pass-through, không đổi) cùng `sceneConcurrency` vừa sửa, nên không cần đổi IPC shape ở bước này. Chi tiết xem `context/schema.md` Changelog Phase 16.

**Cập nhật thật (Phase 17, cùng ngày 2026-08-10 — thêm setting Scene Generation Batch Size):** `updatePipelineSettings` đổi shape thật — thêm field thứ 3 `sceneBatchSize` (int, 1–20) vào cùng lời gọi. Form Pipeline Tuning thêm ô "SCENE GENERATION BATCH SIZE" ngay dưới Scene Generation Concurrency. Đây là schema change thật (cột mới `projects.scene_batch_size`, migration `0003_add_scene_batch_size`) — đã hỏi lại range hợp lệ qua `AskUserQuestion` trước khi implement theo CLAUDE.md, user chọn 1–20. Chi tiết đầy đủ xem mục 17 và `context/schema.md` Changelog Phase 17.

---

# 11. Logic chia SRT

Input là transcript text thuần.

## 11.1. Sentence segmentation

Ưu tiên tách theo:

```text
.
?
!
…
xuống dòng
```

Phải cố gắng giữ nguyên câu hoàn chỉnh.

## 11.2. Gom câu

**Cập nhật thật (Phase 19, 2026-08-11):** thay hằng số `maxCharacters` (ngưỡng cứng) bằng khoảng `[min, max]` suy ra từ `avgCharacters`/`variancePercent` (mục 10.1):

```text
min = avgCharacters * (1 - variancePercent / 100)
max = avgCharacters * (1 + variancePercent / 100)
```

Algorithm:

```text
currentBlock = ""

for sentence in sentences:
    candidate = currentBlock + sentence

    if candidate.length <= max:
        currentBlock = candidate
    else if currentBlock.length < min:
        # chưa đạt ngưỡng dưới — vẫn nhét thêm, chấp nhận vượt nhẹ max,
        # thay vì chốt lại 1 block quá ngắn (yêu cầu trực tiếp của user)
        currentBlock = candidate
    else:
        save currentBlock
        currentBlock = sentence
```

Nguyên tắc:

> Gom nhiều câu cho tới khi block đạt khoảng `[min, max]` quanh mức trung bình — ưu tiên đạt `min` trước khi ngắt, chấp nhận vượt nhẹ `max` khi cần, thay vì luôn tôn trọng `max` tuyệt đối. `variancePercent = 0` ⇒ `min = max = avgCharacters` ⇒ y hệt hành vi ngưỡng cứng cũ.

## 11.3. Câu đơn quá dài

**Cập nhật (2026-08-11, theo yêu cầu trực tiếp user — rule bắt buộc):** không bao giờ cắt một câu trước khi câu đó thực sự kết thúc (`.`/`?`/`!`/`…`). Nếu một câu đơn đã lớn hơn `max` (mục 11.2), câu đó **vẫn giữ nguyên vẹn, trở thành 1 block riêng của chính nó**, dù vượt `max` bao nhiêu cũng chấp nhận — không hard-cut giữa từ, không cắt tại whitespace, không cắt tại `;`/`:`/`,`.

(Lịch sử: bản đầu tiên có ưu tiên cắt tại `;` rồi `:` rồi `,` rồi whitespace gần giới hạn nhất, chỉ hard-cut khi không còn lựa chọn nào — toàn bộ cơ chế này đã bị bỏ hẳn, xem `src/main/pipeline/splitSrt.ts` — hàm `splitOversizedSentence()` không còn tồn tại.)

## 11.4. Timeline giả

Ví dụ duration = 3 giây.

```text
1
00:00:00,000 --> 00:00:03,000
Text block 1

2
00:00:03,000 --> 00:00:06,000
Text block 2

3
00:00:06,000 --> 00:00:09,000
Text block 3
```

Công thức:

```text
start = (index - 1) * duration
end   = index * duration
```

Timeline chỉ để tạo SRT hợp lệ về cấu trúc.

Không đại diện timeline thực của video.

## 11.5. Implementation thật (Phase 5)

`splitTranscriptToSrtBlocks(transcript, avgCharacters, variancePercent, fakeDurationSec)` (`src/main/pipeline/splitSrt.ts` — signature đổi ở Phase 19, thêm tham số `variancePercent`, đổi tên `maxCharacters` → `avgCharacters`) — pure function, không import Electron/DB nên unit-test trực tiếp được (`tests/unit/srtSplitter.test.ts`). Vài điểm khác biệt/cụ thể hoá so với pseudocode ở 11.1–11.4:

- **Gom câu (11.2) nối bằng 1 khoảng trắng** giữa các câu/chunk (`current + ' ' + unit`), không phải nối thẳng chuỗi như pseudocode `currentBlock + sentence` — tránh 2 câu dính liền nhau khi hiển thị.
- **`avgCharacters`/`min`/`max` đếm theo ký tự thị giác (grapheme cluster), không phải UTF-16 code unit** của JS (`.length`/`.slice()` mặc định). Lý do: `.length` đếm sai với tiếng Việt nếu văn bản ở dạng NFD (dấu tách rời khỏi chữ cái, hay gặp khi copy từ macOS/PDF — 1 chữ có dấu bị tính thành 2+ code unit). Implementation: `transcript.normalize('NFC')` ngay đầu vào, sau đó mọi phép đếm (ngưỡng gom câu, `character_count` output) đều thao tác trên mảng grapheme cluster từ `Intl.Segmenter(undefined, { granularity: 'grapheme' })`. (Trước 2026-08-11 việc này còn phục vụ cả hard-cut ở 11.3 — không còn hard-cut nữa nên chỉ còn phục vụ đếm ký tự, nhưng vẫn cần thiết vì lý do đếm đúng nói trên.)
- **`SrtService`** (`src/main/services/SrtService.ts`, không import Electron — cùng convention `ProjectService`) đọc `avg_characters`/`variance_percent`/`fake_duration_sec` từ chính project (đã copy 1 lần từ channel lúc tạo project, mục 6.1/6.5), **không** đọc `AppSettings` global hiện hành. `split(projectId)` xoá sạch + insert lại toàn bộ `srt_blocks` của project trong 1 transaction mỗi lần chạy (replace, không diff) — khớp đúng pseudo flow Run All ở mục 36, nơi `createSrtBlocks()` luôn chạy vô điều kiện mỗi lần Run/Resume chứ không qua vòng đời `pending/running/success/failed` như Character Detection/Character Prompt.
- Chưa tạo `pipeline_tasks` row riêng cho `SPLIT_SRT` ở Phase 5 — quyết định thuộc `TaskQueueService`/`PipelineService` khi Phase 9 wire Run All thật.
- **Phase 19 bug fix:** bản đầu của "ưu tiên đạt `min` trước khi ngắt" (11.2) dùng điều kiện `currentBlock.length < min` không kèm guard — ở `variancePercent = 0` thì `min === max`, khiến điều kiện gần như luôn đúng và ép toàn bộ transcript gộp vào 1 block, phá vỡ cam kết "variance 0 = y hệt thuật toán cũ". Fix: chỉ áp dụng nhánh "ưu tiên đạt min" khi `min < max` (tức `variancePercent > 0`) — xem `context/schema.md` Changelog Phase 19.

---

# 12. AI Pipeline

Pipeline chính:

```text
Transcript
    ↓
Split SRT
    ↓
Character Detection
    ↓
Character Database
    ↓
Character Prompt Generation
    ↓
Character Reference Database
    ↓
Relevant Character Selection
    ↓
Scene Prompt Generation
    ↓
Save từng Scene
    ↓
Export
```

Người dùng chỉ cần nhấn:

```text
RUN ALL
```

---

# 13. Step 1 — Split SRT

Không gọi LLM.

Input:
- transcript
- avgCharacters / variancePercent (đổi tên từ maxCharacters + thêm variancePercent, Phase 19)
- fakeDuration

Output:
- SRT blocks

Schema (mô tả ý tưởng — nguồn chuẩn thật là `SrtBlock` trong [src/shared/entities.ts](../src/shared/entities.ts), field-for-field khớp `srt_blocks` ở [schema.md](schema.md); `index` ở bản nháp này tương ứng `blockIndex` trong code):

```ts
interface SrtBlock {
  id: string;
  projectId: string;
  blockIndex: number;
  startMs: number;
  endMs: number;
  text: string;
  characterCount: number;
  createdAt: string;
}
```

Implementation thật (`splitTranscriptToSrtBlocks()` + `SrtService`): xem mục 11.5.

---

# 14. Step 2 — Character Detection

Chỉ gọi LLM **1 lần trên toàn bộ transcript**.

Mục tiêu:
- phát hiện toàn bộ nhân vật
- map đại từ/danh xưng
- tạo Character ID
- tạo Visual DNA

Output yêu cầu JSON.

App phải:
1. Parse JSON.
2. Validate schema.
3. Nếu JSON lỗi, thử repair tối thiểu.
4. Nếu vẫn lỗi, retry task.

Character Database schema:

```ts
interface Character {
  id: string;
  name: string;
  gender: string;
  ageRange: string;
  appearance: string;
  hair: string;
  clothing: string;
  personality: string;
  role: string;
  uniqueFeatures: string;
  visualDna: string;
}
```

## 14.1. Implementation thật (Phase 6)

`src/main/pipeline/detectCharacters.ts` (pure function, không import Electron/DB — unit-test trực tiếp qua `tests/unit/detectCharacters.test.ts`):
- `buildCharacterDetectionMessages(promptTemplate, transcript)` thay `{{TRANSCRIPT}}` bằng transcript thật, trả về đúng 1 `LlmChatMessage` role `user` (mục 5.2).
- `parseCharacterDetectionResponse(content)` parse JSON, nếu lỗi thử "repair tối thiểu" (bóc code fence ```` ```json ``` ````, cắt từ `{` đầu tới `}` cuối nếu có prose bọc ngoài) rồi parse lại — vẫn lỗi thì throw. Validate: `characters` phải là mảng non-empty; mỗi item bắt buộc `name` (bắt đầu bằng `@`, không trùng trong cùng response — trùng sẽ vỡ unique constraint `(project_id, character_id)`) và `visual_dna` non-empty; các field còn lại default `''` nếu model bỏ trống.

`CharacterService.detect(projectId, { vilaoService, promptTemplate, model })` (`src/main/services/CharacterService.ts`) orchestrate: chặn sớm (không gọi mạng) nếu transcript rỗng hoặc prompt thiếu `{{TRANSCRIPT}}` (mục 27/38); sau đó retry tới `project.maxRetry` lần — mỗi lần build message → `vilaoService.chat()` → parse/validate; thành công thì **replace toàn bộ** `characters` của project trong 1 transaction (cùng kiểu "replace, không diff" như `SrtService.split()`, mục 11.5). Hết `maxRetry` lần vẫn lỗi → throw `Character Detection failed after N attempt(s): <lỗi cuối>`, hiển thị thẳng ra UI.

Vài quyết định khi implement:
- **Model dùng để gọi LLM lấy từ `AppSettings.selectedModel`** (global, Settings > Vilao API) chứ không phải `projects.selected_model` — field này chưa được ghi bởi service nào (chỉ tồn tại trong schema/entity, luôn `null` tới khi Phase 9 set `selected_model_snapshot` khi Run đầu tiên, mục 32). IPC handler đọc `AppSettings` rồi truyền `model` tường minh vào `CharacterService.detect()`.
- **`characters.character_id` và `characters.name` nhận cùng giá trị `@Character_Name`** — output JSON mục 28 chỉ có 1 field `"name"` (dạng `@ID`), không có tên người riêng biệt để tách.
- **Chưa dùng `pipeline_tasks` cho `DETECT_CHARACTERS`** ở Phase 6 (dù `TaskType.DETECT_CHARACTERS` đã có sẵn trong enum) — cùng quyết định "chưa wire pipeline_tasks" như `SPLIT_SRT` ở Phase 5 (mục 11.5), để dành cho `TaskQueueService`/`PipelineService` ở Phase 9. Retry là vòng lặp nội bộ trong `CharacterService.detect()`, không persist `attempts` ra DB.
- UI trigger thủ công **Detect Characters** trên tab Characters (mục 8.4) đứng thay cho Run All tới khi Phase 9 hoàn thiện — cùng pattern nút "Split SRT" tạm thời ở mục 11.5/8.3.

---

# 15. Step 3 — Character Prompt Generation

Input:
- Character Database

LLM tạo:
- đúng 1 reference prompt cho mỗi Character ID.

Output:

```ts
interface CharacterPrompt {
  characterId: string;
  prompt: string;
}
```

Prompt cuối phải bằng tiếng Anh.

Có thể gọi:
- 1 request cho toàn bộ characters nếu context cho phép.

Nếu số character quá lớn:
- chia batch.

Đề xuất batch mặc định:

```text
10 characters / request
```

Kết quả cuối vẫn gom lại thành một Character Reference Database.

## 15.1. Implementation thật (Phase 7)

`src/main/pipeline/generateCharacterPrompts.ts` (pure function, không import Electron/DB — unit-test qua `tests/unit/generateCharacterPrompts.test.ts`):
- `chunkCharacters(characters, batchSize = CHARACTER_PROMPT_BATCH_SIZE)` — `CHARACTER_PROMPT_BATCH_SIZE = 10` đúng đề xuất mặc định của mục này.
- `buildCharacterGenerationMessages(promptTemplate, characters)` thay `{{CHARACTERS}}` bằng JSON của **toàn bộ dữ liệu mô tả nhân vật** trong batch (`character_id`, `gender`, `age_range`, `appearance`, `hair`, `clothing`, `personality`, `role`, `unique_features`, `visual_dna`) — đây là "Character Database" theo đúng Input của mục này, khác với Compact Character Index (mục 16.1) vốn chỉ dùng cho Scene Generation ở Phase 8.
- `parseCharacterGenerationResponse(content, expectedCharacterIds)` parse JSON + "thử repair tối thiểu" (dùng chung `repairJsonText()` với Character Detection, tách ra `src/main/pipeline/jsonRepair.ts` ở phase này). Validate: `character_prompts` phải là mảng; mỗi item bắt buộc `character_id` (phải nằm trong `expectedCharacterIds` của batch — ID lạ bị coi là lỗi) và `prompt` non-empty, không được trùng `character_id` trong cùng response; nếu có ID trong batch bị thiếu khỏi response cũng coi là lỗi. Bất kỳ vi phạm nào ở trên khiến **cả batch** bị coi là 1 attempt fail.

`CharacterService.generatePrompts(projectId, { vilaoService, promptTemplate, model })` và `CharacterService.retryPrompt(projectId, characterId, params)` (`src/main/services/CharacterService.ts`) orchestrate:
- `generatePrompts()` chặn sớm (không gọi mạng) nếu chưa có `characters` hoặc prompt thiếu `{{CHARACTERS}}` (mục 27/38); sau đó chia batch và chạy **tuần tự từng batch** (Character Generation concurrency = 1, mục 33). Mỗi batch có retry loop riêng tới `project.maxRetry` — **atomic theo batch**: cả batch thành công cùng lúc (mỗi nhân vật 1 row `character_prompts` `status=success`) hoặc cả batch thất bại cùng lúc sau khi hết retry (`status=failed`, cùng `error`) — nhưng 1 batch thất bại **không chặn/ảnh hưởng** các batch khác.
- `retryPrompt()` là batch-of-1 cho đúng 1 `characterId`, dùng lại cùng logic — đây là hành động "Retry" độc lập trên UI (mục 8.5's tương tự đã có cho Image Prompts; ở đây áp dụng cho Character Prompts), không đụng tới bất kỳ nhân vật nào khác.
- Khi 1 batch/retry thất bại sau khi hết `maxRetry`, `prompt` của các nhân vật trong batch đó được giữ nguyên giá trị **đã từng thành công trước đó** (nếu có) thay vì bị xoá về rỗng — tránh mất dữ liệu khi regenerate 1 phần thất bại sau khi phần khác đã thành công từ trước; `status` vẫn chuyển `failed` để UI biết cần Retry.

Vài quyết định khi implement (cùng convention đã chốt ở Phase 6, mục 14.1):
- Model dùng để gọi LLM lấy từ `AppSettings.selectedModel` (global), không phải `projects.selected_model`.
- Chưa dùng `pipeline_tasks` cho `GENERATE_CHARACTER_PROMPTS` ở phase này — để dành cho `TaskQueueService`/`PipelineService` ở Phase 9; trạng thái retry/lỗi ở Phase 7 lưu trực tiếp vào từng row `character_prompts` (`status`/`attempts`/`error`, đúng vòng đời task riêng đã thiết kế sẵn trong schema.md), không qua `pipeline_tasks`.
- UI trigger thủ công **Generate Character Prompts** trên tab Characters (mục 8.4) đứng thay cho Run All tới khi Phase 9 hoàn thiện — cùng pattern nút "Detect Characters"/"Split SRT" tạm thời ở mục 14.1/11.5.

---

# 16. Step 4 — Relevant Character Selection

Mục tiêu quan trọng:

**Không gửi toàn bộ Character Database + toàn bộ Character Prompts vào mọi Scene request.**

Việc này nhằm giảm:
- input token
- context usage
- chi phí
- nguy cơ context overflow
- nhiễu model

## 16.1. Compact Character Index

App tạo index ngắn:

```text
@Qin_Hong_Adult | main character | sharp jaw, long black hair, navy royal robe
@Xue_Ge | villain | left cheek scar, black topknot, white armor
@Lin_San | bandit leader | shaved head, eye scar, brown leather armor
```

Không đưa toàn bộ Character Prompt vào index.

## 16.2. Relevant selection

Với mỗi SRT:
- xác định Character ID có khả năng liên quan.
- sau đó chỉ inject data đầy đủ của những Character ID đó vào Scene Prompt.

Có thể dùng:
1. local exact-name/alias matching trước;
2. nếu không đủ chắc chắn, chạy một request LLM rất ngắn để chọn Character ID.

Internal selector output:

```json
{
  "character_ids": [
    "@Qin_Hong_Adult",
    "@Xue_Ge"
  ]
}
```

Internal selector là logic hệ thống, không cần xuất ra file cuối.

## 16.3. Context quanh SRT

Để giải quyết các đại từ như:
- hắn
- cô ấy
- người đó
- anh ta

có thể gửi thêm một context rất ngắn:

```text
Previous SRT
Current SRT
Next SRT
```

Mặc định:
- 1 previous block
- current block
- 1 next block

Không gửi toàn bộ transcript vào Scene Generation.

## 16.4. Implementation thật (Phase 8)

`src/main/pipeline/selectRelevantCharacters.ts` (pure function, không import Electron/DB — unit-test qua `tests/unit/selectRelevantCharacters.test.ts`):
- `buildCompactCharacterIndex(characters)` — đúng format mục 16.1 (`@ID | role | short traits`), cắt Visual DNA còn tối đa 80 ký tự.
- `matchLocalRelevantCharacterIds(srtText, characters)` — local exact-name/alias matching (mục 16.2 bước 1). Schema không có field alias riêng (`characters.name` trùng `character_id` từ Phase 6, mục 14.1), nên tên đọc được được suy trực tiếp từ Character ID: `@Qin_Hong_Adult` → `"qin hong adult"` và (bỏ token cuối, thường là qualifier tuổi/trạng thái) `"qin hong"`. Khớp case-insensitive substring trong SRT text.
- `buildRelevantCharacterSelectorMessages()`/`parseRelevantCharacterSelectorResponse()` — Internal Relevant Character Selector (mục 31), xem implementation thật ở mục 31.

`ScenePromptService` (`src/main/services/ScenePromptService.ts`) chạy local matching trước cho từng SRT; nếu rỗng mới fallback gọi selector LLM (retry tới `project.maxRetry`); nếu selector vẫn lỗi hết retry, fallback tiếp theo mục 31 (compact index toàn bộ nhân vật, không có Character Reference). Chi tiết orchestration đầy đủ (bao gồm cách gộp kết quả relevant selection của nhiều SRT khi đã batch — mục 17) xem mục 17's ghi chú implementation.

**Cập nhật thật (2026-08-10):** local matching giờ có thêm 1 pre-pass (`resolveLocalRelevantCharacterIds`) chạy trước toàn bộ pipeline selection — pronoun carry-forward, và selector LLM call (khi cần) giờ batch theo Scene Generation batch thay vì per-SRT. Chi tiết đầy đủ xem "Cập nhật thật (2026-08-10)" ở mục 31.

---

# 17. Step 5 — Scene Prompt Generation

Mỗi SRT tạo:

```text
CHÍNH XÁC 1 IMAGE PROMPT
```

**Batch nhiều SRT / request (cập nhật Phase 8, sau khi V1 chạy chậm với 1 SRT/request):** để giảm số lần gọi LLM, nhiều SRT liên tiếp được gộp vào 1 request thay vì gọi riêng từng SRT — mặc định **10 SRT/batch** (hằng số `SCENE_PROMPT_BATCH_SIZE`, không phải setting DB/UI; hạ từ 20 xuống 10 ngày 2026-08-09 theo yêu cầu user — batch 20 chạy cảm giác lâu). Mỗi SRT trong batch vẫn tạo đúng 1 image prompt — batch chỉ gộp request, không gộp output.

**Cập nhật thật (Phase 17, 2026-08-10 — theo yêu cầu user, thêm setting chỉnh batch size):** con số này giờ **là setting DB/UI** — field mới `projects.scene_batch_size` (integer, default 10, range 1–20, xem `context/schema.md` Changelog Phase 17), chỉnh được qua Settings > Advanced > Pipeline Tuning cùng chỗ với Scene Generation Concurrency (mục 33). `SCENE_PROMPT_BATCH_SIZE` (`generateScenePrompt.ts`) vẫn tồn tại nhưng chỉ còn là giá trị mặc định fallback của `chunkSrtBlocks()` khi không truyền `batchSize` — `ScenePromptService.generate()` (app thật) luôn truyền `project.sceneBatchSize` tường minh. Range 1–20 (trần trùng đúng batch 20 đã bị hạ xuống 10 ở trên vì chạy chậm) là quyết định có chủ đích, hỏi lại user trước khi implement theo CLAUDE.md (đây là thay đổi schema — thêm cột).

Mỗi scene request gửi:

```text
System Scene Prompt
N SRT liên tiếp trong batch (mỗi SRT đánh số riêng)
1 SRT liền trước batch + 1 SRT liền sau batch (thay cho neighbor context riêng từng SRT — các SRT trong cùng batch đã tự cung cấp ngữ cảnh cho nhau)
Relevant Characters (hợp của các nhân vật liên quan trên toàn batch — vẫn xác định liên quan theo từng SRT riêng lẻ ở tầng code)
Relevant Character Reference Prompts (hợp tương ứng)
```

Không gửi:
- toàn bộ transcript
- toàn bộ Character Database
- toàn bộ Character Prompt Database

Batch atomic (cùng nguyên tắc mục 15/18.2 cho Character Generation): nếu response thiếu prompt cho bất kỳ SRT nào trong batch, coi cả batch là 1 attempt lỗi và retry cả batch. Regenerate/Retry cho 1 SRT lẻ (từ UI) dùng lại đúng cơ chế này với batch kích thước 1.

## 17.1. Implementation thật (Phase 8)

`src/main/pipeline/generateScenePrompt.ts` (pure function, không import Electron/DB — unit-test qua `tests/unit/generateScenePrompt.test.ts`):
- `chunkSrtBlocks(blocks, batchSize = SCENE_PROMPT_BATCH_SIZE)` — `SCENE_PROMPT_BATCH_SIZE = 10` là fallback default của hàm thuần này (2026-08-09; 20 ban đầu); app thật gọi với `batchSize = project.sceneBatchSize` (per-project, Phase 17, 2026-08-10 — xem đầu mục 17).
- `buildBatchSrtText()` build `{{SRT_TEXT}}`: mỗi SRT trong batch thành `BLOCK <n>:\n<text>`, cách nhau dòng trống, kèm `Previous SRT: ...`/`Next SRT: ...` (1 block liền kề batch, không phải liền kề từng SRT) khi có.
- `buildRelevantCharactersSection()`/`buildRelevantCharacterPromptsSection()` build data đầy đủ (Visual DNA nguyên văn, không cắt như compact index) cho hợp (union) Character ID liên quan trên toàn batch.
- `assembleSceneContext()` — token estimation (`text.length`, mục 18.4) + trim theo priority khi vượt ngân sách; ngân sách scale theo batch size (xem mục 18.4).
- `parseSceneGenerationResponse(content, blockIndexes)` — **cập nhật thật 2026-08-09, xem mục 30:** parse JSON (`{ scene_prompts: [{ block_number, prompt }] }`) thay vì quét marker `PROMPT <n>:` trong plain text như bản gốc Phase 8 (đổi sau khi phát hiện lỗi thật với model qua Vilao — model gộp/bỏ dở batch nhiều block ở dạng text; JSON đồng bộ với 3/4 bước LLM còn lại của app và parse chính xác hơn regex). Thiếu prompt cho bất kỳ `blockIndex` nào trong batch, JSON không hợp lệ, hoặc item sai shape → throw `SceneFormatCollapseError` (retry cả batch, đúng "Batch atomic" ở trên; batch >1 block còn tự chia đôi thay vì retry nguyên batch — xem `ScenePromptService.generateBatch`).

`ScenePromptService` (`src/main/services/ScenePromptService.ts`) orchestrate:
- Chọn relevant characters **theo từng SRT riêng lẻ** trong batch (mục 16.4, dùng đúng 1-previous/1-next của riêng SRT đó, không phải neighbor của cả batch), rồi hợp (union) toàn bộ Character ID liên quan của batch để build context dùng chung cho request. Mỗi SRT vẫn lưu `scene_prompts.relevant_character_ids` riêng của chính nó (không phải union).
- Chạy các batch **song song tới `project.sceneConcurrency`** (field có sẵn từ Phase 2, default 4 — nâng từ 2 ngày 2026-08-09 theo yêu cầu user, range 1–5 — mục 33) qua 1 task pool nội bộ (`runWithConcurrency()`, không phụ thuộc ngoài) — không phải tuần tự như Character Detection/Generation (mục 14.1/15.1). Các batch xử lý dải `srt_blocks` không chồng lấn nên chạy song song an toàn.
- `generate(projectId, params, onProgress?)` — tham số thứ 3 optional, gọi 1 lần/batch (thành công hay thất bại đều tính là đã xử lý xong) với `{ batchesCompleted, totalBatches, completedBlocks, totalBlocks, batchResults }`. Vì batch chạy song song nên có thể hoàn thành không theo thứ tự — `batchesCompleted` là số đếm dồn (luôn tăng đơn điệu), không phải "batch vừa xong là batch số mấy". IPC handler `scenePrompts.generate` chuyển tiếp callback này thành sự kiện `scenePrompts.onProgress` cho Renderer (mục 4.2/8.5).
- `retry(projectId, blockIndex, params)` dùng lại đúng orchestration trên với batch kích thước 1 — 1 SRT lẻ regenerate độc lập, không đụng SRT khác.
- Khi 1 batch/retry thất bại sau khi hết `maxRetry`, `prompt` của các SRT trong batch giữ nguyên giá trị đã từng thành công trước đó (nếu có) thay vì bị xoá — cùng quyết định bảo toàn dữ liệu đã áp dụng cho `character_prompts` ở Phase 7 (mục 15.1).
- Chưa dùng `pipeline_tasks` cho `SELECT_RELEVANT_CHARACTERS`/`GENERATE_SCENE_PROMPT` ở phase này — cùng lý do đã áp dụng từ Phase 5-7 (để dành `TaskQueueService`/`PipelineService` ở Phase 9); trạng thái lưu trực tiếp vào `scene_prompts.status/attempts/error`.
- Rate-limit backoff thông minh (mục 33 — "nếu API trả rate limit: giảm tốc, retry theo backoff") **chưa** implement ở phase này — lỗi (kể cả 429) hiện xử lý bằng retry per-batch giống mọi lỗi khác, không có logic phát hiện/giảm tốc riêng; để dành Phase 12 (mục 35 Context Too Large Handling cũng ở Phase 12).

---

# 18. Context Window Strategy

Đây là yêu cầu quan trọng của app.

## 18.1. Character Detection

Có thể cần toàn transcript.

Nếu transcript vượt context model:
- chia transcript thành chunks lớn.
- detect characters theo từng chunk.
- merge Character Database.
- chạy deduplication cuối.

Không cắt giữa câu nếu có thể.

## 18.2. Character Prompt Generation

Batch characters nếu cần.

## 18.3. Scene Generation

Luôn ưu tiên context nhỏ.

Target request (đã batch, xem mục 17):

```text
Scene System Prompt
+ N SRT liên tiếp trong batch (mặc định 10)
+ 1 SRT liền trước batch
+ 1 SRT liền sau batch
+ relevant character DNA (hợp toàn batch)
+ relevant reference prompts (hợp toàn batch)
```

Không sử dụng dữ liệu không cần thiết. Ngân sách ký tự ước lượng (mục 18.4) mở rộng theo số SRT trong batch, nhưng thứ tự ưu tiên cắt giảm khi vượt ngưỡng vẫn giữ nguyên: không bao giờ cắt SRT text của bất kỳ block nào trong batch hay Visual DNA của relevant characters.

## 18.4. Token estimation

Trước khi gọi API:
- ước lượng kích thước input.
- nếu vượt ngưỡng an toàn của model, giảm optional context trước.
- không cắt mất Current SRT.
- không cắt mất Visual DNA của relevant characters.

Priority giữ context:

```text
1. Current SRT
2. Relevant Character Visual DNA
3. Scene System Prompt
4. Relevant Character Reference
5. Previous SRT
6. Next SRT
```

**Implementation thật (Phase 8):** "ước lượng theo độ dài ký tự" — `text.length` đứng thay tokenizer thật (không có per-model context window nào được track; `projects.selected_model` vẫn chưa được ghi bởi service nào tới Phase 9, mục 32). `SCENE_CONTEXT_CHAR_BUDGET = 6000` là ngân sách baseline cho 1 SRT/request (dùng nguyên cho `retry()` — batch kích thước 1); với batch nhiều SRT (mục 17), ngân sách mở rộng thêm `PER_ADDITIONAL_BLOCK_BUDGET = 400` ký tự cho mỗi SRT vượt quá SRT đầu tiên trong batch (batch 10 SRT — mặc định hiện tại, 2026-08-09 — ≈ ngân sách 9.600 ký tự; batch 20 SRT như bản gốc Phase 8 ≈ 13.600 ký tự). Thứ tự cắt giảm đúng priority trên: bỏ Next SRT (neighbor ngoài batch) → bỏ Previous SRT (neighbor ngoài batch) → bỏ Relevant Character Reference; Current SRT (của mọi block trong batch) và Visual DNA của relevant characters không bao giờ bị cắt, kể cả khi vẫn vượt ngân sách sau khi đã bỏ hết phần tuỳ chọn.

---

# 19. Retry / Resume

Mỗi task phải độc lập.

Task types:

```text
SPLIT_SRT
DETECT_CHARACTERS
GENERATE_CHARACTER_PROMPTS
SELECT_RELEVANT_CHARACTERS
GENERATE_SCENE_PROMPT
EXPORT
```

Task schema:

```ts
interface PipelineTask {
  id: string;
  projectId: string;
  type: string;
  entityId?: string;
  status: "pending" | "running" | "success" | "failed";
  attempts: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
```

**Implementation thật (Phase 9):** "mỗi task phải độc lập" không có nghĩa mọi `task_type` đều persist thành 1 row `pipeline_tasks` riêng — xem mục 25 để biết chính xác 3/6 loại nào thật sự ghi bảng này, còn lại lấy độc lập-per-entity trực tiếp từ `character_prompts`/`scene_prompts` (đã có sẵn `status`/`attempts`/`error` per-row từ Phase 7/8). `PipelineService.runProject()` (mục 36) không có 1 vòng lặp xử lý "queue" các `PipelineTask` tổng quát như interface trên gợi ý — mỗi bước gọi thẳng đúng service tương ứng (`SrtService`/`CharacterService`/`ScenePromptService`), tự chịu trách nhiệm retry/persist riêng của nó.

## 19.1. Retry

Default:

```text
3 attempts
```

Retry từng task.

Không restart toàn pipeline vì một Scene lỗi.

**Implementation thật (Phase 9):** Character Detection (1 lần gọi/attempt) và Character Prompt Generation (atomic theo batch) đã retry đúng `project.maxRetry` từ Phase 6-7, không đổi. Scene Generation (Phase 8/9) cũng atomic theo batch nhưng **có thêm điểm dừng giữa mỗi lần retry** để Pause/Cancel không phải đợi hết cả `maxRetry` lần gọi thật mới có tác dụng (phát sinh sau khi test với model thật — project ít SRT chỉ có 1 batch, không có điểm dừng "giữa các batch" nào để chạm tới) — xem mục 33/37. Cùng lỗ hổng này **chưa** được vá cho Character Detection/Character Prompt Generation (ghi nhận là giới hạn đã biết trong `context/plan.md` Phase 9, chưa xử lý).

**Cập nhật thật (Phase 16, 2026-08-10):** `3 attempts` ở trên không còn là default thật — `DEFAULT_MAX_RETRY` hạ xuống `1` (không còn UI để chỉnh, chi tiết đầy đủ xem mục 10.3). Cơ chế retry-per-task mô tả ở đoạn trên (mỗi task tự retry tới `project.maxRetry`, không restart cả pipeline vì 1 Scene lỗi) không đổi — chỉ đổi con số ngân sách mặc định, với `maxRetry = 1` thì "retry" thực chất chỉ còn đúng 1 lần thử, không có lần thử lại thật sự nào nữa trừ khi user/test tự nâng qua `updatePipelineSettings()`.

## 19.2. Save after success

Ví dụ:

```text
Scene 001 → success → save
Scene 002 → success → save
Scene 003 → error
```

Nếu app đóng tại Scene 003:

Khi mở lại:

```text
Scene 001 → skip
Scene 002 → skip
Scene 003 → retry
Scene 004 → continue
```

**Implementation thật (Phase 9):** ví dụ trên đúng ở granularity SRT block, nhưng thật ra Scene Generation gọi theo **batch** (mặc định 10 SRT/request, mục 17) — "skip"/"retry" ở trên áp dụng cho cả batch chứ không phải từng SRT lẻ: `ScenePromptService.generate()` bỏ qua hoàn toàn 1 batch nếu **mọi** block trong batch đã `status=success`, và chạy lại **toàn bộ** batch nếu có bất kỳ block nào trong đó chưa `success` (kể cả khi 1 vài block trong batch đó đã từng thành công ở lượt chạy trước — batch chỉ ghi DB khi toàn bộ thành công hoặc toàn bộ hết retry, không có trạng thái "một nửa xong" để giữ lại). Với batch mặc định 10 SRT, đây là đánh đổi được chấp nhận (ít tốn hơn so với gọi lại từng SRT lẻ dù không tối ưu tuyệt đối).

## 19.3. Resume

Nút Resume chỉ chạy:
- failed tasks cần retry
- pending tasks

Không chạy lại success task trừ khi user chọn Regenerate.

**Implementation thật (Phase 9):** không có nút Resume riêng biệt về code — `pipeline.resume()`/`pipeline.run()`/`pipeline.retryTask()` (mục 4.2) đều gọi cùng 1 hàm `PipelineService.runProject()` (mục 36). Mỗi bước trong đó tự kiểm tra "đã xong chưa" trước khi chạy (`if (srtBlocks.length === 0)`, `if (characters.length === 0)`, `if (!characterPromptsDone)`, Scene Generation tự bỏ qua batch đã xong ở trong chính nó) — nên gọi lại hàm này trên 1 project đã chạy dở LUÔN LÀ Resume đúng nghĩa, không cần code path/nút bấm riêng để phân biệt "Run lần đầu" và "Resume". TopBar/Processing tab chỉ đổi **nhãn** nút hiển thị theo `projects.status` (mục 7/8.6), gọi cùng 1 IPC.

**Cập nhật (Phase 15, ngoài phạm vi V1 gốc):** cơ chế gating mô tả ở trên **không đổi gì cả** — `runProject()` vẫn resume đúng nghĩa nếu được gọi. Cái mất đi chỉ là **đường vào UI cho đúng 1 trường hợp**: `status=paused` không còn nút nào gọi `pipeline.run()`/`resume()` nữa (mục 7/8.6). `pipeline.resume()` (IPC, mục 4.2) vẫn còn nguyên, không bị xoá — chỉ không còn ai gọi tới khi `status=paused`. Case `failed`/`completed_with_errors` (Retry Failed) và mọi run kích hoạt qua Run Queue (mục 6.4) không bị ảnh hưởng, vẫn dùng đúng cơ chế Resume này.

---

# 20. Regenerate

Sau pipeline hoàn thành, cho phép:

```text
Regenerate Character Detection
Regenerate Character Prompt
Regenerate Scene Prompt
```

Nếu Character Detection được regenerate:
- cảnh báo rằng Character Database thay đổi có thể làm Scene Prompt cũ không còn đồng nhất.

Có thể cho lựa chọn:

```text
Regenerate characters only
Regenerate characters + all scene prompts
Cancel
```

**Implementation thật (Phase 12):** cả 3 mục ở trên được cover bằng 2 cơ chế khác nhau tuỳ mức độ ảnh hưởng. "Regenerate Character Detection" (thay toàn bộ Character Database, ảnh hưởng dây chuyền tới Scene Prompt) mới thật sự cần dialog xác nhận — implement đúng 3 lựa chọn (`CharactersPage.tsx`'s `RegenerateCharactersModal`, dùng lại `components/ui/Modal.tsx` từ Phase 2). "Regenerate Character Prompt"/"Regenerate Scene Prompt" (regenerate đúng 1 đơn vị, không ảnh hưởng gì khác) đã có sẵn từ Phase 7/8 dưới dạng nút **Retry** trên từng card lỗi (`characters.retryPrompt`/`scenePrompts.retry`) — không cần dialog riêng vì đã là hành động 1-click rõ ràng, không có gì mơ hồ cần xác nhận. Nút "Detect Characters" ở Characters tab tự đổi thành **"Regenerate"** (icon đổi theo) một khi project đã có character — bấm mở dialog; lần đầu tiên (chưa có character nào) vẫn chạy ngay không cần dialog vì không có gì để mất. IPC `characters.detect(projectId, options?: { clearScenePrompts?: boolean })` (mở rộng signature Phase 6, không phải channel mới) — chọn "characters only" giữ nguyên `scene_prompts`; chọn "characters + all scene prompts" xoá sạch `scene_prompts` (`ScenePromptService.clearAll()`) sau khi detect xong. Cảnh báo "Character Database thay đổi có thể làm Scene Prompt cũ không đồng nhất" chỉ hiện trong dialog khi project đang có Image Prompts (`scenePrompts.list().length > 0`). **Bug fix phát hiện khi làm phase này:** `character_prompts` không có FK tới `characters` (business-key relation qua `character_id`), nên regenerate trước đó chỉ thay `characters` để lại row `character_prompts` cũ mồ côi vĩnh viễn trong DB thật (chỉ bị xoá ở local state UI) — `CharacterService.detect()` giờ luôn xoá `character_prompts` cùng transaction khi thay `characters`.

**Cập nhật (Phase 14, ngoài phạm vi V1 gốc):** "Regenerate Character Detection" **không còn cách nào trigger từ UI nữa** — nút "Detect Characters"/"Regenerate" cùng `RegenerateCharactersModal` bị xoá hẳn khỏi `CharactersPage.tsx` (mục 8.4). "Regenerate Character Prompt"/"Regenerate Scene Prompt" (2 nút **Retry** đơn vị) không đổi gì, vẫn hoạt động bình thường. `characters.detect(projectId, options?)` (IPC) vẫn còn nguyên ở Main với đầy đủ khả năng `clearScenePrompts`, chỉ không còn UI nào gọi tới.

---

# 21. Export

Output folder:

```text
Channel_Name/
└── Project_Name/
    ├── Project_Name.srt
    ├── character_prompts.txt
    ├── image_prompts.txt
    └── character_list.txt   (chỉ khi project có nhân vật — Phase 24)
```

**Cập nhật (Phase 24, ngoài phạm vi V1 gốc, theo yêu cầu trực tiếp user):** thêm file thứ 4 `character_list.txt` — danh sách Character ID (bỏ tiền tố `@`), mỗi dòng 1 nhân vật, không cách dòng trống giữa các dòng:

```text
Qin_Hong_Adult
Xue_Ge
Lin_San
```

Liệt kê **toàn bộ** nhân vật trong Character Database (không lọc theo prompt có thành công hay không, khác `character_prompts.txt`) — đây là danh sách tên, không phải file output dùng được. Chỉ ghi file này khi project có ít nhất 1 nhân vật (`characters.length > 0`) — project thuộc channel "No Characters" (mục 6.5) không có gì để liệt kê nên không tạo file rỗng, khác `character_prompts.txt`/`image_prompts.txt` vốn luôn ghi (kể cả rỗng). `formatCharacterListFile()` (`src/shared/exportFormat.ts`) là nguồn format duy nhất, dùng chung cho `ExportService.export()` và Export tab preview.

**Cập nhật thật (Phase 20 — Post-V1, ngoài phạm vi V1 gốc, 2026-08-11, theo yêu cầu trực tiếp user):** thêm 1 lớp thư mục `Channel_Name/` bên ngoài `Project_Name/` — project thuộc channel nào thì export vào đúng thư mục con của channel đó bên trong Default Export Folder (mục 10, Settings > General, vẫn global, không đổi). Không phải schema change (không đọc/ghi field DB mới, chỉ đọc `channels.name` đã có sẵn qua `project.channelId`). Chi tiết: `context/schema.md` Changelog Phase 20.

Không tách mỗi SRT thành file riêng.

Không tách mỗi prompt thành file riêng.

**Implementation thật (Phase 11):** thư mục cha (nơi tạo `Project_Name/`) do user chọn qua native folder picker (`dialog.showOpenDialog`, `openDirectory` + `createDirectory`) mỗi lần bấm Export — không cố định, `defaultPath` gợi ý bằng `AppSettings.lastExportFolder` (lần export gần nhất) hoặc thư mục Documents nếu chưa từng export. `Project_Name` lấy tên thật của project, chỉ thay các ký tự không hợp lệ trên đường dẫn macOS/Windows (`/ \ : * ? " < > |`) thành `_` (`sanitizeFolderName()`, `src/shared/exportFormat.ts` — đổi tên từ `sanitizeProjectFolderName()` ở Phase 20 vì giờ dùng chung cho cả tên channel lẫn tên project) — giữ nguyên khoảng trắng/unicode.

**Implementation thật (Phase 20):** `ExportService.resolveFolderNames()` (private helper, dùng chung bởi `resolveFolderPath()`/`export()`) đọc `project.channelId` → `findChannelById()` lấy tên channel **hiện hành** (không snapshot — giống `Project_Name` cũng luôn là tên hiện hành, không snapshot) — đổi tên channel sau đó sẽ đổi luôn thư mục xuất ra ở lần Run kế tiếp. `ExportPage.tsx` (preview) gọi thêm `channels.get(currentProject.channelId)` để hiện đúng `Channel_Name/Project_Name/` trong card "Output Folder", khớp 100% với đường dẫn thật `ExportService` ghi ra (cùng nguồn `sanitizeFolderName()`).

**Cập nhật lớn (Phase 14, ngoài phạm vi V1 gốc) — thay thế toàn bộ cách chọn thư mục cha ở trên:**
- **`AppSettings.lastExportFolder` đổi vai trò** từ "gợi ý `defaultPath` cho dialog, hỏi lại mỗi lần" thành **"Default Export Folder"** — cấu hình **đúng 1 lần** ở Settings > General (card "Export", nút **Browse…** mở `settings:chooseExportFolder`, IPC mới), dùng lại cho **mọi lần export sau đó, không hỏi dialog nữa**. Field/type trong `AppSettings` (schema.md) giữ nguyên `string | null` — không phải schema change, chỉ đổi ý nghĩa sử dụng.
- **Dialog chỉ còn xuất hiện đúng 1 lần duy nhất** — lần export tự động đầu tiên (mục 8.7/36) trước khi Default Export Folder từng được cấu hình. Vì lần export này chạy **tự động, không có tương tác người dùng** (bên trong `PipelineService.runProject()`, có thể do Run Queue kích hoạt lúc không ai ngồi trước máy — mục 6.4), **không thể** mở dialog thật sự — thay vào đó tự động fallback về thư mục Documents và lưu lại làm default luôn (`resolvePipelineRuntime()`, `src/main/pipelineRuntime.ts`, dùng chung giữa `pipeline.ipc.ts` và `queue.ipc.ts`). Dialog thật (native folder picker) chỉ còn dùng ở Settings > General's nút Browse — do người dùng chủ động bấm.
- **Trigger ghi file đổi hẳn** — không còn "mỗi lần bấm Export" nữa (nút đó đã bị xoá, mục 8.7), mà tự động ngay khi Run All đạt `completed`/`completed_with_errors` (mục 36), gọi thẳng `ExportService.export()` từ `PipelineService`, không qua IPC nào cả (Main gọi Main).
- `Project_Name` sanitize giữ nguyên logic cũ, không đổi.

---

# 22. Format Project_Name.srt

```text
1
00:00:00,000 --> 00:00:03,000
Nội dung block thứ nhất.

2
00:00:03,000 --> 00:00:06,000
Nội dung block thứ hai.

3
00:00:06,000 --> 00:00:09,000
Nội dung block thứ ba.
```

---

# 23. Format character_prompts.txt

```text
CHARACTER 001 — @Qin_Hong_Adult

Character design of @Qin_Hong_Adult, ...


CHARACTER 002 — @Xue_Ge

Character design of @Xue_Ge, ...


CHARACTER 003 — @Lin_San

Character design of @Lin_San, ...
```

Mỗi nhân vật:
- đánh số
- Character ID
- một prompt hoàn chỉnh

**Cập nhật (Phase 23, ngoài phạm vi V1 gốc):** đổi từ "CHARACTER 00N — @CharacterId" xuống dòng, cách 1 dòng trống rồi mới tới prompt, cách nhau 2 dòng trống giữa các nhân vật (bản gốc ở trên) — qua 2 lần chỉnh theo yêu cầu trực tiếp của user (lần đầu thử `PROMPT 00N - @CharacterId: <prompt>` kiểu inline như `image_prompts.txt` Phase 15, sau đó bỏ hẳn phần đánh số `PROMPT 00N -`) — chốt lại thành: mỗi nhân vật 1 dòng/đoạn dạng `@CharacterId: <prompt>` (không đánh số), chỉ 1 dòng trống giữa các nhân vật, nội dung prompt không được chứa dấu xuống dòng. `formatCharacterPromptsFile()` (`src/shared/exportFormat.ts`) tự chuẩn hoá xuống dòng thành khoảng trắng (`normalizePromptText()`, cùng rule `generateScenePrompt.ts` đã dùng cho scene prompts) để cả prompt cũ lỡ có xuống dòng trong DB cũng export đúng 1 dòng — không cần migration DB.

```text
@Qin_Hong_Adult: Character design of @Qin_Hong_Adult, ...

@Xue_Ge: Character design of @Xue_Ge, ...

@Lin_San: Character design of @Lin_San, ...
```

---

# 24. Format image_prompts.txt

```text
PROMPT 001: Comic page layout, ...

PROMPT 002: Comic page layout, ...

PROMPT 003: Comic page layout, ...
```

**Cập nhật (Phase 15, ngoài phạm vi V1 gốc):** đổi từ "PROMPT 00N:" xuống dòng, cách 1 dòng trống rồi mới tới prompt, cách nhau 2 dòng trống giữa các prompt (bản gốc ở trên đã sửa lại đúng thực tế) — sang: header và prompt liền 1 dòng/đoạn (`PROMPT 00N: <prompt>`), chỉ 1 dòng trống giữa các prompt. Theo yêu cầu trực tiếp của user, gọn hơn khi đọc file text thô. `formatImagePromptsFile()` (`src/shared/exportFormat.ts`) là nguồn format duy nhất, dùng chung cho cả `ExportService.export()` (ghi file thật) và Export tab preview (Renderer) — không có 2 nơi định dạng khác nhau.

Số prompt phải map 1:1 với SRT index.

Ví dụ:

```text
SRT 001 ↔ PROMPT 001
SRT 002 ↔ PROMPT 002
SRT 003 ↔ PROMPT 003
```

---

# 25. Database đề xuất

> Nguồn chuẩn (chính thức, luôn cập nhật theo implementation thật): [context/schema.md](schema.md). Các bảng dưới đây được giữ đồng bộ thủ công với schema.md nhưng nếu có sai khác, **schema.md thắng**.

## projects

```text
id
name
transcript
status
selected_model
max_characters
fake_duration_sec
max_retry
scene_concurrency
character_detection_prompt_snapshot
character_generation_prompt_snapshot
scene_generation_prompt_snapshot
selected_model_snapshot
max_characters_snapshot
fake_duration_snapshot
created_at
updated_at
last_opened_at
```

## srt_blocks

```text
id
project_id
block_index
start_ms
end_ms
text
character_count
created_at
```

## characters

```text
id
project_id
character_id
name
gender
age_range
appearance
hair
clothing
personality
role
unique_features
visual_dna
created_at
updated_at
```

## character_prompts

```text
id
project_id
character_id
prompt
status
attempts
error
updated_at
```

## scene_prompts

```text
id
project_id
srt_block_id
block_index
relevant_character_ids
prompt
status
attempts
error
updated_at
```

## pipeline_tasks

```text
id
project_id
task_type
entity_id
status
attempts
error
created_at
updated_at
```

**Implementation thật (Phase 9):** bảng này chỉ thật sự có row cho **3/6 giá trị `task_type`**: `SPLIT_SRT`, `DETECT_CHARACTERS`, `GENERATE_CHARACTER_PROMPTS` (mỗi loại đúng 1 row/project, `entity_id = NULL`) — 3 bước cấp dự án, không có entity cụ thể để gắn `entity_id`. `SELECT_RELEVANT_CHARACTERS`/`GENERATE_SCENE_PROMPT` **không** ghi vào bảng này dù 2 giá trị enum đã tồn tại sẵn từ đầu — vì `scene_prompts` (đã có từ Phase 8) đã tự có đúng granularity đó (1 row/SRT block, có sẵn `status`/`attempts`/`error`), ghi thêm 1 bản `pipeline_tasks` song song sẽ tạo 2 nguồn sự thật cho cùng 1 trạng thái, rủi ro lệch nhau khi update. `EXPORT` **vẫn chưa dùng** (quyết định giữ nguyên sau khi implement Phase 11) — Export không nằm trong Run All (mục 36 dừng ở `markProjectCompleted()`), là hành động thủ công ghi-toàn-bộ-hoặc-không cho cả project chứ không phải N đơn vị resume/retry độc lập, nên không cần model `pending/running/success/failed` của bảng này. Xem thêm mục 8.6/8.7/19.

---

# 26. Prompt Settings

Màn:

```text
Settings
└── Prompts
    ├── Character Detection
    ├── Character Generation
    └── Scene / Image Generation
```

Mỗi prompt editor có:

```text
Prompt name
Editor
Save
Reset to Default
Copy
```

Khi project bắt đầu chạy:
- snapshot prompt hiện tại vào project.

Nếu user thay đổi global prompt trong Settings khi project đang chạy:
- project hiện tại tiếp tục sử dụng snapshot cũ.
- project mới sử dụng prompt mới.

Điều này tránh prompt thay đổi giữa pipeline.

**Implementation thật (Phase 6, Character Detection editor):** `PromptEditorCard.tsx` (`src/renderer/features/settings/prompts/`) — component dùng chung, tái sử dụng cho editor Character Generation/Scene Generation ở Phase 7/8. React Hook Form + Zod (chỉ validate non-empty, theo CLAUDE.md UI Rules), đọc/ghi qua `settings.get()`/`settings.save({ promptSettings })` (electron-store, không phải SQLite). **Save luôn được phép kể cả khi thiếu placeholder bắt buộc** — chỉ nút trigger tương đương "Run" (Detect Characters ở mục 8.4) mới bị chặn, đúng nghĩa đen mục 27 ("không cho Run", không nói "không cho Save"). Save button tự disable khi không có thay đổi (`!isDirty`).

**Implementation thật (Phase 7, Character Generation editor):** `PromptsSettingsPage.tsx` bật thêm editor **Character Generation** dùng nguyên `PromptEditorCard.tsx` không sửa gì (đúng như dự tính "tái sử dụng" ở ghi chú Phase 6 phía trên) — chỉ khác `promptKey`/`defaultPrompt` truyền vào. Chỉ còn Scene/Image Generation ở trạng thái chờ (Phase 8).

**Implementation thật (Phase 8, Scene / Image Generation editor):** `PromptsSettingsPage.tsx` bật nốt editor **Scene / Image Generation** — cùng `PromptEditorCard.tsx` tái dùng nguyên vẹn, không sửa gì component. Cả 3 editor (Character Detection/Generation/Scene) đều là editor thật từ đây, không còn card "chờ Phase N" nào.

**Implementation thật (Phase 9, snapshot):** cơ chế "snapshot prompt khi project bắt đầu chạy" (mục 32) do `ProjectService.applyFirstRunSnapshotIfMissing()` thực hiện, gọi từ `PipelineService.runProject()` (mục 36) — no-op nếu project đã có snapshot từ trước (chỉ set đúng 1 lần, đúng mục 32). Từ Run thứ 2 trở đi (Resume), `runProject()` luôn dùng lại `project.*PromptSnapshot` đã lưu, không đọc `settings.get().promptSettings` hiện hành nữa — đúng đoạn "project hiện tại tiếp tục sử dụng snapshot cũ" ở trên. Validate trước khi cho Save/Run vẫn luôn dùng prompt **hiện hành** (live), không phải snapshot — snapshot chỉ ảnh hưởng tới nội dung thật sự gửi cho LLM, không ảnh hưởng validation (mục 38).

---

# 27. Placeholder System

Các placeholder được app inject tự động.

## Character Detection

```text
{{TRANSCRIPT}}
```

## Character Generation

```text
{{CHARACTERS}}
```

## Scene Generation

```text
{{BLOCK_NUMBER}}
{{SRT_TEXT}}
{{RELEVANT_CHARACTERS}}
{{RELEVANT_CHARACTER_PROMPTS}}
```

Nếu placeholder bắt buộc bị xóa khỏi prompt settings:
- hiển thị warning.
- không cho Run cho đến khi prompt hợp lệ.

**Implementation thật (Phase 6):** `src/shared/prompts.ts` (dùng chung Main + Renderer — không đặt ở `src/main/prompts/defaults/` như Project Structure phác thảo ban đầu, vì Renderer cần đúng text này cho nút "Reset to Default" và cảnh báo thiếu placeholder mà không cần round-trip IPC). File này export nguyên văn 3 default prompt (mục 28-30), `REQUIRED_PLACEHOLDERS` (map placeholder bắt buộc theo từng prompt key) và `getMissingPlaceholders(key, text)`. `AppSettings.promptSettings.*` (mục "3.4 Settings không nhạy cảm") đổi default lúc khởi tạo từ chuỗi rỗng sang đúng 3 default prompt này.

**"Không cho Run cho đến khi prompt hợp lệ" — implementation thật (Phase 6-9):** từ Phase 6-8, việc chặn chỉ áp dụng cho từng nút trigger thủ công riêng lẻ (Detect Characters/Generate Character Prompts/Generate Image Prompts, mục 8.4/8.5) tự đọc `getMissingPlaceholders()` phía Renderer. Từ Phase 9, việc chặn **Run All** ở cấp toàn pipeline nằm trong `validateProjectForRun()` (`src/shared/validateRun.ts`, mục 38) — dùng chung 1 hàm cho cả 2 nơi: Main (`PipelineService.runProject()`, chặn thật) và Renderer (TopBar/Processing tab, disable nút kèm tooltip trước khi user kịp bấm), tránh 2 nơi tự kiểm tra khác message nhau.

---

# 28. DEFAULT PROMPT — CHARACTER DETECTION

> **Phase 28 (plan.md):** các prompt mặc định mục 28–30 trong code (`src/shared/prompts.ts`) đã được **sắp lại thứ tự** — toàn bộ hướng dẫn/quy tắc/OUTPUT cố định đứng trước, các khối dữ liệu thay đổi theo từng request (`{{TRANSCRIPT}}`, `{{CHARACTERS}}`, `{{RELEVANT_CHARACTERS}}`, `{{RELEVANT_CHARACTER_PROMPTS}}`, `{{BLOCK_NUMBER}}`, `{{SRT_TEXT}}`) dồn xuống cuối, để tận dụng prompt caching của DeepSeek/Gemini. Nội dung quy tắc giữ nguyên; chỉ đổi thứ tự và vài câu dẫn ("ở cuối prompt"). Bản trước Phase 28 được giữ nguyên văn ở `src/shared/legacyPrompts.ts`; migration `0009_reorder_default_prompts` đổi channel còn dùng nguyên bản cũ sang bản mới. Văn bản bên dưới là bản gốc tham khảo, `src/shared/prompts.ts` là nguồn chuẩn.

Prompt dưới đây là mặc định trong:

```text
Settings > Prompts > Character Detection
```

```text
Bạn là chuyên gia phân tích nhân vật cho AI Storytelling theo phong cách Chinese Manhua / Webtoon.

NHIỆM VỤ:
Phân tích TOÀN BỘ transcript, xác định tất cả nhân vật và tạo Character Database dùng xuyên suốt project.

TRANSCRIPT:
{{TRANSCRIPT}}

QUY TẮC:

1. Xác định tất cả nhân vật: chính, phụ, phản diện, người qua đường, nhân vật ẩn danh, nhân vật được nhắc gián tiếp, flashback, ký ức, giấc mơ hoặc trạng thái đặc biệt.

2. Mỗi nhân vật phải có Character ID duy nhất bắt đầu bằng @.
Ưu tiên tên Pinyin/Á Đông nếu phù hợp bối cảnh.

Nhân vật không có tên phải tự đặt tên, không dùng tên chung như "người đàn ông", "tên sát thủ", "ông lão".

3. Giải mã đại từ và danh xưng theo ngữ cảnh toàn bộ transcript.
Không tạo nhân vật mới chỉ vì cùng một người được gọi bằng nhiều cách khác nhau.

4. Nếu cùng một nhân vật có thay đổi ngoại hình lớn do tuổi tác, thời gian, thân phận hoặc biến đổi trạng thái, tạo ID riêng.

Ví dụ:
@Qin_Hong_Child
@Qin_Hong_Adult

Không tạo biến thể chỉ vì thay đổi cảm xúc.

5. Tạo Visual DNA cố định cho mỗi nhân vật, tập trung vào:
- tuổi và giới tính
- thể hình
- khuôn mặt
- tóc
- mắt
- trang phục
- phụ kiện
- sẹo/đặc điểm nhận diện

Không đưa cảm xúc, tư thế hoặc hành động tạm thời vào Visual DNA.

Mỗi nhân vật phải có:

name
gender
age_range
appearance
hair
clothing
personality
role
unique_features
visual_dna

OUTPUT:
Chỉ trả về JSON hợp lệ theo cấu trúc:

{
  "characters": [
    {
      "name": "@Character_Name",
      "gender": "",
      "age_range": "",
      "appearance": "",
      "hair": "",
      "clothing": "",
      "personality": "",
      "role": "",
      "unique_features": "",
      "visual_dna": ""
    }
  ]
}

Không giải thích. Không tạo prompt ảnh.
```

---

# 29. DEFAULT PROMPT — CHARACTER GENERATION

Prompt mặc định:

```text
Settings > Prompts > Character Generation
```

```text
Bạn là chuyên gia viết prompt thiết kế nhân vật Chinese Manhua / Webtoon.

DỮ LIỆU NHÂN VẬT:
{{CHARACTERS}}

NHIỆM VỤ:
Tạo chính xác 1 prompt hình ảnh reference bằng tiếng Anh cho mỗi Character ID.

QUY TẮC:

- Giữ nguyên Visual DNA và các đặc điểm nhận diện.
- Không tự ý thay đổi các đặc điểm cố định của nhân vật.
- Mô tả đầy đủ ngoại hình để dùng làm Master Character Reference.
- Một nhân vật duy nhất.
- Full body từ đầu đến chân.
- Nền trắng tinh khiết.
- Tư thế đứng tự nhiên phù hợp tính cách.
- Không môi trường.
- Không nhân vật khác.
- Không chữ, label hoặc speech bubble.

STYLE:
Premium Chinese Manhua style, vibrant webtoon aesthetic, stylized painterly 2D illustration, expressive Asian character design, cinematic 2D rendering, textured brush strokes, dramatic volumetric lighting, emotional atmosphere, 8k resolution, masterpiece

Cuối mỗi prompt thêm:
--no text, words, watermark, 3D render, CGI, photography --ar 16:9

OUTPUT:
Chỉ trả về JSON hợp lệ:

{
  "character_prompts": [
    {
      "character_id": "@Character_Name",
      "prompt": "Complete English image prompt"
    }
  ]
}

Mỗi Character ID chỉ có đúng 1 prompt.
Không giải thích.
```

---

# 30. DEFAULT PROMPT — SCENE / IMAGE GENERATION

Prompt này được tối ưu ngắn gọn vì được gọi lặp lại cho từng **batch SRT** (mặc định 10 SRT/request, mục 17) và cần tiết kiệm context window.

Prompt mặc định:

```text
Settings > Prompts > Scene / Image Generation
```

```text
Bạn là chuyên gia tạo prompt AI Storytelling theo phong cách Chinese Manhua / Webtoon.

NHIỆM VỤ:
Chuyển MỖI SRT trong danh sách dưới đây thành chính xác 1 prompt tạo ảnh bằng tiếng Anh — không gộp nhiều SRT vào 1 prompt, không bỏ sót SRT nào.

BLOCK:
{{BLOCK_NUMBER}}

SRT (mỗi SRT đánh số riêng bằng "BLOCK <số>:", có thể kèm 1 SRT liền trước/liền sau toàn bộ danh sách để tham khảo ngữ cảnh — hai dòng đó không cần tạo prompt):
{{SRT_TEXT}}

NHÂN VẬT LIÊN QUAN (danh sách áp dụng chung cho cả batch — không phải nhân vật nào cũng xuất hiện ở mọi SRT, tự xác định nhân vật nào xuất hiện trong từng SRT):
{{RELEVANT_CHARACTERS}}

CHARACTER REFERENCE:
{{RELEVANT_CHARACTER_PROMPTS}}

Với mỗi SRT, tự xác định đại từ, nhân vật xuất hiện, trạng thái, hành động, môi trường và flashback/ký ức nếu có. Không xuất phần phân tích.

QUY TẮC (áp dụng cho từng prompt riêng lẻ):

1. Tạo một trang Chinese Manhua/Webtoon khoảng 2–6 panels tùy nội dung. Chọn bố cục phù hợp như diagonal split, stacked panels, asymmetrical layout, overlapping frames, inset close-up hoặc cinematic wide panels. Mỗi panel luôn viết theo đúng format "Panel N (vị trí, kích thước):" — N đánh số thứ tự từ 1, vị trí ví dụ top-left/bottom-right/center, kích thước ví dụ small/large/wide. Không dùng label chỉ tả nội dung/kích thước mà thiếu số thứ tự như "BOTTOM PANEL:", "LARGE PANEL:", "INSET PANEL:".

2. Mỗi lần nhân vật xuất hiện, viết đúng theo format `@Character_ID [2-4 đặc điểm Visual DNA quan trọng nhất, phân tách bằng dấu phẩy]` — luôn dùng nguyên văn Character ID (bắt đầu bằng @, giữ nguyên dấu gạch dưới, không viết lại thành tên thường có khoảng trắng, không bỏ dấu @). Không được nhắc một nhân vật mà không kèm ngoặc vuông Visual DNA ngay sau đó, kể cả khi nhân vật đó đã xuất hiện ở panel trước. Các thay đổi tạm thời (biểu cảm, trạng thái, trang phục tạm thời...) được thêm sau Visual DNA gốc trong cùng ngoặc vuông đó nhưng không được thay đổi nhận diện gốc.

3. Nếu một panel có nhiều nhân vật, tách rõ vị trí bằng Left side, Right side, Foreground, Background, Center... để tránh trộn nhân vật.

4. Nếu có flashback, memory, dream hoặc vision, phân biệt với hiện tại bằng các mô tả phù hợp như faded ghostly overlay, desaturated colors, soft blurred edges, soft vignette.

5. Thể hiện cảm xúc bằng biểu cảm, ánh mắt và tư thế thay vì chỉ ghi tên cảm xúc.

6. Mô tả bối cảnh, kiến trúc, thời gian, thời tiết, ánh sáng và vật thể quan trọng dựa trên SRT. Có thể bổ sung chi tiết nhỏ nhưng không thay đổi câu chuyện.

7. Speech bubble, narration hoặc sound effect bằng tiếng Anh chỉ thêm khi thực sự cần thiết.

8. Cuối mỗi prompt thêm:

Premium Chinese Manhua style, vibrant webtoon aesthetic, stylized painterly 2D illustration, expressive Asian character design, cinematic 2D rendering, textured brush strokes, dramatic volumetric lighting, [Scene Color Tone], emotional atmosphere, modern/ancient Chinese setting, 8k resolution, masterpiece --no watermark, blurry, 3D render, CGI, photography --ar 16:9

Thay [Scene Color Tone] bằng tông màu phù hợp với từng cảnh.

9. Mỗi prompt chỉ gồm đúng phần mô tả panel theo cấu trúc ở trên và dòng style/negative-prompt ở rule 8 — không thêm bất kỳ đoạn tóm tắt, nhận xét, "Overall mood", ghi chú ý nghĩa hay bình luận nào khác ngoài 2 phần đó.

10. Toàn bộ nội dung 1 prompt (mọi panel gộp với dòng style ở rule 8) phải nằm trên đúng 1 dòng duy nhất — giá trị "prompt" trong JSON không được chứa ký tự xuống dòng. Nối các panel liền nhau bằng dấu chấm và khoảng trắng (". "), không xuống dòng riêng giữa các panel.

OUTPUT:
Chỉ trả về JSON hợp lệ theo cấu trúc:

{
  "scene_prompts": [
    {
      "block_number": 1,
      "prompt": "Complete English image prompt"
    }
  ]
}

Mảng "scene_prompts" phải có đúng 1 phần tử cho MỖI số block có trong BLOCK ở trên — đủ số lượng, không thiếu, không thừa, không gộp nhiều block vào 1 phần tử. "block_number" là số nguyên khớp đúng với BLOCK tương ứng.

Không gộp nhiều SRT vào 1 prompt. Không bỏ sót SRT nào. Không giải thích. Không xuất dữ liệu trung gian. Luôn giữ Character ID và Visual DNA nhất quán.
```

**Cập nhật (Phase 15, ngoài phạm vi V1 gốc) — rule 2 siết chặt + rule 9 mới:** phát hiện qua export thật — cùng 1 prompt template nhưng các batch khác nhau (mỗi batch là 1 lời gọi LLM độc lập) tự diễn giải khác nhau: có batch nhắc nhân vật bằng đúng `@Character_ID [Visual DNA]`, có batch chỉ viết tên thường không dấu `@` và không kèm đặc điểm gì (ví dụ "Hua An Ran" thay vì `@Hua_An_Ran [...]`); có batch tự thêm đoạn "Overall mood: ..." không được yêu cầu, có batch thì không. Nguyên nhân: rule 2 gốc dùng ngôn ngữ mô tả ("phải kèm... quan trọng") thay vì 1 format bắt buộc rõ ràng, nên rơi vào tay model là mỗi lần diễn giải 1 kiểu. Sửa: rule 2 quy định cứng format `@Character_ID [...]`, cấm viết tên thường; thêm rule 9 cấm nội dung ngoài cấu trúc đã định nghĩa. Không đổi field/placeholder nào, không phải bug code — người dùng cũ vẫn cần vào Settings > Prompts > Scene / Image Generation bấm "Reset to Default" thủ công nếu muốn nhận bản rule mới (prompt hiện tại của project đã snapshot ở lần Run đầu, mục 32, không tự động cập nhật).

**Cập nhật (Phase 15, tiếp) — rule 1 thêm quy định label panel:** cùng nguyên nhân/cơ chế như trên, phát hiện thêm 1 điểm không nhất quán khác từ export thật — có batch đánh số "Panel 1 (top-left, small):", có batch dùng label tả nội dung không đánh số như "BOTTOM PANEL:"/"LARGE PANEL:"/"INSET PANEL:". Rule 1 gốc chỉ nói "chọn bố cục phù hợp" mà không quy định cách đặt tên/đánh số panel trong text. Sửa: rule 1 thêm câu bắt buộc format "Panel N (vị trí, kích thước):", cấm label chỉ tả nội dung thiếu số thứ tự. Cùng lưu ý snapshot như trên — project cũ cần Reset to Default thủ công.

**Cập nhật (Phase 15, tiếp) — rule 10 mới + lưới an toàn ở code:** phát hiện thêm — 1 prompt có thể chứa ký tự xuống dòng thật giữa các panel (ví dụ "Panel 1 (...):...\n\nPanel 2 (...):...") thay vì nằm trên 1 dòng liền, dù JSON đã ép cấu trúc. Thêm rule 10 quy định toàn bộ 1 prompt (mọi panel + dòng style rule 8) phải nằm đúng 1 dòng, nối bằng ". " thay vì xuống dòng. Khác với rule 2/9 (chỉ dựa vào model tuân thủ), lần này còn thêm **lưới an toàn ở tầng code**: `normalizePromptText()` (`src/main/pipeline/generateScenePrompt.ts`, dùng trong `parseSceneGenerationResponse()`) tự động thay mọi `\n` bằng khoảng trắng rồi gộp khoảng trắng thừa — đảm bảo prompt lưu vào DB luôn đúng 1 dòng **bất kể model có tuân thủ rule 10 hay không**, không chỉ dựa vào wording của prompt như 2 lần sửa trước. Áp dụng cho cả `generate()` lẫn `retry()` (dùng chung parser). Không áp dụng cho Character Prompt Generation (`generateCharacterPrompts.ts` có cùng pattern trích `prompt` nhưng chưa được yêu cầu chuẩn hoá).

**Cập nhật thật (2026-08-09, sau khi phát hiện lỗi thật với model qua Vilao):** OUTPUT đổi từ plain text (`"PROMPT <n>:\n[prompt]"`) sang JSON (`{ "scene_prompts": [{ "block_number", "prompt" }] }`) — đồng bộ với 3/4 bước gọi LLM còn lại trong app (Character Detection, Character Prompt Generation, Internal Relevant Character Selector đều đã dùng JSON + `repairJsonText()` từ trước; Scene Generation trước đó là ngoại lệ duy nhất dùng plain text, lý do ban đầu là tiết kiệm token — xem đoạn mở đầu mục này). Lần sửa đầu tiên (cùng ngày) chỉ thử viết rõ hơn phần OUTPUT plain text (thêm ví dụ + cảnh báo "BẮT BUỘC") nhưng không đủ triệt để; đổi hẳn sang JSON là bước tiếp theo, dựa trên nhận định JSON là cấu trúc model được huấn luyện tuân thủ tốt hơn nhiều so với marker text tự quy ước, và tận dụng lại được `repairJsonText()`/parser pattern đã chứng minh ổn định ở 3 bước kia. Cơ chế tự chia nhỏ batch khi response vẫn không hợp lệ (`SceneFormatCollapseError`, `ScenePromptService.generateBatch` — xem plan.md Phase 8 addendum) **vẫn giữ nguyên** làm lưới an toàn cuối cùng, không phụ thuộc JSON hay text.

---

# 31. Internal Relevant Character Selector

Đây là prompt nội bộ rất ngắn.

Không cần hiển thị trong Prompt Settings V1.

```text
Dựa trên SRT và Character Index, chọn các Character ID có khả năng xuất hiện hoặc được nhắc đến trong cảnh.

SRT:
{{SRT_WITH_NEIGHBOR_CONTEXT}}

CHARACTER INDEX:
{{COMPACT_CHARACTER_INDEX}}

Chỉ trả về JSON:
{"character_ids":["@ID_1","@ID_2"]}
```

Nếu selector lỗi:
- retry.
- nếu vẫn lỗi, fallback inject compact index và không inject full Character Reference cho tất cả nhân vật.

**Implementation thật (Phase 8):** nguyên văn prompt trên đặt trong `src/main/pipeline/selectRelevantCharacters.ts` (hằng số nội bộ, không export ra ngoài) — **không** đặt trong `src/shared/prompts.ts` cùng 3 default prompt kia, đúng nghĩa đen "không cần hiển thị trong Prompt Settings V1" (mục 26 chỉ có 3 tab Character Detection/Generation/Scene). `parseRelevantCharacterSelectorResponse(content, validCharacterIds)` parse + repair JSON (dùng chung `repairJsonText()` với các bước khác) — Character ID lạ (không nằm trong `validCharacterIds`) bị lọc bỏ âm thầm thay vì làm hỏng cả response (đây là logic hệ thống nội bộ, không phải output cuối cho user), chỉ throw khi JSON không parse được (trigger retry). `ScenePromptService` chạy retry loop riêng cho selector (tách biệt retry loop của chính Scene Generation) tới `project.maxRetry` lần trước khi rơi vào fallback ở trên.

**Cập nhật thật (2026-08-10) — batch hoá selector call + local pronoun carry-forward:** phát hiện qua phân tích cost/latency — với project vài trăm/nghìn SRT block, selector chạy per-SRT (1 request/block khi local match trượt) là nguồn tốn token/thời gian chính, nhiều hơn hẳn Scene Generation (đã batch 10 block/request từ đầu, mục 17). Hai thay đổi cộng dồn:
1. **Batch selector call theo đúng batch của Scene Generation** — 1 request chứa mọi SRT trong batch còn cần selector (thay vì 1 request/block). `buildRelevantCharacterSelectorMessages`/`parseRelevantCharacterSelectorResponse` (single-item) bị thay bằng `buildBatchRelevantCharacterSelectorMessages(items, compactCharacterIndex)`/`parseBatchRelevantCharacterSelectorResponse(content, blockNumbers, validCharacterIds)` — cùng dạng response "keyed theo block_number" mà `parseSceneGenerationResponse` (mục 17) đã dùng: `{"relevant_characters":[{"block_number":1,"character_ids":["@ID_1"]}]}`. Khác 1 điểm so với Scene Generation: parse lenient — 1 block thiếu trong response chỉ nhận `[]` (coi như selector không tìm thấy gì), **không** throw/retry cả batch; chỉ throw khi JSON không parse được hoặc sai shape ở cấp cao nhất. Hệ quả chấp nhận được: nếu selector thật sự lỗi hết `maxRetry` lần, cả nhóm block cần selector trong batch đó cùng rơi vào fallback mục 31 (thay vì độc lập từng block như trước) — hiếm gặp vì đúng JSON contract đã ổn định ở 3 bước LLM khác.
2. **Local pronoun carry-forward** (`resolveLocalRelevantCharacterIds(blocks, characters)`, `selectRelevantCharacters.ts`) — chạy 1 lần, tuần tự, trên toàn bộ danh sách block (thuần string, không LLM) trước khi batch/concurrency bắt đầu: nếu 1 block khớp tên trực tiếp (`matchLocalRelevantCharacterIds`), tập nhân vật đó được nhớ làm "last known"; block sau đó không khớp tên trực tiếp nhưng có đại từ ngôi 3 (`containsPronounHint` — danh sách ngắn song ngữ VI/EN: hắn/họ/gã/nó, "cô ấy"/"anh ta"/"anh ấy"/"chị ấy"/"ông ấy"/"bà ấy"/"người đó"; he/she/him/her/his/hers/they/them/their/it) thì kế thừa "last known" thay vì phải gọi selector. Đây là heuristic, không chắc chắn 100% — 1 cảnh đổi nhân vật hoàn toàn im lặng (không tên mới, không đại từ) vẫn có thể kế thừa nhầm nhân vật cũ; chấp nhận được vì hậu quả chỉ là dư/sai 1 dòng Visual DNA trong context của 1 Scene Prompt, không làm hỏng cả bước pipeline.

Không đổi field/schema nào (`scene_prompts.relevant_character_ids` vẫn giữ nguyên ý nghĩa). Fallback cuối (mục 31: selector lỗi hết retry → compact index toàn bộ, không Character Reference) không đổi hành vi.

---

# 32. Prompt Snapshot

Mỗi project khi nhấn Run lần đầu phải lưu:

```text
character_detection_prompt_snapshot
character_generation_prompt_snapshot
scene_generation_prompt_snapshot
selected_model_snapshot
avg_characters_snapshot (đổi tên từ max_characters_snapshot, Phase 19)
fake_duration_snapshot
```

Resume phải dùng snapshot của project, không tự lấy settings global mới.

**Implementation thật (Phase 9):** `ProjectService.applyFirstRunSnapshotIfMissing()` — gọi từ `PipelineService.runProject()` (mục 36) trước khi chạy bước nào, no-op (giữ nguyên) nếu `character_detection_prompt_snapshot` đã khác `null` (coi đây là cột "đại diện" để biết đã snapshot hay chưa, cả 6 field luôn ghi cùng lúc trong 1 lần UPDATE nên không cần kiểm tra cả 6). Tiện thể ghi luôn `projects.selected_model` (field tồn tại từ schema gốc nhưng chưa service nào ghi tới Phase 9, xem mục 6.1) bằng đúng giá trị `selected_model_snapshot`. Toàn bộ 4 bước LLM sau đó (Detect/Character Prompts/Scene Generation) dùng `project.characterDetectionPromptSnapshot`/`selectedModelSnapshot`/... chứ không đọc lại `settings.get()` — kể cả khi gọi lại `runProject()` nhiều lần (Resume).

---

# 33. Processing Concurrency

V1 ưu tiên ổn định hơn tốc độ.

Character Detection:
```text
Concurrency = 1
```

Character Generation:
```text
Concurrency = 1
```

Scene Generation:
- mặc định 4 concurrent requests (nâng từ 2 ngày 2026-08-09, theo yêu cầu user).
- Advanced Settings có thể chỉnh 1–10 (nới từ 1–5 ngày 2026-10-21, theo yêu cầu user; Scene Generation Batch Size cũng nới 1–20 → 1–30).

Cần tránh gửi hàng chục request đồng thời.

Nếu API trả rate limit:
- giảm tốc.
- retry theo backoff.

**Implementation thật:** Character Detection (concurrency = 1) trivial — mục 14 chỉ gọi LLM đúng 1 lần/attempt. Character Generation batch tuần tự từng batch (Phase 7, mục 15.1 — "concurrency = 1"). Scene Generation batch chạy **song song tới `project.sceneConcurrency`** (Phase 8, mục 17.1) — field `scene_concurrency` (default 4 — nâng từ 2 ngày 2026-08-09, range 1–5) đã có sẵn trong schema từ Phase 2.

**Rate-limit backoff (Phase 12):** `src/main/pipeline/backoff.ts` — `rateLimitDelayMs(streak)` exponential (1s → 2s → 4s..., cap 30s) + `sleep()`. `ScenePromptService` dùng 1 `BackoffState { pauseUntil }` **share giữa mọi worker cùng 1 lần `generate()`** (không phải state riêng từng batch) — 1 worker gặp `RATE_LIMIT` (phân loại qua `classifyError()`, mục 34) đẩy `pauseUntil` lên, mọi worker khác (kể cả lời gọi LLM nội bộ của Relevant Character Selector, mục 31) đều đợi hết backoff trước attempt kế tiếp của chính nó — đúng nghĩa "giảm tốc cho Scene Generation concurrency" (cả pool cùng chậm lại), không chỉ riêng request bị rate-limit tự lùi. Character Detection/Character Generation (concurrency = 1, không có pool để share state) dùng backoff đơn giản hơn: đếm streak rate-limit liên tiếp trong chính retry loop của nó, sleep trước attempt kế tiếp.

**Wiring UI thật (Phase 9):** Advanced Settings > Pipeline Tuning hết disabled — `maxRetry`/`sceneConcurrency` giờ sửa được, ghi trực tiếp vào project đang mở qua `projects.updatePipelineSettings` (mục 4.2/10.3). Không có class `TaskQueueService` riêng đúng tên trong sơ đồ mục 4 — concurrency Character Detection/Generation là hành vi tuần tự tự nhiên của `CharacterService`, concurrency Scene Generation nằm trong `ScenePromptService.generate()` (`runWithConcurrency()` nội bộ), `PipelineService` chỉ gọi đúng thứ tự (xem mục 4/36).

**Pause/Cancel giữa lúc đang concurrent (Phase 9, phát sinh khi test với model thật):** `shouldContinue()` (mục 37) ban đầu chỉ kiểm tra **giữa các batch** — với project ít SRT (dưới ngưỡng 1 batch, hiện là 10 — xem mục 17), không có điểm dừng nào giữa chừng nên Pause/Cancel phải đợi hết tối đa `maxRetry` lần gọi thật (có thể hàng chục giây đến vài phút với model có reasoning) mới có tác dụng. Đã sửa: `ScenePromptService.generateBatch()` giờ kiểm tra `shouldContinue()` **trước mỗi lần retry**, không chỉ giữa các batch — dừng thì `return` ngay, không ghi `status=failed` (tránh nhầm "bị Pause" thành "hết retry thật"). **Chưa** áp dụng fix tương tự cho Character Detection/Character Prompt Generation (cùng lỗ hổng, cần cơ chế phân biệt "bị Pause" cẩn thận hơn trước khi vá — ghi nhận là giới hạn đã biết trong `context/plan.md` Phase 9).

---

# 34. Error Handling

Các lỗi cần phân biệt:

```text
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

UI phải hiển thị message dễ hiểu.

Ví dụ:

```text
Scene 028 failed: API timeout.
Retry 2/3
```

Không làm mất kết quả Scene 001–027.

**Implementation thật (Phase 3-9):** chưa có enum/field `ErrorCode` chính thức gắn vào `.error` — mọi nơi hiện chỉ ghi thẳng `Error.message` (tiếng Anh, mô tả cụ thể tình huống, ví dụ "Character Detection failed after 3 attempt(s): Invalid API key.") vào cột `error` (`character_prompts`/`scene_prompts`/`pipeline_tasks`). Riêng lỗi parse response Scene Generation (`INVALID_JSON` — response không parse được thành `{ scene_prompts: [...] }` hợp lệ, mục 30) đã được thêm đoạn preview 300 ký tự đầu của response thật vào message (fix sau khi user test với model thật gặp lỗi khó chẩn đoán) để không cần đợi debug logging đầy đủ (mục 5.3) mới xem được model trả lời gì — cùng lớp lỗi `SceneFormatCollapseError` (`generateScenePrompt.ts`) còn kích hoạt cơ chế tự chia nhỏ batch (mục 17.1) khi batch >1 block. "Không làm mất kết quả Scene 001–027" đã đúng từ thiết kế batch atomic (Phase 8) + gating của `PipelineService` (mục 36, Phase 9) — 1 batch/bước lỗi không xoá dữ liệu batch/bước khác.

**Implementation thật (Phase 12) — phân loại đầy đủ 11 code:** `classifyError()` (`src/main/pipeline/errorClassification.ts`, pure function, không import Electron) nhận `unknown` (bất kỳ gì bị `catch` trong 1 attempt) và trả về `{ code, message }`: `VilaoApiError` (status 401→`INVALID_API_KEY`, 429→`RATE_LIMIT`, message "Vilao returned an empty response"→`EMPTY_RESPONSE`, status null + "Request timed out"→`TIMEOUT`, status null khác→`NETWORK_ERROR`, status 413 hoặc message/`error.type`/`error.code` của response thật chứa "context_length_exceeded"/"maximum context length"/...→`CONTEXT_TOO_LARGE`, message chứa "model" + "not found"/"does not exist"/...→`MODEL_NOT_AVAILABLE`, còn lại→`API_ERROR`); lỗi parse response (`LlmResponseFormatError` — class base mới dùng chung cho cả 3 bước LLM, `SceneFormatCollapseError` ở trên giờ kế thừa nó)→`INVALID_JSON`; lỗi SQLite (`.code` bắt đầu `SQLITE_`)→`DATABASE_ERROR`; `ExportService` lỗi được `export.ipc.ts` gắn thẳng `EXPORT_ERROR` (không qua `classifyError` — `ExportService` không đụng `VilaoService` nên không cần phân loại, luôn đúng 1 loại); fallback không nhận diện được→`API_ERROR`. `VilaoApiError` (`VilaoService.ts`) được mở rộng thêm `apiErrorType`/`apiErrorCode` (đọc từ `error.type`/`error.code` trong response body thật, chuẩn OpenAI-compatible) để nhận diện `MODEL_NOT_AVAILABLE`/`CONTEXT_TOO_LARGE` chính xác hơn heuristic text-match thuần message.

**Quyết định lưu trữ (không phải schema change):** cột `error` TEXT hiện có (`character_prompts`/`scene_prompts`/`pipeline_tasks`) giờ lưu `"<CODE>: <detail message>"` (`src/shared/errorCode.ts` — `formatStoredError()`/`parseStoredError()`) thay vì chỉ message thô — giữ nguyên field/kiểu cột (không thêm cột `error_code` riêng), vừa thoả "giá trị hợp lệ cho field `.error`" của schema.md (luôn bắt đầu bằng đúng 1 trong 11 code) vừa giữ được detail message hữu ích cho debug (preview response, v.v.) đã có từ Phase 3-9. `parseStoredError()` nhận diện đúng code cả khi bị Electron IPC bọc thêm khi throw qua boundary Main→Renderer (`Error invoking remote method '...': Error: <CODE>: <detail>`).

**UI hiển thị "message dễ hiểu" (mục ví dụ "Scene 028 failed: API timeout. Retry 2/3"):** component `ErrorNotice` (`components/ui/ErrorNotice.tsx`) — badge `label-caps` (tên code, ví dụ "TIMED OUT") + detail message, dùng ở Characters/Image Prompts/Processing (cả `pipeline_tasks.error` lẫn `scene_prompts.error`); số Scene/tên character + số lần Retry hiển thị riêng từ cột `attempts`/`block_index` sẵn có, không nhét vào chuỗi `.error`. Badge màu `tertiary` (DESIGN.md, tái dùng token đã dùng cho badge "Completed with errors" ở Home) cho lỗi tạm thời (`RATE_LIMIT`/`NETWORK_ERROR`/`TIMEOUT` — Retry sau có thể tự khỏi), màu `error` cho 8 code còn lại. String cũ không có code prefix (dữ liệu tạo trước Phase 12, hoặc lỗi validation trước khi vào retry loop như "Add a transcript first") vẫn hiển thị đúng dạng text thường, không vỡ.

---

# 35. Context Too Large Handling

Nếu nhận lỗi context quá lớn:

## Character Detection

1. Chuyển sang chunking transcript.
2. Detect theo chunk.
3. Merge character results.

## Character Generation

1. Giảm batch size.
2. Retry.

## Scene Generation

Giảm dữ liệu theo thứ tự:

```text
1. bỏ Next SRT
2. bỏ Previous SRT
3. rút gọn Character Reference
4. chỉ giữ Visual DNA
```

Không được bỏ:
- Current SRT
- relevant Character ID
- Visual DNA cốt lõi

**Implementation thật (Phase 12):**

- **Character Detection** — `CharacterService.detect()` bắt lỗi phân loại `CONTEXT_TOO_LARGE` (mục 34) trong retry loop, chuyển hẳn sang `detectByChunks()`: chia transcript bằng `chunkTranscriptForDetection()` (`detectCharacters.ts`, chia theo ranh giới đoạn văn `\n\n`, fallback chia theo câu nếu 1 đoạn văn tự nó đã quá khổ — mỗi chunk ≤ 6000 ký tự, tối thiểu 2 chunk), detect độc lập từng chunk (mỗi chunk có budget `maxRetry` riêng), merge bằng `mergeDetectedCharacters()` (dedupe theo Character ID `@Name`, chunk xuất hiện trước thắng khi trùng). 1 chunk lỗi hết retry → toàn bộ detect coi là fail, không lưu dữ liệu nửa vời.
- **Character Generation** — `CharacterService.runGenerationBatch()` gặp `CONTEXT_TOO_LARGE` với batch còn >1 character → chia đôi batch, gọi đệ quy cho từng nửa (mỗi nửa có budget `maxRetry` riêng) — cùng pattern shrink-and-recurse đã dùng cho `SceneFormatCollapseError` ở Scene Generation (Phase 8).
- **Scene Generation** — `assembleSceneContext()` (`generateScenePrompt.ts`) vốn đã tự trim theo đúng thứ tự ưu tiên trên **một cách chủ động** (ước lượng ký tự trước khi gửi, mục 18.4) từ Phase 8; Phase 12 thêm khả năng ép trim **phản ứng** khi request thật vẫn bị API từ chối vì quá lớn dù ước lượng chủ động nói là vừa: tham số `minTrimLevel` (0–3, mặc định 0 = giữ nguyên hành vi ước lượng chủ động cũ) — 1 = bỏ Next SRT, 2 = bỏ thêm Previous SRT, 3 = bỏ thêm Character Reference prompts (chỉ còn Visual DNA — bước "3. rút gọn Character Reference" và "4. chỉ giữ Visual DNA" ở trên gộp thành 1 hành động trim vì code hiện tại chỉ có 3 phần tách rời được: Next/Previous/Character-Reference-prompts, còn Visual DNA vốn đã luôn nằm trong phần "Relevant Characters" không tách rời được và **chưa từng** bị trim ở bất kỳ mức nào). `ScenePromptService.generateBatch()` build lại context **mỗi lần retry** (trước đây build 1 lần ngoài vòng lặp, dùng chung cho mọi attempt) — gặp lỗi phân loại `CONTEXT_TOO_LARGE` thì tăng `contextTrimLevel` cho attempt kế tiếp (không tăng nếu là `SceneFormatCollapseError`, nhánh đó được check và xử lý trước, ưu tiên hơn). Hết `maxRetry` mà vẫn `CONTEXT_TOO_LARGE` ở mức trim tối đa (đã đúng sàn "Current SRT/relevant Character ID/Visual DNA cốt lõi") → block đó fail thật, không còn gì để giảm thêm.

---

# 36. Run All Logic

Pseudo flow:

```ts
async function runProject(projectId: string) {
  validateProject();

  await createSrtBlocks();

  if (!charactersCompleted()) {
    await detectCharacters();
  }

  if (!characterPromptsCompleted()) {
    await generateCharacterPrompts();
  }

  for (const block of pendingSrtBlocks()) {
    const relevantIds = await selectRelevantCharacters(block);

    await generateScenePrompt({
      block,
      characters: relevantIds
    });

    await saveImmediately();
  }

  markProjectCompleted();
}
```

**Implementation thật (Phase 9):** `PipelineService.runProject()` (`src/main/services/PipelineService.ts`) theo đúng khung trên, với 1 lệch có chủ đích: **`createSrtBlocks()` (`SrtService.split()`) không chạy vô điều kiện mỗi lần gọi lại** như pseudocode — chỉ chạy khi `srt_blocks` rỗng (`if (listSrtBlocksByProjectId(...).length === 0)`). Chạy lại vô điều kiện trên 1 project đã có `scene_prompts` sẽ xoá + insert lại `srt_blocks` với id mới, kéo theo cascade delete (FK `ON DELETE CASCADE`, schema.md) xoá sạch mọi `scene_prompts` đã sinh — vi phạm trực tiếp mục 41 nguyên tắc 4 ("một task lỗi không được làm mất toàn pipeline") mỗi khi Resume. Gating bước này là điều kiện bắt buộc để Resume không tự phá dữ liệu của chính nó.

`validateProject()` = `validateProjectForRun()` (mục 38, `src/shared/validateRun.ts`) — ném lỗi ngay nếu không hợp lệ, dừng trước khi chạm DB. `charactersCompleted()`/`characterPromptsCompleted()` là biểu thức kiểm tra trực tiếp (`characters.length > 0`, và mọi `character_prompts` `status=success`), không phải hàm/service riêng. `pendingSrtBlocks()` không được implement như 1 vòng `for` tường minh ở tầng `PipelineService` — nằm bên trong `ScenePromptService.generate()` (mục 17.1/19.3: bỏ qua batch đã `success` hoàn toàn). `markProjectCompleted()` = `ProjectService.updateStatus()` với `COMPLETED` nếu mọi scene `success`, hoặc `COMPLETED_WITH_ERRORS` nếu còn scene `failed` (giá trị `Project.status` này có sẵn từ schema.md nhưng pseudocode gốc chỉ nói "completed" chung chung).

`onTaskUpdate` (callback tuỳ chọn, đẩy qua IPC `pipeline:progressEvent`, mục 8.6) chỉ bắn cho 3 bước cấp dự án — Scene Generation dùng lại kênh `scenePrompts:progressEvent` đã có từ Phase 8, không tạo kênh mới.

**Cập nhật (Phase 14, ngoài phạm vi V1 gốc):** pseudo flow trên giờ thiếu 1 bước ở cuối — ngay sau `markProjectCompleted()`, `runProject()` gọi thêm `exportService.export(projectId, runtime.exportFolder)` (best-effort, lỗi chỉ log ra console chứ không throw, xem mục 8.7/21). `runProject()` cũng được gọi từ 2 nơi thay vì 1 kể từ Phase 14: trực tiếp qua `pipeline.run`/`resume`/`retryTask` (như cũ), **hoặc** gián tiếp qua `QueueService.drain()` (mục 6.4) khi tới lượt project đó trong Run Queue — cả 2 đường dùng chung đúng 1 `PipelineService` instance (`getPipelineService()`) nên không có khác biệt hành vi nào giữa 2 cách gọi.

---

# 37. Pause / Cancel

## Pause

- không gửi task mới.
- request đang chạy được phép hoàn thành.
- lưu kết quả.
- project status = Paused.

## Cancel

- hủy pipeline hiện tại.
- không xóa dữ liệu đã hoàn thành.
- có thể Resume sau.

**Implementation thật (Phase 9):** `PipelineService` giữ 1 `Map<projectId, { stopRequested: boolean }>` trong bộ nhớ (singleton do `pipeline.ipc.ts` tạo 1 lần) — `pause()`/`cancel()` chỉ bật `stopRequested = true` cho đúng project đó. `Project.status` (schema.md) **không có giá trị "Cancelled" riêng** — cả Pause lẫn Cancel đều đưa project về `paused` (đều resumable, đều không mất dữ liệu), khác nhau thuần về ý định người dùng chứ không phải hành vi/trạng thái lưu. `stopRequested` được `runProject()` kiểm tra: giữa mỗi bước cấp dự án, giữa mỗi batch Scene Generation, **và giữa mỗi lần retry trong 1 batch** (bổ sung sau khi test với model thật — không có điểm dừng "giữa batch" nào nếu project chỉ có 1 batch, khiến Pause/Cancel vô hiệu, xem mục 33). Request đã thật sự gửi đi (đang `await` chờ response) luôn được để hoàn thành, đúng "request đang chạy được phép hoàn thành" — chỉ việc **bắt đầu** request/batch tiếp theo bị chặn.

Nếu app bị đóng đột ngột (force-quit) giữa lúc `status=processing` (không qua Pause/Cancel đàng hoàng), controller trong bộ nhớ biến mất cùng tiến trình — `ProjectService.open()` tự downgrade `processing` → `paused` khi project được mở lại ở phiên app tiếp theo, để không bị kẹt vĩnh viễn ở "Processing" dù không còn gì đang chạy thật.

**Cập nhật lớn (Phase 14, ngoài phạm vi V1 gốc) — Pause/Cancel UI bị thay bằng Delete-while-running:**
- **2 nút Pause/Cancel ở TopBar (mục 7) và Processing tab (mục 8.6) bị xoá hẳn**, theo yêu cầu trực tiếp của user — lý do nêu ra: 2 nút này vốn gọi cùng 1 hàm `pause()` bên dưới (đã ghi rõ ở đoạn trên), giữ cả 2 chỉ dư thừa. Thay bằng đúng 1 nút **Delete** khi `status=processing` — xoá được project ngay cả khi đang chạy dở, không có lựa chọn "chỉ tạm dừng, giữ lại data" nữa từ UI (dữ liệu vẫn **không mất** trước khi xoá — chỉ là không còn đường quay lại sau khi đã bấm Delete, đúng bản chất xoá).
- **IPC `pipeline.pause`/`pipeline.cancel` và hàm `PipelineService.pause()`/`.cancel()` vẫn còn nguyên**, không bị xoá — chỉ không còn UI nào gọi tới nữa. Cơ chế `stopRequested` mô tả ở trên vẫn đúng 100%, chỉ khác **ai** gọi nó.
- **`PipelineService.stopAndWait(projectId)`** (method mới) là cơ chế thật sự đứng sau nút Delete: gọi request-stop y hệt `pause()`/`cancel()` (bật `stopRequested = true`), **nhưng đợi thật sự** cho tới khi lời gọi `runProject()` đang chạy dở của project đó **settle hẳn** (resolve hoặc reject) mới trả về — khác `pause()`/`cancel()` gốc chỉ bắn cờ rồi return ngay không đợi gì. Bắt buộc phải đợi vì lý do kỹ thuật: `projects.ipc.ts`'s handler xoá row DB **ngay sau khi** `stopAndWait()` xong — nếu không đợi, bước đang chạy dở (ví dụ `upsertPipelineTask`/`upsertCharacterPrompt`) có thể ghi tiếp vào 1 project vừa bị xoá, vi phạm foreign key (`foreign_keys = ON`, schema.md). Track promise đang chạy qua `Map<projectId, Promise<void>>` mới (`runningPromises`) song song với `controllers` map cũ.
- **Nếu project đang nằm trong Run Queue** (mục 6.4) lúc bị xoá — `queueService.remove(id)` được gọi ngay sau `stopAndWait()`, trước khi xoá DB. Không cần logic riêng để "chuyển sang project kế tiếp" — `QueueService.drain()`'s vòng `while` vốn đã tự nhặt item kế tiếp ngay khi lời gọi `runProject()` hiện tại settle (chính là lúc `stopAndWait()` vừa đợi xong), nên project kế tiếp tự chạy tiếp bình thường.
- **`DeleteProjectModal`** (component mới, dùng chung Home/TopBar/Processing tab) đổi nội dung cảnh báo khi `isRunning=true`: nói rõ đang dừng 1 run thật sự đang chạy, có thể mất vài giây (đợi bước hiện tại xong) và mất luôn phần đang xử lý dở.

**Cập nhật (Phase 15, ngoài phạm vi V1 gốc) — Delete không còn chờ `stopAndWait()` ở UI:** bấm Delete trong `DeleteProjectModal` giờ đóng modal **ngay lập tức** và gọi `appApi.projects.delete()` **không await** (fire-and-forget, lỗi chỉ log console) — thay vì trước đây (`isDeleting` state, nhãn "Deleting…") chờ cả `stopAndWait()` xong (có thể mất vài giây nếu đang giữa 1 network call) mới đóng modal. Lý do: theo yêu cầu user — không muốn đợi. Cơ chế backend (`stopAndWait()` rồi mới xoá DB, tránh vi phạm FK) **không đổi gì** — chỉ UI không còn block chờ nó nữa. Hệ quả: `ProjectsListPage.tsx`/`QueuePage.tsx` phải tự ẩn project vừa xoá khỏi danh sách ngay (local `deletedIds` set, optimistic) thay vì gọi lại `refresh()` — vì gọi lại ngay lúc đó vẫn sẽ thấy project chưa thật sự bị xoá ở DB (đang giữa `stopAndWait()`), làm nó "sống lại" trên UI.

**Cập nhật (Phase 15) — hệ quả từ việc xoá nút Resume (mục 7):** 1 project bị `paused` do force-quit rồi mở lại (đoạn trên) giờ **không còn cách nào chạy tiếp được từ UI** — trước Phase 15 vẫn bấm Resume được ở TopBar/Processing tab, giờ chỉ còn badge tĩnh "Paused". Dữ liệu vẫn nguyên vẹn, không mất — chỉ là không có nút nào gọi lại `runProject()` cho case này nữa.

---

# 38. Validation trước Run

Không cho Run nếu:

- Transcript rỗng.
- API key chưa được cấu hình.
- API key chưa hợp lệ.
- Chưa chọn model.
- `avgCharacters` không hợp lệ (đổi tên từ `maxCharacters`, Phase 19).
- prompt bắt buộc bị rỗng.
- placeholder bắt buộc bị thiếu.

Ví dụ:

```text
Scene Prompt thiếu {{SRT_TEXT}}.
Vui lòng sửa Prompt Settings trước khi chạy.
```

**Implementation thật (Phase 9):** `validateProjectForRun()` (`src/shared/validateRun.ts` — không đặt ở `src/main/pipeline/` vì Renderer cũng cần gọi trực tiếp để disable nút Run All/tooltip trước khi user bấm, mà Renderer không được chứa business logic Main theo kiến trúc 3 lớp mục 4). Trả về **message đầu tiên vi phạm** (không phải danh sách đầy đủ), theo đúng thứ tự liệt kê ở trên: transcript rỗng → API key chưa cấu hình → chưa chọn model → `avgCharacters` ngoài khoảng 30–2000 (đổi tên từ `maxCharacters`, Phase 19; min hạ từ 100 xuống 30 ở Phase 24, theo yêu cầu trực tiếp user) → từng prompt (Character Detection → Character Generation → Scene Generation) rỗng hoặc thiếu placeholder bắt buộc — khớp ví dụ "Scene Prompt thiếu {{SRT_TEXT}}..." ở trên khi vi phạm cuối cùng đó là thứ duy nhất sai.

**"API key chưa hợp lệ" không được kiểm tra chủ động** — validate chỉ xác nhận đã **có** key lưu (`vilao.hasApiKey()`), không tự gọi `testConnection()` trước mỗi lần Run (tránh 1 round-trip mạng thừa mỗi lần bấm). Key sai thật sự chỉ lộ ra khi request LLM đầu tiên tự thất bại (401) trong lúc chạy — cùng cách xử lý đã có từ Phase 6 cho các nút trigger thủ công.

---

# 39. Definition of Done — V1

V1 được xem là hoàn thành khi:

1. App chạy trên macOS.
2. Người dùng nhập Vilao API key.
3. App test được API key.
4. App lấy được danh sách model và hiển thị dropdown.
5. Người dùng tạo project.
6. Người dùng paste transcript text.
7. App chia SRT theo `avgCharacters`/`variancePercent` (đổi tên từ `maxCharacters`, Phase 19).
8. App tạo fake timeline.
9. Một nút Run All chạy được toàn pipeline.
10. Character Detection tạo Character Database.
11. Character Generation tạo 1 prompt mỗi nhân vật.
12. Scene Generation tạo đúng 1 prompt mỗi SRT.
13. Relevant Character logic không inject toàn bộ database vào mọi Scene.
14. App lưu kết quả từng task.
15. App có retry.
16. App có resume.
17. App mở lại project cũ được.
18. App hiển thị Characters, SRT và Image Prompts.
19. Export được một `.srt`.
20. Export được `character_prompts.txt`.
21. Export được `image_prompts.txt`.
22. Prompt Settings có đủ 3 prompt mặc định.
23. Prompt có thể chỉnh và Reset to Default.
24. API key không lưu plain text.
25. Pipeline không mất kết quả đã hoàn thành khi một task lỗi.

**Xác nhận thật (Phase 13, 2026-08-09): 25/25 PASS — V1 hoàn thành.** Rà soát toàn bộ 25 mục dựa trên implementation thật đã ghi nhận rải rác từ Phase 2-12 trong tài liệu này, cộng verify trực tiếp bằng Playwright thật (project thật, Split SRT/export thật ra đúng file) trong phiên Phase 13. Không mục nào fail. Chi tiết đối chiếu từng mục: `context/plan.md` → Phase 13 → "Ghi chú hoàn thành".

**Không mục nào bị Phase 14 làm fail lại** (Phase 14 nằm ngoài phạm vi V1, xem mục 40) — riêng mục 9 ("một nút Run All chạy được toàn pipeline") và 16 ("App có resume") vẫn đúng dù cách trigger đổi khác: Run All/Resume giờ trigger được từ TopBar/Processing tab **hoặc** gián tiếp qua Run Queue (mục 6.4); mục 19-21 (export 3 file) vẫn đúng dù trigger đổi từ thủ công sang tự động (mục 8.7/21).

**Mục 16 ("App có resume") bị Phase 15 làm FAIL lại — theo yêu cầu trực tiếp của user, không phải bug.** Nút Resume bị xoá hẳn khỏi UI (mục 7/8.6/6.2) — 1 project `paused` (do Delete-while-running, force-quit giữa chừng, hoặc bất kỳ lý do nào khác) từ giờ **không còn cách nào chạy tiếp được từ giao diện nữa**. Cơ chế Resume ở tầng service (`runProject()` tự gating theo mục 19.3) vẫn còn nguyên và đúng — chỉ là không còn route UI nào gọi tới nó cho case `paused`. Case `failed`/`completed_with_errors` (Retry Failed, dùng chung cơ chế) không bị ảnh hưởng, vẫn PASS. 24/25 PASS kể từ Phase 15.

**Không mục nào bị Phase 16/17 làm fail lại (2026-08-10):** mục 15 ("App có retry") vẫn PASS dù `DEFAULT_MAX_RETRY` hạ xuống 1 và mất UI chỉnh (mục 10.3/19.1) — khác cách mục 16 bị đánh fail, đây không phải xoá hẳn 1 route hành động khỏi UI mà chỉ tuning lại ngân sách mặc định của 1 cơ chế vẫn chạy tự động, nguyên vẹn cho mọi task/batch. Bug fix Overview real-time (mục 8.1) và setting Scene Generation Batch Size mới (mục 17/33) không đụng tới mục DoD nào. Vẫn 24/25 PASS.

---

# 40. Roadmap

## V1 — macOS MVP — ✅ hoàn thành (2026-08-09, Phase 13 là phase cuối)

- Electron shell
- project system
- Vilao settings
- model dropdown
- transcript
- SRT splitter
- 3 AI prompt stages
- relevant character optimization
- retry/resume
- export
- prompt settings
- responsive layout + edge case polish (Phase 13)

## Post-V1 — Phase 14 (2026-08-10, ngoài phạm vi V1 gốc)

Không nằm trong kế hoạch ban đầu — phát sinh trực tiếp từ yêu cầu user trong lúc tự chạy/test app thật trên Windows sau khi V1 đã xong. Chi tiết đầy đủ: `context/plan.md` → Phase 14 → "Ghi chú hoàn thành".

- ✅ **Run Queue nhiều project** (mục 6.4) — chính là "Batch controls" ở V1.1 bên dưới, làm sớm hơn kế hoạch.
- Dọn 3 nút thao tác thủ công đứng thay Run All (Split SRT, Detect Characters, Generate Character Prompts — mục 8.3/8.4) — Run All đã đủ dùng trong thực tế nên không cần nữa.
- Export tự động hoàn toàn khi Run All xong, Default Export Folder cấu hình 1 lần (mục 8.7/21) — không còn nút Export thủ công.
- Delete-while-running thay cho Pause/Cancel (mục 37).
- Fix môi trường dev Windows (build native module, `ELECTRON_RUN_AS_NODE`) — không phải requirement sản phẩm, chỉ ghi lại vì ảnh hưởng tới việc chạy code, xem `context/plan.md`.

## Post-V1 — Phase 15 (2026-08-10, ngoài phạm vi V1 gốc)

Tiếp tục phát sinh trực tiếp từ user trong lúc tự test app thật, cùng phiên với Phase 14.

- **Nút Resume bị xoá hẳn khỏi UI** (TopBar mục 7, Processing tab mục 8.6, Home/Queue row mục 6.2) — `status=paused` giờ chỉ còn badge tĩnh "Paused", không có nút hành động nào. Làm mục 16 DoD (mục 39) fail lại có chủ đích. Retry Failed không bị ảnh hưởng.
- **Home row và Queue row dùng chung 1 component `ProjectRow.tsx`** (`src/renderer/components/ProjectRow.tsx`, tách ra từ `ProjectsListPage.tsx`) — Queue tab giờ hiện đủ progress bar/status badge giống Home thay vì chỉ tên + trạng thái Queued/Running đơn giản như trước (mục 6.4).
- **Delete không còn block UI chờ `stopAndWait()`** (mục 37) — modal đóng ngay, xoá chạy nền.
- Fix bug `useQueueStore` không tự refetch `queue.list()` sau lần `subscribe()` đầu tiên, khiến Queue tab có thể kẹt hiển thị trạng thái cũ nếu lỡ miss 1 `queue:updateEvent` — không phải thay đổi hành vi sản phẩm, chỉ là sửa lỗi để khớp đúng thiết kế gốc.
- **Bắt đầu đóng gói Windows thật** (`electron-builder.yml`), sớm hơn kế hoạch V2 ở dưới. Phát hiện + fix 1 bug đóng gói nghiêm trọng qua build thật + test trực tiếp `require()` trên chính binary đã đóng gói: `better-sqlite3` (native module) tự phụ thuộc package JS thuần `bindings` để tìm file `.node` — heuristic mặc định của electron-builder chỉ unpack đúng `better-sqlite3` (vì có file `.node`), để `bindings` kẹt lại nén trong `app.asar`; `require('bindings')` từ vị trí đã unpack không "nhảy ngược" vào asar được → app mở lên rồi tắt ngay lập tức lúc chạm SQLite lần đầu, không crash log, không exception hiện ra. Sửa bằng `asar: false` (tắt hẳn, không unpack từng package con) — tránh cả lớp bug này về sau, đổi lấy dung lượng cài đặt lớn hơn 1 chút. Thêm `win.target: nsis`. Chưa build/test bản NSIS installer thật (chỉ mới verify qua `dir` target khi debug) — nên tự build và cài thử trên máy khác trước khi gửi cho người dùng thật.

## Post-V1 — Phase 16 (2026-08-10, ngoài phạm vi V1 gốc)

Tiếp tục phát sinh trực tiếp từ user trong lúc tự chạy/test app thật (bug report + 2 yêu cầu tính năng), cùng ngày với Phase 14/15. (Tối ưu cost/latency cho Internal Relevant Character Selector — batch hoá selector call + local pronoun carry-forward, cũng làm cùng ngày, ghi nhận riêng ở "Cập nhật thật (2026-08-10)" cuối mục 31, không lặp lại ở đây.)

- Fix bug Overview tab không cập nhật real-time khi đang đứng ở trang đó — thoát ra vào lại dashboard mới thấy kết quả (mục 8.1).
- Hạ `DEFAULT_MAX_RETRY` từ 3 xuống 1, bỏ hẳn ô "Max Retry" khỏi Settings > Advanced > Pipeline Tuning — theo yêu cầu trực tiếp của user, cơ chế retry ở tầng service không đổi (mục 10.3/19.1).
- Setting mới **Scene Generation Batch Size** (mục 17/33) — số SRT gộp vào 1 request Scene/Image Prompt Generation, trước đó là hằng số cố định `SCENE_PROMPT_BATCH_SIZE = 10`, giờ per-project, chỉnh được qua Settings > Advanced > Pipeline Tuning, range 1–20 (đã hỏi lại user qua `AskUserQuestion` trước khi implement vì đây là schema change thật, theo CLAUDE.md).

## V1.1

- Search/filter tốt hơn
- Regenerate selected scenes
- Better token/context estimator
- Better character merge/dedup
- ~~Batch controls~~ — đã làm ở Phase 14 (post-V1), xem ở trên
- Debug logs
- Export presets

## V2 — Windows

- Windows packaging
- secure key storage Windows
- path handling Windows
- installer
- auto updater nếu cần

## V3 — Optional

Có thể cân nhắc:
- tích hợp image generation API
- gửi `image_prompts.txt` trực tiếp sang Flux hoặc provider khác
- thumbnail/reference preview
- import/export project
- template prompt presets
- nhiều style truyện khác nhau

---

# 41. Nguyên tắc thiết kế cuối cùng

1. **One-click trước, chỉnh tay sau.**
2. **Không bắt người dùng approve từng bước.**
3. **Mọi kết quả phải được autosave.**
4. **Một task lỗi không được làm mất toàn pipeline.**
5. **Resume phải thực sự tiếp tục từ task chưa hoàn thành.**
6. **Scene Prompt phải dùng context nhỏ nhất có thể.**
7. **Chỉ inject relevant characters.**
8. **Character Visual DNA là nguồn nhất quán chính.**
9. **Prompt Settings phải dễ chỉnh nhưng có Default an toàn.**
10. **API key không bao giờ đi qua Renderer dưới dạng có thể đọc trực tiếp nếu không cần thiết.**
11. **SRT index và Image Prompt index luôn map 1:1.**
12. **Output cuối đơn giản: 1 SRT + 2 TXT.**
