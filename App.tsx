import React, { useState, useEffect, useCallback } from 'react';
import { AppStep, SKKNData, SectionContent, TitleSuggestion, ToastMessage } from './types';
import { SKKN_SECTIONS, STEP_LABELS } from './constants';
import * as geminiService from './services/geminiService';
import StepUpload from './components/StepUpload';
import StepAnalysis from './components/StepAnalysis';
import StepDashboard from './components/StepDashboard';
import StepTitle from './components/StepTitle';
import StepEditor from './components/StepEditor';
import ApiKeyModal from './components/ApiKeyModal';
import { Settings, Check, Key, AlertCircle } from 'lucide-react';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';

// --- Utility to parse text into sections ---
const parseSectionsFromText = (text: string): SectionContent[] => {
  const sections: SectionContent[] = [];

  const keywords = [
    { key: 'PHẦN I', id: 'intro' },
    { key: 'PHẦN II', id: 'theory' },
    { key: 'PHẦN III', id: 'reality' },
    { key: 'PHẦN IV', id: 'solution' },
    { key: 'PHẦN V', id: 'result' },
    { key: 'PHẦN VI', id: 'conclusion' }
  ];

  const upperText = text.toUpperCase();

  keywords.forEach((kw, index) => {
    const nextKw = keywords[index + 1];
    const startIndex = upperText.indexOf(kw.key);

    if (startIndex !== -1) {
      let endIndex = nextKw ? upperText.indexOf(nextKw.key) : text.length;
      if (endIndex === -1) endIndex = text.length;

      const content = text.substring(startIndex, endIndex).trim();
      const titleLine = content.split('\n')[0];
      const body = content.substring(titleLine.length).trim();

      sections.push({
        id: kw.id,
        title: SKKN_SECTIONS.find(s => s.id === kw.id)?.name || titleLine,
        originalContent: body,
        refinedContent: '',
        isProcessing: false,
        suggestions: []
      });
    } else {
      sections.push({
        id: kw.id,
        title: SKKN_SECTIONS.find(s => s.id === kw.id)?.name || kw.key,
        originalContent: '',
        refinedContent: '',
        isProcessing: false,
        suggestions: []
      });
    }
  });

  return sections;
};


const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<AppStep>(AppStep.UPLOAD);
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
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Check API key on mount
  useEffect(() => {
    if (!geminiService.getApiKey()) {
      setShowApiModal(true);
    }
  }, []);

  // Toast helper
  const addToast = useCallback((type: ToastMessage['type'], message: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  // --- Handlers ---
  const handleUpload = async (text: string, fileName: string) => {
    if (!geminiService.getApiKey()) {
      setShowApiModal(true);
      return;
    }
    setIsProcessing(true);
    try {
      const sections = parseSectionsFromText(text);
      const result = await geminiService.analyzeSKKN(text);

      setData(prev => ({
        ...prev,
        fileName,
        originalText: text,
        currentTitle: result.currentTitle,
        analysis: result.analysis,
        sections
      }));
      setCurrentStep(AppStep.ANALYZING);
      addToast('success', 'Phân tích hoàn tất!');
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
    setCurrentStep(AppStep.DASHBOARD);
  };

  const handleDashboardContinue = async () => {
    setCurrentStep(AppStep.TITLE_SELECTION);
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
    setCurrentStep(AppStep.CONTENT_REFINEMENT);
    addToast('info', `Đã chọn: "${title.title.substring(0, 50)}..."`);
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
      } catch (e) {
        console.error("Refine failed", e);
        addToast('error', `Lỗi viết lại phần "${section.title}".`);
      }
    }
    setProcessingSectionId(null);
  };

  const handleUpdateSections = (newSections: SectionContent[]) => {
    setData(prev => ({ ...prev, sections: newSections }));
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

      // Sections
      data.sections.forEach(s => {
        docChildren.push(new Paragraph({
          children: [new TextRun({
            text: s.title.toUpperCase(),
            bold: true, size: 26, font: 'Times New Roman'
          })],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 }
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
            indent: { firstLine: 720 }
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
    } catch (error) {
      console.error('Export error:', error);
      // Fallback to txt
      const fullContent = data.sections.map(s =>
        `${s.title.toUpperCase()}\n\n${s.refinedContent || s.originalContent}\n`
      ).join('\n-----------------------------------\n\n');

      const blob = new Blob([
        `TÊN ĐỀ TÀI MỚI: ${data.selectedNewTitle?.title}\n\n` + fullContent
      ], { type: 'text/plain;charset=utf-8' });

      saveAs(blob, `SKKN_Upgrade_${data.fileName || 'document'}.txt`);
      addToast('info', 'Đã xuất file .txt (không thể tạo .docx)');
    }
  };

  const hasApiKey = !!geminiService.getApiKey();

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(15, 14, 23, 0.85)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '0 20px', height: 64
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: 800, fontSize: 16,
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.4)'
            }}>
              S
            </div>
            <span style={{
              fontSize: 18, fontWeight: 800,
              background: 'linear-gradient(135deg, #a5b4fc, #818cf8)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
            }}>
              SKKN Editor Pro
            </span>
          </div>

          {/* Progress Steps */}
          <div className="step-indicator" style={{ display: 'flex', alignItems: 'center' }}>
            {STEP_LABELS.map((item, i) => (
              <React.Fragment key={item.step}>
                <div className="step-item">
                  <div className={`step-circle ${currentStep > item.step ? 'completed' : currentStep === item.step ? 'active' : 'upcoming'
                    }`}>
                    {currentStep > item.step ? <Check size={14} /> : item.icon}
                  </div>
                  <span className="step-label" style={{
                    color: currentStep >= item.step ? '#a5b4fc' : '#475569'
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

          {/* Settings */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {!hasApiKey && (
              <span style={{ fontSize: 12, color: '#fb7185', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertCircle size={14} /> Chưa có API key
              </span>
            )}
            <button
              onClick={() => setShowApiModal(true)}
              className="btn-secondary btn-sm"
              title="Cài đặt API Key & Model"
            >
              <Settings size={14} />
              <Key size={12} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px' }}>

        {currentStep === AppStep.UPLOAD && (
          <StepUpload onUpload={handleUpload} isProcessing={isProcessing} />
        )}

        {currentStep === AppStep.ANALYZING && data.analysis && (
          <StepAnalysis
            metrics={data.analysis}
            onContinue={handleAnalysisContinue}
          />
        )}

        {currentStep === AppStep.DASHBOARD && data.analysis && (
          <StepDashboard
            sections={data.sections}
            analysis={data.analysis}
            currentTitle={data.currentTitle}
            onContinue={handleDashboardContinue}
          />
        )}

        {currentStep === AppStep.TITLE_SELECTION && (
          <StepTitle
            currentTitle={data.currentTitle}
            suggestions={data.titleSuggestions}
            onSelectTitle={handleTitleSelect}
            isGenerating={isProcessing}
          />
        )}

        {currentStep === AppStep.CONTENT_REFINEMENT && (
          <StepEditor
            sections={data.sections}
            onRefineSection={handleRefineSection}
            isProcessing={processingSectionId}
            onFinish={handleFinish}
            selectedTitle={data.selectedNewTitle?.title || data.currentTitle}
            onUpdateSections={handleUpdateSections}
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