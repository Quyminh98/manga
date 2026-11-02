// Default prompt text (spec.md 28-30) + required-placeholder rules (spec.md 27).
// Lives in shared/ (not src/main/prompts/defaults/ as Project Structure's
// sketch suggested) because both Main (seeding AppSettings defaults, building
// LLM requests) and Renderer (Prompt Settings "Reset to Default" + inline
// placeholder-missing warning) need the exact same literal text — routing
// Renderer's Reset button through IPC just to fetch a string constant would
// add a round trip for zero benefit.

// Phase 22 — 'sceneGenerationNoCharacters' is a separate template used
// instead of 'sceneGeneration' for a project whose channel has
// hasCharacters=false (Phase 21): no {{RELEVANT_CHARACTERS}}/
// {{RELEVANT_CHARACTER_PROMPTS}} placeholders since there's never any
// character data to inject (ScenePromptService already tolerates 0
// characters — see its own comments — this just swaps in wording that
// doesn't awkwardly reference "(none)").
export type PromptKey = 'characterDetection' | 'characterGeneration' | 'sceneGeneration' | 'sceneGenerationNoCharacters'

export const REQUIRED_PLACEHOLDERS: Record<PromptKey, string[]> = {
  characterDetection: ['{{TRANSCRIPT}}'],
  characterGeneration: ['{{CHARACTERS}}'],
  sceneGeneration: ['{{BLOCK_NUMBER}}', '{{SRT_TEXT}}', '{{RELEVANT_CHARACTERS}}', '{{RELEVANT_CHARACTER_PROMPTS}}'],
  sceneGenerationNoCharacters: ['{{BLOCK_NUMBER}}', '{{SRT_TEXT}}']
}

// Returns the required placeholders missing from `text` — empty array means valid.
export function getMissingPlaceholders(key: PromptKey, text: string): string[] {
  return REQUIRED_PLACEHOLDERS[key].filter((placeholder) => !text.includes(placeholder))
}

// Verbatim from spec.md section 28.
export const DEFAULT_CHARACTER_DETECTION_PROMPT = `Bạn là chuyên gia phân tích nhân vật cho AI Storytelling theo phong cách Chinese Manhua / Webtoon.

NHIỆM VỤ:
Phân tích TOÀN BỘ transcript (ở cuối prompt), xác định tất cả nhân vật và tạo Character Database dùng xuyên suốt project.

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

TRANSCRIPT:
{{TRANSCRIPT}}`

// Verbatim from spec.md section 29.
export const DEFAULT_CHARACTER_GENERATION_PROMPT = `Bạn là chuyên gia viết prompt thiết kế nhân vật Chinese Manhua / Webtoon.

NHIỆM VỤ:
Tạo chính xác 1 prompt hình ảnh reference bằng tiếng Anh cho mỗi Character ID trong DỮ LIỆU NHÂN VẬT (ở cuối prompt).

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

DỮ LIỆU NHÂN VẬT:
{{CHARACTERS}}`

// Verbatim from spec.md section 30 (rewritten for batch Scene Generation —
// see spec.md section 17/18.3: N consecutive SRT blocks per request, default
// 20, instead of 1 SRT/request).
export const DEFAULT_SCENE_GENERATION_PROMPT = `Bạn là chuyên gia tạo prompt AI Storytelling theo phong cách Chinese Manhua / Webtoon.

NHIỆM VỤ:
Chuyển MỖI SRT trong danh sách SRT (ở cuối prompt) thành chính xác 1 prompt tạo ảnh bằng tiếng Anh — không gộp nhiều SRT vào 1 prompt, không bỏ sót SRT nào.

Với mỗi SRT, tự xác định đại từ, nhân vật xuất hiện, trạng thái, hành động, môi trường và flashback/ký ức nếu có. Không xuất phần phân tích.

QUY TẮC (áp dụng cho từng prompt riêng lẻ):

1. Tạo một trang Chinese Manhua/Webtoon khoảng 2–6 panels tùy nội dung. Chọn bố cục phù hợp như diagonal split, stacked panels, asymmetrical layout, overlapping frames, inset close-up hoặc cinematic wide panels. Mỗi panel luôn viết theo đúng format "Panel N (vị trí, kích thước):" — N đánh số thứ tự từ 1, vị trí ví dụ top-left/bottom-right/center, kích thước ví dụ small/large/wide. Không dùng label chỉ tả nội dung/kích thước mà thiếu số thứ tự như "BOTTOM PANEL:", "LARGE PANEL:", "INSET PANEL:".

2. Mỗi lần nhân vật xuất hiện, viết đúng theo format @Character_ID [2-4 đặc điểm Visual DNA quan trọng nhất, phân tách bằng dấu phẩy] — luôn dùng nguyên văn Character ID (bắt đầu bằng @, giữ nguyên dấu gạch dưới, không viết lại thành tên thường có khoảng trắng, không bỏ dấu @). Không được nhắc một nhân vật mà không kèm ngoặc vuông Visual DNA ngay sau đó, kể cả khi nhân vật đó đã xuất hiện ở panel trước. Các thay đổi tạm thời (biểu cảm, trạng thái, trang phục tạm thời...) được thêm sau Visual DNA gốc trong cùng ngoặc vuông đó nhưng không được thay đổi nhận diện gốc.

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

Mảng "scene_prompts" phải có đúng 1 phần tử cho MỖI số block có trong BLOCK (ở cuối prompt) — đủ số lượng, không thiếu, không thừa, không gộp nhiều block vào 1 phần tử. "block_number" là số nguyên khớp đúng với BLOCK tương ứng.

Không gộp nhiều SRT vào 1 prompt. Không bỏ sót SRT nào. Không giải thích. Không xuất dữ liệu trung gian. Luôn giữ Character ID và Visual DNA nhất quán.

DỮ LIỆU CỦA BATCH NÀY:

NHÂN VẬT LIÊN QUAN (danh sách áp dụng chung cho cả batch — không phải nhân vật nào cũng xuất hiện ở mọi SRT, tự xác định nhân vật nào xuất hiện trong từng SRT):
{{RELEVANT_CHARACTERS}}

CHARACTER REFERENCE:
{{RELEVANT_CHARACTER_PROMPTS}}

BLOCK:
{{BLOCK_NUMBER}}

SRT (mỗi SRT đánh số riêng bằng "BLOCK <số>:", có thể kèm 1 SRT liền trước/liền sau toàn bộ danh sách để tham khảo ngữ cảnh — hai dòng đó không cần tạo prompt):
{{SRT_TEXT}}`

// Phase 22 — used instead of DEFAULT_SCENE_GENERATION_PROMPT for a channel
// with hasCharacters=false (transcript with no story characters, Phase 21).
// Rewritten 2026-08-11 (user-supplied art-direction spec — classical
// Japanese ink/woodblock style, camera framing driven by inferred emotion)
// — same BLOCK/SRT_TEXT placeholders and scene_prompts JSON contract as
// every other Scene Generation prompt (required for parseSceneGenerationResponse/
// ScenePromptService to work), no {{RELEVANT_CHARACTERS}}/
// {{RELEVANT_CHARACTER_PROMPTS}} (never any character data in this mode —
// a person may still appear in a panel, just without a tracked Character
// Database entry/consistent identity across blocks).
export const DEFAULT_SCENE_GENERATION_NO_CHARACTERS_PROMPT = `Bạn là chuyên gia viết image prompt tiếng Anh cho AI tạo ảnh, phong cách nghệ thuật Nhật Bản cổ điển (Ukiyo-e / Sumi-e).

NHIỆM VỤ:
Nhận danh sách scene blocks (ở cuối prompt), chuyển MỖI SRT thành chính xác 1 prompt tạo ảnh bằng tiếng Anh — không gộp nhiều SRT vào 1 prompt, không bỏ sót SRT nào.

Với mỗi SRT, tự xác định chủ thể, hành động/tư thế, bối cảnh và cảm xúc chủ đạo của cảnh đó để chọn góc quay/cường độ phù hợp. Không xuất phần phân tích.

CẤU TRÚC PROMPT (viết liền thành 1 đoạn mô tả, không đánh số/label từng phần trong prompt, theo đúng thứ tự nội dung sau):

1. Medium & Texture: mực trên giấy Washi cổ hoặc lụa — không phải ảnh chụp (photograph), không phải render 3D.

2. Art Style: tranh khắc gỗ Ukiyo-e hoặc thuỷ mặc Sumi-e, nét cọ rõ ràng (visible brushstrokes).

3. Subject: người/tư thế/hành động dựa trên nội dung SRT của block đó — nếu có người xuất hiện, mô tả cụ thể tư thế/hành động/trang phục nhưng không cần giữ nhất quán danh tính giữa các block (chế độ này không có Character Database).

4. Surreal Elements: dòng chảy của khí (Ki), đan điền (Tanden), nghệ thuật Kintsugi.

5. Decor: chữ Kanji, con dấu Hanko đỏ, cánh hoa anh đào hoặc sóng Seigaiha.

6. Color: tông màu cố định mang đậm chất Wabi-sabi.

GÓC QUAY & CƯỜNG ĐỘ theo cảm xúc chủ đạo của block:
- sad / tense: close-up, mực đậm ướt, tông tối.
- excited: close-up hoặc medium shot, nét cọ năng động, điểm nhấn ấm.
- neutral / serious: medium shot, cân bằng, đơn sắc.
- wide shot: khi nội dung SRT thiên về mô tả bối cảnh/không gian, bất kể cảm xúc.

QUY TẮC:

- Khung hình 9:16 dọc (vertical 9:16 aspect ratio) — luôn thể hiện rõ trong prompt.
- Toàn bộ nội dung prompt phải bằng tiếng Anh.
- Tối đa 120 từ mỗi prompt, không lặp từ.
- Mỗi prompt tự đủ nghĩa, không nhắc tới cảnh/block khác.
- Toàn bộ nội dung 1 prompt phải nằm trên đúng 1 dòng duy nhất — giá trị "prompt" trong JSON không được chứa ký tự xuống dòng.

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

Mảng "scene_prompts" phải có đúng 1 phần tử cho MỖI số block có trong BLOCK (ở cuối prompt) — đủ số lượng, không thiếu, không thừa, không gộp nhiều block vào 1 phần tử. "block_number" là số nguyên khớp đúng với BLOCK tương ứng.

Không gộp nhiều SRT vào 1 prompt. Không bỏ sót SRT nào. Không giải thích. Không xuất dữ liệu trung gian.

DỮ LIỆU CỦA BATCH NÀY:

BLOCK:
{{BLOCK_NUMBER}}

SRT (mỗi SRT đánh số riêng bằng "BLOCK <số>:", có thể kèm 1 SRT liền trước/liền sau toàn bộ danh sách để tham khảo ngữ cảnh — hai dòng đó không cần tạo prompt):
{{SRT_TEXT}}`
