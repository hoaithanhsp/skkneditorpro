import React, { useState, useRef } from 'react';
import { UserRequirements, ReferenceDocument } from '../types';
import { ChevronDown, ChevronUp, Upload, FileText, Trash2, BookOpen, Settings2 } from 'lucide-react';

interface UserRequirementsPanelProps {
    requirements: UserRequirements;
    onUpdate: (requirements: UserRequirements) => void;
}

const UserRequirementsPanel: React.FC<UserRequirementsPanelProps> = ({ requirements, onUpdate }) => {
    const [collapsed, setCollapsed] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handlePageLimitChange = (val: string) => {
        const num = parseInt(val);
        onUpdate({ ...requirements, pageLimit: isNaN(num) ? null : num });
    };

    const handleCustomInstructionsChange = (val: string) => {
        onUpdate({ ...requirements, customInstructions: val });
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        for (const file of Array.from(files)) {
            try {
                let content = '';
                const ext = file.name.split('.').pop()?.toLowerCase();

                if (ext === 'txt' || ext === 'md') {
                    content = await file.text();
                } else if (ext === 'pdf') {
                    // Basic PDF text extraction via FileReader
                    content = await file.text();
                    // If it's binary PDF, show a note
                    if (content.includes('%PDF')) {
                        content = `[File PDF: ${file.name} - Vui lòng dán nội dung text từ file PDF vào ô bên dưới]`;
                    }
                } else {
                    // For docx and other formats, read as text (basic)
                    content = await file.text();
                    // Clean up XML tags if docx
                    if (content.includes('<?xml') || content.includes('<w:')) {
                        content = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                    }
                }

                const isExercise = /bài tập|đề thi|đề kiểm tra|exercise|test|exam/i.test(file.name);

                const newDoc: ReferenceDocument = {
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
                    name: file.name,
                    content: content.substring(0, 15000), // Limit content size
                    type: isExercise ? 'exercise' : 'document'
                };

                onUpdate({
                    ...requirements,
                    referenceDocuments: [...requirements.referenceDocuments, newDoc]
                });
            } catch (err) {
                console.error('Error reading file:', err);
            }
        }

        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handlePasteDocument = () => {
        const content = prompt('Dán nội dung tài liệu tham khảo vào đây:');
        if (!content || !content.trim()) return;

        const name = prompt('Nhập tên tài liệu:') || 'Tài liệu tham khảo';
        const isExercise = confirm('Đây có phải là bài tập / đề thi không?\n\nOK = Bài tập/Đề thi\nCancel = Tài liệu thường');

        const newDoc: ReferenceDocument = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
            name,
            content: content.substring(0, 15000),
            type: isExercise ? 'exercise' : 'document'
        };

        onUpdate({
            ...requirements,
            referenceDocuments: [...requirements.referenceDocuments, newDoc]
        });
    };

    const handleRemoveDoc = (docId: string) => {
        onUpdate({
            ...requirements,
            referenceDocuments: requirements.referenceDocuments.filter(d => d.id !== docId)
        });
    };

    const handleToggleDocType = (docId: string) => {
        onUpdate({
            ...requirements,
            referenceDocuments: requirements.referenceDocuments.map(d =>
                d.id === docId ? { ...d, type: d.type === 'exercise' ? 'document' : 'exercise' } : d
            )
        });
    };

    const refDocCount = requirements.referenceDocuments.length;

    return (
        <div className="requirements-panel" style={{
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            background: 'white',
            overflow: 'hidden',
            transition: 'all 0.3s ease'
        }}>
            {/* Header - always visible */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', border: 'none', cursor: 'pointer',
                    background: collapsed ? 'white' : '#f8fafc',
                    transition: 'background 0.2s'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Settings2 size={16} color="#0d9488" />
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#134e4a' }}>
                        Yêu cầu người dùng
                    </span>
                    {requirements.pageLimit && (
                        <span style={{
                            fontSize: 10, padding: '2px 8px', borderRadius: 999,
                            background: '#f0fdfa', color: '#0d9488', border: '1px solid #ccfbf1'
                        }}>
                            {requirements.pageLimit} trang
                        </span>
                    )}
                    {refDocCount > 0 && (
                        <span style={{
                            fontSize: 10, padding: '2px 8px', borderRadius: 999,
                            background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe'
                        }}>
                            {refDocCount} tài liệu TK
                        </span>
                    )}
                </div>
                {collapsed ? <ChevronDown size={16} color="#94a3b8" /> : <ChevronUp size={16} color="#94a3b8" />}
            </button>

            {/* Body - collapsible */}
            {!collapsed && (
                <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Row 1: Page limit + custom instructions */}
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <div style={{ flex: '0 0 180px' }}>
                            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                                📄 Giới hạn số trang
                            </label>
                            <input
                                type="number"
                                min="1"
                                max="100"
                                placeholder="Không giới hạn"
                                value={requirements.pageLimit || ''}
                                onChange={e => handlePageLimitChange(e.target.value)}
                                style={{
                                    width: '100%', padding: '8px 12px', borderRadius: 8,
                                    border: '1px solid #e2e8f0', fontSize: 13,
                                    outline: 'none', transition: 'border 0.2s'
                                }}
                            />
                            {requirements.pageLimit && (
                                <span style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, display: 'block' }}>
                                    ≈ {requirements.pageLimit * 350} từ tổng
                                </span>
                            )}
                        </div>

                        <div style={{ flex: 1, minWidth: 200 }}>
                            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                                📝 Yêu cầu đặc biệt
                            </label>
                            <input
                                type="text"
                                placeholder="Ghi chú thêm cho AI (tùy chọn)..."
                                value={requirements.customInstructions}
                                onChange={e => handleCustomInstructionsChange(e.target.value)}
                                style={{
                                    width: '100%', padding: '8px 12px', borderRadius: 8,
                                    border: '1px solid #e2e8f0', fontSize: 13,
                                    outline: 'none', transition: 'border 0.2s'
                                }}
                            />
                        </div>
                    </div>

                    {/* Row 2: Reference documents */}
                    <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 8 }}>
                            📚 Tài liệu tham khảo / Bài tập
                            <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 6 }}>
                                (AI sẽ lấy ví dụ chính xác từ tài liệu này)
                            </span>
                        </label>

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                            <button
                                className="btn-secondary btn-sm"
                                onClick={() => fileInputRef.current?.click()}
                                style={{ gap: 4 }}
                            >
                                <Upload size={12} /> Upload file
                            </button>
                            <button
                                className="btn-secondary btn-sm"
                                onClick={handlePasteDocument}
                                style={{ gap: 4 }}
                            >
                                <FileText size={12} /> Dán nội dung
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".txt,.md,.doc,.docx,.pdf"
                                multiple
                                style={{ display: 'none' }}
                                onChange={handleFileUpload}
                            />
                        </div>

                        {/* Document list */}
                        {requirements.referenceDocuments.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {requirements.referenceDocuments.map(doc => (
                                    <div key={doc.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        padding: '6px 10px', borderRadius: 8,
                                        background: doc.type === 'exercise' ? '#fef3c7' : '#f0f9ff',
                                        border: `1px solid ${doc.type === 'exercise' ? '#fde68a' : '#bae6fd'}`
                                    }}>
                                        <BookOpen size={14} color={doc.type === 'exercise' ? '#92400e' : '#0284c7'} />
                                        <span style={{ fontSize: 12, fontWeight: 500, color: '#334155', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {doc.name}
                                        </span>
                                        <button
                                            onClick={() => handleToggleDocType(doc.id)}
                                            style={{
                                                fontSize: 9, padding: '2px 6px', borderRadius: 4, border: '1px solid',
                                                cursor: 'pointer', background: 'white',
                                                borderColor: doc.type === 'exercise' ? '#f59e0b' : '#38bdf8',
                                                color: doc.type === 'exercise' ? '#92400e' : '#0284c7'
                                            }}
                                            title="Chuyển loại tài liệu"
                                        >
                                            {doc.type === 'exercise' ? '📝 Bài tập' : '📄 Tài liệu'}
                                        </button>
                                        <span style={{ fontSize: 10, color: '#94a3b8' }}>
                                            {(doc.content.length / 1000).toFixed(1)}k ký tự
                                        </span>
                                        <button
                                            onClick={() => handleRemoveDoc(doc.id)}
                                            style={{
                                                border: 'none', background: 'none', cursor: 'pointer',
                                                padding: 2, borderRadius: 4, display: 'flex'
                                            }}
                                            title="Xóa"
                                        >
                                            <Trash2 size={12} color="#e11d48" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {requirements.referenceDocuments.length === 0 && (
                            <p style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', margin: 0 }}>
                                Chưa có tài liệu tham khảo. Upload hoặc dán nội dung để AI lấy ví dụ minh họa chính xác.
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserRequirementsPanel;
