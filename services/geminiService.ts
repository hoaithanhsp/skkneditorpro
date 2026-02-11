import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisMetrics, TitleSuggestion, SectionSuggestion, SectionEditSuggestion, UserRequirements, AI_MODELS, AIModelId } from "../types";
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
  // Gửi tối đa 50K ký tự — đủ cho SKKN 50+ trang
  const truncated = text.substring(0, 50000);

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
    10. PHẢI RÀ SOÁT ĐẾN HẾT VĂN BẢN — bao gồm cả các phần cuối cùng như:
        - Kết luận / Kiến nghị
        - Tài liệu tham khảo
        - Phụ lục
        - Cam kết / Lời cam đoan
        Nếu văn bản có các phần này thì BẮT BUỘC phải liệt kê.
    11. Kiểm tra lại: đếm số phần level 1 tìm được. Nếu SKKN thường có 5-7 phần chính
        mà chỉ tìm được <= 4 phần → RÀ SOÁT LẠI TOÀN BỘ văn bản vì CÓ THỂ bỏ sót.
    
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
  const ai = getAI();

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

  return callWithFallback(async (model) => {
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
              label: { type: Type.STRING, description: "Tóm tắt ngắn gọn đề xuất" },
              description: { type: Type.STRING, description: "Giải thích chi tiết tại sao cần sửa" },
              originalText: { type: Type.STRING, description: "Đoạn gốc cần sửa (trích chính xác). Để rỗng nếu action=add" },
              suggestedText: { type: Type.STRING, description: "Đoạn thay thế/thêm mới. Để rỗng nếu action=remove" },
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
  const ai = getAI();
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

  return callWithFallback(async (model) => {
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
  const ai = getAI();
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

  return callWithFallback(async (model) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });
    return response.text || "";
  });
};

// ================================================================
// RÚT NGẮN SKKN THEO SỐ TRANG YÊU CẦU
// ================================================================
export const shortenSKKN = async (
  fullText: string,
  targetPages: number
): Promise<string> => {
  const ai = getAI();

  const totalWordBudget = targetPages * 350;
  const introWordBudget = Math.round(totalWordBudget * 0.10);
  const solutionWordBudget = Math.round(totalWordBudget * 0.80);
  const conclusionWordBudget = Math.round(totalWordBudget * 0.10);

  const truncated = fullText.substring(0, 60000);

  const prompt = `
Bạn là chuyên gia biên tập Sáng kiến Kinh nghiệm (SKKN) với 20 năm kinh nghiệm. 

NHIỆM VỤ: RÚT NGẮN toàn bộ SKKN dưới đây xuống còn khoảng ${targetPages} trang (~${totalWordBudget} từ).

===== NGÂN SÁCH TỪ THEO TỈ LỆ =====
- Mở đầu + Cơ sở lý luận + Thực trạng: ~${introWordBudget} từ (10%)
- Nội dung Giải pháp/Biện pháp (CHÍNH): ~${solutionWordBudget} từ (80%)
- Kết quả + Kết luận + Kiến nghị: ~${conclusionWordBudget} từ (10%)
=====================================

QUY TẮC BẮT BUỘC:

1. GIỮ NGUYÊN CẤU TRÚC ĐỀ MỤC:
   - Giữ tất cả tiêu đề phần (PHẦN I, II, ...)
   - Giữ tất cả đề mục con (1., 2., Giải pháp 1, Biện pháp 1, ...)
   - Chỉ rút ngắn NỘI DUNG, không xóa đề mục

2. GIỮ NGUYÊN ĐỊNH DẠNG:
   - Công thức toán học (LaTeX: $...$, \\frac, \\sqrt)
   - Mô tả hình ảnh (có thể xóa BỚT hình không cần thiết nhưng KHÔNG vỡ cấu trúc)
   - Bảng biểu quan trọng (số liệu, so sánh)
   - In đậm (**text**), in nghiêng (*text**)
   - Danh sách (bullet points, numbered lists)

3. CHIẾN LƯỢC RÚT NGẮN:
   - ƯU TIÊN GIỮ: Ý chính, số liệu, luận điểm cốt lõi, bảng biểu, công thức
   - CẮT BỎ: Ý phụ, giải thích dài dòng, ví dụ trùng lặp, trích dẫn dài, hình ảnh thừa
   - Gộp nhiều câu cùng ý thành 1 câu ngắn gọn
   - Loại bỏ câu sáo rỗng
   - Rút gọn phần lý luận chung, giữ phần cụ thể
   - Với Giải pháp: giữ TẤT CẢ giải pháp, chỉ rút ngắn mô tả mỗi giải pháp
   - Nếu có N giải pháp → ~${Math.round(solutionWordBudget / 5)} từ/giải pháp (ước 5 GP)

4. PHẦN MỞ ĐẦU + THỰC TRẠNG (10%):
   - Chỉ giữ lý do, bối cảnh cốt lõi, số liệu quan trọng nhất
   - Loại bỏ trích dẫn lý luận dài

5. PHẦN KẾT LUẬN (10%):
   - Tóm tắt kết quả chính (giữ bảng số liệu nếu có)
   - Kiến nghị ngắn gọn

6. KIỂM TRA SAU RÚT NGẮN:
   - Số từ ước tính gần ${totalWordBudget} (±10%)
   - Không thiếu đề mục
   - Công thức toán học nguyên vẹn
   - Logic mạch lạc

ĐỊNH DẠNG ĐẦU RA: Toàn bộ SKKN đã rút ngắn — Markdown, bảng biểu markdown table, công thức LaTeX.

===== VĂN BẢN SKKN GỐC =====
${truncated}
===== HẾT VĂN BẢN =====
  `;

  return callWithFallback(async (model) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: 0.1,
      },
    });
    return response.text || "";
  });
};