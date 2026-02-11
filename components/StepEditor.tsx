import React, { useState, useRef } from 'react';
import { SectionContent, SectionSuggestion, SectionEditSuggestion, UserRequirements } from '../types';
import { SUGGESTION_TYPES } from '../constants';
import { Check, Loader2, RefreshCw, FileDown, Lightbulb, Sparkles, Eye, EyeOff, ChevronDown, ChevronUp, Download, Search, Plus, Minus, Pencil, Replace, CheckCircle2, Upload, ClipboardPaste, BookOpen } from 'lucide-react';
import * as geminiService from '../services/geminiService';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';
import UserRequirementsPanel from './UserRequirementsPanel';

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
  onUpdateSections, userRequirements, onUpdateRequirements
}) => {
  const [activeTab, setActiveTab] = useState<string>(sections[0]?.id || '');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [loadingSuggestions, setLoadingSuggestions] = useState<string | null>(null);
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);
  const [loadingDeepAnalysis, setLoadingDeepAnalysis] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<'paste' | null>(null);
  const [pasteContent, setPasteContent] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeSection = sections.find(s => s.id === activeTab);

  const getLevel = (s: SectionContent) => s.level || 1;
  const getParentId = (s: SectionContent) => s.parentId || '';

  // --- OLD suggestions (quick analysis) ---
  const handleGetSuggestions = async (sectionId: string) => {
    const section = sections.find(s => s.id === sectionId);
    if (!section || !section.originalContent) return;

    setLoadingSuggestions(sectionId);
    try {
      const suggestions = await geminiService.generateSectionSuggestions(
        section.title, section.originalContent, selectedTitle
      );
      onUpdateSections(sections.map(s =>
        s.id === sectionId ? { ...s, suggestions } : s
      ));
    } catch (err) {
      console.error('Failed to get suggestions:', err);
    }
    setLoadingSuggestions(null);
  };

  // --- NEW deep analysis with context ---
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
    } catch (err) {
      console.error('Deep analysis failed:', err);
    }
    setLoadingDeepAnalysis(null);
  };

  // --- Apply a single edit suggestion ---
  const handleApplySuggestion = (sectionId: string, suggestionId: string) => {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;

    const sug = section.editSuggestions.find(s => s.id === suggestionId);
    if (!sug || sug.applied) return;

    let content = section.refinedContent || section.originalContent;

    if (sug.action === 'replace' || sug.action === 'modify') {
      if (sug.originalText && content.includes(sug.originalText)) {
        content = content.replace(sug.originalText, sug.suggestedText);
      } else {
        // Fallback: append as note
        content += `\n\n[ĐỀ XUẤT SỬA - ${sug.label}]\n${sug.suggestedText}`;
      }
    } else if (sug.action === 'add') {
      content += `\n\n${sug.suggestedText}`;
    } else if (sug.action === 'remove') {
      if (sug.originalText && content.includes(sug.originalText)) {
        content = content.replace(sug.originalText, '').replace(/\n{3,}/g, '\n\n').trim();
      }
    }

    onUpdateSections(sections.map(s =>
      s.id === sectionId ? {
        ...s,
        refinedContent: content,
        editSuggestions: s.editSuggestions.map(es =>
          es.id === suggestionId ? { ...es, applied: true } : es
        )
      } : s
    ));
  };

  // --- Apply all suggestions ---
  const handleApplyAll = (sectionId: string) => {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;

    let content = section.refinedContent || section.originalContent;
    const updatedSuggestions = section.editSuggestions.map(sug => {
      if (sug.applied) return sug;

      if (sug.action === 'replace' || sug.action === 'modify') {
        if (sug.originalText && content.includes(sug.originalText)) {
          content = content.replace(sug.originalText, sug.suggestedText);
        }
      } else if (sug.action === 'add') {
        content += `\n\n${sug.suggestedText}`;
      } else if (sug.action === 'remove') {
        if (sug.originalText && content.includes(sug.originalText)) {
          content = content.replace(sug.originalText, '').replace(/\n{3,}/g, '\n\n').trim();
        }
      }
      return { ...sug, applied: true };
    });

    onUpdateSections(sections.map(s =>
      s.id === sectionId ? { ...s, refinedContent: content, editSuggestions: updatedSuggestions } : s
    ));
  };

  // --- Upload/paste content for a section ---
  const handleUploadSectionFile = async (e: React.ChangeEvent<HTMLInputElement>, sectionId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      let content = await file.text();
      // Clean XML if docx
      if (content.includes('<?xml') || content.includes('<w:')) {
        content = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }

      onUpdateSections(sections.map(s =>
        s.id === sectionId ? { ...s, originalContent: content, editSuggestions: [] } : s
      ));
    } catch (err) {
      console.error('Error reading section file:', err);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
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

  // --- Download single section as DOCX ---
  const handleDownloadSection = async (section: SectionContent) => {
    try {
      const content = section.refinedContent || section.originalContent;
      const paragraphs: Paragraph[] = [];

      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: section.title, bold: true, size: 28, font: 'Times New Roman' })],
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 200 }
      }));

      content.split('\n').filter(p => p.trim()).forEach(para => {
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: para.trim(), size: 26, font: 'Times New Roman' })],
          spacing: { after: 100 },
          indent: { firstLine: 720 }
        }));
      });

      const doc = new Document({ sections: [{ children: paragraphs }] });
      const blob = await Packer.toBlob(doc);
      const safeName = section.title.replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF ]/g, '').trim().replace(/ +/g, '_');
      saveAs(blob, `${safeName}.docx`);
    } catch (error) {
      console.error('Download section error:', error);
    }
  };

  const completedCount = sections.filter(s => s.refinedContent).length;
  const getChildren = (parentId: string) => sections.filter(s => getParentId(s) === parentId);
  const hasHierarchy = sections.some(s => getLevel(s) >= 2);

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

  const hasRefDocs = userRequirements.referenceDocuments.length > 0;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#134e4a', margin: 0 }}>Sửa nội dung từng phần</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0, marginTop: 4 }}>
            Đã sửa <span style={{ color: '#10b981', fontWeight: 700 }}>{completedCount}/{sections.length}</span> phần
            {selectedTitle && <span style={{ color: '#94a3b8' }}> · Đề tài: "{selectedTitle.substring(0, 50)}..."</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowSuggestions(!showSuggestions)} className="btn-secondary btn-sm">
            {showSuggestions ? <EyeOff size={14} /> : <Eye size={14} />}
            {showSuggestions ? 'Ẩn gợi ý' : 'Hiện gợi ý'}
          </button>
        </div>
      </div>

      {/* User Requirements Panel */}
      <UserRequirementsPanel
        requirements={userRequirements}
        onUpdate={onUpdateRequirements}
      />

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

      {/* Editor Area */}
      {activeSection && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: showSuggestions ? '1fr 1fr 340px' : '1fr 1fr',
          gap: 16, minHeight: 400
        }}>
          {/* Original Panel */}
          <div className="editor-panel" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="panel-header" style={{ color: '#475569', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                📄 Nội dung Gốc
                {getLevel(activeSection) === 2 && (
                  <span className="badge badge-primary" style={{ fontSize: 9 }}>Mục con</span>
                )}
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => setEditMode(editMode === 'paste' ? null : 'paste')}
                  title="Dán nội dung mới"
                  style={{ padding: '2px 6px' }}
                >
                  <ClipboardPaste size={11} />
                </button>
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload file nội dung (Word/PDF/TXT)"
                  style={{ padding: '2px 6px' }}
                >
                  <Upload size={11} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.doc,.docx,.pdf"
                  style={{ display: 'none' }}
                  onChange={e => handleUploadSectionFile(e, activeSection.id)}
                />
              </div>
            </div>

            {/* Paste mode */}
            {editMode === 'paste' && (
              <div style={{ padding: '8px 12px', background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
                <textarea
                  autoFocus
                  value={pasteContent}
                  onChange={e => setPasteContent(e.target.value)}
                  placeholder="Dán nội dung mới cho phần này..."
                  style={{
                    width: '100%', minHeight: 80, border: '1px solid #fde68a', borderRadius: 6,
                    padding: 8, fontSize: 12, resize: 'vertical', outline: 'none',
                    fontFamily: 'inherit'
                  }}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button className="btn-primary btn-sm" onClick={() => handlePasteContent(activeSection.id)}>
                    <Check size={11} /> Cập nhật
                  </button>
                  <button className="btn-secondary btn-sm" onClick={() => { setEditMode(null); setPasteContent(''); }}>
                    Hủy
                  </button>
                </div>
              </div>
            )}

            <div className="panel-body" style={{ backgroundColor: '#fafafa', flex: 1, overflow: 'auto' }}>
              <p style={{
                whiteSpace: 'pre-wrap', fontSize: 13, color: '#64748b', lineHeight: 1.8, margin: 0
              }}>
                {activeSection.originalContent || "(Không tìm thấy nội dung phần này)"}
              </p>
            </div>
          </div>

          {/* Refined Panel */}
          <div className="editor-panel" style={{ borderColor: '#99f6e4', display: 'flex', flexDirection: 'column' }}>
            <div className="panel-header" style={{ color: '#0d9488', background: '#f0fdfa', justifyContent: 'space-between' }}>
              <span>✨ Nội dung Đề xuất (AI)</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {activeSection.refinedContent && (
                  <>
                    <button
                      onClick={() => handleDownloadSection(activeSection)}
                      className="btn-secondary btn-sm"
                      title="Tải phần này"
                    >
                      <Download size={12} /> Tải
                    </button>
                    <button
                      onClick={() => hasRefDocs ? onRefineSectionWithRefs(activeSection.id) : onRefineSection(activeSection.id)}
                      className="btn-secondary btn-sm"
                      disabled={!!isProcessing}
                    >
                      <RefreshCw size={12} /> Viết lại
                    </button>
                  </>
                )}
                {!activeSection.refinedContent && !isProcessing && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      onClick={() => onRefineSection(activeSection.id)}
                      className="btn-primary btn-sm"
                    >
                      <Sparkles size={12} /> Viết lại
                    </button>
                    {hasRefDocs && (
                      <button
                        onClick={() => onRefineSectionWithRefs(activeSection.id)}
                        className="btn-secondary btn-sm"
                        title="Viết lại sử dụng ví dụ từ tài liệu tham khảo"
                      >
                        <BookOpen size={12} /> + Tài liệu TK
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="panel-body" style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
              {isProcessing === activeSection.id ? (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(240, 253, 250, 0.9)', zIndex: 10
                }}>
                  <Loader2 size={32} color="#0d9488" className="animate-spin-slow" />
                  <span style={{ fontSize: 13, color: '#0d9488', fontWeight: 600, marginTop: 12 }}>
                    Đang viết lại theo đề tài mới...
                  </span>
                  <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    Giọng văn tự nhiên · Giữ số liệu · Tránh đạo văn
                  </span>
                </div>
              ) : activeSection.refinedContent ? (
                <textarea
                  value={activeSection.refinedContent}
                  onChange={e => handleContentEdit(activeSection.id, e.target.value)}
                  style={{
                    width: '100%', flex: 1, minHeight: 300,
                    border: 'none', outline: 'none', resize: 'vertical',
                    fontSize: 13, lineHeight: 1.8, color: '#334155',
                    padding: 0, fontFamily: 'inherit', background: 'transparent'
                  }}
                />
              ) : (
                <div style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', color: '#94a3b8'
                }}>
                  <Sparkles size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
                  <p style={{ fontSize: 13, textAlign: 'center', maxWidth: 240 }}>
                    Nhấn "Viết lại" để AI viết lại phần này với giọng văn tự nhiên.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Analysis & Suggestions */}
          {showSuggestions && (
            <div className="editor-panel" style={{ borderColor: '#fde68a', display: 'flex', flexDirection: 'column' }}>
              <div className="panel-header" style={{ color: '#92400e', background: '#fffbeb', justifyContent: 'space-between' }}>
                <span>🔍 Phân tích & Đề xuất sửa</span>
              </div>
              <div className="panel-body" style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleDeepAnalysis(activeSection.id)}
                    className="btn-primary btn-sm"
                    disabled={!!loadingDeepAnalysis}
                    style={{ fontSize: 11 }}
                  >
                    <Search size={11} /> Phân tích sâu
                  </button>
                  {(!activeSection.suggestions || activeSection.suggestions.length === 0) && !loadingSuggestions && (
                    <button
                      onClick={() => handleGetSuggestions(activeSection.id)}
                      className="btn-secondary btn-sm"
                      style={{ fontSize: 11 }}
                    >
                      <Lightbulb size={11} /> Phân tích nhanh
                    </button>
                  )}
                </div>

                {/* Deep analysis loading */}
                {loadingDeepAnalysis === activeSection.id && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', gap: 8 }}>
                    <Loader2 size={24} color="#f59e0b" className="animate-spin-slow" />
                    <span style={{ fontSize: 11, color: '#64748b' }}>Đang phân tích sâu dựa trên bối cảnh SKKN...</span>
                  </div>
                )}

                {/* Deep analysis results (edit suggestions) */}
                {activeSection.editSuggestions && activeSection.editSuggestions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>
                        Đề xuất sửa ({activeSection.editSuggestions.filter(s => !s.applied).length} chưa áp dụng)
                      </span>
                      {activeSection.editSuggestions.some(s => !s.applied) && (
                        <button
                          onClick={() => handleApplyAll(activeSection.id)}
                          className="btn-primary btn-sm"
                          style={{ fontSize: 10, padding: '2px 8px' }}
                        >
                          <CheckCircle2 size={10} /> Áp dụng tất cả
                        </button>
                      )}
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
                              padding: '8px 10px', cursor: 'pointer',
                              background: sug.applied ? '#f9fafb' : actionStyle.bg
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                              <span style={{
                                fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                                background: actionStyle.bg, color: actionStyle.color,
                                border: `1px solid ${actionStyle.border}`,
                                display: 'flex', alignItems: 'center', gap: 2
                              }}>
                                {actionStyle.icon} {actionStyle.label}
                              </span>
                              <span style={{
                                fontSize: 9, padding: '1px 6px', borderRadius: 4,
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
                              {isExpanded ? <ChevronUp size={12} color="#94a3b8" /> : <ChevronDown size={12} color="#94a3b8" />}
                            </div>
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#334155', margin: 0 }}>
                              {sug.label}
                            </p>
                          </div>

                          {isExpanded && (
                            <div style={{ padding: '8px 10px', borderTop: `1px solid ${actionStyle.border}`, fontSize: 11, lineHeight: 1.6 }}>
                              <p style={{ color: '#64748b', marginBottom: 8, margin: 0 }}>{sug.description}</p>

                              {sug.originalText && (
                                <div style={{
                                  padding: '6px 8px', borderRadius: 6, marginTop: 6, marginBottom: 4,
                                  background: '#fff1f2', borderLeft: '2px solid #f43f5e'
                                }}>
                                  <p style={{ fontSize: 9, fontWeight: 600, color: '#e11d48', marginBottom: 2, margin: 0 }}>Gốc:</p>
                                  <p style={{ color: '#64748b', margin: 0, fontSize: 11 }}>"{sug.originalText.substring(0, 200)}{sug.originalText.length > 200 ? '...' : ''}"</p>
                                </div>
                              )}
                              {sug.suggestedText && (
                                <div style={{
                                  padding: '6px 8px', borderRadius: 6, marginTop: 4,
                                  background: '#ecfdf5', borderLeft: '2px solid #10b981'
                                }}>
                                  <p style={{ fontSize: 9, fontWeight: 600, color: '#047857', marginBottom: 2, margin: 0 }}>Đề xuất:</p>
                                  <p style={{ color: '#334155', margin: 0, fontSize: 11 }}>"{sug.suggestedText.substring(0, 300)}{sug.suggestedText.length > 300 ? '...' : ''}"</p>
                                </div>
                              )}

                              {!sug.applied && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleApplySuggestion(activeSection.id, sug.id); }}
                                  className="btn-primary btn-sm"
                                  style={{ marginTop: 8, fontSize: 10 }}
                                >
                                  <Check size={10} /> Áp dụng sửa
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <button
                      onClick={() => handleDeepAnalysis(activeSection.id)}
                      className="btn-secondary btn-sm"
                      style={{ alignSelf: 'center', marginTop: 4, fontSize: 10 }}
                      disabled={!!loadingDeepAnalysis}
                    >
                      <RefreshCw size={10} /> Phân tích lại
                    </button>
                  </div>
                )}

                {/* Old quick suggestions */}
                {loadingSuggestions === activeSection.id && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 0', gap: 8 }}>
                    <Loader2 size={24} color="#f59e0b" className="animate-spin-slow" />
                    <span style={{ fontSize: 12, color: '#64748b' }}>Đang phân tích nhanh...</span>
                  </div>
                )}

                {activeSection.suggestions && activeSection.suggestions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>Gợi ý nhanh</span>
                    {activeSection.suggestions.map((sug, idx) => {
                      const typeInfo = SUGGESTION_TYPES[sug.type as keyof typeof SUGGESTION_TYPES] || SUGGESTION_TYPES.scientific;
                      const isExpanded = expandedSuggestion === sug.id;
                      return (
                        <div key={sug.id || idx} className="suggestion-card" style={{
                          borderColor: `${typeInfo.color}30`, padding: '8px 10px', borderRadius: 8,
                          border: `1px solid ${typeInfo.color}30`, background: 'white'
                        }}>
                          <div onClick={() => setExpandedSuggestion(isExpanded ? null : sug.id)} style={{ cursor: 'pointer' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{
                                fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 999,
                                background: `${typeInfo.color}10`, color: typeInfo.color,
                                border: `1px solid ${typeInfo.color}30`
                              }}>
                                {typeInfo.icon} {typeInfo.label}
                              </span>
                              {isExpanded ? <ChevronUp size={12} color="#94a3b8" /> : <ChevronDown size={12} color="#94a3b8" />}
                            </div>
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#334155', margin: 0 }}>{sug.label}</p>
                          </div>
                          {isExpanded && (
                            <div style={{ marginTop: 8, fontSize: 11, lineHeight: 1.6 }}>
                              <p style={{ color: '#64748b', marginBottom: 6, margin: 0 }}>{sug.description}</p>
                              {sug.originalText && (
                                <div style={{ padding: '6px 8px', borderRadius: 6, marginBottom: 4, background: '#fff1f2', borderLeft: '2px solid #f43f5e' }}>
                                  <p style={{ fontSize: 9, fontWeight: 600, color: '#e11d48', marginBottom: 2, margin: 0 }}>Gốc:</p>
                                  <p style={{ color: '#64748b', margin: 0 }}>"{sug.originalText}"</p>
                                </div>
                              )}
                              {sug.suggestedText && (
                                <div style={{ padding: '6px 8px', borderRadius: 6, background: '#ecfdf5', borderLeft: '2px solid #10b981' }}>
                                  <p style={{ fontSize: 9, fontWeight: 600, color: '#047857', marginBottom: 2, margin: 0 }}>Đề xuất:</p>
                                  <p style={{ color: '#334155', margin: 0 }}>"{sug.suggestedText}"</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <button
                      onClick={() => handleGetSuggestions(activeSection.id)}
                      className="btn-secondary btn-sm"
                      style={{ alignSelf: 'center', marginTop: 2, fontSize: 10 }}
                    >
                      <RefreshCw size={10} /> Phân tích lại
                    </button>
                  </div>
                )}

                {/* Empty state */}
                {(!activeSection.editSuggestions || activeSection.editSuggestions.length === 0) &&
                  (!activeSection.suggestions || activeSection.suggestions.length === 0) &&
                  !loadingDeepAnalysis && !loadingSuggestions && (
                    <div style={{
                      flex: 1, display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', color: '#94a3b8', textAlign: 'center'
                    }}>
                      <Search size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
                      <p style={{ fontSize: 12, maxWidth: 220, margin: 0 }}>
                        Nhấn <strong>"Phân tích sâu"</strong> để AI đánh giá dựa trên bối cảnh SKKN tổng thể và đề xuất sửa cụ thể.
                      </p>
                    </div>
                  )}

              </div>
            </div>
          )}
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