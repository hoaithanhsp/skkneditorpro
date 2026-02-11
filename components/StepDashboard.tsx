import React, { useState } from 'react';
import { SectionContent, AnalysisMetrics } from '../types';
import { ArrowRight, CheckCircle2, AlertTriangle, XCircle, Lightbulb, ChevronRight, ChevronDown } from 'lucide-react';

interface StepDashboardProps {
    sections: SectionContent[];
    analysis: AnalysisMetrics;
    currentTitle: string;
    onContinue: () => void;
}

const StepDashboard: React.FC<StepDashboardProps> = ({ sections, analysis, currentTitle, onContinue }) => {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    // Smart feedback matching: try sectionId first, then fuzzy match on title keywords
    const findFeedback = (section: SectionContent) => {
        // Exact id match
        let fb = analysis.sectionFeedback?.find(f => f.sectionId === section.id);
        if (fb) return fb;

        // Fuzzy match: check if section title contains any feedback sectionId keywords
        const titleLower = section.title.toLowerCase();
        fb = analysis.sectionFeedback?.find(f => {
            const fbLower = f.sectionId.toLowerCase();
            // Match by common SKKN keywords
            return titleLower.includes(fbLower) || fbLower.includes(titleLower.replace(/^\d+[\.\)]\s*/, ''));
        });
        if (fb) return fb;

        // Match by position keywords
        const keywordMap: Record<string, string[]> = {
            'đặt vấn đề': ['intro', 'dat_van_de', 'mở đầu', 'đặt vấn đề', 'lý do chọn'],
            'cơ sở lý luận': ['theory', 'ly_luan', 'cơ sở lý luận', 'cơ sở'],
            'thực trạng': ['reality', 'thuc_trang', 'thực trạng', 'thực tiễn'],
            'giải pháp': ['solution', 'giai_phap', 'giải pháp', 'biện pháp', 'nội dung'],
            'kết quả': ['result', 'ket_qua', 'kết quả', 'hiệu quả'],
            'kết luận': ['conclusion', 'ket_luan', 'kết luận', 'kiến nghị'],
            'phương pháp': ['method', 'phuong_phap', 'phương pháp nghiên cứu'],
            'tổng quan': ['overview', 'tong_quan', 'tổng quan'],
        };

        for (const [keyword, aliases] of Object.entries(keywordMap)) {
            if (titleLower.includes(keyword) || aliases.some(a => titleLower.includes(a))) {
                fb = analysis.sectionFeedback?.find(f => {
                    const fLower = f.sectionId.toLowerCase();
                    return aliases.some(a => fLower.includes(a)) || fLower.includes(keyword);
                });
                if (fb) return fb;
            }
        }

        return null;
    };

    const getStatusInfo = (section: SectionContent) => {
        const feedback = findFeedback(section);
        const hasContent = section.originalContent && section.originalContent.trim().length > 0;

        if (!hasContent) {
            return {
                status: 'missing' as const, color: '#f43f5e', label: 'Thiếu nội dung',
                detail: 'Phần này không tìm thấy nội dung trong văn bản gốc. Cần bổ sung.',
                suggestions: ['Bổ sung nội dung cho phần này theo cấu trúc SKKN chuẩn'],
                icon: <XCircle size={16} color="#f43f5e" />
            };
        }

        if (feedback) {
            switch (feedback.status) {
                case 'good': return {
                    status: 'good' as const, color: '#10b981', label: 'Tốt',
                    detail: feedback.summary,
                    suggestions: feedback.suggestions || [],
                    icon: <CheckCircle2 size={16} color="#10b981" />
                };
                case 'needs_work': return {
                    status: 'needs_work' as const, color: '#f59e0b', label: 'Cần sửa',
                    detail: feedback.summary,
                    suggestions: feedback.suggestions || [],
                    icon: <AlertTriangle size={16} color="#f59e0b" />
                };
                case 'missing': return {
                    status: 'missing' as const, color: '#f43f5e', label: 'Thiếu',
                    detail: feedback.summary,
                    suggestions: feedback.suggestions || [],
                    icon: <XCircle size={16} color="#f43f5e" />
                };
            }
        }

        // Fallback when no feedback matched — still give useful info
        const contentLen = section.originalContent?.length || 0;
        if (contentLen < 100) {
            return {
                status: 'needs_work' as const, color: '#f59e0b', label: 'Quá ngắn',
                detail: `Phần "${section.title}" chỉ có ${contentLen} ký tự, rất ngắn so với yêu cầu SKKN.`,
                suggestions: ['Bổ sung thêm nội dung, viện dẫn lý thuyết, số liệu minh chứng'],
                icon: <AlertTriangle size={16} color="#f59e0b" />
            };
        }

        return {
            status: 'needs_work' as const, color: '#f59e0b', label: 'Cần xem xét',
            detail: `Phần "${section.title}" cần được kiểm tra: ngôn ngữ khoa học, tính mới, tính logic, và giảm sáo rỗng.`,
            suggestions: [
                'Kiểm tra ngôn ngữ học thuật và tính khoa học',
                'Bổ sung viện dẫn lý thuyết và tác giả cụ thể',
                'Loại bỏ câu sáo rỗng, diễn đạt chung chung'
            ],
            icon: <AlertTriangle size={16} color="#f59e0b" />
        };
    };

    // Multi-level support
    const getLevel = (s: SectionContent) => s.level || 1;
    const getParentId = (s: SectionContent) => s.parentId || '';
    const getChildren = (parentId: string) => sections.filter(s => getParentId(s) === parentId);
    const rootSections = sections.filter(s => getLevel(s) === 1 || getParentId(s) === '');

    // Summary counts
    const statusCounts = { good: 0, needs_work: 0, missing: 0 };
    sections.forEach(s => {
        const info = getStatusInfo(s);
        statusCounts[info.status]++;
    });

    // Render section card recursively
    const renderSection = (section: SectionContent, depth: number = 0) => {
        const statusInfo = getStatusInfo(section);
        const children = getChildren(section.id);
        const isExpanded = expandedIds.has(section.id);
        const indent = depth * 8;

        return (
            <div key={section.id} style={{ marginLeft: indent }}>
                <div
                    className={depth === 0 ? `section-card status-${statusInfo.status}` : ''}
                    style={depth > 0 ? {
                        padding: '10px 14px', borderRadius: 8, marginBottom: 6,
                        background: '#fafffe', border: `1px solid ${statusInfo.color}20`,
                        borderLeft: `3px solid ${statusInfo.color}`
                    } : {}}
                >
                    {/* Header */}
                    <div
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                        onClick={() => toggleExpand(section.id)}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                            {children.length > 0 ? (
                                isExpanded ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />
                            ) : (
                                statusInfo.icon
                            )}
                            <h4 style={{
                                fontSize: depth === 0 ? 15 : 13, fontWeight: depth === 0 ? 700 : 600,
                                color: '#1e293b', margin: 0,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                            }}>
                                {section.title}
                            </h4>
                        </div>
                        <span className={`badge ${statusInfo.status === 'good' ? 'badge-accent' : statusInfo.status === 'needs_work' ? 'badge-warn' : 'badge-danger'}`}
                            style={{ flexShrink: 0 }}
                        >
                            {statusInfo.label}
                        </span>
                    </div>

                    {/* Detail — always visible for root, toggle for children */}
                    {(depth === 0 || isExpanded) && (
                        <div style={{ marginTop: 8 }}>
                            {/* Summary text */}
                            <p style={{
                                fontSize: 12, color: '#475569', lineHeight: 1.6, margin: 0, marginBottom: 8,
                                padding: '6px 10px', borderRadius: 6,
                                background: statusInfo.status === 'good' ? '#f0fdf4' : statusInfo.status === 'missing' ? '#fef2f2' : '#fffbeb',
                                borderLeft: `2px solid ${statusInfo.color}`
                            }}>
                                {statusInfo.detail}
                            </p>

                            {/* Suggestions */}
                            {statusInfo.suggestions.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {statusInfo.suggestions.map((sug, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11 }}>
                                            <Lightbulb size={12} color="#0d9488" style={{ flexShrink: 0, marginTop: 2 }} />
                                            <span style={{ color: '#0d9488' }}>{sug}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Preview of original content */}
                            {section.originalContent && depth === 0 && (
                                <div style={{
                                    marginTop: 8, padding: '6px 10px', borderRadius: 6,
                                    background: '#f8fafc', fontSize: 11, color: '#94a3b8',
                                    lineHeight: 1.5, maxHeight: 45, overflow: 'hidden',
                                    fontFamily: 'var(--font-mono)'
                                }}>
                                    {section.originalContent.substring(0, 150)}...
                                </div>
                            )}
                        </div>
                    )}

                    {/* Children */}
                    {children.length > 0 && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>
                                {children.length} mục con:
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {children.map(child => renderSection(child, depth + 1))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

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

            {/* Section Cards (multi-level recursive) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {rootSections.map((section, idx) => (
                    <div
                        key={section.id}
                        style={{ opacity: 0, animation: `fadeInUp 0.5s ease-out ${idx * 80}ms forwards` }}
                    >
                        {renderSection(section, 0)}
                    </div>
                ))}
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
