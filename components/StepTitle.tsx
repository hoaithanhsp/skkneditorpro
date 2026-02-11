import React, { useState } from 'react';
import { TitleSuggestion } from '../types';
import { Sparkles, ArrowRight, Lightbulb, AlertCircle, Loader2, Trophy, Target, CheckCircle2 } from 'lucide-react';

interface StepTitleProps {
    currentTitle: string;
    suggestions: TitleSuggestion[];
    onSelectTitle: (title: TitleSuggestion) => void;
    isGenerating: boolean;
}

const StepTitle: React.FC<StepTitleProps> = ({ currentTitle, suggestions, onSelectTitle, isGenerating }) => {
    const [selectedId, setSelectedId] = useState<number | null>(suggestions.length > 0 ? suggestions[0].id : null);

    if (isGenerating) {
        return (
            <div className="animate-fade-in" style={{
                minHeight: 400, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 16
            }}>
                <div className="animate-pulse-glow" style={{
                    width: 80, height: 80, borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(245, 158, 11, 0.2))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <Sparkles size={36} color="#fbbf24" className="animate-spin-slow" />
                </div>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0' }}>Đang nghiên cứu đề tài mới...</h3>
                <p style={{ color: '#64748b', fontSize: 14, textAlign: 'center', maxWidth: 400 }}>
                    AI đang phân tích nội dung, tìm điểm độc đáo và áp dụng công thức đặt tên sáng tạo.
                </p>
            </div>
        );
    }

    const handleSelect = () => {
        const selected = suggestions.find(s => s.id === selectedId);
        if (selected) onSelectTitle(selected);
    };

    const selectedSuggestion = suggestions.find(s => s.id === selectedId);

    return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Current Title */}
            <div className="glass-card" style={{ padding: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    Tên đề tài hiện tại
                </p>
                <p style={{ fontSize: 17, fontWeight: 600, color: '#cbd5e1', lineHeight: 1.5 }}>"{currentTitle}"</p>
                <div style={{
                    marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '4px 12px', borderRadius: 999,
                    background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.15)',
                    color: '#fb7185', fontSize: 12
                }}>
                    <AlertCircle size={14} />
                    Tên đề tài khá phổ biến, cần tăng tính cụ thể và điểm mới.
                </div>
            </div>

            {/* Main layout: List + Detail */}
            <div style={{ display: 'grid', gridTemplateColumns: '5fr 7fr', gap: 20 }}>
                {/* Left: List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Lightbulb size={18} color="#fbbf24" />
                        5 Đề xuất Mới
                    </h3>
                    {suggestions.map((s, idx) => (
                        <div
                            key={s.id}
                            onClick={() => setSelectedId(s.id)}
                            className={`title-card ${selectedId === s.id ? 'selected' : ''}`}
                            style={{ opacity: 0, animation: `fadeInUp 0.4s ease-out ${idx * 100}ms forwards` }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {idx === 0 ? <Trophy size={14} color="#fbbf24" /> : <Target size={14} color="#64748b" />}
                                    <span className={`badge ${idx === 0 ? 'badge-warn' : 'badge-primary'}`}>
                                        #{s.id} {idx === 0 ? 'Khuyến nghị' : ''}
                                    </span>
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#818cf8' }}>{s.score}/10</span>
                            </div>
                            <p style={{ fontSize: 13, fontWeight: 500, color: '#cbd5e1', lineHeight: 1.5, margin: 0 }}>
                                {s.title}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Right: Detail */}
                <div>
                    {selectedSuggestion && (
                        <div className="glass-card" style={{ padding: 24, position: 'sticky', top: 100 }}>
                            <h3 style={{ fontSize: 20, fontWeight: 700, color: '#c7d2fe', lineHeight: 1.5, marginBottom: 20 }}>
                                "{selectedSuggestion.title}"
                            </h3>

                            {/* Novelty Points */}
                            <div style={{ marginBottom: 20 }}>
                                <h4 style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                                    ✨ Điểm mới & Sáng tạo
                                </h4>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {selectedSuggestion.noveltyPoints.map((point, i) => (
                                        <span key={i} style={{
                                            padding: '6px 12px', borderRadius: 8, fontSize: 12,
                                            background: 'rgba(99, 102, 241, 0.08)', color: '#a5b4fc',
                                            border: '1px solid rgba(99, 102, 241, 0.15)'
                                        }}>
                                            {point}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Stats */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
                                <div style={{
                                    padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)'
                                }}>
                                    <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Trùng lặp</p>
                                    <p style={{ fontSize: 24, fontWeight: 800, color: '#34d399', margin: 0 }}>{selectedSuggestion.overlapPercentage}%</p>
                                    <p style={{ fontSize: 11, color: '#475569', margin: 0 }}>Rất thấp (An toàn)</p>
                                </div>
                                <div style={{
                                    padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)'
                                }}>
                                    <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Tính khả thi</p>
                                    <p style={{ fontSize: 24, fontWeight: 800, color: '#e2e8f0', margin: 0 }}>{selectedSuggestion.feasibility}</p>
                                    <p style={{ fontSize: 11, color: '#475569', margin: 0 }}>Dễ thực hiện</p>
                                </div>
                            </div>

                            {/* Select Button */}
                            <button onClick={handleSelect} className="btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }}>
                                <Sparkles size={18} />
                                Chọn đề tài này & Bắt đầu Sửa nội dung
                                <ArrowRight size={18} />
                            </button>
                            <p style={{ textAlign: 'center', fontSize: 11, color: '#475569', marginTop: 10 }}>
                                Hệ thống sẽ gợi ý sửa các phần I→VI theo hướng đề tài mới.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StepTitle;