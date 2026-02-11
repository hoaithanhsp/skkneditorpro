import React, { useState } from 'react';
import { SectionContent, SectionSuggestion } from '../types';
import { SUGGESTION_TYPES } from '../constants';
import { Check, Loader2, RefreshCw, FileDown, Lightbulb, Sparkles, Eye, EyeOff, ChevronDown, ChevronUp, Download } from 'lucide-react';
import * as geminiService from '../services/geminiService';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';

interface StepEditorProps {
  sections: SectionContent[];
  onRefineSection: (id: string) => void;
  onFinish: () => void;
  isProcessing: string | null;
  selectedTitle: string;
  onUpdateSections: (sections: SectionContent[]) => void;
}

const StepEditor: React.FC<StepEditorProps> = ({ sections, onRefineSection, onFinish, isProcessing, selectedTitle, onUpdateSections }) => {
  const [activeTab, setActiveTab] = useState<string>(sections[0]?.id || '');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [loadingSuggestions, setLoadingSuggestions] = useState<string | null>(null);
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);

  const activeSection = sections.find(s => s.id === activeTab);

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

  // Group sections: parent + children
  const parentSections = sections.filter(s => s.level === 1);
  const childSections = (parentId: string) => sections.filter(s => s.parentId === parentId);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#134e4a', margin: 0 }}>Sửa nội dung từng phần</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0, marginTop: 4 }}>
            Đã sửa <span style={{ color: '#10b981', fontWeight: 700 }}>{completedCount}/{sections.length}</span> phần
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowSuggestions(!showSuggestions)} className="btn-secondary btn-sm">
            {showSuggestions ? <EyeOff size={14} /> : <Eye size={14} />}
            {showSuggestions ? 'Ẩn gợi ý' : 'Hiện gợi ý'}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="progress-bar">
        <div className="progress-bar-fill primary" style={{ width: `${(completedCount / sections.length) * 100}%` }}></div>
      </div>

      {/* Hierarchical Tabs */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 2,
        borderBottom: '1px solid #e2e8f0', paddingBottom: 4,
        maxHeight: 220, overflowY: 'auto'
      }}>
        {parentSections.map(parent => {
          const children = childSections(parent.id);
          const isParentActive = activeTab === parent.id;
          const isChildActive = children.some(c => c.id === activeTab);

          return (
            <div key={parent.id}>
              {/* Parent tab */}
              <button
                onClick={() => setActiveTab(parent.id)}
                className={`tab-btn ${isParentActive ? 'active' : ''}`}
                style={{
                  width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontWeight: isParentActive || isChildActive ? 700 : 500,
                  background: isParentActive ? '#f0fdfa' : isChildActive ? '#fafffe' : 'transparent',
                  borderLeft: isParentActive ? '3px solid #14b8a6' : isChildActive ? '3px solid #99f6e4' : '3px solid transparent'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {parent.title}
                  {parent.refinedContent && <Check size={12} style={{ color: '#10b981' }} />}
                </span>
                {children.length > 0 && (
                  <span className="badge badge-primary" style={{ fontSize: 9, padding: '1px 6px' }}>
                    {children.length} mục con
                  </span>
                )}
              </button>

              {/* Child tabs (always visible) */}
              {children.length > 0 && (
                <div style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {children.map(child => (
                    <button
                      key={child.id}
                      onClick={() => setActiveTab(child.id)}
                      className={`tab-btn ${activeTab === child.id ? 'active' : ''}`}
                      style={{
                        width: '100%', textAlign: 'left', fontSize: 12,
                        padding: '6px 12px',
                        borderLeft: activeTab === child.id ? '2px solid #14b8a6' : '2px solid #e2e8f0',
                        background: activeTab === child.id ? '#ecfdf5' : 'transparent'
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: '#94a3b8' }}>↳</span>
                        {child.title}
                        {child.refinedContent && <Check size={10} style={{ color: '#10b981' }} />}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {/* If no hierarchy, show flat tabs */}
        {parentSections.length === 0 && sections.map(section => (
          <button
            key={section.id}
            onClick={() => setActiveTab(section.id)}
            className={`tab-btn ${activeTab === section.id ? 'active' : ''}`}
            style={{ textAlign: 'left' }}
          >
            {section.title}
            {section.refinedContent && <Check size={12} style={{ marginLeft: 4, color: '#10b981' }} />}
          </button>
        ))}
      </div>

      {/* Editor Area */}
      {activeSection && (
        <div style={{ display: 'grid', gridTemplateColumns: showSuggestions ? '1fr 1fr 320px' : '1fr 1fr', gap: 16, minHeight: 'calc(100vh - 420px)' }}>
          {/* Original Panel */}
          <div className="editor-panel">
            <div className="panel-header" style={{ color: '#475569' }}>
              <span>📄 Nội dung Gốc</span>
              {activeSection.level === 2 && (
                <span className="badge badge-primary" style={{ fontSize: 9 }}>Mục con</span>
              )}
            </div>
            <div className="panel-body" style={{ backgroundColor: '#fafafa' }}>
              <p style={{
                whiteSpace: 'pre-wrap', fontSize: 13, color: '#64748b', lineHeight: 1.8
              }}>
                {activeSection.originalContent || "(Không tìm thấy nội dung phần này)"}
              </p>
            </div>
          </div>

          {/* Refined Panel */}
          <div className="editor-panel" style={{ borderColor: '#99f6e4' }}>
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
                      <Download size={12} /> Tải phần này
                    </button>
                    <button
                      onClick={() => onRefineSection(activeSection.id)}
                      className="btn-secondary btn-sm"
                      disabled={!!isProcessing}
                    >
                      <RefreshCw size={12} /> Viết lại
                    </button>
                  </>
                )}
                {!activeSection.refinedContent && !isProcessing && (
                  <button
                    onClick={() => onRefineSection(activeSection.id)}
                    className="btn-primary btn-sm"
                  >
                    <Sparkles size={12} /> Tạo nội dung mới
                  </button>
                )}
              </div>
            </div>
            <div className="panel-body" style={{ position: 'relative' }}>
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
                    Giữ nguyên số liệu, đổi mới diễn đạt, công thức toán → LaTeX
                  </span>
                </div>
              ) : activeSection.refinedContent ? (
                <textarea
                  value={activeSection.refinedContent}
                  onChange={e => handleContentEdit(activeSection.id, e.target.value)}
                  style={{ lineHeight: 1.8 }}
                />
              ) : (
                <div style={{
                  height: '100%', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', color: '#94a3b8'
                }}>
                  <Sparkles size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
                  <p style={{ fontSize: 13, textAlign: 'center', maxWidth: 240 }}>
                    Nhấn "Tạo nội dung mới" để AI viết lại phần này.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Suggestions Panel */}
          {showSuggestions && (
            <div className="editor-panel" style={{ borderColor: '#fde68a' }}>
              <div className="panel-header" style={{ color: '#92400e', background: '#fffbeb' }}>
                <span>💡 Gợi ý AI</span>
                {!activeSection.suggestions?.length && !loadingSuggestions && (
                  <button
                    onClick={() => handleGetSuggestions(activeSection.id)}
                    className="btn-secondary btn-sm"
                  >
                    <Lightbulb size={12} /> Phân tích
                  </button>
                )}
              </div>
              <div className="panel-body">
                {loadingSuggestions === activeSection.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
                    <Loader2 size={24} color="#f59e0b" className="animate-spin-slow" />
                    <span style={{ fontSize: 12, color: '#64748b' }}>Đang phân tích...</span>
                  </div>
                ) : activeSection.suggestions && activeSection.suggestions.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {activeSection.suggestions.map((sug, idx) => {
                      const typeInfo = SUGGESTION_TYPES[sug.type as keyof typeof SUGGESTION_TYPES] || SUGGESTION_TYPES.scientific;
                      const isExpanded = expandedSuggestion === sug.id;
                      return (
                        <div key={sug.id || idx} className="suggestion-card" style={{
                          borderColor: `${typeInfo.color}30`
                        }}>
                          <div
                            onClick={() => setExpandedSuggestion(isExpanded ? null : sug.id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                                background: `${typeInfo.color}10`, color: typeInfo.color,
                                border: `1px solid ${typeInfo.color}30`
                              }}>
                                {typeInfo.icon} {typeInfo.label}
                              </span>
                              {isExpanded ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
                            </div>
                            <p style={{ fontSize: 12, fontWeight: 600, color: '#334155', margin: 0 }}>
                              {sug.label}
                            </p>
                          </div>

                          {isExpanded && (
                            <div style={{ marginTop: 10, fontSize: 11, lineHeight: 1.6 }}>
                              <p style={{ color: '#64748b', marginBottom: 8 }}>{sug.description}</p>
                              {sug.originalText && (
                                <div style={{
                                  padding: '8px 10px', borderRadius: 6, marginBottom: 6,
                                  background: '#fff1f2', borderLeft: '2px solid #f43f5e'
                                }}>
                                  <p style={{ fontSize: 10, fontWeight: 600, color: '#e11d48', marginBottom: 2 }}>Gốc:</p>
                                  <p style={{ color: '#64748b', margin: 0 }}>"{sug.originalText}"</p>
                                </div>
                              )}
                              {sug.suggestedText && (
                                <div style={{
                                  padding: '8px 10px', borderRadius: 6,
                                  background: '#ecfdf5', borderLeft: '2px solid #10b981'
                                }}>
                                  <p style={{ fontSize: 10, fontWeight: 600, color: '#047857', marginBottom: 2 }}>Đề xuất:</p>
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
                      style={{ alignSelf: 'center', marginTop: 4 }}
                    >
                      <RefreshCw size={12} /> Phân tích lại
                    </button>
                  </div>
                ) : (
                  <div style={{
                    height: '100%', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', color: '#94a3b8', textAlign: 'center'
                  }}>
                    <Lightbulb size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
                    <p style={{ fontSize: 12, maxWidth: 200 }}>
                      Nhấn "Phân tích" để AI đánh giá tính khoa học, sáng tạo, tính mới và chống đạo văn.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
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