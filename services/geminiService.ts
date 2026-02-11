import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisMetrics, TitleSuggestion, SectionSuggestion, AI_MODELS, AIModelId } from "../types";

// --- API Key & Model Management ---
const STORAGE_KEY_API = 'skkn_editor_api_key';
const STORAGE_KEY_MODEL = 'skkn_editor_model';

export const getApiKey = (): string | null => {
  return localStorage.getItem(STORAGE_KEY_API);
};

export const setApiKey = (key: string): void => {
  localStorage.setItem(STORAGE_KEY_API, key);
};

export const getSelectedModel = (): AIModelId => {
  const stored = localStorage.getItem(STORAGE_KEY_MODEL);
  if (stored && AI_MODELS.some(m => m.id === stored)) return stored as AIModelId;
  return AI_MODELS.find(m => m.default)?.id || 'gemini-2.5-flash';
};

export const setSelectedModel = (model: AIModelId): void => {
  localStorage.setItem(STORAGE_KEY_MODEL, model);
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

const callWithFallback = async (fn: (model: string) => Promise<any>): Promise<any> => {
  const chain = getModelChain();
  let lastError: any = null;

  for (const model of chain) {
    try {
      return await fn(model);
    } catch (error: any) {
      lastError = error;
      console.warn(`Model ${model} failed, trying next...`, error.message);
      if (error.message === 'API_KEY_MISSING') throw error;
      continue;
    }
  }
  throw lastError;
};

// --- Analysis ---
export const analyzeSKKN = async (text: string): Promise<{ analysis: AnalysisMetrics, currentTitle: string }> => {
  const ai = getAI();
  const truncated = text.substring(0, 8000);

  const prompt = `
    Bạn là chuyên gia thẩm định Sáng kiến Kinh nghiệm (SKKN) với 20 năm kinh nghiệm. Hãy phân tích CHUYÊN SÂU văn bản SKKN sau.
    
    NHIỆM VỤ CHI TIẾT:
    1. Xác định tên đề tài hiện tại (trích chính xác từ văn bản).
    2. Phân tích cấu trúc: kiểm tra đủ 6 phần (I: Đặt vấn đề, II: Cơ sở lý luận, III: Thực trạng, IV: Giải pháp, V: Kết quả, VI: Kết luận).
    3. Đánh giá chất lượng theo thang điểm 100 dựa trên 10 tiêu chí:
       - Tính mới / Sáng tạo
       - Cấu trúc logic 
       - Cơ sở lý luận vững chắc
       - Số liệu / Minh chứng
       - Tính khả thi
       - Phương pháp nghiên cứu
       - Ngôn ngữ khoa học
       - Tính thực tiễn
       - Khả năng nhân rộng
       - Hình thức trình bày
    4. Ước lượng tỷ lệ đạo văn (dựa trên cách diễn đạt phổ biến, câu sáo rỗng).
    5. Đánh giá chi tiết từng phần (sectionFeedback): cho mỗi phần đánh giá status (good/needs_work/missing), tóm tắt, và 2-3 gợi ý cụ thể.
    
    Văn bản SKKN:
    ${truncated}
  `;

  return callWithFallback(async (model) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
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
                  criteria: { type: Type.STRING },
                  score: { type: Type.NUMBER, description: "Score out of 10" },
                  comment: { type: Type.STRING }
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
    const parsed = JSON.parse(response.text);
    return {
      analysis: {
        plagiarismScore: parsed.plagiarismScore,
        qualityScore: parsed.qualityScore,
        structure: parsed.structure,
        qualityCriteria: parsed.qualityCriteria,
        sectionFeedback: parsed.sectionFeedback || []
      },
      currentTitle: parsed.currentTitle
    };
  });
};

// --- Parse SKKN Structure (AI-powered) ---
export const parseStructure = async (text: string): Promise<{ id: string, title: string, level: number, parentId: string, content: string }[]> => {
  const ai = getAI();
  const truncated = text.substring(0, 12000);

  const prompt = `
    Bạn là chuyên gia phân tích cấu trúc Sáng kiến Kinh nghiệm (SKKN) Việt Nam.
    
    NHIỆM VỤ: Phân tích văn bản SKKN bên dưới và TÁCH RA thành các mục lớn và mục con.
    
    QUY TẮC PHÂN TÍCH:
    1. Tìm TẤT CẢ mục lớn (Phần I, II, III, IV, V, VI... hoặc biến thể như "PHẦN MỞ ĐẦU", "A.", "I.", "CHƯƠNG 1" v.v.)
    2. Trong mỗi mục lớn, tìm CÁC MỤC CON. Đặc biệt:
       - "Giải pháp 1", "Giải pháp 2", "Biện pháp 1", "Biện pháp 2"... → PHẢI tách thành mục con riêng biệt
       - "1.", "2.", "3." bên trong 1 phần lớn → tách thành mục con
       - "a)", "b)", "2.1", "2.2" → tách thành mục con
    3. Mỗi mục con phải có nội dung riêng (content) để có thể sửa độc lập.
    4. KHÔNG bỏ sót bất kỳ nội dung nào.
    5. Trường "id" phải unique, dạng: "section-1", "section-2", "section-2-1", "section-2-2"...
    6. Trường "parentId" = "" nếu là mục lớn (level 1), hoặc = id của mục cha nếu là mục con (level 2).
    7. "title" = tên mục/tiêu đề chính xác như trong văn bản gốc.
    8. "content" = toàn bộ nội dung thuộc mục đó (KHÔNG bao gồm nội dung của mục con).
    
    VĂN BẢN SKKN:
    """
    ${truncated}
    """
  `;

  return callWithFallback(async (model) => {
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
              title: { type: Type.STRING },
              level: { type: Type.INTEGER, description: "1=mục lớn, 2=mục con" },
              parentId: { type: Type.STRING, description: "Empty for level 1, parent id for level 2" },
              content: { type: Type.STRING, description: "Nội dung thuộc mục này" }
            }
          }
        }
      }
    });
    if (!response.text) throw new Error("No response from AI");
    return JSON.parse(response.text);
  });
};

// --- Title Suggestions ---
export const generateTitleSuggestions = async (currentTitle: string, contentSummary: string): Promise<TitleSuggestion[]> => {
  const ai = getAI();
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

  return callWithFallback(async (model) => {
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
              feasibility: { type: Type.STRING, description: "Cao/Trung bình/Thấp" },
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
  const ai = getAI();

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

  return callWithFallback(async (model) => {
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

// --- Refine Section Content ---
export const refineSectionContent = async (
  sectionName: string,
  originalContent: string,
  newTitle: string
): Promise<string> => {
  const ai = getAI();

  const prompt = `
    Bạn là trợ lý SKKN Editor Pro. Viết lại phần "${sectionName}" cho đề tài: "${newTitle}".
    
    NGUYÊN TẮC BẤT DI BẤT DỊCH:
    1. GIỮ NGUYÊN tất cả số liệu thực tế (%, số lượng, điểm số, năm học).
    2. GIỮ NGUYÊN tên riêng (trường, lớp, địa danh, tên người).
    3. THAY ĐỔI cách diễn đạt: ngôn ngữ học thuật, sắc sảo, chuyên nghiệp.
    4. LOẠI BỎ câu sáo rỗng ("Trong bối cảnh đổi mới...", "Với sự phát triển..."). Dẫn dắt trực tiếp, cụ thể.
    5. TĂNG CƯỜNG tính khoa học: thêm viện dẫn lý thuyết phù hợp, thuật ngữ chuyên ngành.
    6. TĂNG CƯỜNG tính mới: cách tiếp cận độc đáo, góc nhìn khác biệt.
    7. ĐẢM BẢO không trùng lặp với các SKKN phổ biến - diễn đạt HOÀN TOÀN MỚI.
    8. Cấu trúc rõ ràng, mạch lạc, có luận điểm - luận cứ - dẫn chứng.
    9. GIỮ NGUYÊN mọi công thức toán học — viết dưới dạng LaTeX (ví dụ: $x^2 + y^2 = z^2$, \\frac{a}{b}, \\sqrt{n}).
    10. KHÔNG được bỏ, thay đổi, hay viết lại bất kỳ công thức toán nào. Chỉ sửa văn xuôi xung quanh.
    
    Nội dung gốc:
    "${originalContent}"
    
    Trả về nội dung đã sửa. Định dạng đẹp, chuẩn. Công thức toán viết dạng LaTeX.
  `;

  return callWithFallback(async (model) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });
    return response.text || "";
  });
};