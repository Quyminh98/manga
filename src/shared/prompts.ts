// Default prompt text (spec.md 28-30) + required-placeholder rules (spec.md 27).
// Lives in shared/ (not src/main/prompts/defaults/ as Project Structure's
// sketch suggested) because both Main (seeding AppSettings defaults, building
// LLM requests) and Renderer (Prompt Settings "Reset to Default" + inline
// placeholder-missing warning) need the exact same literal text — routing
// Renderer's Reset button through IPC just to fetch a string constant would
// add a round trip for zero benefit.

export type PromptKey = 'characterDetection' | 'characterGeneration' | 'sceneGeneration'

export const REQUIRED_PLACEHOLDERS: Record<PromptKey, string[]> = {
  characterDetection: ['{{TRANSCRIPT}}'],
  characterGeneration: ['{{CHARACTERS}}'],
  sceneGeneration: ['{{BLOCK_NUMBER}}', '{{SRT_TEXT}}', '{{RELEVANT_CHARACTERS}}', '{{RELEVANT_CHARACTER_PROMPTS}}']
}

// Returns the required placeholders missing from `text` — empty array means valid.
export function getMissingPlaceholders(key: PromptKey, text: string): string[] {
  return REQUIRED_PLACEHOLDERS[key].filter((placeholder) => !text.includes(placeholder))
}

// Verbatim from spec.md section 28.
export const DEFAULT_CHARACTER_DETECTION_PROMPT = `Bạn là chuyên gia phân tích nhân vật cho AI Storytelling theo phong cách Chinese Manhua / Webtoon.

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

Không giải thích. Không tạo prompt ảnh.`

// Verbatim from spec.md section 29.
export const DEFAULT_CHARACTER_GENERATION_PROMPT = `Bạn là chuyên gia viết prompt thiết kế nhân vật Chinese Manhua / Webtoon.

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
Không giải thích.`

// Verbatim from spec.md section 30 (rewritten for batch Scene Generation —
// see spec.md section 17/18.3: N consecutive SRT blocks per request, default
// 20, instead of 1 SRT/request).
export const DEFAULT_SCENE_GENERATION_PROMPT = `Bạn là chuyên gia tạo prompt AI Storytelling theo phong cách Chinese Manhua / Webtoon.

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

1. Tạo một trang Chinese Manhua/Webtoon khoảng 2–6 panels tùy nội dung. Chọn bố cục phù hợp như diagonal split, stacked panels, asymmetrical layout, overlapping frames, inset close-up hoặc cinematic wide panels.

2. Mỗi lần nhân vật xuất hiện phải kèm các đặc điểm Visual DNA quan trọng. Các thay đổi tạm thời được thêm sau Visual DNA nhưng không được thay đổi nhận diện gốc.

3. Nếu một panel có nhiều nhân vật, tách rõ vị trí bằng Left side, Right side, Foreground, Background, Center... để tránh trộn nhân vật.

4. Nếu có flashback, memory, dream hoặc vision, phân biệt với hiện tại bằng các mô tả phù hợp như faded ghostly overlay, desaturated colors, soft blurred edges, soft vignette.

5. Thể hiện cảm xúc bằng biểu cảm, ánh mắt và tư thế thay vì chỉ ghi tên cảm xúc.

6. Mô tả bối cảnh, kiến trúc, thời gian, thời tiết, ánh sáng và vật thể quan trọng dựa trên SRT. Có thể bổ sung chi tiết nhỏ nhưng không thay đổi câu chuyện.

7. Speech bubble, narration hoặc sound effect bằng tiếng Anh chỉ thêm khi thực sự cần thiết.

8. Cuối mỗi prompt thêm:

Premium Chinese Manhua style, vibrant webtoon aesthetic, stylized painterly 2D illustration, expressive Asian character design, cinematic 2D rendering, textured brush strokes, dramatic volumetric lighting, [Scene Color Tone], emotional atmosphere, modern/ancient Chinese setting, 8k resolution, masterpiece --no watermark, blurry, 3D render, CGI, photography --ar 16:9

Thay [Scene Color Tone] bằng tông màu phù hợp với từng cảnh.

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

Không gộp nhiều SRT vào 1 prompt. Không bỏ sót SRT nào. Không giải thích. Không xuất dữ liệu trung gian. Luôn giữ Character ID và Visual DNA nhất quán.`
