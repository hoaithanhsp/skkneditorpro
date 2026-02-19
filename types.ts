export enum AppStep {
  UPLOAD = 0,
  ANALYZING = 1,
  DASHBOARD = 2,
  TITLE_SELECTION = 3,
  CONTENT_REFINEMENT = 4,
  QUICK_EDIT = 5,
}

export interface AnalysisMetrics {
  plagiarismScore: number;
  qualityScore: number;
  structure: {
    hasIntro: boolean;
    hasTheory: boolean;
    hasReality: boolean;
    hasSolution: boolean;
    hasResult: boolean;
    hasConclusion: boolean;
    missing: string[];
  };
  qualityCriteria: {
    criteria: string;
    score: number;
    comment: string;
  }[];
  sectionFeedback: {
    sectionId: string;
    status: 'good' | 'needs_work' | 'missing';
    summary: string;
    suggestions: string[];
  }[];
}

export interface TitleSuggestion {
  id: number;
  title: string;
  noveltyPoints: string[];
  overlapPercentage: number;
  feasibility: string;
  score: number;
}

export interface SectionSuggestion {
  id: string;
  type: 'scientific' | 'creativity' | 'novelty' | 'plagiarism';
  label: string;
  description: string;
  originalText: string;
  suggestedText: string;
}

// Tài liệu tham khảo do người dùng upload
export interface ReferenceDocument {
  id: string;
  name: string;
  content: string; // nội dung text đã extract
  type: 'document' | 'exercise'; // tài liệu hay bài tập
}

// Yêu cầu người dùng cho việc sửa SKKN
export interface UserRequirements {
  pageLimit: number | null;       // giới hạn số trang (null = không giới hạn)
  referenceDocuments: ReferenceDocument[]; // tài liệu tham khảo
  customInstructions: string;     // yêu cầu đặc biệt khác
}

// Kết quả phân tích chi tiết một section — đề xuất sửa cụ thể
export interface SectionEditSuggestion {
  id: string;
  action: 'replace' | 'add' | 'remove' | 'modify';
  label: string;           // tóm tắt ngắn
  description: string;     // giải thích chi tiết
  originalText: string;    // đoạn gốc cần sửa (nếu replace/remove/modify)
  suggestedText: string;   // đoạn thay thế (nếu replace/add/modify)
  category: 'content' | 'example' | 'structure' | 'language' | 'reference';
  applied: boolean;        // đã áp dụng chưa
}

export interface SectionContent {
  id: string;
  title: string;
  level: number;        // 1 = mục lớn, 2 = mục con
  parentId?: string;     // id mục cha (nếu level=2)
  originalContent: string;
  refinedContent: string;
  isProcessing: boolean;
  suggestions: SectionSuggestion[];
  editSuggestions: SectionEditSuggestion[];
}

export interface SKKNData {
  fileName: string;
  originalText: string;
  currentTitle: string;
  analysis: AnalysisMetrics | null;
  titleSuggestions: TitleSuggestion[];
  selectedNewTitle: TitleSuggestion | null;
  sections: SectionContent[];
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

// --- History ---
export interface HistoryEntry {
  id: string;
  fileName: string;
  currentTitle: string;
  selectedNewTitle: string;
  timestamp: number;
  sectionsCount: number;
  completedCount: number;
  // full data for restore
  data: SKKNData;
  maxReachedStep: number;
}

export const AI_MODELS = [
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', desc: 'Nhanh, mới nhất', default: true },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro', desc: 'Chất lượng cao nhất', default: false },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', desc: 'Ổn định, dự phòng', default: false },
] as const;

export type AIModelId = typeof AI_MODELS[number]['id'];