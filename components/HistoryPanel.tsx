import React from 'react';
import { HistoryEntry } from '../types';
import * as historyService from '../services/historyService';
import { Clock, FileText, Trash2, X, Download, ArrowRight } from 'lucide-react';

interface HistoryPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onLoad: (entry: HistoryEntry) => void;
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({ isOpen, onClose, onLoad }) => {
    const [sessions, setSessions] = React.useState<HistoryEntry[]>([]);

    React.useEffect(() => {
        if (isOpen) {
            setSessions(historyService.getSessions());
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        historyService.deleteSession(id);
        setSessions(historyService.getSessions());
    };

    const handleClearAll = () => {
        historyService.clearAllSessions();
        setSessions([]);
    };

    const formatDate = (ts: number) => {
        const d = new Date(ts);
        return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
            ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    };

    const stepNames = ['Tải lên', 'Phân tích', 'Tổng quan', 'Tên đề tài', 'Sửa nội dung'];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: 12,
                            background: 'linear-gradient(135deg, #14b8a6, #0d9488)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 3px 0 #0f766e'
                        }}>
                            <Clock size={20} color="white" />
                        </div>
                        <div>
                            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#134e4a', margin: 0 }}>Lịch sử SKKN</h2>
                            <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>{sessions.length} bản ghi gần nhất</p>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}>
                        <X size={20} />
                    </button>
                </div>

                {/* List */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {sessions.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                            <FileText size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                            <p style={{ fontSize: 14 }}>Chưa có lịch sử nào</p>
                            <p style={{ fontSize: 12 }}>Các SKKN đã phân tích sẽ xuất hiện ở đây</p>
                        </div>
                    ) : (
                        sessions.map((entry, idx) => (
                            <div
                                key={entry.id}
                                onClick={() => { onLoad(entry); onClose(); }}
                                style={{
                                    padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                                    background: 'white', border: '1px solid #e2e8f0',
                                    boxShadow: '0 2px 0 rgba(0,0,0,0.03)',
                                    transition: 'all 0.2s',
                                    opacity: 0, animation: `fadeInUp 0.3s ease-out ${idx * 60}ms forwards`
                                }}
                                onMouseEnter={e => {
                                    (e.currentTarget as HTMLElement).style.borderColor = '#99f6e4';
                                    (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(20,184,166,0.1)';
                                    (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                                }}
                                onMouseLeave={e => {
                                    (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0';
                                    (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 0 rgba(0,0,0,0.03)';
                                    (e.currentTarget as HTMLElement).style.transform = '';
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        {/* File name */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                            <FileText size={14} color="#0d9488" />
                                            <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {entry.fileName}
                                            </span>
                                        </div>

                                        {/* Title */}
                                        <p style={{ fontSize: 12, color: '#475569', margin: '0 0 8px', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {entry.selectedNewTitle || entry.currentTitle}
                                        </p>

                                        {/* Meta */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: 11, color: '#94a3b8' }}>
                                                {formatDate(entry.timestamp)}
                                            </span>
                                            <span className="badge badge-primary" style={{ fontSize: 10 }}>
                                                {stepNames[entry.maxReachedStep] || 'Tải lên'}
                                            </span>
                                            <span style={{ fontSize: 11, color: '#64748b' }}>
                                                {entry.completedCount}/{entry.sectionsCount} phần đã sửa
                                            </span>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
                                        <button
                                            onClick={(e) => handleDelete(entry.id, e)}
                                            style={{
                                                background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8,
                                                color: '#94a3b8', transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f43f5e'; (e.currentTarget as HTMLElement).style.background = '#fff1f2'; }}
                                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#94a3b8'; (e.currentTarget as HTMLElement).style.background = 'none'; }}
                                            title="Xoá"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                        <div style={{ color: '#0d9488', display: 'flex', alignItems: 'center', padding: 6 }}>
                                            <ArrowRight size={14} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                {sessions.length > 0 && (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
                        <button onClick={handleClearAll} className="btn-secondary btn-sm" style={{ color: '#f43f5e' }}>
                            <Trash2 size={12} />
                            Xoá tất cả lịch sử
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default HistoryPanel;
