export enum AppStep {
  UPLOAD = 0,
  ANALYZING = 1,
  DASHBOARD = 2,
  TITLE_SELECTION = 3,
  CONTENT_REFINEMENT = 4,
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

export interface SectionContent {
  id: string;
  title: string;
  level: number;        // 1 = mục lớn, 2 = mục con
  parentId?: string;     // id mục cha (nếu level=2)
  originalContent: string;
  refinedContent: string;
  isProcessing: boolean;
  suggestions: SectionSuggestion[];
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