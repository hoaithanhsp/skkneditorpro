import React, { useState, useRef, useCallback } from 'react';
import { SectionContent, SectionEditSuggestion, UserRequirements, ReferenceDocument } from '../types';
import { Upload, Pencil, Plus, Trash2, BookOpen, Loader2, Search, Check, FileDown, RefreshCw, Eye, EyeOff, Replace, Minus, Zap, Square, CheckCircle2 } from 'lucide-react';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';
import * as geminiService from '../services/geminiService';
import mammoth from 'mammoth';

interface StepQuickEditProps {
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

const StepQuickEdit: React.FC<StepQuickEditProps> = ({ addToast }) => {
    // --- State ---
    const [sections, setSections] = useState<SectionContent[]>([]);
    const [activeTab, setActiveTab] = useState<string>('');
    const [userRequirements, setUserRequirements] = useState<UserRequirements>({
        pageLimit: null, referenceDocuments: [], customInstructions: ''
    });
    const [quickMeasureName, setQuickMeasureName] = useState('');
    const [loadingDeepAnalysis, setLoadingDeepAnalysis] = useState<string | null>(null);
    const [loadingRefine, setLoadingRefine] = useState<string | null>(null);
    const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);
    const [showDiff, setShowDiff] = useState(false);
    const [batchRunning, setBatchRunning] = useState(false);
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, label: '' });
    const batchAbortRef = useRef(false);

    const quickUploadRef = useRef<HTMLInputElement>(null);
    const quickRefDocRef = useRef<HTMLInputElement>(null);
    const sectionFileRef = useRef<HTMLInputElement>(null);

    const activeSection = sections.find(s => s.id === activeTab);

    // --- File reading helper ---
    const readFileContent = async (file: File): Promise<string> => {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'docx') {
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            return result.value;
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
            return fullText;
        } else {
            let content = await file.text();
            if (content.includes('<?xml') || content.includes('<w:')) {
                content = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            }
            return content;
        }
    };

    // --- Upload biện pháp files ---
    const handleUploadSections = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        const newSections: SectionContent[] = [];
        for (const file of (Array.from(files) as File[])) {
            try {
                const content = await readFileContent(file);
                if (content.trim()) {
                    const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
                    newSections.push({
                        id: `qe-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                        title: baseName, level: 1,
                        originalContent: content.trim(), refinedContent: '',
                        isProcessing: false, suggestions: [], editSuggestions: []
                    });
                }
            } catch (err) {
                addToast('error', `Lỗi đọc: ${file.name}`);
            }
        }
        if (newSections.length > 0) {
            setSections(prev => {
                const updated = [...prev, ...newSections];
                if (!activeTab) setActiveTab(newSections[0].id);
                return updated;
            });
            addToast('success', `Đã thêm ${newSections.length} biện pháp!`);
        }
        if (quickUploadRef.current) quickUploadRef.current.value = '';
    };

    // --- Thêm thủ công ---
    const handleAddManual = () => {
        if (!quickMeasureName.trim()) return;
        const newSec: SectionContent = {
            id: `qe-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            title: quickMeasureName.trim(), level: 1,
            originalContent: '', refinedContent: '',
            isProcessing: false, suggestions: [], editSuggestions: []
        };
        setSections(prev => [...prev, newSec]);
        if (!activeTab) setActiveTab(newSec.id);
        setQuickMeasureName('');
    };

    // --- Xoá section ---
    const handleRemoveSection = (id: string) => {
        setSections(prev => {
            const updated = prev.filter(s => s.id !== id);
            if (activeTab === id) setActiveTab(updated[0]?.id || '');
            return updated;
        });
    };

    // --- Upload nội dung cho 1 section ---
    const handleUploadSectionContent = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !activeTab) return;
        try {
            const content = await readFileContent(file);
            if (content.trim()) {
                setSections(prev => prev.map(s =>
                    s.id === activeTab ? { ...s, originalContent: content.trim(), editSuggestions: [] } : s
                ));
            }
        } catch (err) { addToast('error', `Lỗi đọc: ${file.name}`); }
        if (sectionFileRef.current) sectionFileRef.current.value = '';
    };

    // --- Upload tài liệu tham khảo ---
    const handleRefDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        for (const file of (Array.from(files) as File[])) {
            try {
                const content = await readFileContent(file);
                const isExercise = /bài tập|đề thi|đề kiểm tra|exercise|test|exam/i.test(file.name);
                const newDoc: ReferenceDocument = {
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
                    name: file.name, content: content.substring(0, 15000),
                    type: isExercise ? 'exercise' : 'document'
                };
                setUserRequirements(prev => ({
                    ...prev, referenceDocuments: [...prev.referenceDocuments, newDoc]
                }));
            } catch (err) { addToast('error', `Lỗi đọc: ${file.name}`); }
        }
        if (quickRefDocRef.current) quickRefDocRef.current.value = '';
    };

    const handleRemoveRefDoc = (docId: string) => {
        setUserRequirements(prev => ({
            ...prev, referenceDocuments: prev.referenceDocuments.filter(d => d.id !== docId)
        }));
    };

    // --- Deep analysis ---
    const handleDeepAnalysis = async (sectionId: string) => {
        const section = sections.find(s => s.id === sectionId);
        if (!section) return;
        const content = section.refinedContent || section.originalContent;
        if (!content) return;
        setLoadingDeepAnalysis(sectionId);
        try {
            const skknContext = { currentTitle: '', selectedTitle: '', allSectionTitles: sections.map(s => s.title), overallAnalysisSummary: '' };
            const editSuggestions = await geminiService.deepAnalyzeSection(section.title, content, skknContext, userRequirements);
            setSections(prev => prev.map(s => s.id === sectionId ? { ...s, editSuggestions } : s));
        } catch (err: any) {
            addToast('error', `Lỗi phân tích "${section.title}": ${err?.message || 'Không xác định'}`);
        }
        setLoadingDeepAnalysis(null);
    };

    // --- Refine with analysis ---
    const handleRefine = async (sectionId: string) => {
        const section = sections.find(s => s.id === sectionId);
        if (!section || !section.editSuggestions?.length) return;
        const content = section.refinedContent || section.originalContent;
        if (!content) return;
        setLoadingRefine(sectionId);
        try {
            const skknContext = { currentTitle: '', selectedTitle: '', allSectionTitles: sections.map(s => s.title), overallAnalysisSummary: '' };
            const refined = await geminiService.refineSectionWithAnalysis(section.title, content, '', section.editSuggestions, userRequirements, skknContext);
            setSections(prev => prev.map(s =>
                s.id === sectionId ? { ...s, refinedContent: refined, editSuggestions: s.editSuggestions.map(es => ({ ...es, applied: true })) } : s
            ));
        } catch (err: any) {
            addToast('error', `Lỗi sửa "${section.title}": ${err?.message || 'Không xác định'}`);
        }
        setLoadingRefine(null);
    };

    // --- Batch refine ---
    const handleBatchRefine = useCallback(async () => {
        const leafSections = sections.filter(s => s.originalContent?.trim());
        if (leafSections.length === 0) return;
        setBatchRunning(true);
        batchAbortRef.current = false;
        setBatchProgress({ current: 0, total: leafSections.length, label: '' });
        addToast('info', `Bắt đầu sửa ${leafSections.length} biện pháp...`);
        let updated = [...sections];
        let ok = 0;
        for (let i = 0; i < leafSections.length; i++) {
            if (batchAbortRef.current) { addToast('info', `Dừng sau ${ok}/${leafSections.length}.`); break; }
            const sec = leafSections[i];
            setBatchProgress({ current: i + 1, total: leafSections.length, label: sec.title.substring(0, 40) });
            if (sec.refinedContent) { ok++; continue; }
            try {
                const skknContext = { currentTitle: '', selectedTitle: '', allSectionTitles: sections.map(s => s.title), overallAnalysisSummary: '' };
                const editSuggestions = await geminiService.deepAnalyzeSection(sec.title, sec.originalContent, skknContext, userRequirements);
                const refined = await geminiService.refineSectionWithAnalysis(sec.title, sec.originalContent, '', editSuggestions, userRequirements, skknContext);
                updated = updated.map(s => s.id === sec.id ? { ...s, refinedContent: refined, editSuggestions: editSuggestions.map(es => ({ ...es, applied: true })) } : s);
                setSections(updated);
                ok++;
            } catch (err: any) {
                addToast('error', `Lỗi sửa "${sec.title}": ${err?.message?.substring(0, 80) || '?'}`);
            }
        }
        setBatchRunning(false);
        if (!batchAbortRef.current) addToast('success', `Hoàn thành! Đã sửa ${ok}/${leafSections.length} biện pháp.`);
    }, [sections, userRequirements, addToast]);

    // --- Download docx ---
    const handleDownload = async (section: SectionContent) => {
        const content = section.refinedContent || section.originalContent;
        const paragraphs: (Paragraph | Table)[] = [];
        paragraphs.push(new Paragraph({
            children: [new TextRun({ text: section.title, bold: true, size: 28, font: 'Times New Roman' })],
            heading: HeadingLevel.HEADING_1, spacing: { after: 200 }
        }));
        const lines = content.split('\n');
        let li = 0;
        while (li < lines.length) {
            const line = lines[li];
            if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
                const tableLines: string[] = [];
                while (li < lines.length && lines[li].trim().startsWith('|') && lines[li].trim().endsWith('|')) { tableLines.push(lines[li].trim()); li++; }
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
                                children: [new Paragraph({ children: [new TextRun({ text: cells[ci] || '', bold: ri === 0, size: 24, font: 'Times New Roman' })], spacing: { before: 40, after: 40 }, alignment: AlignmentType.CENTER })],
                                width: { size: Math.floor(9000 / colCount), type: WidthType.DXA }, borders
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
                    spacing: { after: 100 }, indent: { firstLine: 720 }
                }));
            }
            li++;
        }
        const doc = new Document({ sections: [{ children: paragraphs }] });
        const blob = await Packer.toBlob(doc);
        const safeName = section.title.replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF ]/g, '').trim().replace(/ +/g, '_');
        saveAs(blob, `${safeName}.docx`);
    };

    const completedCount = sections.filter(s => s.refinedContent).length;

    // ===================== SETUP SCREEN =====================
    if (sections.length === 0) {
        return (
            <div className="animate-fade-in" style={{ maxWidth: 680, margin: '0 auto', padding: '24px 0', display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Header */}
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: 16, margin: '0 auto 12px',
                        background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 0 #6d28d9, 0 8px 20px rgba(139, 92, 246, 0.25)'
                    }}>
                        <Pencil size={24} color="white" />
                    </div>
                    <h2 style={{ fontSize: 24, fontWeight: 800, color: '#1e1b4b', margin: 0 }}>Sửa từng biện pháp</h2>
                    <p style={{ color: '#64748b', fontSize: 13, marginTop: 6 }}>
                        Upload nội dung từng biện pháp → AI phân tích chuyên sâu → Gợi ý sửa → Tải về
                    </p>
                </div>

                {/* Upload biện pháp */}
                <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <label style={{ fontSize: 14, fontWeight: 700, color: '#6d28d9', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                        📄 Nội dung biện pháp
                        <span style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8' }}>Mỗi file = 1 biện pháp</span>
                    </label>
                    <div
                        onClick={() => quickUploadRef.current?.click()}
                        style={{ border: '2px dashed #c4b5fd', borderRadius: 12, padding: '28px 16px', textAlign: 'center', cursor: 'pointer', background: '#f5f3ff', transition: 'all 0.2s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#8b5cf6'; (e.currentTarget as HTMLElement).style.background = '#ede9fe'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#c4b5fd'; (e.currentTarget as HTMLElement).style.background = '#f5f3ff'; }}
                    >
                        <Upload size={28} color="#8b5cf6" style={{ marginBottom: 8, opacity: 0.7 }} />
                        <p style={{ fontSize: 14, fontWeight: 600, color: '#6d28d9', margin: 0 }}>Nhấn để chọn file biện pháp</p>
                        <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>.docx, .pdf, .txt — Chọn nhiều file cùng lúc</p>
                    </div>
                    <input ref={quickUploadRef} type="file" accept=".docx,.pdf,.txt" multiple style={{ display: 'none' }} onChange={handleUploadSections} />
                    <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                        <input type="text" placeholder="Hoặc nhập tên biện pháp thủ công..." value={quickMeasureName} onChange={e => setQuickMeasureName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddManual()}
                            style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none' }} />
                        <button onClick={handleAddManual} className="btn-secondary btn-sm" disabled={!quickMeasureName.trim()} style={{ fontSize: 12, gap: 4, padding: '8px 14px' }}>
                            <Plus size={14} /> Thêm
                        </button>
                    </div>
                </div>

                {/* Tài liệu TK */}
                <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <label style={{ fontSize: 14, fontWeight: 700, color: '#6d28d9', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                        📚 Tài liệu / Bài tập tham khảo
                        <span style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8' }}>AI sẽ bám sát nội dung</span>
                    </label>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                        <button onClick={() => quickRefDocRef.current?.click()} className="btn-secondary btn-sm" style={{ fontSize: 12, gap: 4 }}>
                            <Upload size={13} /> Upload tài liệu
                        </button>
                        <input ref={quickRefDocRef} type="file" accept=".docx,.pdf,.txt" multiple style={{ display: 'none' }} onChange={handleRefDocUpload} />
                    </div>
                    {userRequirements.referenceDocuments.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {userRequirements.referenceDocuments.map(doc => (
                                <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: doc.type === 'exercise' ? '#fffbeb' : '#f0f9ff', border: `1px solid ${doc.type === 'exercise' ? '#fde68a' : '#bae6fd'}`, fontSize: 12 }}>
                                    <BookOpen size={14} color={doc.type === 'exercise' ? '#92400e' : '#0284c7'} />
                                    <span style={{ flex: 1, fontWeight: 500, color: '#334155' }}>{doc.name}</span>
                                    <span style={{ color: '#94a3b8', fontSize: 10 }}>{(doc.content.length / 1000).toFixed(1)}k</span>
                                    <button onClick={() => handleRemoveRefDoc(doc.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2 }}><Trash2 size={13} color="#e11d48" /></button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', margin: 0 }}>Upload tài liệu để AI tham khảo (bài tập, đề thi, giáo án...)</p>
                    )}
                </div>

                {/* Yêu cầu */}
                <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <label style={{ fontSize: 14, fontWeight: 700, color: '#6d28d9', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>⚙️ Yêu cầu đặc biệt</label>
                    <textarea placeholder="VD: Lấy chính xác bài tập ở tài liệu tham khảo, viết chi tiết hơn, thêm ví dụ minh họa..." value={userRequirements.customInstructions} onChange={e => setUserRequirements(prev => ({ ...prev, customInstructions: e.target.value }))}
                        style={{ width: '100%', minHeight: 70, padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13, resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.6 }} />
                </div>

                <p style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', margin: 0 }}>
                    💡 Upload nội dung biện pháp phía trên, sau đó các biện pháp sẽ xuất hiện để bạn phân tích và sửa từng cái.
                </p>
            </div>
        );
    }

    // ===================== EDITOR SCREEN =====================
    const hasAnalysis = activeSection?.editSuggestions && activeSection.editSuggestions.length > 0;
    const isAnalyzing = loadingDeepAnalysis === activeSection?.id;
    const isRefining = loadingRefine === activeSection?.id;

    return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                    <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1e1b4b', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        🔧 Sửa từng biện pháp
                    </h2>
                    <p style={{ fontSize: 13, color: '#64748b', margin: 0, marginTop: 4 }}>
                        Đã sửa <span style={{ color: '#8b5cf6', fontWeight: 700 }}>{completedCount}/{sections.length}</span> biện pháp
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => { setSections([]); setActiveTab(''); }} className="btn-secondary btn-sm" style={{ fontSize: 11, gap: 4 }}>
                        + Thêm biện pháp
                    </button>
                    {!batchRunning ? (
                        <button onClick={handleBatchRefine} className="btn-primary btn-sm"
                            style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', border: 'none', fontSize: 12, fontWeight: 700, gap: 4, padding: '6px 14px', borderRadius: 8 }}>
                            <Zap size={13} /> AI Sửa Toàn Bộ
                        </button>
                    ) : (
                        <button onClick={() => { batchAbortRef.current = true; }} className="btn-secondary btn-sm" style={{ fontSize: 12, fontWeight: 600, gap: 4, color: '#dc2626', borderColor: '#fca5a5', padding: '6px 14px' }}>
                            <Square size={12} /> Dừng ({batchProgress.current}/{batchProgress.total})
                        </button>
                    )}
                </div>
            </div>

            {/* Batch progress */}
            {batchRunning && (
                <div style={{ background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', borderRadius: 8, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #c4b5fd' }}>
                    <Loader2 size={14} className="animate-spin" style={{ color: '#7c3aed' }} />
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#4c1d95' }}>Đang sửa {batchProgress.current}/{batchProgress.total}: {batchProgress.label}...</div>
                        <div className="progress-bar" style={{ height: 4, marginTop: 4 }}>
                            <div className="progress-bar-fill" style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%`, background: 'linear-gradient(90deg, #8b5cf6, #7c3aed)' }}></div>
                        </div>
                    </div>
                </div>
            )}

            {/* Progress */}
            <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${(completedCount / sections.length) * 100}%`, background: 'linear-gradient(90deg, #8b5cf6, #7c3aed)' }}></div>
            </div>

            {/* Section tabs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, borderBottom: '1px solid #e2e8f0', paddingBottom: 4, maxHeight: 200, overflowY: 'auto' }}>
                {sections.map(section => (
                    <div key={section.id} style={{ display: 'flex', alignItems: 'center' }}>
                        <button
                            onClick={() => setActiveTab(section.id)}
                            style={{
                                flex: 1, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6,
                                padding: '7px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                fontWeight: activeTab === section.id ? 700 : 500, fontSize: 13,
                                background: activeTab === section.id ? '#f5f3ff' : 'transparent',
                                borderLeft: activeTab === section.id ? '3px solid #8b5cf6' : '3px solid transparent',
                                color: activeTab === section.id ? '#6d28d9' : '#334155', transition: 'all 0.2s'
                            }}
                        >
                            <span>{section.title}</span>
                            {section.refinedContent && <Check size={12} style={{ color: '#8b5cf6', flexShrink: 0 }} />}
                        </button>
                        <button onClick={() => handleRemoveSection(section.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
                            <Trash2 size={12} color="#94a3b8" />
                        </button>
                    </div>
                ))}
            </div>

            {/* 3-Column Editor */}
            {activeSection && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, minHeight: 450 }}>

                    {/* COL 1: Nội dung & Tài liệu */}
                    <div className="editor-panel step-column" style={{ display: 'flex', flexDirection: 'column' }}>
                        <div className="step-header" style={{ background: '#f5f3ff', borderBottom: '2px solid #8b5cf6' }}>
                            <span className="step-badge" style={{ background: '#7c3aed', color: 'white' }}>1</span>
                            <span style={{ fontWeight: 700, color: '#4c1d95', fontSize: 13 }}>Nội dung & Tài liệu</span>
                        </div>
                        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}>
                            <div>
                                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                                    📄 Nội dung "{activeSection.title.substring(0, 30)}{activeSection.title.length > 30 ? '...' : ''}"
                                </label>
                                <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                                    <button className="btn-secondary btn-sm" onClick={() => sectionFileRef.current?.click()} style={{ fontSize: 10, gap: 3 }}>
                                        <Upload size={11} /> Upload .docx/.pdf
                                    </button>
                                    <input ref={sectionFileRef} type="file" accept=".txt,.md,.doc,.docx,.pdf" style={{ display: 'none' }} onChange={handleUploadSectionContent} />
                                </div>
                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, maxHeight: 150, overflow: 'auto', fontSize: 11, lineHeight: 1.7, color: '#64748b', whiteSpace: 'pre-wrap' }}>
                                    {activeSection.originalContent
                                        ? activeSection.originalContent.substring(0, 1000) + (activeSection.originalContent.length > 1000 ? '\n\n...(xem thêm)' : '')
                                        : '(Chưa có nội dung — upload file)'}
                                </div>
                            </div>
                            <hr style={{ border: 'none', borderTop: '1px dashed #e2e8f0', margin: '2px 0' }} />
                            {/* Ref docs */}
                            <div>
                                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>📚 Tài liệu TK</label>
                                {userRequirements.referenceDocuments.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        {userRequirements.referenceDocuments.map(doc => (
                                            <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 6, background: doc.type === 'exercise' ? '#fef3c7' : '#f0f9ff', border: `1px solid ${doc.type === 'exercise' ? '#fde68a' : '#bae6fd'}`, fontSize: 10 }}>
                                                <BookOpen size={12} color={doc.type === 'exercise' ? '#92400e' : '#0284c7'} />
                                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{doc.name}</span>
                                                <span style={{ color: '#94a3b8', fontSize: 9 }}>{(doc.content.length / 1000).toFixed(1)}k</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>Chưa có tài liệu.</p>}
                            </div>
                            <hr style={{ border: 'none', borderTop: '1px dashed #e2e8f0', margin: '2px 0' }} />
                            {/* Yêu cầu */}
                            <div>
                                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4, display: 'block' }}>⚙️ Yêu cầu</label>
                                <input type="text" placeholder="VD: Bám sát tài liệu TK..." value={userRequirements.customInstructions} onChange={e => setUserRequirements(prev => ({ ...prev, customInstructions: e.target.value }))}
                                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11, outline: 'none' }} />
                            </div>
                        </div>
                    </div>

                    {/* COL 2: Phân tích & Đề xuất */}
                    <div className="editor-panel step-column" style={{ display: 'flex', flexDirection: 'column' }}>
                        <div className="step-header" style={{ background: '#fffbeb', borderBottom: '2px solid #f59e0b' }}>
                            <span className="step-badge" style={{ background: '#d97706', color: 'white' }}>2</span>
                            <span style={{ fontWeight: 700, color: '#92400e', fontSize: 13 }}>Phân tích & Đề xuất sửa</span>
                        </div>
                        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
                            <button onClick={() => handleDeepAnalysis(activeSection.id)} className="btn-primary"
                                disabled={!!loadingDeepAnalysis || !activeSection.originalContent}
                                style={{ width: '100%', padding: '10px 16px', fontSize: 13, fontWeight: 700, background: !activeSection.originalContent ? '#e2e8f0' : 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', gap: 6 }}>
                                {isAnalyzing ? <><Loader2 size={14} className="animate-spin-slow" /> Đang phân tích...</> : <><Search size={14} /> Phân tích chuyên sâu</>}
                            </button>
                            {!activeSection.originalContent && <p style={{ fontSize: 10, color: '#f59e0b', textAlign: 'center', margin: 0 }}>⚠️ Upload nội dung ở Bước 1 trước</p>}

                            {isAnalyzing && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 12px', gap: 8, background: 'rgba(255,251,235,0.5)', borderRadius: 8 }}>
                                    <Loader2 size={28} className="animate-spin-slow" style={{ color: '#d97706' }} />
                                    <span style={{ fontSize: 12, color: '#92400e', fontWeight: 700 }}>Đang phân tích sâu...</span>
                                </div>
                            )}

                            {hasAnalysis && !isAnalyzing && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>📋 {activeSection.editSuggestions.length} đề xuất sửa</span>
                                        <button onClick={() => handleDeepAnalysis(activeSection.id)} className="btn-secondary btn-sm" style={{ fontSize: 9, padding: '2px 6px' }} disabled={!!loadingDeepAnalysis}>
                                            <RefreshCw size={9} /> Phân tích lại
                                        </button>
                                    </div>
                                    {activeSection.editSuggestions.map((sug, idx) => {
                                        const actionStyle = ACTION_STYLES[sug.action] || ACTION_STYLES.modify;
                                        const catInfo = CATEGORY_LABELS[sug.category] || CATEGORY_LABELS.content;
                                        const isExpanded = expandedSuggestion === sug.id;
                                        return (
                                            <div key={sug.id || idx} style={{ border: `1px solid ${sug.applied ? '#d1d5db' : actionStyle.border}`, borderRadius: 8, overflow: 'hidden', opacity: sug.applied ? 0.5 : 1 }}>
                                                <div onClick={() => setExpandedSuggestion(isExpanded ? null : sug.id)} style={{ padding: '7px 10px', cursor: 'pointer', background: sug.applied ? '#f9fafb' : actionStyle.bg }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                                                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: actionStyle.bg, color: actionStyle.color, border: `1px solid ${actionStyle.border}`, display: 'flex', alignItems: 'center', gap: 2 }}>
                                                            {actionStyle.icon} {actionStyle.label}
                                                        </span>
                                                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: '#f1f5f9', color: '#475569' }}>{catInfo.icon} {catInfo.label}</span>
                                                        {sug.applied && <CheckCircle2 size={10} color="#10b981" />}
                                                    </div>
                                                    <div style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>{sug.label}</div>
                                                </div>
                                                {isExpanded && (
                                                    <div style={{ padding: '8px 10px', borderTop: '1px solid #e2e8f0', background: '#fafbfc', fontSize: 10 }}>
                                                        <p style={{ color: '#64748b', lineHeight: 1.6, margin: '0 0 6px' }}>{sug.description}</p>
                                                        {sug.originalText && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: 6, marginBottom: 4, whiteSpace: 'pre-wrap', color: '#b91c1c' }}>
                                                            <strong style={{ fontSize: 9 }}>Gốc:</strong><br />{sug.originalText.substring(0, 300)}
                                                        </div>}
                                                        {sug.suggestedText && <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 4, padding: 6, whiteSpace: 'pre-wrap', color: '#065f46' }}>
                                                            <strong style={{ fontSize: 9 }}>Đề xuất:</strong><br />{sug.suggestedText.substring(0, 300)}
                                                        </div>}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {/* Nút sửa */}
                                    <button onClick={() => handleRefine(activeSection.id)}
                                        className="btn-primary"
                                        disabled={!!loadingRefine || activeSection.editSuggestions.every(s => s.applied)}
                                        style={{ width: '100%', padding: '10px 16px', fontSize: 13, fontWeight: 700, background: activeSection.editSuggestions.every(s => s.applied) ? '#e2e8f0' : 'linear-gradient(135deg, #8b5cf6, #7c3aed)', border: 'none', gap: 6, marginTop: 4 }}>
                                        {isRefining ? <><Loader2 size={14} className="animate-spin-slow" /> Đang sửa...</> : <><Pencil size={14} /> Áp dụng tất cả & Sửa</>}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* COL 3: Kết quả */}
                    <div className="editor-panel step-column" style={{ display: 'flex', flexDirection: 'column' }}>
                        <div className="step-header" style={{ background: '#ecfdf5', borderBottom: '2px solid #10b981' }}>
                            <span className="step-badge" style={{ background: '#059669', color: 'white' }}>3</span>
                            <span style={{ fontWeight: 700, color: '#065f46', fontSize: 13 }}>Kết quả đã sửa</span>
                        </div>
                        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
                            {activeSection.refinedContent ? (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: '#065f46', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <Check size={14} color="#10b981" /> Đã sửa xong
                                        </span>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <button onClick={() => setShowDiff(!showDiff)} className="btn-secondary btn-sm" style={{ fontSize: 9, padding: '2px 6px' }}>
                                                {showDiff ? <><EyeOff size={9} /> Ẩn so sánh</> : <><Eye size={9} /> So sánh</>}
                                            </button>
                                            <button onClick={() => handleDownload(activeSection)} className="btn-secondary btn-sm" style={{ fontSize: 9, padding: '2px 6px' }}>
                                                <FileDown size={9} /> Tải .docx
                                            </button>
                                        </div>
                                    </div>
                                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 10, maxHeight: 350, overflow: 'auto', fontSize: 11, lineHeight: 1.8, whiteSpace: 'pre-wrap', color: '#1e293b' }}>
                                        {activeSection.refinedContent}
                                    </div>
                                    {showDiff && activeSection.originalContent && (
                                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 10, maxHeight: 200, overflow: 'auto', fontSize: 10, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: '#991b1b', opacity: 0.7 }}>
                                            <strong>Bản gốc:</strong><br />{activeSection.originalContent.substring(0, 2000)}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#94a3b8', gap: 8 }}>
                                    <Pencil size={32} style={{ opacity: 0.2 }} />
                                    <p style={{ fontSize: 12, textAlign: 'center', margin: 0 }}>Chưa có kết quả sửa.<br />Phân tích ở Bước 2, sau đó bấm "Áp dụng & Sửa".</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StepQuickEdit;
