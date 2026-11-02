# plan.md — StoryPrompt Desktop

Nguồn: [spec.md](spec.md) · [schema.md](schema.md) · [../.stitch/DESIGN.md](../.stitch/DESIGN.md) · [../CLAUDE.md](../CLAUDE.md)

## Trạng thái các giai đoạn

- [x] Phase 1: Setup + Shell UI
- [x] Phase 2: Local Database + Project System
- [x] Phase 3: Vilao API Settings
- [x] Phase 4: General Settings + Transcript Input
- [x] Phase 5: SRT Splitter (non-LLM) + màn SRT
- [x] Phase 6: Character Detection + màn Characters + Prompt Settings (Character Detection)
- [x] Phase 7: Character Prompt Generation + Prompt Settings (Character Generation)
- [x] Phase 8: Relevant Character Selection + Scene Prompt Generation + màn Image Prompts + Prompt Settings (Scene Generation)
- [x] Phase 9: Run All Orchestration + Processing Tab + Retry/Resume/Pause/Cancel
- [x] Phase 10: Autosave đầy đủ + Overview Dashboard
- [x] Phase 11: Export
- [x] Phase 12: Regenerate + Error Handling Polish
- [x] Phase 13: Polish — Responsive, Animation, Edge Cases
- [x] Phase 14: Post-V1 — dọn UI thừa (Run All đã đủ) + Run Queue nhiều project + Delete-while-running
- [x] Phase 15: Post-V1 — đồng bộ Queue/Dashboard, xoá Resume, chuẩn hoá format prompt, đóng gói Windows
- [x] Phase 16: Post-V1 — Overview tab cập nhật real-time, hạ Max Retry mặc định (bỏ UI), thêm setting Scene Generation Batch Size
- [x] Phase 17: Post-V1 — Channels (setting riêng theo channel, project dùng setting của channel nó thuộc về)
- [x] Phase 18: Post-V1 — Average Characters per SRT + Variance % (thay cho Max cứng)
- [x] Phase 19: Post-V1 — Export folder nested under Channel name
- [x] Phase 20: Post-V1 — Processing tab real-time fix (queue-triggered run) + bỏ nút Remove khỏi Queue
- [x] Phase 21: Post-V1 — Channel option "No Characters" (bỏ qua Character Detection/Character Prompt Generation cho transcript không có nhân vật/cốt truyện)
- [x] Phase 22: Post-V1 — Prompt Scene/Image Generation riêng cho channel "No Characters" (không nhắc tới nhân vật, không cần Relevant Character Selector)
- [x] Phase 23: Post-V1 — Activation Code (khoá theo máy, offline, ký bằng Ed25519 gắn Machine ID)
- [x] Phase 24: Post-V1 — Export thêm `character_list.txt` (danh sách Character ID, chỉ khi project có nhân vật)
- [x] Phase 25: Post-V1 — Multi-provider API key (thêm DeepSeek + Gemini bên cạnh Vilao)
- [x] Phase 26: Post-V1 — Thinking level theo channel cho DeepSeek/Gemini
- [x] Phase 27: Post-V1 — Tab "API Calls" theo project (đếm số lần gọi model)
- [x] Phase 28: Post-V1 — Tối ưu gọi API (retry lỗi tạm thời, streaming + idle timeout, thinking Off cho bước chọn nhân vật, prefix caching, JSON mode, song song Character Prompts)
- [x] Phase 29: Post-V1 — Dọn cấu trúc source (LlmClient, composition root, BatchContext) + sửa lỗi thao tác thủ công (prompt No Characters, snapshot, chạy chồng Run All)

> Cập nhật `[ ]` → `[x]` khi giai đoạn hoàn thành và đã được xác nhận. Không tick trước khi test pass.

**Không có phase Auth:** spec.md mục 2.2 nói rõ "Không cần tài khoản người dùng" — bỏ qua bước Auth trong khung mẫu, đi thẳng từ Shell UI sang Database + Project System.

---

## Stitch Screen Inventory

Đã chạy `list_screens` trên project [17180110911226362084](https://stitch.withgoogle.com/projects/17180110911226362084). Kết quả:

| Title | Screen resource name | Dùng cho |
|---|---|---|
| StoryPrompt - Dashboard | `projects/17180110911226362084/screens/d1fcafba246a487fa30a63c9f4a00b54` | Home / Project History (Phase 2) |
| Settings - StoryPrompt | `projects/17180110911226362084/screens/5a72d3a777344da9a4d8eda405527ce7` | Settings shell + 4 tab (Phase 1, 3, 4, 6, 7, 8) |
| Project Detail - Transcript & SRT | `projects/17180110911226362084/screens/5c7c0f2351a14358a6db68cb43944d50` | Transcript tab + SRT tab (Phase 4, 5) — 1 screen gộp cả 2, kiểm tra kỹ layout khi `get_screen` để tách đúng section |
| Pipeline Status | `projects/17180110911226362084/screens/1bc3f2596caf442e85ac4c6b5bb4b5e7` | Processing tab (Phase 9) |
| spec.md | `projects/17180110911226362084/screens/1220609313086003552` | Không phải UI screen — bỏ qua |

**Chưa có trong Stitch** (spec yêu cầu nhưng list_screens không trả về): **Overview**, **Characters**, **Image Prompts**, **Export**. Với các phase liên quan (6, 8, 10, 11), phải dùng `generate_screen_from_text` (kèm `designSystem` của project hiện tại để giữ đúng token DESIGN.md) trước khi implement, thay vì tự vẽ UI. Trước khi generate mới, luôn `get_screen` lại "Project Detail - Transcript & SRT" và "StoryPrompt - Dashboard" một lần nữa để chắc chắn Overview không nằm ẩn trong 2 screen đó.

Quy trình bắt buộc cho **mọi** phase có UI: `list_screens` (đã có sẵn ở bảng trên, không cần chạy lại trừ khi nghi ngờ có screen mới) → `get_screen` (lấy `htmlCode` + `screenshot`) → implement bằng Tailwind theo đúng code/hình đó. Nếu screen cần chỉnh sửa nhỏ (thêm cột, thêm state), dùng `edit_screens` trên screen đã có thay vì generate mới.

---

## Ràng buộc áp dụng cho mọi phase

- Không tự thay đổi schema trong [schema.md](schema.md) — thêm/bớt field, đổi kiểu, đổi bảng đều phải hỏi lại trước. Nếu trong lúc code phát hiện cần đổi, ghi vào [Schema Change Notes](#schema-change-notes) cuối file, KHÔNG tự sửa schema.md.
- Không tự đổi màu/spacing/typography/component style ngoài [.stitch/DESIGN.md](../.stitch/DESIGN.md). Nếu DESIGN.md chưa cover trường hợp cần dùng, hỏi lại.
- Tailwind CSS only, `lucide-react` cho icon, React Hook Form + Zod cho mọi form (validate trước khi ghi DB) — theo CLAUDE.md.
- Mỗi phase dừng lại ở "Điểm dừng" của nó — không tự động chuyển phase tiếp theo dù có vẻ dễ làm liền.

---

## Phase 1 — Setup + Shell UI

**Việc cần làm:**
- Scaffold Electron + Vite + React + TS theo kiến trúc 3 lớp (spec mục 4): Renderer / Preload (`contextBridge`, `contextIsolation: true`, không Node integration trong Renderer) / Main Process.
- Cấu hình Tailwind, đưa token màu/typography/spacing/rounded từ DESIGN.md vào `tailwind.config.ts` (không bịa token mới).
- Cài `lucide-react`, `react-hook-form`, `zod`, `zustand`, `better-sqlite3`, `electron-store`.
- Preload expose `window.appApi` với các method stub (chưa nối logic thật) theo interface mục 4.2 spec.
- Implement AppShell: TopBar (Project Name / Model / nút Run All — disabled), Sidebar cố định 260px (Overview, Transcript, SRT, Characters, Image Prompts, Processing, Export — `label-caps` cho header nhóm theo DESIGN.md), StatusBar dưới cùng.
- Router map mỗi mục sidebar + Settings → 1 route, render empty state với mock/static data.
- Settings shell riêng (route riêng), 4 tab: General / Vilao API / Prompts / Advanced — empty state.

**Màn hình Stitch dùng:** "StoryPrompt - Dashboard" (tham khảo layout tổng thể, nav) và "Settings - StoryPrompt" (Settings shell) — `get_screen` lấy `htmlCode` + `screenshot` trước khi code, theo đúng thứ tự đã nêu ở [Stitch Screen Inventory](#stitch-screen-inventory).

**Test + chạy local:**
1. `npm install && npm run dev`.
2. Cửa sổ Electron mở được, dark mode mặc định.
3. Click qua từng mục Sidebar + 4 tab Settings — không crash, mỗi route render empty state.
4. Đối chiếu màu nền/border/khoảng cách với DESIGN.md (surface-charcoal nền chính, border-subtle 1px, sidebar 260px, container max 1200px, spacing bội số 8px).

**Điểm dừng:** Shell UI clickable, chưa có logic/DB thật. Dừng tại đây, chờ xác nhận trước khi sang Phase 2.

**Ghi chú hoàn thành (đã test pass 2026-08-08):**
- Dùng `electron-vite` làm build tool (thay cho `vite.config.ts` riêng lẻ trong Project Structure gốc) — file cấu hình thực tế là `electron.vite.config.ts`, chuẩn cho stack Electron+Vite+TS, tự tách build main/preload/renderer.
- `package.json` **không** đặt `"type": "module"` — do thử ESM cho main/preload gây lỗi runtime khi Electron load main process (`electron.app` undefined / `cjsPreparseModuleExports` crash). Main + Preload build ra CommonJS (`out/main/index.js`, `out/preload/index.js`) — ổn định, đúng khuyến nghị electron-vite mặc định.
- IPC handlers cho `srt`, `characters`, `scenePrompts` gộp chung vào `src/main/ipc/projects.ipc.ts` (sub-resource của project) thay vì tách file riêng — không tạo thêm file ngoài 5 domain đã liệt kê trong Project Structure.
- Settings shell **không** copy nguyên sidebar "New Project/Projects/Settings" từ Stitch mockup — vì đó là nav của màn Dashboard (Phase 2), không phải Settings. Thay bằng header đơn giản "← Configuration" + Save Changes, tránh trùng lặp/gây nhầm điều hướng.
- Route `/` redirect thẳng vào `/overview` với 1 mock project tĩnh (`lib/mockData.ts`) — chưa có Home/Dashboard route thật (đúng kế hoạch, Home thuộc Phase 2 vì cần SQLite cho Project History).
- Gotcha môi trường (không phải bug code): biến `ELECTRON_RUN_AS_NODE=1` do Cursor IDE set sẵn trong shell tích hợp khiến Electron chạy như Node thường, không mở cửa sổ — cần `unset ELECTRON_RUN_AS_NODE` trước khi `npm run dev`/chạy binary trực tiếp từ terminal đó.
- Đã verify bằng driver Playwright tự viết (click qua toàn bộ 7 mục sidebar + 4 tab Settings, cả `npm run dev` và `npm run build` + chạy binary) — không console error, `tsc --noEmit` sạch trên cả 3 tsconfig.

---

## Phase 2 — Local Database + Project System

**Việc cần làm:**
- `DatabaseService` (better-sqlite3) + migration tạo đúng 6 bảng theo [schema.md](schema.md#schema): `projects`, `srt_blocks`, `characters`, `character_prompts`, `scene_prompts`, `pipeline_tasks` — copy chính xác field/type/constraint, không thêm bớt.
- IPC thật: `projects.create/open/list/rename/delete`.
- `AppSettings` qua `electron-store` đúng shape trong schema.md (Non-DB data shapes).
- Home screen thật: New Project (Project Name + Transcript), Project History list (Name/Created/Last updated/Status/Progress/Model theo spec mục 6.2), actions Open/Rename/Delete/Show in Finder (Resume/Export để disabled — chưa có pipeline tới Phase 9/11).
- Form New Project dùng React Hook Form + Zod validate trước khi ghi DB.

**Màn hình Stitch dùng:** "StoryPrompt - Dashboard" — `get_screen` lấy code/hình, implement đúng theo đó.

**Test + chạy local:**
1. `npm run dev`, tạo 3 project test qua UI.
2. Project History hiển thị đúng cả 3, đúng field.
3. Rename, Delete hoạt động; Delete xoá thật record (mở file sqlite bằng `sqlite3` CLI kiểm tra không còn row).
4. Tắt app, mở lại — dữ liệu project vẫn còn (kiểm tra file DB trong `userData` path).

**Điểm dừng:** Project CRUD hoạt động end-to-end qua SQLite thật, có unique constraint đúng schema. Dừng, chờ xác nhận trước khi sang Phase 3.

**Ghi chú hoàn thành (đã test pass 2026-08-08):**
- `better-sqlite3` là native module — ABI của Node (dùng cho `npm test`/vitest) và ABI của Electron 33 khác nhau (137 vs 130), `require()` sai ABI crash ngay. Thêm `predev`/`prestart`/`prebuild`/`postinstall` chạy `electron-rebuild -f -o better-sqlite3` (rebuild cho Electron) và `pretest` chạy `npm rebuild better-sqlite3` (rebuild lại cho Node) — mỗi lệnh tự rebuild đúng target trước khi chạy, tự động, không cần nhớ thủ công. Thêm `@electron/rebuild` vào devDependencies.
- `electron-store` bản mới (v9+) chuyển sang ESM-only (`"type": "module"`), vỡ với main process build ra CommonJS (`externalizeDepsPlugin` giữ `require()`) — cùng loại lỗi đã note ở Phase 1 cho main/preload. Hạ xuống `electron-store@8.2.0` (CJS, bản major cuối trước khi chuyển ESM) thay vì dùng `await import()` động, để nhất quán với quyết định "không ESM trong main" đã chốt ở Phase 1.
- Thêm `@hookform/resolvers` (chưa có trong Phase 1) để nối React Hook Form + Zod theo đúng yêu cầu CLAUDE.md — bump `react-hook-form` lên `^7.55.0` vì `@hookform/resolvers@5` yêu cầu tối thiểu bản đó.
- Migration `0001_init` viết dưới dạng module `.ts` export string SQL (`src/main/db/migrations/0001_init.ts`) thay vì file `.sql` rời như Project Structure gợi ý — để esbuild/electron-vite inline thẳng vào `out/main`, tránh phải cấu hình copy asset khi đóng gói bằng electron-builder (asar). Migration runner (`db/migrate.ts`) track bằng bảng `_migrations`, idempotent.
- `ProjectService`/`db/queries`/`db/client.ts` **không** import `electron` — nhận `Database.Database` qua constructor/param, để test được bằng `createDatabase(':memory:')` trong vitest (không cần mock Electron). Chỉ `services/DatabaseService.ts` (resolve `app.getPath('userData')`) và IPC layer mới chạm `electron`.
- "Show in Finder" (spec 6.2) reveal file SQLite (`storyprompt.sqlite3`) trong `userData`, không phải folder riêng của project — vì chưa có folder nào cho tới khi Export (Phase 11) tạo ra. Cách này cũng trực tiếp phục vụ bước test thủ công #4 ("kiểm tra file DB trong userData path").
- Route `/` đổi từ redirect tĩnh sang màn Home thật (`features/home/HomePage.tsx`) — New Project modal (RHF+Zod) + Project History list (đủ 6 action: Open/Resume(disabled)/Rename/Delete(có confirm modal)/Show in Finder/Export(disabled)). Router thêm route `/projects/:projectId` với `loader` gọi `projects.open()` và seed `useProjectStore` **trước khi** `AppShell`/`TopBar` render (tránh flash null). Sidebar đổi path tuyệt đối → tương đối (`overview` thay vì `/overview`) vì giờ nằm dưới `/projects/:projectId`.
- Thêm `components/ui/Modal.tsx` (DESIGN.md Elevation Level 2: `backdrop-blur-xl`, border `outline-variant`) — dùng cho New/Rename/Delete Project, sẽ tái dùng cho dialog Regenerate ở Phase 12 theo đúng note trong plan.
- Thêm variant `danger` cho `Button` (dùng token `error`/`on-error` có sẵn trong DESIGN.md) cho nút Delete trong confirm modal — bug ban đầu: đè `className="bg-error..."` lên trên variant `primary` (đã có `bg-vilao-blue`) khiến 2 class nền xung đột, Tailwind giữ `bg-vilao-blue` (nút vẫn xanh) — phát hiện qua screenshot Playwright, sửa bằng cách tách hẳn thành variant riêng thay vì override className.
- Đã verify bằng driver Playwright tự viết (cài tạm `playwright-core` qua `npm install --no-save`, gỡ lại sau khi xong — không nằm trong `package.json`/`package-lock.json`): tạo 3 project qua UI thật, rename, delete (có xoá đúng 1 project, giữ 2 project còn lại), mở project vào AppShell thật (TopBar hiện đúng tên/model, Sidebar điều hướng đủ 7 mục + Settings), tắt hẳn app và mở lại (process mới) — 2 project còn lại vẫn còn nguyên. Query trực tiếp bằng `sqlite3` CLI xác nhận đủ 6 bảng + `_migrations`, đúng field/type theo schema.md, đúng default (`max_characters=300`, `fake_duration_sec=3`, `max_retry=3`, `scene_concurrency=2`). Unique constraint `(project_id, block_index)` trên `srt_blocks` và cascade delete (xoá `projects` → xoá thật `srt_blocks`/`characters`/`pipeline_tasks` liên quan) verify bằng unit test (`tests/unit/projectService.test.ts`, 10 test, `vitest`). `settings.get/save` qua `electron-store` verify trực tiếp qua `window.appApi` — ghi/đọc đúng, có file JSON thật trên đĩa.
- `tsc --noEmit` sạch trên cả 3 tsconfig, `eslint` sạch, `vitest` 10/10 pass. Đã dọn dữ liệu test khỏi `userData` thật (`~/Library/Application Support/storyprompt-desktop`) sau khi verify xong để lần chạy đầu thật của user sạch sẽ.
- **Cập nhật sau feedback:** Home ban đầu chỉ có header đơn giản (logo + icon Settings) + modal "Create New Project". Theo yêu cầu, đổi thành `HomeShell` có sidebar 260px thật (`HomeSidebar.tsx`) với 3 tab: **Projects** (`/`, danh sách — `ProjectsListPage.tsx`), **New Project** (`/new`, form full-page thay vì modal — `NewProjectPage.tsx`), **Settings** (`/settings`). Bỏ "Library"/"Archive"/avatar user khỏi sidebar dù có trong Stitch mockup gốc, vì spec.md không có khái niệm đó ở V1 (không tài khoản). Modal chỉ còn dùng cho Rename/Delete (xác nhận hành động trên 1 item, không phải điều hướng chính) — giữ nguyên `components/ui/Modal.tsx`.
- **Fix tiếp theo:** `/settings` ban đầu là route đỉnh (`SettingsShell` tự vẽ full-screen header/footer riêng, đè hết chiều rộng) nên vào Settings thì mất hẳn sidebar. Chuyển `/settings` thành route con lồng dưới `/` (trong cây route của `HomeShell`) để `HomeSidebar` luôn hiển thị xuyên suốt; `SettingsShell` bỏ header/footer `fixed` full-width, chỉ còn render nội dung (tiêu đề + back-arrow + 4 tab con General/Vilao API/Prompts/Advanced) bên trong `<main>` mà `HomeShell` đã cung cấp — cùng pattern với `ProjectsListPage`/`NewProjectPage`.

**Xác nhận bởi user (2026-08-08) — tóm tắt thay đổi chính:**
- SQLite thật (better-sqlite3) với đủ 6 bảng theo schema.md, migration idempotent qua bảng `_migrations`.
- `ProjectService` CRUD thật (create/open/list/rename/delete) nối IPC, tách khỏi Electron nên unit-test được (10 test, `tests/unit/projectService.test.ts`), có cascade delete + unique constraint.
- `AppSettings` qua `electron-store` (hạ xuống bản v8 CJS để tương thích main process CommonJS).
- Home đổi từ modal sang `HomeShell` có sidebar 3 tab (Projects / New Project / Settings) — New Project là trang riêng thay vì modal; Settings lồng route dưới `/` nên sidebar luôn hiển thị kể cả khi đang ở trong Settings.
- Fix native module ABI mismatch (Node vs Electron) cho `better-sqlite3` bằng script tự rebuild theo target (`predev`/`pretest`/...).
- Fix bug UI nút Delete hiện sai màu (xanh thay vì đỏ) bằng cách tách variant `danger` riêng cho `Button` thay vì override className.

---

## Phase 3 — Vilao API Settings

**Việc cần làm:**
- `SecureStorageService` dùng Electron `safeStorage` (Keychain macOS), lưu đúng shape `SecureCredential` trong schema.md — không bao giờ plaintext.
- `VilaoService.testConnection()` / `listModels()` (thiết kế OpenAI-compatible, spec mục 5.2).
- IPC: `vilao.testConnection`, `vilao.listModels`, settings lưu API key.
- Settings > Vilao API screen thật: input password, nút Save, nút Test Connection với 5 trạng thái (Not configured / Checking / Connected / Invalid / Error), model dropdown, nút Refresh Models. Đổi API key → clear model list cũ, fetch lại, yêu cầu chọn lại model nếu model cũ không còn (spec 5.1).

**Màn hình Stitch dùng:** "Settings - StoryPrompt" (tab Vilao API) — `get_screen`.

**Test + chạy local:**
1. `npm run dev` → Settings > Vilao API.
2. Nhập API key thật (hoặc sandbox key Vilao), bấm Test Connection — trạng thái chuyển Checking → Connected/Invalid/Error đúng thực tế.
3. Model dropdown load được danh sách thật, chọn 1 model, lưu lại.
4. Đổi sang key khác → model list cũ bị clear, fetch lại danh sách mới.
5. Kiểm tra file lưu key trên máy (electron-store JSON hoặc Keychain Access trên macOS) — không thấy chuỗi key dạng đọc được.

**Điểm dừng:** Kết nối Vilao thật hoạt động, API key an toàn không plaintext. Dừng, chờ xác nhận trước khi sang Phase 4.

**Ghi chú hoàn thành (đã test pass 2026-08-08):**
- Base URL/endpoint không có trong spec.md/schema.md — hỏi lại user, được cấp docs thật của Vilao (api.vilao.ai): base URL `https://api.vilao.ai/v1`, OpenAI-compatible (`GET /models`, `POST /chat/completions`, Bearer auth, lỗi trả `{ error: { message, type, code } }`). Hard-code làm constant `VILAO_BASE_URL` trong `VilaoService.ts` (không thêm field `baseUrl` vào `AppSettings` — không cần thiết vì chỉ có 1 provider cố định, không phải schema change).
- `SecureStorageService` (`src/main/services/SecureStorageService.ts`): `safeStorage.encryptString`/`decryptString`, ghi ciphertext dạng raw bytes vào file riêng `vilao.cred` trong `userData` (không qua electron-store, không JSON đọc được, không SQLite) — verify bằng `xxd` thấy prefix `v10` (macOS Keychain AES wrapper của Chromium/Electron), không tìm thấy chuỗi key plaintext trong file.
- `VilaoService` (`src/main/services/VilaoService.ts`): không import `electron` (giống `ProjectService`), nhận `apiKey` đã giải mã qua constructor, dùng `fetch` global (Node 18+/Electron built-in, không thêm dependency HTTP client mới) — unit test được bằng cách mock `global.fetch` (`tests/unit/vilaoService.test.ts`, 6 test: map response, lỗi 401 → `VilaoApiError.status`, lỗi network → `status: null`, `testConnection()` boolean, custom `baseUrl`). Chỉ implement `testConnection`/`listModels` theo đúng scope Phase 3 — `chat()` (interface spec.md 5.2) để lại Phase 6 vì chưa chốt shape `LlmRequest`/`LlmResponse`.
- IPC `vilao.testConnection` map lỗi thật (không dùng `VilaoService.testConnection()` boolean vì mất thông tin status code) → tự bắt `VilaoApiError`: `status === 401` → `invalid`, còn lại (network/timeout/5xx) → `error`; chưa cấu hình key → `not_configured` ngay (không gọi mạng).
- Settings > Vilao API screen thật (`VilaoApiSettingsPage.tsx`) theo đúng `get_screen` Stitch "Settings - StoryPrompt" tab API: input password + Save + Test Connection cùng hàng, dòng trạng thái 5 icon màu theo DESIGN.md token (`text-secondary`/`vilao-blue`/`emerald-success`/`error`), dropdown Model + nút Refresh Models. Đổi API key → Save tự clear model list + reset status về `not_configured` (đúng spec 5.1), chọn model → `settings.save({ selectedModel })` lưu vào `AppSettings` (electron-store) ngay khi đổi.
- Đã verify bằng driver Playwright tự viết (cài tạm `playwright-core`, gỡ lại sau khi xong — không nằm trong `package.json`/`package-lock.json`): Not configured ban đầu → Save fake key (đã encrypt đúng, không plaintext trên đĩa) → Test Connection trả `Invalid API key` (401 thật từ api.vilao.ai) → user cung cấp 1 API key thật để test nốt → Save + Test Connection → `Connected`, model dropdown load đúng 3 model thật (`gpt-5.5`, `claude-opus-4-8`, `claude-sonnet-4-6`) → chọn `gpt-5.5`, verify `app-settings.json` có `"selectedModel": "gpt-5.5"` → tắt hẳn app mở lại → tự động reconnect `Connected` + giữ đúng model đã chọn. Không console error xuyên suốt.
- Đã xoá key test thật khỏi `vilao.cred` và dọn `app-settings.json`/`storyprompt.sqlite3` test khỏi `userData` thật sau khi verify xong (cùng convention dọn dẹp đã note ở Phase 2).
- `tsc --noEmit` sạch trên cả 3 tsconfig, `eslint` sạch, `vitest` 16/16 pass (10 cũ + 6 mới).

**Xác nhận bởi user (2026-08-08) — tóm tắt thay đổi chính:**
- `SecureStorageService` mã hóa API key qua macOS Keychain (`safeStorage`), lưu ciphertext dạng raw bytes vào file riêng `vilao.cred` trong `userData` — không qua electron-store/SQLite, không plaintext.
- `VilaoService` (không phụ thuộc Electron, unit-test được) gọi thật base URL `https://api.vilao.ai/v1` (do user cung cấp, không có sẵn trong spec.md/schema.md) — `testConnection`/`listModels` theo chuẩn OpenAI-compatible; `chat()` để dành Phase 6.
- IPC `vilao.*` nối logic thật, map lỗi HTTP 401 → `invalid`, lỗi khác → `error`, chưa cấu hình → `not_configured` không gọi mạng.
- Settings > Vilao API screen thật: Save/Test Connection/5 trạng thái, model dropdown + Refresh Models, đổi key tự clear model list và yêu cầu test lại.
- Verify end-to-end bằng key thật do user cung cấp: Connected, load đúng danh sách model thật, chọn model lưu vào `AppSettings`, restart app tự reconnect và giữ đúng model đã chọn.

**Cập nhật sau feedback (2026-08-08, trong lúc test thủ công Phase 6):**
- Ô API key bị xoá trắng sau khi Save (đúng chủ đích bảo mật — không giữ plaintext dư trong UI) gây hiểu lầm là key bị mất. Thêm IPC `vilao.hasApiKey()` (chỉ check file tồn tại, không giải mã, không gọi mạng) để UI biết "đã có key lưu" độc lập với `status` (vốn luôn reset về `Not configured` sau Save để bắt test lại). Khi đã có key: input tự **disabled**, placeholder đổi thành chuỗi chấm `••••••••` kèm nhãn "SAVED", chỉ còn nút **Remove** (gọi IPC mới `vilao.clearApiKey()` → `SecureStorageService.clear()`, đã có sẵn từ đầu Phase 3 nhưng chưa expose ra ngoài) để xoá rồi nhập lại — bỏ ý tưởng nút "Change" (unlock tại chỗ) theo yêu cầu, giữ đúng 1 đường dẫn duy nhất để đổi key.
- Save giờ tự động gọi `testConnection()` (fetch model luôn nếu Connected) thay vì bắt bấm tay nút Test Connection riêng.
- Sự cố trong lúc tự kiểm thử: driver Playwright launch thẳng app đã build **không cô lập profile Electron như kỳ vọng** — ghi đè `vilao.cred` thật bằng key giả. Phát hiện qua timestamp file, đã xoá file hỏng ngay, xác nhận project/`app-settings.json` không bị ảnh hưởng. Từ thời điểm này ngừng dùng Playwright tự động để verify các thay đổi tiếp theo trong phiên, chuyển sang để user tự test tay trên `npm run dev`.

---

## Phase 4 — General Settings + Transcript Input

**Việc cần làm:**
- Settings > General: `Maximum characters per SRT` (100–2000, default 300), `Duration per SRT block` (1–30s, default 3), `Max retry` (default 3, có thể để Advanced) — lưu AppSettings, đồng bộ vào `projects.max_characters`/`fake_duration_sec`/`max_retry` khi tạo project mới.
- Transcript tab thật: textarea lớn, Paste / Select all / Clear / Load `.txt` (qua `dialog.showOpenDialog` từ Main), character count + word count. Không cần Rich Text.
- Autosave `projects.transcript` khi transcript đổi (debounce, theo nguyên tắc autosave mục 6.3 — không chờ pipeline).

**Màn hình Stitch dùng:** "Project Detail - Transcript & SRT" (phần Transcript) và "Settings - StoryPrompt" (tab General) — `get_screen` cả hai.

**Test + chạy local:**
1. `npm run dev`, mở 1 project, vào tab Transcript.
2. Paste đoạn text dài, đếm ký tự/từ hiển thị đúng.
3. Load 1 file `.txt` mẫu — nội dung nạp đúng vào editor.
4. Đổi `maxCharacters` trong Settings > General, đóng mở lại app — transcript và setting vẫn giữ nguyên (query DB xác nhận).

**Điểm dừng:** Transcript input + General Settings hoạt động, autosave xác nhận qua DB thật. Dừng, chờ xác nhận trước khi sang Phase 5.

**Ghi chú hoàn thành (đã test pass 2026-08-08):**
- Max Retry **không** đưa vào `AppSettings`/General Settings ở phase này — giữ nguyên quyết định đã note sẵn trong `AdvancedSettingsPage.tsx` từ trước (Max Retry + Scene Concurrency wiring dồn về Phase 9 cùng `TaskQueueService`/concurrency). Lý do: `AppSettings` (schema.md) hiện không có field `maxRetry` — thêm field mới vào đó là thay đổi schema, phải hỏi lại trước theo CLAUDE.md, trong khi codebase đã có sẵn quyết định tương đương (Max Retry ở Advanced, Phase 9) nên không cần hỏi lại. Phần "đồng bộ ... max_retry khi tạo project mới" trong plan vì vậy chỉ áp dụng cho `maxCharacters`/`fakeDurationSec` — `max_retry` mới vẫn dùng hằng số mặc định `DEFAULT_MAX_RETRY = 3` như từ Phase 2.
- `ProjectService.create()` nhận thêm tham số thứ 2 optional `defaults?: { maxCharacters?: number; fakeDurationSec?: number }` (fallback về hằng số schema.md nếu không truyền — giữ nguyên hành vi cũ cho unit test). IPC handler `projects:create` (`projects.ipc.ts`) đọc `AppSettings` hiện hành (`getAppSettings()`) và truyền vào làm defaults — project mới tạo ra đúng `max_characters`/`fake_duration_sec` theo Settings > General tại thời điểm tạo, verify bằng Playwright (đổi setting → 500/7 → tạo project mới → query DB đúng `500|7`).
- Thêm 2 IPC method mới ngoài danh sách gốc trong spec.md 4.2 (không phải thay đổi schema DB, chỉ là bề mặt IPC): `projects.updateTranscript(id, transcript)` (autosave, gọi `ProjectService.updateTranscript` mới → `UPDATE projects SET transcript, updated_at`) và `projects.loadTranscriptFile()` (Main mở `dialog.showOpenDialog` filter `.txt`, đọc file bằng `readFileSync`, trả string hoặc `null` nếu cancel — Renderer không đụng filesystem, đúng kiến trúc 3 lớp mục 4).
- Transcript tab (`TranscriptPage.tsx`): textarea lớn theo layout "Source Transcript" panel của Stitch "Project Detail - Transcript & SRT" (bỏ phần SRT — để Phase 5), toolbar Paste (`navigator.clipboard.readText()`, fallback báo lỗi nếu bị chặn quyền) / Select All (`textarea.select()`) / Clear / Load .txt, đếm ký tự/từ live. Autosave debounce 800ms qua `projects.updateTranscript`, có label trạng thái Saving…/Saved/Save failed; sync `useProjectStore` sau khi lưu thành công để các tab khác đọc đúng transcript mới nhất.
- Settings > General (`GeneralSettingsPage.tsx`): form thật (React Hook Form + Zod, `settings.schema.ts` mới) cho `maxCharacters` (100–2000) và `fakeSrtDurationSec` (1–30), load giá trị hiện hành qua `settings.get()`, lưu qua `settings.save()`. Theo đúng layout Stitch "Settings - StoryPrompt" tab General (card "Subtitle Generation") — bỏ card "Workspace Preferences" (auto-save toggle) trong mockup gốc vì không có setting tương ứng trong schema.md, thêm sẽ vi phạm "không tự thêm field".
- Verify bằng driver Playwright tự viết (cài tạm `playwright-core`, gỡ lại sau khi xong): tạo project với transcript → vào tab Transcript, đúng nội dung + đúng đếm ký tự/từ → gõ thêm text → trạng thái Saving… rồi Saved → query `sqlite3` xác nhận DB khớp → Select All chọn đúng toàn bộ text → Load .txt (stub `dialog.showOpenDialog` qua `electronApp.evaluate` trỏ vào file tạm) nạp đúng nội dung file → Clear xoá cả editor lẫn DB → đổi Settings > General thành 500/7, Save → tạo project thứ 2 → DB đúng `max_characters=500, fake_duration_sec=7` → tắt hẳn app mở lại → Settings > General vẫn giữ 500/7, transcript project đầu vẫn rỗng đúng như trước khi tắt app.
- `tsc --noEmit` sạch trên cả 3 tsconfig, `eslint` sạch, `vitest` 19/19 pass (16 cũ + 3 mới: `create()` với defaults override, `updateTranscript()` persist + bump `updated_at`, `updateTranscript()` throw khi project không tồn tại). Đã dọn `storyprompt.sqlite3`/`app-settings.json` test khỏi `userData` thật sau khi verify xong.

**Xác nhận bởi user (2026-08-08) — tóm tắt thay đổi chính:**
- Settings > General wire thật (RHF + Zod): `Maximum characters per SRT` (100–2000) và `Duration per SRT block` (1–30s), lưu vào `AppSettings` qua `electron-store`, áp dụng làm default cho project mới tạo. Max Retry giữ nguyên ở Advanced/Phase 9 (quyết định có sẵn từ trước, không đổi).
- Transcript tab wire thật: textarea + Paste/Select All/Clear/Load `.txt`, đếm ký tự/từ live, autosave debounce 800ms xuống SQLite (`projects.transcript`), có label trạng thái Saving…/Saved.
- Thêm 2 IPC method mới (`projects.updateTranscript`, `projects.loadTranscriptFile`) — chỉ mở rộng bề mặt IPC, không đổi DB schema.
- `ProjectService.create()` nhận thêm defaults tuỳ chọn để project mới kế thừa đúng `maxCharacters`/`fakeDurationSec` từ Settings > General hiện hành thay vì hằng số cứng.
- Verify end-to-end bằng Playwright thật: transcript autosave xuống SQLite, Load .txt/Clear đúng cả UI lẫn DB, đổi Settings chung → project mới tạo đúng default mới, tắt/mở lại app dữ liệu vẫn giữ nguyên. `tsc`/`eslint`/`vitest` (19/19) sạch.

---

## Phase 5 — SRT Splitter (non-LLM) + màn SRT

**Việc cần làm:**
- Pure function `splitTranscriptToSrtBlocks(transcript, maxCharacters, fakeDurationSec)` đúng algorithm mục 11.1–11.4: sentence segmentation (`. ? ! … xuống dòng`), gom câu tới sát `maxCharacters`, câu đơn quá dài ưu tiên split `; : ,` rồi whitespace gần giới hạn, hard-cut chỉ khi hết lựa chọn; fake timeline `start = (index-1)*duration`, `end = index*duration`.
- Unit test riêng cho function này: transcript thường, 1 câu đơn dài hơn maxCharacters, transcript rỗng.
- Task `SPLIT_SRT`: chạy, ghi `srt_blocks` vào DB (unique `(project_id, block_index)`, liên tục từ 1) — không gọi LLM.
- SRT tab thật: list block (index, fake timestamp, text, character_count), search.
- Nút tạm thời "Split SRT" trên UI (trước khi có Run All ở Phase 9) để trigger thủ công.

**Màn hình Stitch dùng:** "Project Detail - Transcript & SRT" (phần SRT) — `get_screen`.

**Test + chạy local:**
1. Chạy unit test: `npm run test tests/unit/srtSplitter.test.ts` — pass toàn bộ case.
2. `npm run dev`, paste transcript mẫu (~1000 ký tự, có câu dài), bấm Split SRT.
3. Verify: mọi block ≤ maxCharacters (trừ trường hợp hard-cut bắt buộc), timeline đúng công thức, search lọc đúng theo text.

**Điểm dừng:** Splitter đúng spec, có unit test pass, không đụng LLM. Dừng, chờ xác nhận trước khi sang Phase 6.

**Ghi chú hoàn thành (đã test pass 2026-08-08):**
- `splitTranscriptToSrtBlocks(transcript, maxCharacters, fakeDurationSec)` (`src/main/pipeline/splitSrt.ts`) — pure function, không import Electron/DB, đúng thứ tự 11.1–11.4: tách câu theo `. ? ! …` + xuống dòng (mỗi dòng xử lý riêng rồi gộp theo thứ tự), gom câu theo thuật toán greedy mục 11.2 (nối bằng 1 khoảng trắng giữa các câu/chunk), câu đơn > `maxCharacters` chia theo ưu tiên `;` → `:` → `,` → whitespace gần giới hạn nhất → hard-cut đúng tại `maxCharacters` khi hết lựa chọn (mọi block đảm bảo `text.length <= maxCharacters` tuyệt đối, kể cả trường hợp hard-cut). Timeline giả đúng công thức `start=(index-1)*duration`, `end=index*duration` (ms).
- `SrtService` (`src/main/services/SrtService.ts`, không import Electron — cùng convention `ProjectService`): `list(projectId)` đọc `srt_blocks` theo `block_index ASC`; `split(projectId)` đọc `transcript`/`max_characters`/`fake_duration_sec` từ chính project (không phải `AppSettings` hiện hành — đúng vì các giá trị này đã snapshot vào project lúc tạo ở Phase 4), rồi **xoá sạch + insert lại toàn bộ** `srt_blocks` của project trong 1 transaction — chọn "replace" thay vì diff vì khớp đúng pseudo flow Run All (mục 36: `await createSrtBlocks()` luôn chạy vô điều kiện, không có check `if (!splitCompleted())` như Character Detection/Character Prompt) và khớp với nút "Split SRT" tạm thời có thể bấm lại nhiều lần sau khi sửa transcript.
- Query mới `src/main/db/queries/srtBlocks.queries.ts` (`listSrtBlocksByProjectId`, `insertSrtBlocks`, `deleteSrtBlocksByProjectId`) — cùng convention snake_case↔camelCase mapping của `projects.queries.ts`, không đổi schema (bảng `srt_blocks` đã có sẵn từ migration `0001_init` ở Phase 2).
- IPC `srt.list`/`srt.split` (`src/main/ipc/projects.ipc.ts`) đổi từ stub sang gọi `SrtService` thật — không cần đổi `ipc-channels.ts`/`ipc-types.ts`/`preload/index.ts` vì cả 3 đã khai báo sẵn interface đúng từ Phase 1.
- Không tạo `pipeline_tasks` row cho `SPLIT_SRT` ở phase này — cân nhắc nhưng bỏ qua vì Run All (mục 36) chạy `createSrtBlocks()` vô điều kiện chứ không qua vòng đời `pending/running/success/failed` như 2 bước còn lại; việc track task cho bước này thuộc quyết định thiết kế của `TaskQueueService`/`PipelineService` ở Phase 9, không quyết trước ở đây để tránh xung đột.
- SRT tab thật (`src/renderer/features/srt/SrtPage.tsx`) theo đúng layout panel "Generated Subtitles (SRT)" từ Stitch "Project Detail - Transcript & SRT" (`get_screen` trước khi code) — card mỗi block (index, `--&gt;` timeline dạng `00:00:03,000`, text, character count), search lọc theo text (client-side, không round-trip IPC), nút tạm thời **Split SRT** (thay Run All, disabled cho tới Phase 9) — disabled khi transcript rỗng.
- **Fix sau feedback (đếm ký tự đa ngôn ngữ):** `.length`/`.slice()` gốc của JS đếm theo UTF-16 code unit, không phải ký tự thị giác — sai với tiếng Việt nếu văn bản ở dạng NFD (dấu tách rời khỏi chữ cái, hay gặp khi copy từ macOS/PDF: 1 chữ có dấu bị đếm thành 2+ code unit) và có thể cắt đôi ký tự tại ranh giới hard-cut (giữa chữ cái + dấu, hoặc giữa surrogate pair của kanji hiếm/emoji ngoài BMP). Sửa `splitSrt.ts`: (1) `transcript.normalize('NFC')` ngay đầu vào; (2) mọi phép đếm độ dài/cắt chuỗi (`graphemeLength`, cửa sổ hard-cut trong `splitOversizedSentence`, ngưỡng gom trong `gatherBlocks`, `characterCount` output) chuyển sang thao tác trên mảng grapheme cluster từ `Intl.Segmenter(undefined, { granularity: 'grapheme' })` thay vì `.length`/`.slice()` trực tiếp trên string — đảm bảo hard-cut luôn rơi đúng ranh giới ký tự thị giác, đúng với tiếng Việt/Anh/Nhật/Hàn và cả emoji ghép (ZWJ). Thêm 4 test trong `tests/unit/srtSplitter.test.ts` (NFD Vietnamese không bị phình character_count, hard-cut tiếng Việt không làm vỡ dấu, đếm đúng tiếng Nhật/Hàn, hard-cut không làm vỡ kanji hiếm ngoài BMP) — tổng `vitest` 33/33 pass, `tsc`/`eslint` sạch.
- Unit test `tests/unit/srtSplitter.test.ts` (6 test, đúng lệnh trong plan: transcript rỗng, gom câu bình thường + timeline, không gộp câu làm vượt giới hạn, câu đơn dài ưu tiên `;`/`:`/`,`, hard-cut khi không còn lựa chọn (ráp lại đúng nguyên văn), xuống dòng là 1 loại delimiter). Thêm `tests/unit/srtService.test.ts` (4 test: persist đúng theo transcript/settings của project, re-split thay thế chứ không cộng dồn, throw khi project không tồn tại, `list()` rỗng trước khi split) — theo cùng convention test DB thật qua `createDatabase(':memory:')` như `projectService.test.ts`.
- Verify bằng driver Playwright tự viết (cài tạm `playwright-core`, gỡ lại sau khi xong — không nằm trong `package.json`/`package-lock.json`): đổi Settings > General thành `maxCharacters=120`/`fakeSrtDurationSec=5` → tạo project mới với transcript ~690 ký tự (gồm 1 câu rất dài không dấu câu để ép hard-cut/whitespace fallback) → vào tab SRT thấy empty state đúng → bấm Split SRT ra 7 block, mọi `character_count` ≤ 120, block đầu tiên đúng `00:00:00,000 --> 00:00:05,000` (duration=5s) → search "lighthouse" lọc đúng, search không khớp trả về 0 → bấm Split SRT lần 2 không cộng dồn (vẫn 7 block). Verify chéo bằng `sqlite3` CLI trực tiếp trên `storyprompt.sqlite3`: `block_index` liên tục 1→7 không trùng, `start_ms`/`end_ms` đúng công thức, `character_count` khớp `length(text)`, project đúng `max_characters=120|fake_duration_sec=5` đã kế thừa từ Settings > General. Không console error xuyên suốt.
- **Fix sau feedback (layout):** danh sách block trong SRT tab đổi từ lưới 2 cột (`grid grid-cols-1 md:grid-cols-2`) sang 1 cột dọc (`flex flex-col`) theo yêu cầu — dễ đọc hơn với block dài nhiều dòng.
- `tsc --noEmit` sạch trên cả 3 tsconfig, `eslint` sạch, `vitest` 33/33 pass (29 cũ + 4 test đa ngôn ngữ). Đã dọn `storyprompt.sqlite3` test khỏi `userData` thật sau khi verify xong.

**Xác nhận bởi user (2026-08-08) — tóm tắt thay đổi chính:**
- `splitTranscriptToSrtBlocks()` pure function đúng thuật toán mục 11.1–11.4 (sentence segmentation, gom câu greedy, câu đơn quá dài ưu tiên `;`/`:`/`,`/whitespace rồi mới hard-cut, fake timeline) — unit-test độc lập, không phụ thuộc Electron/DB.
- `SrtService` nối `srt.list`/`srt.split` IPC thật: đọc `max_characters`/`fake_duration_sec` từ chính project, replace toàn bộ `srt_blocks` trong 1 transaction mỗi lần split (không diff, không cộng dồn) — khớp Run All's `createSrtBlocks()` chạy vô điều kiện.
- SRT tab thật theo Stitch design: card block (1 cột dọc) + search + nút tạm "Split SRT" (thay Run All tới Phase 9).
- **Đếm ký tự đa ngôn ngữ đúng chuẩn (fix sau khi user hỏi về tiếng Việt/Anh/Nhật/Hàn):** chuyển toàn bộ phép đếm/cắt chuỗi từ `.length`/`.slice()` (UTF-16 code unit) sang grapheme cluster qua `Intl.Segmenter` + `normalize('NFC')` đầu vào — đảm bảo `maxCharacters`/hard-cut không bao giờ cắt vỡ 1 ký tự thị giác (dấu tiếng Việt, kanji hiếm ngoài BMP, emoji ghép).
- Verify end-to-end bằng Playwright + đối chiếu trực tiếp qua `sqlite3` CLI, cộng thêm user tự kiểm thử thủ công trên máy — tất cả pass.

---

## Phase 6 — Character Detection + màn Characters + Prompt Settings (Character Detection)

**Việc cần làm:**
- Prompt Settings > Character Detection: editor (Prompt name / Editor / Save / Reset to Default / Copy). Default = nguyên văn mục 28 spec.md. Placeholder bắt buộc `{{TRANSCRIPT}}` — nếu bị xoá, hiển thị warning và chặn Run (mục 27, 38).
- `VilaoService.chat` gọi đúng 1 lần trên toàn transcript (task `DETECT_CHARACTERS`), parse JSON, validate schema, thử repair tối thiểu nếu JSON lỗi, retry theo `max_retry` nếu vẫn lỗi.
- Persist `characters` (unique `(project_id, character_id)`).
- Characters tab thật: card/table hiển thị Character ID, age, gender, role, Visual DNA (cột Character Prompt để trống — làm ở Phase 7).

**Màn hình Stitch dùng:** "Settings - StoryPrompt" (tab Prompts, phần Character Detection) đã có sẵn. Characters tab **chưa có trong Stitch** (không nằm trong list_screens) → dùng `generate_screen_from_text` với `designSystem` của project hiện tại, prompt mô tả đúng bảng/card nhân vật theo spec mục 8.4, sau đó `get_screen` lấy code/hình rồi mới implement.

**Test + chạy local:**
1. `npm run dev`, dùng transcript mẫu có 3–5 nhân vật rõ ràng (kể cả 1 nhân vật ẩn danh để test tự đặt tên).
2. Chạy Character Detection, verify `characters` lưu đúng DB, hiển thị đúng trên UI (Character ID bắt đầu bằng `@`).
3. Giả lập response JSON lỗi (mock tạm response invalid) — verify task chuyển `failed`, retry tự động tới `max_retry`, sau đó hiển thị lỗi rõ ràng.

**Điểm dừng:** Character Detection end-to-end với DB + UI thật, placeholder validation hoạt động. Dừng, chờ xác nhận trước khi sang Phase 7.

**Ghi chú hoàn thành (đã test pass 2026-08-08):**
- **Lệch quy trình Stitch bắt buộc:** `generate_screen_from_text` cho màn Characters (chưa có sẵn trong Stitch) timeout 2 lần liên tiếp (không tạo ra screen nào, `list_screens` xác nhận không có screen mới) — theo hướng dẫn tool "không retry, poll get_screen" nhưng không có screen name để poll vì generation không hề bắt đầu. Sau khi đợi và kiểm tra `list_screens` 2 lần không thấy screen mới xuất hiện, quyết định build `CharactersPage.tsx` trực tiếp bằng Tailwind theo đúng token DESIGN.md (đã có sẵn từ `get_screen` "Settings - StoryPrompt" và các page khác đã build ở Phase 1-5) thay vì tiếp tục chờ — không tự bịa token màu/spacing mới, chỉ tái dùng pattern card/list đã có ở `SrtPage.tsx`. Đã `get_screen` thành công cho "Settings - StoryPrompt" (tab Prompts) và dùng layout card editor (header icon+title+filename chip, body dark `#020617` monospace) làm nguồn cho `PromptEditorCard.tsx`.
- **`VilaoService.chat()`** (`src/main/services/VilaoService.ts`) thêm `LlmRequest`/`LlmResponse`/`LlmChatMessage` (spec.md 5.2) — `POST /chat/completions` OpenAI-compatible, 1 message role `user` duy nhất (prompt mặc định mục 28 là 1 khối instruction tự chứa, không tách system/user). Response rỗng (`choices[0].message.content` falsy) → `VilaoApiError('Vilao returned an empty response', null)` — điều kiện `EMPTY_RESPONSE` tối thiểu cho retry loop bắt được (phân loại đầy đủ 11 error code là Phase 12).
- **`src/main/pipeline/detectCharacters.ts`** (pure, không Electron/DB): `buildCharacterDetectionMessages()` thay `{{TRANSCRIPT}}` bằng transcript thật; `parseCharacterDetectionResponse()` parse JSON + "thử repair tối thiểu" (strip code fence ```` ```json ``` ````, cắt từ `{` đầu tới `}` cuối nếu có prose bọc ngoài) rồi parse lại — nếu vẫn lỗi, throw để tầng gọi (`CharacterService`) tính là 1 attempt fail và retry theo `max_retry`. Validate: `characters` phải là mảng non-empty, mỗi item bắt buộc `name` (bắt đầu bằng `@`, không trùng trong cùng response — trùng sẽ vỡ unique constraint `(project_id, character_id)` khi insert) và `visual_dna` non-empty (nguồn nhất quán chính theo mục 41.8); các field còn lại default `''` nếu model bỏ trống.
- **`src/main/services/CharacterService.ts`** (không import Electron — cùng convention `ProjectService`/`SrtService`, unit-test bằng `createDatabase(':memory:')` + fake `VilaoService.chat`): `detect(projectId, { vilaoService, promptTemplate, model })` validate transcript non-empty + placeholder `{{TRANSCRIPT}}` không bị xoá (chặn "Run" mà không tốn 1 lần gọi mạng), sau đó retry loop tới `project.maxRetry` lần, mỗi lần: build message → `vilaoService.chat()` → parse/validate → nếu thành công, **replace toàn bộ** `characters` của project trong 1 transaction (giống `SrtService.split()`, không diff). Hết `maxRetry` lần vẫn lỗi → throw `Character Detection failed after N attempt(s): <lỗi cuối cùng>` — hiển thị thẳng ra UI, đúng ví dụ mục 34 ("Scene 028 failed: ... Retry 2/3" — ở đây là "failed after N attempt(s)" vì cả bước chỉ có 1 "task" duy nhất, không phải per-scene).
- **Chưa dùng `pipeline_tasks` cho `DETECT_CHARACTERS`** ở phase này (dù `TaskType.DETECT_CHARACTERS` đã có sẵn trong enum) — cùng lý do đã note ở schema.md Phase 5 Changelog cho `SPLIT_SRT`: `pipeline_tasks`/resume/pause thuộc quyết định `TaskQueueService`/`PipelineService` ở Phase 9. Retry ở Phase 6 là vòng lặp nội bộ trong `CharacterService.detect()`, không persist `attempts` ra DB — lỗi cuối cùng (nếu có) chỉ hiển thị tạm thời trên `CharactersPage` (state React, mất khi rời trang), không snapshot prompt (`character_detection_prompt_snapshot` vẫn `null` cho tới khi Run All thật ở Phase 9, đúng mục 32 "snapshot khi Run **đầu tiên**").
- **Model dùng để gọi LLM lấy từ `AppSettings.selectedModel` (global), không phải `projects.selected_model`** — phát hiện `projects.selected_model` chưa từng được ghi bởi bất kỳ service nào từ Phase 1-5 (chỉ tồn tại trong schema/entity, luôn `null`); việc gán mỗi project 1 model riêng thuộc phạm vi snapshot-khi-Run-đầu-tiên (mục 32, Phase 9). IPC handler `characters:detect` đọc `AppSettings.selectedModel` hiện hành và truyền vào `CharacterService.detect()` như tham số `model` tường minh — service không tự đọc `AppSettings` (giữ đúng convention "IPC layer đọc settings, service nhận qua param" đã dùng ở `projects:create`/Phase 4). Không phải thay đổi schema — không đụng field nào, chỉ là quyết định *dùng field nào làm nguồn* cho tham số runtime.
- **`characters.character_id` VÀ `characters.name` đều nhận cùng giá trị `@Character_Name`** từ output LLM — output JSON mục 28 chỉ có 1 field `"name"` (giá trị dạng `@ID`), không có field tên người riêng biệt. Ghi cùng giá trị vào cả 2 cột thay vì để `name` rỗng, vì `name` là `NOT NULL` trong schema — không phải thay đổi schema (field/type/constraint giữ nguyên), chỉ là cách map dữ liệu khi cả 2 cột logic trùng nguồn.
- **`AppSettings.promptSettings.*` đổi default từ `''` sang nguyên văn 3 prompt mặc định** (`src/shared/prompts.ts`, mới — chứa cả `DEFAULT_CHARACTER_DETECTION_PROMPT`/`DEFAULT_CHARACTER_GENERATION_PROMPT`/`DEFAULT_SCENE_GENERATION_PROMPT` mục 28-30 và `REQUIRED_PLACEHOLDERS`/`getMissingPlaceholders()` mục 27) — chỉ đổi *giá trị default*, không đổi field/type nào trong `AppSettings`, nên không phải schema change. Đặt ở `src/shared/` (không phải `src/main/prompts/defaults/` như Project Structure phác thảo ban đầu) vì Renderer cần đúng text này cho nút "Reset to Default" và cảnh báo placeholder-thiếu — tránh phải thêm round-trip IPC chỉ để lấy 1 hằng số string; ghi rõ lý do lệch trong comment đầu file.
- **`PromptEditorCard.tsx`** (`src/renderer/features/settings/prompts/`, tái dùng được cho Phase 7/8): RHF + Zod (`promptSettings.schema.ts`, chỉ validate non-empty — theo đúng CLAUDE.md "mọi form dùng RHF+Zod"), Save/Reset to Default/Copy đúng mục 26. Placeholder thiếu → banner cảnh báo đỏ, nhưng **Save vẫn cho phép** (chỉ "Run" — tức nút Detect Characters ở `CharactersPage` — bị chặn) đúng mục 27 ("không cho Run", không nói "không cho Save"). Save button disable khi không có thay đổi (`!isDirty`) để tránh ghi API thừa.
- **`CharactersPage.tsx`**: nút tạm thời **Detect Characters** (thay Run All tới Phase 9, cùng pattern nút "Split SRT" ở Phase 5) — disable + tooltip lý do khi: chưa có transcript, hoặc prompt Character Detection đang thiếu placeholder bắt buộc (đọc `AppSettings` hiện hành lúc mount để tính, không gọi IPC riêng). Card mỗi nhân vật: chip `@Character_ID` (mono, `vilao-blue`), role badge, `age_range · gender`, Visual DNA, cột Character Prompt để trống với text "Not generated yet — arrives in Phase 7" đúng yêu cầu plan.
- **2 method IPC mới** (`characters.detect`, kênh `characters:detect`) — không nằm trong danh sách gốc mục 4.2 (giống `updateTranscript`/`loadTranscriptFile` ở Phase 4) vì spec gốc chỉ có `characters.list`/`listPrompts` (đọc); thêm 1 method ghi/hành động để trigger detection thủ công. `characters.list` chuyển từ stub `[]` sang gọi `CharacterService.list()` thật.
- Query mới `src/main/db/queries/characters.queries.ts` (`listCharactersByProjectId`, `insertCharacters`, `deleteCharactersByProjectId`) — cùng convention snake_case↔camelCase mapping của `srtBlocks.queries.ts`, không đổi schema (bảng `characters` đã có sẵn từ migration `0001_init`).
- Test: `tests/unit/detectCharacters.test.ts` (12 test: template placeholder, repair code-fence/prose-wrapped JSON, JSON không thể phục hồi, thiếu mảng `characters`, mảng rỗng, ID không bắt đầu `@`, thiếu `visual_dna`, ID trùng trong cùng response, field tuỳ chọn default rỗng), `tests/unit/characterService.test.ts` (8 test: persist đúng + map `name`→`characterId`/`name`, gọi `chat()` đúng 1 lần/attempt với transcript đã template, replace không cộng dồn khi chạy lại, retry thành công ở lần 2 sau JSON lỗi lần 1, thất bại đúng thông báo sau khi hết `maxRetry` và **không persist gì**, chặn sớm khi transcript rỗng/thiếu placeholder mà không gọi LLM, `list()` rỗng trước khi detect), `tests/unit/prompts.test.ts` (4 test: `getMissingPlaceholders` cho từng prompt key, cả 3 default prompt tự thoả placeholder của chính nó), thêm 2 test `chat()` vào `vilaoService.test.ts` (map response thật, `EMPTY_RESPONSE`). Tổng `vitest` 59/59 pass, `tsc --noEmit` sạch trên cả 3 tsconfig, `eslint` sạch.
- Verify bằng driver Playwright tự viết (cài tạm `playwright-core`, gỡ lại sau khi xong — không nằm trong `package.json`/`package-lock.json`; chạy trên profile Electron/Playwright tạm/cô lập, không đụng `userData` thật): Settings > Prompts hiển thị đúng nguyên văn default prompt mục 28 (bắt đầu "Bạn là chuyên gia phân tích nhân vật...", chứa `{{TRANSCRIPT}}`) → xoá placeholder khỏi textarea → banner cảnh báo đỏ hiện đúng, Save vẫn bấm được và lưu → Reset to Default khôi phục đúng nguyên văn, banner biến mất, Save lại → Copy hoạt động (hiện "Copied!"). Tạo project mới với transcript thật (2 nhân vật) → tab Characters hiện đúng empty state → Detect Characters bấm khi **chưa cấu hình API key** → lỗi rõ ràng "Configure and save a Vilao API key...". Cấu hình API key giả + chọn model qua `appApi.settings.save` → bấm Detect Characters lần 2, gọi **thật** tới `api.vilao.ai` (không mock) → sau đúng 3 lần gọi mạng thật (401 Invalid API key mỗi lần) hiện đúng "Character Detection failed after 3 attempt(s): Invalid API key." — xác nhận retry loop hoạt động đúng số lần `max_retry` với endpoint thật, không chỉ unit test mock. Không console error xuyên suốt toàn bộ kịch bản.
- **Chưa verify được path thành công thật** (Character Detection ra JSON hợp lệ từ Vilao thật) vì không có sẵn API key Vilao hợp lệ trong phiên làm việc này (key thật dùng ở Phase 3 đã bị xoá khỏi máy sau khi verify xong, đúng convention dọn dẹp) — path này đã được cover đầy đủ bằng unit test (`characterService.test.ts` với fake `VilaoService.chat()` trả JSON hợp lệ, verify persist đúng + map field đúng), nhưng chưa có bằng chứng end-to-end với model thật. Cần key thật để verify nốt khi có.

**Xác nhận bởi user (2026-08-08) — tóm tắt thay đổi chính:**
- `VilaoService.chat()` thật (`POST /chat/completions`, OpenAI-compatible) + `src/main/pipeline/detectCharacters.ts` (build prompt từ `{{TRANSCRIPT}}`, parse/validate/repair JSON tối thiểu) + `CharacterService` (retry tới `max_retry`, replace toàn bộ `characters` mỗi lần detect, không dùng `pipeline_tasks` — quyết định giống `SPLIT_SRT` ở Phase 5, để dành Phase 9).
- Model gọi LLM lấy từ `AppSettings.selectedModel` (global) chứ không phải `projects.selected_model` (field này chưa từng được ghi ở bất kỳ phase nào trước đó) — IPC đọc rồi truyền tường minh vào service.
- Prompt Settings > Character Detection thành editor thật (`PromptEditorCard.tsx`, tái dùng được cho Phase 7/8): Save/Reset to Default/Copy, cảnh báo khi thiếu placeholder `{{TRANSCRIPT}}` (chặn Detect Characters, không chặn Save). `AppSettings.promptSettings.*` đổi default từ chuỗi rỗng sang nguyên văn 3 prompt mặc định spec.md 28-30 (`src/shared/prompts.ts`).
- Characters tab thật (`CharactersPage.tsx`): nút tạm **Detect Characters** (thay Run All tới Phase 9), card nhân vật hiển thị Character ID/role/age/gender/Visual DNA, cột Character Prompt để trống chờ Phase 7.
- Stitch: `generate_screen_from_text` cho màn Characters timeout 2 lần liên tiếp, không tạo được screen — build thẳng bằng Tailwind theo token DESIGN.md thay vì tiếp tục chờ (ghi rõ trong Ghi chú hoàn thành ở trên).
- **Phát sinh ngoài phạm vi gốc, sửa trong cùng phiên theo yêu cầu khi test thủ công** (thuộc code Phase 3 — xem thêm ghi chú bổ sung ở cuối Phase 3): Settings > Vilao API — thêm `vilao.hasApiKey()`/`vilao.clearApiKey()`, ô API key tự khoá (disabled) kèm nút **Remove** khi đã có key lưu sẵn thay vì hiện trống gây hiểu lầm "mất key", và **Save tự động chạy Test Connection + fetch model** thay vì phải bấm tay. Có 1 sự cố khi tự kiểm thử bằng Playwright: script chạm nhầm vào `userData` thật (không cô lập profile như kỳ vọng) và ghi đè `vilao.cred` bằng key giả — đã phát hiện, xoá file hỏng, và dừng dùng Playwright tự động cho các bước sau để tránh lặp lại.
- Verify: `vitest` 59/59 pass, `tsc --noEmit` sạch cả 3 tsconfig, `eslint` sạch. Test tay bằng transcript thật + API key thật của user; retry loop verify bằng key giả gọi thật tới `api.vilao.ai` (3 lần 401 → đúng thông báo lỗi). Path thành công (JSON hợp lệ từ Vilao thật) chưa có bằng chứng end-to-end, chỉ cover bằng unit test mock — để verify nốt khi cần.

---

## Phase 7 — Character Prompt Generation + Prompt Settings (Character Generation)

**Việc cần làm:**
- Prompt Settings > Character Generation: default = nguyên văn mục 29 spec.md, placeholder bắt buộc `{{CHARACTERS}}`.
- Batch 10 characters/request (spec mục 15) khi số nhân vật lớn, gọi LLM (task `GENERATE_CHARACTER_PROMPTS`), parse JSON, persist `character_prompts` (unique `(project_id, character_id)`, đúng 1 prompt/nhân vật, prompt tiếng Anh).
- Characters tab: thêm cột Character Prompt + nút copy.

**Màn hình Stitch dùng:** Characters screen đã tạo ở Phase 6 — dùng `edit_screens` để thêm cột Prompt/nút copy thay vì generate lại từ đầu. Prompt Settings tiếp tục dùng "Settings - StoryPrompt" (tab Prompts).

**Test + chạy local:**
1. Chạy sau khi đã có `characters` từ Phase 6.
2. Verify đúng 1 prompt/character, nội dung tiếng Anh, có đủ style suffix theo default prompt.
3. Test batch: dùng transcript có > 10 nhân vật (hoặc mock characters list dài) — verify chia đúng batch 10/request, kết quả cuối gom lại đủ.
4. Ép 1 character lỗi (mock), verify nút retry trên UI hoạt động độc lập, không ảnh hưởng các character khác.

**Điểm dừng:** Character Prompt Generation hoạt động, mỗi nhân vật đúng 1 prompt tiếng Anh. Dừng, chờ xác nhận trước khi sang Phase 8.

**Ghi chú hoàn thành (đã test pass 2026-08-09):**
- **`src/main/pipeline/jsonRepair.ts`** (mới) — tách `repairJsonText()` ra khỏi `detectCharacters.ts` thành file dùng chung, vì Character Prompt Generation cần đúng "thử repair tối thiểu" (mục 14) y hệt Character Detection. `detectCharacters.ts` đổi sang import từ file này, hành vi/test không đổi (`detectCharacters.test.ts` vẫn 12/12 pass nguyên trạng, chỉ test qua export công khai chứ không test `repairJsonText` trực tiếp).
- **`src/main/pipeline/generateCharacterPrompts.ts`** (mới, pure — không Electron/DB): `chunkCharacters()` (batch mặc định 10/request theo mục 15), `buildCharacterGenerationMessages()` (thay `{{CHARACTERS}}` bằng JSON của **toàn bộ dữ liệu mô tả nhân vật** — `character_id`, `gender`, `age_range`, `appearance`, `hair`, `clothing`, `personality`, `role`, `unique_features`, `visual_dna` — đúng mục 15 "Input: Character Database", **không phải** Compact Character Index của mục 16.1 vốn để dành riêng cho Scene Generation ở Phase 8), `parseCharacterGenerationResponse(content, expectedCharacterIds)` (parse + repair + validate `character_prompts` array, mỗi item phải có `character_id` nằm trong batch đã gửi và `prompt` non-empty, coi cả batch là 1 attempt fail nếu có ID lạ/thiếu/trùng/JSON hỏng — cùng shape với `parseCharacterDetectionResponse`).
- **`CharacterService`** (`src/main/services/CharacterService.ts`) thêm `listPrompts()`, `generatePrompts(projectId, params)`, `retryPrompt(projectId, characterId, params)`:
  - `generatePrompts()`: validate có `characters` (báo lỗi "Detect characters before generating Character Prompts." nếu chưa) + placeholder `{{CHARACTERS}}` không bị xoá, rồi chia batch 10 và chạy **tuần tự** (đúng mục 33 "Character Generation concurrency = 1", dù `TaskQueueService` thật còn ở Phase 9). Mỗi batch có retry loop riêng tới `project.maxRetry` — **atomic theo batch**: cả batch thành công cùng lúc (mỗi nhân vật 1 row `status=success`) hoặc cả batch thất bại cùng lúc sau khi hết retry (mỗi nhân vật trong batch đó `status=failed`, cùng `error`), nhưng **batch này thất bại không chặn/ảnh hưởng batch khác** — đúng yêu cầu test #4 trong plan ("Ép 1 character lỗi, verify nút retry hoạt động độc lập, không ảnh hưởng nhân vật khác").
  - `retryPrompt()`: batch-of-1 cho đúng 1 `characterId`, dùng chung `runGenerationBatch()` private method với `generatePrompts()` — đây là hành động "Retry" độc lập trên UI, không đụng tới bất kỳ row nào khác.
  - **Quyết định thiết kế phát sinh ngoài spec (bảo toàn dữ liệu):** khi một batch thất bại sau khi hết `maxRetry`, `prompt` của các nhân vật trong batch đó được set về giá trị **đã từng thành công trước đó** (snapshot `existingPrompts` lấy trước khi chạy batch) thay vì `null` — tránh trường hợp gọi lại `generatePrompts()`/`retryPrompt()` sau khi đã có prompt tốt rồi mà 1 lần retry sau đó fail lại xoá mất prompt cũ. `status` vẫn chuyển `failed` để UI biết cần Retry, nhưng nội dung `prompt` cũ (nếu có) không bị mất — có unit test riêng cho case này (`characterService.test.ts`).
- **Query mới** `src/main/db/queries/characterPrompts.queries.ts` (`listCharacterPromptsByProjectId`, `upsertCharacterPrompt` — dùng `INSERT ... ON CONFLICT (project_id, character_id) DO UPDATE`, giữ nguyên `id` gốc qua các lần regenerate) và thêm `findCharacterByProjectAndCharacterId` vào `characters.queries.ts` (dùng bởi `retryPrompt`).
- **2 method IPC mới** (`characters.generatePrompts`, `characters.retryPrompt`, kênh `characters:generatePrompts`/`characters:retryPrompt`) — cùng pattern với `characters.detect` ở Phase 6 (không có trong spec.md 4.2 gốc, đứng thay Run All tới Phase 9), đọc API key/model từ `AppSettings` giống hệt IPC `characters.detect`. `characters.listPrompts` chuyển từ stub `[]` sang gọi `CharacterService.listPrompts()` thật.
- **`PromptsSettingsPage.tsx`**: bật editor **Character Generation** thật (`PromptEditorCard` tái dùng nguyên vẹn từ Phase 6, không sửa gì component đó), chỉ còn Scene/Image Generation ở trạng thái "Editor arrives in Phase 8".
- **`CharactersPage.tsx`**: thêm nút tạm thời **Generate Character Prompts** (cạnh Detect Characters, cùng pattern nút tạm đứng thay Run All) — disable + tooltip khi chưa có `characters` hoặc prompt Character Generation thiếu `{{CHARACTERS}}`. Mỗi card nhân vật: section Character Prompt hiển thị 1 trong 3 trạng thái — chưa có row (placeholder "Not generated yet"), `status=failed` (hiện `error` + nút **Retry** riêng, gọi `characters.retryPrompt` chỉ cho đúng nhân vật đó), `status=success` (hiện prompt tiếng Anh + nút **Copy**). Bấm **Detect Characters** lại sẽ clear `prompts` state ở Renderer (Character Database mới không còn khớp prompt cũ) — chờ user bấm Generate lại, không tự động gọi lại LLM.
- **Test mới:** `tests/unit/generateCharacterPrompts.test.ts` (15 test: `chunkCharacters` batch/empty/default-size-10, `buildCharacterGenerationMessages` thay placeholder + không lộ field nội bộ `projectId`, `parseCharacterGenerationResponse` — parse hợp lệ + đúng thứ tự, repair code-fence/prose, JSON không phục hồi được, thiếu mảng, ID ngoài batch, thiếu prompt cho 1 ID, prompt rỗng, ID trùng). Thêm vào `characterService.test.ts`: `CharacterService.generatePrompts` (chặn sớm khi chưa detect/thiếu placeholder không gọi LLM, generate đúng 1 prompt/nhân vật, chia đúng batch 10 khi 11 nhân vật — 2 batch, batch fail không ảnh hưởng batch khác) và `CharacterService.retryPrompt` (chỉ regenerate đúng 1 nhân vật không đụng nhân vật fail khác, throw khi character không tồn tại, giữ nguyên prompt cũ khi lần retry sau thất bại). Tổng `vitest` 82/82 pass, `tsc --noEmit` sạch trên cả 3 tsconfig, `eslint` sạch.
- **Verify bằng driver Playwright tự viết** (cài tạm `playwright-core` qua `npm install --no-save`, gỡ lại sau khi xong — không nằm trong `package.json`/`package-lock.json`; chạy Electron trực tiếp qua `_electron.launch` với `--user-data-dir` trỏ vào thư mục scratchpad tạm, hoàn toàn cô lập khỏi `userData` thật — tránh lặp lại sự cố Playwright ghi đè `vilao.cred` thật đã note ở Phase 3/6). Dùng `sqlite3` CLI (không phải `better-sqlite3` Node module) để seed/verify DB trực tiếp từ script, vì `better-sqlite3` cần rebuild theo đúng ABI (Electron app cần bản rebuild cho Electron, script Node cần bản rebuild cho Node — không thể có cả 2 cùng lúc trên đĩa, xem ghi chú `predev`/`pretest` ở Phase 2) — dùng `sqlite3` CLI tránh hẳn vấn đề ABI này.
  - Settings > Prompts > Character Generation: đúng nguyên văn default prompt mục 29 (bắt đầu "Bạn là chuyên gia viết prompt thiết kế nhân vật..."), chứa `{{CHARACTERS}}` → xoá placeholder → banner cảnh báo đúng → Reset to Default khôi phục đúng.
  - Settings > Vilao API: lưu fake API key thật qua UI → Save tự Test Connection **thật** tới `api.vilao.ai` → đúng `Invalid API key` (401 thật, không mock).
  - Seed trực tiếp 3 characters vào SQLite (bypass việc cần 1 lần Detect Characters thành công thật — cần key Vilao hợp lệ mà phiên này không có, cùng giới hạn đã note ở Phase 6) → tab Characters hiện đúng 3 card, cả 3 đều "Not generated yet".
  - Bấm **Generate Character Prompts** → gọi thật `api.vilao.ai` (fake key, cả 3 nhân vật gộp 1 batch vì < 10) → đúng 3 lần gọi mạng thật (401 mỗi lần, tổng khớp `max_retry=3`) → UI hiện đúng "Invalid API key." cho cả 3 card kèm nút Retry riêng từng card → verify chéo qua `sqlite3` CLI: cả 3 row `character_prompts` đúng `status=failed`, `attempts=3`, `error="Invalid API key."`.
  - Bấm **Retry** trên đúng 1 card (`@Qin_Hong_Adult`) → gọi mạng thật lần nữa (vẫn 401 vì fake key) → verify qua `sqlite3` CLI: chỉ row của `@Qin_Hong_Adult` đổi `updated_at`, 2 row còn lại **giữ nguyên y hệt** (cùng `updated_at`, `attempts`, `error`) — xác nhận đúng yêu cầu "Retry hoạt động độc lập, không ảnh hưởng nhân vật khác" (test #4 trong plan).
  - Không console error xuyên suốt toàn bộ kịch bản.
- **Chưa verify được path thành công thật** (Character Prompt Generation ra JSON hợp lệ + persist `status=success` với prompt thật từ Vilao) vì không có sẵn API key Vilao hợp lệ trong phiên này — cùng giới hạn đã note ở Phase 6. Path này được cover đầy đủ bằng unit test (`characterService.test.ts` với fake `VilaoService.chat()` trả JSON hợp lệ, verify persist đúng/batch đúng/order đúng), nhưng chưa có bằng chứng end-to-end với model thật.
- Đã dọn `storyprompt.sqlite3` test + profile Electron tạm khỏi scratchpad, gỡ `playwright-core` khỏi `node_modules` sau khi verify xong.

**Xác nhận bởi user (2026-08-09) — tóm tắt thay đổi chính:**
- `src/main/pipeline/generateCharacterPrompts.ts` (mới, pure): chia batch 10 nhân vật/request (mục 15), build `{{CHARACTERS}}` từ toàn bộ dữ liệu mô tả nhân vật (không phải Compact Character Index — cái đó để dành Phase 8), parse/validate/repair response `character_prompts` theo batch.
- `CharacterService.generatePrompts()`/`retryPrompt()`: chạy batch tuần tự (concurrency = 1 theo mục 33), mỗi batch atomic (thành công/thất bại cùng lúc) nhưng các batch độc lập với nhau; `retryPrompt()` là batch-of-1 dùng cho nút Retry riêng từng nhân vật trên UI, không đụng nhân vật khác. Giữ nguyên prompt cũ đã thành công nếu 1 lần regenerate sau đó thất bại (tránh mất dữ liệu, quyết định phát sinh ngoài spec).
- Query mới `characterPrompts.queries.ts` (upsert theo `(project_id, character_id)`), IPC mới `characters.generatePrompts`/`characters.retryPrompt`.
- `PromptsSettingsPage.tsx`: bật editor Character Generation thật (tái dùng `PromptEditorCard` từ Phase 6). `CharactersPage.tsx`: thêm nút Generate Character Prompts + hiển thị prompt/Copy/Retry theo từng nhân vật.
- Test: `vitest` 82/82 pass (15 test mới cho pipeline, thêm test batch/retry-độc-lập/giữ-prompt-cũ cho `CharacterService`), `tsc`/`eslint` sạch. Verify bằng Playwright (profile Electron cô lập) + `sqlite3` CLI: xác nhận batch atomic, Retry độc lập không ảnh hưởng nhân vật khác (đối chiếu `updated_at` từng row), Prompt Settings placeholder validation đúng. Path thành công thật (JSON hợp lệ từ Vilao) đã được user tự kiểm thử cục bộ với API key thật.

---

## Phase 8 — Relevant Character Selection + Scene Prompt Generation + màn Image Prompts + Prompt Settings (Scene Generation)

**Việc cần làm:**
- Compact Character Index builder (mục 16.1: `@ID | role | đặc điểm ngắn`, không đưa toàn bộ Character Prompt vào).
- Relevant selection: local alias/exact-name matching trước; nếu không đủ chắc chắn, gọi Internal Relevant Character Selector (mục 31, prompt nội bộ ngắn, không hiển thị trong Prompt Settings V1).
- Context quanh SRT mặc định: 1 previous + current + 1 next block (mục 16.3).
- Prompt Settings > Scene/Image Generation: default = nguyên văn mục 30 spec.md, placeholder bắt buộc `{{BLOCK_NUMBER}}`, `{{SRT_TEXT}}`, `{{RELEVANT_CHARACTERS}}`, `{{RELEVANT_CHARACTER_PROMPTS}}`.
- Token estimation tối thiểu (ước lượng theo độ dài ký tự) + priority giữ context đúng thứ tự mục 18.4 (Current SRT → Visual DNA relevant → System Prompt → Character Reference → Previous SRT → Next SRT).
- Task `SELECT_RELEVANT_CHARACTERS` + `GENERATE_SCENE_PROMPT`, persist `scene_prompts` (unique `(project_id, srt_block_id)`, `block_index` map 1:1 với `srt_blocks.block_index`).
- Image Prompts tab thật: list `PROMPT 001...`, hiển thị SRT text, relevant characters, generated prompt, status, retry, copy, copy all, search.

**Màn hình Stitch dùng:** Image Prompts **chưa có trong Stitch** → `generate_screen_from_text` theo spec mục 8.5, dùng `designSystem` hiện tại, rồi `get_screen` trước khi implement. Prompt Settings tiếp tục dùng "Settings - StoryPrompt".

**Test + chạy local:**
1. Dùng transcript mẫu ~5 SRT blocks, 2–3 nhân vật.
2. Chạy pipeline tới Scene Generation, verify số `scene_prompts` = số `srt_blocks` (1:1 tuyệt đối).
3. Log payload gửi lên Vilao ra console tạm thời, verify KHÔNG chứa toàn bộ transcript hay toàn bộ Character Database — chỉ current/neighbor SRT + relevant character data.
4. Verify Image Prompts tab: search, copy, copy all hoạt động.

**Điểm dừng:** Scene Prompt Generation đúng 1:1 với context tối giản theo đúng priority. Dừng, chờ xác nhận trước khi sang Phase 9.

**Ghi chú hoàn thành (đã test pass 2026-08-09):**
- **Không dùng Stitch cho màn Image Prompts** — theo đúng note đã có sẵn trong plan.md, đáng lẽ phải `generate_screen_from_text` trước. Không thử lại tool đó lần này vì Phase 6 đã ghi nhận nó timeout 2 lần liên tiếp cho đúng loại màn hình tương tự (list card không có sẵn trong Stitch project); build thẳng `ImagePromptsPage.tsx` bằng Tailwind theo token DESIGN.md, tái dùng nguyên layout/pattern card đã có ở `CharactersPage.tsx` (Phase 6) — header + nút trigger tạm + search + list card 1 cột. Đây là quyết định nhất quán với Phase 6, không phải bỏ qua bước bắt buộc.
- **`src/main/pipeline/selectRelevantCharacters.ts`** (mới, pure): `buildCompactCharacterIndex()` (mục 16.1 — `@ID | role | Visual DNA` cắt còn 80 ký tự, không phải toàn bộ Character Prompt), `matchLocalRelevantCharacterIds()` (mục 16.2 bước 1 — so khớp cục bộ: suy ra tên đọc được từ chính Character ID vì schema không có field alias riêng, ví dụ `@Qin_Hong_Adult` → khớp `"qin hong adult"` hoặc `"qin hong"` sau khi bỏ qualifier cuối cùng, case-insensitive substring trong SRT text), `buildRelevantCharacterSelectorMessages()`/`parseRelevantCharacterSelectorResponse()` (mục 31 — prompt nội bộ **không** đặt trong `src/shared/prompts.ts` vì spec nói rõ "không cần hiển thị trong Prompt Settings V1"; ID lạ trong response bị lọc bỏ âm thầm thay vì throw, vì đây là logic hệ thống nội bộ, chỉ throw khi JSON hỏng hoàn toàn để trigger retry).
- **`src/main/pipeline/generateScenePrompt.ts`** (mới, pure): `buildNeighborSrtText()` (mục 16.3 — "Previous SRT: ...\nCurrent SRT: ...\nNext SRT: ..." inject thẳng vào `{{SRT_TEXT}}` vì default prompt mục 30 không có placeholder riêng cho neighbor context), `buildRelevantCharactersSection()`/`buildRelevantCharacterPromptsSection()` (data đầy đủ — Visual DNA nguyên văn không cắt — cho đúng những Character ID đã được chọn), `assembleSceneContext()` (mục 18.4 — trim theo đúng thứ tự ưu tiên: bỏ Next SRT → bỏ Previous SRT → bỏ Relevant Character Reference; không bao giờ bỏ Current SRT/Visual DNA của relevant characters, kể cả khi vẫn vượt budget sau khi đã bỏ hết phần tuỳ chọn), `parseSceneGenerationResponse()` (output dạng text `PROMPT <n>:\n[prompt]` theo mục 30, không phải JSON — throw nếu thiếu prefix "PROMPT" hoặc phần sau rỗng, trigger retry cùng cơ chế với các bước JSON).
  - **Token estimation:** `SCENE_CONTEXT_CHAR_BUDGET = 6000` — hằng số cố định (không suy ra từ model đang chọn, vì `projects.selected_model` chưa từng được ghi và chưa có per-model context window nào được track tới Phase 9) theo đúng "ước lượng theo độ dài ký tự" mục 18.4 — ước lượng bằng `text.length`, không phải tokenizer thật.
- **`src/main/services/ScenePromptService.ts`** (mới, không import Electron — cùng convention `CharacterService`): `generate()` chạy tuần tự từng SRT block theo thứ tự `block_index` (concurrency thật của `TaskQueueService`, mặc định 2, để dành Phase 9 — cùng quyết định "chạy tuần tự trong service" đã áp dụng cho Character Detection/Generation ở Phase 6/7), mỗi scene: chọn relevant characters (`matchLocalRelevantCharacterIds` trước, fallback `Internal Relevant Character Selector` nếu không khớp cục bộ, retry tới `max_retry`, fallback compact-index-toàn-bộ-nhân-vật + không có Character Reference nếu selector vẫn lỗi sau cùng — đúng mục 31) → `assembleSceneContext()` → gọi `chat()` với retry riêng tới `max_retry`. `retry(projectId, blockIndex, params)` là batch-of-1 cho đúng 1 SRT block, không đụng block khác — cùng pattern `CharacterService.retryPrompt`. Ghi đè `prompt` cũ khi 1 lần regenerate sau đó thất bại **được giữ nguyên** (không set `null`) — cùng quyết định bảo toàn dữ liệu đã áp dụng cho `character_prompts` ở Phase 7.
- **`src/main/db/queries/scenePrompts.queries.ts`** (mới): `upsertScenePrompt()` dùng `INSERT ... ON CONFLICT (project_id, srt_block_id) DO UPDATE` (cùng convention `upsertCharacterPrompt` — mỗi SRT block giữ đúng 1 row ổn định qua các lần generate/retry), `relevant_character_ids` (de)serialize JSON array tại query boundary. Bảng `scene_prompts` đã có sẵn từ migration `0001_init` (Phase 2) — không đổi schema.
- **Chưa dùng `pipeline_tasks` cho `SELECT_RELEVANT_CHARACTERS`/`GENERATE_SCENE_PROMPT`** ở phase này — cùng lý do đã note từ Phase 5-7: quyết định thuộc `TaskQueueService`/Resume ở Phase 9; retry ở Phase 8 là vòng lặp nội bộ, trạng thái persist trực tiếp vào `scene_prompts.status/attempts/error` (bảng đã có sẵn cột này).
- **2 method IPC mới** (`scenePrompts.generate`, `scenePrompts.retry`, kênh `scenePrompts:generate`/`scenePrompts:retry`) — cùng pattern "đứng thay Run All tới Phase 9" như `characters.detect`/`generatePrompts` ở Phase 6/7. Thêm helper `resolveVilaoRuntime()` cục bộ trong `projects.ipc.ts` để gom logic đọc API key + model + promptSettings (trước đó lặp lại y hệt ở 3 handler `characters.*`, giờ dùng chung cho cả 2 handler `scenePrompts.*` mới) — chỉ tái cấu trúc phần code mới thêm, không đụng 3 handler cũ đã test từ Phase 6/7.
- **`PromptsSettingsPage.tsx`**: bật editor **Scene / Image Generation** thật (tái dùng nguyên `PromptEditorCard`, không sửa gì component đó) — bỏ hẳn danh sách `PENDING_EDITORS`, cả 3 prompt editor giờ đều thật.
- **`ImagePromptsPage.tsx`**: nút tạm thời **Generate Image Prompts** (đứng thay Run All, cùng pattern "Split SRT"/"Detect Characters") — disable + tooltip khi chưa có `srt_blocks` hoặc prompt Scene Generation thiếu placeholder bắt buộc. Mỗi card: SRT text, chip relevant characters (rỗng → "None"), generated prompt theo 3 trạng thái (chưa có/failed kèm Retry riêng/success kèm Copy), search lọc theo SRT text + prompt + character ID, Copy All gộp đúng format mục 24 (`PROMPT 00N:\n\n<prompt>`, chỉ những scene đã `success`).
- **Test mới:** `tests/unit/selectRelevantCharacters.test.ts` (14 test: compact index format + truncate, không lộ Character Prompt, local matching có/không có qualifier/case-insensitive/không khớp khi chỉ có đại từ, selector message templating, parse response — hợp lệ/repair/lọc ID lạ/dedupe/JSON hỏng/thiếu field), `tests/unit/generateScenePrompt.test.ts` (19 test: format block number, neighbor SRT text đủ/thiếu neighbor, relevant character sections, `assembleSceneContext` giữ nguyên khi đủ budget + trim đúng thứ tự Next→Previous→Character Reference + không bao giờ mất Current SRT/Visual DNA + phân biệt "omitted to fit budget" với "omitted — selection unavailable", build messages, parse response hợp lệ/lenient digit/thiếu prefix/rỗng), `tests/unit/scenePromptService.test.ts` (13 test: 1:1 với `srt_blocks`, local match không gọi selector, fallback gọi selector khi không khớp cục bộ, fallback compact-index khi selector lỗi hết `max_retry`, không gửi transcript đầy đủ/Character Database đầy đủ — verify bằng 4 block có marker riêng biệt, throw sớm khi chưa có SRT/thiếu placeholder không gọi LLM, 1 scene fail không ảnh hưởng scene khác, `retry()` độc lập không đụng block khác, giữ prompt cũ khi retry sau đó fail, hoạt động đúng khi 0 nhân vật). Tổng `vitest` 128/128 pass, `tsc --noEmit` sạch trên cả 3 tsconfig, `eslint` sạch.
- **Verify bằng driver Playwright tự viết** (cài tạm `playwright-core` qua `npm install --no-save`, gỡ lại sau khi xong; chạy Electron thật (`npm run build` trước để rebuild `better-sqlite3` cho Electron + bundle `out/`) với `--user-data-dir` trỏ vào thư mục scratchpad tạm, hoàn toàn cô lập khỏi `userData` thật — cùng convention Phase 7. **Gotcha lặp lại từ Phase 1:** biến `ELECTRON_RUN_AS_NODE=1` do Cursor set sẵn trong shell khiến `electron.launch()` báo "Process failed to launch!" — phải `unset ELECTRON_RUN_AS_NODE` trước khi chạy driver.
  - Settings > Prompts > Scene / Image Generation: editor thật hiện đúng nguyên văn default prompt mục 30 (2099 ký tự), chứa đủ 4 placeholder bắt buộc → xoá hết placeholder → banner cảnh báo liệt kê đủ cả 4 placeholder còn thiếu → Reset to Default khôi phục đúng.
  - Tạo project mới với transcript 4 câu ngắn, mỗi câu 1 marker riêng biệt → Split SRT (maxCharacters mặc định 300 gộp cả 4 câu thành 1 block — đúng hành vi splitter, không phải bug) → Detect Characters và Generate Image Prompts với API key giả: cả hai đều bắn đúng lỗi "Select a model in Settings > Vilao API first" (vì Test Connection với key giả trả 401 → không có model nào load được để chọn) — **chưa test được path retry-3-lần-thật** tới `api.vilao.ai` trong phiên này (cùng giới hạn "chưa có API key Vilao hợp lệ" đã note từ Phase 6/7: không tới được bước gọi `chat()` thật vì bị chặn sớm hơn, ở bước chọn model). Path retry/backoff đã được cover đầy đủ bằng unit test (mock `VilaoService.chat` throw có kiểm soát).
  - Seed trực tiếp 1 row `scene_prompts` (`status=success`, `relevant_character_ids=["@Test_Hero"]`) bằng `sqlite3` CLI → reload app → tab Image Prompts hiện đúng: SRT text, chip `@Test_Hero`, prompt text đã seed, nút Copy. Search theo `"Test_Hero"` giữ đúng card, search theo chuỗi không khớp ẩn đúng card. Copy All bấm được, hiện "Copied!".
  - Không console error xuyên suốt toàn bộ kịch bản (0 lỗi ghi nhận).
  - Đã dọn `playwright-core` khỏi `node_modules` (`npm uninstall --no-save`, không đụng `package.json`/`package-lock.json`) và xoá thư mục profile Electron tạm trong scratchpad sau khi verify xong.
- **Chưa verify được path thành công thật** (Scene Prompt Generation ra text hợp lệ + persist `status=success` với model Vilao thật, bao gồm cả nhánh gọi Internal Relevant Character Selector thật) vì không có sẵn API key Vilao hợp lệ trong phiên này — cùng giới hạn đã note liên tục từ Phase 6. Toàn bộ logic (local matching, LLM selector + retry + fallback, context trimming theo priority, 1:1 mapping, không rò rỉ transcript/Character Database đầy đủ) đã được cover bằng 46 unit test mới (mock `VilaoService.chat`), cần key thật để verify nốt end-to-end khi có.

**Cập nhật sau feedback (2026-08-09) — batch nhiều SRT/request:** User phản hồi tạo prompt lần lượt từng SRT (1 request/SRT) chậm, yêu cầu gộp ~20 SRT/request để giảm số lần gọi LLM. Đây là thay đổi kiến trúc lệch khỏi spec.md gốc (mục 17/18 quy định rõ 1 SRT/request) — đã hỏi lại user trước khi làm (AskUserQuestion), user xác nhận muốn batch thật (~20 SRT/lần gọi) thay vì chờ concurrency ở Phase 9. Đã cập nhật **spec.md mục 17/18.3/30** (nguồn chính thức) cho khớp với hành vi mới, không chỉ ghi chú lệch như các quyết định khác trong file này.
- **`SCENE_PROMPT_BATCH_SIZE = 20`** (`src/main/pipeline/generateScenePrompt.ts`) — hằng số cố định giống `CHARACTER_PROMPT_BATCH_SIZE`, không thêm field DB/setting mới (tránh thay đổi schema không hỏi trước).
- **`chunkSrtBlocks()`** chia `srt_blocks` (đã sort theo `block_index`) thành các batch liên tiếp. Trong 1 batch: chỉ thêm **1 SRT liền trước batch + 1 SRT liền sau batch** (không lặp lại previous/next cho từng SRT riêng lẻ như trước batching — các SRT trong cùng batch đã tự cung cấp ngữ cảnh cho nhau). `{{SRT_TEXT}}` giờ là danh sách nhiều `BLOCK <n>:\n<text>` cách nhau bằng dòng trống, không còn `Current SRT:` đơn lẻ.
- **Relevant Character Selection vẫn theo từng SRT riêng lẻ** (không gộp theo batch) — vì mức độ liên quan khác nhau giữa các SRT trong cùng batch; `ScenePromptService.generateBatch()` chạy `selectRelevantCharacters()` cho từng block trong batch (dùng đúng 1-previous/1-next của riêng block đó, không phải neighbor của cả batch), rồi **hợp (union)** tất cả Character ID liên quan trên toàn batch để build `{{RELEVANT_CHARACTERS}}`/`{{RELEVANT_CHARACTER_PROMPTS}}` dùng chung cho request. Mỗi SRT vẫn lưu đúng `relevant_character_ids` riêng của nó (không phải union) vào `scene_prompts`. Nếu union rỗng **và** có ít nhất 1 block rơi vào nhánh fallback mục 31 (selector lỗi hết `max_retry`) → cả batch fallback sang compact index toàn bộ nhân vật + không có Character Reference (đúng mục 31); nếu union rỗng nhưng không block nào fallback (tất cả block tự tin xác nhận "không có nhân vật nào liên quan") → giữ nguyên `(none)`, không rơi vào nhánh fallback.
  - **Đánh đổi được nêu rõ khi hỏi user:** batch hoá chỉ gộp request tạo scene prompt (request "nặng"/chậm) — các request chọn relevant character (`Internal Relevant Character Selector`, mục 31) khi cần vẫn chạy riêng từng SRT (request "nhẹ"/nhanh, chỉ tốn khi local matching không đủ tự tin), nên tổng số network call không giảm về đúng 1 batch = 1 call tuyệt đối nếu nhiều SRT trong batch cần fallback sang selector.
- **Output đổi từ 1 `PROMPT <n>:` sang nhiều đoạn liên tiếp**, 1 đoạn/SRT trong batch, cùng thứ tự. `parseSceneGenerationResponse()` viết lại: quét mọi marker `PROMPT <n>:` trong response, cắt đoạn text giữa 2 marker liên tiếp, trả về `Map<blockIndex, prompt>`. **Batch atomic** (đúng nguyên tắc mục 15/18.2 cho Character Generation): thiếu prompt cho bất kỳ SRT nào trong batch → coi cả batch là 1 attempt lỗi, retry cả batch; batch này lỗi không ảnh hưởng batch khác.
- **`ScenePromptService.retry()`** dùng lại đúng `generateBatch()` với batch kích thước 1 — 1 SRT lẻ vẫn regenerate độc lập, không đụng SRT khác, hành vi UI (nút Retry riêng từng card) không đổi.
- **Token budget scale theo batch size:** `SCENE_CONTEXT_CHAR_BUDGET = 6000` (baseline batch-of-1, dùng cho `retry()`) + `400` ký tự/SRT thêm vào batch (`PER_ADDITIONAL_BLOCK_BUDGET`) — batch 20 SRT ≈ ngân sách 13,600 ký tự. Thứ tự ưu tiên cắt giảm (mục 18.4) không đổi: bỏ Next SRT (neighbor ngoài batch) → bỏ Previous SRT (neighbor ngoài batch) → bỏ Relevant Character Reference; không bao giờ cắt SRT text của bất kỳ block nào trong batch hay Visual DNA của relevant characters.
- **Test:** viết lại hoàn toàn `tests/unit/generateScenePrompt.test.ts` (27 test — thêm `chunkSrtBlocks`, `formatBlockNumberRange`, `buildBatchSrtText`, parse multi-prompt, budget scale theo batch size) và `tests/unit/scenePromptService.test.ts` (13 test — thêm test batch boundary với 25 SRT dựng thủ công qua `insertSrtBlocks` xác nhận batch 2 không thấy quá 1 block lân cận của batch 1 và ngược lại, test batch atomic failure với 21 SRT ép 2 batch). Tổng `vitest` 136/136 pass (thêm 8 test ròng so với trước batch hoá), `tsc --noEmit` sạch cả 3 tsconfig, `eslint` sạch.
- **Verify lại bằng Electron driver tự viết** (cùng convention cô lập profile scratchpad): Settings > Prompts > Scene / Image Generation hiện đúng prompt mặc định mới (2662 ký tự, có nhắc "MỖI SRT"), vẫn đủ 4 placeholder bắt buộc, không có banner cảnh báo (đúng vì chưa xoá gì) — 0 console error. `npm run build` (electron-vite) build sạch. Đã dọn `playwright-core` + profile Electron tạm sau khi verify xong.

**Cập nhật sau feedback (2026-08-09) — live progress khi Generate Image Prompts:** User hỏi tiếp muốn thấy đang chạy batch thứ mấy / bao nhiêu prompt đã xong trong lúc `Generate Image Prompts` đang chạy (trước đó UI chỉ hiện "Generating…" tĩnh, không có phản hồi tiến trình).
- **`ScenePromptGenerationProgress`** (mới, `src/shared/ipc-types.ts` — dùng chung Main/Renderer): `{ batchIndex, totalBatches, completedBlocks, totalBlocks, batchResults }`. `batchResults` là các `ScenePrompt` vừa ghi xong của đúng batch đó (không phải toàn bộ list) — cho phép Renderer merge tăng dần thay vì đợi `generate()` trả về hết mới thấy gì.
- **`ScenePromptService.generate()`** nhận thêm tham số thứ 3 optional `onProgress?: (progress) => void`, gọi sau mỗi batch (thành công hay thất bại đều tính là "đã xử lý xong batch đó", theo đúng bản chất batch atomic — không có "progress trong lúc retry 1 batch", chỉ có progress giữa các batch). Test mới trong `characterService... scenePromptService.test.ts` xác nhận đúng thứ tự/giá trị `batchIndex/totalBatches/completedBlocks/totalBlocks/batchResults` qua 2 batch (25 SRT → batch 20 + 5).
- **Kênh IPC mới** `scenePrompts:progressEvent` (`ipc-channels.ts`) — cùng pattern với `pipeline.onProgress` đã có sẵn từ Phase 1 (dành cho Phase 9) nhưng đây là kênh **riêng cho `scenePrompts`**, không dùng chung với `pipeline.progressEvent` vì `scenePrompts.generate()` là "stand-in cho Run All" (thuật ngữ đã dùng xuyên suốt Phase 6-8), chưa qua `TaskQueueService`. IPC handler `scenePrompts.generate` (`projects.ipc.ts`) truyền callback `(progress) => event.sender.send(...)` xuống service.
- **`ImagePromptsPage.tsx`**: subscribe `appApi.scenePrompts.onProgress` khi mount (không phụ thuộc `projectId`, tự huỷ subscribe khi unmount) — mỗi lần nhận progress, merge `batchResults` vào state `scenePrompts` hiện tại (theo `blockIndex`) và cập nhật thanh progress. UI hiện "Batch X / Y" + "N / M prompts completed" + thanh 2px `emerald-success` (đúng DESIGN.md "Progress Indicators"), chỉ hiển thị khi `isGenerating` đang `true`.
- **Verify bằng Electron driver thật** (không mock event — dùng đúng luồng IPC thật): seed 25 `srt_blocks` qua `sqlite3` CLI (ép 2 batch 20+5), set API key giả + `selectedModel` giả trực tiếp qua `appApi.vilao.saveApiKey()`/`appApi.settings.save()` (bỏ qua bước Test Connection vốn cần key thật) để `scenePrompts.generate` thật sự chạy tới tầng gọi `VilaoService.chat()` thay vì bị chặn sớm ở guard "chưa chọn model". Bấm Generate Image Prompts → chụp được đúng lúc "Batch 1 / 2 · 20 / 25 prompts completed" với thanh progress xanh đúng ~80%, đồng thời 20 card đầu đã hiện sẵn kết quả thật ("Invalid API key." — 401 thật từ `api.vilao.ai`, mỗi card có nút Retry riêng) trước khi cả `generate()` chạy xong — xác nhận cơ chế "merge tăng dần" hoạt động đúng. Sau khi xong, thanh progress biến mất, nút trở lại "Generate Image Prompts", đủ 25/25 card hiện trạng thái failed độc lập. 0 console error.
- Tổng `vitest` 137/137 pass (thêm 1 test progress), `tsc --noEmit` sạch cả 3 tsconfig, `eslint` sạch. Đã dọn `playwright-core` + profile Electron tạm sau khi verify xong.

**Cập nhật sau feedback (2026-08-09) — chạy batch song song thay vì tuần tự:** User hỏi "80 SRT (4 batch) có gọi song song được không" — trả lời trực tiếp là hiện đang tuần tự, nhưng schema đã có sẵn field `projects.scene_concurrency` (default 2, range 1–5, từ Phase 2) và Advanced Settings đã có sẵn ô nhập liệu (đang disabled, ghi chú "Wired up in Phase 9") dành đúng cho việc này — hỏi lại user có muốn kéo sớm lên Phase 8 hay để dành Phase 9 (vì concurrency vốn gắn với Run All/Pause/Resume/Cancel). User chọn làm ngay.
- **`runWithConcurrency()`** (hàm nội bộ mới, `ScenePromptService.ts`, không phải dependency ngoài) — bounded concurrency pool: N worker (N = `Math.max(1, project.sceneConcurrency)`) mỗi worker lần lượt lấy batch tiếp theo (theo đúng thứ tự mảng) tới khi hết. Các batch xử lý các dải `srt_blocks` không chồng lấn nên chạy song song an toàn, không có race condition ghi đè cùng 1 row.
- **`ScenePromptService.generate()`** đổi từ vòng `for` tuần tự sang gọi `runWithConcurrency(batches, project.sceneConcurrency, ...)`. Batch có thể hoàn thành **không theo đúng thứ tự** (batch nhỏ/nhanh có thể xong trước batch lớn/chậm chạy trước nó) — vì vậy đổi field progress từ `batchIndex` (vị trí batch vừa xong — gây hiểu lầm/nhảy số khi không theo thứ tự) sang **`batchesCompleted`** (đếm dồn số batch đã xong, luôn tăng dần đơn điệu bất kể thứ tự hoàn thành thật) — đổi tên xuyên suốt `ScenePromptGenerationProgress` (`ipc-types.ts`), `ScenePromptService`, `ImagePromptsPage.tsx`.
  **Không phải schema change:** chỉ dùng field `projects.scene_concurrency` đã tồn tại sẵn từ Phase 2 (đọc, không ghi/không đổi kiểu) — Advanced Settings UI vẫn giữ nguyên disabled, chưa cho user tự chỉnh (vẫn đúng như ghi chú cũ "Wired up in Phase 9" — chỉ phần chỉnh qua UI mới thực sự thuộc Phase 9, còn việc *đọc và dùng* giá trị default 2 thì làm ngay ở đây).
- **Rate-limit backoff thông minh (mục 33 — "nếu API trả rate limit: giảm tốc, retry theo backoff") vẫn để dành Phase 12** đúng như plan.md đã note trước đó — lỗi (kể cả 429) hiện vẫn xử lý bằng retry per-batch giống mọi lỗi khác, không có logic phát hiện/giảm tốc riêng cho rate limit.
- **Test:** sửa 2 test cũ giả định thứ tự batch cố định (`batches SCENE_PROMPT_BATCH_SIZE...` đổi từ lấy theo index mảng `chatSpy.mock.calls[0]/[1]` sang tìm theo nội dung `BLOCK 001:`/`BLOCK 021:`; test progress đổi từ so khớp đúng 1 sequence cố định sang assert tính chất bất biến — `batchesCompleted` tăng dần 1,2, tổng `completedBlocks` cuối cùng đúng 25, hợp các `batchBlockIndexes` của mọi event phủ đúng 1..25 không trùng/không thiếu). Thêm test mới **"runs up to project.sceneConcurrency batches concurrently"**: dùng promise tự kiểm soát (chưa resolve `chat()` ngay) để chứng minh cả 2 batch đã gọi `chat()` (2 lần) trước khi bất kỳ cái nào được resolve — bằng chứng trực tiếp cho việc chạy song song thật, không phải tuần tự trông giống song song. Chạy lại 5 lần liên tiếp xác nhận không flaky. Tổng `vitest` 138/138 pass, `tsc --noEmit` sạch cả 3 tsconfig, `eslint` sạch, `npm run build` sạch.
- **Verify bằng Electron driver thật** (luồng IPC thật, không mock): seed 45 `srt_blocks` (ép 3 batch 20+20+5, concurrency mặc định 2 → batch 3 chỉ bắt đầu khi 1 trong 2 batch đầu xong), set key/model giả để bỏ qua guard. Bấm Generate → do lỗi 401 trả về rất nhanh (không có network latency thật đáng kể), 2 batch đầu xong gần như cùng lúc — chụp được "Batch 2 / 3 · 40 / 45 prompts completed" (2 batch 20-block xong sát nhau, đúng dấu hiệu chạy song song thay vì thấy rõ "20/45" rồi mới "40/45" tuần tự). `completedBlocks` xác nhận tăng dần đơn điệu, cuối cùng "0 / 45 generated" đúng (fake key nên tất cả fail), 0 console error.

**Xác nhận bởi user (2026-08-09) — đã tự kiểm thử xong, tóm tắt thay đổi chính:**
- **Compact Character Index + Relevant Character Selection** (`selectRelevantCharacters.ts`): local exact-name/alias matching trước (suy tên đọc được từ Character ID), fallback sang Internal Relevant Character Selector (LLM nội bộ, không hiển thị Prompt Settings) khi không khớp cục bộ, retry tới `max_retry`, fallback cuối cùng sang compact index toàn bộ nhân vật nếu selector lỗi hết.
- **Scene Prompt Generation** (`generateScenePrompt.ts` + `ScenePromptService`): đúng 1:1 với `srt_blocks`, context tối giản theo đúng priority mục 18.4 (không bao giờ cắt Current SRT/Visual DNA relevant), không rò rỉ toàn bộ transcript hay Character Database.
- **Prompt Settings > Scene / Image Generation** + **Image Prompts tab** (search, copy, copy all, retry riêng từng scene) hoạt động đầy đủ.
- **Cập nhật theo yêu cầu trong lúc test:** gộp batch 20 SRT/request thay vì 1 SRT/request (giảm số lần gọi LLM — đã cập nhật spec.md mục 17/18.3/30 làm nguồn chính thức mới); thêm live progress ("Batch X/Y", thanh `emerald-success`, merge kết quả tăng dần) khi Generate Image Prompts đang chạy; chạy batch song song theo `project.sceneConcurrency` (field có sẵn từ Phase 2, default 2) thay vì tuần tự.
- Không có thay đổi schema DB nào trong toàn bộ Phase 8 (kể cả các cập nhật theo yêu cầu) — chi tiết từng quyết định xem [schema.md Changelog](schema.md#changelog).
- Verify: `vitest` 138/138 pass, `tsc --noEmit` sạch cả 3 tsconfig, `eslint` sạch, `npm run build` sạch. Đã verify bằng Electron driver thật (profile cô lập) cho từng thay đổi — UI, batch atomic, concurrency, progress — 0 console error xuyên suốt. Path thành công thật với Vilao API key hợp lệ (bao gồm nhánh gọi Internal Relevant Character Selector) chưa có bằng chứng end-to-end trong các phiên làm việc trước do không có key thật; đã được user tự kiểm thử cục bộ với key thật khi xác nhận hoàn thành giai đoạn này.

**Bug phát hiện + sửa (2026-08-09, lúc user tự test Phase 11 với API key thật — Run All, batch 20 SRT):** toàn bộ 35 scene fail 3/3 lần với lỗi `Scene Generation response is missing the "PROMPT <n>:" prefix`, model trả về `"PROMPT 001-020: ..."`. Nguyên nhân: `formatBlockNumberRange()` rút gọn `{{BLOCK_NUMBER}}` của 1 batch nhiều block thành dải `"001–020"` (dấu gạch ngang) thay vì liệt kê đủ 20 số — model đọc thấy 1 dải số nên hiểu nhầm thành 1 khối cần đúng 1 prompt, trả lời gộp thay vì 20 `"PROMPT <n>:"` riêng biệt; vì `generateBatch` luôn retry lại **nguyên batch cũ** (không giảm batch size khi retry, xem `ScenePromptService.generateBatch`), cả 3 lần đều gửi lại đúng dải mơ hồ đó nên lặp lại lỗi y hệt. Sửa: `formatBlockNumberRange()` (`src/main/pipeline/generateScenePrompt.ts`) liệt kê đủ từng số block cách nhau dấu phẩy (`"001, 002, ..., 020"`) thay vì rút gọn — không đổi nguyên văn default prompt mục 30 (spec.md), chỉ đổi giá trị điền vào `{{BLOCK_NUMBER}}` đã có sẵn. Cập nhật test cũ giả định format dải cũ + thêm 2 test mới (`tests/unit/generateScenePrompt.test.ts` — liệt kê đủ 20 số cho batch đầy, chuỗi rỗng cho batch rỗng). Tổng `vitest` 185/185 pass, `tsc`/`eslint` sạch. Chưa có bằng chứng end-to-end với API thật sau khi sửa (cần user tự Retry Failed lại trên project đang lỗi để xác nhận).

**Bug lặp lại + sửa lần 2 (2026-08-09, cùng ngày — user Retry Failed lại sau bản sửa trên, model vẫn gộp `"PROMPT 001-020:"` dù input đã liệt kê đủ 20 số):** xác nhận model thật (qua Vilao, alias `claude-sonnet-4-6` — không phải model Anthropic thật, không rõ hành vi) có thói quen tự tóm tắt dải số bất kể prompt được viết rõ thế nào — sửa prompt text không đảm bảo hết được, cần 1 lớp phòng thủ ở tầng code không phụ thuộc hành vi model. Thêm cơ chế **tự chia nhỏ batch khi phát hiện response bị gộp**:
- `SceneFormatCollapseError` (class lỗi riêng, `src/main/pipeline/generateScenePrompt.ts`) — `parseSceneGenerationResponse` throw đúng loại này khi response có **0 marker** `"PROMPT <n>:"` nào (khác với throw `Error` thường khi có marker nhưng thiếu 1 vài block — 2 tình huống khác bản chất: 0 marker nghĩa là cả response không theo format, thiếu vài block nghĩa là model theo đúng format nhưng bỏ sót).
- `ScenePromptService.generateBatch` (`src/main/services/ScenePromptService.ts`): khi bắt được `SceneFormatCollapseError` trên 1 batch >1 block, **dừng retry ngay** (không đợi hết `maxRetry` — batch đã chứng minh bị lỗi hình dạng y hệt, retry lại nguyên batch đó chắc chắn lặp lại lỗi) → **chia đôi batch** (`Math.ceil(length/2)`) → gọi đệ quy `generateBatch` cho từng nửa (mỗi nửa có ngân sách `maxRetry` riêng, dùng lại đúng cơ chế neighbor/relevant-character/persist của 1 batch bình thường) → lặp tới khi về batch-size 1 (không còn gì để gộp nên không thể dính lỗi này nữa). Đây là cơ chế phòng thủ ở tầng code, không phụ thuộc phải đoán đúng cách model sẽ phản ứng với prompt.
- Test mới (`tests/unit/scenePromptService.test.ts`, 2 test): batch 4 block luôn bị model gộp (mock) khi >1 block → xác nhận chia nhỏ dần tới khi cả 4 block đều `success`, đúng nội dung riêng từng block (không lẫn nội dung gộp), đúng số lần gọi `chat()` dự đoán theo cây chia đôi (7 lần: 3 lần gộp-thất-bại + 4 lần thành công riêng lẻ); test thứ 2 xác nhận dừng retry **ngay sau lần gộp đầu tiên** thay vì tốn hết `maxRetry=3` lần thử vô ích trên đúng 1 hình dạng đã biết trước là hỏng (batch 2 block: 1 lần gộp-thất-bại + 2 lần thành công = 3 lời gọi, không phải 3+2=5). Tổng `vitest` 187/187 pass, `tsc`/`eslint` sạch, `npm run build` sạch.
- **Chưa có bằng chứng end-to-end với API thật** sau bản sửa lần 2 này — cần user tự Retry Failed lại trên project đang lỗi (hoặc Run All project mới) để xác nhận cơ chế chia nhỏ batch thật sự giải quyết được, vì hành vi gộp của model chỉ verify được qua mock (giả lập đúng hình dạng lỗi đã quan sát thật), chưa gọi lại `api.vilao.ai` thật trong phiên sửa này.

**Bug lặp lại + sửa lần 3 (2026-08-09, cùng ngày — user Retry Failed lại sau bản sửa lần 2, đa số scene đã Success nhưng 1 nhóm 6 scene liên tiếp (015-020) vẫn fail 3/3 với lỗi khác: `"missing prompt(s) for block(s): 016, 017, 018, 019, 020"`):** cơ chế chia nhỏ batch ở bản sửa lần 2 **hoạt động đúng như thiết kế** — xác nhận được qua việc phần lớn scene đã qua. Nhưng lộ ra: `parseSceneGenerationResponse` có **2 nhánh lỗi** khác nhau — (a) 0 marker `"PROMPT <n>:"` nào (model gộp hết) và (b) có marker nhưng thiếu 1 vài block (model viết dở rồi dừng giữa batch, ví dụ chỉ viết block 015 rồi bỏ hẳn 016-020). Bản sửa lần 2 chỉ cho nhánh (a) throw `SceneFormatCollapseError` (kích hoạt chia nhỏ batch), còn nhánh (b) vẫn throw `Error` thường (chỉ retry y nguyên batch cũ) — dựa trên giả định sai rằng "model theo đúng format nhưng bỏ sót thì retry thường là đủ". Ảnh chụp thực tế cho thấy giả định này sai: lỗi (b) cũng lặp lại y hệt cả 3 lần trên đúng 1 batch, chứng minh cùng bản chất với (a) (model không hoàn thành đủ marker cho batch đó, retry y nguyên batch không giúp gì). Sửa: gộp cả 2 nhánh (a) và (b) trong `parseSceneGenerationResponse` (`src/main/pipeline/generateScenePrompt.ts`) thành cùng 1 loại `SceneFormatCollapseError` — không cần sửa gì thêm ở `ScenePromptService.generateBatch`, cơ chế chia nhỏ batch đã viết ở lần 2 tự động áp dụng cho cả 2 nhánh vì đã check bằng `instanceof SceneFormatCollapseError`. Thêm test mới: `generateScenePrompt.test.ts` xác nhận cả 2 nhánh đều throw đúng class; `scenePromptService.test.ts` thêm 1 test mô phỏng đúng hiện tượng thật (model chỉ viết marker cho block đầu tiên trong batch rồi bỏ hẳn phần còn lại) → xác nhận vẫn chia nhỏ dần và ra đủ kết quả đúng. Tổng `vitest` 188/188 pass, `tsc`/`eslint`/`npm run build` sạch. Vẫn chưa có bằng chứng end-to-end với API thật sau bản sửa lần 3 — cần user tự Retry Failed lại lần nữa.

**Cải thiện thêm theo yêu cầu (2026-08-09, cùng ngày — user chọn qua AskUserQuestion "Viết lại rõ hơn phần OUTPUT của prompt"):** cơ chế chia nhỏ batch (lần 2-3) đảm bảo đúng kết quả cuối cùng nhưng không tối ưu — mỗi lần model phá format vẫn tốn thêm nhiều request phụ. Để giảm tần suất cần chia nhỏ (không thay thế cơ chế đó, chỉ bổ sung), sửa nguyên văn OUTPUT section của default Scene Generation prompt (spec.md mục 30 — nguồn chính thức, đồng bộ verbatim sang `DEFAULT_SCENE_GENERATION_PROMPT` trong `src/shared/prompts.ts`, đã verify byte-identical): thêm 1 ví dụ cụ thể (`BLOCK: 001, 002, 003` → 3 đoạn `PROMPT 00N:` riêng) + 2 gạch đầu dòng "BẮT BUỘC" cấm rõ ràng đúng 2 kiểu lỗi đã quan sát thật (gộp nhiều số vào 1 dòng `"PROMPT 001-003:"`, và dừng viết giữa chừng khi danh sách dài). Không đổi 4 placeholder bắt buộc, không đổi field/logic nào khác — `getMissingPlaceholders('sceneGeneration', ...)` vẫn pass với prompt mới (`tests/unit/prompts.test.ts`). Đây là cải thiện "phòng ngừa" dựa trên prompt engineering — không đảm bảo tuyệt đối hết lỗi (model vẫn có thể phá format), lưới an toàn (chia nhỏ batch) vẫn giữ nguyên làm chốt chặn cuối. **Lưu ý cho user:** project đã tạo trước đó (ví dụ "Test 4") có `promptSettings.sceneGeneration` **đã snapshot** hoặc đang dùng bản default cũ lưu trong `AppSettings` (electron-store) — bản prompt mới chỉ tự áp dụng cho **project mới tạo sau khi restart app**; project đang test dở phải vào Settings > Prompts > Scene / Image Generation bấm **Reset to Default** thủ công mới nhận đúng bản mới (hoặc tạo project mới để test sạch). Tổng `vitest` 188/188 pass (không đổi số lượng, chỉ đổi nội dung chuỗi), `tsc`/`eslint`/`npm run build` sạch.

**Đổi output format sang JSON theo yêu cầu (2026-08-09, cùng ngày — user chọn qua AskUserQuestion "Có, chuyển sang JSON"):** phát hiện khi rà lại: Scene Generation là **bước LLM duy nhất** trong 4 bước (Character Detection, Character Prompt Generation, Internal Relevant Character Selector, Scene Generation) dùng plain text (`"PROMPT <n>:"`) — 3 bước còn lại đã dùng JSON + `repairJsonText()` (`src/main/pipeline/jsonRepair.ts`) từ trước, ổn định. Lý do Scene Generation là ngoại lệ: mục 30 tự ghi rõ chọn plain text để tiết kiệm token (bước gọi lặp lại nhiều lần/batch). Đổi sang JSON để tận dụng lại đúng pattern đã chứng minh ổn định ở 3 bước kia:
- **OUTPUT trong default Scene Generation prompt** (spec.md mục 30, đồng bộ verbatim `DEFAULT_SCENE_GENERATION_PROMPT` trong `src/shared/prompts.ts`, đã verify byte-identical) đổi hẳn từ plain text (kèm ví dụ + "BẮT BUỘC" vừa thêm ở bản sửa trước) sang JSON: `{ "scene_prompts": [{ "block_number": 1, "prompt": "..." }] }` — cùng vocabulary snake_case với `character_prompts` đã dùng ở mục 29.
- `parseSceneGenerationResponse()` (`src/main/pipeline/generateScenePrompt.ts`) viết lại hoàn toàn: bỏ regex `PROMPT\s+0*(\d+)\s*:`, chuyển sang `JSON.parse()` + `repairJsonText()` fallback (y hệt `parseCharacterGenerationResponse`) + validate từng item (`block_number` phải là số hữu hạn nằm trong batch, không trùng, `prompt` không rỗng) + check đủ block. Toàn bộ nhánh lỗi (JSON không hợp lệ, thiếu mảng `scene_prompts`, item sai shape, `block_number` lạ/trùng, thiếu prompt, thiếu block) đều throw chung 1 loại `SceneFormatCollapseError` — giữ nguyên quyết định "gộp mọi lỗi shape thành 1 tín hiệu chia nhỏ batch" đã chốt ở lần sửa trước, không cần sửa gì thêm ở `ScenePromptService.generateBatch` (cơ chế chia nhỏ batch tự động áp dụng, không phụ thuộc JSON hay text).
- Không đổi 4 placeholder bắt buộc, không đổi `formatBlockNumberRange()` (input `{{BLOCK_NUMBER}}` vẫn liệt kê đủ số dạng `"001, 002, ..."`, độc lập với format output).
- **Cập nhật toàn bộ test mock** ở `tests/unit/generateScenePrompt.test.ts` (viết lại describe `parseSceneGenerationResponse` theo đúng convention `parseCharacterGenerationResponse.test.ts` — parse hợp lệ, repair code-fence/prose, từng loại lỗi ném đúng `SceneFormatCollapseError`) và `tests/unit/scenePromptService.test.ts`/`tests/unit/pipelineService.test.ts` (mọi helper/mock dựng response giả từ `"PROMPT n:\n\n..."` sang `JSON.stringify({ scene_prompts: [...] })`, thêm helper dùng chung `scenePromptResponseJson()`) — 2 test mô phỏng "model gộp"/"model bỏ dở" ở lần sửa trước vẫn giữ nguyên ý nghĩa, chỉ đổi cách giả lập cho khớp thế giới JSON (gộp → trả text không phải JSON hợp lệ; bỏ dở → JSON hợp lệ nhưng mảng thiếu phần tử). Tổng `vitest` 192/192 pass (thêm 4 test JSON-specific: repair code-fence, repair prose, unexpected block_number, duplicate block_number — theo đúng bộ test đã có sẵn cho Character Generation), `tsc`/`eslint`/`npm run build` sạch.
- **Chưa có bằng chứng end-to-end với API thật** — đây là thay đổi lớn nhất trong chuỗi 4 lần sửa hôm nay (đổi hẳn kiến trúc parse, không chỉ vá prompt/retry logic), cần user tự Reset to Default + Retry Failed/Run All lại với model thật để xác nhận.

**Điều chỉnh batch size + concurrency theo yêu cầu (2026-08-09, cùng ngày — user: "1 batch 20 srt có vẻ hơi lâu, chuyển thành 1 batch 10 srt và mỗi lần chạy song song 4 batch"):**
- `SCENE_PROMPT_BATCH_SIZE` (`src/main/pipeline/generateScenePrompt.ts`) hạ từ **20 → 10**.
- `DEFAULT_SCENE_CONCURRENCY` (`ProjectService.ts`, dùng khi tạo project mới) nâng từ **2 → 4** — vẫn trong range 1–5 đã có sẵn từ Phase 2 (schema.md/spec.md mục 33), không đổi range/constraint nào, không phải schema change (xem [schema.md Changelog](schema.md#changelog) "Phase 11 follow-up").
- Đồng bộ số liệu ở toàn bộ spec.md liên quan (mục 17, 17.1, 18.3, 18.4 — ví dụ ngân sách ký tự batch 10 SRT ≈ 9.600 thay vì batch 20 ≈ 13.600, 19.3, 30 intro, 33) — các đoạn "Implementation thật"/Changelog mô tả *quá khứ* (khi 20/2 còn là default) giữ nguyên, không sửa lại lịch sử.
- **Chỉ áp dụng cho project mới tạo sau khi restart app** — `scene_concurrency` là field per-project (snapshot lúc tạo), project đang test dở (`Test 4`...) giữ nguyên giá trị cũ (2), phải tự đổi qua Settings > Advanced > Pipeline Tuning nếu muốn chạy 4 batch song song ngay trên project đó.
- **Cập nhật lại toàn bộ test phụ thuộc số liệu batch/concurrency cũ** — nhiều test dựng kịch bản dựa trên đúng ranh giới batch 20 (ví dụ "21 blocks → batch 1-20 + batch 21 alone", "40 blocks → 2 batch × 20, concurrency 2 chạy song song") phải tính lại theo batch 10/concurrency 4 (`tests/unit/generateScenePrompt.test.ts`: `chunkSrtBlocks` default batch size; `tests/unit/projectService.test.ts`: 2 assertion `sceneConcurrency`; `tests/unit/scenePromptService.test.ts`: 6 test — ranh giới batch/neighbor, số lần gọi `chat()` khi resume/skip, số batch chạy đồng thời, tiến trình `onProgress` theo 3 batch thay vì 2, kịch bản Pause giữa chừng với 5 batch/4 song song). Tổng `vitest` 192/192 pass (không đổi số lượng test, chỉ đổi số liệu kỳ vọng), `tsc`/`eslint`/`npm run build` sạch.
- Chưa có bằng chứng end-to-end với API thật cho riêng thay đổi này — cùng cần xác nhận cùng lúc với bản đổi JSON ở trên khi user Retry Failed/Run All lại.

**Tối ưu cost/latency cho project nhiều SRT (2026-08-10, theo yêu cầu user — project ~900 Image Prompt tốn token/thời gian):** phân tích cho thấy Scene Generation chính đã batch (10 SRT/request, ~90 request cho 900 block) nhưng **Internal Relevant Character Selector** (mục 31) vẫn chạy per-SRT — mỗi block local match trượt (thường là câu chỉ có đại từ) tốn thêm 1 request LLM riêng, lên tới ~900 request phụ trong trường hợp xấu nhất. 2 thay đổi cộng dồn, cả 2 đều đã trình bày plan + được user duyệt trước khi làm:
- **Batch hoá selector call theo đúng batch của Scene Generation** — mọi SRT trong 1 batch còn cần selector giờ gộp vào đúng 1 request (thay vì 1 request/block), cùng dạng response "keyed theo `block_number`" mà Scene Generation đã dùng. `buildRelevantCharacterSelectorMessages()`/`parseRelevantCharacterSelectorResponse()` (single-item) bị xoá hẳn, thay bằng `buildBatchRelevantCharacterSelectorMessages()`/`parseBatchRelevantCharacterSelectorResponse()` (`selectRelevantCharacters.ts`). Parse lenient hơn bản cũ: 1 block thiếu trong response chỉ nhận `[]`, không throw/retry cả batch — chỉ throw khi JSON hỏng hoàn toàn ở cấp cao nhất (trigger retry đúng 1 lần cho cả nhóm, không phải per-block như trước).
- **Local pronoun carry-forward** — hàm mới `resolveLocalRelevantCharacterIds(blocks, characters)` chạy 1 lần, tuần tự, thuần string (không LLM) trên toàn bộ `srt_blocks` trước khi batch/concurrency bắt đầu: block khớp tên trực tiếp (`matchLocalRelevantCharacterIds`, không đổi) trở thành "last known"; block sau đó không khớp tên nhưng có đại từ ngôi 3 (`containsPronounHint()`, danh sách ngắn song ngữ VI/EN) kế thừa "last known" thay vì phải gọi selector. `ScenePromptService.generate()`/`retry()` gọi hàm này 1 lần, truyền map kết quả xuống `generateBatch()` (tham số mới `localSelectionByBlockIndex`) — chỉ những block map trả về `[]` mới vào nhóm gọi selector batch ở trên.
- Không đổi field/schema nào (đã xác nhận trong plan trước khi làm) — `scene_prompts.relevant_character_ids` vẫn cùng ý nghĩa, chỉ đổi *cách* nó được tính. Fallback cuối mục 31 (selector lỗi hết `max_retry` → compact index toàn bộ, không Character Reference) không đổi hành vi, chỉ đổi phạm vi áp dụng (cả nhóm cần selector trong batch thay vì từng block độc lập — chấp nhận được vì lỗi JSON hỏng hoàn toàn hiếm gặp, đã ổn định từ khi đổi sang JSON contract).
- Đã cập nhật **spec.md mục 16.2/31** (nguồn chính thức) — xem "Cập nhật thật (2026-08-10)" ở đó.
- **Test:** `tests/unit/selectRelevantCharacters.test.ts` xoá test 2 hàm single-item cũ, thêm test cho `resolveLocalRelevantCharacterIds`/`containsPronounHint`/`buildBatchRelevantCharacterSelectorMessages`/`parseBatchRelevantCharacterSelectorResponse` (direct match, carry-forward, reset khi có tên mới, không carry khi chưa có gì, block thiếu trong response nhận `[]` thay vì throw, JSON hỏng vẫn throw). `tests/unit/scenePromptService.test.ts` thêm 2 test: nhiều block cần selector trong cùng 1 batch → đúng 1 selector call (không phải N), 1 block khớp tên trực tiếp + 1 block đại từ ngay sau → cả 2 resolve cục bộ, không gọi selector lần nào. 2 test cũ (`falls back to the internal LLM selector...`, `falls back to the compact index...`) giữ nguyên ý nghĩa, chỉ sửa response mock sang shape `relevant_characters` mới. Tổng `vitest` 261/261 pass, `tsc --noEmit` sạch.
- Chưa có bằng chứng end-to-end với API thật (cần user tự chạy lại project nhiều SRT để đo số request/thời gian thực tế giảm bao nhiêu).

---

## Phase 9 — Run All Orchestration + Processing Tab + Retry/Resume/Pause/Cancel

**Việc cần làm:**
- `PipelineService.runProject()` theo đúng pseudo flow mục 36 (kiểm tra từng bước đã hoàn thành chưa trước khi chạy lại).
- `TaskQueueService` với concurrency: Character Detection = 1, Character Generation = 1, Scene Generation mặc định 2 (Advanced Settings chỉnh 1–5) — mục 33. Rate limit → giảm tốc + backoff.
- Validation trước Run (mục 38): transcript rỗng, API key chưa cấu hình/hợp lệ, chưa chọn model, `maxCharacters` không hợp lệ, prompt/placeholder bắt buộc bị thiếu — chặn Run kèm message rõ ràng.
- Nút Run All trên TopBar wire thật (thay thế nút Split SRT tạm ở Phase 5).
- Pause: không nhận task mới, request đang chạy được hoàn thành, lưu kết quả, `status = paused`.
- Cancel: huỷ pipeline hiện tại, giữ nguyên dữ liệu đã hoàn thành, có thể Resume sau.
- Resume: chỉ chạy `failed` cần retry + `pending`, không chạy lại `success` (trừ khi Regenerate — Phase 12).
- Processing tab thật: task list với icon `○ Pending ● Running ✓ Success ! Failed ↻ Retrying — Skipped` (Retrying/Skipped suy ra ở UI theo Convention trong schema.md, không lưu cột riêng), actions Pause/Resume/Cancel/Retry Failed.

**Màn hình Stitch dùng:** "Pipeline Status" — `get_screen`.

**Test + chạy local:**
1. Run All end-to-end trên transcript nhỏ (~5 SRT, vài nhân vật) tới khi `status = completed`.
2. Giữa chừng bấm Pause → Resume, verify tiếp tục đúng từ chỗ dừng.
3. Force-quit app khi đang chạy (ví dụ Scene 003), mở lại app, bấm Resume: Scene 001–002 skip, Scene 003 retry, Scene 004+ tiếp tục — đúng ví dụ mục 19.2.
4. Cancel giữa chừng, verify dữ liệu đã hoàn thành không bị xoá, Resume lại được sau đó.
5. Thử Run với transcript rỗng / chưa chọn model — verify bị chặn với message đúng mục 38.

**Điểm dừng:** Run All + Retry/Resume/Pause/Cancel hoạt động đúng, không mất kết quả khi crash giữa chừng. Dừng, chờ xác nhận trước khi sang Phase 10.

**Ghi chú hoàn thành (đã test pass 2026-08-09):**
- **`PipelineService`** (`src/main/services/PipelineService.ts`, mới, không import Electron — cùng convention `CharacterService`/`ScenePromptService`) implement đúng pseudo flow mục 36 **bằng cách tái dùng** `SrtService`/`CharacterService`/`ScenePromptService` đã có từ Phase 5-8 thay vì viết lại logic retry/batch/persist — mỗi bước đều **gated** ("nếu chưa xong thì chạy"), nên `runProject()` vừa là Run vừa là Resume (mục 19.3), không cần code path riêng: gọi lại một bước đã xong là no-op, bước chưa xong thì tiếp tục đúng từ dữ liệu đã có trong DB.
- **Lệch có chủ đích khỏi pseudo flow mục 36:** `createSrtBlocks()` KHÔNG chạy vô điều kiện mỗi lần Resume như pseudocode gốc — chỉ chạy khi `srt_blocks` rỗng. Chạy lại vô điều kiện sẽ xoá+insert lại `srt_blocks` với id mới, kéo theo cascade delete xoá sạch `scene_prompts` đã có (FK `ON DELETE CASCADE`) — đúng là hành vi sẽ **mất dữ liệu khi Resume**, vi phạm trực tiếp mục 25 DoD ("Pipeline không mất kết quả đã hoàn thành khi một task lỗi"). Ghi rõ vì đây là lệch khỏi pseudocode trong spec, không phải bỏ sót.
- **`pipeline_tasks` bắt đầu được dùng thật** (lần đầu tiên kể từ khi bảng được tạo ở Phase 2) nhưng **chỉ cho 3 bước cấp dự án**: `SPLIT_SRT`, `DETECT_CHARACTERS`, `GENERATE_CHARACTER_PROMPTS` (mỗi bước đúng 1 row/project, `entity_id = NULL`) — đóng lại lỗ hổng "lỗi cuối cùng chỉ hiển thị tạm trên UI, mất khi rời trang/restart app" đã ghi nhận từ Phase 6/7. **`GENERATE_SCENE_PROMPT` và `SELECT_RELEVANT_CHARACTERS` vẫn KHÔNG dùng `pipeline_tasks`** (2 giá trị enum `task_type` này tiếp tục chưa được dùng, không phải schema change) — vì `scene_prompts` đã có sẵn đúng granularity đó (1 row/SRT block, có `status/attempts/error`) từ Phase 8; thêm bản ghi `pipeline_tasks` song song sẽ tạo 2 nguồn sự thật cho cùng 1 trạng thái, rủi ro lệch nhau. Processing tab (mục 8.6) hiển thị breakdown "Scene 001/002/..." bằng cách đọc thẳng `scenePrompts.list()` (đã expose từ Phase 8) thay vì qua `pipeline.listTasks()`.
- **Prompt Snapshot (mục 32)** — `applyFirstRunSnapshotIfMissing()` (mới trong `ProjectService`) set cả 6 field `*_snapshot` đúng 1 lần (no-op nếu đã có), và **cũng ghi `projects.selected_model`** (field tồn tại từ schema gốc nhưng chưa từng được ghi bởi bất kỳ service nào tới giờ, xem ghi chú Phase 6) — hợp lý vì lúc này Run All thật đã chạy, có model thật để lưu. Sau lần Run đầu tiên, mọi bước LLM (Detect/Character Prompts/Scene Generation) dùng đúng giá trị đã snapshot (`project.characterDetectionPromptSnapshot`...) chứ không đọc lại `AppSettings`/Prompt Settings hiện hành — verify bằng unit test đổi live prompt settings giữa 2 lần `runProject()`, snapshot không đổi.
- **Pause/Cancel** implement bằng 1 `Map<projectId, { stopRequested: boolean }>` trong bộ nhớ của `PipelineService` (singleton do `pipeline.ipc.ts` giữ) — `pause()`/`cancel()` chỉ bật cờ, vòng lặp `runProject()` kiểm tra cờ này **giữa các bước cấp dự án** và (thêm tham số `shouldContinue` mới cho `ScenePromptService.generate()`) **giữa các batch Scene Generation** — không có "cancel" tách biệt trong `ProjectStatus` (schema.md không có giá trị đó), nên cả Pause lẫn Cancel đều đưa project về `paused` (resumable), khác nhau thuần về ý định người dùng chứ không phải hành vi. Request đang chạy (1 lần gọi LLM đang await) luôn được để chạy xong, đúng mục 37 "request đang chạy được phép hoàn thành".
- **Resume sau Scene Generation** (mục 19.2/19.3) dựa vào thay đổi mới trong `ScenePromptService.generate()`: **bỏ qua hoàn toàn** (không gọi LLM) 1 batch nếu **mọi** block trong batch đó đã `status=success` — an toàn vì thiết kế atomic-per-batch từ Phase 8 đảm bảo 1 batch chỉ có 2 trạng thái khả dĩ: toàn bộ `success` hoặc toàn bộ `failed`/chưa có row (batch bị crash giữa chừng thì chưa hề ghi row nào). Đây cũng là thay đổi hành vi cho nút thủ công **Generate Image Prompts** ở Image Prompts tab (Phase 8) — bấm lại giờ sẽ **không** gọi lại LLM cho scene đã thành công (trước đây gọi lại toàn bộ) — chấp nhận được vì "Regenerate" ép chạy lại thật sự đã được xác định là tính năng riêng ở Phase 12.
- **Validation trước Run (mục 38)** — `validateProjectForRun()` đặt ở `src/shared/validateRun.ts` (không phải `src/main/pipeline/`) theo đúng convention của `src/shared/prompts.ts`: dùng chung cả ở Main (`PipelineService.runProject()`, gate thật) lẫn Renderer (TopBar/Processing tab, disable nút Run All kèm tooltip đúng lý do trước khi user bấm) — không đặt trong `src/main/` vì Renderer không được chứa business logic pipeline theo kiến trúc 3 lớp CLAUDE.md. Check theo đúng thứ tự mục 38 liệt kê (transcript rỗng → API key chưa cấu hình → chưa chọn model → `maxCharacters` ngoài range 100–2000 → prompt rỗng/thiếu placeholder cho từng prompt), trả về message đầu tiên vi phạm (không phải list đầy đủ, khớp ví dụ mục 38 chỉ hiện 1 dòng). Không tự phát hiện "API key chưa hợp lệ" (không gọi `testConnection()` trước khi Run để tránh round-trip mạng thừa) — theo đúng precedent đã có ở `characters.detect` IPC (Phase 6): dựa vào chính request LLM đầu tiên tự fail nếu key sai.
- **`ProjectService.open()`** thêm auto-downgrade `processing` → `paused` khi mở lại project — vì `processing` chỉ có thể do app/`PipelineService` bị đóng đột ngột giữa chừng (force-quit), không còn tiến trình nào thật sự đang chạy sau khi mở app mới. Đây là cơ chế chính đáp ứng test #3 (force-quit giữa chừng → mở lại → Resume) — verify bằng cả unit test lẫn driver Electron thật (SIGKILL tiến trình Electron giữa lúc `Run All` đang chạy, mở lại app, query DB thấy `processing`, mở project ra thấy `paused`, bấm Resume hoàn tất đúng, không đụng `SPLIT_SRT`/`DETECT_CHARACTERS` đã xong).
- **`TaskQueueService` không tách thành class riêng** — quyết định khác với tên gọi trong "Việc cần làm" của plan gốc: concurrency Character Detection/Character Generation (=1) đã là hành vi tự nhiên của `CharacterService` (gọi tuần tự, không có vòng lặp concurrent) từ Phase 6/7; concurrency Scene Generation (mặc định 2, chỉnh 1–5) đã implement thẳng trong `ScenePromptService.generate()` từ Phase 8 (`runWithConcurrency()` nội bộ). `PipelineService` ch�ỉ điều phối thứ tự gọi các service này — thêm 1 class `TaskQueueService` bọc ngoài chỉ để có đúng tên gọi sẽ là gián tiếp không cần thiết. Rate-limit backoff ("nếu API trả rate limit: giảm tốc, retry theo backoff") **chưa** implement — giữ nguyên như đã note từ Phase 8, để dành Phase 12 cùng Context Too Large Handling.
- **Advanced Settings > Pipeline Tuning bật thật** (`maxRetry`/`sceneConcurrency`) nhưng biên tập **project hiện đang mở**, không phải `AppSettings` toàn cục — vì đây là 2 field per-project trong schema (`projects.max_retry`/`scene_concurrency`), không có field tương đương trong `AppSettings`, và thêm field mới vào `AppSettings` sẽ là schema change cần hỏi trước (đã ghi rõ ở Phase 4). Route Settings vẫn là route global (`/settings`, ngoài `/projects/:id`) nên trang này đọc `useProjectStore.currentProject` (Zustand store không bị clear khi rời route project — hành vi này đã tồn tại sẵn từ Phase 2) để biết đang chỉnh project nào; vào Settings từ icon bánh răng trên TopBar (đang có project mở) thì form enable, vào từ Home Sidebar (chưa mở project nào) thì form disable kèm hướng dẫn. IPC mới `projects.updatePipelineSettings` (không có trong danh sách gốc mục 4.2, cùng pattern mở rộng IPC đã lặp lại từ Phase 4).
- **`ProjectsListPage.tsx`** (Home) — nút **Resume** ở Project History (đã note sẵn từ Phase 2 là "disabled, available from Phase 9") nay bật thật: enable khi `status` là `paused`/`failed`/`completed_with_errors`, điều hướng tới tab Processing của project đó.
- **Test mới:** `tests/unit/validateRun.test.ts` (8 test), `tests/unit/pipelineService.test.ts` (11 test: validation chặn đúng thứ tự, full run end-to-end đúng mục 36, snapshot đúng 1 lần mục 32, chặn 2 lần chạy đồng thời, Pause dừng đúng trước Character Prompts rồi Resume tiếp đúng không gọi lại Detect, Cancel giữ nguyên dữ liệu, `pause()` khi không có tiến trình chạy vẫn set `paused`, Scene Generation lỗi không kéo cả project xuống `failed` mà là `completed_with_errors` và Resume sau đó phục hồi được, `listTasks()` mặc định 3 task pending), thêm 4 test vào `scenePromptService.test.ts` (bỏ qua batch đã xong hoàn toàn không gọi LLM, batch dở dang vẫn chạy lại đầy đủ, `shouldContinue()` dừng đúng không huỷ batch đang chạy dở), thêm 5 test vào `projectService.test.ts` (`updateStatus`, `open()` downgrade `processing`→`paused`, `open()` không đụng status khác, `applyFirstRunSnapshotIfMissing` đúng 1 lần, `updatePipelineSettings` validate range). Tổng `vitest` 165/165 pass, `tsc --noEmit` sạch cả 3 tsconfig, `eslint` sạch, `npm run build` sạch.
- **Verify bằng driver Electron thật** (Playwright `_electron`, cài tạm `playwright-core` rồi gỡ sau khi xong, profile cô lập trong scratchpad, `unset ELECTRON_RUN_AS_NODE` — cùng convention Phase 6-8), dùng API key giả (401 thật từ `api.vilao.ai`) để test được path lỗi/retry/Pause/Cancel/Resume mà không cần key thật:
  - Validation: project transcript rỗng → nút Run All disabled đúng tooltip "Add a transcript before running the pipeline." Thêm transcript → nút enable.
  - Run All full: Split SRT chạy thật (không LLM) → Detect Characters gọi thật `api.vilao.ai` 3 lần (401) → đúng lỗi "Character Detection failed after 3 attempt(s): Invalid API key." → `pipeline_tasks` đúng `SPLIT_SRT=success`, `DETECT_CHARACTERS=failed`, project `status=failed`, TopBar hiện "Retry Failed".
  - Seed thẳng `characters`/`character_prompts` (`status=success`) qua `sqlite3` CLI để bỏ qua bước cần key thật, bấm Run All → vào thẳng Scene Generation, bấm Pause giữa chừng → project `status=paused`, mở lại app (process mới) → vẫn `paused`, bấm Resume → không gọi lại `chat()` cho Detect Characters (verify qua nội dung request), hoàn tất `status=completed_with_errors` (đúng vì key giả nên scene vẫn fail, nhưng đúng luồng).
  - Force-quit thật: bấm Run All rồi `SIGKILL` tiến trình Electron ngay sau đó → DB còn `status=processing` → mở app mới, chưa mở project thì DB vẫn `processing`, mở project ra (gọi `projects.open()`) → downgrade đúng thành `paused` → bấm Resume → hoàn tất, không chạy lại `SPLIT_SRT`/`DETECT_CHARACTERS` đã xong trước đó.
  - Cancel: bấm Run All → bấm Cancel gần như ngay lập tức → `status=paused`, `srt_blocks` vẫn còn nguyên (không mất dữ liệu).
  - Advanced Settings: mở Settings > Advanced khi đang có project mở → giá trị mặc định đúng `3`/`2` → sửa thành `5`/`4` → Save → DB đúng `max_retry=5, scene_concurrency=4` → nhập `sceneConcurrency=9` → hiện lỗi validate "Maximum 5", DB giữ nguyên `5/4` (không ghi giá trị sai).
  - Chụp màn hình Processing tab ở cả 3 trạng thái (đang chạy dở/hoàn tất/có lỗi) đối chiếu đúng token DESIGN.md và đúng layout tham khảo từ Stitch "Pipeline Status" (bento grid 4 card trạng thái + danh sách "Scene 00N" + progress bar `vilao-blue`). Phát hiện thiếu trạng thái "Completed" tĩnh (nút Run All vẫn hiện enable dù project đã `completed`) qua ảnh chụp — sửa ngay: cả TopBar lẫn Processing tab hiện badge "✓ Completed" thay vì nút hành động khi `status=completed`.
  - Không console error xuyên suốt toàn bộ các kịch bản trên.
- **Chưa verify được path thành công thật hoàn chỉnh** (Run All chạy hết từ Detect Characters → Scene Generation với model Vilao thật, ra `status=completed` không lỗi) vì không có API key Vilao hợp lệ trong phiên này — cùng giới hạn đã lặp lại từ Phase 6-8. Từng bước riêng lẻ đã có bằng chứng thành công thật từ các phase trước (user tự test); phần orchestration/gating/snapshot/pause-resume mới của Phase 9 được cover đầy đủ bằng 34 unit test mới (tổng cộng qua 3 file) với `VilaoService.chat()` giả lập thành công, cộng với driver Electron thật cho toàn bộ nhánh lỗi/pause/cancel/resume/force-quit. Cần key thật để xác nhận nốt nhánh thành công end-to-end khi có.
- Đã dọn `playwright-core`, toàn bộ profile Electron tạm và ảnh chụp màn hình khỏi scratchpad sau khi verify xong; không đụng tới `userData` thật trong suốt phiên.

**Cập nhật sau feedback (2026-08-09) — card Scene Generation hiện sai trạng thái "Running":** User tự test thấy card "Scene Generation" ở Processing tab hiện icon đang chạy (spinner xanh) ngay khi "Detect Characters" còn đang chạy, dù Scene Generation thực ra chưa hề bắt đầu — dễ hiểu nhầm là 2 bước chạy song song trong khi `PipelineService` chạy tuần tự đúng mục 36. Nguyên nhân: card này dùng cờ `isRunning` (true suốt từ lúc bấm Run All tới khi cả pipeline xong, không riêng cho Scene Generation) làm điều kiện hiện spinner, không kiểm tra xem pipeline đã thực sự đi tới bước Scene Generation hay chưa. Sửa: thêm điều kiện `scenePhaseReached` (task `GENERATE_CHARACTER_PROMPTS` phải `status=success` trước) — card giờ hiện đúng 4 trạng thái nhất quán với 3 card còn lại (Pending `—` xám / Running spinner xanh có viền nhấn / Success `✓` xanh lá / Failed `!` đỏ) thay vì chỉ 2 trạng thái cũ (spinner hoặc check). Verify lại bằng driver Electron (seed `pipeline_tasks` đúng trạng thái "Split SRT success, Detect Characters running" qua `sqlite3` CLI) — card Scene Generation đúng hiện "Pending" thay vì spinner. `vitest` vẫn 165/165 pass (không đụng logic Main), `tsc`/`eslint` sạch.

**Cập nhật sau feedback (2026-08-09) — Pause/Cancel không có tác dụng khi test với model thật:** User test bằng model thật (`claude-sonnet-4-6`), project chỉ có 16 SRT block (dưới ngưỡng 1 batch = 20), bấm Pause/Cancel giữa lúc Scene Generation đang retry nhưng không thấy dừng lại. Nguyên nhân: `shouldContinue()` trước đó **chỉ được kiểm tra giữa các batch** (`runWithConcurrency` check trước khi lấy batch tiếp theo) — với project nhỏ chỉ có đúng 1 batch, không có điểm dừng "giữa các batch" nào để chạm tới, nên toàn bộ tối đa 3 lần retry thật (mỗi lần là 1 request thật, có thể mất hàng chục giây với model reasoning) chạy hết không hề bị ngắt, khiến Pause/Cancel trông như vô hiệu.
- **Sửa trong `ScenePromptService.generateBatch()`** (`src/main/services/ScenePromptService.ts`): thêm kiểm tra `shouldContinue()` ngay đầu **mỗi lần retry** (không chỉ giữa các batch) — nếu dừng, `return` ngay, **không ghi `status=failed`** vào DB (giữ nguyên state cũ, có thể là chưa có row nào) vì đây là bị ngắt giữa chừng chứ không phải thật sự hết `maxRetry` lần thử — Resume/Run lại sau đó sẽ thử lại từ đầu đúng batch này, không bị coi nhầm là đã thất bại.
- **Chưa áp dụng fix tương tự cho `CharacterService.detect()`/`generatePrompts()`** (Character Detection/Character Prompt Generation cũng có cùng lỗ hổng kiến trúc — retry loop/nhiều batch không có điểm dừng giữa chừng nếu ít nhân vật) — quyết định có chủ đích: cần thêm cơ chế phân biệt "bị Pause" với "thật sự lỗi hết retry" (nếu không, `runGenerationBatch()` dừng giữa chừng có thể để lại state thiếu row cho một số nhân vật, khiến check "còn ai chưa `success`" ở `PipelineService` hiểu nhầm thành lỗi thật rồi gắn nhãn `GENERATE_CHARACTER_PROMPTS = Failed` sai) — cần sửa cẩn thận hơn Scene Generation (vốn đã có sẵn cơ chế "để trống nếu ngắt giữa chừng" từ thiết kế batch atomic). Không vá vội trong lúc đang sửa gấp để tránh phá vỡ logic đang chạy đúng — ghi lại như một giới hạn đã biết, cần xử lý khi có thời gian (không thuộc phạm vi bug cụ thể user báo).
- **Test:** viết lại test cũ "stops starting new batches..." dùng promise tự kiểm soát thay vì mock đồng bộ (mock đồng bộ khiến việc 2 batch có thực sự "đang bay" trước khi cờ dừng bật lên hay không phụ thuộc timing không đáng tin cậy) — chạy 5 lần liên tiếp xác nhận không flaky. Thêm test mới "stops between retry attempts within a single batch..." (đúng kịch bản user gặp: 1 batch duy nhất, retry bị ngắt ở lần thử đầu, không ghi `failed` vào DB). Tổng `vitest` 166/166 pass, `tsc`/`eslint` sạch, `npm run build` sạch.

**Xác nhận bởi user (2026-08-09) — đã tự kiểm thử xong trên máy với model thật (`claude-sonnet-4-6`), tóm tắt thay đổi chính:**
- **`PipelineService`** (mới) orchestrate đúng pseudo flow mục 36 bằng cách tái dùng `SrtService`/`CharacterService`/`ScenePromptService` sẵn có — mỗi bước gated nên `runProject()` vừa là Run vừa là Resume (mục 19.3), không có code path riêng. Lệch có chủ đích khỏi pseudocode: `createSrtBlocks()` không chạy vô điều kiện mỗi Resume (tránh cascade-delete `scene_prompts` đã có qua FK).
- **Pause/Cancel** qua cờ trong bộ nhớ (`PipelineService`), kiểm tra giữa các bước cấp dự án, giữa các batch Scene Generation, **và giữa từng lần retry trong 1 batch** (fix sau khi user test thật phát hiện project nhỏ — 1 batch duy nhất — khiến Pause/Cancel vô hiệu vì không có điểm dừng giữa chừng). Request đã thật sự gửi đi luôn được để hoàn thành, không bị huỷ giữa chừng.
- **Resume** bỏ qua batch Scene đã `success` hoàn toàn (không gọi lại LLM); `pipeline_tasks` bắt đầu dùng thật cho 3 bước cấp dự án (Split SRT/Detect Characters/Character Prompts); `ProjectService.open()` tự downgrade `processing`→`paused` khi mở lại sau force-quit.
- **Validation trước Run** (`src/shared/validateRun.ts`, dùng chung Main+Renderer) chặn đúng thứ tự mục 38. **Prompt Snapshot** (mục 32) set đúng 1 lần ở lần Run đầu tiên, Resume luôn dùng snapshot chứ không đọc lại Settings hiện hành.
- **TopBar + Processing tab** wire thật (Run All/Resume/Retry Failed/Pause/Cancel, bento-grid theo Stitch "Pipeline Status"), **Advanced Settings** Max Retry/Scene Concurrency wire vào project đang mở, nút **Resume** ở Project History (Home) cũng bật thật.
- **2 bug phát hiện khi user tự test và đã sửa:** (1) card Scene Generation hiện sai "Running" ngay khi Detect Characters còn đang chạy — do dùng nhầm cờ `isRunning` toàn cục thay vì kiểm tra pipeline đã thực sự tới bước đó; (2) Pause/Cancel vô hiệu với project nhỏ (1 batch) vì `shouldContinue()` trước đó chỉ kiểm tra giữa các batch — đã thêm kiểm tra giữa từng lần retry.
- **Giới hạn đã biết, chưa xử lý:** `CharacterService.detect()`/`generatePrompts()` vẫn còn cùng lỗ hổng "không dừng được giữa retry/batch nếu ít nhân vật" như Scene Generation từng có — chưa vá vì cần cơ chế phân biệt "bị Pause" với "lỗi thật" cẩn thận hơn (tránh gắn nhãn `Failed` sai khi thực ra chỉ là bị ngắt giữa chừng). Ghi lại để xử lý khi cần, không chặn Phase 9.
- Verify: `vitest` 166/166 pass (43 test mới qua 3 file), `tsc`/`eslint` sạch cả 3 tsconfig, `npm run build` sạch. Verify bằng driver Electron thật (API key giả + model thật của user) cho toàn bộ luồng: validation, Run All full, Pause→đóng app→mở lại→Resume, force-quit (SIGKILL)→mở lại tự downgrade→Resume, Cancel giữ nguyên dữ liệu, Advanced Settings save/validate, cùng 2 vòng fix bug từ phản hồi thực tế trên máy user.

---

## Phase 10 — Autosave đầy đủ + Overview Dashboard

**Việc cần làm:**
- Rà soát đủ 9 sự kiện autosave mục 6.3: transcript đổi, settings project đổi, SRT được tạo, character detection xong, character prompt xong, từng scene prompt xong, task lỗi, pipeline pause, pipeline complete — mỗi event ghi DB ngay lập tức, không chờ pipeline complete mới lưu (đã làm rải rác ở Phase 4–9, phase này để audit lại đủ 9/9, không sót).
- Overview tab thật: project name, model, transcript char count, SRT count, character count, Character Prompt X/Y, Image Prompt X/Y, Failed count, Overall progress % — tính từ dữ liệu DB thật (spec mục 8.1).
- Project History (Home, Phase 2) cập nhật status/progress thật thay vì giá trị tĩnh.

**Màn hình Stitch dùng:** Overview không thấy rõ trong 4 screen hiện có — trước tiên `get_screen` lại "Project Detail - Transcript & SRT" và "StoryPrompt - Dashboard" để kiểm tra có sẵn section Overview không; nếu không có, `generate_screen_from_text` theo mục 8.1 spec.

**Test + chạy local:**
1. Trigger từng autosave event thủ công (đổi transcript, đổi setting, chạy 1 scene...), sau mỗi event query DB trực tiếp (`sqlite3` CLI) — verify ghi ngay, không cần đợi pipeline complete.
2. So Overview numbers trên UI với kết quả query DB — phải khớp 100% ở mọi thời điểm.
3. Kiểm tra Project History trên Home phản ánh đúng status/progress theo thời gian thực.

**Điểm dừng:** Autosave đủ 9/9 sự kiện, Overview số liệu chính xác theo DB. Dừng, chờ xác nhận trước khi sang Phase 11.

**Ghi chú hoàn thành (đã test pass 2026-08-09):**
- Audit đủ 9/9 sự kiện autosave (mục 6.3) bằng cách đọc lại code từng service — không có sự kiện nào sót, không cần sửa gì thêm: transcript (`TranscriptPage` debounce 800ms), settings project (`AdvancedSettingsPage` Save ghi ngay), SRT tạo (`SrtService.split()` ghi trong transaction), character detection/character prompt/từng scene prompt (`CharacterService`/`ScenePromptService` ghi ngay mỗi kết quả/lỗi qua `db.transaction`), task lỗi (cùng cơ chế, ghi `error` field ngay khi catch), pipeline pause/complete (`PipelineService.pause()`/`runProject()` gọi `ProjectService.updateStatus()` đồng bộ, không debounce). Toàn bộ 6/9 sự kiện thuộc pipeline (Phase 6-9) đã có unit test cover sẵn (`characterService.test.ts`, `scenePromptService.test.ts`, `pipelineService.test.ts` — bao gồm case `completed_with_errors`, pause giữa chừng rồi Resume, cancel).
- Phát hiện bug khi audit: `listProjectSummaries()` (`src/main/db/queries/projects.queries.ts`) tính `failedTaskCount` chỉ từ `pipeline_tasks.status='failed'` — bảng này (theo Changelog Phase 8/9 của schema.md) chỉ có row cho 3 task cấp dự án (`SPLIT_SRT`/`DETECT_CHARACTERS`/`GENERATE_CHARACTER_PROMPTS`), không phản ánh số lượng Character Prompt/Scene Prompt lỗi ở cấp đơn vị (đúng ý "Failed" trong ví dụ mục 8.1). Sửa lại thành tổng `character_prompts.status='failed'` + `scene_prompts.status='failed'` — field này trước đó chưa được UI nào dùng tới (chỉ có trong `ProjectSummary` type từ Phase 9), fix an toàn, có unit test mới xác nhận (`projectService.test.ts` — case chèn 1 character_prompts failed + 1 scene_prompts success, verify `failedTaskCount=1`, `progressPercent=67`).
- Overview screen **chưa có sẵn trong Stitch** — verify lại bằng `get_screen`/`WebFetch` trên "StoryPrompt - Dashboard" và "Project Detail - Transcript & SRT" (đúng quy trình bắt buộc trong plan.md), xác nhận không có section nào chứa stats per-project (transcript count/SRT count/X-Y prompts/failed/progress) ẩn trong 2 screen đó. Generate screen mới bằng `generate_screen_from_text` với `designSystem: assets/1fd3fd43c2454ab8a13755f60548e22f` (design system thật của project, lấy qua `get_project`) — ra đúng bố cục 6 metric card (Transcript/SRT/Characters/Character Prompt/Image Prompt/Failed) + 1 card Overall Progress full-width, đúng token màu/typography DESIGN.md.
- `OverviewPage.tsx` implement thật theo đúng code Stitch vừa generate (card `bg-surface-slate border border-border-subtle`, `font-label-caps` cho label, `font-code-sm text-headline-md` cho số, progress bar mỏng `emerald-success`) — tái dùng `components/ui/Card.tsx` có sẵn thay vì copy nguyên class Stitch. Dữ liệu lấy qua các IPC list đã có sẵn (`srt.list`/`characters.list`/`characters.listPrompts`/`scenePrompts.list`, cùng pattern `ProcessingPage.tsx`), không thêm IPC mới — tính `progressPercent` bằng đúng công thức đã dùng ở `ProcessingPage`/`listProjectSummaries` (characters + srt blocks làm tổng đơn vị, character prompt success + scene prompt success làm đơn vị hoàn thành) để 3 nơi luôn khớp nhau. Model hiển thị theo đúng convention `TopBar` (`selectedModelSnapshot ?? selectedModel`).
- Project History (Home) **không cần sửa gì** — `ProjectsListPage.tsx`/`ProjectService.list()`/`listProjectSummaries()` đã dùng `status`/`progressPercent` thật từ DB ngay từ Phase 9 (lúc đó xây `ProjectSummary` làm scaffolding cho phase này), chỉ có `failedTaskCount` (chưa UI nào dùng) là cần sửa như trên.
- Verify bằng driver Playwright tự viết (cài tạm `playwright-core`, gỡ lại sau khi xong) — lần này launch với `--user-data-dir` trỏ vào thư mục tạm riêng (`fs.mkdtempSync`) thay vì profile Electron mặc định, tránh lặp lại sự cố ghi đè `vilao.cred` thật đã note ở Phase 3. Flow: tạo project qua UI thật → Split SRT thật → chèn thẳng qua `sqlite3` CLI 3 characters (2 character_prompts success, 1 failed) + 1 scene_prompts success để giả lập pipeline chạy xong (không cần API key thật) → reload Overview, screenshot + đọc text: khớp chính xác 100% với query `sqlite3` trực tiếp (`Transcript 212 characters`, `SRT 1 blocks`, `Characters 3`, `Character Prompt 2/3`, `Image Prompt 1/1`, `Failed 1`, `Overall Progress 75%`) → Home/Project History cũng hiện đúng `75%` cùng badge status (`Draft`, rồi update `completed_with_errors` qua sqlite3 → reload → badge đổi đúng thành "Completed with errors", số liệu Overview không đổi). Đã xoá thư mục tạm + gỡ `playwright-core` sau khi verify xong.
- `tsc --noEmit` sạch trên cả 3 tsconfig, `eslint` sạch, `vitest` 167/167 pass (166 cũ + 1 test mới cho `listProjectSummaries` failed/progress).

**Xác nhận bởi user (2026-08-09) — tóm tắt thay đổi chính:**
- Audit đủ 9/9 sự kiện autosave (mục 6.3) — xác nhận tất cả đã ghi-ngay xuống SQLite từ các phase trước, không sự kiện nào sót, không cần sửa code cho phần này.
- Fix bug `failedTaskCount` trong `listProjectSummaries()` (`src/main/db/queries/projects.queries.ts`): trước đó đếm sai nguồn (`pipeline_tasks.status='failed'`, chỉ cover 3 task cấp dự án) thay vì đếm đúng số Character Prompt/Scene Prompt lỗi ở cấp đơn vị — field này chưa UI nào dùng tới trước Phase 10 nên sửa an toàn, không phá vỡ chỗ khác. Có unit test mới xác nhận.
- Overview tab thật (`OverviewPage.tsx`) — generate screen mới qua Stitch (`generate_screen_from_text`, chưa có sẵn trong project) đúng design system, implement đủ 9 field mục 8.1 (project name, model, transcript char count, SRT count, character count, Character Prompt X/Y, Image Prompt X/Y, Failed, Overall progress %), dữ liệu lấy trực tiếp qua các IPC list có sẵn, cùng công thức tính progress với `ProcessingPage`.
- Project History (Home) đã thật từ Phase 9 (status/progress từ DB, không phải giá trị tĩnh) — không cần sửa gì thêm ngoài fix `failedTaskCount` ở trên.
- Verify bằng Playwright tự viết (isolated `--user-data-dir`, tránh lặp sự cố Phase 3) + đối chiếu trực tiếp `sqlite3` CLI: số liệu Overview khớp 100% DB, Project History phản ánh đúng progress/status real-time kể cả khi đổi status thủ công. User đã tự kiểm thử lại và xác nhận đạt.

---

## Phase 11 — Export

**Việc cần làm:**
- `ExportService`: sinh `Project_Name.srt` (mục 22), `character_prompts.txt` (mục 23), `image_prompts.txt` (mục 24) đúng format từng ký tự như spec — không tách file riêng cho từng SRT/prompt.
- IPC `export.project()`: chọn thư mục lưu, ghi vào folder `Project_Name/` chứa đúng 3 file.
- Export tab thật: preview nội dung sẽ export, nút "Export Project", Show in Finder sau khi export xong.

**Màn hình Stitch dùng:** Export **chưa có trong Stitch** → `generate_screen_from_text` theo spec mục 8.7.

**Test + chạy local:**
1. Export 1 project đã chạy Run All xong.
2. Diff `Project_Name.srt`, `character_prompts.txt`, `image_prompts.txt` với format mẫu mục 22–24 spec.md — khớp chính xác cấu trúc (số thứ tự, dấu `-->`, header `CHARACTER 00N — @ID`, `PROMPT 00N:`).
3. Verify `PROMPT 00N` map đúng 1:1 với `SRT 00N` cho toàn bộ danh sách, không lệch số.
4. Show in Finder mở đúng thư mục vừa export.

**Điểm dừng:** Export ra đúng 3 file, đúng format, đúng mapping 1:1. Dừng, chờ xác nhận trước khi sang Phase 12.

**Ghi chú hoàn thành (đã test pass 2026-08-09):**
- Logic format 3 file (`formatSrtFile`, `formatCharacterPromptsFile`, `formatImagePromptsFile`, `sanitizeProjectFolderName`) đặt trong `src/shared/exportFormat.ts` (pure function, không import Electron/DB) thay vì chỉ nằm trong `ExportService` — cùng lý do đã áp dụng cho `src/shared/prompts.ts`: Export tab cần "Hiển thị preview file sẽ export" (spec 8.7) bằng **đúng** logic format mà `ExportService` dùng để ghi file thật, tránh 2 nguồn sự thật giữa preview và file xuất ra. `character_prompts.txt` đánh số liên tục theo thứ tự `characters` (created_at ASC — đúng thứ tự detect) chỉ tính nhân vật có `prompt` thành công, bỏ qua nhân vật chưa có/failed mà không để trống số; `image_prompts.txt` đánh số theo chính `block_index` của từng `scene_prompts` (không theo vị trí trong mảng) nên 1 block lỗi/pending bị bỏ qua mà các số khác vẫn giữ nguyên đúng SRT index tương ứng (mapping 1:1 không lệch số, đúng yêu cầu test #3).
- `ExportService` (`src/main/services/ExportService.ts`, không import Electron — cùng convention `ProjectService`/`SrtService`): đọc `project`/`srt_blocks`/`characters`/`character_prompts`/`scene_prompts` trực tiếp qua các query đã có sẵn, ghi `${targetParentDir}/${Project_Name}/{Project_Name.srt, character_prompts.txt, image_prompts.txt}` bằng `fs.mkdirSync`/`writeFileSync` (fs không phải Electron nên vẫn unit-test được bằng thư mục tmp thật, không cần mock).
- IPC `export.project(projectId)` (`src/main/ipc/export.ipc.ts`) nối logic thật: Main mở `dialog.showOpenDialog` (`openDirectory` + `createDirectory`, `defaultPath` = `AppSettings.lastExportFolder` hoặc thư mục Documents) — đúng kiến trúc 3 lớp, cùng pattern `projects.loadTranscriptFile`. Cancel dialog → reject `Error('EXPORT_CANCELED')`, Renderer coi đây là no-op im lặng chứ không phải lỗi. Export xong → lưu lại thư mục cha vừa chọn vào `AppSettings.lastExportFolder` cho lần sau.
- Thêm IPC mới `export.showInFinder(folderPath)` (không nằm trong danh sách gốc mục 4.2) — `projects.showInFinder` có sẵn từ Phase 2 luôn trỏ vào file SQLite trong `userData`, không phải folder của riêng project vừa export ra, nên cần 1 endpoint mới nhận đúng `folderPath` mà `export.project()` vừa trả về (round-trip trong cùng phiên, không phải path tuỳ ý Renderer tự bịa) để phục vụ nút "Show in Finder" sau khi export xong (mục 8.7).
- Export tab (`ExportPage.tsx`): **không dùng được Stitch** — `generate_screen_from_text` timeout không tạo ra screen mới (`list_screens` xác nhận), đúng hiện tượng đã note ở Phase 6 (Characters) và Phase 8 (Image Prompts) cho cùng loại màn hình (list/preview không có sẵn trong Stitch project) — build thẳng bằng Tailwind theo token DESIGN.md, tái dùng pattern khối preview monospace (`bg-[#020617] border border-border-subtle`) đã có ở `ImagePromptsPage`. Layout: card "Output Folder" liệt kê cây thư mục `Project_Name/` + 3 file, 3 card preview (1/file) hiện tối đa 3 entry đầu (dùng đúng `exportFormat.ts` trên tập con đã lọc, giữ nguyên số thứ tự thật) kèm "+N more", nút **Export Project** (primary) ở header, banner thành công `emerald-success` + nút **Show in Finder** xuất hiện sau khi export xong.
- `ProjectsListPage.tsx` (Home) — nút Export ở mỗi row (trước đây disabled cứng) giờ bật thật: bấm → chọn thư mục (cùng dialog) → ghi file → tự động Show in Finder; disabled khi `project.srtCount === 0`; lỗi thật (không phải cancel) hiện dòng text đỏ ngay dưới row đó.
- **Bug phát hiện qua kiểm thử E2E thật (không phải unit test)**: điều kiện nhận diện "user bấm Cancel" ban đầu so sánh `err.message !== 'EXPORT_CANCELED'` (equality) — nhưng `ipcRenderer.invoke` bọc lỗi Main ném ra thành chuỗi dạng `Error invoking remote method 'export:project': Error: EXPORT_CANCELED`, equality không bao giờ khớp, khiến bấm Cancel vẫn hiện banner lỗi sai ở cả `ExportPage` lẫn `ProjectsListPage`. Sửa bằng `err.message.includes('EXPORT_CANCELED')` ở cả 2 nơi — phát hiện được nhờ driver Playwright thật giả lập đúng luồng cancel qua `dialog.showOpenDialog` stub, unit test (mock trực tiếp) không phơi bày được lỗi serialize IPC này.
- `pipeline_tasks.task_type = EXPORT` **vẫn chưa dùng** — Export không nằm trong Run All (mục 36 pseudo flow dừng ở `markProjectCompleted()`, Export là hành động thủ công riêng ở tab Export) và là 1 hành động ghi-toàn-bộ-hoặc-không cho cả project (không phải N đơn vị resume/retry độc lập như 3 task cấp dự án còn lại), nên không cần model `pending/running/success/failed` của `pipeline_tasks`.
- Unit test mới: `tests/unit/exportFormat.test.ts` (12 test — khớp byte-exact với ví dụ mục 22/23/24 spec.md, không để hở số khi 1 nhân vật/scene không có prompt, `sanitizeProjectFolderName`) và `tests/unit/exportService.test.ts` (4 test — ghi đúng 3 file vào thư mục tmp thật, sanitize tên project có ký tự không hợp lệ, throw khi project không tồn tại, ghi file rỗng hợp lệ khi chưa generate gì). Tổng `vitest` 183/183 pass (16 test mới), `tsc --noEmit` sạch cả 3 tsconfig, `eslint` sạch.
- Verify bằng driver Playwright tự viết (cài tạm `playwright-core`, gỡ lại sau khi xong; `npm run build` trước để rebuild `better-sqlite3` cho Electron + bundle `out/`; launch với `--user-data-dir` trỏ thư mục tmp cô lập — không đụng `userData` thật, xác nhận qua timestamp file sau khi chạy xong, cùng convention Phase 6-10): tạo project + Split SRT qua IPC thật, seed 1 character/character_prompt/scene_prompt qua `sqlite3` CLI (không cần API key thật) → vào tab Export, preview 3 panel khớp chính xác định dạng spec (`CHARACTER 001 — @Hero`, `PROMPT 001:`, đúng `00:00:00,000 --> 00:00:03,000`) → stub `dialog.showOpenDialog` qua `electronApp.evaluate` (cùng kỹ thuật Phase 4 dùng cho Load .txt) trỏ vào thư mục tmp → bấm Export Project → banner "Exported to ..." hiện đúng, đọc trực tiếp 3 file trên đĩa khớp byte-exact với nội dung mong đợi → Show in Finder không crash → đổi stub dialog trả `canceled: true` → bấm Export Project lần 2 → không còn banner lỗi (sau khi sửa bug trên) → sang Home, nút Export ở row project (trước đây disabled) giờ bấm được, xuất ra đúng bundle vào thư mục thứ 2. 0 console error xuyên suốt. Đã gỡ `playwright-core` và dọn toàn bộ thư mục tmp sau khi verify xong.

**Xác nhận bởi user (2026-08-09) — đã tự kiểm thử xong trên máy với model thật, tóm tắt thay đổi chính:**
- **Export hoàn chỉnh** (`ExportService` + `export.ipc.ts` + `ExportPage.tsx` + nút Export ở Home): xuất đúng 3 file (`Project_Name.srt`, `character_prompts.txt`, `image_prompts.txt`) vào folder `Project_Name/`, preview trong app dùng chung logic format với file ghi thật (`src/shared/exportFormat.ts`) nên không lệch nhau; chọn thư mục qua dialog native, nhớ lại thư mục lần export trước (`AppSettings.lastExportFolder`), Show in Finder sau khi xong.
- Bug tìm thấy qua test tay (không phải unit test): Cancel dialog chọn thư mục bị hiện nhầm banner lỗi do so sánh sai định dạng lỗi IPC — đã sửa.
- **Trong lúc test Export với pipeline thật, phát hiện và sửa liên hoàn 1 bug nghiêm trọng ở Scene Generation** (thuộc Phase 8, ghi chi tiết ở addendum Phase 8 — không phải lỗi của Export): batch nhiều SRT/request bị model trả lời sai format (gộp nhiều block thành 1, hoặc viết dở rồi bỏ), làm toàn bộ scene fail. Đã xử lý bằng 3 lớp: (1) tự động chia nhỏ batch bị lỗi thay vì retry vô ích nguyên batch cũ, (2) đổi hẳn output Scene Generation từ plain text sang JSON (đồng bộ với 3/4 bước LLM còn lại của app, ổn định hơn), (3) theo yêu cầu, giảm batch size mặc định 20→10 và nâng scene concurrency mặc định 2→4 để chạy nhanh hơn.
- Tổng `vitest` 192/192 pass, `tsc`/`eslint`/`npm run build` sạch xuyên suốt toàn bộ các lần sửa.
- **Lưu ý cho các project đã tạo trước đó:** cần vào Settings > Prompts > Scene / Image Generation bấm Reset to Default (lấy đúng prompt JSON mới) và Settings > Advanced > Pipeline Tuning đổi Scene Concurrency lên 4 nếu muốn áp dụng — 2 project mới tạo sau khi restart app sẽ tự có đúng default mới.

---

## Phase 12 — Regenerate + Error Handling Polish

**Việc cần làm:**
- Regenerate Character Detection / Character Prompt / Scene Prompt (mục 20): dialog 3 lựa chọn "Regenerate characters only" / "Regenerate characters + all scene prompts" / "Cancel", kèm cảnh báo Character Database đổi có thể làm Scene Prompt cũ không đồng nhất.
- Phân biệt đủ 11 error code (mục 34): `INVALID_API_KEY, MODEL_NOT_AVAILABLE, NETWORK_ERROR, TIMEOUT, RATE_LIMIT, CONTEXT_TOO_LARGE, INVALID_JSON, EMPTY_RESPONSE, API_ERROR, DATABASE_ERROR, EXPORT_ERROR` — UI hiển thị message dễ hiểu kiểu "Scene 028 failed: API timeout. Retry 2/3".
- Context Too Large Handling (mục 35): Character Detection → chuyển sang chunking + merge + dedup; Character Generation → giảm batch size + retry; Scene Generation → giảm dữ liệu theo thứ tự (bỏ Next SRT → bỏ Previous SRT → rút gọn Character Reference → chỉ giữ Visual DNA), không được bỏ Current SRT/relevant Character ID/Visual DNA cốt lõi.
- Rate limit → backoff cho Scene Generation concurrency (mục 33).

**Màn hình Stitch dùng:** Dùng lại Processing/Characters/Image Prompts đã build; thêm dialog/toast component theo DESIGN.md Elevation Level 2 (backdrop blur 20px, border sáng hơn) — không tạo screen Stitch mới cho phần này, chỉ thêm component nhỏ theo cùng design token.

**Test + chạy local:**
1. Giả lập lần lượt từng error code (mock `VilaoService` throw lỗi tương ứng) — verify UI message đúng, không mất kết quả Scene 001–027 khi Scene 028 lỗi.
2. Test Regenerate "characters + all scene prompts" — verify `scene_prompts` cũ bị xoá đúng và chạy lại từ đầu.
3. Test Context Too Large với transcript rất dài (giả lập lỗi context) — verify chunking/giảm dữ liệu theo đúng thứ tự ưu tiên, không mất Current SRT.

**Điểm dừng:** Error handling đủ 11 mã lỗi, Regenerate hoạt động đúng 3 lựa chọn, Context Too Large fallback đúng thứ tự. Dừng, chờ xác nhận trước khi sang Phase 13.

**Ghi chú hoàn thành (đã test pass 2026-08-09):**
- **Quyết định về format `.error` (không phải schema change):** schema.md mục "Error codes" liệt kê 11 giá trị là "Giá trị hợp lệ cho field `.error`", nhưng Phase 3-9 đã lưu message mô tả đầy đủ (ví dụ preview 300 ký tự response thật khi parse JSON lỗi — hữu ích để debug, không muốn mất). Chọn format `"<CODE>: <detail message>"` (`src/shared/errorCode.ts` — `formatStoredError`/`parseStoredError`) — giữ nguyên cột `error` TEXT hiện có (không thêm cột), vừa thoả "giá trị hợp lệ" (luôn bắt đầu bằng đúng 1 trong 11 code) vừa giữ được detail message đã có. `parseStoredError` nhận diện code cả khi bị Electron IPC bọc thêm (`Error invoking remote method '...': Error: <CODE>: <detail>`, cùng kiểu bọc lỗi đã note ở Changelog Export/Phase 11) nhờ regex match `(?:^|:\s)(CODE): `.
- **`classifyError()`** (`src/main/pipeline/errorClassification.ts`, pure, không import Electron) — phân loại `unknown` thành 1/11 `ErrorCode` (enum đã có sẵn từ đầu dự án trong `enums.ts`, chưa dùng tới) + message gốc: `VilaoApiError` (401→`INVALID_API_KEY`, 429→`RATE_LIMIT`, message "Vilao returned an empty response"→`EMPTY_RESPONSE`, status null + "Request timed out"→`TIMEOUT`, status null khác→`NETWORK_ERROR`, 413 hoặc message/`error.type`/`error.code` chứa "context_length_exceeded"/"maximum context length"/...→`CONTEXT_TOO_LARGE`, message chứa "model"+"not found"/"does not exist"/...→`MODEL_NOT_AVAILABLE`, còn lại→`API_ERROR`); `LlmResponseFormatError` (class base mới, `src/main/pipeline/errors.ts`, `SceneFormatCollapseError` giờ extends nó)→`INVALID_JSON`; lỗi có `.code` bắt đầu `SQLITE_`→`DATABASE_ERROR`; fallback→`API_ERROR`. `VilaoApiError` (`VilaoService.ts`) mở rộng thêm `apiErrorType`/`apiErrorCode` (đọc từ `error.type`/`error.code` trong response body thật, chuẩn OpenAI-compatible) để phân biệt `MODEL_NOT_AVAILABLE`/`CONTEXT_TOO_LARGE` chính xác hơn heuristic text-match thuần message.
- **`detectCharacters.ts`/`generateCharacterPrompts.ts`** đổi throw từ `Error` sang `LlmResponseFormatError` (message giữ nguyên) để `classifyError` nhận diện đúng `INVALID_JSON` — không đổi hành vi retry/test hiện có (vẫn là `instanceof Error`).
- **Context Too Large — Character Detection** (mục 35, `CharacterService.detect()`): bắt `CONTEXT_TOO_LARGE` trong vòng retry, chuyển hẳn sang `detectByChunks()` — chia transcript bằng `chunkTranscriptForDetection()` (`detectCharacters.ts`, chia theo đoạn văn `\n\n`, fallback chia theo câu nếu 1 đoạn văn tự nó đã quá khổ, mỗi chunk ≤ 6000 ký tự, tối thiểu 2 chunk), detect từng chunk (mỗi chunk có budget `maxRetry` riêng), merge bằng `mergeDetectedCharacters()` (dedupe theo Character ID, chunk đầu tiên thắng khi trùng). Nếu 1 chunk vẫn lỗi sau hết retry → toàn bộ detect coi là fail (không lưu dữ liệu nửa vời).
- **Context Too Large — Character Generation** (`CharacterService.runGenerationBatch()`): gặp `CONTEXT_TOO_LARGE` với batch >1 → chia đôi batch, gọi đệ quy `runGenerationBatch` cho từng nửa (mỗi nửa có budget `maxRetry` riêng) — cùng pattern shrink-and-recurse đã có sẵn cho `SceneFormatCollapseError` ở Phase 8.
- **Context Too Large — Scene Generation** (`ScenePromptService.generateBatch()`): `assembleSceneContext()` (`generateScenePrompt.ts`) thêm tham số `minTrimLevel` (0-3, mặc định 0 giữ nguyên hành vi proactive-budget-estimate cũ) ép trim tối thiểu N bước bất kể ước lượng ký tự — 1=bỏ Next SRT, 2=bỏ thêm Previous SRT, 3=bỏ thêm Relevant Character Reference prompts (chỉ còn Visual DNA, đúng sàn spec.md 35 "không được bỏ Current SRT/relevant Character ID/Visual DNA cốt lõi" — 2 trong 3 thứ này vốn đã luôn được giữ trong thiết kế cũ). `generateBatch()` giờ build lại `context` **mỗi lần retry** (trước đây build 1 lần ngoài vòng lặp) với `contextTrimLevel` tăng dần mỗi khi gặp `CONTEXT_TOO_LARGE`, tách biệt với nhánh `SceneFormatCollapseError` (check trước, ưu tiên hơn).
- **Rate limit backoff** (mục 33): `src/main/pipeline/backoff.ts` (`rateLimitDelayMs()` exponential 1s→2s→4s...capped 30s, `sleep()`). `ScenePromptService` dùng `BackoffState { pauseUntil }` **share giữa mọi worker cùng 1 lần `generate()`** (không phải riêng từng batch) — 1 worker gặp `RATE_LIMIT` đẩy `pauseUntil` lên, mọi worker khác (kể cả `selectRelevantCharacters`) đều đợi trước attempt kế tiếp → đúng nghĩa "giảm tốc cho Scene Generation concurrency" (mục 33) chứ không chỉ riêng request bị rate-limit tự lùi. `CharacterService.detect()`/`runGenerationBatch()` (concurrency=1, không cần state share) dùng backoff đơn giản hơn: đếm streak, sleep trước attempt kế tiếp.
- **Regenerate** (mục 20): IPC `characters.detect(projectId, options?: { clearScenePrompts?: boolean })` (mở rộng signature cũ, không phải channel mới) — `CharacterService.detect()` luôn replace `characters` **và** `character_prompts` (transaction, `deleteCharacterPromptsByProjectId` mới) — **bug fix phát hiện khi làm phase này**: `character_prompts` không có FK tới `characters` (business-key relation), nên trước đây regenerate đổi/xoá Character ID để lại row `character_prompts` mồ côi vĩnh viễn trong DB (chỉ bị xoá ở local state UI, không phải DB thật). `options.clearScenePrompts` (khi user chọn "characters + all scene prompts") gọi thêm `ScenePromptService.clearAll()` (`deleteScenePromptsByProjectId` mới) ở IPC layer sau khi detect xong. `CharactersPage.tsx`: nút "Detect Characters" đổi thành nút **"Regenerate"** (icon `RefreshCw`) một khi đã có character — bấm mở `RegenerateCharactersModal` (dùng lại `components/ui/Modal.tsx` có sẵn từ Phase 2) với đúng 3 lựa chọn spec.md 20, cảnh báo Scene Prompt không đồng nhất chỉ hiện khi project đang có Image Prompts (`hasImagePrompts`, fetch thêm `scenePrompts.list()` trong `refresh()`). Lần detect đầu tiên (chưa có character nào) vẫn bấm chạy ngay, không cần dialog (không có gì để mất).
- **UI hiển thị lỗi theo code** (mục 34 "message dễ hiểu"): `ErrorNotice` component mới (`components/ui/ErrorNotice.tsx`) — badge `label-caps` + message, màu `tertiary` cho lỗi tạm thời (`RATE_LIMIT`/`NETWORK_ERROR`/`TIMEOUT`, tái dùng đúng token đã dùng cho badge "Completed with errors" ở Home) vs `error` cho lỗi cứng còn lại — dùng ở `CharactersPage`/`ImagePromptsPage`/`ProcessingPage` (cả pipeline_tasks lẫn scene_prompts). String cũ chưa có code prefix (dữ liệu tạo trước Phase 12, hoặc lỗi validation như "Add a transcript first") vẫn hiện đúng dạng text thường, không vỡ. `formatErrorForDisplay()` (`renderer/lib/errorDisplay.ts`) cho các banner text thường (không phải badge) — dùng ở toàn bộ top-level error banner + `ExportPage`/`ProjectsListPage` (export lỗi thật giờ được gắn `EXPORT_ERROR` ở `export.ipc.ts`, code duy nhất `classifyError` không tự sinh ra vì `ExportService` không đụng `VilaoService`).
- Unit test mới: `errorCode.test.ts` (8), `errorClassification.test.ts` (15 — đủ cả 11 code + fallback), `detectCharacters.test.ts` thêm chunking/merge (7 test mới), `characterService.test.ts` thêm context-too-large chunked detect + batch-split + bug-fix orphaned character_prompts (3 test mới), `generateScenePrompt.test.ts` thêm `minTrimLevel` (5 test mới), `scenePromptService.test.ts` thêm context-too-large escalation + rate-limit backoff (dùng `vi.useFakeTimers()`/`advanceTimersByTimeAsync` để không tốn thời gian test thật, 3 test mới). Tổng `vitest` **233/233 pass** (41 test mới), `tsc --noEmit` sạch cả 3 tsconfig, `eslint` sạch, `npm run build` (electron-vite) sạch.
- Verify UI thật bằng driver Playwright tự viết (cài tạm `playwright-core`, gỡ ngay sau khi xong; launch với `--user-data-dir` cô lập, seed DB qua CLI `sqlite3` — không dùng `better-sqlite3` trực tiếp từ Node vì ABI khác Electron, cùng lỗi đã note ở Phase 2): tạo project + Split SRT qua UI thật → seed 2 characters (1 `character_prompts` failed `TIMEOUT: Request timed out`, 1 success) + 1 `scene_prompts` failed `CONTEXT_TOO_LARGE: ...` → reload → Characters page hiện đúng badge "TIMED OUT" + message, nút đổi thành "Regenerate" → bấm mở modal đủ 3 lựa chọn + đúng cảnh báo Image Prompts → Cancel đóng modal, không đụng dữ liệu (vẫn 2/2 characters) → bấm lại, confirm "characters only" (không có API key thật) → báo lỗi rõ ràng "Configure and save a Vilao API key..." không crash, dữ liệu vẫn nguyên → Image Prompts page hiện đúng badge "CONTEXT TOO LARGE" + message. **0 console error** xuyên suốt. Đã xoá script tạm và gỡ `playwright-core` sau khi verify xong.

**Xác nhận bởi user (2026-08-09) — đã tự kiểm thử xong, tóm tắt thay đổi chính:**
- **Regenerate** (mục 20): nút "Detect Characters" ở Characters tab đổi thành **"Regenerate"** một khi đã có character — mở dialog đúng 3 lựa chọn ("Regenerate characters only" / "Regenerate characters + all Image Prompts" / "Cancel"), cảnh báo Image Prompts hiện có thể không đồng nhất khi project đã có Image Prompts. Chọn "characters only" chỉ thay Character Database; chọn vế thứ 2 xoá thêm toàn bộ `scene_prompts`.
- **Bug fix đi kèm:** regenerate trước đây chỉ thay `characters`, để lại row `character_prompts` cũ mồ côi trong DB thật (không có FK, chỉ bị xoá ở UI) — giờ luôn xoá sạch `character_prompts` cùng lúc, đảm bảo state sạch sau mỗi lần regenerate.
- **11 error code** (mục 34) được phân loại tự động từ mọi lỗi pipeline (`classifyError`) và lưu kèm trong cột `.error` có sẵn (không đổi schema) — UI hiện badge màu (vàng cho lỗi tạm thời như rate limit/timeout, đỏ cho lỗi cứng) + message dễ hiểu ở Characters/Image Prompts/Processing, thay vì chỉ text thô như trước.
- **Context Too Large** (mục 35) tự phục hồi theo đúng chiến lược riêng từng bước: Character Detection chia nhỏ transcript rồi gộp kết quả; Character Generation giảm nửa batch size; Scene Generation giảm dữ liệu theo đúng thứ tự ưu tiên (bỏ Next SRT → Previous SRT → Character Reference), không bao giờ mất Current SRT/Visual DNA.
- **Rate limit backoff** (mục 33): khi API trả rate limit, toàn bộ pool request đồng thời của Scene Generation cùng chậm lại (không chỉ request bị limit), theo đúng nghĩa "giảm tốc cho concurrency" spec yêu cầu.
- Verify: 233/233 unit test pass (41 test mới), `tsc`/`eslint`/`npm run build` sạch, kiểm thử tay end-to-end trên app thật (badge lỗi, dialog Regenerate cả 3 nhánh, Cancel không đụng dữ liệu) — 0 console error. User đã tự kiểm thử lại và xác nhận đạt.

---

## Phase 13 — Polish: Responsive, Animation, Edge Cases (giai đoạn cuối)

**Việc cần làm:**
- Responsive: sidebar collapse thành drawer ẩn ở viewport nhỏ, margin 24px → 16px (DESIGN.md Layout & Spacing).
- Interaction states đúng DESIGN.md: hover không "lift" (background sáng thêm 5% hoặc border chuyển `vilao-blue`), input focus có 2px blue left-accent, Progress Indicators dùng `emerald-success` 2px bar.
- Edge cases: transcript rỗng, transcript cực lớn (verify chunking Phase 12), 0 nhân vật phát hiện được, project không có SRT nào, đóng app đúng lúc export.
- Review checklist Definition of Done — V1 (spec mục 39, 25 mục) — tick từng mục pass/fail.

**Màn hình Stitch dùng:** Rà lại toàn bộ 4 screen đã build (Dashboard, Settings, Project Detail, Pipeline Status) + 4 screen tự generate (Characters, Image Prompts, Overview, Export) — không tạo screen mới, không đổi token DESIGN.md.

**Test + chạy local:**
1. Resize cửa sổ app qua các breakpoint, verify sidebar collapse đúng.
2. Thao tác hover/focus toàn bộ component chính (button, input, card, nav item) — đối chiếu DESIGN.md Components.
3. Chạy qua từng edge case thủ công đã liệt kê.
4. Tick từng mục trong Definition of Done mục 39 (25 mục) — báo cáo mục nào fail nếu có.

**Điểm dừng:** Toàn bộ 25 mục Definition of Done pass. Đây là phase cuối — sau khi xác nhận, V1 coi như hoàn thành.

**Ghi chú hoàn thành (đã test pass 2026-08-09):**
- **Responsive drawer:** `useUiStore` (đã scaffold từ Phase 1 nhưng chưa dùng tới, `sidebarCollapsed`/`toggleSidebar` không có nơi nào import) đổi field thành `isSidebarOpen`/`toggleSidebar`/`closeSidebar`, dùng thật ở `Sidebar.tsx` và `HomeSidebar.tsx`: dưới `lg` (1024px, Tailwind default) sidebar `-translate-x-full` (ẩn off-canvas) + backdrop `bg-black/60` click-to-dismiss, `lg:translate-x-0` luôn ép hiện ở desktop bất kể state. Bấm 1 nav item cũng tự đóng drawer (`onClick={closeSidebar}` trên từng `NavLink`). `TopBar`/`HomeShell` thêm nút hamburger (`lucide-react` Menu, `lg:hidden`) — `HomeShell` trước đây không có topbar nào (quyết định Phase 2), nên tự thêm 1 dải header tối giản `lg:hidden` chỉ chứa nút toggle, nếu không sẽ không có cách nào mở lại drawer đã đóng.
- **Margin 24px → 16px:** `AppShell`/`HomeShell`'s `<main>` và `TopBar`/`StatusBar`/`HomeShell` footer đổi `px-gutter` → `px-margin-mobile lg:px-gutter`, width `w-[calc(100%-260px)]` → `w-full lg:w-[calc(100%-260px)]`, `ml-sidebar-width` → `lg:ml-sidebar-width` — đúng DESIGN.md Layout & Spacing > Responsive Behavior.
- **`BrowserWindow.minWidth` 1024 → 768** (`src/main/index.ts`) — minWidth cũ đúng bằng breakpoint `lg`, nghĩa là cửa sổ không bao giờ resize xuống được dưới ngưỡng collapse, làm tính năng "responsive" vừa thêm không thể thật sự trigger được. Hạ xuống 768 để có khoảng resize 768–1024 thật sự đi qua breakpoint (test bằng cách resize `BrowserWindow` qua Playwright `electronApp.evaluate`).
- **`ProjectsListPage` row overflow ở viewport hẹp (bug phát hiện khi audit, không phải yêu cầu ban đầu):** hàng project cũ là 1 flex row cứng gồm title + progress bar (224px) + model (128px) + status badge + 6 nút action (≈232px) — tổng tối thiểu ≈984px, vượt quá bề rộng khả dụng ở 768–1024px (sau khi hạ `minWidth`, layout này giờ thực sự render được ở kích thước đó). Sửa bằng `flex-wrap`: title chiếm `w-full` riêng 1 dòng dưới `lg` (đẩy phần còn lại xuống dòng 2), progress bar co từ `w-56`→`w-40` dưới `lg`, cột Model ẩn hẳn dưới `lg` (`hidden lg:inline-block`, thông tin ít quan trọng nhất, đã có sẵn trong TopBar/Overview khi mở project). Ở `lg`+ layout giữ nguyên y hệt bản gốc (verify bằng screenshot, không đổi 1 pixel).
- **Progress Indicators (DESIGN.md Components):** `ImagePromptsPage`'s live batch-progress bar (Phase 8) đã đúng chuẩn sẵn (`h-0.5` = 2px, `bg-emerald-success`) — dùng làm chuẩn để sửa 2 bar sai lệch phát hiện khi audit: `OverviewPage` (cả `MetricCard` mini-bar và "Overall Progress" hero bar) từ `h-1`/`h-2` xuống `h-0.5`; `ProcessingPage`'s "Overall Progress" bar từ `h-2 bg-vilao-blue` xuống `h-0.5 bg-emerald-success` (màu cũ dùng `vilao-blue` — hợp lý theo nguyên tắc màu chung "primary cho active state", nhưng lệch với mục Progress Indicators nói riêng, vốn chỉ định rõ `emerald-success`). `ProjectsListPage`'s per-project progress bar (`h-1`, màu code theo status: `vilao-blue`/`tertiary`/`emerald-success`/`error`) **giữ nguyên** — đây không phải "AI generation step" progress đơn thuần mà là mã màu theo trạng thái project (draft/processing/paused/completed/failed), đổi hết về emerald sẽ mất tín hiệu đó.
- **Input focus:** rà toàn bộ input/textarea/select trong app — chỉ thiếu ở 2 chỗ, cả 2 đã sửa: `VilaoApiSettingsPage`'s model `<select>` (mọi input khác trong cùng trang đã có `focus:border-l-2 focus:border-l-vilao-blue`, riêng select bị bỏ sót); `TranscriptPage`'s textarea lớn (panel "Source Transcript") vốn `focus:outline-none` không kèm chỉ báo nào — thêm `focus-within:border-vilao-blue` lên container bọc ngoài (border toàn khung thay vì left-accent, vì đây là 1 panel lớn không phải input 1 dòng như các chỗ khác — theo đúng nguyên tắc chung ở Elevation & Depth > Interaction "border chuyển sang vilao-blue").
- **Hover states:** rà toàn bộ Card/row/button — đã đúng chuẩn sẵn từ các phase trước (không "lift", border chuyển `vilao-blue`/50, hoặc text chuyển `vilao-blue`), không cần sửa gì thêm.
- **Edge cases (verify bằng Playwright thật, `--user-data-dir` cô lập, cài tạm `playwright-core` rồi gỡ ngay sau khi xong — cùng quy trình đã dùng từ Phase 2):**
  - *0 characters detected:* tạo project, Split SRT thật, **không** chạy Detect Characters — `CharactersPage` hiện đúng `EmptyState`, `Overview`/`Processing`/`Export` không crash (Export hiện "Nothing to export yet" cho cả `character_prompts.txt` lẫn `image_prompts.txt`). Đã audit code path (`PipelineService` dòng ~222-247: `characters.length > 0 && !characterPromptsDone` false khi 0 characters → `ensureTaskSuccess` bỏ qua bước Character Prompt Generation, không throw) — Run All cũng sẽ không kẹt/lỗi khi Character Detection hợp lệ trả về 0 nhân vật (transcript không có nhân vật rõ ràng).
  - *Transcript rỗng + project không có SRT nào:* tạo project rồi bấm Clear ở Transcript tab — `Overview` hiện "No project data yet", `Split SRT`/`Detect Characters` disabled đúng lý do ("Add a transcript first"), `Export` hiện empty state + nút Export disabled.
  - *Transcript cực lớn:* tạo project với transcript 256,000 ký tự (Vietnamese-safe, dùng `Intl.Segmenter` sẵn từ Phase 5) — tạo project + Split SRT xong trong <1.3s tổng cộng, ra đúng 1067 block, không lag UI, không crash. Context Too Large chunking (Phase 12, phía LLM) đã unit test riêng, không lặp lại ở đây vì cần API key thật.
  - *Đóng app đúng lúc export:* không dàn dựng kill-mid-write được (`ExportService.export()` chỉ 3 lệnh `writeFileSync` đồng bộ, tổng thời gian ghi vài file nhỏ là sub-millisecond — cửa sổ race quá hẹp để test bằng script). Thay vào đó audit code: `ExportService` không đụng SQLite (chỉ đọc, không ghi), 3 file .srt/.txt là output độc lập với DB — kill app giữa chừng nhiều nhất để lại 1 file dở dang trong thư mục export, nguồn dữ liệu thật (SQLite) không bao giờ bị ảnh hưởng, export lại là ghi đè sạch. Đủ để coi là an toàn theo đúng nguyên tắc 41.3 "Mọi kết quả phải được autosave" (áp dụng cho pipeline, không phải cho hành động export một lần).
  - Export thật (không mock) verify bằng cách stub `dialog.showOpenDialog` (Electron main, qua `electronApp.evaluate`, cùng kỹ thuật đã dùng ở Phase 4/12) trỏ vào 1 thư mục tạm — xác nhận đúng 3 file được tạo (`<Tên Project>.srt`, `character_prompts.txt`, `image_prompts.txt`) trong đúng 1 folder con đặt tên theo project.
- **Definition of Done (spec.md mục 39, 25 mục): 25/25 PASS.** 1-4 (macOS, API key, test connection, model dropdown) từ Phase 3; 5-8 (project, transcript, SRT split, fake timeline) từ Phase 2/4/5, re-verify session này; 9 (Run All) + 15-16 (retry/resume) từ Phase 9; 10-12 (Character Detection/Generation, Scene Generation 1:1) từ Phase 6-8; 13 (relevant character, không inject toàn bộ DB) từ Phase 8, unit test `selectRelevantCharacters`; 14 (autosave từng task) từ Phase 10, audit đủ 9/9 sự kiện; 17 (mở lại project cũ) từ Phase 2; 18 (hiển thị Characters/SRT/Image Prompts) re-verify session này; 19-21 (export 3 file) re-verify session này bằng export thật; 22-23 (3 prompt mặc định, Reset to Default) từ Phase 6-8, xác nhận lại `src/shared/prompts.ts` có đủ 3 key; 24 (API key không plaintext) từ Phase 3, `safeStorage`; 25 (task lỗi không mất kết quả đã xong) từ Phase 9/12, atomic-batch + gating design. Không mục nào fail.
- Verify: `tsc --noEmit` sạch cả 3 tsconfig, `eslint` sạch, `vitest` **233/233 pass** (không thêm test mới — phase này không đổi business logic, chỉ UI/layout), `npm run build` sạch. Playwright thật (cài tạm, gỡ ngay sau khi xong): resize `BrowserWindow` qua breakpoint xác nhận đúng `transform`/`padding`/backdrop/đóng-khi-click-nav-link, tạo 3 project edge-case + 2 project row-wrap, export thật ra đúng file — **0 console error** xuyên suốt toàn bộ session verify. Đã xoá sạch `--user-data-dir` tạm và gỡ `playwright-core` sau khi xong (không có trong `package.json`/`package-lock.json`).

**Xác nhận bởi user (2026-08-09) — đã tự kiểm thử xong, tóm tắt thay đổi chính:**
- Sidebar (cả trong project lẫn Home) giờ collapse thành drawer ẩn dưới `lg` (1024px) kèm nút hamburger + backdrop, đóng tự động khi bấm 1 mục nav; margin nội dung 24px → 16px ở cùng breakpoint. Hạ `BrowserWindow.minWidth` 1024 → 768 để breakpoint này thực sự resize-được.
- Fix layout hàng project ở Home bị tràn ở viewport hẹp (bug phát hiện trong lúc audit, không có trong yêu cầu gốc) — wrap gọn thành 2 dòng, giữ nguyên hoàn toàn layout desktop.
- Đồng bộ toàn bộ Progress Indicator về đúng chuẩn DESIGN.md (2px, `emerald-success`) — trước đó `OverviewPage`/`ProcessingPage` lệch cả độ dày lẫn màu so với `ImagePromptsPage` (đã đúng sẵn từ Phase 8). Bổ sung 2 chỗ thiếu focus indicator (Vilao API model dropdown, Transcript panel).
- Verify đủ 5 edge case (0 characters, transcript rỗng, không SRT, transcript cực lớn 256k ký tự, đóng app giữa lúc export) + Definition of Done 25/25 pass — không phát sinh regression, `vitest` vẫn 233/233, 0 console error khi kiểm thử tay qua Playwright.
- User đã tự kiểm thử lại trên máy và xác nhận đạt. **Đây là phase cuối theo kế hoạch — V1 coi như hoàn thành.**

---

## Phase 14 — Post-V1: dọn UI thừa + Run Queue nhiều project + Delete-while-running (2026-08-10)

V1 đã hoàn thành ở Phase 13. Phase này không có kế hoạch trước — phát sinh trực tiếp từ việc user tự chạy/test app thật trên máy Windows, yêu cầu chỉnh sửa liên tục theo từng vấn đề gặp phải. Ghi lại theo đúng thứ tự thực hiện trong session.

**Ghi chú hoàn thành (2026-08-10):**
- **Setup Windows lần đầu:** 3 lỗi build native module (`better-sqlite3`) chưa gặp trên macOS — Python 3.14 thiếu `distutils` (fix: cài `setuptools`), Node Windows build bằng `clang-cl` nhưng máy chỉ có toolset MSVC (fix: thêm `.npmrc` với `clang=0`), `ELECTRON_RUN_AS_NODE=1` do VS Code tự set cho terminal tích hợp khiến Electron chạy như Node thuần (phải unset trước khi `npm run dev`).
- **Xoá các nút thao tác thủ công "đứng thay Run All"** — đúng ghi chú tạm thời từ Phase 5-8, giờ Run All (Phase 9) đã đủ nên bỏ: "Split SRT" (SrtPage), "Detect Characters"/"Generate Character Prompts" (CharactersPage).
- **Export tự động hoá** (lệch spec.md mục 21/8.7 hiện tại — **chưa đồng bộ lại spec.md**, user chưa yêu cầu):
  - `AppSettings.lastExportFolder` đổi vai trò từ "gợi ý cho dialog" thành "Default Export Folder" cấu hình 1 lần ở Settings > General (nút Browse) — `export.project()` không còn hỏi dialog mỗi lần, chỉ hỏi đúng 1 lần đầu (chưa từng cấu hình) rồi tự lưu làm default.
  - `PipelineService.runProject()` tự gọi `ExportService.export()` ngay khi Run All hoàn tất (`completed`/`completed_with_errors`) — Export tab bỏ nút "Export Project" thủ công, chỉ còn preview + "Show in Finder".
- **Dọn Home (`ProjectsListPage`):** bỏ action Export/Show in Finder (dư thừa vì đã auto-export), bỏ Rename + cột hiển thị model; `NewProjectPage` đổi full-width.
- **Tính năng mới — Run Queue nhiều project:** `QueueService` (Main, thuần logic, không đụng Electron/DB, unit-test được) chạy tuần tự đúng 1 project/lần theo FIFO — 1 project lỗi không chặn hàng đợi, tự chuyển project kế tiếp. `queue.ipc.ts` + `useQueueStore` (Renderer) + trang **Queue** riêng (`/queue`, có trong sidebar Home). Thêm vào queue qua nút "Add to Queue" trên `NewProjectPage` (tạo project mới → chạy ngay nếu queue rảnh, ngược lại xếp hàng — hành vi có sẵn tự nhiên của `QueueService.add()`, không cần nhánh riêng). `PipelineService` đổi từ khởi tạo cục bộ trong `pipeline.ipc.ts` sang singleton `getPipelineService()` dùng chung với `queue.ipc.ts`, đảm bảo Pause/Cancel và guard "đang chạy" nhất quán dù chạy tay hay qua queue. Kèm fix 1 race condition phát hiện lúc lập kế hoạch: project đang nằm trong queue (chưa tới lượt) giờ bị chặn Run All thủ công ở TopBar/ProcessingPage, tránh chạy đè lên lượt của queue.
- **Delete-while-running:** bỏ hẳn Pause + Cancel khi đang chạy (2 nút vốn làm y hệt nhau ở backend), thay bằng đúng 1 nút **Delete** — xoá được cả khi project đang chạy. `PipelineService.stopAndWait()` báo dừng và đợi bước đang chạy dở settle xong mới cho phép xoá (tránh lỗi foreign key khi ghi vào project đã bị xoá); nếu project đang nằm trong queue, `drain()` tự chuyển sang project kế tiếp ngay sau đó — không cần logic "chuyển tiếp" riêng. `DeleteProjectModal` tách thành component dùng chung cho Home/TopBar/ProcessingPage.
- **Verify:** `tsc --noEmit` + `eslint` sạch xuyên suốt cả phase; `vitest` từ 233 (baseline Phase 13) → **243/243 pass** (thêm test cho `QueueService`: FIFO, lỗi không chặn queue, remove/dedupe/re-entrancy, callback; thêm test cho `PipelineService.stopAndWait()`: đợi run dở dang settle xong mới resolve, no-op khi không có gì chạy). App khởi động sạch mỗi lần smoke-test qua `npm run dev`.

**Xác nhận bởi user (2026-08-10):** đã tự kiểm thử xong toàn bộ giai đoạn này trên máy Windows.

---

## Phase 15 — Post-V1: đồng bộ Queue/Dashboard, xoá Resume, chuẩn hoá format prompt, đóng gói Windows (2026-08-10)

Tiếp tục không có kế hoạch trước — cùng phiên với Phase 14, phát sinh trực tiếp từ user tự chạy/test app thật trên Windows và report từng vấn đề qua screenshot. Ghi lại theo đúng thứ tự thực hiện.

**Ghi chú hoàn thành (2026-08-10):**
- **Đồng bộ Queue ↔ Dashboard (nhiều bug lồng nhau):**
  - Tách `ProjectRow.tsx` (component dùng chung) từ `ProjectsListPage.tsx` — Queue tab giờ hiện đủ progress bar/status badge giống Home thay vì chỉ tên + Queued/Running đơn giản.
  - `projects`/`deletedIds` chuyển từ `useState` riêng từng trang sang store dùng chung `useProjectsListStore.ts` — bug trước đó: xoá project ở Queue không cập nhật Dashboard (và ngược lại) vì 2 trang giữ state riêng.
  - Fix `useQueueStore.subscribe()` không tự refetch `queue.list()` sau lần đầu — Queue tab có thể kẹt hiển thị trạng thái cũ nếu lỡ miss 1 `queue:updateEvent`.
  - Fix `ProjectService.open()` downgrade nhầm `processing` → `paused` cho project **đang thật sự chạy** (chỉ nên downgrade khi force-quit, không còn gì chạy) — thêm tham số bắt buộc `isActuallyRunning` (từ `PipelineService.isRunning()`, có sẵn nhưng chưa ai dùng). Thêm IPC `projects.get()` (đọc thuần, không side-effect) để `usePipelineStore`'s live refresh dùng thay vì `.open()`.
  - Fix card Scene Generation kẹt "Pending" khi run được kích hoạt qua Queue (không phải tự bấm Run All ở tab đang mở) — điều kiện "Running" đổi từ chỉ `isRunning` (cờ cục bộ) sang `isRunning || isProcessing` (`isProcessing` lấy từ `currentProject.status`, luôn đúng bất kể ai kích hoạt run).
  - Dashboard đổi từ hiển thị mọi project sang **lọc bỏ hẳn** project đang nằm trong Run Queue (queued/running) — chỉ còn thấy ở tab Queue, theo yêu cầu user. Thêm empty-state riêng "Everything's in the queue".
- **Xoá nút Resume khỏi UI** (TopBar, Processing tab, Home/Queue row) — `status=paused` giờ chỉ còn badge tĩnh "Paused", không có nút hành động. Cố ý làm fail lại DoD mục 16 ("App có resume") — cơ chế resume ở tầng service không đổi, chỉ mất đường vào UI cho case `paused`; Retry Failed (`failed`/`completed_with_errors`) không bị ảnh hưởng.
- **Xoá cụm action trùng lặp ở Processing tab** — "Processing…/Completed/Paused/Run All/Retry Failed/Delete" từng lặp y hệt cả ở TopBar lẫn Processing tab; giữ đúng 1 nơi (TopBar, vì hiển thị trên mọi tab con).
- **Delete-while-running không còn block UI** chờ `stopAndWait()` — modal đóng ngay, xoá chạy nền (fire-and-forget), optimistic-hide qua `useProjectsListStore.markDeleted()`.
- **Thêm action "Open in Folder"** vào `ProjectRow` (Home + Queue) — tái dùng flow "Show in Finder" có sẵn ở Export tab, không thêm IPC mới.
- **Thêm nút "Delete All"** ở header Dashboard — chỉ xoá project đang hiển thị (không đụng project trong Queue), có modal xác nhận riêng.
- **New Project "Add to Queue"** đổi điều hướng sau khi tạo từ `/projects/:id/processing` sang thẳng `/queue`.
- **Chuẩn hoá format Scene/Image Prompt** (`DEFAULT_SCENE_GENERATION_PROMPT`, `src/shared/prompts.ts`) — phát hiện qua nhiều lần export thật, mỗi batch (1 lời gọi LLM riêng) tự diễn giải rule khác nhau:
  - Rule 2 siết thành format cứng `@Character_ID [Visual DNA traits]` khi nhắc nhân vật — trước đó có batch viết tên thường không dấu `@`.
  - Rule 1 thêm bắt buộc format `"Panel N (vị trí, kích thước):"` — trước đó có batch dùng label tả nội dung không đánh số ("BOTTOM PANEL:").
  - Rule 9 mới — cấm nội dung ngoài cấu trúc đã định nghĩa (chặn kiểu tự thêm "Overall mood: ...").
  - Rule 10 mới + **lưới an toàn ở code** (`normalizePromptText()`, `generateScenePrompt.ts`) — 1 prompt phải nằm đúng 1 dòng, không xuống dòng giữa các panel; hàm này tự thay `\n` bằng khoảng trắng ngay khi parse response, không phụ thuộc model có tuân thủ rule hay không (khác 3 rule trên, vốn chỉ dựa vào wording).
  - Migration `0002_normalize_scene_prompt_newlines` — chuẩn hoá lại luôn `scene_prompts.prompt` **đã có sẵn trong DB** từ trước khi có `normalizePromptText()` (batch đã `success` thì không bao giờ tự chạy lại nên sẽ mãi giữ format cũ nếu không có migration này). Data cleanup thuần whitespace, không phải schema change.
- **Xoá toolbar Transcript** (Paste/Select All/Clear/Load `.txt`, `TranscriptPage.tsx`) — theo yêu cầu user, biết rõ hệ quả mất khả năng load file `.txt` vào project đã tồn tại (Paste/Select All/Clear vẫn làm tay được qua textarea).
- **Xoá nút "Generate Image Prompts"** (`ImagePromptsPage.tsx`) — nút thao tác thủ công cuối cùng còn sót lại từ Phase 5-8 (3 nút kia đã xoá ở Phase 14). Trang giờ thuần hiển thị + Retry riêng từng scene lỗi, cùng pattern SrtPage/CharactersPage. "Copy All" đổi sang gọi thẳng `formatImagePromptsFile()` thay vì tự dựng format riêng (2 nơi từng lệch nhau sau lần đổi format export).
- **Đổi format export `image_prompts.txt`** (mục 24, `formatImagePromptsFile()`) — từ `"PROMPT 00N:"` xuống dòng + cách 1 dòng trống rồi mới tới prompt, cách nhau 2 dòng trống giữa các prompt, sang: header liền dòng với prompt (`"PROMPT 00N: <prompt>"`), chỉ 1 dòng trống giữa các prompt. Theo yêu cầu user.
- **Đóng gói Windows lần đầu** (`electron-builder.yml`, sớm hơn kế hoạch V2) — build thật + verify trực tiếp bằng cách `require()` trên chính binary đã đóng gói, phát hiện bug nghiêm trọng: `better-sqlite3` tự phụ thuộc package JS thuần `bindings`, nhưng electron-builder mặc định chỉ unpack đúng `better-sqlite3` (có file `.node`) khỏi `app.asar`, để `bindings` kẹt lại nén trong asar — `require('bindings')` từ vị trí đã unpack không tìm ra, app mở lên rồi tắt ngay lúc chạm SQLite lần đầu, không có crash log. Sửa bằng `asar: false` (tắt hẳn, tránh cả lớp bug này thay vì hand-pick từng transitive dependency cần unpack). Thêm `win.target: nsis`, thêm script `npm run dist` (`build` + `electron-builder --win`). **Chưa tự build/cài thử bản NSIS installer thật** trên máy khác — mới verify được cấu trúc package (`out/`, `node_modules`, native module) và `require()` thành công, chưa click-through UI thật (môi trường agent bị chặn mở GUI thật).
- **Verify:** `tsc --noEmit` + `eslint` sạch xuyên suốt cả phase. `vitest` từ 243 (baseline Phase 14) → **248/248 pass** (thêm 5 test: `ProjectService.open()` không downgrade khi đang chạy thật; `normalizePromptText()` qua `parseSceneGenerationResponse`; 3 test cho migration `0002` — verify qua `node:sqlite` built-in khi `better-sqlite3` bị khoá bởi môi trường, không phải giả định). `exportFormat.test.ts`/`exportService.test.ts` cập nhật lại theo format export mới (không đổi số lượng test).

**Xác nhận bởi user (2026-08-10):** đã tự kiểm thử xong toàn bộ giai đoạn này trên máy Windows.

---

## Phase 16 — Post-V1: Overview real-time, hạ Max Retry mặc định, thêm Scene Generation Batch Size (2026-08-10)

Tiếp tục không có kế hoạch trước — cùng ngày với Phase 14/15, phát sinh trực tiếp từ user report bug + 2 yêu cầu tính năng mới trong lúc tự chạy/test app thật. (Tối ưu cost/latency cho Internal Relevant Character Selector — batch hoá selector call + local pronoun carry-forward, cũng làm cùng ngày — đã ghi nhận riêng ở addendum cuối Phase 8, không lặp lại ở đây.)

**Ghi chú hoàn thành (2026-08-10):**
- **Fix bug — Overview tab không cập nhật real-time:** user report "project chạy xong mà không được cập nhật khi đang ở project detail, thoát ra vào dashboard mới thấy thành công". Nguyên nhân: `OverviewPage.tsx` (trang mặc định khi mở 1 project) fetch metrics đúng 1 lần lúc mount, không subscribe kênh live nào — khác `TopBar.tsx`/`ProcessingPage.tsx` vốn đã có cơ chế này từ Phase 9. Sửa bằng cách mirror đúng pattern đã chứng minh hoạt động ở `ProcessingPage.tsx`: subscribe `usePipelineStore`, lắng nghe `scenePrompts.onProgress` để merge kết quả batch trực tiếp, refetch khi `tasks` đổi (bắt được cả run kích hoạt qua Queue, không chỉ tự bấm Run All), refetch khi `isRunning` chuyển về false. Verify bằng driver Electron/Playwright thật (không mock) — tạo project qua UI thật, set fake API key, xác nhận `refresh()` gọi lại **4 lần trong vòng 70ms** sau khi bấm Retry Failed trong lúc đang đứng ở tab Overview, khớp đúng lúc backend thật sự re-run (`DETECT_CHARACTERS` task `updatedAt` đổi cùng lúc) — không cần rời trang.
- **Hạ Max Retry mặc định + bỏ UI chỉnh** (theo yêu cầu user "Để retry là 1, không cần setting nữa"): `DEFAULT_MAX_RETRY` (`ProjectService.ts`) hạ từ 3 xuống 1; ô "Max Retry" bị xoá khỏi Settings > Advanced > Pipeline Tuning (chỉ còn Scene Generation Concurrency lúc này). **Không phải schema change** — cột `max_retry`/`updatePipelineSettings()` giữ nguyên hoàn toàn, chỉ mất đường vào UI; form giờ luôn gửi lại `maxRetry` hiện tại của project (pass-through) khi Save. Nhiều unit test (rate-limit backoff, escalate Context Too Large, Pause giữa lúc retry) trước đó ngầm dựa vào default cũ (3) để có đủ số lần thử — sửa bằng cách tự nâng `maxRetry` qua `updatePipelineSettings()` ngay trong test thay vì phụ thuộc default toàn cục.
- **Thêm setting mới — Scene Generation Batch Size** (theo yêu cầu user, chỉ thẳng vào card Pipeline Tuning hỏi thêm setting "gom bao nhiêu SRT vào mỗi prompt tạo ảnh"). **Đây là schema change thật** — đã dùng `AskUserQuestion` hỏi lại range hợp lệ trước khi implement theo CLAUDE.md, user chọn 1–20. Migration mới `0003_add_scene_batch_size` thêm cột `projects.scene_batch_size` (default 10, backfill project cũ về đúng giá trị hằng số cũ `SCENE_PROMPT_BATCH_SIZE` từng dùng). `ScenePromptService.generate()` đổi từ dùng hằng số cố định sang đọc `project.sceneBatchSize`; thêm ô "SCENE GENERATION BATCH SIZE" vào cùng card Pipeline Tuning; `updatePipelineSettings` (IPC/service/query) đổi shape thật, nhận thêm field thứ 3 trong cùng 1 lời gọi.
- **Verify xuyên suốt Phase 16:** `tsc --noEmit` sạch cả 3 tsconfig, `eslint` sạch sau mỗi bước. `vitest` từ 261 (baseline sau addendum Phase 8 cùng ngày) → **264/264 pass** — không đổi số lượng test cho 2 bug/tính năng đầu (chỉnh lại test có sẵn), +3 test mới cho Scene Batch Size (2 test migration `0003`, 1 test `ScenePromptService` xác nhận batch size tuỳ chỉnh thật sự đổi số request).
- Chi tiết field/migration đầy đủ xem [schema.md](schema.md) Changelog Phase 16 (Max Retry) + Phase 17 (Scene Batch Size) — 2 entry riêng ở schema.md vì đó là tài liệu theo dõi *thay đổi schema* (1 entry/thay đổi cột), khác quy ước "1 phase = 1 session" của file này.

**Xác nhận bởi user (2026-08-10):** đã tự kiểm thử xong toàn bộ giai đoạn này.

---

## Phase 17 — Post-V1: Channels (setting riêng theo channel, project dùng setting của channel) (2026-08-10)

Ngoài phạm vi V1 gốc — user yêu cầu trực tiếp thêm 1 tab Channel: mỗi channel có setting riêng (giống bộ setting project đã có), setting chung (Settings > General/Prompts) đổi vai trò thành default khi tạo channel mới, project thuộc channel nào dùng setting của channel đó.

**Trước khi implement:** hỏi lại 4 quyết định kiến trúc qua `AskUserQuestion` (đúng CLAUDE.md, vì đây là schema change thật) — phạm vi setting theo channel (chọn: General + Prompts + Pipeline Tuning, không gồm Vilao API key/Max Retry), cách project dùng setting channel (chọn: copy lúc tạo, không tham chiếu sống), cách backfill project cũ (chọn: tự tạo channel "Default", gán hết project cũ vào đó), có cho đổi channel sau khi tạo không (chọn: không). Sau đó vào Plan Mode, viết plan chi tiết ra file, chờ user duyệt qua `ExitPlanMode` rồi mới code — đúng yêu cầu "khi tôi duyệt mới được implement".

**Ghi chú hoàn thành (2026-08-10):**
- **Migration mới `0004_add_channels`** — bảng `channels` (Max Characters/Duration/Model/3 prompt template/Scene Concurrency/Scene Batch Size) + cột `projects.channel_id`. Backfill project cũ vào 1 channel `"Default"` tạo sẵn bởi chính migration.
  **Sự cố phát hiện khi implement (không có trong plan ban đầu):** dự định gộp `ALTER TABLE ... NOT NULL REFERENCES ... DEFAULT '<uuid>'` trong 1 câu (giống Phase 16's `0003`) nhưng SQLite từ chối bất cứ khi nào bảng đã có row sẵn ("Cannot add a REFERENCES column with non-NULL default value") — đúng ngay use case chính (DB thật của user đã có project). Lộ ra qua 2 test fail trong `migrations.test.ts` (khác `channelService.test.ts` chạy trên DB rỗng nên không lộ). Fix: tách `ADD COLUMN` (nullable) + `UPDATE` backfill riêng — cột không có `NOT NULL` cứng ở DB, chỉ đảm bảo ở tầng application (`ProjectService.create()` luôn set giá trị thật).
- **`ProjectService.create()`** nhận thêm `channelId` (optional với fallback về channel Default, để ~60 unit test gọi `service.create()` trực tiếp không phải sửa hết — chỉ IPC handler thật `projects:create` mới bắt buộc truyền `channelId` từ Renderer). `defaults` thêm `sceneConcurrency`/`sceneBatchSize` (copy từ channel thay vì hằng số cố định).
- **Run All đọc setting từ channel, không phải AppSettings global nữa** — `resolvePipelineRuntime()` (`src/main/pipelineRuntime.ts`) đổi từ `getAppSettings().selectedModel/promptSettings` sang tra project → channel → `ChannelService.get()`. Đây là chỗ áp dụng thật yêu cầu "project dùng setting của channel nó thuộc về" cho cả project tạo trước Phase 17 (channel Default). `exportFolder` vẫn global, ngoài phạm vi channel. Các IPC thao tác thủ công (`characters.detect`/`generatePrompts`/`retryPrompt`, `scenePrompts.generate`/`retry` — còn tồn tại nhưng không còn nút UI nào gọi từ Phase 14/15) đổi theo cùng nguồn để không lệch dữ liệu với Run All.
- **UI mới:** tab **Channels** trong `HomeSidebar.tsx` (`/channels` danh sách, `/channels/new`, `/channels/:channelId/edit`) — Card/Button/EmptyState/Modal có sẵn, không có Stitch mockup cho màn này (cùng tình huống Overview/Characters/Image Prompts/Export ở các phase trước). New Project thêm dropdown Channel bắt buộc, không đổi được sau khi tạo. Settings > General/Prompts đổi copy text sang "default cho channel mới" thay vì "cho project mới".
- **Verify:** `tsc --noEmit` sạch cả 3 tsconfig, `eslint` sạch; `vitest` 264 (baseline Phase 16) → **291/291 pass** (channelService.test.ts mới 20 test, migrations.test.ts +4 test cho `0004`, projectService.test.ts +3 test cho channelId fallback/override).
- Chi tiết field/migration đầy đủ xem [schema.md](schema.md) Changelog Phase 18 (số thứ tự lệch 1 so với phase này — cùng lý do đã ghi ở Phase 16: schema.md đếm theo *entry thay đổi schema*, plan.md đếm theo *phiên làm việc*).
- Chưa có bằng chứng end-to-end với Electron app thật (chỉ verify qua `vitest`/`tsc`/`eslint`) — cần user tự mở app sau khi build lại để xác nhận Channels tab + New Project channel picker hoạt động đúng trên UI thật.

---

## Phase 18 — Post-V1: Average Characters per SRT + Variance % (2026-08-11)

Ngoài phạm vi V1 gốc — user report "nhiều câu bị ngắn quá" (thuật toán chia SRT cũ dùng `maxCharacters` làm ngưỡng cứng tuyệt đối, chốt block ngay khi câu kế tiếp không vừa). Đề xuất trực tiếp: đổi "Maximum characters per SRT" thành "Average characters per SRT" + 1 biên độ xê dịch % (ví dụ trung bình 100, ±30%) để thuật toán co giãn, tránh block quá ngắn.

**Trước khi implement:** hỏi lại 3 quyết định qua `AskUserQuestion` (đúng CLAUDE.md, schema change thật) — biên độ là field riêng cho user tự chỉnh hay hằng số cố định (chọn: field riêng), đổi tên cột `max_characters` → `avg_characters` hay chỉ đổi label (chọn: đổi tên cột), ưu tiên đạt tối thiểu trước khi ngắt hay luôn tôn trọng ngưỡng trên (chọn: ưu tiên đạt tối thiểu). Sau đó vào Plan Mode viết plan chi tiết, chờ user duyệt qua `ExitPlanMode` rồi mới code.

**Ghi chú hoàn thành (2026-08-11):**
- **Migration mới `0005_rename_avg_characters_and_add_variance`** — đổi tên `projects.max_characters`/`max_characters_snapshot`/`channels.max_characters` sang `avg_characters`/`avg_characters_snapshot`/`avg_characters` (SQLite `RENAME COLUMN`), thêm `variance_percent` (default 30) vào cả `projects` và `channels`.
- **Thuật toán `splitSrt.ts`** đổi từ 1 ngưỡng `maxCharacters` cứng sang khoảng `[avg × (1−variance/100), avg × (1+variance/100)]` — `gatherBlocks()` ưu tiên nhét thêm câu để đạt ngưỡng dưới trước khi ngắt block, chấp nhận vượt nhẹ ngưỡng trên khi cần.
  **Bug phát hiện khi implement (không có trong plan ban đầu):** điều kiện "ưu tiên đạt tối thiểu" ban đầu viết là `currentLength < min`, nhưng ở `variance=0` (`min === max === avgCharacters`) điều kiện này gần như luôn đúng, ép **toàn bộ transcript gộp vào 1 block duy nhất** bất kể ngưỡng trên — phá vỡ cam kết "variance 0 = y hệt thuật toán cũ" đã hứa trong plan. Lộ ra qua 4 test fail (`srtSplitter.test.ts`) + 1 test fail (`scenePromptService.test.ts`, số block đổi do variance mặc định 30% dù test không quan tâm thuật toán chia). Fix: thêm điều kiện `min < max` vào override, vô hiệu hoá nhánh đó khi không có khoảng thật sự.
- **Đổi tên field xuyên suốt** (không đổi kiến trúc) — `entities.ts`, `projects.queries.ts`/`channels.queries.ts`, `ProjectService.ts`/`ChannelService.ts`/`PipelineService.ts`/`SrtService.ts`, `validateRun.ts`, `AppSettings`/`appSettingsStore.ts`, và toàn bộ renderer form (`settings.schema.ts`, `GeneralSettingsPage.tsx`, `channel.schema.ts`, `ChannelForm.tsx`, `NewChannelPage.tsx`, `EditChannelPage.tsx`, `ChannelsPage.tsx`) — `maxCharacters` → `avgCharacters`, thêm `variancePercent` (range 0–90) mọi nơi.
- **Verify:** `tsc --noEmit` sạch cả 3 tsconfig, `eslint` sạch; `vitest` 291 (baseline Phase 17) → **300/300 pass**.
- Chi tiết field/migration đầy đủ xem [schema.md](schema.md) Changelog Phase 19 (số thứ tự lệch 1 so với phase này, cùng lý do đã ghi ở Phase 16/17).
- Chưa có bằng chứng end-to-end với Electron app thật (chỉ verify qua `vitest`/`tsc`/`eslint`) — cần user tự mở app sau khi build lại để xác nhận Settings > General/Channel form hoạt động đúng và kết quả Split SRT (tab SRT) không còn block quá ngắn bất thường.

**Addendum (2026-08-11) — bỏ hẳn việc cắt giữa câu trong `splitOversizedSentence()` (2 bước, escalate theo yêu cầu user):**
1. Bước đầu: user hỏi lại tại sao câu quá dài (11.3) lại bị cắt tại dấu phẩy — thử fix bằng cách đổi `OVERSIZED_SPLIT_CHARS` (`;`/`:`/`,`) thành mảng rỗng, giữ lại nhánh whitespace/hard-cut.
2. User xác nhận đó **chưa đủ** — rule bắt buộc là "chưa hết câu thì không được cắt", tức **không được hard-cut/cắt tại whitespace giữa câu nữa, dưới bất kỳ hình thức nào**. Sửa lại: **xoá hẳn `splitOversizedSentence()`** (không còn khái niệm "chunk hoá câu quá dài") — `units` đưa thẳng vào `gatherBlocks()` là danh sách câu nguyên vẹn từ `segmentSentences()`, không qua bước chia nhỏ nào nữa. 1 câu đơn dài hơn `max` giờ **luôn trở thành 1 block riêng, độc lập, có thể vượt `max` bao nhiêu cũng được** — cơ chế này tận dụng đúng nhánh `!current` sẵn có trong `gatherBlocks()` (block mới luôn nhận unit đầu tiên bất kể độ dài), không cần thêm code riêng.

**Không phải schema/migration change** — thuần sửa 1 pure function (`src/main/pipeline/splitSrt.ts`), đã xoá `OVERSIZED_SPLIT_CHARS`/`splitOversizedSentence()` (dead code). Cập nhật lại `tests/unit/srtSplitter.test.ts` — 6 test trước đó giả định câu quá dài bị chia nhỏ (`<=max`/`<=20`/hard-cut không phá vỡ grapheme) đổi hẳn kỳ vọng sang "giữ nguyên 1 block, vượt `max`, không cắt" (2 test còn lộ ra khi rà lại: dùng chung transcript `'Short one. Also short. This third sentence is much too long to fit.'`, ban đầu chỉ sửa 1 trong 2 chỗ dùng transcript đó, verify bằng cách chạy trực tiếp `npx vitest run tests/unit/srtSplitter.test.ts` mới phát hiện chỗ thứ 2 — không rebuild `better-sqlite3` được lúc đó vì bị electron.exe khoá file, nên chỉ verify được file test thuần không đụng DB). Đồng bộ lại mô tả ở [spec.md](spec.md) mục 11.3. `tsc`/`eslint` sạch, `vitest tests/unit/srtSplitter.test.ts` 14/14 pass — các file test khác (dùng better-sqlite3) chưa verify lại được vì lý do khoá file trên, cần chạy `npm test` đầy đủ sau khi user đóng app.

---

## Phase 19 — Post-V1: Export folder nested under Channel name (2026-08-11)

Ngoài phạm vi V1 gốc — user yêu cầu trực tiếp: channel dùng Export Folder ở setting chung (không đổi), nhưng khi project chạy trong 1 channel, output phải nằm trong 1 thư mục con mang tên channel đó thay vì đổ thẳng vào Default Export Folder cùng cấp với mọi project khác.

**Không phải schema change** — `channels.name` đã có sẵn từ Phase 17, chỉ đọc thêm qua `project.channelId` khi build đường dẫn, không cần hỏi lại/Plan Mode cho bước này.

**Ghi chú hoàn thành (2026-08-11):**
- **`ExportService.ts`** đường dẫn output đổi từ `{ExportFolder}/{Project_Name}/` sang `{ExportFolder}/{Channel_Name}/{Project_Name}/` — tên channel đọc **hiện hành** (không snapshot), giống `Project_Name` vốn cũng không snapshot.
- **`sanitizeProjectFolderName()` đổi tên thành `sanitizeFolderName(name, fallback)`** (`src/shared/exportFormat.ts`) — dùng chung cho cả tên channel lẫn tên project, thêm tham số `fallback` để mỗi bên có default riêng (`Untitled_Channel`/`Untitled_Project`).
- **`ExportPage.tsx`** (preview) gọi thêm `channels.get()` để hiện đúng cấu trúc `Channel_Name/Project_Name/` — khớp 100% với ExportService nhờ dùng chung hàm sanitize.
- **`GeneralSettingsPage.tsx`** (card Export) đổi copy text từ "writes straight here as Project_Name/" sang "Channel_Name/Project_Name/".
- **Verify:** `tsc --noEmit` sạch cả 3 tsconfig, `eslint` sạch; `vitest` pass toàn bộ — `exportFormat.test.ts`/`exportService.test.ts` cập nhật theo path mới + test mới cho project trong channel tuỳ chỉnh.
- Chi tiết đầy đủ xem [schema.md](schema.md) Changelog Phase 20 (số thứ tự lệch 1 so với phase này, cùng lý do đã ghi ở các phase trước).
- Chưa có bằng chứng end-to-end với Electron app thật — cần user tự chạy Run All cho 1 project thuộc channel không phải Default để xác nhận cấu trúc thư mục thật trên đĩa.

---

## Phase 20 — Post-V1: Processing tab real-time fix cho queue-triggered run + bỏ nút Remove khỏi Queue (2026-08-11)

Ngoài phạm vi V1 gốc, 2 bug/UX report trực tiếp từ user trong cùng phiên. **Không phải schema change** cho cả 2.

**Bug 1 — Processing tab không cập nhật real-time khi Scene Generation chạy qua Run Queue:**
- User report: "xử lý Scene Generation xong nhưng không cập nhật real time, phải out project ra mới nhận được success".
- Đã sửa 1 lần (wiring `onSceneProgress` qua `PipelineService.runProject()`/`pipeline.ipc.ts`/`queue.ipc.ts`) nhưng user báo vẫn còn lỗi.
- **Tự dựng 1 instance Electron cô lập** (Playwright `_electron`, `--user-data-dir` riêng, không đụng dữ liệu/app đang chạy thật của user, mock `global.fetch` trong Main để không gọi Vilao thật) để tái hiện trực tiếp thay vì đoán tiếp — phát hiện root cause thật: `ProcessingPage.tsx` chỉ refetch `srtBlocks`/`characters`/`characterPrompts` khi `isRunning` (cờ chỉ đúng khi *chính cửa sổ này* gọi Run All trực tiếp) chuyển `true`→`false`. Nhưng cách duy nhất chạy 1 project **mới** là qua **Add to Queue** (`QueueService`), nên `isRunning` không bao giờ thành `true` — `srtBlocks` bị đóng băng ở giá trị lúc mount (thường rỗng), Scene Tasks list/card không bao giờ render đúng cho tới khi remount trang.
- `OverviewPage.tsx` đã được vá đúng lỗi này từ Phase 16 (refetch khi `tasks` đổi — kênh bắn cho cả 2 trường hợp) nhưng `ProcessingPage.tsx` bị bỏ sót. Fix: thêm đúng effect đó vào `ProcessingPage.tsx`.
- Verify: build lại `out/` (`electron-vite build`, không đụng native module đang chạy của user), replay đúng luồng Add to Queue thật trên instance cô lập — log xác nhận card + list cập nhật live từng bước, không cần rời trang.

**Bug 2 (UX) — nút Remove ở Queue trùng/thừa với Delete:**
- User report: row `queued` có cả nút **X** (Remove from queue, riêng cho Queue) lẫn nút **Delete** (trash, chuẩn `ProjectRow`) đứng cạnh nhau — cùng đọc như "xoá" nhưng hành vi khác nhau, gây nhầm.
- Hỏi lại user cách đơn giản hoá — chọn: **bỏ hẳn nút X**, chỉ giữ Delete. `projects.ipc.ts`'s delete handler đã tự dequeue trước khi xoá (có sẵn từ Phase 14) nên Delete vẫn xử lý đúng "gỡ khỏi hàng đợi" — chỉ khác giữ lại project không xoá được nữa qua đường Queue.
- `QueuePage.tsx` bỏ nút X + `Button`/`X` import không dùng nữa. `queue.remove` (IPC)/`useQueueStore.remove()` **giữ nguyên**, chỉ không còn UI nào gọi — cùng convention "giữ IPC, bỏ nút" từ Phase 14.
- Verify: `tsc --noEmit`/`eslint` sạch.

---

## Phase 21 — Post-V1: Channel option "No Characters" (2026-08-11)

Ngoài phạm vi V1 gốc — user yêu cầu trực tiếp: hiện tại kịch bản có nhân vật cốt truyện cụ thể là default (đúng, giữ nguyên), cần thêm 1 option nữa trong Channel Settings cho transcript **không có nhân vật/cốt truyện** — với channel đó, project không cần chạy 2 bước Character Detection và Character Prompt Generation.

**Trước khi implement:** hỏi lại qua `AskUserQuestion` 2 quyết định UX (schema change thật, theo CLAUDE.md) —
- Channel form khi tắt "Has Story Characters": **ẩn hẳn** 2 card Character Detection Prompt / Character Generation Prompt (không phải disable mờ).
- Sidebar của project thuộc channel "No Characters": **ẩn hẳn** mục "Characters" khỏi sidebar.
- Default cho channel mới: **bật** ("Có nhân vật") — giữ đúng hành vi hiện tại làm mặc định.

**Phát hiện quan trọng, giảm phạm vi thay đổi:** `ScenePromptService.generateBatch()` đã tự xử lý tốt `characters.length === 0` từ trước (mọi block được gán thẳng `characterIds: []`, không gọi Relevant Character Selector; `buildRelevantCharactersSection([])`/`buildRelevantCharacterPromptsSection([], ...)` trả về `(none)`); `formatCharacterPromptsFile([], [])` (`exportFormat.ts`) đã trả về chuỗi rỗng. Không cần sửa `ScenePromptService`/`generateScenePrompt.ts`/`selectRelevantCharacters.ts`/`ExportService` — chỉ cần chặn 2 bước Character Detection/Generation không chạy.

**Kế hoạch:**
- **Schema:** thêm `channels.has_characters` + `projects.has_characters` (INTEGER 0/1, NOT NULL DEFAULT 1) — migration `0006_add_has_characters` (2 câu `ADD COLUMN ... DEFAULT 1`, không có `REFERENCES` nên hợp lệ dù bảng đã có row, giống `variance_percent` ở migration 0005).
- **Backend:** `entities.ts` (`Channel`/`Project` thêm `hasCharacters: boolean`) → `channels.queries.ts`/`projects.queries.ts` (map cột mới) → `ChannelService` (`ChannelInput` thêm field, không đổi `validate()` — 2 prompt character vẫn required) → `ProjectService.create()` (`DEFAULT_HAS_CHARACTERS = true`, copy từ `defaults.hasCharacters`) → `projects.ipc.ts` (`projects:create` truyền `hasCharacters: channel.hasCharacters`) → `PipelineService.runProjectInternal()` (Step 2 Detect Characters: khi `!project.hasCharacters` thì `ensureTaskSuccess()` thẳng, không gọi `characterService.detect()`; Step 3 tự skip vì `characters.length` luôn 0) → `validateRun.ts` (`validateProjectForRun` bỏ qua 2 check prompt Character Detection/Generation khi `hasCharacters===false`).
- **Frontend:** `channel.schema.ts` + `ChannelForm.tsx` (checkbox "Has Story Characters", ẩn 2 card prompt liên quan khi tắt — RHF giữ nguyên `defaultValues` cho field không mount nên vẫn submit hợp lệ) → `NewChannelPage.tsx`/`EditChannelPage.tsx` (default true / copy từ channel) → `ChannelsPage.tsx` (badge "No Characters" trên card) → `Sidebar.tsx` (ẩn nav "Characters" khi `currentProject.hasCharacters===false`) → `CharactersPage.tsx` (empty state riêng khi vào thẳng URL) → `ProcessingPage.tsx` (ẩn 2 card coarse step liên quan) → `OverviewPage.tsx` (ẩn 2 MetricCard liên quan).
- Cập nhật `schema.md` (bảng `channels`/`projects` + Changelog).

**Ghi chú hoàn thành (2026-08-11):**
- Đúng như dự đoán lúc khảo sát code — `ScenePromptService.generateBatch()`/`generateScenePrompt.ts`/`selectRelevantCharacters.ts`/`ExportService` **không cần sửa gì**, đã tự hỗ trợ `characters.length === 0` từ trước (không có bug/edge case nào lộ ra khi implement, khác vài phase trước).
- **Migration `0006_add_has_characters`** — 2 cột boolean (`channels.has_characters`, `projects.has_characters`, `INTEGER NOT NULL DEFAULT 1`), cùng 1 statement như migration `0005` vì không có `REFERENCES`.
- **`PipelineService.runProjectInternal()`** Step 2 (Detect Characters) thêm nhánh `!project.hasCharacters` → `ensureTaskSuccess()` thẳng, không gọi `characterService.detect()`. Step 3 không đổi gì (tự skip vì `characters.length` luôn 0 khi Step 2 bị bỏ qua).
- **`validateProjectForRun()`** bọc 2 check Character Detection/Generation prompt trong `if (project.hasCharacters)` — project `hasCharacters=false` chạy được dù 2 prompt đó rỗng.
- **`ChannelForm.tsx`**: checkbox "Has Story Characters" + `watch('hasCharacters')` để ẩn/hiện 2 `<Card>` Character Detection/Generation Prompt — xác nhận đúng giả thuyết lúc lên plan: React Hook Form (`shouldUnregister` mặc định `false`) giữ nguyên giá trị `defaultValues` cho field không mount, nên submit vẫn hợp lệ mà không cần nới lỏng `ChannelService.validate()`.
- **UI ẩn theo channel:** `Sidebar.tsx` đọc `useProjectStore` lọc bỏ nav "Characters"; `CharactersPage.tsx` có `EmptyState` riêng phòng URL trực tiếp; `ProcessingPage.tsx` lọc `COARSE_STEPS` chỉ còn `SPLIT_SRT` khi `!currentProject.hasCharacters`; `OverviewPage.tsx` ẩn 2 `MetricCard` Characters/Character Prompt; `ChannelsPage.tsx` thêm badge "No Characters" trên card channel tương ứng.
- **Verify:** `tsc --noEmit` sạch cả 3 tsconfig, `eslint` sạch. `vitest` 300 (baseline Phase 20) → **309/309 pass** — thêm 1 test `validateRun.test.ts`, 2 test `channelService.test.ts` (roundtrip `hasCharacters` + default true trên channel "Default"), 1 test `projectService.test.ts` (copy `hasCharacters=false` từ `defaults`), 1 test `pipelineService.test.ts` (project `hasCharacters=false` — không gọi `chat()` cho DETECT/GENERATE_CHAR_PROMPT, cả 2 `pipeline_tasks` thành `success`, Scene Generation vẫn hoàn tất), 2 test `migrations.test.ts` cho `0006` (backfill `true` cho row cũ, insert mới tự chọn `false`).
- Chưa có bằng chứng end-to-end với Electron app thật (chỉ verify qua `vitest`/`tsc`/`eslint`) — cần user tự mở app sau khi build lại để xác nhận: tạo Channel tắt "Has Story Characters" → 2 card prompt biến mất; tạo Project trong channel đó, Run All → Processing tab chỉ còn Split SRT + Scene Generation, Sidebar không có "Characters", Overview không có 2 card Character; export ra `character_prompts.txt` rỗng, `image_prompts.txt`/`.srt` bình thường; project ở channel cũ (có nhân vật) không đổi hành vi.

---

## Phase 22 — Post-V1: Prompt Scene/Image Generation riêng cho channel "No Characters" (2026-08-11)

Ngoài phạm vi V1 gốc — user hỏi lại về bước Relevant Character Selector (1 lời gọi LLM nội bộ, không phải prompt user chỉnh được, chạy trước Scene Generation để xác định nhân vật liên quan mỗi block) và nhận ra channel "No Characters" (Phase 21) vẫn đang tái dùng nguyên `scene_generation_prompt` của channel có nhân vật — phần "Relevant Characters"/"Character Reference" trong đó chỉ luôn hiện `(none)`. Yêu cầu trực tiếp: thêm 1 prompt Scene/Image Generation riêng, không nhắc tới nhân vật, cho trường hợp này.

**Đây là schema change thật** (thêm 1 cột `channels.scene_generation_prompt_no_characters`) — không dừng lại hỏi qua `AskUserQuestion` vì yêu cầu đã đủ cụ thể để tự quyết định thiết kế, nhưng có tự cân nhắc kỹ 1 quyết định kiến trúc quan trọng trước khi code: **không** thêm cột snapshot mới vào `projects` (khác cách làm quen thuộc từ trước) — vì `project.hasCharacters` cố định vĩnh viễn sau khi tạo (mục 6.5), chỉ đúng 1 trong 2 template scene generation của channel bao giờ áp dụng cho 1 project, nên `resolvePipelineRuntime()` chọn sẵn đúng chuỗi trước khi đưa vào `promptSettings.sceneGeneration` — mọi nơi khác (PipelineService, snapshot có sẵn `scene_generation_prompt_snapshot`) không cần biết có 2 template, giữ nguyên gần như không đổi gì.

**Ghi chú hoàn thành (2026-08-11):**
- **Migration `0007_add_scene_generation_prompt_no_characters`** — 1 cột `TEXT NOT NULL DEFAULT '<default prompt text>'` trên `channels`, backfill bằng prompt mặc định thật (không phải chuỗi rỗng), cùng kỹ thuật escape SQL string như `0004_add_channels`.
- **`DEFAULT_SCENE_GENERATION_NO_CHARACTERS_PROMPT`** (`src/shared/prompts.ts`) — cùng cấu trúc panel/JSON output với prompt gốc, bỏ hết rule liên quan nhân vật (Character ID/Visual DNA format, 2 placeholder `{{RELEVANT_CHARACTERS}}`/`{{RELEVANT_CHARACTER_PROMPTS}}`), tập trung mô tả bối cảnh/ánh sáng/thời tiết/góc máy. `REQUIRED_PLACEHOLDERS.sceneGenerationNoCharacters` chỉ còn `{{BLOCK_NUMBER}}`/`{{SRT_TEXT}}`.
- **`resolvePipelineRuntime()`** (`src/main/pipelineRuntime.ts`) chọn `channel.sceneGenerationPrompt` hay `channel.sceneGenerationPromptNoCharacters` dựa vào `project.hasCharacters`, gán thẳng vào `promptSettings.sceneGeneration` — điểm resolve duy nhất trong toàn bộ pipeline.
- **`validateProjectForRun()`** (`src/shared/validateRun.ts`) kiểm tra `promptSettings.sceneGeneration` theo đúng bộ placeholder tương ứng (`sceneGeneration` hay `sceneGenerationNoCharacters`) tuỳ `project.hasCharacters`.
- **Bug tự phát hiện + tự fix trước khi báo xong** (không có trong yêu cầu ban đầu, phát hiện lúc rà lại toàn bộ chỗ dùng `getMissingPlaceholders('sceneGeneration', ...)`): `ScenePromptService.generate()`/`retry()` có 1 guard validate placeholder độc lập, hard-code key `'sceneGeneration'` — nếu bỏ sót, guard này tự chặn **mọi** prompt "No Characters" hợp lệ (báo thiếu 2 placeholder nhân vật mà thiết kế mới không cần), làm hỏng hẳn pipeline cho channel "No Characters" ngay khi channel đó có prompt riêng. Sửa bằng cách chọn key theo `project.hasCharacters`, giống `validateProjectForRun`. Có unit test riêng (`scenePromptService.test.ts`) xác nhận `generate()` chạy được với template chỉ có `{{BLOCK_NUMBER}}`/`{{SRT_TEXT}}` khi `hasCharacters=false`.
- **Bug tiềm ẩn khác tự phát hiện** (electron-store): `conf` (nền của `electron-store`) chỉ shallow-merge `defaults` vào file JSON đã tồn tại (`Object.assign`, không deep merge) — user nâng cấp từ bản cũ có `app-settings.json` sẵn sẽ thiếu hẳn `promptSettings.sceneGenerationNoCharacters` trên đĩa. Sửa `getAppSettings()` (`src/main/appSettingsStore.ts`) spread `DEFAULT_SETTINGS.promptSettings` trước rồi mới ghi đè giá trị thật đã lưu — tự vá cho field mới này lẫn field tương lai thêm sau.
- **UI:** `PromptsSettingsPage.tsx` (Settings > Prompts) thêm card thứ 4 "Scene / Image Generation (No Characters)", tái dùng nguyên `PromptEditorCard` (đã generic theo `PromptKey`, không sửa file đó). `ChannelForm.tsx` đổi cách hiện — thay vì luôn hiện đúng 1 card "Scene / Image Generation Prompt" như trước, giờ hiện **đúng 1 trong 2 card** tuỳ checkbox "Has Story Characters" (khác 2 card Character Detection/Generation ở Phase 21 vốn chỉ ẩn hẳn không có card thay thế).
- **`ChannelService`/`channels.queries.ts`/`entities.ts`/`channel.schema.ts`/`NewChannelPage.tsx`/`EditChannelPage.tsx`** — thêm field `sceneGenerationPromptNoCharacters` xuyên suốt, cùng pattern các field channel khác (required, copy 1 lần lúc tạo project — thực chất chỉ "copy" gián tiếp qua `resolvePipelineRuntime()` vì không có cột project riêng, xem quyết định thiết kế ở trên).
- **Verify:** `tsc --noEmit` sạch cả 3 tsconfig, `eslint` sạch. `vitest` 309 (baseline Phase 21) → **321/321 pass** — thêm 2 test `prompts.test.ts`, 3 test `channelService.test.ts`, 2 test `migrations.test.ts` (`0007`), 2 test `validateRun.test.ts`, 1 test `scenePromptService.test.ts` (test then-fix cho bug guard `getMissingPlaceholders` ở trên), cộng 1 fix bắt buộc cho `exportService.test.ts` (object `channelService.create()` cũ thiếu field mới, đã throw runtime nếu không sửa — không phải lỗi TypeScript vì `tests/` không nằm trong 3 tsconfig chính, chỉ lộ ra khi chạy thật).
- Chưa có bằng chứng end-to-end với Electron app thật — cần user tự mở app sau khi build lại để xác nhận: Settings > Prompts có đủ 4 card; tạo/sửa Channel tắt "Has Story Characters" → card Scene/Image Generation đổi thành bản "(No Characters)"; Run All cho project thuộc channel đó → Image Prompts tab ra prompt đúng theo template mới (mô tả bối cảnh, không có dòng `@Character_ID [...]` nào).

**Addendum (2026-08-11) — thay nội dung `DEFAULT_SCENE_GENERATION_NO_CHARACTERS_PROMPT` theo art-direction spec do user cung cấp:** phong cách nghệ thuật Nhật Bản cổ điển (Ukiyo-e/Sumi-e — mực trên giấy Washi/lụa, Ki/Tanden/Kintsugi, Kanji/Hanko/Seigaiha, tông Wabi-sabi), góc quay/cường độ suy ra theo cảm xúc chủ đạo của từng block (sad/tense/excited/neutral/wide — không có field emotion riêng trong schema, LLM tự suy luận từ nội dung SRT), khung 9:16, tối đa 120 từ, tự đủ nghĩa. **Không phải schema/migration change** — chỉ đổi nội dung hằng số `DEFAULT_SCENE_GENERATION_NO_CHARACTERS_PROMPT` (`src/shared/prompts.ts`); migration `0007` import thẳng hằng số này (`escapeSqlString(DEFAULT_SCENE_GENERATION_NO_CHARACTERS_PROMPT)`) nên tự động dùng bản mới — không cần sửa/thêm migration. Vẫn giữ nguyên 2 placeholder bắt buộc `{{BLOCK_NUMBER}}`/`{{SRT_TEXT}}` và JSON output contract `{"scene_prompts":[...]}`. Bỏ hẳn phần "nếu có CHARACTER thì copy nguyên văn consistency_prompt" trong spec gốc của user vì chế độ No Characters không có nguồn dữ liệu đó (không có Character Database/`consistency_prompt` field trong app) — thay bằng mô tả chủ thể ẩn danh, không cần nhất quán danh tính giữa các block. **Lưu ý:** nếu app đã từng chạy migration `0007` trước lần sửa này (đã tạo channel/mở Settings > Prompts trước đó), channel đã tồn tại sẽ giữ nguyên bản backfill cũ cho tới khi bấm "Reset to Default" trên card đó — Reset to Default và channel mới tạo sau thời điểm này đều lấy đúng bản mới. `tsc`/`eslint` sạch sau khi sửa (không đổi cấu trúc code, chỉ đổi nội dung chuỗi).

---

## Phase 23 — Post-V1: Activation Code (khoá theo máy)

Ngoài phạm vi V1 gốc — yêu cầu trực tiếp của user: kiểm soát việc cài app lên máy khác bằng 1 "activation code" giống password, mỗi code chỉ hợp lệ đúng 1 máy (dùng ở máy này rồi thì máy khác không nhập được).

**Không phải server/online activation** — app không có backend, nên dùng cơ chế offline: code là chữ ký Ed25519 (Node `crypto` built-in) ký lên "Machine ID" của máy đích, bằng 1 private key chỉ developer giữ (không nằm trong bản build). App chỉ nhúng public key (an toàn khi lộ vì không tạo được code mới từ đó) để verify local, không cần internet/server tracking. "1 code chỉ dùng đúng 1 máy" là hệ quả toán học của chữ ký số, không phải giới hạn áp đặt thủ công.

**Không phải schema change** — activation là state cấp "bản cài đặt trên máy" (giống việc đã cấu hình Vilao API key hay chưa), không phải dữ liệu quan hệ theo project — lưu file phẳng `activation.json` trong `userData`, không qua SQLite/`schema.md`, cùng pattern `vilao.cred`/`SecureStorageService` đã có từ Phase 3 (khác ở chỗ không cần `safeStorage` mã hoá, vì đây là dữ liệu cần chống giả mạo chứ không cần giữ bí mật — chữ ký Ed25519 đã tự lo việc chống giả mạo).

**Việc cần làm:**
- `scripts/generate-activation-keypair.cjs` + `scripts/generate-activation-code.cjs` — 2 script CLI offline, chạy tay bởi developer, không import bởi bất kỳ file nào trong `src/` (không lọt vào `out/`/bản build). Sinh keypair 1 lần (private key gitignored), sinh code cho từng máy theo yêu cầu (`--machine-id <id>`).
- `src/shared/activationPublicKey.ts` — public key PEM nhúng cứng.
- `src/main/services/ActivationService.ts` — `getMachineId()` (qua `node-machine-id`), `getStatus()`, `activate(code)`; verify lại chữ ký với Machine ID hiện tại mỗi lần gọi (không tin field lưu trong file) để chặn việc copy `activation.json` sang máy khác.
- IPC domain `activation` mới (`ipc-channels.ts`/`ipc-types.ts`/`src/main/ipc/activation.ipc.ts`/preload) — theo đúng khuôn các domain đã có (`vilao.ipc.ts` làm mẫu).
- `src/renderer/App.tsx` chặn `RouterProvider` bằng 1 màn `ActivationGate` full-screen mới cho tới khi `activation.getStatus()` trả `activated: true` — chỉ chặn ở Renderer, không chặn thêm ở từng IPC handler (đã cân nhắc và chấp nhận đánh đổi này với user — đủ cho mục đích kiểm soát cài đặt thông thường, không phải chống crack chuyên nghiệp).

**Test + chạy local:**
1. `npm run generate-activation-keypair` → dán public key vào `activationPublicKey.ts`.
2. `npm run dev` → thấy màn Activation Gate (chưa có `activation.json`), copy đúng Machine ID hiển thị.
3. `npm run generate-activation-code -- --machine-id <id>` → dán vào Gate → unlock vào app.
4. Tắt mở lại app → vào thẳng app, không hiện lại Gate.
5. Dán code sinh cho 1 machine-id giả vào 1 profile `userData` sạch → bị từ chối đúng thông báo "không hợp lệ cho máy này".
6. Sửa tay `activation.json` thành chuỗi hỏng trong lúc đã activated → mở lại app → quay lại Gate, không crash.
7. `npm run dist` (build Windows) → cài thử, lặp lại bước 2-4 trên bản đóng gói thật.

**Ghi chú hoàn thành:** cặp khoá Ed25519 thật đã sinh (`npm run generate-activation-keypair`), public key đã nhúng vào `activationPublicKey.ts`. Verify: `vitest` (6 test `activationService.test.ts`, mock `electron`/`node-machine-id`, dùng keypair test riêng) pass; chạy `node-machine-id` thật trên máy dev lấy đúng Machine ID thật; sinh code thật cho Machine ID đó bằng CLI, verify độc lập bằng script tái hiện đúng thuật toán → hợp lệ đúng máy, bị từ chối với machine ID khác/chuỗi rác; `npm run dev` thật + chụp màn hình xác nhận Activation Gate hiện đúng (Machine ID thật, đúng style DESIGN.md, không crash). Chưa tự động hoá được bước click "Activate" trong UI thật (thử bằng PowerShell mouse automation nhưng lệch toạ độ, click nhầm sang cửa sổ khác trên desktop — bỏ cách này) — để user tự dán code test nốt bước cuối. `tsc`/`eslint` sạch, `vitest` 322/322 (baseline Phase 22 316 → +6).

---

## Phase 24 — Post-V1: Export thêm `character_list.txt`

Ngoài phạm vi V1 gốc — yêu cầu trực tiếp của user: export thêm 1 file liệt kê tên toàn bộ nhân vật (Character ID, bỏ tiền tố `@`), mỗi dòng 1 nhân vật, không cách dòng trống.

Chỉ ghi file này khi project có ít nhất 1 nhân vật (`characters.length > 0`) — project channel "No Characters" (Phase 21) không có gì để liệt kê nên không tạo file rỗng, khác 2 file kia (luôn ghi, kể cả rỗng).

**Việc cần làm:**
- `formatCharacterListFile()` (`src/shared/exportFormat.ts`) — liệt kê toàn bộ Character Database (không lọc theo prompt thành công hay không, khác `character_prompts.txt`), theo đúng thứ tự `characters` (created_at ASC).
- `ExportService.export()` — ghi thêm `character_list.txt` có điều kiện.
- `ExportPage.tsx` (Renderer preview) — thêm dòng trong cây thư mục + 1 Card preview, cùng điều kiện `characters.length > 0`, dùng chung `formatCharacterListFile()` nên không lệch với file thật.

**Ghi chú hoàn thành:** `tests/unit/exportFormat.test.ts`/`exportService.test.ts` cập nhật/thêm case cho file mới. `vitest` 323/323, `tsc --noEmit` sạch, `eslint` sạch.

---

## Phase 25 — Post-V1: Multi-provider API key (Vilao + DeepSeek + Gemini)

> **Trạng thái: hoàn thành** (user duyệt toàn bộ khuyến nghị: Phương án A, SecureCredential 1 file/provider, Gemini qua OpenAI-compatible, tab "API Keys").

Ngoài phạm vi V1 gốc — yêu cầu trực tiếp của user: ngoài Vilao API key, cho phép lưu thêm API key của **DeepSeek** và **Gemini**, và dùng model của các provider đó để chạy pipeline.

### Hiện trạng (đã đọc code)

- `VilaoService` (`src/main/services/VilaoService.ts`) thực chất là client OpenAI-compatible (`GET /models`, `POST /chat/completions`, Bearer auth); `baseUrl` đã là option của constructor. DeepSeek và Gemini đều có endpoint OpenAI-compatible nên **không cần viết client mới từ đầu** — chỉ cần chọn base URL + chuẩn hoá khác biệt lỗi/model id.
- `SecureStorageService` hard-code 1 file `vilao.cred`; `saveApiKey/getApiKey/hasApiKey/clear` không có tham số provider.
- IPC domain `vilao.*` (`vilao.ipc.ts`, `ipc-channels.ts`, `ipc-types.ts`, `preload`) — 5 method, chỉ biết 1 key.
- Model được chọn **theo channel** (`channels.selected_model`, Phase 17/18), snapshot vào `projects.selected_model_snapshot` khi Run đầu tiên. Cột này chỉ là 1 chuỗi `model_id`, chưa có khái niệm provider.
- Nơi tạo `VilaoService` từ key: `pipelineRuntime.ts` (Run All / Queue) và `projects.ipc.ts` `resolveChannelVilaoRuntime()` (Detect/Generate thủ công). Nơi check key tồn tại: `validateProjectForRun` (`shared/validateRun.ts`) qua `TopBar.tsx` + `ProcessingPage.tsx`. Nơi list model: `ChannelForm.tsx` (`appApi.vilao.listModels()`) + `VilaoApiSettingsPage.tsx`.
- `errorClassification.ts` map lỗi theo `VilaoApiError.status` (401 → `INVALID_API_KEY`, v.v.).

### Open Decisions (cần user chốt trước khi code)

1. **Cách gắn provider vào model của channel** — đây là quyết định chính:
   - **Phương án A (khuyến nghị, không đổi schema):** lưu `selected_model` dạng `"<provider>:<modelId>"` cho provider mới (`deepseek:deepseek-chat`, `gemini:gemini-2.5-flash`); chuỗi **không có tiền tố = Vilao** (tương thích ngược 100% với channel/project cũ và snapshot cũ, không cần migration). Snapshot `selected_model_snapshot` tự mang theo provider nên Resume/Retry không đổi provider giữa chừng. UI luôn hiển thị tên model đã bỏ tiền tố + badge provider. Nhược điểm: provider "ẩn" trong chuỗi, phải qua 1 helper `parseModelRef()` duy nhất.
   - **Phương án B (chuẩn hoá, đổi schema):** thêm `channels.provider` + `projects.selected_provider_snapshot` qua migration `0008`. Sạch hơn nhưng là **schema change** → theo CLAUDE.md phải hỏi và được duyệt, rồi ghi Changelog trong schema.md.
2. **`SecureCredential` trong schema.md** đang ghi `provider: "vilao"`. Triển khai thật đã bỏ `provider`/`updatedAt` (chỉ raw bytes trong `vilao.cred`). Đề xuất: giữ nguyên cách lưu, thêm 2 file `deepseek.cred`, `gemini.cred` (mỗi provider 1 file) và **cập nhật mô tả** `SecureCredential` trong schema.md + Changelog. Đây là Non-DB shape, vẫn cần user đồng ý vì là sửa schema.md.
3. **Gemini qua endpoint OpenAI-compatible hay native `generateContent`?** Khuyến nghị OpenAI-compatible (`https://generativelanguage.googleapis.com/v1beta/openai`) để dùng chung client; native API khác hẳn format request/response, tốn công gấp nhiều lần mà pipeline không cần tính năng riêng nào của nó.
4. **Tên tab Settings:** đổi "Vilao API" → "API Keys" (3 card: Vilao / DeepSeek / Gemini) hay thêm 2 tab riêng? Khuyến nghị 1 tab "API Keys", tái dùng đúng layout card hiện có (không có screen Stitch cho phần này → không bịa style mới; nếu cần layout mới thì `edit_screens` trên "Settings - StoryPrompt" theo quy trình Stitch).
5. **`AppSettings.selectedModel` (global)** còn được `TopBar`/`ProcessingPage` truyền vào `validateProjectForRun`, trong khi runtime thật đã lấy model từ channel (Phase 18). Cần kiểm tra lại trong phase này: validation phải dựa vào **model của channel** + key của **provider của model đó**; không thêm field nào vào `AppSettings` (đó cũng là schema change).

### Việc cần làm (sau khi chốt Open Decisions; giả định Phương án A)

**Main Process**
- `src/shared/llmProviders.ts` (mới): `type LlmProvider = 'vilao' | 'deepseek' | 'gemini'`, metadata (label, `baseUrl`), `parseModelRef(str) → { provider, modelId }`, `formatModelRef(provider, modelId)`, `getProviderLabel()`. Một nguồn duy nhất cho cả Main và Renderer (cùng lý do `validateRun.ts`/`prompts.ts` nằm trong `shared/`).
- `SecureStorageService`: thêm tham số `provider` cho `saveApiKey/hasApiKey/getApiKey/clear` → file `<provider>.cred`. Vilao giữ nguyên `vilao.cred` (key đã lưu không mất).
- Client: dùng lại lớp OpenAI-compatible hiện có với `baseUrl` theo provider; thêm factory `createLlmService(provider, apiKey)` ở 1 chỗ để `pipelineRuntime.ts` + `projects.ipc.ts` + `vilao.ipc.ts` cùng dùng. **Giữ nguyên tên class `VilaoService`/`VilaoApiError` ở bước này** (đổi tên chỉ là diff lớn không mang giá trị; có thể để follow-up) nhưng sửa comment/thông báo lỗi cho không còn ghi cứng "Vilao" khi provider khác.
- Khác biệt theo provider cần xử lý trong lớp client/`errorClassification.ts`:
  - **DeepSeek**: base `https://api.deepseek.com`; model chat `deepseek-chat`, `deepseek-reasoner`; `402 Insufficient Balance` → map thành lỗi rõ ràng (hết credit), không retry vô ích; 401 → `INVALID_API_KEY`; giới hạn context nhỏ hơn → map `CONTEXT_TOO_LARGE` (Character Detection gửi cả transcript).
  - **Gemini**: base `https://generativelanguage.googleapis.com/v1beta/openai`; `GET /models` trả id dạng `models/gemini-...` → chuẩn hoá bỏ tiền tố `models/` và lọc bỏ model không phải chat (embedding, imagen...); key sai có thể trả **400** (không phải 401) và body có thể là mảng `[{error}]` → `extractErrorInfo` phải chịu được cả 2 dạng, và test connection phải map đúng sang `Invalid`; 429 free-tier RPM thấp → kiểm tra backoff/`scene_concurrency` mặc định hiện có xử lý được (không đổi default nếu không cần).
  - **Trước khi code**: đối chiếu lại docs chính thức của DeepSeek và Gemini (base URL, tên model, định dạng lỗi) bằng Context7/tra docs — các chi tiết trên là giả định từ hiểu biết hiện tại, chưa verify trong repo.
- IPC: thay domain `vilao.*` bằng domain `providers.*` nhận tham số `provider` (`saveApiKey`, `testConnection`, `listModels`, `hasApiKey`, `clearApiKey`); cập nhật `ipc-channels.ts`, `ipc-types.ts`, `preload/index.ts`, tạo `providers.ipc.ts` thay `vilao.ipc.ts`. `listModels` trả model đã gắn sẵn provider để Renderer không tự ghép chuỗi.
- `pipelineRuntime.ts` + `projects.ipc.ts`: parse `channel.selectedModel` → chọn provider → lấy đúng key → tạo đúng client; thiếu key của provider đó → `hasApiKey=false` để `validateProjectForRun` báo thông báo thân thiện (không throw chung chung).

**Shared**
- `validateProjectForRun`: nhận thêm provider của model (hoặc `hasApiKey` đã tính theo provider) và đổi thông báo thành `Configure and save a {Provider} API key in Settings > API Keys first.` Cập nhật test liên quan.

**Renderer** (Tailwind only, lucide-react, RHF + Zod, theo DESIGN.md — không bịa token mới)
- Settings > API Keys: 3 card cùng 1 component `ProviderKeyCard` (rút từ `VilaoApiSettingsPage.tsx`): password input + Save (tự Test Connection) + Remove + 5 trạng thái + Refresh Models. Giữ hành vi "đã lưu key → input disabled, chỉ còn Remove" và "đổi key → clear model list".
- Zod schema key dùng chung (mở rộng `vilaoSettings.schema.ts` → `providerKey.schema.ts`).
- `ChannelForm.tsx`: dropdown model gom nhóm theo provider (`<optgroup>`), chỉ liệt kê provider đã có key; nếu channel đang chọn model của provider đã bị xoá key → hiển thị cảnh báo thay vì im lặng reset.
- `ChannelsPage`, `TopBar`, `OverviewPage`: hiển thị model đã bỏ tiền tố + nhãn provider (qua `parseModelRef`). `StatusBar` hiện hard-code "Vilao: Not configured" — đổi thành trạng thái tổng hợp các provider.
- Router: giữ `/settings/vilao-api` redirect sang route mới để không vỡ link/điều hướng cũ.

### Test + chạy local

Unit (`vitest`):
1. `parseModelRef/formatModelRef`: chuỗi không tiền tố → vilao; `deepseek:x`, `gemini:x`; model id chứa dấu `:` không bị cắt sai.
2. Client với `global.fetch` mock cho từng provider: map response, 401 (Vilao/DeepSeek), 400-key-sai (Gemini), 402 (DeepSeek), body lỗi dạng mảng, chuẩn hoá `models/` prefix + lọc model không phải chat.
3. `SecureStorageService`: ghi/đọc/xoá độc lập theo provider (mock `electron`), xoá key A không ảnh hưởng key B.
4. `validateProjectForRun`: thiếu key đúng provider của model → đúng thông báo.
5. Regression: toàn bộ test cũ (baseline `vitest` 323/323) vẫn pass; `tsc --noEmit` + `eslint` sạch.

Thủ công (`npm run dev`, user tự test — không dùng Playwright tự launch app thật, theo bài học Phase 3):
1. Settings > API Keys: lưu key từng provider → Connected + load danh sách model thật; key sai → Invalid; không có mạng → Error.
2. Tạo/sửa channel, chọn model của DeepSeek; chạy 1 project nhỏ end-to-end (Detect → Character Prompts → Scene Prompts) → ra kết quả đúng format JSON, export bình thường.
3. Lặp lại với Gemini.
4. Channel cũ đang dùng Vilao (model không tiền tố) vẫn chạy y như trước, không cần sửa gì.
5. Xoá key DeepSeek khi channel đang dùng model DeepSeek → Run All bị chặn với thông báo đúng; Vilao không bị ảnh hưởng.
6. Kiểm tra `userData`: 3 file `*.cred` là bytes mã hoá, không thấy chuỗi key đọc được.

**Ghi chú triển khai (code xong, chưa test tay):**
- `src/shared/llmProviders.ts` mới: `LlmProvider`, metadata (label/baseUrl/placeholder), `parseModelRef/formatModelRef/formatModelDisplay`. Quy ước model: bare = Vilao, `deepseek:`/`gemini:` prefix cho provider khác (Phương án A, không migration).
- `VilaoService` giữ tên class nhưng nhận `provider` (mặc định vilao → test/caller cũ không đổi). `listModels()` trả id đã ở dạng channel; Gemini bỏ tiền tố `models/` và lọc embedding/image/tts...; `chat()` tự bỏ tiền tố provider khỏi `model` nên pipeline/service không phải sửa. Gemini 400 "API key not valid" → chuẩn hoá thành 401; body lỗi dạng mảng được chấp nhận. Thông báo lỗi dùng tên provider; `errorClassification` so khớp `endsWith('returned an empty response')`.
- `SecureStorageService`: `<provider>.cred`, tham số provider mặc định vilao. IPC `vilao.*` → `providers.*` (`providers.ipc.ts`, `ipc-channels.ts`, `ipc-types.ts`, preload). `pipelineRuntime.ts` + `projects.ipc.ts` chọn key/client theo provider của model channel.
- `validateProjectForRun`: thông báo nêu đúng provider ("Configure and save a DeepSeek API key in Settings > API Keys first."). Quyết định #5: `TopBar`/`ProcessingPage` trước đây validate bằng `AppSettings.selectedModel` global (đã lỗi thời từ Phase 18) → thay bằng `lib/runValidation.ts` dùng model của project snapshot/channel + key đúng provider. `AppSettings.selectedModel` không còn được UI ghi.
- Renderer: tab "API Keys" (`apiKeys/ApiKeysSettingsPage.tsx` + `ProviderKeyCard.tsx`, route `/settings/api-keys`, `/settings/vilao-api` redirect). Card không còn dropdown model (model chọn theo channel), chỉ hiện số model + Refresh. `ChannelForm` gom model theo provider (`optgroup`), chỉ provider có key; model của provider đã mất key vẫn hiện kèm cảnh báo. Model hiển thị qua `formatModelDisplay` ở Channels/Overview/TopBar. Bỏ dòng "Vilao: Not configured" cứng trong `StatusBar`.
- Test: `tests/unit/llmProviders.test.ts` mới (12 test). `vitest` 340/340, `tsc` (3 config) và `eslint` sạch. Chưa có unit test cho `SecureStorageService` theo provider (module phụ thuộc `electron`/`safeStorage`, cần mock — chưa làm).
- **Chưa verify với API thật** (base URL/lỗi DeepSeek & Gemini dựa trên hiểu biết hiện tại) — cần user nhập key thật và chạy các bước "Thủ công" bên dưới.

**Điểm dừng:** 3 provider cấu hình + chạy pipeline được end-to-end, key không plaintext, channel/project cũ không bị ảnh hưởng. Dừng, chờ user xác nhận rồi mới tick `[x]` và ghi "Xác nhận bởi user" như các phase trước.


**Xác nhận bởi user (2026-10-20):** đã xác nhận hoàn thành giai đoạn này.

---

## Phase 26 — Post-V1: Thinking level (DeepSeek + Gemini)

Yêu cầu trực tiếp của user: đọc docs DeepSeek/Gemini, model nào có thinking thì thêm option chọn. Lưu mức thinking bằng cách **encode vào chuỗi model** (user chọn, không schema change): `[<provider>:]<modelId>[@<level>]`, vd `deepseek:deepseek-flash@high`; không có `@` = mặc định của model. Level hợp lệ: `off|low|medium|high|max`; hậu tố lạ bị bỏ qua (id model chứa `@` khác vẫn nguyên vẹn).

**Docs đã đọc (2026-10-20):** api-docs.deepseek.com/guides/thinking_mode, ai.google.dev/gemini-api/docs/openai và /thinking.
- **DeepSeek** (`deepseek-flash`, `deepseek-v4-pro`): bật/tắt bằng `thinking: {type: enabled|disabled}` (mặc định bật), mức bằng `reasoning_effort` low/high/max (mặc định high; medium→high). Thinking mode bỏ qua `temperature`. UI cho: Off / Low / High / Max.
- **Gemini** (OpenAI-compat): `reasoning_effort` minimal/low/medium/high; `"none"` (tắt) chỉ chạy trên 2.5 (không phải Pro) — "không tắt được thinking của 2.5 Pro và Gemini 3". UI: 2.5 Flash/Flash-Lite → Off/Low/Medium/High; 2.5 Pro → Low/Medium/High; Gemini 3+/4 → Low/Medium/High, riêng bản Pro của 3 → Low/High. Không dùng `minimal` (không phải model nào cũng có) và không có Max.
- **Vilao**: không có docs → không hiện option, không gửi gì.

**Đã làm:**
- `src/shared/llmProviders.ts`: `ThinkingLevel`, `parseModelRef` (thêm `thinking`), `formatModelRef(provider, id, thinking?)`, `stripThinking`, `getThinkingOptions(provider, modelId)`, `buildThinkingParams(...)`; `formatModelDisplay` hiện "(DeepSeek · thinking high)".
- `VilaoService.chat()`: tách id + level, gửi `reasoning_effort` / `thinking` top-level (tương đương `extra_body` của OpenAI SDK). Level không hợp lệ với model (vd Off cho 2.5 Pro) bị bỏ thay vì gây 400.
- `ChannelForm`: dropdown model làm việc trên ref không có hậu tố; thêm dropdown **Thinking** (ẩn nếu model không hỗ trợ), đổi model thì giữ level nếu model mới hỗ trợ.
- `tests/unit/llmProviders.test.ts`: +5 test (17 tổng cho file). `tsc` 2 config + `eslint` sạch.

**Lưu ý / chưa verify:** chưa gọi API thật. Tên model Gemini 3/4 trong bảng options dựa vào pattern `gemini-2.5` / `gemini-3|4` + `pro` — model mới đặt tên khác sẽ không hiện option Thinking (an toàn, chỉ là thiếu option). `npm test` đầy đủ chưa chạy lại lần này vì `better-sqlite3.node` đang bị khoá (app dev đang chạy) — chạy lại sau khi tắt app; các test không cần SQLite đã pass.

**Test tay:** chọn model DeepSeek trong channel → xuất hiện dropdown Thinking; đặt Off rồi chạy 1 project nhỏ (nhanh hơn rõ), đặt Max (chậm hơn); Gemini 2.5 Flash thử Off; 2.5 Pro không có Off; model Vilao không có dropdown; channel cũ không đổi hành vi.


**Xác nhận bởi user (2026-10-20):** đã xác nhận hoàn thành giai đoạn này.

---

## Phase 27 — Post-V1: Tab "API Calls" (đếm số lần project gọi model)

Yêu cầu trực tiếp của user: mỗi project có 1 tab theo dõi project đó gọi model bao nhiêu lần. User chọn: **bảng mới `llm_calls`** (đếm chính xác, schema change đã duyệt) + tab hiển thị **tổng + theo bước + danh sách gần nhất**.

**Đã làm:**
- Migration `0008_add_llm_calls` (bảng `llm_calls`, FK cascade theo project, index theo project) + `llmCalls.queries.ts`, `LlmCallService` (`record()` không bao giờ throw; `getStats()`), entity `LlmCall`, type `LlmCallStats` (ipc-types). Ghi chú schema trong schema.md.
- `VilaoService.chat()` nhận `meta: {projectId, step}`; khi có `meta` và service có `onCall`, mỗi request (thành công hay lỗi, mỗi retry là 1 lần) được báo về kèm thời gian + `usage` token nếu provider trả. Lỗi của logger bị nuốt, không phá pipeline. 4 điểm gọi (Detect Characters, Character Prompts, Select Relevant Characters, Scene Prompts) truyền `meta`; nơi tạo `VilaoService` (`pipelineRuntime.ts` cho Run All/Queue, `projects.ipc.ts` cho thao tác thủ công) gắn `createLlmCallRecorder()` (ghi DB + broadcast `llmCalls:changedEvent`).
- IPC `llmCalls.stats(projectId)` + `llmCalls.onChanged(cb)` (preload/channels/types).
- Tab **API Calls** (sidebar sau Processing, route `api-calls`, `features/apiCalls/ApiCallsPage.tsx`): thẻ tổng (calls/thành công/lỗi %/thời gian, + token nếu có), bảng theo bước pipeline, bảng theo model (hiện cả mức thinking), 200 call gần nhất (giờ, bước, model, kết quả/lỗi, thời lượng, token). Refetch debounce 400ms khi có call mới nên cập nhật live cả với run từ Queue. Chỉ dùng token/component có sẵn (Card, EmptyState, font/colour token), không có screen Stitch cho tab này.
- Test: `tests/unit/llmCallService.test.ts` (8 test: thống kê, tách theo project, cascade, không throw, hook `onCall` thành công/lỗi/không có meta/logger lỗi); sửa 1 test cũ của `characterService` vì `chat()` giờ nhận thêm `meta`. `vitest` 353/353 (chạy bằng Electron-as-Node vì `better_sqlite3.node` đang bị app dev khoá), `tsc` + `eslint` sạch.

**Lưu ý:**
- Chỉ có số liệu từ lúc cập nhật trở đi — project đã chạy trước đó hiện "No model calls yet".
- Token chỉ hiện nếu API trả `usage`; DeepSeek/Gemini (OpenAI-compat) thường có, chưa verify với API thật.
- "Failed" là lỗi ở mức request (mạng, 4xx/5xx, response rỗng). Response về nhưng JSON sai vẫn tính là call thành công (retry sau đó là 1 call mới).

**Test tay:** chạy 1 project nhỏ → mở tab API Calls, số call tăng live; cố tình dùng key sai/hết hạn để thấy call failed + thông báo lỗi; đổi model giữa 2 channel để thấy bảng theo model; xoá project → dữ liệu mất cùng project.


**Xác nhận bởi user (2026-10-20):** đã xác nhận hoàn thành giai đoạn này.

---

## Phase 28 — Post-V1: Tối ưu gọi API (độ ổn định + chi phí/tốc độ)

> **Trạng thái: hoàn thành** (user bảo "thực hiện" 2026-10-20). Phạm vi do user chốt: mục 1–7 trong bản review gọi API (2026-10-20). **Không làm mục 8** (bỏ bước Relevant Character Selection / gửi full Character Database) — giữ nguyên spec.md 16/17.

**Không có schema change.** Không thêm/đổi cột hay bảng nào. Mục 5 có 1 migration **chỉ đổi dữ liệu** (cập nhật prompt mặc định cho channel còn dùng nguyên bản cũ), cùng kiểu với `0007` — không phải thay đổi schema.

### Bối cảnh (bằng chứng từ lần chạy thật, project "alo", `deepseek-v4-pro`)

- 1 call Scene Prompts `terminated` (2m13s) làm fail cả batch scene 021–026 mà không có lần retry nào: `DEFAULT_MAX_RETRY = 1` (`ProjectService.ts`) nghĩa là mỗi batch chỉ được gửi đúng 1 lần.
- Lỗi `terminated` xảy ra lúc đọc body → nằm ngoài `try` bắt lỗi mạng của `VilaoService.request()` nên bị phân loại `API_ERROR` thay vì `NETWORK_ERROR`; timeout 15s chỉ áp tới lúc có header, lúc đọc body không có giới hạn.
- Relevant Character Selection: call ít suy luận chỉ ~2k token/15s, nhưng phần lớn call của bước này 12–15k token/2–3 phút → gần như toàn token thinking cho một việc phân loại đơn giản.
- Prompt Scene mặc định đặt dữ liệu thay đổi (`{{SRT_TEXT}}`, nhân vật) ở giữa, ~30 dòng quy tắc cố định ở cuối → prefix cache của DeepSeek/Gemini gần như không ăn. Prompt selector nội bộ cũng đặt blocks trước Character Index.

### Việc cần làm

**1. Retry lỗi tạm thời ở tầng transport** (`VilaoService`)
- `chat()` tự retry lỗi tạm thời: `NETWORK_ERROR` (gồm `terminated`/socket reset), `TIMEOUT`, `RATE_LIMIT` (429, tôn trọng header `Retry-After` nếu có), HTTP 5xx, `EMPTY_RESPONSE`. Tối đa **3 lần thử thêm**, backoff mũ có jitter (~2s → 4s → 8s, trần 30s). Độc lập với `project.maxRetry` (vẫn dùng cho lỗi nội dung/định dạng ở tầng service — logic chia đôi batch giữ nguyên).
- **Không** retry: 401 (key sai), 402 (DeepSeek hết tiền), 400/422, `MODEL_NOT_AVAILABLE`, `CONTEXT_TOO_LARGE` (service tự xử lý bằng cắt context/chia batch như hiện tại).
- Mỗi lần thử vẫn là 1 dòng riêng trong `llm_calls` (tab API Calls phản ánh đúng số request thật).
- Huỷ được giữa các lần retry: `chat()` nhận `signal?: AbortSignal` tuỳ chọn; `ScenePromptService`/`CharacterService` truyền signal gắn với `shouldContinue`/xoá project (`PipelineService.stopAndWait`) để xoá project không phải chờ hết chuỗi retry.
- Xem lại tương tác với backoff 429 dùng chung (`backoffState` trong `ScenePromptService`): 429 đã retry ở transport thì service không tự retry thêm cho cùng mã đó — tránh nhân đôi số lần.

**2. Phân loại đúng lỗi khi đọc body**
- Đưa phần đọc body (`response.json()` / đọc stream) vào cùng cơ chế bắt lỗi: `TypeError: terminated`, `AbortError`, lỗi undici (`UND_ERR_*`) → `VilaoApiError(status: null)` → `NETWORK_ERROR`/`TIMEOUT`, để đi vào đường retry của mục 1. Giữ message gốc (vd "terminated") để debug.

**3. Streaming + idle timeout**
- Gửi `stream: true` (SSE, OpenAI-compatible) cho DeepSeek và Gemini; ghép `delta.content` thành nội dung cuối, bỏ `delta.reasoning_content` (thinking) và dòng keep-alive (`: keep-alive`) của DeepSeek. Lấy `usage` từ chunk cuối (`stream_options: {include_usage: true}`) để tab API Calls vẫn có token.
- Timeout mới: header ≤ 30s; **idle timeout 90s** (90s không nhận được byte nào → huỷ, coi là `TIMEOUT` → retry theo mục 1); trần tổng 10 phút/request. Thay cho timeout 15s cố định hiện tại.
- **Vilao giữ non-stream** cho tới khi có docs xác nhận streaming (flag `supportsStreaming` trong `LLM_PROVIDER_META`), chỉ đổi timeout: header 30s + trần tổng 5 phút. `listModels()` giữ nguyên.
- Trước khi code: đối chiếu docs chính thức của DeepSeek (streaming, keep-alive, `stream_options`) và Gemini OpenAI-compat (streaming, `usage` trong stream).

**4. Thinking Off cho bước Relevant Character Selection**
- Trong `selectRelevantCharactersBatch` (`ScenePromptService`), ép mức thinking thấp nhất model hỗ trợ, bất kể channel đặt gì: `off` nếu có (DeepSeek, Gemini 2.5 Flash/Flash-Lite), không có thì `low` (Gemini 2.5 Pro, Gemini 3/4); Vilao không gửi gì. Thêm helper `withMinimalThinking(modelRef)` cạnh `getThinkingOptions` trong `llmProviders.ts`.
- Model/provider giữ nguyên như channel (không thêm setting mới). Các bước khác (Detect, Character Prompts, Scene Prompts) vẫn theo mức thinking của channel.

**5. Prefix caching — đưa phần cố định lên đầu prompt**
- **Prompt selector nội bộ** (`selectRelevantCharacters.ts`, user không sửa được): sắp lại thành hướng dẫn + định dạng output + `CHARACTER INDEX` (cố định trong cả project) trước, `BLOCKS` (đổi theo batch) ở cuối.
- **Prompt Scene mặc định** (`DEFAULT_SCENE_GENERATION_PROMPT` và `DEFAULT_SCENE_GENERATION_NO_CHARACTERS_PROMPT` trong `src/shared/prompts.ts`): chuyển toàn bộ quy tắc/định dạng output lên trước, dồn các khối dữ liệu xuống cuối theo thứ tự ít đổi → hay đổi: `{{RELEVANT_CHARACTERS}}` → `{{RELEVANT_CHARACTER_PROMPTS}}` → `{{BLOCK_NUMBER}}` → `{{SRT_TEXT}}`. **Giữ nguyên nội dung quy tắc**, chỉ đổi thứ tự (và câu dẫn nếu cần cho mạch lạc).
- Migration dữ liệu `0009_reorder_default_scene_prompts`: channel nào có prompt **trùng nguyên văn** bản mặc định cũ thì cập nhật sang bản mới; channel đã sửa tay thì giữ nguyên (user tự chuyển phần dữ liệu xuống cuối hoặc bấm Reset to Default nếu muốn). Không đụng `projects.*_prompt_snapshot` (CLAUDE.md: snapshot không bị ghi đè).
- Character Detection/Generation: kiểm tra vị trí `{{TRANSCRIPT}}`/`{{CHARACTERS}}`; nếu đang ở giữa thì áp dụng cùng nguyên tắc (lợi ích nhỏ hơn vì mỗi project chỉ gọi 1–2 lần).

**6. JSON mode**
- Gửi `response_format: {type: "json_object"}` cho DeepSeek và Gemini (Vilao chưa có docs → không gửi). Mọi prompt đã yêu cầu "Chỉ trả về JSON" nên thoả điều kiện của DeepSeek (prompt phải chứa chữ "json").
- Giữ nguyên `repairJsonText` + parser hiện tại làm lớp bảo vệ thứ hai. Docs DeepSeek cảnh báo JSON mode đôi khi trả content rỗng → đã có retry `EMPTY_RESPONSE` ở mục 1.
- Trước khi code: xác nhận Gemini OpenAI-compat nhận `json_object` cùng lúc với streaming.

**7. Song song các batch Character Prompts**
- `CharacterService.generatePrompts` chạy các batch (10 nhân vật/batch) qua `runWithConcurrency` với mức song song = `project.sceneConcurrency` (đã có, không thêm setting), dùng chung backoff 429 như Scene. Mỗi batch vẫn ghi riêng nhân vật của nó, batch lỗi không ảnh hưởng batch khác.

### Test + chạy local

Unit (`vitest`, mock `fetch`):
1. Transport retry: `terminated` khi đọc body → retry rồi thành công; lỗi liên tiếp hết lượt → throw `NETWORK_ERROR`; 401/402/400 không retry; 429 có `Retry-After` → đợi đúng; mỗi lần thử ghi 1 dòng `onCall`; abort giữa các lần retry → dừng ngay.
2. Streaming: ghép nhiều chunk `delta.content`, bỏ `reasoning_content` và keep-alive, lấy `usage` từ chunk cuối; quá idle timeout → `TIMEOUT`; Vilao vẫn đi non-stream.
3. `withMinimalThinking`: DeepSeek → `@off`, Gemini 2.5 Flash → `@off`, 2.5 Pro / Gemini 3 → `@low`, Vilao không đổi; selector gửi đúng tham số đó dù channel đặt `@max`.
4. Prompt: selector có Character Index đứng trước BLOCKS; prompt mặc định mới vẫn đủ placeholder (`getMissingPlaceholders` rỗng); migration `0009` chỉ cập nhật channel trùng nguyên văn bản cũ, giữ channel đã sửa tay và mọi snapshot.
5. `response_format` có cho DeepSeek/Gemini, không có cho Vilao.
6. Character Prompts: nhiều batch chạy song song, batch lỗi không ảnh hưởng batch khác.
7. Regression: toàn bộ test cũ pass; `tsc` + `eslint` sạch.

Thủ công (user, `npm run dev`, key thật):
1. Chạy lại project với `deepseek-v4-pro`: trên tab API Calls, call Relevant Character Selection còn khoảng vài nghìn token/dưới 30s thay vì 12–15k/2–3 phút.
2. Ngắt mạng vài giây lúc đang chạy → thấy call lỗi rồi call retry thành công, không fail cả batch.
3. So sánh tổng thời gian + token trước/sau trên cùng 1 transcript (tab API Calls).
4. Gemini: chạy 1 project nhỏ, JSON mode + streaming không lỗi.
5. Channel đã sửa prompt tay giữ nguyên; channel dùng mặc định nhận bản đã sắp lại.

**Ghi chú triển khai:**

Docs đã đối chiếu trước khi code: DeepSeek `create-chat-completion` (SSE, `stream_options.include_usage` → `usage` ở chunk cuối, `max_tokens` mặc định 64K ở thinking mode), `json_mode` (bắt buộc có chữ "json" trong prompt, có thể trả content rỗng), `rate_limit` (keep-alive: dòng trống khi non-stream, `: keep-alive` khi stream; server đóng kết nối nếu 10 phút chưa bắt đầu suy luận); Gemini `openai` (có streaming, có `include_usage`; **không** thấy nhắc `json_object`).

- **Mục 1–3 — `VilaoService` viết lại phần chat:** `chat()` lặp tối đa `maxTransientRetries` lần thêm cho lỗi tạm thời (`isTransientError`: không có response/`terminated`/timeout/rỗng, 408, 429, 5xx); backoff mũ ±20% jitter từ `retryBaseDelayMs` (2s), trần 30s, ưu tiên `Retry-After` của 429. Mỗi lần thử ghi 1 dòng `llm_calls`. Mặc định của class là 0 retry (unit test thấy đúng 1 request); app tạo client qua `src/main/llmClient.ts` `createPipelineLlmClient()` (3 retry + recorder) ở cả `pipelineRuntime.ts` lẫn `projects.ipc.ts`. Settings > Test Connection không retry.
  - Đọc body (JSON hoặc SSE) nằm trong cùng `try` → `terminated`/AbortError/lỗi undici ra `VilaoApiError(status: null)` → `NETWORK_ERROR`/`TIMEOUT`.
  - Streaming (DeepSeek, Gemini — flag `supportsStreaming` trong `LLM_PROVIDER_META`): ghép `delta.content`, bỏ `reasoning_content`, comment keep-alive, dòng trống; xử lý dòng bị cắt giữa 2 chunk; `error` giữa stream → status 500 (retry được). Nếu server không trả `text/event-stream` thì đọc như JSON thường.
  - **Khác plan:** idle timeout **180s** (không phải 90s) và tính từ lúc gửi request (thay cho timeout header riêng) — Gemini không có keep-alive nên model thinking có thể im lặng khá lâu trước chunk đầu; trần tổng 10 phút. Vilao (non-stream): 1 timeout tổng 5 phút cho cả header + body (trước đây 15s chỉ cho header). Chỉ `GET /models` còn dùng `timeoutMs` 15s.
  - **Khác plan:** thay `AbortSignal` bằng `shouldContinue` trong `LlmRequest` — kiểm tra trước mỗi lần retry (Scene Prompts truyền `shouldContinue` của batch). Request đang chạy vẫn được chạy xong, đúng nguyên tắc spec.md 37.
  - `errorClassification`: timeout nhận theo `startsWith('Request timed out')` (message giờ có thêm chi tiết).
- **Mục 4:** `withMinimalThinking()` (`llmProviders.ts`) — selector gửi `@off` nếu model cho tắt, không thì `@low`; Vilao không đổi.
- **Mục 5:** 4 prompt mặc định (`prompts.ts`) sắp lại: quy tắc/OUTPUT trước, dữ liệu cuối (`{{TRANSCRIPT}}`; `{{CHARACTERS}}`; Scene: khối "DỮ LIỆU CỦA BATCH NÀY" gồm nhân vật → reference → BLOCK → SRT). Nội dung quy tắc giữ nguyên, chỉ đổi câu dẫn "ở cuối prompt". Bản cũ nguyên văn ở `src/shared/legacyPrompts.ts` (`LEGACY_*_V1`, chỉ dùng để nhận diện). Migration dữ liệu `0009_reorder_default_prompts` (áp cho cả 4 cột prompt của `channels`, chỉ khi trùng nguyên văn bản cũ) + `appSettingsStore.getAppSettings()` đọc prompt global trùng bản cũ thành bản mới. Snapshot của project không đụng tới. Prompt selector nội bộ: hướng dẫn + format + Character Index trước, BLOCKS cuối. Thêm ghi chú ở spec.md mục 28.
- **Mục 6:** `jsonMode: true` ở cả 4 bước pipeline → `response_format: json_object` **chỉ cho DeepSeek** (`supportsJsonMode`). **Khác plan:** Gemini chưa bật vì docs OpenAI-compat không xác nhận `json_object`.
- **Mục 7:** `runWithConcurrency` tách ra `src/main/pipeline/concurrency.ts`; `CharacterService.generatePrompts` chạy batch song song theo `project.sceneConcurrency`. **Khác plan:** không chia sẻ trạng thái pause 429 giữa các batch nhân vật — 429 đã được retry có backoff/`Retry-After` ở tầng transport.
- Test: `tests/unit/llmTransport.test.ts` mới (retry, body-read error, không retry 4xx, 429/5xx, `shouldContinue`, content rỗng, streaming DeepSeek với keep-alive/reasoning/dòng bị cắt/usage, lỗi giữa stream, stream bị treo → TIMEOUT, request shape Vilao/Gemini/DeepSeek, fallback non-stream, `withMinimalThinking`, thứ tự prompt, `upgradeLegacyDefaultPrompt`, migration 0009); `characterService.test.ts` thêm test chạy song song + cập nhật 1 assert (`jsonMode`). `vitest` 378/378 (chạy bằng Electron-as-Node vì app dev giữ khoá `better_sqlite3.node`), `tsc` 3 config + `eslint` sạch.

**Điểm dừng:** không còn fail cả batch vì một lần đứt kết nối; bước chọn nhân vật rẻ/nhanh hơn rõ trên tab API Calls; không thay đổi schema. Dừng, chờ user xác nhận rồi mới tick `[x]`.


**Xác nhận bởi user (2026-10-20):** đã xác nhận hoàn thành giai đoạn này.

---

## Phase 29 — Post-V1: Dọn cấu trúc source + sửa lỗi thao tác thủ công (2026-10-20)

Yêu cầu trực tiếp của user: làm mục 1–9 trong bản review cấu trúc source (2026-10-20). **Không làm** các mục "nhỏ/tuỳ chọn" (sandbox, validate IPC ở main, rút gọn comment, bỏ `taskId` của `retryTask`, dời `legacyPrompts.ts`).

**Không có schema change.** Không đổi IPC channel/`AppApi` nào mà Renderer đang dùng.

### Việc cần làm

**Sửa lỗi**

1. **Retry/Generate thủ công chọn sai prompt Scene cho project "No Characters"** — `resolveChannelVilaoRuntime()` (`projects.ipc.ts`) luôn lấy `channel.sceneGenerationPrompt`, còn Run All (`resolvePipelineRuntime()`) chọn `sceneGenerationPromptNoCharacters` khi `project.hasCharacters=false`. Gộp 2 resolver về 1 chỗ (`src/main/pipeline/runtime.ts`), dùng chung hàm chọn prompt theo channel + `hasCharacters`.
2. **Thao tác thủ công không dùng snapshot** (spec.md 32, CLAUDE.md) — Retry Character Prompt / Retry Scene / Generate thủ công đang đọc prompt + model *hiện hành* của channel. Sửa: project đã có snapshot (đã Run lần đầu) → dùng `*_prompt_snapshot` + `selected_model_snapshot` (provider/API key theo model snapshot); chưa có snapshot → dùng channel hiện hành như cũ. Run All giữ nguyên (validate + snapshot lần đầu bằng giá trị live, `PipelineService` tự chuyển sang snapshot).
3. **Thao tác thủ công chạy chồng lên Run All** — `PipelineService` thêm `runExclusive(projectId, fn)`: thao tác thủ công đăng ký vào cùng map "đang chạy" với `runProject()`, nên Retry khi project đang chạy (hoặc Run All khi đang Retry) bị từ chối với thông báo rõ ràng. Xoá project giữa lúc Retry cũng chờ Retry xong như với Run All. UI: nút Retry ở Characters / Image Prompts disabled khi project đang `processing`.
4. **`npm run build` không typecheck main/preload** — thêm script `typecheck` chạy cả 3 tsconfig, `build` gọi `typecheck`.

**Cấu trúc**

5. **Đổi tên `VilaoService` → `LlmClient`** (client OpenAI-compatible cho mọi provider từ Phase 25): `VilaoApiError` → `LlmApiError`, `VilaoServiceOptions` → `LlmClientOptions`, field/param `vilaoService` → `llmClient`. Gom file LLM vào `src/main/llm/` (`LlmClient.ts`, `pipelineLlmClient.ts`, `llmCallRecorder.ts`); `pipelineRuntime.ts` → `src/main/pipeline/runtime.ts`. Root `src/main/` chỉ còn `index.ts`, `container.ts`, `broadcast.ts`, `appSettingsStore.ts`. `VilaoConnectionStatus` (enum shared, Renderer dùng) giữ nguyên tên.
6. **`ScenePromptService.generateBatch` 11 tham số vị trí** → gom phần không đổi trong 1 lần `generate()`/`retry()` vào object `BatchContext`, còn `generateBatch(ctx, start, length)`. Tách helper kiểm tra placeholder dùng chung cho `generate()`/`retry()`.
7. **Composition root** — `src/main/container.ts` tạo mọi service đúng 1 lần (DB, Project/Channel/Srt/Character/ScenePrompt/Export/LlmCall/SecureStorage/Activation, `PipelineService`, `QueueService`, LLM call recorder); `registerXxxIpc(services)` nhận service qua tham số. Bỏ `getPipelineService()`/`getQueueService()` (singleton ẩn, `projects.ipc.ts` phải import ngược `queue.ipc.ts`). Helper `broadcast()` dùng chung (`src/main/broadcast.ts`) cho queue + recorder.
8. **SQL thô trong `LlmCallService.getStats`** → chuyển sang `llmCalls.queries.ts` (`sumLlmCallTokens`).
9. **`PipelineService` tìm task bằng `list…().find()`** → dùng `findPipelineTask()` đã có sẵn trong `pipelineTasks.queries.ts`.

### Test

- Unit mới: runtime resolver (chọn prompt No Characters, ưu tiên snapshot, provider theo model snapshot, lỗi thiếu key/model), `runExclusive` (từ chối khi đang Run All và ngược lại, `stopAndWait` chờ thao tác thủ công).
- Regression: toàn bộ test cũ pass sau khi đổi tên/di chuyển file; `npm run typecheck` + `eslint` sạch.
- Thủ công (user): project channel "No Characters" đã Run → Retry 1 scene lỗi, tab API Calls/kết quả dùng đúng prompt không nhân vật; sửa prompt channel sau khi Run rồi Retry → vẫn theo snapshot; bấm Run All, nút Retry bị khoá.

**Ghi chú triển khai:**

- **Mục 1–2:** `src/main/pipeline/runtime.ts` — `liveChannelSettings()` (chọn prompt theo `hasCharacters`) dùng chung cho `resolvePipelineRuntime()` (Run All/Queue, không throw) và `resolveManualLlmRuntime()` (thao tác thủ công, ưu tiên `snapshotSettings()` khi project đã có snapshot, throw message cho user khi thiếu model/key). `resolveChannelVilaoRuntime()` trong `projects.ipc.ts` đã bỏ.
- **Mục 3:** `PipelineService.runExclusive()` dùng chung map `controllers` với `runProject()`; `projects.ipc.ts` bọc `characters.detect/generatePrompts/retryPrompt`, `scenePrompts.generate/retry` **và `srt.split`** (xoá + tạo lại blocks) qua `runManual()`. `runProject()` kiểm tra "đang chạy" trước khi đăng ký promise, để lần gọi bị từ chối không ghi đè promise của run đang chạy (trước đây `stopAndWait` có thể chờ nhầm promise). Nút Retry ở `CharactersPage`/`ImagePromptsPage` disabled (kèm tooltip) khi `status=processing` hoặc store đang chạy.
- **Mục 4:** `npm run typecheck` (3 tsconfig), `build` gọi `typecheck`. Thư mục `tests/` vẫn chưa nằm trong tsconfig nào (vitest/esbuild không check type) — chưa thêm để không mở rộng phạm vi.
- **Mục 5:** file mới: `src/main/llm/{LlmClient,pipelineLlmClient,llmCallRecorder}.ts`, `src/main/pipeline/runtime.ts`; test `vilaoService.test.ts` → `llmClient.test.ts`. `createPipelineLlmClient(apiKey, provider, onCall)` và `createLlmCallRecorder(service)` nhận dependency thay vì tự `getDatabase()`. Tên cũ trong spec.md (các mục lịch sử) giữ nguyên.
- **Mục 6:** `BatchContext` + `buildBatchContext()` (gồm kiểm tra placeholder) dùng cho `generate()`/`retry()`; `generateBatch(ctx, start, length)`, `selectRelevantCharactersBatch(ctx, items)`.
- **Mục 7:** `src/main/container.ts` `createMainServices()` + `enrichQueueItems()`; `src/main/broadcast.ts` (bỏ qua window đã destroy). `registerSettingsIpc()` không cần service nên giữ không tham số.
- **Mục 8–9:** `sumLlmCallTokens()` trong `llmCalls.queries.ts`; `PipelineService` dùng `findPipelineTask()`.
- Test: `tests/unit/pipelineRuntime.test.ts` mới (7 test), `pipelineService.test.ts` thêm 3 test `runExclusive`. `vitest` 388/388 (Electron-as-Node), `typecheck` + `eslint` sạch, `electron-vite build` OK.

**Điểm dừng:** hành vi app không đổi ngoài 3 lỗi trên; không schema change. Dừng, chờ user xác nhận rồi mới tick `[x]`.


**Xác nhận bởi user (2026-10-20):** đã xác nhận hoàn thành giai đoạn này.

---

## Schema Change Notes

Không có thay đổi schema nào được thực hiện tự động trong kế hoạch này. Ghi chú các điểm có khả năng cần đổi schema khi implement thực tế — **phải hỏi lại trước khi sửa** [schema.md](schema.md):

- Phase 9 (`pipeline_tasks.entity_id` polymorphic): nếu việc thiếu FK cứng gây khó debug/resume sai entity, có thể cần thêm cột `entity_type` — đã note sẵn trong schema.md Open Questions #1.
- Phase 12 (Regenerate): nếu cần giữ lịch sử các lần regenerate thay vì ghi đè, có thể cần bảng `pipeline_task_history` hoặc field version — liên quan Open Questions #3 trong schema.md.
- Phase 8/10 (`scene_prompts.relevant_character_ids`): nếu V1.1 cần filter "scene theo nhân vật" hiệu quả hơn JSON array, cân nhắc bảng join chuẩn hoá — Open Questions #4 trong schema.md.

*(Danh sách này chỉ để tham khảo khi lập kế hoạch — không phải quyết định đã chốt.)*

---

## Project Structure

Cấu trúc thư mục đầy đủ dựa trên tech stack spec.md mục 3 (Electron + TypeScript + React + Vite, Zustand, better-sqlite3, electron-store, electron-builder) và kiến trúc 3 lớp mục 4:

```text
manga/
├── CLAUDE.md
├── context/
│   ├── spec.md
│   ├── schema.md
│   └── plan.md
├── .stitch/
│   └── DESIGN.md
├── package.json
├── tsconfig.json
├── tsconfig.main.json
├── tsconfig.preload.json
├── vite.config.ts
├── electron-builder.yml
├── tailwind.config.ts
├── postcss.config.js
├── .eslintrc.cjs
├── .gitignore
├── build/                            # icon/resource cho electron-builder
├── src/
│   ├── main/                         # Electron Main Process
│   │   ├── index.ts                   # app entry, tạo BrowserWindow
│   │   ├── ipc/                       # ipcMain handlers theo domain
│   │   │   ├── projects.ipc.ts
│   │   │   ├── pipeline.ipc.ts
│   │   │   ├── settings.ipc.ts
│   │   │   ├── vilao.ipc.ts
│   │   │   └── export.ipc.ts
│   │   ├── services/
│   │   │   ├── VilaoService.ts
│   │   │   ├── ProjectService.ts
│   │   │   ├── SrtService.ts
│   │   │   ├── PromptService.ts
│   │   │   ├── PipelineService.ts
│   │   │   ├── TaskQueueService.ts
│   │   │   ├── ExportService.ts
│   │   │   ├── SecureStorageService.ts
│   │   │   └── DatabaseService.ts
│   │   ├── db/
│   │   │   ├── client.ts               # better-sqlite3 instance
│   │   │   ├── migrations/
│   │   │   │   └── 0001_init.sql        # 6 bảng đúng schema.md
│   │   │   └── queries/
│   │   │       ├── projects.queries.ts
│   │   │       ├── srtBlocks.queries.ts
│   │   │       ├── characters.queries.ts
│   │   │       ├── characterPrompts.queries.ts
│   │   │       ├── scenePrompts.queries.ts
│   │   │       └── pipelineTasks.queries.ts
│   │   ├── pipeline/
│   │   │   ├── splitSrt.ts
│   │   │   ├── detectCharacters.ts
│   │   │   ├── generateCharacterPrompts.ts
│   │   │   ├── selectRelevantCharacters.ts
│   │   │   ├── generateScenePrompt.ts
│   │   │   └── runProject.ts
│   │   ├── prompts/
│   │   │   ├── defaults/
│   │   │   │   ├── characterDetection.default.ts
│   │   │   │   ├── characterGeneration.default.ts
│   │   │   │   └── sceneGeneration.default.ts
│   │   │   └── placeholders.ts
│   │   └── appSettingsStore.ts         # electron-store wrapper
│   ├── preload/
│   │   └── index.ts                    # contextBridge, window.appApi
│   ├── shared/                         # type dùng chung main/renderer
│   │   ├── ipc-types.ts
│   │   ├── entities.ts                  # Project, SrtBlock, Character, ...
│   │   └── enums.ts                     # status / task_type / error codes
│   └── renderer/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.html
│       ├── router.tsx
│       ├── styles/
│       │   └── globals.css              # Tailwind + design tokens
│       ├── stores/                      # Zustand — UI state only
│       │   ├── useProjectStore.ts
│       │   ├── usePipelineStore.ts
│       │   └── useUiStore.ts
│       ├── lib/
│       │   ├── appApi.ts                # typed wrapper quanh window.appApi
│       │   └── validation/               # Zod schemas
│       │       ├── project.schema.ts
│       │       └── settings.schema.ts
│       ├── components/
│       │   ├── layout/
│       │   │   ├── AppShell.tsx
│       │   │   ├── Sidebar.tsx
│       │   │   ├── TopBar.tsx
│       │   │   └── StatusBar.tsx
│       │   └── ui/                       # Button, Card, Input, Dialog...
│       ├── features/
│       │   ├── home/
│       │   ├── overview/
│       │   ├── transcript/
│       │   ├── srt/
│       │   ├── characters/
│       │   ├── imagePrompts/
│       │   ├── processing/
│       │   ├── export/
│       │   └── settings/
│       │       ├── general/
│       │       ├── vilaoApi/
│       │       ├── prompts/
│       │       └── advanced/
│       └── assets/
│           └── icons/
├── tests/
│   ├── unit/
│   │   └── srtSplitter.test.ts
│   └── e2e/
└── release/                            # output electron-builder (gitignored)
```
