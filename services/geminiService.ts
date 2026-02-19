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

  return callWithFallback(async (model) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: 0,
        maxOutputTokens: 4096,
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
                  criteria: { type: Type.STRING, description: "Tên tiêu chí đánh giá" },
                  score: { type: Type.NUMBER, description: "Điểm từ 1-10, đánh giá chính xác theo nội dung thực tế" },
                  comment: { type: Type.STRING, description: "Nhận xét CỤ THỂ ít nhất 30 ký tự, giải thích tại sao cho điểm này. KHÔNG ĐƯỢC bỏ trống." }
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
  // Gửi tối đa 80K ký tự — đủ cho SKKN 60+ trang
  const truncated = text.substring(0, 80000);

  const prompt = `
    Bạn là chuyên gia phân tích cấu trúc Sáng kiến Kinh nghiệm (SKKN) Việt Nam.
    
    NHIỆM VỤ: Phân tích văn bản SKKN bên dưới và TÁCH RA thành CẤU TRÚC ĐA CẤP ĐẦY ĐỦ.
    
    VÍ DỤ OUTPUT MONG ĐỢI (SKKN điển hình):
    [
      {"id":"s1","title":"MỤC LỤC","level":1,"parentId":"","content":"..."},
      {"id":"s2","title":"PHẦN I. ĐẶT VẤN ĐỀ","level":1,"parentId":"","content":"..."},
      {"id":"s3","title":"PHẦN II. NỘI DUNG","level":1,"parentId":"","content":""},
      {"id":"s3-1","title":"1. Cơ sở lý luận","level":2,"parentId":"s3","content":"..."},
      {"id":"s3-2","title":"2. Thực trạng vấn đề","level":2,"parentId":"s3","content":"..."},
      {"id":"s3-3","title":"3. Các giải pháp","level":2,"parentId":"s3","content":""},
      {"id":"s3-3-1","title":"Giải pháp 1: ...","level":3,"parentId":"s3-3","content":"..."},
      {"id":"s3-3-2","title":"Giải pháp 2: ...","level":3,"parentId":"s3-3","content":"..."},
      {"id":"s3-3-3","title":"Giải pháp 3: ...","level":3,"parentId":"s3-3","content":"..."},
      {"id":"s3-4","title":"4. Kết quả đạt được","level":2,"parentId":"s3","content":"..."},
      {"id":"s4","title":"PHẦN III. KẾT LUẬN VÀ KIẾN NGHỊ","level":1,"parentId":"","content":"..."},
      {"id":"s5","title":"TÀI LIỆU THAM KHẢO","level":1,"parentId":"","content":"..."},
      {"id":"s6","title":"PHỤ LỤC","level":1,"parentId":"","content":"..."}
    ]
    
    QUY TẮC PHÂN TÍCH — ĐẦY ĐỦ VÀ CHÍNH XÁC:
    1. Tìm TẤT CẢ mục ở MỌI CẤP ĐỘ:
       - Level 1: Phần I, II, III... hoặc CHƯƠNG 1, MỤC LỤC, TÀI LIỆU THAM KHẢO, PHỤ LỤC...
       - Level 2: 1., 2., 3. hoặc 4.1, 4.2...
       - Level 3: 1.1., 2.1., 4.2.1, "Giải pháp 1", "Biện pháp 1", "Bước 1"...
       - Level 4+: a), b), (i), (ii)... nếu có
    2. PHẢI ĐI SÂU TẬN CÙNG — tách từng giải pháp/biện pháp/bước thành mục riêng.
    3. ĐẶC BIỆT QUAN TRỌNG: 
       - "Giải pháp 1/2/3/4/5", "Biện pháp 1/2/3/4/5", "Bước 1/2/3..." → LUÔN tách thành mục con
       - Mỗi giải pháp/biện pháp phải có NỘI DUNG ĐẦY ĐỦ trong trường "content"
    4. QUY TẮC VỀ CONTENT:
       - Mục LÁ (không có mục con): "content" = TOÀN BỘ nội dung. BẮT BUỘC PHẢI CÓ.
       - Mục CHA (có mục con): "content" = phần giới thiệu trước mục con đầu tiên hoặc "".
    5. Trường "id" phải unique: "s1", "s2", "s2-1", "s2-1-1"...
    6. "parentId": = "" nếu level 1, = id cha trực tiếp nếu level 2+
    7. "title" = tiêu đề CHÍNH XÁC như trong văn bản gốc
    8. TUYỆT ĐỐI KHÔNG bỏ sót. Đọc TỪ ĐẦU ĐẾN CUỐI văn bản.
    9. PHẢI bao gồm: Mục lục, Đặt vấn đề, Nội dung, Kết luận, Tài liệu tham khảo, Phụ lục, Cam kết (nếu có).
    
    ⚠️ KIỂM TRA CUỐI: 
    - SKKN tiêu chuẩn có 10-30+ mục tổng cộng (bao gồm mục con).
    - Nếu chỉ tìm được <= 5 mục → BẠN ĐÃ BỎ SÓT, phải rà soát lại TOÀN BỘ văn bản.
    - Đếm lại số level-1: thường >= 3 phần chính.
    
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
        temperature: 0,
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
// RÚT NGẮN SKKN THEO SỐ TRANG YÊU CẦU (MULTI-PASS)
// ================================================================

// Tách SKKN thành các phần lớn dựa trên heading
function splitIntoSections(text: string): { title: string; content: string }[] {
  // Tìm các heading chính: PHẦN I, PHẦN II, CHƯƠNG, hoặc heading markdown #
  const sectionRegex = /^(#{1,2}\s+.+|PHẦN\s+[IVXLC]+[.:].+|CHƯƠNG\s+\d+[.:].+|[IVXLC]+\.\s+.+)/gmi;
  const matches = [...text.matchAll(sectionRegex)];

  if (matches.length < 2) {
    // Không đủ heading → trả về 1 phần duy nhất
    return [{ title: 'Toàn bộ', content: text }];
  }

  const sections: { title: string; content: string }[] = [];

  for (let i = 0; i < matches.length; i++) {
    const startIdx = matches[i].index!;
    const endIdx = i + 1 < matches.length ? matches[i + 1].index! : text.length;
    const title = matches[i][0].replace(/^#+\s*/, '').trim();
    const content = text.substring(startIdx, endIdx).trim();
    sections.push({ title, content });
  }

  // Nếu có nội dung trước heading đầu tiên (mở đầu, bìa...)
  const beforeFirst = text.substring(0, matches[0].index!).trim();
  if (beforeFirst.length > 100) {
    sections.unshift({ title: 'Phần mở đầu', content: beforeFirst });
  }

  return sections;
}

// Rút ngắn 1 phần
async function shortenOneSection(
  sectionContent: string,
  sectionTitle: string,
  targetChars: number,
  originalTotalChars: number,
  targetTotalPages: number
): Promise<string> {
  const ai = getAI();

  const prompt = `
Bạn là chuyên gia biên tập SKKN. Nhiệm vụ: VIẾT LẠI phần "${sectionTitle}" của SKKN cho ngắn gọn hơn.

⚠️ YÊU CẦU BẮT BUỘC VỀ ĐỘ DÀI:
- Phần này hiện có ${sectionContent.length.toLocaleString()} ký tự
- Bạn PHẢI viết lại với khoảng ${targetChars.toLocaleString()} ký tự (±10%)
- KHÔNG ĐƯỢC viết ngắn hơn ${Math.round(targetChars * 0.85).toLocaleString()} ký tự
- KHÔNG ĐƯỢC viết dài hơn ${Math.round(targetChars * 1.15).toLocaleString()} ký tự
- 1 trang A4 = 2.200 ký tự (Times New Roman 12pt)

QUY TẮC:
1. GIỮ NGUYÊN tất cả tiêu đề, đề mục con
2. Viết lại nội dung ngắn gọn hơn nhưng ĐẦY ĐỦ Ý CHÍNH
3. Giữ: số liệu, bảng biểu, công thức toán, ví dụ hay nhất
4. Cắt: lặp ý, giải thích thừa, trích dẫn dài, câu sáo rỗng
5. KHÔNG ĐƯỢC tóm tắt — phải VIẾT LẠI đầy đủ nội dung

ĐỊNH DẠNG: Markdown. KHÔNG ghi chú thích. Bắt đầu viết NGAY:

===== NỘI DUNG PHẦN GỐC =====
${sectionContent}
===== HẾT =====
`;

  return callWithFallback(async (model) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: 0.2,
        maxOutputTokens: 16384,
      },
    });
    return response.text || "";
  });
}

export const shortenSKKN = async (
  fullText: string,
  targetPages: number,
  onProgress?: (msg: string) => void
): Promise<string> => {
  const CHARS_PER_PAGE = 2200;
  const totalCharBudget = targetPages * CHARS_PER_PAGE;
  const originalCharCount = fullText.length;

  // Bước 1: Tách thành các phần
  onProgress?.('Đang phân tích cấu trúc SKKN...');
  const sections = splitIntoSections(fullText);

  if (sections.length <= 1) {
    // Không tách được → gọi 1 lần duy nhất
    onProgress?.('Đang rút ngắn toàn bộ...');
    return shortenOneSection(fullText, 'Toàn bộ SKKN', totalCharBudget, originalCharCount, targetPages);
  }

  // Bước 2: Tính budget ký tự cho mỗi phần theo tỉ lệ
  const totalOriginalChars = sections.reduce((sum, s) => sum + s.content.length, 0);
  const sectionBudgets = sections.map(s => ({
    ...s,
    charBudget: Math.round((s.content.length / totalOriginalChars) * totalCharBudget)
  }));

  // Bước 3: Rút ngắn từng phần
  const results: string[] = [];
  for (let i = 0; i < sectionBudgets.length; i++) {
    const sec = sectionBudgets[i];
    onProgress?.(`Đang rút ngắn phần ${i + 1}/${sectionBudgets.length}: ${sec.title.substring(0, 50)}...`);

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
      targetPages
    );
    results.push(shortened);
  }

  // Bước 4: Ghép kết quả
  onProgress?.('Đang hoàn thiện...');
  return results.join('\n\n---\n\n');
};