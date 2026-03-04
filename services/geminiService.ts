import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisMetrics, TitleSuggestion, SectionSuggestion, SectionEditSuggestion, UserRequirements, AI_MODELS, AIModelId } from "../types";
import { buildKnowledgeContext, SCORING_CRITERIA, CLICHE_PHRASES, COMPARISON_TABLE_TEMPLATE } from "../knowledge-base";

// --- API Key & Model Management ---
const STORAGE_KEY_API = 'skkn_editor_api_key';
const STORAGE_KEY_MODEL = 'skkn_editor_model';

// --- Fallback API Keys (đọc từ biến môi trường, tự động chuyển khi key hết quota) ---
const FALLBACK_API_KEYS: string[] = (process.env.VITE_GEMINI_API_KEYS || '')
  .split(',')
  .map(k => k.trim())
  .filter(k => k.length > 0);

const exhaustedKeys = new Set<string>(); // Track các key đã hết quota trong session này

export const getApiKey = (): string | null => {
  return localStorage.getItem(STORAGE_KEY_API);
};

// Kiểm tra có ÍT NHẤT 1 key khả dụng (user key hoặc env key)
export const hasAnyApiKey = (): boolean => {
  return !!getApiKey() || FALLBACK_API_KEYS.length > 0;
};

export const setApiKey = (key: string): void => {
  localStorage.setItem(STORAGE_KEY_API, key);
};

export const getSelectedModel = (): AIModelId => {
  const stored = localStorage.getItem(STORAGE_KEY_MODEL);
  if (stored && AI_MODELS.some(m => m.id === stored)) return stored as AIModelId;
  return AI_MODELS.find(m => m.default)?.id || 'gemini-3-flash-preview';
};

export const setSelectedModel = (model: AIModelId): void => {
  localStorage.setItem(STORAGE_KEY_MODEL, model);
};

// Kiểm tra error có phải do hết quota / rate limit / key sai không
const isQuotaOrKeyError = (error: any): boolean => {
  const msg = (error?.message || '').toLowerCase();
  return msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('quota')
    || msg.includes('api_key_invalid') || msg.includes('api key not valid')
    || msg.includes('permission_denied') || msg.includes('forbidden');
};

// Lấy tất cả key khả dụng: user key đầu tiên, rồi fallback keys
const getAllAvailableKeys = (): string[] => {
  const keys: string[] = [];
  const userKey = getApiKey();
  if (userKey && !exhaustedKeys.has(userKey)) {
    keys.push(userKey);
  }
  for (const key of FALLBACK_API_KEYS) {
    if (!exhaustedKeys.has(key)) {
      keys.push(key);
    }
  }
  // Nếu tất cả đều exhausted, reset và thử lại tất cả
  if (keys.length === 0) {
    exhaustedKeys.clear();
    if (userKey) keys.push(userKey);
    keys.push(...FALLBACK_API_KEYS);
  }
  return keys;
};

const getAI = () => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API_KEY_MISSING");
  return new GoogleGenAI({ apiKey });
};

// --- Fallback model chain ---
const getModelChain = (): string[] => {
  const selected = getSelectedModel();
  const allModels = AI_MODELS.map(m => m.id);
  // Put selected first, then others
  return [selected, ...allModels.filter(m => m !== selected)];
};

// --- Utilities ---
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const withTimeout = <T>(promise: Promise<T>, ms: number, label: string = 'API call'): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms / 1000}s`));
    }, ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
};

// --- Repair truncated JSON ---
const repairJSON = (text: string): any => {
  // Try parse as-is first
  try { return JSON.parse(text); } catch (_) { }

  // Try to fix truncated JSON by closing open brackets/braces
  let fixed = text.trim();
  // Remove trailing incomplete key-value pairs
  fixed = fixed.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, '');
  fixed = fixed.replace(/,\s*$/, '');

  // Count open/close brackets
  const opens = { '{': 0, '[': 0 };
  let inString = false;
  let escape = false;
  for (const ch of fixed) {
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') opens['{']++;
    if (ch === '}') opens['{']--;
    if (ch === '[') opens['[']++;
    if (ch === ']') opens['[']--;
  }
  // If we're inside a string, close it
  if (inString) fixed += '"';
  // Close remaining brackets
  while (opens['['] > 0) { fixed += ']'; opens['[']--; }
  while (opens['{'] > 0) { fixed += '}'; opens['{']--; }

  try { return JSON.parse(fixed); } catch (_) { }
  throw new Error(`Cannot parse or repair JSON (length: ${text.length})`);
};

// --- Fallback with retry on 429 + API key rotation ---
const callWithFallback = async (fn: (model: string, ai: GoogleGenAI) => Promise<any>, timeoutMs: number = 90000): Promise<any> => {
  // Kiểm tra có ít nhất 1 key khả dụng (user key hoặc env key)
  if (!hasAnyApiKey()) throw new Error("API_KEY_MISSING");

  const availableKeys = getAllAvailableKeys();
  let lastError: any = null;

  for (const apiKey of availableKeys) {
    const ai = new GoogleGenAI({ apiKey });
    const chain = getModelChain();
    let keyExhausted = false;

    for (const model of chain) {
      if (keyExhausted) break;

      // Try up to 2 times per model (1 retry on 429)
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await withTimeout(fn(model, ai), timeoutMs, `Model ${model}`);
        } catch (error: any) {
          lastError = error;
          const errMsg = error.message || '';

          // Nếu lỗi quota/key → đánh dấu key hết, chuyển sang key tiếp
          if (isQuotaOrKeyError(error)) {
            exhaustedKeys.add(apiKey);
            const keyHint = `...${apiKey.slice(-6)}`;
            console.warn(`🔑 Key ${keyHint} hết quota/không hợp lệ, chuyển key tiếp theo...`);
            keyExhausted = true;
            break;
          }

          // If 429 rate limit on first attempt (nhẹ, không phải quota hết), wait and retry same model
          if (attempt === 0 && (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED'))) {
            console.warn(`Model ${model} hit rate limit, waiting 15s before retry...`);
            await sleep(15000);
            continue;
          }

          console.warn(`Model ${model} failed (attempt ${attempt + 1}), trying next...`, errMsg.substring(0, 200));
          break; // Move to next model
        }
      }
    }
  }
  throw lastError;
};

// --- Analysis ---
export const analyzeSKKN = async (text: string): Promise<{ analysis: AnalysisMetrics, currentTitle: string }> => {
  const truncated = text.substring(0, 8000);

  // Build scoring criteria context
  const scoringContext = Object.values(SCORING_CRITERIA).map(sc =>
    `- ${sc.name} (${sc.maxScore}đ): ${sc.description}\n  Mức cao nhất: ${sc.levels[0].label}`
  ).join('\n');

  const clicheList = CLICHE_PHRASES.slice(0, 12).map(c => `"${c}"`).join(', ');

  const prompt = `Chuyên gia SKKN cấp Bộ. Phân tích văn bản:

TIÊU CHÍ (NĐ 13/2012):
${scoringContext}

NHIỆM VỤ:
1. Trích tên đề tài chính xác.
2. Kiểm tra cấu trúc 6 phần: Đặt vấn đề, Lý luận, Thực trạng, Giải pháp, Kết quả, Kết luận.
3. Chấm 10 tiêu chí (1-10đ): Tính mới, Cấu trúc, Lý luận, Số liệu, Khả thi, PPNC, Ngôn ngữ, Thực tiễn, Nhân rộng, Hình thức. Comment ≥30 ký tự.
4. Ước đạo văn — kiểm tra sáo rỗng: ${clicheList}
5. Đánh giá từng phần: status (good/needs_work/missing), tóm tắt, 2-3 gợi ý cụ thể.

Văn bản:
${truncated}
  `;

  return callWithFallback(async (model, ai) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: 0,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            currentTitle: { type: Type.STRING },
            plagiarismScore: { type: Type.NUMBER, description: "Percentage 0-100" },
            qualityScore: { type: Type.NUMBER, description: "Total score 0-100" },
            structure: {
              type: Type.OBJECT,
              properties: {
                hasIntro: { type: Type.BOOLEAN },
                hasTheory: { type: Type.BOOLEAN },
                hasReality: { type: Type.BOOLEAN },
                hasSolution: { type: Type.BOOLEAN },
                hasResult: { type: Type.BOOLEAN },
                hasConclusion: { type: Type.BOOLEAN },
                missing: { type: Type.ARRAY, items: { type: Type.STRING } }
              }
            },
            qualityCriteria: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  criteria: { type: Type.STRING, description: "Name of the evaluation criteria" },
                  score: { type: Type.NUMBER, description: "Score from 1-10, evaluate accurately based on actual content" },
                  comment: { type: Type.STRING, description: "Specific comment at least 30 characters, explain why this score was given. Must not be empty." }
                }
              }
            },
            sectionFeedback: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  sectionId: { type: Type.STRING, description: "One of: intro, theory, reality, solution, result, conclusion" },
                  status: { type: Type.STRING, description: "One of: good, needs_work, missing" },
                  summary: { type: Type.STRING },
                  suggestions: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
              }
            }
          }
        }
      }
    });

    if (!response.text) throw new Error("No response from AI");
    const parsed = repairJSON(response.text);
    return {
      analysis: {
        plagiarismScore: parsed.plagiarismScore || 0,
        qualityScore: parsed.qualityScore || 0,
        structure: parsed.structure || { hasIntro: false, hasTheory: false, hasReality: false, hasSolution: false, hasResult: false, hasConclusion: false, missing: [] },
        qualityCriteria: parsed.qualityCriteria,
        sectionFeedback: parsed.sectionFeedback || []
      },
      currentTitle: parsed.currentTitle
    };
  });
};

// --- Parse SKKN Structure (AI-powered, multi-level) ---
// CHỈ yêu cầu AI trả về CẤU TRÚC (id, title, level, parentId) — KHÔNG trả content
// Content sẽ được gán từ local parser dựa trên vị trí heading
export const parseStructure = async (text: string): Promise<{ id: string, title: string, level: number, parentId: string, content: string }[]> => {
  // Giảm xuống 25K ký tự vì không cần AI đọc toàn bộ content, chỉ cần nhận diện heading
  const truncated = text.substring(0, 25000);

  const prompt = `
    Chuyên gia phân tích cấu trúc SKKN Việt Nam.
    
    NHIỆM VỤ: Liệt kê TẤT CẢ tiêu đề mục/phần trong văn bản, CHỈ CẦN tiêu đề và cấp bậc.
    KHÔNG CẦN trả nội dung (content để rỗng "").
    
    QUY TẮC:
    - Level 1: Phần I, II, III, CHƯƠNG, MỤC LỤC, TÀI LIỆU THAM KHẢO, PHỤ LỤC
    - Level 2: 1., 2., 3., 4.1, 4.2
    - Level 3: 1.1., "Giải pháp 1", "Biện pháp 1", "Bước 1"
    - "Giải pháp/Biện pháp/Bước 1/2/3" → LUÔN tách thành mục con riêng
    - id unique: "s1", "s2", "s2-1", "s2-1-1"...
    - parentId = "" nếu level 1
    - title = tiêu đề CHÍNH XÁC từ văn bản gốc
    - content = "" (để rỗng tất cả)
    
    VĂN BẢN:
    """
    ${truncated}
    """
  `;

  return callWithFallback(async (model, ai) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: 0,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              title: { type: Type.STRING },
              level: { type: Type.INTEGER, description: "1=highest level, 2=sub-section, 3=sub-sub-section" },
              parentId: { type: Type.STRING, description: "Empty string for level 1, parent id otherwise" },
              content: { type: Type.STRING, description: "Leave empty" }
            }
          }
        }
      }
    });
    if (!response.text) throw new Error("No response from AI");
    return JSON.parse(response.text);
  }, 60000); // timeout 60s cho parseStructure
};

// --- Title Suggestions ---
export const generateTitleSuggestions = async (currentTitle: string, contentSummary: string): Promise<TitleSuggestion[]> => {
  const prompt = `
    Bạn là chuyên gia đặt tên đề tài SKKN. Tên đề tài cũ: "${currentTitle}"
    
    YÊU CẦU: Đề xuất 5 tên đề tài mới, mỗi tên phải:
    1. KHÔNG trùng lặp với các SKKN đã có trên internet
    2. Thể hiện TÍNH MỚI, SÁNG TẠO rõ ràng
    3. Cụ thể hóa đối tượng, phương pháp, công cụ
    4. Áp dụng công thức đặt tên chuyên nghiệp:
       - [Phương pháp/Công cụ] + [Mục tiêu] + [Đối tượng cụ thể]
       - [Sản phẩm] + nhằm [Mục tiêu] + cho [Đối tượng]
    5. Xếp hạng theo mức độ ưu tiên (điểm cao nhất = tốt nhất)
    
    Nội dung sơ lược: ${contentSummary.substring(0, 3000)}
  `;

  return callWithFallback(async (model, ai) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.INTEGER },
              title: { type: Type.STRING },
              noveltyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
              overlapPercentage: { type: Type.NUMBER, description: "Estimated overlap 0-100" },
              feasibility: { type: Type.STRING, description: "High/Medium/Low" },
              score: { type: Type.NUMBER, description: "Overall score out of 10" }
            }
          }
        }
      }
    });
    if (!response.text) throw new Error("No response from AI");
    return JSON.parse(response.text);
  });
};

// --- Generate Section Suggestions ---
export const generateSectionSuggestions = async (
  sectionName: string,
  originalContent: string,
  contextTitle: string
): Promise<SectionSuggestion[]> => {

  const prompt = `
    Bạn là chuyên gia thẩm định SKKN. Hãy phân tích phần "${sectionName}" và đưa ra các GỢI Ý SỬA cụ thể.
    
    Tên đề tài: "${contextTitle}"
    
    CẦN ĐÁNH GIÁ THEO 4 TIÊU CHÍ:
    1. TÍNH KHOA HỌC (scientific): Ngôn ngữ có chính xác, logic không? Có viện dẫn lý thuyết đúng không?
    2. TÍNH SÁNG TẠO (creativity): Có cách tiếp cận mới không? Có ý tưởng độc đáo không?
    3. TÍNH MỚI (novelty): Có điểm mới so với các SKKN cùng chủ đề không?
    4. CHỐNG ĐẠO VĂN (plagiarism): Có câu sáo rỗng, diễn đạt quá phổ biến không? Đề xuất cách viết lại.
    
    Cho mỗi gợi ý: trích dẫn đoạn gốc cần sửa, đề xuất đoạn thay thế, và giải thích lý do.
    Đưa ra tối đa 4-6 gợi ý quan trọng nhất.
    
    Nội dung gốc:
    "${originalContent}"
  `;

  return callWithFallback(async (model, ai) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING, description: "One of: scientific, creativity, novelty, plagiarism" },
              label: { type: Type.STRING },
              description: { type: Type.STRING },
              originalText: { type: Type.STRING, description: "Exact quote from original to fix" },
              suggestedText: { type: Type.STRING, description: "Suggested replacement" }
            }
          }
        }
      }
    });
    if (!response.text) throw new Error("No response from AI");
    return JSON.parse(response.text);
  });
};

// --- Refine Section Content (with Knowledge Base injection) ---
export const refineSectionContent = async (
  sectionName: string,
  originalContent: string,
  newTitle: string
): Promise<string> => {

  // Get section-specific knowledge
  const knowledgeContext = buildKnowledgeContext(sectionName);

  // Check if section likely needs comparison table
  const needsTable = /kết quả|hiệu quả|thực nghiệm|so sánh|khảo sát/i.test(sectionName);
  const tableInstruction = needsTable ? `
    11. Nếu phần này có số liệu trước/sau, PHẢI trình bày dạng BẢNG SO SÁNH:
${COMPARISON_TABLE_TEMPLATE}
    12. Nếu có thể, bổ sung kiểm định thống kê (t-test, p-value, Cohen's d).` : '';

  const prompt = `
    Bạn là chuyên gia viết SKKN cấp Bộ với 20 năm kinh nghiệm. Viết lại phần "${sectionName}" cho đề tài: "${newTitle}".
    
    ===== KIẾN THỨC CHUYÊN MÔN CHO PHẦN NÀY =====
    ${knowledgeContext}
    ================================================
    
    NGUYÊN TẮC BẤT DI BẤT DỊCH:
    1. GIỮ NGUYÊN tất cả số liệu thực tế (%, số lượng, điểm số, năm học).
    2. GIỮ NGUYÊN tên riêng (trường, lớp, địa danh, tên người).
    3. THAY ĐỔI cách diễn đạt: ngôn ngữ học thuật, sắc sảo, CHUYÊN NGHIỆP hơn bản gốc.
    4. LOẠI BỎ tất cả câu sáo rỗng đã liệt kê ở trên. Dẫn dắt trực tiếp, cụ thể.
    5. TĂNG CƯỜNG tính khoa học: sử dụng MẪU CÂU HỌC THUẬT đã cung cấp, viện dẫn lý thuyết + tác giả + năm.
    6. TĂNG CƯỜNG tính mới: cách tiếp cận độc đáo, góc nhìn khác biệt.
    7. ĐẢM BẢO không trùng lặp với các SKKN phổ biến - diễn đạt HOÀN TOÀN MỚI.
    8. Cấu trúc rõ ràng, mạch lạc, có luận điểm - luận cứ - dẫn chứng.
    9. GIỮ NGUYÊN mọi công thức toán học — viết dưới dạng LaTeX (ví dụ: $x^2 + y^2 = z^2$, \\frac{a}{b}, \\sqrt{n}).
    10. KHÔNG được bỏ, thay đổi, hay viết lại bất kỳ công thức toán nào. Chỉ sửa văn xuôi xung quanh.
    ${tableInstruction}
    
    YÊU CẦU ĐẶC BIỆT:
    - Phiên bản viết lại phải ĐẠT ĐIỂM CAO HƠN bản gốc khi chấm theo tiêu chí SKKN.
    - Sử dụng thuật ngữ chuyên ngành phù hợp.
    - Nếu phần gốc thiếu viện dẫn lý thuyết → BỔ SUNG lý thuyết nền tảng phù hợp.
    - Nếu phần gốc thiếu số liệu → GỢI Ý khung trình bày số liệu (giữ placeholder).
    
    Nội dung gốc:
    "${originalContent}"
    
    Trả về nội dung đã sửa. Định dạng đẹp, chuẩn. Bảng biểu dùng markdown table. Công thức toán viết dạng LaTeX.
  `;

  return callWithFallback(async (model, ai) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });
    return response.text || "";
  });
};

// =====================================================
// HƯỚNG DẪN GIỌNG VĂN TỰ NHIÊN (từ file gợi ý)
// =====================================================
const NATURAL_WRITING_GUIDE = `
## QUY TẮC VIẾT GIỌNG VĂN TỰ NHIÊN - TRÁNH ĐẠO VĂN:

1. KHOA HỌC VỀ CẤU TRÚC, CÁ NHÂN VỀ NỘI DUNG:
   - Giữ nguyên khung cấu trúc chuẩn SKKN
   - Nhưng mỗi phần đều có chi tiết riêng (tên, số liệu, thời gian, địa điểm)
   - Cân bằng: không quá khô khan (giống sách giáo khoa) và không quá tự nhiên (mất tính khoa học)

2. SỐ LIỆU CỤ THỂ, KHÔNG LÀM TRÒN:
   - Dùng số lẻ: 31/45 em (68,9%) thay vì 70%
   - Có nguồn gốc: khảo sát ngày X, kiểm tra ngày Y
   - Ghi rõ thời gian, phương pháp thu thập dữ liệu

3. PARAPHRASE LÝ THUYẾT, TÍCH HỢP THỰC TIỄN:
   - KHÔNG trích nguyên văn dài (> 1 câu)
   - Kết hợp định nghĩa với ví dụ cụ thể ngay lập tức
   - Ghi rõ tên tác giả + năm khi viện dẫn

4. XEN KẼ QUAN SÁT CÁ NHÂN VỚI SỐ LIỆU:
   - Kết hợp số liệu khoa học với quan sát chủ quan
   - Trích dẫn lời học sinh để tạo tính chân thực
   - Kể lại quá trình thực tế: khó khăn, cách giải quyết

5. THỪA NHẬN HẠN CHẾ, PHÂN TÍCH NGUYÊN NHÂN:
   - Tạo tính khách quan
   - Không chỉ liệt kê kết quả, phải phân tích tại sao
   - Nêu hạn chế trước, rồi đến hướng phát triển

6. TRÁNH ĐẠO VĂN:
   - KHÔNG mở đầu bằng "Trong bối cảnh đổi mới giáo dục hiện nay..."
   - KHÔNG dùng các câu sáo rỗng phổ biến
   - MỌI đoạn văn phải có ít nhất 1 yếu tố riêng biệt
   - Không có 3 câu liên tiếp có cấu trúc giống nhau

7. KỸ THUẬT VIẾT CỤ THỂ:
   - Độ dài câu trung bình: 15-25 từ
   - Mật độ thuật ngữ chuyên môn: 3-5%
   - Thuật ngữ chuyên môn giải thích qua ví dụ thực tế ngay sau khi đưa ra
   - Dùng "Thứ nhất", "Thứ hai"... thay vì bullet point khi phân tích
`;

// --- Phân tích sâu từng section dựa trên bối cảnh SKKN tổng thể ---
export const deepAnalyzeSection = async (
  sectionTitle: string,
  sectionContent: string,
  skknContext: {
    currentTitle: string;
    selectedTitle: string;
    allSectionTitles: string[];
    overallAnalysisSummary: string;
  },
  userRequirements: UserRequirements
): Promise<SectionEditSuggestion[]> => {

  // Build reference docs context
  const refDocsContext = userRequirements.referenceDocuments.length > 0
    ? `\n\nTÀI LIỆU THAM KHẢO DO NGƯỜI DÙNG CUNG CẤP:\n${userRequirements.referenceDocuments.map((d, i) =>
      `--- Tài liệu ${i + 1}: "${d.name}" (${d.type === 'exercise' ? 'Bài tập/Đề thi' : 'Tài liệu'}) ---\n${d.content.substring(0, 3000)}\n`
    ).join('\n')}`
    : '';

  const pageLimitContext = userRequirements.pageLimit
    ? `\nGIỚI HẠN SỐ TRANG: ${userRequirements.pageLimit} trang (khoảng ${userRequirements.pageLimit * 350} từ cho toàn bộ SKKN). Phần này nên chiếm tỷ lệ phù hợp.`
    : '';

  const customContext = userRequirements.customInstructions
    ? `\nYÊU CẦU ĐẶC BIỆT: ${userRequirements.customInstructions}`
    : '';

  const prompt = `
Bạn là chuyên gia thẩm định SKKN cấp Bộ với 20 năm kinh nghiệm. 

BỐI CẢNH SKKN TỔNG THỂ:
- Đề tài hiện tại: "${skknContext.currentTitle}"
- Đề tài mới (nếu có): "${skknContext.selectedTitle}"
- Các phần trong SKKN: ${skknContext.allSectionTitles.join(', ')}
- Đánh giá tổng quan: ${skknContext.overallAnalysisSummary}
${pageLimitContext}
${customContext}
${refDocsContext}

${NATURAL_WRITING_GUIDE}

NHIỆM VỤ: Phân tích SÂU phần "${sectionTitle}" trong BỐI CẢNH TỔNG THỂ của SKKN và đưa ra các ĐỀ XUẤT SỬA CỤ THỂ.

QUY TẮC PHÂN TÍCH:
1. PHẢI xét trong bối cảnh tổng thể SKKN, không phân tích đơn lẻ
2. Đề xuất sửa phải CỤ THỂ: chỉ rõ đoạn nào cần sửa, sửa thành gì
3. Mỗi đề xuất có action rõ ràng:
   - "replace": thay thế đoạn cũ bằng đoạn mới
   - "add": thêm nội dung mới (suggestedText chứa nội dung thêm)
   - "remove": xóa đoạn không cần thiết (originalText chứa đoạn cần xóa)
   - "modify": chỉnh sửa nhẹ (cả originalText và suggestedText)
4. Category cho mỗi đề xuất:
   - "content": nội dung thiếu/thừa/sai
   - "example": ví dụ minh họa cần thêm/thay đổi
   - "structure": cấu trúc cần điều chỉnh
   - "language": ngôn ngữ/diễn đạt cần sửa (giọng máy móc, sáo rỗng)
   - "reference": cần thay bằng ví dụ từ tài liệu tham khảo
5. ĐẶC BIỆT QUAN TRỌNG về GIỌNG VĂN:
   - Phát hiện và đề xuất sửa những chỗ giọng văn MÁY MÓC, KHUÔN MẪU
   - Đề xuất cách viết TỰ NHIÊN hơn, có trải nghiệm cá nhân
   - Xen kẽ số liệu với quan sát thực tế, lời học sinh...
${userRequirements.referenceDocuments.length > 0 ? `
6. NẾU có tài liệu tham khảo: đề xuất thay thế ví dụ cũ bằng ví dụ CHÍNH XÁC từ tài liệu. 
   Trích nguyên văn bài tập/ví dụ từ tài liệu tham khảo, category = "reference".` : ''}

Đưa ra 4-8 đề xuất sửa QUAN TRỌNG NHẤT, sắp xếp theo mức ưu tiên.

NỘI DUNG PHẦN "${sectionTitle}":
"""
${sectionContent.substring(0, 8000)}
"""
  `;

  return callWithFallback(async (model, ai) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              action: { type: Type.STRING, description: "One of: replace, add, remove, modify" },
              label: { type: Type.STRING, description: "Brief summary of the suggestion" },
              description: { type: Type.STRING, description: "Detailed explanation of why this change is needed" },
              originalText: { type: Type.STRING, description: "Original text to fix (exact quote). Leave empty if action=add" },
              suggestedText: { type: Type.STRING, description: "Replacement or new text. Leave empty if action=remove" },
              category: { type: Type.STRING, description: "One of: content, example, structure, language, reference" }
            }
          }
        }
      }
    });
    if (!response.text) throw new Error("No response from AI");
    const parsed = JSON.parse(response.text);
    return parsed.map((s: any) => ({ ...s, applied: false }));
  });
};

// --- Viết lại section với tài liệu tham khảo và giọng văn tự nhiên ---
export const refineSectionWithReferences = async (
  sectionName: string,
  originalContent: string,
  newTitle: string,
  userRequirements: UserRequirements
): Promise<string> => {
  const knowledgeContext = buildKnowledgeContext(sectionName);

  const needsTable = /kết quả|hiệu quả|thực nghiệm|so sánh|khảo sát/i.test(sectionName);
  const tableInstruction = needsTable ? `\n- Nếu có số liệu trước/sau, trình bày BẢNG SO SÁNH:\n${COMPARISON_TABLE_TEMPLATE}` : '';

  const refDocsContext = userRequirements.referenceDocuments.length > 0
    ? `\n\n===== TÀI LIỆU THAM KHẢO =====\n${userRequirements.referenceDocuments.map((d, i) =>
      `--- ${d.type === 'exercise' ? 'BÀI TẬP' : 'TÀI LIỆU'} ${i + 1}: "${d.name}" ---\n${d.content.substring(0, 4000)}\n`
    ).join('\n')}\n\nYÊU CẦU ĐẶC BIỆT VỀ TÀI LIỆU THAM KHẢO:\n- PHẢI lấy ví dụ minh họa CHÍNH XÁC từ tài liệu tham khảo ở trên\n- Thay thế các ví dụ chung chung trong SKKN cũ bằng ví dụ cụ thể từ tài liệu\n- Trích nguyên văn đề bài, bài tập từ tài liệu (không tự sáng tạo)\n- Nếu tài liệu có bài tập → sử dụng làm ví dụ minh họa cho giải pháp\n=============================`
    : '';

  const pageLimitContext = userRequirements.pageLimit
    ? `\nGIỚI HẠN: Phần này nên khoảng ${Math.round(userRequirements.pageLimit * 350 / 6)} từ (trong tổng ${userRequirements.pageLimit} trang SKKN).`
    : '';

  const customContext = userRequirements.customInstructions
    ? `\nYÊU CẦU BỔ SUNG: ${userRequirements.customInstructions}`
    : '';

  const prompt = `
Bạn là chuyên gia viết SKKN cấp Bộ với 20 năm kinh nghiệm. Viết lại phần "${sectionName}" cho đề tài: "${newTitle}".

===== KIẾN THỨC CHUYÊN MÔN =====
${knowledgeContext}
================================

${NATURAL_WRITING_GUIDE}
${refDocsContext}
${pageLimitContext}
${customContext}

NGUYÊN TẮC BẤT DI BẤT DỊCH:
1. GIỮ NGUYÊN tất cả số liệu thực tế (%, số lượng, điểm số, năm học).
2. GIỮ NGUYÊN tên riêng (trường, lớp, địa danh, tên người).
3. THAY ĐỔI cách diễn đạt: ngôn ngữ học thuật nhưng TỰ NHIÊN, có trải nghiệm cá nhân.
4. LOẠI BỎ tất cả câu sáo rỗng. Dẫn dắt trực tiếp, cụ thể.
5. XEN KẼ quan sát cá nhân vào giữa số liệu khoa học.
6. SỬ DỤNG số liệu lẻ (31/45 = 68,9%), không làm tròn.
7. TRÁNH giọng văn máy móc, khuôn mẫu. Viết như một giáo viên ĐAM MÊ kể lại quá trình thực tế.
8. GIỮ NGUYÊN mọi công thức toán học — viết dưới dạng LaTeX.
9. KHÔNG được bỏ, thay đổi, hay viết lại bất kỳ công thức toán nào.
10. Nếu có tài liệu tham khảo → LẤY VÍ DỤ CHÍNH XÁC từ đó, không tự bịa.
${tableInstruction}

Nội dung gốc:
"${originalContent}"

Trả về nội dung đã sửa. Định dạng đẹp, chuẩn. Bảng biểu dùng markdown table.
  `;

  return callWithFallback(async (model, ai) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });
    return response.text || "";
  });
};

// --- Viết lại section DỰA TRÊN KẾT QUẢ PHÂN TÍCH CHUYÊN SÂU (Bước 3) ---
export const refineSectionWithAnalysis = async (
  sectionName: string,
  originalContent: string,
  newTitle: string,
  editSuggestions: SectionEditSuggestion[],
  userRequirements: UserRequirements,
  skknContext: {
    currentTitle: string;
    selectedTitle: string;
    allSectionTitles: string[];
    overallAnalysisSummary: string;
  }
): Promise<string> => {
  const knowledgeContext = buildKnowledgeContext(sectionName);

  const needsTable = /kết quả|hiệu quả|thực nghiệm|so sánh|khảo sát/i.test(sectionName);
  const tableInstruction = needsTable ? `\n- Nếu có số liệu trước/sau, trình bày BẢNG SO SÁNH:\n${COMPARISON_TABLE_TEMPLATE}` : '';

  // Build analysis-based instructions from editSuggestions
  const analysisInstructions = editSuggestions.length > 0
    ? `\n\n===== KẾT QUẢ PHÂN TÍCH CHUYÊN SÂU (BẮT BUỘC THỰC HIỆN) =====
Dưới đây là các đề xuất sửa đã được phân tích kỹ. BẠN PHẢI thực hiện TẤT CẢ các đề xuất này khi viết lại:

${editSuggestions.map((s, i) => {
      const actionLabels: Record<string, string> = { replace: 'THAY THẾ', add: 'THÊM', remove: 'XÓA', modify: 'CHỈNH SỬA' };
      return `${i + 1}. [${actionLabels[s.action] || s.action}] ${s.label}
   Lý do: ${s.description}
   ${s.originalText ? `Đoạn gốc cần sửa: "${s.originalText.substring(0, 500)}"` : ''}
   ${s.suggestedText ? `Nội dung đề xuất: "${s.suggestedText.substring(0, 500)}"` : ''}`;
    }).join('\n\n')}
================================================================`
    : '';

  const refDocsContext = userRequirements.referenceDocuments.length > 0
    ? `\n\n===== TÀI LIỆU THAM KHẢO =====\n${userRequirements.referenceDocuments.map((d, i) =>
      `--- ${d.type === 'exercise' ? 'BÀI TẬP' : 'TÀI LIỆU'} ${i + 1}: "${d.name}" ---\n${d.content.substring(0, 4000)}\n`
    ).join('\n')}\n\nYÊU CẦU VỀ TÀI LIỆU THAM KHẢO:\n- PHẢI lấy ví dụ minh họa CHÍNH XÁC từ tài liệu tham khảo\n- Thay thế các ví dụ chung chung bằng ví dụ cụ thể từ tài liệu\n- Trích nguyên văn đề bài, bài tập từ tài liệu (không tự sáng tạo)\n=============================`
    : '';

  const pageLimitContext = userRequirements.pageLimit
    ? `\nGIỚI HẠN: Phần này nên khoảng ${Math.round(userRequirements.pageLimit * 350 / 6)} từ (trong tổng ${userRequirements.pageLimit} trang SKKN).`
    : '';

  const customContext = userRequirements.customInstructions
    ? `\nYÊU CẦU BỔ SUNG TỪ NGƯỜI DÙNG: ${userRequirements.customInstructions}`
    : '';

  const prompt = `
Bạn là chuyên gia viết SKKN cấp Bộ với 20 năm kinh nghiệm. Viết lại phần "${sectionName}" cho đề tài: "${newTitle}".

BỐI CẢNH SKKN:
- Đề tài hiện tại: "${skknContext.currentTitle}"
- Đề tài mới: "${skknContext.selectedTitle}"
- Các phần: ${skknContext.allSectionTitles.join(', ')}
- Đánh giá tổng quan: ${skknContext.overallAnalysisSummary}

===== KIẾN THỨC CHUYÊN MÔN =====
${knowledgeContext}
================================

${NATURAL_WRITING_GUIDE}
${analysisInstructions}
${refDocsContext}
${pageLimitContext}
${customContext}

NGUYÊN TẮC VIẾT LẠI:
1. THỰC HIỆN TẤT CẢ đề xuất sửa từ phân tích chuyên sâu ở trên — đây là YÊU CẦU BẮT BUỘC.
2. GIỮ NGUYÊN tất cả số liệu thực tế, tên riêng.
3. Ngôn ngữ học thuật nhưng TỰ NHIÊN, có trải nghiệm cá nhân.
4. LOẠI BỎ câu sáo rỗng. Dẫn dắt trực tiếp, cụ thể.
5. XEN KẼ quan sát cá nhân vào giữa số liệu khoa học.
6. TRÁNH giọng văn máy móc. Viết như giáo viên ĐAM MÊ kể lại quá trình thực tế.
7. GIỮ NGUYÊN công thức toán học (LaTeX).
8. Nếu có tài liệu tham khảo → LẤY VÍ DỤ CHÍNH XÁC từ đó.
${tableInstruction}

Nội dung gốc:
"${originalContent}"

Trả về nội dung đã sửa hoàn chỉnh. Định dạng đẹp, chuẩn. Bảng biểu dùng markdown table.
  `;

  return callWithFallback(async (model, ai) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });
    return response.text || "";
  });
};

// ================================================================
// RÚT NGẮN SKKN THEO SỐ TRANG YÊU CẦU (MULTI-PASS + PHÂN TÍCH)
// ================================================================

// Kiểu dữ liệu cho kết quả phân tích
export interface SectionAnalysis {
  title: string;
  role: 'intro' | 'theory' | 'reality' | 'solution' | 'result' | 'conclusion' | 'references' | 'appendix' | 'other';
  importance: number; // 1-10
  suggestedKeepRatio: number; // 0.3 - 1.0, tỉ lệ nên giữ
  keyPoints: string[]; // Các ý chính PHẢI giữ
  canRemove: string[]; // Các phần có thể cắt bỏ
}

// Tách SKKN thành các phần lớn dựa trên heading (CẢI THIỆN)
function splitIntoSections(text: string): { title: string; content: string }[] {
  // Regex mạnh hơn: bắt nhiều dạng heading phổ biến trong SKKN Việt Nam
  const sectionRegex = /^(?:#{1,3}\s+.+|PHẦN\s+[IVXLC]+[.:\s].+|CHƯƠNG\s+\d+[.:\s].+|[IVXLC]+\.\s+.+|(?:MỤC\s+LỤC|TÀI\s+LIỆU\s+THAM\s+KHẢO|PHỤ\s+LỤC|KẾT\s+LUẬN|MỞ\s+ĐẦU|PHẦN\s+MỞ\s+ĐẦU|PHẦN\s+KẾT\s+LUẬN|DANH\s+MỤC)(?:\s.*)?$|(?:A|B|C|D|E|Đ)\.\s+.+)/gmi;
  const matches = [...text.matchAll(sectionRegex)];

  if (matches.length < 2) {
    // Thử fallback: tìm heading viết HOA toàn bộ (ít nhất 4 từ viết hoa liên tiếp)
    const uppercaseHeadingRegex = /^(?:[A-ZÀ-Ỹ][A-ZÀ-Ỹ\s,]{10,})$/gm;
    const upperMatches = [...text.matchAll(uppercaseHeadingRegex)];
    
    if (upperMatches.length >= 2) {
      const allMatches = [...upperMatches].sort((a, b) => a.index! - b.index!);
      const sections: { title: string; content: string }[] = [];
      
      const beforeFirst = text.substring(0, allMatches[0].index!).trim();
      if (beforeFirst.length > 100) {
        sections.push({ title: 'Phần mở đầu', content: beforeFirst });
      }
      
      for (let i = 0; i < allMatches.length; i++) {
        const startIdx = allMatches[i].index!;
        const endIdx = i + 1 < allMatches.length ? allMatches[i + 1].index! : text.length;
        const title = allMatches[i][0].trim();
        const content = text.substring(startIdx, endIdx).trim();
        if (content.length > 50) {
          sections.push({ title, content });
        }
      }
      
      if (sections.length >= 2) return sections;
    }
    
    // Không đủ heading → trả về 1 phần duy nhất
    return [{ title: 'Toàn bộ', content: text }];
  }

  const sections: { title: string; content: string }[] = [];

  // Nếu có nội dung trước heading đầu tiên (mở đầu, bìa...)
  const beforeFirst = text.substring(0, matches[0].index!).trim();
  if (beforeFirst.length > 100) {
    sections.push({ title: 'Phần mở đầu', content: beforeFirst });
  }

  for (let i = 0; i < matches.length; i++) {
    const startIdx = matches[i].index!;
    const endIdx = i + 1 < matches.length ? matches[i + 1].index! : text.length;
    const title = matches[i][0].replace(/^#+\s*/, '').trim();
    const content = text.substring(startIdx, endIdx).trim();
    if (content.length > 30) {
      sections.push({ title, content });
    }
  }

  return sections.length >= 2 ? sections : [{ title: 'Toàn bộ', content: text }];
}

// ===== BƯỚC PHÂN TÍCH AI: phân tích cấu trúc và vai trò từng phần =====
async function analyzeSKKNForShortening(
  sections: { title: string; content: string }[],
  targetPages: number,
  originalPages: number
): Promise<SectionAnalysis[]> {
  // Tạo tóm tắt ngắn từng section để AI phân tích
  const sectionSummaries = sections.map((s, i) => {
    const preview = s.content.substring(0, 500).replace(/\n/g, ' ');
    return `${i + 1}. "${s.title}" — ${s.content.length} ký tự (~${Math.round(s.content.length / 2200)} trang) — Nội dung: ${preview}...`;
  }).join('\n');

  const prompt = `
Bạn là chuyên gia thẩm định SKKN với 20 năm kinh nghiệm. Phân tích cấu trúc SKKN dưới đây để chuẩn bị RÚT GỌN.

SKKN GỐC: ~${originalPages} trang → MỤC TIÊU: ~${targetPages} trang (giảm ${Math.round((1 - targetPages / originalPages) * 100)}%)

CÁC PHẦN CỦA SKKN:
${sectionSummaries}

NHIỆM VỤ: Phân tích từng phần, xác định:
1. role: vai trò (intro/theory/reality/solution/result/conclusion/references/appendix/other)
2. importance: tầm quan trọng (1-10, giải pháp = 9-10, mở đầu/kết luận = 5-6, phụ lục = 2-3)
3. suggestedKeepRatio: tỉ lệ NÊN GIỮ (0.3 = giữ 30%, 1.0 = giữ 100%)
   - Phần giải pháp: giữ 0.7-0.9 (ưu tiên giữ)
   - Phần cơ sở lý thuyết: 0.4-0.6
   - Phần mở đầu: 0.3-0.5
   - Phần kết luận: 0.4-0.6
   - Tài liệu tham khảo: 0.8-1.0 (giữ gần nguyên)
   - Phụ lục: 0.3-0.5
4. keyPoints: 2-4 ý chính BẮT BUỘC phải giữ
5. canRemove: 2-3 phần có thể cắt bỏ an toàn

QUAN TRỌNG: Tổng suggestedKeepRatio * chars của tất cả phần phải gần bằng ${targetPages * 2200} ký tự.
`;

  try {
    return await callWithFallback(async (model, ai) => {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.1,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                role: { type: Type.STRING, description: "One of: intro, theory, reality, solution, result, conclusion, references, appendix, other" },
                importance: { type: Type.INTEGER, description: "1-10" },
                suggestedKeepRatio: { type: Type.NUMBER, description: "0.3-1.0" },
                keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
                canRemove: { type: Type.ARRAY, items: { type: Type.STRING } }
              }
            }
          }
        }
      });
      if (!response.text) throw new Error("No response from AI");
      const parsed = JSON.parse(response.text);
      // Validate and clamp values
      return parsed.map((item: any) => ({
        title: item.title || '',
        role: item.role || 'other',
        importance: Math.max(1, Math.min(10, item.importance || 5)),
        suggestedKeepRatio: Math.max(0.2, Math.min(1.0, item.suggestedKeepRatio || 0.6)),
        keyPoints: item.keyPoints || [],
        canRemove: item.canRemove || []
      })) as SectionAnalysis[];
    }, 60000);
  } catch (err) {
    console.warn('AI analysis failed, using default ratios:', err);
    // Fallback: phân tích dựa trên keyword trong title
    return sections.map(s => {
      const titleLower = s.title.toLowerCase();
      let role: SectionAnalysis['role'] = 'other';
      let importance = 5;
      let suggestedKeepRatio = 0.6;

      if (/mở đầu|giới thiệu|đặt vấn đề|lý do|tính cấp thiết/i.test(titleLower)) {
        role = 'intro'; importance = 5; suggestedKeepRatio = 0.4;
      } else if (/cơ sở|lý thuyết|lý luận|khái niệm|tổng quan/i.test(titleLower)) {
        role = 'theory'; importance = 6; suggestedKeepRatio = 0.5;
      } else if (/thực trạng|thực tiễn|khảo sát|hiện trạng/i.test(titleLower)) {
        role = 'reality'; importance = 7; suggestedKeepRatio = 0.6;
      } else if (/giải pháp|biện pháp|sáng kiến|đổi mới|cải tiến|nội dung/i.test(titleLower)) {
        role = 'solution'; importance = 9; suggestedKeepRatio = 0.8;
      } else if (/kết quả|hiệu quả|đánh giá|thực nghiệm/i.test(titleLower)) {
        role = 'result'; importance = 8; suggestedKeepRatio = 0.7;
      } else if (/kết luận|kiến nghị|đề xuất|bài học/i.test(titleLower)) {
        role = 'conclusion'; importance = 5; suggestedKeepRatio = 0.5;
      } else if (/tài liệu|tham khảo/i.test(titleLower)) {
        role = 'references'; importance = 4; suggestedKeepRatio = 0.9;
      } else if (/phụ lục|mục lục|danh mục/i.test(titleLower)) {
        role = 'appendix'; importance = 3; suggestedKeepRatio = 0.4;
      }

      return {
        title: s.title,
        role,
        importance,
        suggestedKeepRatio,
        keyPoints: [],
        canRemove: []
      };
    });
  }
}

// Tính maxOutputTokens phù hợp với target ký tự
// Trung bình 1 token ≈ 1.5 ký tự tiếng Việt
function calcMaxOutputTokens(targetChars: number): number {
  const estimated = Math.ceil(targetChars / 1.5) + 2000; // +2000 buffer
  return Math.max(8192, Math.min(estimated, 65536));
}

// Chia section content thành các chunk nhỏ hơn nếu quá dài (>15000 ký tự)
// để tránh prompt quá lớn chiếm hết token budget
function splitSectionContent(content: string, maxChunkSize: number = 12000): string[] {
  if (content.length <= maxChunkSize) return [content];

  const chunks: string[] = [];
  const paragraphs = content.split(/\n\s*\n/);
  let currentChunk = '';

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = para;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    }
  }
  if (currentChunk.trim()) chunks.push(currentChunk.trim());

  return chunks.length > 0 ? chunks : [content];
}

// Rút ngắn 1 phần với context từ phân tích AI
async function shortenOneSection(
  sectionContent: string,
  sectionTitle: string,
  targetChars: number,
  originalTotalChars: number,
  targetTotalPages: number,
  analysisContext?: SectionAnalysis
): Promise<string> {

  // Nếu section quá dài, chia thành chunks và rút ngắn từng chunk
  const MAX_SECTION_INPUT = 15000;
  if (sectionContent.length > MAX_SECTION_INPUT) {
    const chunks = splitSectionContent(sectionContent, MAX_SECTION_INPUT);
    if (chunks.length > 1) {
      const chunkResults: string[] = [];
      const chunkBudget = Math.round(targetChars / chunks.length);
      for (let i = 0; i < chunks.length; i++) {
        const chunkResult = await shortenOneSection(
          chunks[i],
          `${sectionTitle} (phần ${i + 1}/${chunks.length})`,
          chunkBudget,
          originalTotalChars,
          targetTotalPages,
          analysisContext
        );
        chunkResults.push(chunkResult);
      }
      return chunkResults.join('\n\n');
    }
  }

  const targetPagesForSection = Math.max(1, Math.round(targetChars / 2200));
  const maxTokens = calcMaxOutputTokens(targetChars);

  // Xây dựng context phân tích nếu có
  const analysisGuide = analysisContext ? `
📋 KẾT QUẢ PHÂN TÍCH PHẦN NÀY:
- Vai trò: ${analysisContext.role} (${{
    intro: 'Phần mở đầu', theory: 'Cơ sở lý thuyết', reality: 'Thực trạng',
    solution: 'Giải pháp', result: 'Kết quả', conclusion: 'Kết luận',
    references: 'Tài liệu tham khảo', appendix: 'Phụ lục', other: 'Khác'
  }[analysisContext.role]})
- Tầm quan trọng: ${analysisContext.importance}/10
- Các ý PHẢI GIỮ: ${analysisContext.keyPoints.length > 0 ? analysisContext.keyPoints.map(k => `\n  • ${k}`).join('') : 'Không có yêu cầu đặc biệt'}
- Có thể CẮT BỎ: ${analysisContext.canRemove.length > 0 ? analysisContext.canRemove.map(c => `\n  • ${c}`).join('') : 'Không có gợi ý cụ thể'}
` : '';

  const prompt = `
Bạn là chuyên gia biên tập SKKN. Nhiệm vụ: VIẾT LẠI phần "${sectionTitle}" của SKKN cho ngắn gọn hơn.
${analysisGuide}
⚠️ YÊU CẦU BẮT BUỘC VỀ ĐỘ DÀI (CỰC KỲ QUAN TRỌNG):
- Phần này hiện có ${sectionContent.length.toLocaleString()} ký tự (~${Math.round(sectionContent.length / 2200)} trang)
- Bạn PHẢI viết lại với khoảng ${targetChars.toLocaleString()} ký tự (~${targetPagesForSection} trang)
- KHÔNG ĐƯỢC viết ngắn hơn ${Math.round(targetChars * 0.85).toLocaleString()} ký tự
- KHÔNG ĐƯỢC viết dài hơn ${Math.round(targetChars * 1.15).toLocaleString()} ký tự
- 1 trang A4 = 2.200 ký tự (Times New Roman 12pt)
- ĐÂY LÀ RÚT GỌN, KHÔNG PHẢI TÓM TẮT. Phải viết ĐẦY ĐỦ NỘI DUNG, chỉ ngắn gọn hơn.

QUY TẮC:
1. GIỮ NGUYÊN tất cả tiêu đề, đề mục con
2. Viết lại TOÀN BỘ nội dung ngắn gọn hơn nhưng ĐẦY ĐỦ Ý CHÍNH
3. Giữ: số liệu, bảng biểu, công thức toán, ví dụ hay nhất, tên riêng
4. Cắt: lặp ý, giải thích thừa, trích dẫn dài, câu sáo rỗng, phần dẫn dắt lan man
5. KHÔNG ĐƯỢC tóm tắt — phải VIẾT LẠI đầy đủ nội dung
6. PHẢI viết đủ ${targetChars.toLocaleString()} ký tự — nếu viết quá ngắn sẽ KHÔNG ĐẠT yêu cầu
${analysisContext ? `7. ƯU TIÊN giữ các ý chính đã phân tích ở trên
8. CẮT BỎ các phần được đánh dấu "có thể cắt" ở trên` : ''}

ĐỊNH DẠNG: Markdown. KHÔNG ghi chú thích. Bắt đầu viết NGAY:

===== NỘI DUNG PHẦN GỐC =====
${sectionContent}
===== HẾT =====
`;

  return callWithFallback(async (model, ai) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: 0.2,
        maxOutputTokens: maxTokens,
      },
    });
    return response.text || "";
  }, 180000);
}

export const shortenSKKN = async (
  fullText: string,
  targetPages: number,
  onProgress?: (msg: string) => void
): Promise<string> => {
  const CHARS_PER_PAGE = 2200;
  const totalCharBudget = targetPages * CHARS_PER_PAGE;
  const originalCharCount = fullText.length;
  const originalPages = Math.round(originalCharCount / CHARS_PER_PAGE);

  // ===== BƯỚC 1: Tách thành các phần =====
  onProgress?.('📂 Bước 1/4: Đang tách cấu trúc SKKN...');
  const sections = splitIntoSections(fullText);

  if (sections.length <= 1) {
    onProgress?.('⚠️ Không tìm thấy heading rõ ràng. Đang rút ngắn toàn bộ...');
    return shortenOneSection(fullText, 'Toàn bộ SKKN', totalCharBudget, originalCharCount, targetPages);
  }

  onProgress?.(`📂 Tìm thấy ${sections.length} phần: ${sections.map(s => s.title.substring(0, 30)).join(', ')}`);

  // ===== BƯỚC 2: AI Phân tích cấu trúc =====
  onProgress?.('🔍 Bước 2/4: AI đang phân tích vai trò và tầm quan trọng từng phần...');
  const analysis = await analyzeSKKNForShortening(sections, targetPages, originalPages);

  // Log kết quả phân tích
  const analysisLog = analysis.map((a, i) => {
    const roleNames: Record<string, string> = {
      intro: 'Mở đầu', theory: 'Lý thuyết', reality: 'Thực trạng',
      solution: 'Giải pháp', result: 'Kết quả', conclusion: 'Kết luận',
      references: 'TL Tham khảo', appendix: 'Phụ lục', other: 'Khác'
    };
    return `  ${i + 1}. ${a.title.substring(0, 40)} → ${roleNames[a.role] || a.role} (quan trọng: ${a.importance}/10, giữ ${Math.round(a.suggestedKeepRatio * 100)}%)`;
  }).join('\n');
  console.log('📊 Kết quả phân tích:\n' + analysisLog);
  onProgress?.(`🔍 Phân tích xong! Đã xác định vai trò ${sections.length} phần.`);

  // ===== BƯỚC 3: Phân bổ ngân sách thông minh =====
  // Dùng suggestedKeepRatio từ AI thay vì chia đều
  const totalOriginalChars = sections.reduce((sum, s) => sum + s.content.length, 0);

  // Tính budget dựa trên AI analysis
  const rawBudgets = sections.map((s, i) => {
    const a = analysis[i] || { suggestedKeepRatio: 0.6, importance: 5 };
    return s.content.length * a.suggestedKeepRatio;
  });
  const rawTotal = rawBudgets.reduce((sum, b) => sum + b, 0);
  // Scale để tổng = totalCharBudget
  const scaleFactor = totalCharBudget / rawTotal;

  const sectionBudgets = sections.map((s, i) => ({
    ...s,
    charBudget: Math.round(rawBudgets[i] * scaleFactor),
    analysis: analysis[i] || null
  }));

  // ===== BƯỚC 4: Rút ngắn từng phần =====
  const results: string[] = [];
  for (let i = 0; i < sectionBudgets.length; i++) {
    const sec = sectionBudgets[i];
    const roleLabel = sec.analysis ? {
      intro: '📖 Mở đầu', theory: '📚 Lý thuyết', reality: '🔎 Thực trạng',
      solution: '💡 Giải pháp', result: '📊 Kết quả', conclusion: '🎯 Kết luận',
      references: '📑 Tham khảo', appendix: '📎 Phụ lục', other: '📄 Khác'
    }[sec.analysis.role] || '📄' : '📄';

    onProgress?.(`✂️ Bước 3/4: Rút ngắn phần ${i + 1}/${sectionBudgets.length}: ${roleLabel} ${sec.title.substring(0, 40)}... (giữ ~${Math.round(sec.charBudget / 2200)} trang)`);

    // Nếu phần đã ngắn hơn budget → giữ nguyên
    if (sec.content.length <= sec.charBudget * 1.1) {
      results.push(sec.content);
      continue;
    }

    const shortened = await shortenOneSection(
      sec.content,
      sec.title,
      sec.charBudget,
      originalCharCount,
      targetPages,
      sec.analysis || undefined
    );
    results.push(shortened);
  }

  // ===== BƯỚC 5: Ghép kết quả & kiểm tra =====
  onProgress?.('🔧 Bước 4/4: Đang ghép kết quả và kiểm tra...');
  let combined = results.join('\n\n---\n\n');

  const resultPages = Math.round(combined.length / CHARS_PER_PAGE);
  const minAcceptablePages = Math.round(targetPages * 0.7);

  if (resultPages < minAcceptablePages && resultPages < targetPages) {
    onProgress?.(`⚠️ Kết quả (${resultPages} trang) chưa đạt yêu cầu (${targetPages} trang). Đang bổ sung nội dung...`);

    const shortage = totalCharBudget - combined.length;
    if (shortage > CHARS_PER_PAGE) {
      const expandPrompt = `
Bạn là chuyên gia biên tập SKKN. Văn bản dưới đây là SKKN đã được rút ngắn nhưng CÒN QUÁ NGẮN.

⚠️ YÊU CẦU: Mở rộng văn bản này lên khoảng ${totalCharBudget.toLocaleString()} ký tự (~${targetPages} trang).
- Hiện tại: ${combined.length.toLocaleString()} ký tự (~${resultPages} trang)
- Cần thêm: ~${shortage.toLocaleString()} ký tự (~${Math.round(shortage / CHARS_PER_PAGE)} trang)

QUY TẮC:
1. GIỮ NGUYÊN tất cả nội dung hiện có
2. MỞ RỘNG các ý chính: thêm giải thích, dẫn chứng, ví dụ minh họa
3. ƯU TIÊN mở rộng phần GIẢI PHÁP và KẾT QUẢ
4. KHÔNG thêm nội dung mới không liên quan
5. KHÔNG lặp lại ý đã có
6. Viết với giọng văn khoa học, phù hợp SKKN

===== VĂN BẢN CẦN MỞ RỘNG =====
${combined}
===== HẾT =====
`;

      const expandedMaxTokens = calcMaxOutputTokens(totalCharBudget);
      try {
        const expanded = await callWithFallback(async (model: string, ai: any) => {
          const response = await ai.models.generateContent({
            model,
            contents: expandPrompt,
            config: {
              temperature: 0.3,
              maxOutputTokens: expandedMaxTokens,
            },
          });
          return response.text || "";
        }, 180000);

        if (expanded.length > combined.length * 1.1) {
          combined = expanded;
        }
      } catch (err) {
        console.warn('Expand pass failed, using original shortened result:', err);
      }
    }
  }

  const finalPages = Math.round(combined.length / CHARS_PER_PAGE);
  onProgress?.(`✅ Hoàn thành! Kết quả: ~${finalPages} trang (mục tiêu: ${targetPages} trang)`);

  return combined;
};
