import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppStep, SKKNData, SectionContent, TitleSuggestion, ToastMessage, HistoryEntry, UserRequirements } from './types';
import { STEP_LABELS } from './constants';
import * as geminiService from './services/geminiService';
import * as historyService from './services/historyService';
import StepUpload from './components/StepUpload';
import StepAnalysis from './components/StepAnalysis';
import StepDashboard from './components/StepDashboard';
import StepTitle from './components/StepTitle';
import StepEditor from './components/StepEditor';
import StepQuickEdit from './components/StepQuickEdit';
import ApiKeyModal from './components/ApiKeyModal';
import HistoryPanel from './components/HistoryPanel';
import ShortenSKKN from './components/ShortenSKKN';
import * as sessionService from './services/sessionService';
import LoginScreen from './components/LoginScreen';
import { Settings, Check, Key, AlertCircle, Clock, Scissors, LogOut, Save, FolderOpen } from 'lucide-react';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';

// --- Local fallback parser (used if AI parse fails) --- MULTI-LEVEL ---
const parseSectionsLocal = (text: string): SectionContent[] => {
  // === STEP 1: Detect ALL section headings at every level ===
  interface SectionMatch {
    index: number;
    title: string;
    id: string;
    level: number;
  }
  let allMatches: SectionMatch[] = [];
  let matchCounter = 0;

  // ----- Level 1 patterns -----
  const level1Patterns: { regex: RegExp; idPrefix: string }[] = [
    { regex: /^(?:PHẦN|Phần)\s+([IVXLC]+)\b[.:)]*\s*(.*)/gim, idPrefix: 'phan' },
    { regex: /^([IVXLC]+)\.\s+([\wÀ-ỹ].*)/gim, idPrefix: 'roman' },
    { regex: /^(?:CHƯƠNG|Chương)\s+(\d+)\b[.:)]*\s*(.*)/gim, idPrefix: 'chuong' },
    { regex: /^(MỤC LỤC|TÀI LIỆU THAM KHẢO|PHỤ LỤC|DANH MỤC|LỜI CAM ĐOAN|LỜI CẢM ƠN|KẾT LUẬN VÀ KIẾN NGHỊ)\b(.*)/gim, idPrefix: 'named' },
  ];
  for (const { regex, idPrefix } of level1Patterns) {
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
      matchCounter++;
      allMatches.push({ index: match.index, title: match[0].trim(), id: `${idPrefix}-${matchCounter}`, level: 1 });
    }
  }

  // ----- Level 2 patterns: "1.", "2.", "3." or "A.", "B." at start of line -----
  const level2Regex = /^(\d+)\.\s+([\wÀ-ỹ][\wÀ-ỹ\s,;:'"()–\-]{5,})/gim;
  let m2;
  level2Regex.lastIndex = 0;
  while ((m2 = level2Regex.exec(text)) !== null) {
    matchCounter++;
    allMatches.push({ index: m2.index, title: m2[0].trim(), id: `l2-${matchCounter}`, level: 2 });
  }

  // ----- Level 3 patterns: "1.1.", "1.2.", "2.1.", "4.2.1." etc -----
  const level3Regex = /^(\d+\.\d+\.?\s+[\wÀ-ỹ][\wÀ-ỹ\s,;:'"()–\-]{5,})/gim;
  let m3;
  level3Regex.lastIndex = 0;
  while ((m3 = level3Regex.exec(text)) !== null) {
    matchCounter++;
    allMatches.push({ index: m3.index, title: m3[0].trim(), id: `l3-${matchCounter}`, level: 3 });
  }

  // ----- "Giải pháp 1/2/3...", "Biện pháp 1/2/3..." (level 3) -----
  const solutionRegex = /^(?:Giải pháp|Biện pháp|Bước)\s+(\d+)\s*[.:)]*\s*(.*)/gim;
  let ms;
  solutionRegex.lastIndex = 0;
  while ((ms = solutionRegex.exec(text)) !== null) {
    matchCounter++;
    allMatches.push({ index: ms.index, title: ms[0].trim(), id: `sol-${matchCounter}`, level: 3 });
  }

  // ----- "a)", "b)", "c)" sub-sections (level 3) -----
  const letterRegex = /^([a-hA-H])\)\s+([\wÀ-ỹ][\wÀ-ỹ\s,;:'"()–\-]{5,})/gim;
  let ml;
  letterRegex.lastIndex = 0;
  while ((ml = letterRegex.exec(text)) !== null) {
    matchCounter++;
    allMatches.push({ index: ml.index, title: ml[0].trim(), id: `let-${matchCounter}`, level: 3 });
  }

  // === STEP 2: Deduplicate overlapping matches ===
  allMatches.sort((a, b) => a.index - b.index);
  const deduped: SectionMatch[] = [];
  for (const m of allMatches) {
    if (deduped.length === 0 || Math.abs(m.index - deduped[deduped.length - 1].index) > 5) {
      deduped.push(m);
    } else {
      // Keep the one with higher level (more specific)
      const last = deduped[deduped.length - 1];
      if (m.level > last.level) {
        deduped[deduped.length - 1] = m;
      }
    }
  }

  // === STEP 3: Fallback — "PHẦN I" keyword approach ===
  if (deduped.length === 0) {
    const upperText = text.toUpperCase();
    const keywords = [
      { key: 'PHẦN I', id: 'section-1' }, { key: 'PHẦN II', id: 'section-2' },
      { key: 'PHẦN III', id: 'section-3' }, { key: 'PHẦN IV', id: 'section-4' },
      { key: 'PHẦN V', id: 'section-5' }, { key: 'PHẦN VI', id: 'section-6' },
      { key: 'PHẦN VII', id: 'section-7' }, { key: 'PHẦN VIII', id: 'section-8' },
    ];
    for (const kw of keywords) {
      const idx = upperText.indexOf(kw.key);
      if (idx !== -1) {
        const lineEnd = text.indexOf('\n', idx);
        const title = text.substring(idx, lineEnd !== -1 ? lineEnd : idx + 80).trim();
        deduped.push({ index: idx, title, id: kw.id, level: 1 });
      }
    }
    deduped.sort((a, b) => a.index - b.index);
  }

  // === STEP 4: Build hierarchy — assign parentId based on level ===
  const sections: SectionContent[] = [];
  const parentStack: { id: string; level: number }[] = [];

  for (let i = 0; i < deduped.length; i++) {
    const current = deduped[i];
    const next = deduped[i + 1];
    const startPos = current.index;
    const endPos = next ? next.index : text.length;

    const rawContent = text.substring(startPos, endPos).trim();
    const titleLine = rawContent.split('\n')[0];
    const body = rawContent.substring(titleLine.length).trim();

    // Find parent: walk up the stack until we find a section with lower level
    while (parentStack.length > 0 && parentStack[parentStack.length - 1].level >= current.level) {
      parentStack.pop();
    }
    const parentId = parentStack.length > 0 ? parentStack[parentStack.length - 1].id : undefined;

    sections.push({
      id: current.id,
      title: titleLine.trim(),
      level: current.level,
      parentId,
      originalContent: body,
      refinedContent: '',
      isProcessing: false,
      suggestions: [],
      editSuggestions: []
    });

    parentStack.push({ id: current.id, level: current.level });
  }

  return sections;
};

// --- Parse markdown content to docx elements (supports tables with borders) ---
const parseContentToDocxElements = (content: string, indent: number = 0): (Paragraph | Table)[] => {
  const elements: (Paragraph | Table)[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Detect markdown table block
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        // Parse header row
        const headerCells = tableLines[0].split('|').filter(c => c.trim() !== '');
        const colCount = headerCells.length;

        // Determine which rows are separator rows (e.g. |---|---|)
        const dataRows: string[][] = [];
        let isHeader = true;
        for (let r = 0; r < tableLines.length; r++) {
          const cells = tableLines[r].split('|').filter(c => c.trim() !== '');
          // Check if this is separator row (contains only dashes, colons, spaces)
          if (/^[\s|:\-]+$/.test(tableLines[r].replace(/\|/g, ' '))) {
            continue; // skip separator
          }
          if (isHeader) {
            dataRows.push(cells.map(c => c.trim()));
            isHeader = false;
          } else {
            dataRows.push(cells.map(c => c.trim()));
          }
        }

        if (dataRows.length > 0) {
          const borderStyle = {
            style: BorderStyle.SINGLE,
            size: 1,
            color: '000000'
          };
          const borders = {
            top: borderStyle,
            bottom: borderStyle,
            left: borderStyle,
            right: borderStyle,
            insideHorizontal: borderStyle,
            insideVertical: borderStyle
          };

          const tableRows = dataRows.map((cells, rowIdx) => {
            // Pad or trim cells to match column count
            const normalizedCells = Array.from({ length: colCount }, (_, ci) => cells[ci] || '');
            return new TableRow({
              children: normalizedCells.map(cellText =>
                new TableCell({
                  children: [new Paragraph({
                    children: [new TextRun({
                      text: cellText,
                      bold: rowIdx === 0,
                      size: 24,
                      font: 'Times New Roman'
                    })],
                    spacing: { before: 40, after: 40 },
                    alignment: AlignmentType.CENTER
                  })],
                  width: { size: Math.floor(9000 / colCount), type: WidthType.DXA },
                  borders
                })
              )
            });
          });

          elements.push(new Table({
            rows: tableRows,
            width: { size: 9000, type: WidthType.DXA }
          }));

          // Add spacing after table
          elements.push(new Paragraph({ spacing: { after: 100 } }));
        }
      }
      continue;
    }

    // Regular paragraph
    if (line.trim()) {
      // Parse inline bold (**text**) and italic (*text*)
      const runs: TextRun[] = [];
      const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
      let lastIndex = 0;
      const lineText = line.trim();
      let match;

      while ((match = regex.exec(lineText)) !== null) {
        // Text before the match
        if (match.index > lastIndex) {
          runs.push(new TextRun({
            text: lineText.substring(lastIndex, match.index),
            size: 26, font: 'Times New Roman'
          }));
        }
        if (match[2]) {
          // Bold: **text**
          runs.push(new TextRun({
            text: match[2],
            bold: true, size: 26, font: 'Times New Roman'
          }));
        } else if (match[3]) {
          // Italic: *text*
          runs.push(new TextRun({
            text: match[3],
            italics: true, size: 26, font: 'Times New Roman'
          }));
        }
        lastIndex = match.index + match[0].length;
      }

      // Remaining text
      if (lastIndex < lineText.length) {
        runs.push(new TextRun({
          text: lineText.substring(lastIndex),
          size: 26, font: 'Times New Roman'
        }));
      }

      if (runs.length === 0) {
        runs.push(new TextRun({
          text: lineText,
          size: 26, font: 'Times New Roman'
        }));
      }

      elements.push(new Paragraph({
        children: runs,
        spacing: { after: 100 },
        indent: { firstLine: 720, left: indent }
      }));
    }

    i++;
  }

  return elements;
};

const App: React.FC = () => {
  // --- Authentication State ---
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('skkn_logged_in') === 'true';
  });
  const [displayName, setDisplayName] = useState(() => {
    return localStorage.getItem('skkn_display_name') || '';
  });

  const handleLoginSuccess = (name: string) => {
    setIsLoggedIn(true);
    setDisplayName(name);
  };

  const handleLogout = () => {
    localStorage.removeItem('skkn_logged_in');
    localStorage.removeItem('skkn_display_name');
    setIsLoggedIn(false);
    setDisplayName('');
  };

  // --- If not logged in, show login screen ---
  if (!isLoggedIn) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return <AppContent displayName={displayName} onLogout={handleLogout} />;
};

interface AppContentProps {
  displayName: string;
  onLogout: () => void;
}

// --- LocalStorage key cho lưu/khôi phục phiên làm việc ---
const LOCAL_SESSION_KEY = 'skkn_editor_session';

const AppContent: React.FC<AppContentProps> = ({ displayName, onLogout }) => {
  const [currentStep, setCurrentStep] = useState<AppStep>(AppStep.UPLOAD);
  const [maxReachedStep, setMaxReachedStep] = useState<number>(0);
  const [data, setData] = useState<SKKNData>({
    fileName: '',
    originalText: '',
    currentTitle: '',
    analysis: null,
    titleSuggestions: [],
    selectedNewTitle: null,
    sections: []
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStage, setAnalysisStage] = useState('');
  const [processingSectionId, setProcessingSectionId] = useState<string | null>(null);
  const [showApiModal, setShowApiModal] = useState(false);
  const [quotaExhausted, setQuotaExhausted] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showShortenMode, setShowShortenMode] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [userRequirements, setUserRequirements] = useState<UserRequirements>({
    pageLimit: null,
    referenceDocuments: [],
    customInstructions: ''
  });

  // Session restore state
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [sessionSavedAt, setSessionSavedAt] = useState<string | null>(null);
  const sessionRestoreChecked = useRef(false);

  // Check API key on mount - chỉ hiện modal khi không có key nào (cả user và env)
  useEffect(() => {
    if (!geminiService.hasAnyApiKey()) {
      setShowApiModal(true);
    }
  }, []);

  // Kiểm tra phiên đã lưu khi mở app
  useEffect(() => {
    if (sessionRestoreChecked.current) return;
    sessionRestoreChecked.current = true;
    try {
      const saved = localStorage.getItem(LOCAL_SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.data && parsed.data.sections && parsed.data.sections.length > 0) {
          setShowRestoreModal(true);
        }
      }
    } catch (e) {
      console.warn('Không thể đọc phiên đã lưu:', e);
      localStorage.removeItem(LOCAL_SESSION_KEY);
    }
  }, []);

  const hasApiKey = geminiService.hasAnyApiKey();

  // Toast helper
  const addToast = useCallback((type: ToastMessage['type'], message: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  // Update maxReachedStep when moving forward
  const goToStep = useCallback((step: AppStep) => {
    setCurrentStep(step);
    setMaxReachedStep(prev => Math.max(prev, step));
  }, []);

  // --- Step click handler (navigate to any step after upload) ---
  const handleStepClick = async (step: number) => {
    if (step === currentStep) return;

    // Allow jumping to QUICK_EDIT any time
    if (step === AppStep.QUICK_EDIT) {
      setCurrentStep(AppStep.QUICK_EDIT);
      setMaxReachedStep(prev => Math.max(prev, AppStep.QUICK_EDIT));
      return;
    }

    // After upload, allow jumping to any step
    if (!data.originalText) return; // Must have uploaded first

    // If jumping to TITLE_SELECTION and no suggestions yet, auto-generate
    if (step === AppStep.TITLE_SELECTION && data.titleSuggestions.length === 0) {
      setCurrentStep(step as AppStep);
      setMaxReachedStep(prev => Math.max(prev, step));
      setIsProcessing(true);
      try {
        const summary = data.originalText.substring(0, 3000);
        const suggestions = await geminiService.generateTitleSuggestions(data.currentTitle, summary);
        setData(prev => ({ ...prev, titleSuggestions: suggestions }));
      } catch (error) {
        console.error('Title gen failed', error);
        addToast('error', 'Lỗi tạo đề xuất tên đề tài.');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    setCurrentStep(step as AppStep);
    setMaxReachedStep(prev => Math.max(prev, step));
  };

  // --- Auto-save to history (trimmed) ---
  const autoSave = useCallback(() => {
    if (data.originalText && data.fileName) {
      const trimmedData = {
        ...data,
        originalText: data.originalText.substring(0, 2000)
      };
      historyService.saveSession(trimmedData, maxReachedStep);
    }
  }, [data, maxReachedStep]);

  // --- Auto-save phiên đầy đủ vào localStorage (không cắt dữ liệu) ---
  const autoSaveFullSession = useCallback(() => {
    if (!data.fileName && data.sections.length === 0) return;
    if (isProcessing) return;
    try {
      const sessionData = {
        data,
        currentStep,
        maxReachedStep,
        userRequirements,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(sessionData));
      setSessionSavedAt(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      console.warn('Không thể lưu phiên (dữ liệu quá lớn):', e);
    }
  }, [data, currentStep, maxReachedStep, userRequirements, isProcessing]);

  // --- Periodic auto-save every 30s ---
  useEffect(() => {
    if (!data.originalText && data.sections.length === 0) return;
    const interval = setInterval(() => {
      autoSave();
      autoSaveFullSession();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoSave, autoSaveFullSession, data.originalText, data.sections.length]);

  // --- Khôi phục phiên từ localStorage ---
  const handleRestoreSession = useCallback(() => {
    try {
      const saved = localStorage.getItem(LOCAL_SESSION_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      setData(parsed.data);
      setCurrentStep(parsed.currentStep ?? AppStep.UPLOAD);
      setMaxReachedStep(parsed.maxReachedStep ?? 0);
      if (parsed.userRequirements) setUserRequirements(parsed.userRequirements);
      setShowRestoreModal(false);
      addToast('success', `✅ Đã khôi phục phiên: "${parsed.data.fileName}"`);
    } catch (e) {
      console.error('Lỗi khôi phục phiên:', e);
      addToast('error', 'Không thể khôi phục phiên.');
      localStorage.removeItem(LOCAL_SESSION_KEY);
      setShowRestoreModal(false);
    }
  }, [addToast]);

  // --- Xóa phiên đã lưu ---
  const handleDismissRestore = useCallback(() => {
    localStorage.removeItem(LOCAL_SESSION_KEY);
    setShowRestoreModal(false);
  }, []);

  // --- Load from history ---
  const handleLoadSession = (entry: HistoryEntry) => {
    setData(entry.data);
    setMaxReachedStep(entry.maxReachedStep);
    setCurrentStep(entry.maxReachedStep as AppStep);
    addToast('info', `Đã tải lại: "${entry.fileName}"`);
  };

  // --- Lưu phiên ra file JSON ---
  const handleExportSession = () => {
    if (!data.originalText && data.sections.length === 0) {
      addToast('error', 'Chưa có dữ liệu để lưu. Vui lòng tải lên SKKN trước.');
      return;
    }
    try {
      sessionService.exportSession(data, currentStep, maxReachedStep, userRequirements);
      addToast('success', '💾 Đã lưu phiên làm việc ra file!');
    } catch (e) {
      addToast('error', 'Lỗi khi lưu phiên.');
    }
  };

  // --- Tải phiên từ file JSON ---
  const handleImportSession = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const session = await sessionService.importSession(file);
        setData(session.data);
        setCurrentStep(session.currentStep);
        setMaxReachedStep(session.maxReachedStep);
        setUserRequirements(session.userRequirements);
        addToast('success', `📂 Đã tải phiên: "${session.data.fileName}"`);
      } catch (err: any) {
        addToast('error', err.message || 'Lỗi khi tải phiên.');
      }
    };
    input.click();
  };

  // --- Xử lý lỗi quota: hiện modal đổi key + gợi ý lưu phiên ---
  const handleQuotaError = () => {
    setQuotaExhausted(true);
    setShowApiModal(true);
    addToast('error', '⚠️ Hết quota API! Lưu phiên làm việc rồi thay API key mới.');
  };

  // --- Handlers ---
  const handleUpload = async (text: string, fileName: string) => {
    if (!geminiService.hasAnyApiKey()) {
      setShowApiModal(true);
      return;
    }
    setIsProcessing(true);
    setAnalysisProgress(5);
    setAnalysisStage('Đang đọc văn bản...');
    try {
      // Step 1: AI analysis
      setAnalysisProgress(10);
      setAnalysisStage('AI đang phân tích chất lượng...');
      const result = await geminiService.analyzeSKKN(text);

      // Step 2: AI structure parsing (flexible)
      let sections: SectionContent[] = [];
      const localSections = parseSectionsLocal(text); // Always compute local parse for validation

      setAnalysisProgress(45);
      setAnalysisStage('AI đang tách cấu trúc mục...');

      try {
        const parsed = await geminiService.parseStructure(text);

        // AI giờ chỉ trả cấu trúc (không có content) → gán content từ local parser
        const matchContent = (aiTitle: string): string => {
          const aiPrefix = aiTitle.toLowerCase().substring(0, 30);
          for (const local of localSections) {
            const localPrefix = local.title.toLowerCase().substring(0, 30);
            if (aiPrefix.includes(localPrefix) || localPrefix.includes(aiPrefix)) {
              return local.originalContent;
            }
          }
          return '';
        };

        sections = parsed.map(s => ({
          id: s.id,
          title: s.title,
          level: s.level || 1,
          parentId: s.parentId || undefined,
          originalContent: s.content || matchContent(s.title),
          refinedContent: '',
          isProcessing: false,
          suggestions: [],
          editSuggestions: []
        }));

        // VALIDATION: Cross-check with local parser
        const aiLevel1Count = sections.filter(s => s.level === 1).length;
        const localLevel1Count = localSections.filter(s => s.level === 1).length;
        const aiTotalCount = sections.length;
        const localTotalCount = localSections.length;

        console.log(`[Parse] AI: ${aiTotalCount} sections (${aiLevel1Count} L1) | Local: ${localTotalCount} sections (${localLevel1Count} L1)`);

        // Case 1: AI found way too few sections — use local parser as base
        if (aiTotalCount <= 3 && localTotalCount > aiTotalCount) {
          console.warn(`AI only found ${aiTotalCount} sections, using local parser (${localTotalCount} sections) as base`);
          const localTitles = localSections.map(s => s.title.toLowerCase().substring(0, 25));
          const mergedSections = [...localSections];
          for (const aiSec of sections) {
            const aiPrefix = aiSec.title.toLowerCase().substring(0, 25);
            const alreadyExists = localTitles.some(t => t.includes(aiPrefix) || aiPrefix.includes(t));
            if (!alreadyExists) {
              mergedSections.push({ ...aiSec, id: `ai-${aiSec.id}` });
            }
          }
          sections = mergedSections;
        }
        // Case 2: AI missing some level-1 sections compared to local
        else if (aiLevel1Count < localLevel1Count) {
          console.warn(`AI found ${aiLevel1Count} L1 but local found ${localLevel1Count}. Merging missing...`);
          const existingTitles = sections.map(s => s.title.toLowerCase().substring(0, 25));
          for (const localSec of localSections) {
            const titlePrefix = localSec.title.toLowerCase().substring(0, 25);
            const alreadyExists = existingTitles.some(t => t.includes(titlePrefix) || titlePrefix.includes(t));
            if (!alreadyExists) {
              sections.push({ ...localSec, id: `merged-${localSec.id}` });
            }
          }
        }
        // Case 3: AI has fewer total sections than local
        else if (localTotalCount > aiTotalCount + 2) {
          console.warn(`Local has ${localTotalCount} vs AI's ${aiTotalCount}. Merging missing...`);
          const existingTitles = sections.map(s => s.title.toLowerCase().substring(0, 25));
          for (const localSec of localSections) {
            const titlePrefix = localSec.title.toLowerCase().substring(0, 25);
            const alreadyExists = existingTitles.some(t => t.includes(titlePrefix) || titlePrefix.includes(t));
            if (!alreadyExists) {
              sections.push({ ...localSec, id: `merged-${localSec.id}` });
            }
          }
        }
      } catch (parseError: any) {
        console.warn('AI parse failed, using local fallback:', parseError.message);
        sections = localSections;
        addToast('warning', `AI tách cấu trúc thất bại (${parseError.message?.includes('timed out') ? 'timeout' : 'lỗi'}). Dùng bộ phân tích cục bộ.`);
      }

      // Ensure at least some sections
      if (sections.length === 0) {
        sections = localSections;
      }

      setAnalysisProgress(90);
      setAnalysisStage('Đang lưu kết quả...');

      setData(prev => ({
        ...prev,
        fileName,
        originalText: text,
        currentTitle: result.currentTitle,
        analysis: result.analysis,
        sections
      }));
      goToStep(AppStep.ANALYZING);
      setAnalysisProgress(100);
      setAnalysisStage('Hoàn tất!');
      addToast('success', `Phân tích hoàn tất! Tìm thấy ${sections.length} mục/mục con.`);

      // Auto-save
      setTimeout(() => {
        historyService.saveSession({
          ...data,
          fileName,
          originalText: text,
          currentTitle: result.currentTitle,
          analysis: result.analysis,
          sections
        }, AppStep.ANALYZING);
      }, 500);
    } catch (error: any) {
      console.error("Analysis failed", error);
      if (error.message === 'API_KEY_MISSING') {
        setShowApiModal(true);
      } else if (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED') || error.message?.includes('quota')) {
        handleQuotaError();
      } else if (error.message?.includes('Cannot parse') || error.message?.includes('JSON')) {
        addToast('error', 'AI trả về dữ liệu không hợp lệ. Vui lòng thử lại.');
      } else {
        addToast('error', 'Lỗi phân tích. Vui lòng kiểm tra API Key hoặc đợi 1 phút rồi thử lại.');
      }
    } finally {
      setIsProcessing(false);
      setAnalysisProgress(0);
      setAnalysisStage('');
    }
  };

  const handleAnalysisContinue = () => {
    goToStep(AppStep.DASHBOARD);
  };

  const handleDashboardContinue = async () => {
    goToStep(AppStep.TITLE_SELECTION);
    setIsProcessing(true);
    try {
      const summary = data.originalText.substring(0, 3000);
      const suggestions = await geminiService.generateTitleSuggestions(data.currentTitle, summary);
      setData(prev => ({ ...prev, titleSuggestions: suggestions }));
    } catch (error) {
      console.error("Title gen failed", error);
      addToast('error', 'Lỗi tạo đề xuất tên đề tài.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTitleSelect = (title: TitleSuggestion) => {
    setData(prev => ({ ...prev, selectedNewTitle: title }));
    goToStep(AppStep.CONTENT_REFINEMENT);
    addToast('info', `Đã chọn: "${title.title.substring(0, 50)}..."`);
    autoSave();
  };

  const handleRefineSection = async (sectionId: string) => {
    const titleToUse = data.selectedNewTitle?.title || data.currentTitle;
    if (!titleToUse) return;
    setProcessingSectionId(sectionId);

    const section = data.sections.find(s => s.id === sectionId);
    if (section && section.originalContent) {
      try {
        const refined = await geminiService.refineSectionContent(
          section.title, section.originalContent, titleToUse
        );
        setData(prev => ({
          ...prev,
          sections: prev.sections.map(s =>
            s.id === sectionId ? { ...s, refinedContent: refined } : s
          )
        }));
        addToast('success', `Đã viết lại "${section.title}" thành công!`);
        // Auto-save after refining
        setTimeout(autoSave, 500);
      } catch (e: any) {
        console.error("Refine failed", e);
        if (e.message?.includes('429') || e.message?.includes('RESOURCE_EXHAUSTED') || e.message?.includes('quota')) {
          handleQuotaError();
        } else {
          addToast('error', `Lỗi viết lại phần "${section.title}".`);
        }
      }
    }
    setProcessingSectionId(null);
  };

  const handleUpdateSections = (newSections: SectionContent[]) => {
    setData(prev => ({ ...prev, sections: newSections }));
  };

  // --- Refine with reference documents ---
  const handleRefineSectionWithRefs = async (sectionId: string) => {
    const titleToUse = data.selectedNewTitle?.title || data.currentTitle;
    if (!titleToUse) return;
    setProcessingSectionId(sectionId);

    const section = data.sections.find(s => s.id === sectionId);
    if (section && section.originalContent) {
      try {
        const refined = await geminiService.refineSectionWithReferences(
          section.title, section.originalContent, titleToUse, userRequirements
        );
        setData(prev => ({
          ...prev,
          sections: prev.sections.map(s =>
            s.id === sectionId ? { ...s, refinedContent: refined } : s
          )
        }));
        addToast('success', `Đã viết lại "${section.title}" với tài liệu tham khảo!`);
        setTimeout(autoSave, 500);
      } catch (e: any) {
        console.error("Refine with refs failed", e);
        if (e.message?.includes('429') || e.message?.includes('RESOURCE_EXHAUSTED') || e.message?.includes('quota')) {
          handleQuotaError();
        } else {
          addToast('error', `Lỗi viết lại phần "${section.title}".`);
        }
      }
    }
    setProcessingSectionId(null);
  };

  const handleFinish = async () => {
    try {
      // Create DOCX document
      const docChildren: (Paragraph | Table)[] = [];

      // Title
      docChildren.push(new Paragraph({
        children: [new TextRun({
          text: `TÊN ĐỀ TÀI: ${data.selectedNewTitle?.title || data.currentTitle}`,
          bold: true, size: 28, font: 'Times New Roman'
        })],
        heading: HeadingLevel.TITLE,
        spacing: { after: 400 }
      }));

      // Sections (respecting hierarchy, with table support)
      data.sections.forEach(s => {
        const headingLevel = s.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_1;
        const indent = s.level === 2 ? 360 : 0;

        docChildren.push(new Paragraph({
          children: [new TextRun({
            text: s.title.toUpperCase(),
            bold: true, size: s.level === 2 ? 24 : 26, font: 'Times New Roman'
          })],
          heading: headingLevel,
          spacing: { before: s.level === 2 ? 200 : 400, after: 200 },
          indent: { left: indent }
        }));

        const content = s.refinedContent || s.originalContent;
        const contentElements = parseContentToDocxElements(content, indent);
        contentElements.forEach(el => docChildren.push(el));
      });

      const doc = new Document({
        sections: [{ children: docChildren }]
      });

      const blob = await Packer.toBlob(doc);
      const outName = `SKKN_Upgrade_${data.fileName?.replace(/\.[^.]+$/, '') || 'document'}.docx`;
      saveAs(blob, outName);
      addToast('success', `Đã tải xuống: ${outName}`);
      autoSave();
    } catch (error) {
      console.error('Export error:', error);
      // Fallback to txt
      const fullContent = data.sections.map(s =>
        `${s.title.toUpperCase()}\n\n${s.refinedContent || s.originalContent}\n`
      ).join('\n-----------------------------------\n\n');

      const blob = new Blob([
        `TÊN ĐỀ TÀI MỚI: ${data.selectedNewTitle?.title}\n\n` + fullContent
      ], { type: 'text/plain;charset=utf-8' });

      const outName = `SKKN_Upgrade_${data.fileName?.replace(/\.[^.]+$/, '') || 'document'}.txt`;
      saveAs(blob, outName);
      addToast('info', `Đã tải dạng text: ${outName}`);
    }
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(20, 184, 166, 0.1)',
        padding: '0 20px', height: 64,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #14b8a6, #0d9488)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: 800, fontSize: 16,
              boxShadow: '0 4px 0 #0f766e, 0 6px 12px rgba(13, 148, 136, 0.3)'
            }}>
              S
            </div>
            <span style={{
              fontSize: 18, fontWeight: 800,
              background: 'linear-gradient(135deg, #0d9488, #115e59)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
            }}>
              SKKN Editor Pro
            </span>
          </div>

          {/* Progress Steps (Clickable) */}
          <div className="step-indicator" style={{ display: 'flex', alignItems: 'center' }}>
            {STEP_LABELS.map((item, i) => (
              <React.Fragment key={item.step}>
                <div
                  className="step-item"
                  onClick={() => handleStepClick(item.step)}
                  style={{ cursor: (data.originalText || item.step <= maxReachedStep) ? 'pointer' : 'default' }}
                  title={(data.originalText || item.step <= maxReachedStep) ? `Nhấn để chuyển tới: ${item.label}` : 'Cần tải lên SKKN trước'}
                >
                  <div className={`step-circle ${currentStep > item.step ? 'completed' : currentStep === item.step ? 'active' : 'upcoming'
                    }`}>
                    {currentStep > item.step ? <Check size={14} /> : item.icon}
                  </div>
                  <span className="step-label" style={{
                    color: currentStep >= item.step ? '#0d9488' : '#94a3b8',
                    fontWeight: currentStep === item.step ? 700 : 400
                  }}>
                    {item.label}
                  </span>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div className={`step-line ${currentStep > item.step ? 'completed' : ''}`}></div>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Settings + History */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!hasApiKey && (
              <span style={{ fontSize: 12, color: '#e11d48', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertCircle size={14} /> Chưa có API key
              </span>
            )}
            {displayName && (
              <span style={{
                fontSize: 12, fontWeight: 600, color: '#0f766e',
                padding: '4px 10px', background: '#f0fdfa',
                borderRadius: 8, border: '1px solid #ccfbf1'
              }}>
                👤 {displayName}
              </span>
            )}
            <button
              onClick={handleExportSession}
              className="btn-secondary btn-sm"
              title="Lưu phiên làm việc ra file"
              style={{ color: '#0d9488' }}
            >
              <Save size={14} />
            </button>
            {sessionSavedAt && (
              <span style={{
                fontSize: 10, color: '#94a3b8', fontWeight: 500,
                whiteSpace: 'nowrap'
              }}>
                🟢 {sessionSavedAt}
              </span>
            )}
            <button
              onClick={handleImportSession}
              className="btn-secondary btn-sm"
              title="Tải phiên làm việc từ file"
              style={{ color: '#7c3aed' }}
            >
              <FolderOpen size={14} />
            </button>
            <button
              onClick={() => setShowHistory(true)}
              className="btn-secondary btn-sm"
              title="Lịch sử SKKN đã phân tích"
            >
              <Clock size={14} />
            </button>
            <button
              onClick={() => setShowApiModal(true)}
              className="btn-secondary btn-sm"
              title="Cài đặt API Key & Model"
            >
              <Settings size={14} />
              <Key size={12} />
            </button>
            <button
              onClick={onLogout}
              className="btn-secondary btn-sm"
              title="Đăng xuất"
              style={{ color: '#e11d48' }}
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px' }}>

        {/* Shorten SKKN Mode */}
        {showShortenMode && (
          <ShortenSKKN onClose={() => setShowShortenMode(false)} />
        )}

        {!showShortenMode && currentStep === AppStep.UPLOAD && (
          <>
            <StepUpload onUpload={handleUpload} isProcessing={isProcessing} progress={analysisProgress} stage={analysisStage} />
            {!isProcessing && (
              <div style={{
                display: 'flex', justifyContent: 'center', marginTop: 12
              }}>
                <button
                  onClick={() => setShowShortenMode(true)}
                  className="btn-secondary"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 24px', fontSize: 14, fontWeight: 600,
                    background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
                    border: '1.5px solid #fde68a',
                    color: '#92400e', borderRadius: 12,
                    boxShadow: '0 2px 8px rgba(245, 158, 11, 0.1)',
                    transition: 'all 0.2s'
                  }}
                >
                  <Scissors size={16} color="#d97706" />
                  Rút ngắn SKKN theo số trang
                </button>
              </div>
            )}
          </>
        )}

        {!showShortenMode && currentStep === AppStep.ANALYZING && data.analysis && (
          <StepAnalysis
            metrics={data.analysis}
            onContinue={handleAnalysisContinue}
          />
        )}

        {!showShortenMode && currentStep === AppStep.DASHBOARD && data.analysis && (
          <StepDashboard
            sections={data.sections}
            analysis={data.analysis}
            currentTitle={data.currentTitle}
            onContinue={handleDashboardContinue}
          />
        )}

        {!showShortenMode && currentStep === AppStep.TITLE_SELECTION && (
          <StepTitle
            currentTitle={data.currentTitle}
            suggestions={data.titleSuggestions}
            onSelectTitle={handleTitleSelect}
            isGenerating={isProcessing}
          />
        )}

        {!showShortenMode && currentStep === AppStep.CONTENT_REFINEMENT && (
          <StepEditor
            sections={data.sections}
            onRefineSection={handleRefineSection}
            onRefineSectionWithRefs={handleRefineSectionWithRefs}
            isProcessing={processingSectionId}
            onFinish={handleFinish}
            selectedTitle={data.selectedNewTitle?.title || data.currentTitle}
            currentTitle={data.currentTitle}
            overallAnalysisSummary={
              data.analysis
                ? `Chất lượng: ${data.analysis.qualityScore}/100, Đạo văn: ${data.analysis.plagiarismScore}%, ` +
                `Cấu trúc: ${data.analysis.structure.missing.length === 0 ? 'Đầy đủ' : 'Thiếu ' + data.analysis.structure.missing.join(', ')}`
                : 'Chưa phân tích'
            }
            onUpdateSections={handleUpdateSections}
            userRequirements={userRequirements}
            onUpdateRequirements={setUserRequirements}
            addToast={addToast}
          />
        )}

        {!showShortenMode && currentStep === AppStep.QUICK_EDIT && (
          <StepQuickEdit addToast={addToast} />
        )}
      </main>

      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={showApiModal}
        onClose={() => { setShowApiModal(false); setQuotaExhausted(false); }}
        onSave={() => {
          setShowApiModal(false);
          setQuotaExhausted(false);
          addToast('success', 'API Key đã được lưu!');
        }}
        canClose={hasApiKey}
        quotaExhausted={quotaExhausted}
        onExportSession={handleExportSession}
      />

      {/* History Panel */}
      <HistoryPanel
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        onLoad={handleLoadSession}
      />

      {/* Toast Notifications */}

      {/* Modal khôi phục phiên làm việc */}
      {showRestoreModal && (
        <div className="modal-overlay" style={{ zIndex: 100 }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
              background: 'linear-gradient(135deg, #14b8a6, #0d9488)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 0 #0f766e, 0 6px 16px rgba(13, 148, 136, 0.25)'
            }}>
              <Save size={28} color="white" />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#134e4a', marginBottom: 8 }}>
              Phiên làm việc trước chưa xong
            </h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.5 }}>
              Bạn có một phiên làm việc chưa hoàn thành từ lần trước.
              Bạn muốn tiếp tục hay bắt đầu lại?
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleDismissRestore}
                className="btn-secondary"
                style={{ flex: 1, justifyContent: 'center', padding: '10px 16px' }}
              >
                Bắt đầu mới
              </button>
              <button
                onClick={handleRestoreSession}
                className="btn-primary"
                style={{ flex: 1, justifyContent: 'center', padding: '10px 16px' }}
              >
                ✅ Tiếp tục phiên cũ
              </button>
            </div>
          </div>
        </div>
      )}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map(toast => (
            <div key={toast.id} className={`toast toast-${toast.type}`}>
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default App;