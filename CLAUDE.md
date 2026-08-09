# CLAUDE.md

Hướng dẫn vận hành cho Claude Code khi làm việc trong repo này.

## Project

**StoryPrompt Desktop** — Electron desktop app nhận transcript text thuần, chạy pipeline AI one-click (Vilao AI) để tạo SRT blocks, Character Database, Character Prompts và Scene/Image Prompts, rồi export ra 1 file `.srt` + 2 file `.txt`.

Tài liệu nguồn — luôn đọc trước khi thực hiện task liên quan:
- [context/spec.md](context/spec.md) — spec đầy đủ: scope, kiến trúc, pipeline, format prompt mặc định, error handling, DoD.
- [context/schema.md](context/schema.md) — schema dữ liệu chính thức.
- [.stitch/DESIGN.md](.stitch/DESIGN.md) — design system chính thức.

Hiện tại repo mới có tài liệu (spec/schema/design), chưa có code — khi scaffold, follow đúng tech stack và kiến trúc trong spec.md mục 3–4, không tự đổi.

## Tech Stack

- Electron + TypeScript + React + Vite
- State: Zustand (chỉ UI state — không dùng làm database chính)
- Local DB: SQLite (better-sqlite3)
- Settings không nhạy cảm: electron-store
- API key: Electron `safeStorage` (Keychain trên macOS) — không bao giờ plaintext
- Build: electron-builder (`.dmg`/`.app` macOS trước, Windows sau)

## Kiến trúc

3 lớp: Renderer (UI only, không giữ API key) → Preload (`contextBridge`, `contextIsolation: true`, không Node integration) → Main Process (API key, gọi Vilao, SQLite, file system, pipeline, retry/resume, secure storage).

Không đặt logic gọi Vilao API hoặc business logic pipeline trong Renderer/UI component — luôn qua IPC bridge tới Main Process.

## Database

- Follow đúng schema trong [context/schema.md](context/schema.md) — không tự thêm, xoá hay đổi field/bảng.
- Nếu cần thay đổi schema (thêm field, đổi kiểu, thêm bảng...), **hỏi lại trước khi làm**, không tự quyết định rồi implement.
- Convention bắt buộc (đã ghi trong schema.md, nhắc lại vì hay bị phá vỡ khi thêm entity mới): UUID cho mọi PK, hard delete (không soft-delete), `created_at`/`updated_at` trên mọi table.
- Prompt snapshot (`projects.*_prompt_snapshot`) chỉ set một lần khi Run đầu tiên — không ghi đè bằng settings global hiện hành khi Resume/Retry.

## Design System

- Trước khi generate bất kỳ UI nào, đọc và follow **toàn bộ** [.stitch/DESIGN.md](.stitch/DESIGN.md) (màu, typography, spacing, elevation, shape, component spec).
- Không tự đặt màu, spacing, hay component style ngoài những gì đã định nghĩa trong DESIGN.md. Nếu DESIGN.md chưa cover trường hợp cần dùng, hỏi lại thay vì tự bịa giá trị mới.
- Dự án UI gốc trên Google Stitch: https://stitch.withgoogle.com/projects/17180110911226362084
- Khi implement UI, dùng Stitch MCP theo đúng thứ tự: `list_screens` → `fetch_screen_code` + `fetch_screen_image` → implement. Không bỏ qua bước fetch code/image để tự đoán layout.

### UI Rules

- Tailwind CSS only — không inline style, không CSS module.
- Icons: `lucide-react`.
- Forms: React Hook Form + Zod — validate trước mọi lần ghi DB.

## MCP

- Luôn dùng Context7 MCP để tra docs library/API (Electron, React, better-sqlite3, react-hook-form, zod, v.v.) mà không cần user nhắc trước.
