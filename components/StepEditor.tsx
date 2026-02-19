import React, { useState, useRef, useCallback } from 'react';
import { SectionContent, SectionSuggestion, SectionEditSuggestion, UserRequirements } from '../types';
import { SUGGESTION_TYPES } from '../constants';
import { Check, Loader2, RefreshCw, FileDown, Lightbulb, Sparkles, Eye, EyeOff, ChevronDown, ChevronUp, Download, Search, Plus, Minus, Pencil, Replace, CheckCircle2, Upload, ClipboardPaste, BookOpen, ArrowRight, FileText, Trash2, Settings2, Zap, GitCompareArrows, Square } from 'lucide-react';
import * as geminiService from '../services/geminiService';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';
import { ReferenceDocument } from '../types';
import mammoth from 'mammoth';

interface StepEditorProps {
  sections: SectionContent[];
  onRefineSection: (id: string) => void;
  onRefineSectionWithRefs: (id: string) => void;
  onFinish: () => void;
  isProcessing: string | null;
  selectedTitle: string;
  currentTitle: string;
  overallAnalysisSummary: string;
  onUpdateSections: (sections: SectionContent[]) => void;
  userRequirements: UserRequirements;
  onUpdateRequirements: (req: UserRequirements) => void;
  addToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

const ACTION_STYLES: Record<string, { label: string; icon: React.ReactNode; bg: string; color: string; border: string }> = {
  replace: { label: 'Thay thế', icon: <Replace size={10} />, bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  add: { label: 'Thêm', icon: <Plus size={10} />, bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' },
  remove: { label: 'Xóa', icon: <Minus size={10} />, bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  modify: { label: 'Chỉnh sửa', icon: <Pencil size={10} />, bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
};

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  content: { label: 'Nội dung', icon: '📝' },
  example: { label: 'Ví dụ', icon: '💡' },
  structure: { label: 'Cấu trúc', icon: '🏗️' },
  language: { label: 'Giọng văn', icon: '✍️' },
  reference: { label: 'Tài liệu TK', icon: '📚' },
};

const StepEditor: React.FC<StepEditorProps> = ({
  sections, onRefineSection, onRefineSectionWithRefs, onFinish, isProcessing,
  selectedTitle, currentTitle, overallAnalysisSummary,
  onUpdateSections, userRequirements, onUpdateRequirements, addToast
}) => {
  const [activeTab, setActiveTab] = useState<string>(sections[0]?.id || '');
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);
  const [loadingDeepAnalysis, setLoadingDeepAnalysis] = useState<string | null>(null);
  const [loadingRefineWithAnalysis, setLoadingRefineWithAnalysis] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<'paste' | null>(null);
  const [pasteContent, setPasteContent] = useState('');
  const [showDiff, setShowDiff] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, label: '' });
  const batchAbortRef = useRef(false);
  const sectionFileInputRef = useRef<HTMLInputElement>(null);
  const refDocFileInputRef = useRef<HTMLInputElement>(null);

  const activeSection = sections.find(s => s.id === activeTab);

  const getLevel = (s: SectionContent) => s.level || 1;
  const getParentId = (s: SectionContent) => s.parentId || '';

  // --- Deep analysis (Bước 2) ---
  const handleDeepAnalysis = async (sectionId: string) => {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;
    const content = section.refinedContent || section.originalContent;
    if (!content) return;

    setLoadingDeepAnalysis(sectionId);
    try {
      const skknContext = {
        currentTitle,
        selectedTitle,
        allSectionTitles: sections.map(s => s.title),
        overallAnalysisSummary
      };

      const editSuggestions = await geminiService.deepAnalyzeSection(
        section.title, content, skknContext, userRequirements
      );
      onUpdateSections(sections.map(s =>
        s.id === sectionId ? { ...s, editSuggestions } : s
      ));
    } catch (err: any) {
      console.error('Deep analysis failed:', err);
      addToast('error', `Lỗi phân tích "${section.title}": ${err?.message || 'Không xác định'}`);
    }
    setLoadingDeepAnalysis(null);
  };

  // --- Đồng ý sửa dựa trên phân tích (Bước 3) ---
  const handleRefineWithAnalysis = async (sectionId: string) => {
    const section = sections.find(s => s.id === sectionId);
    if (!section || !section.editSuggestions || section.editSuggestions.length === 0) return;

    const content = section.refinedContent || section.originalContent;
    if (!content) return;

    setLoadingRefineWithAnalysis(sectionId);
    try {
      const skknContext = {
        currentTitle,
        selectedTitle,
        allSectionTitles: sections.map(s => s.title),
        overallAnalysisSummary
      };

      const refined = await geminiService.refineSectionWithAnalysis(
        section.title, content, selectedTitle || currentTitle,
        section.editSuggestions, userRequirements, skknContext
      );

      onUpdateSections(sections.map(s =>
        s.id === sectionId ? {
          ...s,
          refinedContent: refined,
          editSuggestions: s.editSuggestions.map(es => ({ ...es, applied: true }))
        } : s
      ));
    } catch (err: any) {
      console.error('Refine with analysis failed:', err);
      addToast('error', `Lỗi sửa "${section?.title}": ${err?.message || 'Không xác định'}`);
    }
    setLoadingRefineWithAnalysis(null);
  };

  // --- Upload file nội dung cho section ---
  const handleUploadSectionFile = async (e: React.ChangeEvent<HTMLInputElement>, sectionId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      let content = '';
      const ext = file.name.split('.').pop()?.toLowerCase();

      if (ext === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        content = result.value;
      } else if (ext === 'pdf') {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n\n';
        }
        content = fullText;
      } else {
        content = await file.text();
        if (content.includes('<?xml') || content.includes('<w:')) {
          content = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
      }

      if (content.trim()) {
        onUpdateSections(sections.map(s =>
          s.id === sectionId ? { ...s, originalContent: content.trim(), editSuggestions: [] } : s
        ));
      }
    } catch (err) {
      console.error('Error reading section file:', err);
    }
    if (sectionFileInputRef.current) sectionFileInputRef.current.value = '';
  };

  const handlePasteContent = (sectionId: string) => {
    if (!pasteContent.trim()) return;
    onUpdateSections(sections.map(s =>
      s.id === sectionId ? { ...s, originalContent: pasteContent.trim(), editSuggestions: [] } : s
    ));
    setPasteContent('');
    setEditMode(null);
  };

  const handleContentEdit = (sectionId: string, newContent: string) => {
    onUpdateSections(sections.map(s =>
      s.id === sectionId ? { ...s, refinedContent: newContent } : s
    ));
  };

  // --- Upload tài liệu tham khảo ---
  const handleRefDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files) as File[]) {
      try {
        let content = '';
        const ext = file.name.split('.').pop()?.toLowerCase();

        if (ext === 'txt' || ext === 'md') {
          content = await file.text();
        } else if (ext === 'pdf') {
          content = await file.text();
          if (content.includes('%PDF')) {
            content = `[File PDF: ${file.name} - Vui lòng dán nội dung text từ file PDF vào ô bên dưới]`;
          }
        } else {
          content = await file.text();
          if (content.includes('<?xml') || content.includes('<w:')) {
            content = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          }
        }

        const isExercise = /bài tập|đề thi|đề kiểm tra|exercise|test|exam/i.test(file.name);

        const newDoc: ReferenceDocument = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
          name: file.name,
          content: content.substring(0, 15000),
          type: isExercise ? 'exercise' : 'document'
        };

        onUpdateRequirements({
          ...userRequirements,
          referenceDocuments: [...userRequirements.referenceDocuments, newDoc]
        });
      } catch (err) {
        console.error('Error reading ref doc:', err);
      }
    }
    if (refDocFileInputRef.current) refDocFileInputRef.current.value = '';
  };

  const handleRemoveRefDoc = (docId: string) => {
    onUpdateRequirements({
      ...userRequirements,
      referenceDocuments: userRequirements.referenceDocuments.filter(d => d.id !== docId)
    });
  };

  // --- Download single section as DOCX (with table support) ---
  const handleDownloadSection = async (section: SectionContent) => {
    try {
      const content = section.refinedContent || section.originalContent;
      const paragraphs: (Paragraph | Table)[] = [];

      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: section.title, bold: true, size: 28, font: 'Times New Roman' })],
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 200 }
      }));

      // Parse content with table support
      const lines = content.split('\n');
      let li = 0;
      while (li < lines.length) {
        const line = lines[li];

        // Detect markdown table
        if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
          const tableLines: string[] = [];
          while (li < lines.length && lines[li].trim().startsWith('|') && lines[li].trim().endsWith('|')) {
            tableLines.push(lines[li].trim());
            li++;
          }
          if (tableLines.length >= 2) {
            const headerCells = tableLines[0].split('|').filter(c => c.trim() !== '');
            const colCount = headerCells.length;
            const dataRows: string[][] = [];
            for (const tl of tableLines) {
              if (/^[\s|:\-]+$/.test(tl.replace(/\|/g, ' '))) continue;
              dataRows.push(tl.split('|').filter(c => c.trim() !== '').map(c => c.trim()));
            }
            if (dataRows.length > 0) {
              const bs = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
              const borders = { top: bs, bottom: bs, left: bs, right: bs, insideHorizontal: bs, insideVertical: bs };
              const tableRows = dataRows.map((cells, ri) => new TableRow({
                children: Array.from({ length: colCount }, (_, ci) => new TableCell({
                  children: [new Paragraph({
                    children: [new TextRun({ text: cells[ci] || '', bold: ri === 0, size: 24, font: 'Times New Roman' })],
                    spacing: { before: 40, after: 40 },
                    alignment: AlignmentType.CENTER
                  })],
                  width: { size: Math.floor(9000 / colCount), type: WidthType.DXA },
                  borders
                }))
              }));
              paragraphs.push(new Table({ rows: tableRows, width: { size: 9000, type: WidthType.DXA } }));
              paragraphs.push(new Paragraph({ spacing: { after: 100 } }));
            }
          }
          continue;
        }

        if (line.trim()) {
          paragraphs.push(new Paragraph({
            children: [new TextRun({ text: line.trim(), size: 26, font: 'Times New Roman' })],
            spacing: { after: 100 },
            indent: { firstLine: 720 }
          }));
        }
        li++;
      }

      const doc = new Document({ sections: [{ children: paragraphs }] });
      const blob = await Packer.toBlob(doc);
      const safeName = section.title.replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF ]/g, '').trim().replace(/ +/g, '_');
      saveAs(blob, `${safeName}.docx`);
    } catch (error: any) {
      console.error('Download section error:', error);
      addToast('error', `Lỗi tải phần: ${error?.message || 'Không xác định'}`);
    }
  };

  const completedCount = sections.filter(s => s.refinedContent).length;
  const getChildren = (parentId: string) => sections.filter(s => getParentId(s) === parentId);
  const hasHierarchy = sections.some(s => getLevel(s) >= 2);

  // --- Batch refine all sections ---
  const handleBatchRefine = useCallback(async () => {
    const leafSections = sections.filter(s => s.originalContent && s.originalContent.trim().length > 0);
    if (leafSections.length === 0) return;

    setBatchRunning(true);
    batchAbortRef.current = false;
    setBatchProgress({ current: 0, total: leafSections.length, label: '' });
    addToast('info', `Bắt đầu sửa ${leafSections.length} phần...`);

    let updatedSections = [...sections];
    let successCount = 0;

    for (let i = 0; i < leafSections.length; i++) {
      if (batchAbortRef.current) {
        addToast('info', `Đã dừng sau ${successCount}/${leafSections.length} phần.`);
        break;
      }
      const sec = leafSections[i];
      setBatchProgress({ current: i + 1, total: leafSections.length, label: sec.title.substring(0, 40) });

      // Skip already refined
      if (sec.refinedContent) {
        successCount++;
        continue;
      }

      try {
        // Step 1: Deep analyze
        const skknContext = { currentTitle, selectedTitle, allSectionTitles: sections.map(s => s.title), overallAnalysisSummary };
        const content = sec.originalContent;
        const editSuggestions = await geminiService.deepAnalyzeSection(sec.title, content, skknContext, userRequirements);

        // Step 2: Refine with analysis
        const refined = await geminiService.refineSectionWithAnalysis(
          sec.title, content, selectedTitle || currentTitle,
          editSuggestions, userRequirements, skknContext
        );

        updatedSections = updatedSections.map(s =>
          s.id === sec.id ? { ...s, refinedContent: refined, editSuggestions: editSuggestions.map(es => ({ ...es, applied: true })) } : s
        );
        onUpdateSections(updatedSections);
        successCount++;
      } catch (err: any) {
        console.error(`Batch refine error for "${sec.title}":`, err);
        addToast('error', `Lỗi sửa "${sec.title}": ${err?.message?.substring(0, 80) || 'Không xác định'}`);
      }
    }

    setBatchRunning(false);
    if (!batchAbortRef.current) {
      addToast('success', `Hoàn thành! Đã sửa ${successCount}/${leafSections.length} phần.`);
    }
  }, [sections, currentTitle, selectedTitle, overallAnalysisSummary, userRequirements, onUpdateSections, addToast]);

  const handleStopBatch = useCallback(() => {
    batchAbortRef.current = true;
  }, []);

  // Recursive tab renderer
  const renderSectionTab = (section: SectionContent, depth: number = 0) => {
    const children = getChildren(section.id);
    const isActive = activeTab === section.id;
    const hasActiveChild = children.some(c => c.id === activeTab || getChildren(c.id).some(gc => gc.id === activeTab));
    const indent = depth * 18;
    const fontSize = Math.max(11, 14 - depth);

    return (
      <div key={section.id}>
        <button
          onClick={() => setActiveTab(section.id)}
          style={{
            width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: `${Math.max(4, 8 - depth)}px 12px`, paddingLeft: 12 + indent,
            borderRadius: depth === 0 ? 6 : 0, border: 'none', cursor: 'pointer',
            fontWeight: isActive ? 700 : hasActiveChild ? 600 : depth === 0 ? 500 : 400,
            fontSize,
            background: isActive ? (depth === 0 ? '#f0fdfa' : '#ecfdf5') : hasActiveChild ? '#fafffe' : 'transparent',
            borderLeft: isActive
              ? `${Math.max(2, 3 - depth)}px solid #14b8a6`
              : hasActiveChild
                ? `${Math.max(2, 3 - depth)}px solid #99f6e4`
                : `${Math.max(2, 3 - depth)}px solid transparent`,
            color: isActive ? '#0d9488' : '#334155',
            transition: 'all 0.2s'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {depth > 0 && <span style={{ color: '#cbd5e1', fontSize: 10 }}>{'↳'.repeat(Math.min(depth, 3))}</span>}
            <span>{section.title}</span>
            {section.refinedContent && <Check size={depth === 0 ? 12 : 10} style={{ color: '#10b981', flexShrink: 0 }} />}
          </span>
          {children.length > 0 && (
            <span style={{
              fontSize: 9, padding: '1px 6px', borderRadius: 999, flexShrink: 0, marginLeft: 4,
              background: '#f0fdfa', color: '#0d9488', border: '1px solid #ccfbf1'
            }}>
              {children.length}
            </span>
          )}
        </button>
        {children.map(child => renderSectionTab(child, depth + 1))}
      </div>
    );
  };

  if (!sections || sections.length === 0) {
    return (
      <div className="animate-fade-in" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Sparkles size={48} color="#94a3b8" style={{ marginBottom: 16, opacity: 0.4 }} />
        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#334155' }}>Chưa có nội dung phần nào</h3>
        <p style={{ color: '#94a3b8', fontSize: 14 }}>Vui lòng quay lại bước Tải lên để phân tích SKKN.</p>
      </div>
    );
  }

  const hasAnalysis = activeSection?.editSuggestions && activeSection.editSuggestions.length > 0;
  const isAnalyzing = loadingDeepAnalysis === activeSection?.id;
  const isRefining = loadingRefineWithAnalysis === activeSection?.id || isProcessing === activeSection?.id;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#134e4a', margin: 0 }}>Sửa nội dung từng phần</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0, marginTop: 4 }}>
            Đã sửa <span style={{ color: '#10b981', fontWeight: 700 }}>{completedCount}/{sections.length}</span> phần
            {selectedTitle && <span style={{ color: '#94a3b8' }}> · Đề tài: "{selectedTitle.substring(0, 50)}..."</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!batchRunning ? (
            <button
              onClick={handleBatchRefine}
              className="btn-primary btn-sm"
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                border: 'none', fontSize: 12, fontWeight: 700, gap: 4,
                padding: '6px 14px', borderRadius: 8
              }}
              title="AI tự động phân tích + sửa tất cả các phần chưa sửa"
            >
              <Zap size={13} /> AI Sửa Toàn Bộ
            </button>
          ) : (
            <button
              onClick={handleStopBatch}
              className="btn-secondary btn-sm"
              style={{ fontSize: 12, fontWeight: 600, gap: 4, color: '#dc2626', borderColor: '#fca5a5', padding: '6px 14px' }}
            >
              <Square size={12} /> Dừng ({batchProgress.current}/{batchProgress.total})
            </button>
          )}
        </div>
      </div>

      {/* Batch progress */}
      {batchRunning && (
        <div style={{
          background: 'linear-gradient(135deg, #fffbeb, #fef3c7)', borderRadius: 8,
          padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10,
          border: '1px solid #fde68a'
        }}>
          <Loader2 size={14} className="animate-spin" style={{ color: '#d97706' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>
              Đang sửa {batchProgress.current}/{batchProgress.total}: {batchProgress.label}...
            </div>
            <div className="progress-bar" style={{ height: 4, marginTop: 4 }}>
              <div className="progress-bar-fill" style={{
                width: `${(batchProgress.current / batchProgress.total) * 100}%`,
                background: 'linear-gradient(90deg, #f59e0b, #d97706)'
              }}></div>
            </div>
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div className="progress-bar">
        <div className="progress-bar-fill primary" style={{ width: `${(completedCount / sections.length) * 100}%` }}></div>
      </div>

      {/* Section Tabs */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 2,
        borderBottom: '1px solid #e2e8f0', paddingBottom: 4,
        maxHeight: 240, overflowY: 'auto'
      }}>
        {hasHierarchy ? (
          sections.filter(s => getLevel(s) === 1 || getParentId(s) === '').map(root => renderSectionTab(root, 0))
        ) : (
          sections.map(section => renderSectionTab(section, 0))
        )}
      </div>

      {/* ===== 3-STEP EDITOR AREA ===== */}
      {activeSection && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 12, minHeight: 450
        }}>

          {/* ========= BƯỚC 1: Upload & Yêu cầu ========= */}
          <div className="editor-panel step-column" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="step-header" style={{ background: '#f0f9ff', borderBottom: '2px solid #38bdf8' }}>
              <span className="step-badge" style={{ background: '#0284c7', color: 'white' }}>1</span>
              <span style={{ fontWeight: 700, color: '#0369a1', fontSize: 13 }}>Nội dung & Tài liệu</span>
            </div>

            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}>
              {/* Upload nội dung phần */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                  📄 Nội dung phần "{activeSection.title.substring(0, 30)}{activeSection.title.length > 30 ? '...' : ''}"
                </label>
                <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => sectionFileInputRef.current?.click()}
                    style={{ fontSize: 10, gap: 3 }}
                  >
                    <Upload size={11} /> Upload .docx/.pdf
                  </button>
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => setEditMode(editMode === 'paste' ? null : 'paste')}
                    style={{ fontSize: 10, gap: 3 }}
                  >
                    <ClipboardPaste size={11} /> Dán nội dung
                  </button>
                  <input
                    ref={sectionFileInputRef}
                    type="file"
                    accept=".txt,.md,.doc,.docx,.pdf"
                    style={{ display: 'none' }}
                    onChange={e => handleUploadSectionFile(e, activeSection.id)}
                  />
                </div>

                {/* Paste mode */}
                {editMode === 'paste' && (
                  <div style={{ marginBottom: 8 }}>
                    <textarea
                      autoFocus
                      value={pasteContent}
                      onChange={e => setPasteContent(e.target.value)}
                      placeholder="Dán nội dung mới cho phần này..."
                      style={{
                        width: '100%', minHeight: 70, border: '1px solid #bae6fd', borderRadius: 6,
                        padding: 8, fontSize: 11, resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                        background: '#f0f9ff'
                      }}
                    />
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <button className="btn-primary btn-sm" onClick={() => handlePasteContent(activeSection.id)} style={{ fontSize: 10 }}>
                        <Check size={10} /> Cập nhật
                      </button>
                      <button className="btn-secondary btn-sm" onClick={() => { setEditMode(null); setPasteContent(''); }} style={{ fontSize: 10 }}>
                        Hủy
                      </button>
                    </div>
                  </div>
                )}

                {/* Preview nội dung gốc */}
                <div style={{
                  background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
                  padding: 10, maxHeight: 150, overflow: 'auto', fontSize: 11, lineHeight: 1.7,
                  color: '#64748b', whiteSpace: 'pre-wrap'
                }}>
                  {activeSection.originalContent
                    ? activeSection.originalContent.substring(0, 1000) + (activeSection.originalContent.length > 1000 ? '\n\n...(xem thêm)' : '')
                    : '(Chưa có nội dung — upload hoặc dán nội dung phần này)'}
                </div>
              </div>

              {/* Đường kẻ phân cách */}
              <hr style={{ border: 'none', borderTop: '1px dashed #e2e8f0', margin: '2px 0' }} />

              {/* Tài liệu tham khảo */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                  📚 Tài liệu tham khảo
                  <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 10 }}>(AI sẽ bám sát nội dung)</span>
                </label>
                <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => refDocFileInputRef.current?.click()}
                    style={{ fontSize: 10, gap: 3 }}
                  >
                    <Upload size={11} /> Upload
                  </button>
                  <input
                    ref={refDocFileInputRef}
                    type="file"
                    accept=".txt,.md,.doc,.docx,.pdf"
                    multiple
                    style={{ display: 'none' }}
                    onChange={handleRefDocUpload}
                  />
                </div>

                {/* Danh sách tài liệu */}
                {userRequirements.referenceDocuments.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {userRequirements.referenceDocuments.map(doc => (
                      <div key={doc.id} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '5px 8px', borderRadius: 6,
                        background: doc.type === 'exercise' ? '#fef3c7' : '#f0f9ff',
                        border: `1px solid ${doc.type === 'exercise' ? '#fde68a' : '#bae6fd'}`,
                        fontSize: 10
                      }}>
                        <BookOpen size={12} color={doc.type === 'exercise' ? '#92400e' : '#0284c7'} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, color: '#334155' }}>
                          {doc.name}
                        </span>
                        <span style={{ color: '#94a3b8', fontSize: 9 }}>{(doc.content.length / 1000).toFixed(1)}k</span>
                        <button
                          onClick={() => handleRemoveRefDoc(doc.id)}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 1, display: 'flex' }}
                        >
                          <Trash2 size={11} color="#e11d48" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', margin: 0 }}>
                    Chưa có tài liệu. Upload để AI lấy nội dung tham khảo.
                  </p>
                )}
              </div>

              {/* Đường kẻ phân cách */}
              <hr style={{ border: 'none', borderTop: '1px dashed #e2e8f0', margin: '2px 0' }} />

              {/* Yêu cầu người dùng */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                  ⚙️ Yêu cầu
                </label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <div style={{ flex: '0 0 100px' }}>
                    <label style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 2 }}>Giới hạn trang</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      placeholder="∞"
                      value={userRequirements.pageLimit || ''}
                      onChange={e => {
                        const num = parseInt(e.target.value);
                        onUpdateRequirements({ ...userRequirements, pageLimit: isNaN(num) ? null : num });
                      }}
                      style={{
                        width: '100%', padding: '6px 8px', borderRadius: 6,
                        border: '1px solid #e2e8f0', fontSize: 11, outline: 'none'
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 2 }}>Yêu cầu đặc biệt</label>
                    <input
                      type="text"
                      placeholder="VD: Bám sát nội dung tài liệu TK, viết ngắn gọn..."
                      value={userRequirements.customInstructions}
                      onChange={e => onUpdateRequirements({ ...userRequirements, customInstructions: e.target.value })}
                      style={{
                        width: '100%', padding: '6px 8px', borderRadius: 6,
                        border: '1px solid #e2e8f0', fontSize: 11, outline: 'none'
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ========= BƯỚC 2: Phân tích chuyên sâu ========= */}
          <div className="editor-panel step-column" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="step-header" style={{ background: '#fffbeb', borderBottom: '2px solid #f59e0b' }}>
              <span className="step-badge" style={{ background: '#d97706', color: 'white' }}>2</span>
              <span style={{ fontWeight: 700, color: '#92400e', fontSize: 13 }}>Phân tích & Đề xuất sửa</span>
            </div>

            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
              {/* Nút phân tích */}
              <button
                onClick={() => handleDeepAnalysis(activeSection.id)}
                className="btn-primary"
                disabled={!!loadingDeepAnalysis || !activeSection.originalContent}
                style={{
                  width: '100%', padding: '10px 16px', fontSize: 13, fontWeight: 700,
                  background: !activeSection.originalContent ? '#e2e8f0' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                  border: 'none', gap: 6
                }}
              >
                {isAnalyzing ? (
                  <><Loader2 size={14} className="animate-spin-slow" /> Đang phân tích...</>
                ) : (
                  <><Search size={14} /> Phân tích chuyên sâu</>
                )}
              </button>

              {!activeSection.originalContent && (
                <p style={{ fontSize: 10, color: '#f59e0b', textAlign: 'center', margin: 0 }}>
                  ⚠️ Vui lòng upload nội dung ở Bước 1 trước
                </p>
              )}

              {/* Loading */}
              {isAnalyzing && (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 12px', gap: 8,
                  background: 'rgba(255, 251, 235, 0.5)', borderRadius: 8
                }}>
                  <div style={{ position: 'relative', width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="56" height="56" viewBox="0 0 56 56" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="28" cy="28" r="24" fill="none" stroke="#fde68a" strokeWidth="4" />
                      <circle cx="28" cy="28" r="24" fill="none" stroke="#f59e0b" strokeWidth="4"
                        strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 24}`}
                        strokeDashoffset={`${2 * Math.PI * 24 * 0.3}`}
                        className="animate-spin-slow" style={{ transformOrigin: '28px 28px' }}
                      />
                    </svg>
                    <Search size={16} style={{ position: 'absolute', color: '#d97706' }} />
                  </div>
                  <span style={{ fontSize: 12, color: '#92400e', fontWeight: 700 }}>Đang phân tích sâu...</span>
                  <span style={{ fontSize: 10, color: '#b45309' }}>Đọc ngữ cảnh → Tìm điểm yếu → Tạo đề xuất sửa</span>
                </div>
              )}

              {/* Kết quả phân tích */}
              {hasAnalysis && !isAnalyzing && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
                      📋 {activeSection.editSuggestions.length} đề xuất sửa
                    </span>
                    <button
                      onClick={() => handleDeepAnalysis(activeSection.id)}
                      className="btn-secondary btn-sm"
                      style={{ fontSize: 9, padding: '2px 6px' }}
                      disabled={!!loadingDeepAnalysis}
                    >
                      <RefreshCw size={9} /> Phân tích lại
                    </button>
                  </div>

                  {activeSection.editSuggestions.map((sug, idx) => {
                    const actionStyle = ACTION_STYLES[sug.action] || ACTION_STYLES.modify;
                    const catInfo = CATEGORY_LABELS[sug.category] || CATEGORY_LABELS.content;
                    const isExpanded = expandedSuggestion === sug.id;

                    return (
                      <div key={sug.id || idx} style={{
                        border: `1px solid ${sug.applied ? '#d1d5db' : actionStyle.border}`,
                        borderRadius: 8, overflow: 'hidden',
                        opacity: sug.applied ? 0.5 : 1,
                        transition: 'opacity 0.3s'
                      }}>
                        <div
                          onClick={() => setExpandedSuggestion(isExpanded ? null : sug.id)}
                          style={{
                            padding: '7px 10px', cursor: 'pointer',
                            background: sug.applied ? '#f9fafb' : actionStyle.bg
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                            <span style={{
                              fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                              background: actionStyle.bg, color: actionStyle.color,
                              border: `1px solid ${actionStyle.border}`,
                              display: 'flex', alignItems: 'center', gap: 2
                            }}>
                              {actionStyle.icon} {actionStyle.label}
                            </span>
                            <span style={{
                              fontSize: 9, padding: '1px 5px', borderRadius: 4,
                              background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0'
                            }}>
                              {catInfo.icon} {catInfo.label}
                            </span>
                            {sug.applied && (
                              <span style={{ fontSize: 9, color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Check size={9} /> Đã áp dụng
                              </span>
                            )}
                            <div style={{ flex: 1 }} />
                            {isExpanded ? <ChevronUp size={11} color="#94a3b8" /> : <ChevronDown size={11} color="#94a3b8" />}
                          </div>
                          <p style={{ fontSize: 11, fontWeight: 600, color: '#334155', margin: 0 }}>
                            {sug.label}
                          </p>
                        </div>

                        {isExpanded && (
                          <div style={{ padding: '7px 10px', borderTop: `1px solid ${actionStyle.border}`, fontSize: 11, lineHeight: 1.6 }}>
                            <p style={{ color: '#64748b', marginBottom: 6, margin: 0 }}>{sug.description}</p>

                            {sug.originalText && (
                              <div style={{
                                padding: '5px 8px', borderRadius: 6, marginTop: 5, marginBottom: 4,
                                background: '#fff1f2', borderLeft: '2px solid #f43f5e'
                              }}>
                                <p style={{ fontSize: 9, fontWeight: 600, color: '#e11d48', marginBottom: 2, margin: 0 }}>Gốc:</p>
                                <p style={{ color: '#64748b', margin: 0, fontSize: 10 }}>"{sug.originalText.substring(0, 200)}{sug.originalText.length > 200 ? '...' : ''}"</p>
                              </div>
                            )}
                            {sug.suggestedText && (
                              <div style={{
                                padding: '5px 8px', borderRadius: 6, marginTop: 4,
                                background: '#ecfdf5', borderLeft: '2px solid #10b981'
                              }}>
                                <p style={{ fontSize: 9, fontWeight: 600, color: '#047857', marginBottom: 2, margin: 0 }}>Đề xuất:</p>
                                <p style={{ color: '#334155', margin: 0, fontSize: 10 }}>"{sug.suggestedText.substring(0, 300)}{sug.suggestedText.length > 300 ? '...' : ''}"</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Empty state */}
              {(!hasAnalysis) && !isAnalyzing && (
                <div style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', color: '#94a3b8', textAlign: 'center'
                }}>
                  <Search size={28} style={{ marginBottom: 10, opacity: 0.3 }} />
                  <p style={{ fontSize: 12, maxWidth: 200, margin: 0, lineHeight: 1.6 }}>
                    Nhấn <strong>"Phân tích chuyên sâu"</strong> để AI đánh giá và đề xuất cách sửa cụ thể cho phần này.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ========= BƯỚC 3: Đồng ý sửa & Kết quả ========= */}
          <div className="editor-panel step-column" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="step-header" style={{ background: '#f0fdfa', borderBottom: '2px solid #14b8a6' }}>
              <span className="step-badge" style={{ background: '#0d9488', color: 'white' }}>3</span>
              <span style={{ fontWeight: 700, color: '#134e4a', fontSize: 13 }}>Kết quả sửa</span>
            </div>

            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', padding: 12, gap: 8 }}>
              {/* Nút đồng ý sửa */}
              {!activeSection.refinedContent && !isRefining && (
                <button
                  onClick={() => handleRefineWithAnalysis(activeSection.id)}
                  disabled={!hasAnalysis || !!loadingRefineWithAnalysis}
                  className="btn-primary"
                  style={{
                    width: '100%', padding: '10px 16px', fontSize: 13, fontWeight: 700,
                    background: !hasAnalysis ? '#e2e8f0' : 'linear-gradient(135deg, #14b8a6, #0d9488)',
                    border: 'none', gap: 6,
                    color: !hasAnalysis ? '#94a3b8' : 'white'
                  }}
                >
                  <CheckCircle2 size={14} /> Đồng ý sửa theo đề xuất
                </button>
              )}

              {!hasAnalysis && !activeSection.refinedContent && !isRefining && (
                <p style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', margin: 0 }}>
                  ⏳ Cần phân tích ở Bước 2 trước khi sửa
                </p>
              )}

              {/* Loading */}
              {isRefining && (
                <div style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 10,
                  background: 'rgba(240, 253, 250, 0.9)'
                }}>
                  <div style={{ position: 'relative', width: 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="60" height="60" viewBox="0 0 60 60" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="30" cy="30" r="25" fill="none" stroke="#ccfbf1" strokeWidth="4" />
                      <circle cx="30" cy="30" r="25" fill="none" stroke="#0d9488" strokeWidth="4"
                        strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 25}`}
                        strokeDashoffset={`${2 * Math.PI * 25 * 0.3}`}
                        className="animate-spin-slow" style={{ transformOrigin: '30px 30px' }}
                      />
                    </svg>
                    <Sparkles size={18} style={{ position: 'absolute', color: '#0d9488' }} />
                  </div>
                  <span style={{ fontSize: 13, color: '#0d9488', fontWeight: 700 }}>
                    Đang sửa nội dung...
                  </span>
                  <span style={{ fontSize: 10, color: '#64748b' }}>
                    Áp dụng đề xuất → Viết lại tự nhiên → Kiểm tra chất lượng
                  </span>
                </div>
              )}

              {/* Kết quả đã sửa */}
              {activeSection.refinedContent && !isRefining && (
                <>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => setShowDiff(!showDiff)}
                      className={`btn-secondary btn-sm`}
                      style={{ fontSize: 10, color: showDiff ? '#0d9488' : undefined, borderColor: showDiff ? '#14b8a6' : undefined }}
                    >
                      <GitCompareArrows size={11} /> {showDiff ? 'Ẩn so sánh' : 'So sánh'}
                    </button>
                    <button
                      onClick={() => handleDownloadSection(activeSection)}
                      className="btn-secondary btn-sm"
                      style={{ fontSize: 10 }}
                    >
                      <Download size={11} /> Tải
                    </button>
                    <button
                      onClick={() => handleRefineWithAnalysis(activeSection.id)}
                      className="btn-secondary btn-sm"
                      disabled={!!loadingRefineWithAnalysis || !hasAnalysis}
                      style={{ fontSize: 10 }}
                    >
                      <RefreshCw size={11} /> Sửa lại
                    </button>
                  </div>
                  {showDiff ? (
                    <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 350 }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', padding: '4px 8px', background: '#fef2f2', borderRadius: '6px 6px 0 0' }}>
                          Bản gốc
                        </div>
                        <textarea
                          readOnly
                          value={activeSection.originalContent}
                          style={{
                            width: '100%', flex: 1, border: '1px solid #fecaca', outline: 'none', resize: 'none',
                            fontSize: 11, lineHeight: 1.7, color: '#64748b', padding: 8, fontFamily: 'inherit',
                            background: '#fffbfb', borderRadius: '0 0 6px 6px'
                          }}
                        />
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#059669', padding: '4px 8px', background: '#ecfdf5', borderRadius: '6px 6px 0 0' }}>
                          Đã sửa
                        </div>
                        <textarea
                          value={activeSection.refinedContent}
                          onChange={e => handleContentEdit(activeSection.id, e.target.value)}
                          style={{
                            width: '100%', flex: 1, border: '1px solid #a7f3d0', outline: 'none', resize: 'none',
                            fontSize: 11, lineHeight: 1.7, color: '#334155', padding: 8, fontFamily: 'inherit',
                            background: '#fafffe', borderRadius: '0 0 6px 6px'
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <textarea
                      value={activeSection.refinedContent}
                      onChange={e => handleContentEdit(activeSection.id, e.target.value)}
                      style={{
                        width: '100%', flex: 1, minHeight: 350,
                        border: '1px solid #ccfbf1', outline: 'none', resize: 'vertical',
                        fontSize: 12, lineHeight: 1.8, color: '#334155',
                        padding: 10, fontFamily: 'inherit', background: '#fafffe',
                        borderRadius: 6
                      }}
                    />
                  )}
                </>
              )}

              {/* Empty state khi chưa sửa */}
              {!activeSection.refinedContent && !isRefining && !hasAnalysis && (
                <div style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', color: '#94a3b8'
                }}>
                  <Sparkles size={28} style={{ marginBottom: 10, opacity: 0.3 }} />
                  <p style={{ fontSize: 12, textAlign: 'center', maxWidth: 200, margin: 0, lineHeight: 1.6 }}>
                    Nội dung đã sửa sẽ hiện ở đây sau khi bạn đồng ý sửa theo đề xuất.
                  </p>
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* No active section fallback */}
      {!activeSection && sections.length > 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
          <p>Chọn một phần từ danh sách bên trên để bắt đầu sửa.</p>
        </div>
      )}

      {/* Bottom Actions */}
      <div style={{
        display: 'flex', justifyContent: 'flex-end',
        paddingTop: 16, borderTop: '1px solid #e2e8f0', gap: 10
      }}>
        <button onClick={onFinish} className="btn-accent btn-lg">
          <FileDown size={18} />
          Hoàn tất & Xuất toàn bộ SKKN
        </button>
      </div>
    </div>
  );
};

export default StepEditor;