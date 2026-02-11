import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisMetrics, TitleSuggestion, SectionSuggestion, AI_MODELS, AIModelId } from "../types";
import { buildKnowledgeContext, SCORING_CRITERIA, CLICHE_PHRASES, COMPARISON_TABLE_TEMPLATE } from "../knowledge-base";

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
  return AI_MODELS.find(m => m.default)?.id || 'gemini-3-flash-preview';
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

  // Build scoring criteria context
  const scoringContext = Object.values(SCORING_CRITERIA).map(sc =>
    `- ${sc.name} (${sc.maxScore}đ): ${sc.description}\n  Mức cao nhất: ${sc.levels[0].label}`
  ).join('\n');

  const clicheList = CLICHE_PHRASES.slice(0, 12).map(c => `"${c}"`).join(', ');

  const prompt = `
    Bạn là chuyên gia thẩm định Sáng kiến Kinh nghiệm (SKKN) cấp Bộ với 20 năm kinh nghiệm. Hãy phân tích CHUYÊN SÂU văn bản SKKN sau.
    
    TIÊU CHÍ CHẤM SKKN (theo Nghị định 13/2012/NĐ-CP):
${scoringContext}
    
    NHIỆM VỤ CHI TIẾT:
    1. Xác định tên đề tài hiện tại (trích chính xác từ văn bản).
    2. Phân tích cấu trúc: kiểm tra đủ 6 phần chính (I→VI) và các mục con.
    3. Đánh giá chất lượng theo thang điểm 100 dựa trên 10 tiêu chí:
       - Tính mới / Sáng tạo (trọng số cao nhất — đề tài có gì KHÁC BIỆT?)
       - Cấu trúc logic (Lý luận → Thực trạng → Giải pháp → Kết quả có mạch lạc?)
       - Cơ sở lý luận (có viện dẫn tác giả, lý thuyết cụ thể? Vygotsky, Bloom, Piaget...)
       - Số liệu / Minh chứng (có bảng biểu, biểu đồ, số liệu trước/sau?)
       - Tính khả thi (có thể áp dụng ở trường khác không?)
       - Phương pháp nghiên cứu (có nhóm đối chứng/thực nghiệm? Kiểm định thống kê?)
       - Ngôn ngữ khoa học (có dùng thuật ngữ chuyên ngành? Tránh câu sáo rỗng?)
       - Tính thực tiễn (giải quyết vấn đề cụ thể nào?)
       - Khả năng nhân rộng (mô hình có thể triển khai rộng?)
       - Hình thức trình bày (format, bảng biểu, tài liệu tham khảo)
    4. Ước tỷ lệ đạo văn — kiểm tra câu sáo rỗng phổ biến: ${clicheList}
    5. Đánh giá chi tiết từng phần (sectionFeedback): cho mỗi phần đánh giá status (good/needs_work/missing), tóm tắt, và 2-3 gợi ý CỤ THỂ (không chung chung).
    
    Văn bản SKKN:
    ${truncated}
  `;

  return callWithFallback(async (model) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: 0,
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

// --- Parse SKKN Structure (AI-powered, multi-level) ---
export const parseStructure = async (text: string): Promise<{ id: string, title: string, level: number, parentId: string, content: string }[]> => {
  const ai = getAI();
  const truncated = text.substring(0, 20000);

  const prompt = `
    Bạn là chuyên gia phân tích cấu trúc Sáng kiến Kinh nghiệm (SKKN) Việt Nam.
    
    NHIỆM VỤ: Phân tích văn bản SKKN bên dưới và TÁCH RA thành các mục ĐA CẤP (không giới hạn số cấp).
    
    QUY TẮC PHÂN TÍCH — TRUY XUẤT TẬN CÙNG:
    1. Tìm TẤT CẢ mục ở MỌI CẤP ĐỘ:
       - Level 1: Phần I, II, III... hoặc CHƯƠNG 1, A., B...
       - Level 2: 1., 2., 3. hoặc 4.1, 4.2, "a)", "b)"...
       - Level 3: 1.1., 2.1., 4.2.1, "Giải pháp 1", "Biện pháp 1"...
       - Level 4+: a), b), (i), (ii)... nếu có
    2. PHẢI ĐI SÂU TẬN CÙNG — nếu mục 4.2 có chứa "4.2.1 Giải pháp 1", "4.2.2 Giải pháp 2"... 
       thì PHẢI tách từng giải pháp thành mục riêng biệt với nội dung đầy đủ.
    3. ĐẶC BIỆT QUAN TRỌNG: 
       - "Giải pháp 1/2/3/4/5", "Biện pháp 1/2/3/4/5" → LUÔN tách thành mục con riêng biệt
       - Mỗi giải pháp/biện pháp phải có NỘI DUNG ĐẦY ĐỦ trong trường "content"
    4. QUY TẮC VỀ CONTENT:
       - Mục LÁ (không có mục con bên dưới): trường "content" = TOÀN BỘ nội dung văn bản thuộc mục đó. BẮT BUỘC PHẢI CÓ.
       - Mục CHA (có mục con): trường "content" = phần giới thiệu/dẫn dắt trước mục con đầu tiên (nếu có), hoặc "" nếu không có.
       - KHÔNG BAO GIỜ để trường "content" rỗng cho mục lá.
    5. Trường "id" phải unique, dạng: "s1", "s2", "s2-1", "s2-1-1", "s2-1-2"...
    6. Trường "parentId": 
       - = "" nếu là mục cấp cao nhất (level 1)
       - = id của mục cha trực tiếp nếu là mục con
    7. "title" = tên/tiêu đề CHÍNH XÁC như trong văn bản gốc
    8. "level" = cấp độ: 1, 2, 3, 4...
    9. TUYỆT ĐỐI KHÔNG bỏ sót nội dung. Mỗi đoạn văn trong SKKN phải thuộc về ít nhất 1 mục.
    
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
              level: { type: Type.INTEGER, description: "1=cấp cao nhất, 2=mục con, 3=mục cháu, 4+..." },
              parentId: { type: Type.STRING, description: "Empty string for level 1, parent id otherwise" },
              content: { type: Type.STRING, description: "Nội dung văn bản thuộc mục này. BẮT BUỘC có cho mục lá." }
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

// --- Refine Section Content (with Knowledge Base injection) ---
export const refineSectionContent = async (
  sectionName: string,
  originalContent: string,
  newTitle: string
): Promise<string> => {
  const ai = getAI();

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

  return callWithFallback(async (model) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });
    return response.text || "";
  });
};