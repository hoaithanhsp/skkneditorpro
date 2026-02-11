import React from 'react';
import { SectionContent, AnalysisMetrics } from '../types';
import { SKKN_SECTIONS } from '../constants';
import { ArrowRight, CheckCircle2, AlertTriangle, XCircle, Lightbulb } from 'lucide-react';

interface StepDashboardProps {
    sections: SectionContent[];
    analysis: AnalysisMetrics;
    currentTitle: string;
    onContinue: () => void;
}

const StepDashboard: React.FC<StepDashboardProps> = ({ sections, analysis, currentTitle, onContinue }) => {
    const getStatusInfo = (sectionId: string) => {
        const feedback = analysis.sectionFeedback?.find(f => f.sectionId === sectionId);
        if (!feedback) {
            const section = sections.find(s => s.id === sectionId);
            if (!section || !section.originalContent) return { status: 'missing' as const, icon: <XCircle size={18} color="#fb7185" />, color: '#fb7185', label: 'Thiếu' };
            return { status: 'needs_work' as const, icon: <AlertTriangle size={18} color="#fbbf24" />, color: '#fbbf24', label: 'Cần sửa' };
        }
        switch (feedback.status) {
            case 'good': return { status: 'good' as const, icon: <CheckCircle2 size={18} color="#34d399" />, color: '#34d399', label: 'Tốt' };
            case 'needs_work': return { status: 'needs_work' as const, icon: <AlertTriangle size={18} color="#fbbf24" />, color: '#fbbf24', label: 'Cần sửa' };
            case 'missing': return { status: 'missing' as const, icon: <XCircle size={18} color="#fb7185" />, color: '#fb7185', label: 'Thiếu' };
            default: return { status: 'needs_work' as const, icon: <AlertTriangle size={18} color="#fbbf24" />, color: '#fbbf24', label: 'Cần sửa' };
        }
    };

    return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
                <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f1f5f9', marginBottom: 8 }}>Tổng quan các phần SKKN</h2>
                <p style={{ color: '#64748b', fontSize: 14, maxWidth: 600, margin: '0 auto' }}>
                    Đề tài: <span style={{ color: '#a5b4fc', fontWeight: 600 }}>"{currentTitle}"</span>
                </p>
            </div>

            {/* Summary Bar */}
            <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
                {['good', 'needs_work', 'missing'].map(status => {
                    const count = SKKN_SECTIONS.filter(s => getStatusInfo(s.id).status === status).length;
                    const config = status === 'good'
                        ? { label: 'Tốt', color: '#34d399', bg: 'rgba(52, 211, 153, 0.1)' }
                        : status === 'needs_work'
                            ? { label: 'Cần sửa', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.1)' }
                            : { label: 'Thiếu', color: '#fb7185', bg: 'rgba(251, 113, 133, 0.1)' };
                    return (
                        <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                                width: 32, height: 32, borderRadius: 8,
                                background: config.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 16, fontWeight: 700, color: config.color
                            }}>
                                {count}
                            </div>
                            <span style={{ fontSize: 13, color: '#94a3b8' }}>{config.label}</span>
                        </div>
                    );
                })}
            </div>

            {/* Section Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {SKKN_SECTIONS.map((sectionDef, idx) => {
                    const statusInfo = getStatusInfo(sectionDef.id);
                    const feedback = analysis.sectionFeedback?.find(f => f.sectionId === sectionDef.id);
                    const section = sections.find(s => s.id === sectionDef.id);
                    const hasContent = section && section.originalContent;

                    return (
                        <div
                            key={sectionDef.id}
                            className={`section-card status-${statusInfo.status}`}
                            style={{ animationDelay: `${idx * 80}ms`, opacity: 0, animation: `fadeInUp 0.5s ease-out ${idx * 80}ms forwards` }}
                        >
                            {/* Card Header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontSize: 20 }}>{sectionDef.icon}</span>
                                    <h4 style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>{sectionDef.name}</h4>
                                </div>
                                <span className={`badge ${statusInfo.status === 'good' ? 'badge-accent' : statusInfo.status === 'needs_work' ? 'badge-warn' : 'badge-danger'}`}>
                                    {statusInfo.label}
                                </span>
                            </div>

                            {/* Summary */}
                            {feedback && (
                                <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, marginBottom: 12 }}>
                                    {feedback.summary}
                                </p>
                            )}

                            {/* Content Preview */}
                            {hasContent && (
                                <div style={{
                                    padding: '8px 12px', borderRadius: 8,
                                    background: 'rgba(255, 255, 255, 0.02)', fontSize: 11, color: '#64748b',
                                    lineHeight: 1.5, maxHeight: 60, overflow: 'hidden',
                                    fontFamily: 'var(--font-mono)'
                                }}>
                                    {section.originalContent.substring(0, 150)}...
                                </div>
                            )}

                            {/* Suggestions */}
                            {feedback && feedback.suggestions && feedback.suggestions.length > 0 && (
                                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {feedback.suggestions.slice(0, 2).map((sug, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: '#a5b4fc' }}>
                                            <Lightbulb size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                                            <span>{sug}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Continue Button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}>
                <button onClick={onContinue} className="btn-primary btn-lg">
                    Tiếp tục: Đề xuất Tên Đề Tài Mới
                    <ArrowRight size={18} />
                </button>
            </div>
        </div>
    );
};

export default StepDashboard;
