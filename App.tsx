import React, { useState, useEffect, useCallback } from 'react';
import { AppStep, SKKNData, SectionContent, TitleSuggestion, ToastMessage, HistoryEntry, UserRequirements } from './types';
import { STEP_LABELS } from './constants';
import * as geminiService from './services/geminiService';
import * as historyService from './services/historyService';
import StepUpload from './components/StepUpload';
import StepAnalysis from './components/StepAnalysis';
import StepDashboard from './components/StepDashboard';
import StepTitle from './components/StepTitle';
import StepEditor from './components/StepEditor';
import ApiKeyModal from './components/ApiKeyModal';
import HistoryPanel from './components/HistoryPanel';
import ShortenSKKN from './components/ShortenSKKN';
import LoginScreen from './components/LoginScreen';
import { Settings, Check, Key, AlertCircle, Clock, Scissors, LogOut } from 'lucide-react';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';

// --- Local fallback parser (used if AI parse fails) ---
const parseSectionsLocal = (text: string): SectionContent[] => {
  const sections: SectionContent[] = [];

  // Multi-pattern section detection - covers most SKKN formats
  const sectionPatterns: { regex: RegExp; idPrefix: string }[] = [
    // "PHẦN I", "PHẦN II", ... "PHẦN VII" (Roman numerals)
    { regex: /^(?:PHẦN|Phần)\s+([IVXLC]+)\b[.:)]*\s*(.*)/gim, idPrefix: 'phan' },
    // "I.", "II.", "III." standalone section numbering
    { regex: /^([IVXLC]+)\.\s+([\wÀ-ỹ].*)/gim, idPrefix: 'roman' },
    // "CHƯƠNG 1", "Chương 2"
    { regex: /^(?:CHƯƠNG|Chương)\s+(\d+)\b[.:)]*\s*(.*)/gim, idPrefix: 'chuong' },
    // Known standalone section titles (often without numbering)
    { regex: /^(MỤC LỤC|TÀI LIỆU THAM KHẢO|PHỤ LỤC|DANH MỤC|LỜI CAM ĐOAN|LỜI CẢM ƠN|KẾT LUẬN VÀ KIẾN NGHỊ)\b(.*)/gim, idPrefix: 'named' },
  ];

  interface SectionMatch { index: number; title: string; id: string }
  let allMatches: SectionMatch[] = [];

  // Collect all matches across all patterns
  for (const { regex, idPrefix } of sectionPatterns) {
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
      const fullTitle = match[0].trim();
      const id = `${idPrefix}-${allMatches.length + 1}`;
      allMatches.push({ index: match.index, title: fullTitle, id });
    }
  }

  // Deduplicate overlapping matches (same position within 5 chars → keep first)
  allMatches.sort((a, b) => a.index - b.index);
  const deduped: SectionMatch[] = [];
  for (const m of allMatches) {
    if (deduped.length === 0 || Math.abs(m.index - deduped[deduped.length - 1].index) > 5) {
      deduped.push(m);
    }
  }

  // If standard patterns found nothing, try "PHẦN I" keyword approach as last resort
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
        deduped.push({ index: idx, title, id: kw.id });
      }
    }
    deduped.sort((a, b) => a.index - b.index);
  }

  // Extract content between sections
  for (let i = 0; i < deduped.length; i++) {
    const current = deduped[i];
    const next = deduped[i + 1];
    const startPos = current.index;
    const endPos = next ? next.index : text.length;

    const rawContent = text.substring(startPos, endPos).trim();
    const titleLine = rawContent.split('\n')[0];
    const body = rawContent.substring(titleLine.length).trim();

    sections.push({
      id: current.id,
      title: titleLine.trim(),
      level: 1,
      parentId: undefined,
      originalContent: body,
      refinedContent: '',
      isProcessing: false,
      suggestions: [],
      editSuggestions: []
    });
  }

  return sections;
};


const App: React.FC = () => {
  // --- Authentication State ---
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return sessionStorage.getItem('skkn_logged_in') === 'true';
  });
  const [displayName, setDisplayName] = useState(() => {
    return sessionStorage.getItem('skkn_display_name') || '';
  });

  const handleLoginSuccess = (name: string) => {
    setIsLoggedIn(true);
    setDisplayName(name);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('skkn_logged_in');
    sessionStorage.removeItem('skkn_display_name');
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
  const [processingSectionId, setProcessingSectionId] = useState<string | null>(null);
  const [showApiModal, setShowApiModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showShortenMode, setShowShortenMode] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [userRequirements, setUserRequirements] = useState<UserRequirements>({
    pageLimit: null,
    referenceDocuments: [],
    customInstructions: ''
  });

  // Check API key on mount
  useEffect(() => {
    if (!geminiService.getApiKey()) {
      setShowApiModal(true);
    }
  }, []);

  const hasApiKey = !!geminiService.getApiKey();

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

  // --- Step click handler (navigate back) ---
  const handleStepClick = (step: number) => {
    if (step <= maxReachedStep && step !== currentStep) {
      setCurrentStep(step as AppStep);
    }
  };

  // --- Auto-save to history ---
  const autoSave = useCallback(() => {
    if (data.originalText && data.fileName) {
      historyService.saveSession(data, maxReachedStep);
    }
  }, [data, maxReachedStep]);

  // --- Load from history ---
  const handleLoadSession = (entry: HistoryEntry) => {
    setData(entry.data);
    setMaxReachedStep(entry.maxReachedStep);
    setCurrentStep(entry.maxReachedStep as AppStep);
    addToast('info', `Đã tải lại: "${entry.fileName}"`);
  };

  // --- Handlers ---
  const handleUpload = async (text: string, fileName: string) => {
    if (!geminiService.getApiKey()) {
      setShowApiModal(true);
      return;
    }
    setIsProcessing(true);
    try {
      // Step 1: AI analysis
      const result = await geminiService.analyzeSKKN(text);

      // Step 2: AI structure parsing (flexible)
      let sections: SectionContent[] = [];
      try {
        const parsed = await geminiService.parseStructure(text);
        sections = parsed.map(s => ({
          id: s.id,
          title: s.title,
          level: s.level || 1,
          parentId: s.parentId || undefined,
          originalContent: s.content || '',
          refinedContent: '',
          isProcessing: false,
          suggestions: [],
          editSuggestions: []
        }));

        // VALIDATION: Cross-check with local parser to catch missing sections
        const localSections = parseSectionsLocal(text);
        const aiLevel1Count = sections.filter(s => s.level === 1).length;
        const localLevel1Count = localSections.length;

        if (aiLevel1Count < localLevel1Count && localLevel1Count > aiLevel1Count + 1) {
          // AI missed sections — merge local sections that AI didn't find
          console.warn(`AI found ${aiLevel1Count} level-1 sections but local parser found ${localLevel1Count}. Merging...`);
          const existingTitles = sections.map(s => s.title.toLowerCase().substring(0, 20));
          for (const localSec of localSections) {
            const titlePrefix = localSec.title.toLowerCase().substring(0, 20);
            const alreadyExists = existingTitles.some(t => t.includes(titlePrefix) || titlePrefix.includes(t));
            if (!alreadyExists) {
              sections.push({ ...localSec, id: `merged-${localSec.id}` });
            }
          }
        }
      } catch (parseError) {
        console.warn('AI parse failed, using local fallback', parseError);
        sections = parseSectionsLocal(text);
      }

      // Ensure at least some sections
      if (sections.length === 0) {
        sections = parseSectionsLocal(text);
      }

      setData(prev => ({
        ...prev,
        fileName,
        originalText: text,
        currentTitle: result.currentTitle,
        analysis: result.analysis,
        sections
      }));
      goToStep(AppStep.ANALYZING);
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
      } else {
        addToast('error', 'Lỗi phân tích. Vui lòng kiểm tra API Key.');
      }
    } finally {
      setIsProcessing(false);
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
    if (!data.selectedNewTitle) return;
    setProcessingSectionId(sectionId);

    const section = data.sections.find(s => s.id === sectionId);
    if (section && section.originalContent) {
      try {
        const refined = await geminiService.refineSectionContent(
          section.title, section.originalContent, data.selectedNewTitle.title
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
        addToast('error', `Lỗi viết lại phần "${section.title}".`);
      }
    }
    setProcessingSectionId(null);
  };

  const handleUpdateSections = (newSections: SectionContent[]) => {
    setData(prev => ({ ...prev, sections: newSections }));
  };

  // --- Refine with reference documents ---
  const handleRefineSectionWithRefs = async (sectionId: string) => {
    if (!data.selectedNewTitle) return;
    setProcessingSectionId(sectionId);

    const section = data.sections.find(s => s.id === sectionId);
    if (section && section.originalContent) {
      try {
        const refined = await geminiService.refineSectionWithReferences(
          section.title, section.originalContent, data.selectedNewTitle.title, userRequirements
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
        addToast('error', `Lỗi viết lại phần "${section.title}".`);
      }
    }
    setProcessingSectionId(null);
  };

  const handleFinish = async () => {
    try {
      // Create DOCX document
      const docChildren: Paragraph[] = [];

      // Title
      docChildren.push(new Paragraph({
        children: [new TextRun({
          text: `TÊN ĐỀ TÀI: ${data.selectedNewTitle?.title || data.currentTitle}`,
          bold: true, size: 28, font: 'Times New Roman'
        })],
        heading: HeadingLevel.TITLE,
        spacing: { after: 400 }
      }));

      // Sections (respecting hierarchy)
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
        const paragraphs = content.split('\n').filter(p => p.trim());
        paragraphs.forEach(para => {
          docChildren.push(new Paragraph({
            children: [new TextRun({
              text: para.trim(),
              size: 26, font: 'Times New Roman'
            })],
            spacing: { after: 100 },
            indent: { firstLine: 720, left: indent }
          }));
        });
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
                  style={{ cursor: item.step <= maxReachedStep ? 'pointer' : 'default' }}
                  title={item.step <= maxReachedStep ? `Nhấn để quay lại: ${item.label}` : ''}
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
            <StepUpload onUpload={handleUpload} isProcessing={isProcessing} />
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
          />
        )}
      </main>

      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={showApiModal}
        onClose={() => setShowApiModal(false)}
        onSave={() => {
          setShowApiModal(false);
          addToast('success', 'API Key đã được lưu!');
        }}
        canClose={hasApiKey}
      />

      {/* History Panel */}
      <HistoryPanel
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        onLoad={handleLoadSession}
      />

      {/* Toast Notifications */}
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