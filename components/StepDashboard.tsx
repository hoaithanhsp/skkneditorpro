import React from 'react';
import { SectionContent, AnalysisMetrics } from '../types';
import { ArrowRight, CheckCircle2, AlertTriangle, XCircle, Lightbulb, ChevronRight } from 'lucide-react';

interface StepDashboardProps {
    sections: SectionContent[];
    analysis: AnalysisMetrics;
    currentTitle: string;
    onContinue: () => void;
}

const StepDashboard: React.FC<StepDashboardProps> = ({ sections, analysis, currentTitle, onContinue }) => {
    const getStatusInfo = (sectionId: string) => {
        const feedback = analysis.sectionFeedback?.find(f => f.sectionId === sectionId);
        const section = sections.find(s => s.id === sectionId);
        if (!section || !section.originalContent) {
            return { status: 'missing' as const, color: '#f43f5e', label: 'Thiếu' };
        }
        if (!feedback) {
            return { status: 'needs_work' as const, color: '#f59e0b', label: 'Cần xem xét' };
        }
        switch (feedback.status) {
            case 'good': return { status: 'good' as const, color: '#10b981', label: 'Tốt' };
            case 'needs_work': return { status: 'needs_work' as const, color: '#f59e0b', label: 'Cần sửa' };
            case 'missing': return { status: 'missing' as const, color: '#f43f5e', label: 'Thiếu' };
            default: return { status: 'needs_work' as const, color: '#f59e0b', label: 'Cần sửa' };
        }
    };

    const parentSections = sections.filter(s => s.level === 1);
    const childSections = (parentId: string) => sections.filter(s => s.parentId === parentId);

    // Summary counts
    const statusCounts = { good: 0, needs_work: 0, missing: 0 };
    sections.forEach(s => {
        const info = getStatusInfo(s.id);
        statusCounts[info.status]++;
    });

    return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
                <h2 style={{ fontSize: 24, fontWeight: 800, color: '#134e4a', marginBottom: 8 }}>Tổng quan các phần SKKN</h2>
                <p style={{ color: '#64748b', fontSize: 14, maxWidth: 600, margin: '0 auto' }}>
                    Đề tài: <span style={{ color: '#0d9488', fontWeight: 600 }}>"{currentTitle}"</span>
                </p>
                <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
                    AI đã tìm thấy <strong style={{ color: '#0d9488' }}>{sections.length}</strong> mục/mục con
                </p>
            </div>

            {/* Summary Bar */}
            <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
                {[
                    { key: 'good', label: 'Tốt', color: '#10b981', bg: '#ecfdf5', count: statusCounts.good },
                    { key: 'needs_work', label: 'Cần sửa', color: '#f59e0b', bg: '#fffbeb', count: statusCounts.needs_work },
                    { key: 'missing', label: 'Thiếu', color: '#f43f5e', bg: '#fff1f2', count: statusCounts.missing },
                ].map(item => (
                    <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: 8,
                            background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 16, fontWeight: 700, color: item.color,
                            boxShadow: '0 2px 0 rgba(0,0,0,0.04)'
                        }}>
                            {item.count}
                        </div>
                        <span style={{ fontSize: 13, color: '#64748b' }}>{item.label}</span>
                    </div>
                ))}
            </div>

            {/* Section Cards (hierarchical) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {parentSections.map((parent, idx) => {
                    const statusInfo = getStatusInfo(parent.id);
                    const feedback = analysis.sectionFeedback?.find(f => f.sectionId === parent.id);
                    const children = childSections(parent.id);

                    return (
                        <div
                            key={parent.id}
                            style={{ opacity: 0, animation: `fadeInUp 0.5s ease-out ${idx * 80}ms forwards` }}
                        >
                            {/* Parent Card */}
                            <div className={`section-card status-${statusInfo.status}`}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <h4 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>{parent.title}</h4>
                                    <span className={`badge ${statusInfo.status === 'good' ? 'badge-accent' : statusInfo.status === 'needs_work' ? 'badge-warn' : 'badge-danger'}`}>
                                        {statusInfo.label}
                                    </span>
                                </div>

                                {feedback && (
                                    <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6, marginBottom: 8 }}>
                                        {feedback.summary}
                                    </p>
                                )}

                                {parent.originalContent && (
                                    <div style={{
                                        padding: '8px 12px', borderRadius: 8,
                                        background: '#f8fafc', fontSize: 11, color: '#94a3b8',
                                        lineHeight: 1.5, maxHeight: 50, overflow: 'hidden',
                                        fontFamily: 'var(--font-mono)'
                                    }}>
                                        {parent.originalContent.substring(0, 120)}...
                                    </div>
                                )}

                                {feedback && feedback.suggestions && feedback.suggestions.length > 0 && (
                                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        {feedback.suggestions.slice(0, 2).map((sug, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: '#0d9488' }}>
                                                <Lightbulb size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                                                <span>{sug}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {children.length > 0 && (
                                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                                        <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>
                                            {children.length} mục con:
                                        </p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {children.map(child => {
                                                const childStatus = getStatusInfo(child.id);
                                                return (
                                                    <div key={child.id} style={{
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                        padding: '8px 12px', borderRadius: 8,
                                                        background: '#fafffe', border: `1px solid ${childStatus.color}15`,
                                                        borderLeft: `3px solid ${childStatus.color}`
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                                                            <ChevronRight size={12} color="#94a3b8" />
                                                            <span style={{ fontSize: 12, fontWeight: 500, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {child.title}
                                                            </span>
                                                        </div>
                                                        <span style={{
                                                            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                                                            background: `${childStatus.color}10`, color: childStatus.color
                                                        }}>
                                                            {childStatus.label}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                {/* If no hierarchy, show flat */}
                {parentSections.length === 0 && sections.map((section, idx) => {
                    const statusInfo = getStatusInfo(section.id);
                    return (
                        <div
                            key={section.id}
                            className={`section-card status-${statusInfo.status}`}
                            style={{ opacity: 0, animation: `fadeInUp 0.5s ease-out ${idx * 80}ms forwards` }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <h4 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>{section.title}</h4>
                                <span className={`badge ${statusInfo.status === 'good' ? 'badge-accent' : 'badge-warn'}`}>
                                    {statusInfo.label}
                                </span>
                            </div>
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
