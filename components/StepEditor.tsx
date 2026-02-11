import React, { useState } from 'react';
import { SectionContent, SectionSuggestion } from '../types';
import { SUGGESTION_TYPES } from '../constants';
import { Check, Loader2, RefreshCw, FileDown, Lightbulb, Sparkles, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import * as geminiService from '../services/geminiService';

interface StepEditorProps {
  sections: SectionContent[];
  onRefineSection: (id: string) => void;
  onFinish: () => void;
  isProcessing: string | null;
  selectedTitle: string;
  onUpdateSections: (sections: SectionContent[]) => void;
}

const StepEditor: React.FC<StepEditorProps> = ({ sections, onRefineSection, onFinish, isProcessing, selectedTitle, onUpdateSections }) => {
  const [activeTab, setActiveTab] = useState<string>(sections[0]?.id || 'intro');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [loadingSuggestions, setLoadingSuggestions] = useState<string | null>(null);
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);

  const activeSection = sections.find(s => s.id === activeTab);

  // Fetch suggestions for a section
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

  // Handle editing refined content
  const handleContentEdit = (sectionId: string, newContent: string) => {
    onUpdateSections(sections.map(s =>
      s.id === sectionId ? { ...s, refinedContent: newContent } : s
    ));
  };

  const completedCount = sections.filter(s => s.refinedContent).length;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', margin: 0 }}>Sửa nội dung từng phần</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0, marginTop: 4 }}>
            Đã sửa <span style={{ color: '#34d399', fontWeight: 700 }}>{completedCount}/{sections.length}</span> phần
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

      {/* Tabs */}
      <div style={{ display: 'flex', overflowX: 'auto', gap: 4, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 2 }}>
        {sections.map(section => (
          <button
            key={section.id}
            onClick={() => setActiveTab(section.id)}
            className={`tab-btn ${activeTab === section.id ? 'active' : ''}`}
          >
            {section.title}
            {section.refinedContent && <Check size={12} style={{ marginLeft: 4, color: '#34d399', display: 'inline' }} />}
          </button>
        ))}
      </div>

      {/* Editor Area */}
      {activeSection && (
        <div style={{ display: 'grid', gridTemplateColumns: showSuggestions ? '1fr 1fr 320px' : '1fr 1fr', gap: 16, minHeight: 'calc(100vh - 380px)' }}>
          {/* Original Panel */}
          <div className="editor-panel">
            <div className="panel-header" style={{ color: '#94a3b8' }}>
              <span>📄 Nội dung Gốc</span>
            </div>
            <div className="panel-body" style={{ backgroundColor: 'rgba(0,0,0,0.15)' }}>
              <p style={{
                whiteSpace: 'pre-wrap', fontSize: 13, color: '#94a3b8', lineHeight: 1.8
              }}>
                {activeSection.originalContent || "(Không tìm thấy nội dung phần này)"}
              </p>
            </div>
          </div>

          {/* Refined Panel */}
          <div className="editor-panel" style={{ borderColor: 'rgba(99, 102, 241, 0.15)' }}>
            <div className="panel-header" style={{ color: '#a5b4fc', background: 'rgba(99, 102, 241, 0.05)' }}>
              <span>✨ Nội dung Đề xuất (AI)</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {activeSection.refinedContent && (
                  <button
                    onClick={() => onRefineSection(activeSection.id)}
                    className="btn-secondary btn-sm"
                    disabled={!!isProcessing}
                  >
                    <RefreshCw size={12} /> Viết lại
                  </button>
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
                  background: 'rgba(15, 14, 23, 0.85)', zIndex: 10
                }}>
                  <Loader2 size={32} color="#818cf8" className="animate-spin-slow" />
                  <span style={{ fontSize: 13, color: '#818cf8', fontWeight: 600, marginTop: 12 }}>
                    Đang viết lại theo đề tài mới...
                  </span>
                  <span style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
                    Giữ nguyên số liệu, đổi mới diễn đạt
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
                  alignItems: 'center', justifyContent: 'center', color: '#475569'
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
            <div className="editor-panel" style={{ borderColor: 'rgba(245, 158, 11, 0.15)' }}>
              <div className="panel-header" style={{ color: '#fbbf24', background: 'rgba(245, 158, 11, 0.05)' }}>
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
                    <Loader2 size={24} color="#fbbf24" className="animate-spin-slow" />
                    <span style={{ fontSize: 12, color: '#64748b' }}>Đang phân tích...</span>
                  </div>
                ) : activeSection.suggestions && activeSection.suggestions.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {activeSection.suggestions.map((sug, idx) => {
                      const typeInfo = SUGGESTION_TYPES[sug.type as keyof typeof SUGGESTION_TYPES] || SUGGESTION_TYPES.scientific;
                      const isExpanded = expandedSuggestion === sug.id;
                      return (
                        <div key={sug.id || idx} className="suggestion-card" style={{
                          borderColor: `${typeInfo.color}25`
                        }}>
                          <div
                            onClick={() => setExpandedSuggestion(isExpanded ? null : sug.id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                                background: `${typeInfo.color}15`, color: typeInfo.color,
                                border: `1px solid ${typeInfo.color}30`
                              }}>
                                {typeInfo.icon} {typeInfo.label}
                              </span>
                              {isExpanded ? <ChevronUp size={14} color="#64748b" /> : <ChevronDown size={14} color="#64748b" />}
                            </div>
                            <p style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1', margin: 0 }}>
                              {sug.label}
                            </p>
                          </div>

                          {isExpanded && (
                            <div style={{ marginTop: 10, fontSize: 11, lineHeight: 1.6 }}>
                              <p style={{ color: '#64748b', marginBottom: 8 }}>{sug.description}</p>
                              {sug.originalText && (
                                <div style={{
                                  padding: '8px 10px', borderRadius: 6, marginBottom: 6,
                                  background: 'rgba(244, 63, 94, 0.05)', borderLeft: '2px solid #fb7185'
                                }}>
                                  <p style={{ fontSize: 10, fontWeight: 600, color: '#fb7185', marginBottom: 2 }}>Gốc:</p>
                                  <p style={{ color: '#94a3b8', margin: 0 }}>"{sug.originalText}"</p>
                                </div>
                              )}
                              {sug.suggestedText && (
                                <div style={{
                                  padding: '8px 10px', borderRadius: 6,
                                  background: 'rgba(16, 185, 129, 0.05)', borderLeft: '2px solid #34d399'
                                }}>
                                  <p style={{ fontSize: 10, fontWeight: 600, color: '#34d399', marginBottom: 2 }}>Đề xuất:</p>
                                  <p style={{ color: '#cbd5e1', margin: 0 }}>"{sug.suggestedText}"</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* Refresh button */}
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
                    alignItems: 'center', justifyContent: 'center', color: '#475569', textAlign: 'center'
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
        paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)'
      }}>
        <button onClick={onFinish} className="btn-accent btn-lg">
          <FileDown size={18} />
          Hoàn tất & Xuất File
        </button>
      </div>
    </div>
  );
};

export default StepEditor;