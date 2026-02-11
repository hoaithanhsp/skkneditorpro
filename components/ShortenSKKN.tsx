import React, { useRef, useState, useCallback } from 'react';
import { Upload, Scissors, FileDown, Loader2, AlertCircle, X, FileText, ArrowLeft } from 'lucide-react';
import mammoth from 'mammoth';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';
import * as geminiService from '../services/geminiService';

interface ShortenSKKNProps {
    onClose: () => void;
}

const ShortenSKKN: React.FC<ShortenSKKNProps> = ({ onClose }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [parseError, setParseError] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string>('');
    const [originalText, setOriginalText] = useState<string>('');
    const [targetPages, setTargetPages] = useState<number>(15);
    const [isProcessing, setIsProcessing] = useState(false);
    const [result, setResult] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    // --- Parse file (reuse logic from StepUpload) ---
    const parseFile = async (file: File) => {
        setParseError(null);
        setError(null);
        setResult('');
        const ext = file.name.split('.').pop()?.toLowerCase();

        try {
            if (ext === 'docx') {
                const arrayBuffer = await file.arrayBuffer();
                const res = await mammoth.extractRawText({ arrayBuffer });
                if (res.value.trim()) {
                    setOriginalText(res.value);
                    setFileName(file.name);
                } else {
                    setParseError('File .docx không có nội dung text.');
                }
            } else if (ext === 'pdf') {
                const pdfjsLib = await import('pdfjs-dist');
                pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let fullText = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    fullText += content.items.map((item: any) => item.str).join(' ') + '\n\n';
                }
                if (fullText.trim()) {
                    setOriginalText(fullText);
                    setFileName(file.name);
                } else {
                    setParseError('File .pdf không có nội dung text (có thể là file scan).');
                }
            } else if (ext === 'txt') {
                const text = await file.text();
                setOriginalText(text);
                setFileName(file.name);
            } else {
                setParseError(`Định dạng .${ext} chưa hỗ trợ. Vui lòng dùng .docx, .pdf hoặc .txt`);
            }
        } catch (err: any) {
            setParseError(`Lỗi đọc file: ${err.message || 'Không xác định'}`);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) parseFile(file);
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) parseFile(file);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    }, []);

    // --- Estimate original page count ---
    const estimatedOriginalPages = originalText ? Math.round(originalText.split(/\s+/).length / 350) : 0;

    // --- Run shortening ---
    const handleShorten = async () => {
        if (!originalText || targetPages < 1) return;
        if (!geminiService.getApiKey()) {
            setError('Chưa có API Key. Vui lòng cài đặt API Key trước.');
            return;
        }
        setIsProcessing(true);
        setError(null);
        setResult('');
        try {
            const shortened = await geminiService.shortenSKKN(originalText, targetPages);
            setResult(shortened);
        } catch (err: any) {
            setError(`Lỗi rút ngắn: ${err.message || 'Không xác định'}`);
        } finally {
            setIsProcessing(false);
        }
    };

    // --- Export DOCX ---
    const handleExportDocx = async () => {
        if (!result) return;
        try {
            const lines = result.split('\n');
            const docChildren: Paragraph[] = [];

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                // Detect heading patterns
                const isHeading1 = /^(#+\s|PHẦN\s+[IVXLC]+|CHƯƠNG\s+\d)/i.test(trimmed);
                const isHeading2 = /^(##\s|\d+\.\s|[a-z]\))/i.test(trimmed);

                const cleanText = trimmed.replace(/^#+\s*/, '');

                if (isHeading1) {
                    docChildren.push(new Paragraph({
                        children: [new TextRun({
                            text: cleanText, bold: true, size: 26, font: 'Times New Roman'
                        })],
                        heading: HeadingLevel.HEADING_1,
                        spacing: { before: 400, after: 200 }
                    }));
                } else if (isHeading2) {
                    docChildren.push(new Paragraph({
                        children: [new TextRun({
                            text: cleanText, bold: true, size: 24, font: 'Times New Roman'
                        })],
                        heading: HeadingLevel.HEADING_2,
                        spacing: { before: 200, after: 100 }
                    }));
                } else {
                    docChildren.push(new Paragraph({
                        children: [new TextRun({
                            text: cleanText, size: 26, font: 'Times New Roman'
                        })],
                        spacing: { after: 100 },
                        indent: { firstLine: 720 }
                    }));
                }
            }

            const doc = new Document({ sections: [{ children: docChildren }] });
            const blob = await Packer.toBlob(doc);
            const outName = `SKKN_RutNgan_${targetPages}trang_${fileName?.replace(/\.[^.]+$/, '') || 'document'}.docx`;
            saveAs(blob, outName);
        } catch (err) {
            console.error('Export error:', err);
            // Fallback to txt
            const blob = new Blob([result], { type: 'text/plain;charset=utf-8' });
            saveAs(blob, `SKKN_RutNgan_${targetPages}trang.txt`);
        }
    };

    // --- Processing state ---
    if (isProcessing) {
        return (
            <div className="shorten-panel animate-fade-in">
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    minHeight: '50vh', gap: 16
                }}>
                    <div className="animate-pulse-glow" style={{
                        width: 80, height: 80, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 0 #fbbf24, 0 8px 24px rgba(245, 158, 11, 0.2)'
                    }}>
                        <Scissors size={36} color="#d97706" className="animate-spin-slow" />
                    </div>
                    <h3 style={{ fontSize: 20, fontWeight: 700, color: '#92400e' }}>
                        Đang rút ngắn SKKN...
                    </h3>
                    <p style={{ color: '#64748b', fontSize: 14, textAlign: 'center', maxWidth: 420 }}>
                        AI đang phân tích cấu trúc và rút ngắn từ ~{estimatedOriginalPages} trang xuống {targetPages} trang,
                        giữ 80% nội dung giải pháp. Quá trình này có thể mất 1-3 phút.
                    </p>
                    <div className="progress-bar" style={{ width: 240, marginTop: 8 }}>
                        <div className="progress-bar-fill primary animate-shimmer" style={{ width: '45%' }}></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="shorten-panel animate-fade-in">
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 24, paddingBottom: 16,
                borderBottom: '1px solid rgba(245, 158, 11, 0.15)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={onClose} className="btn-secondary btn-sm" title="Quay lại">
                        <ArrowLeft size={16} />
                    </button>
                    <div style={{
                        width: 40, height: 40, borderRadius: 12,
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 3px 0 #b45309, 0 5px 12px rgba(217, 119, 6, 0.25)'
                    }}>
                        <Scissors size={20} color="white" />
                    </div>
                    <div>
                        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#92400e', margin: 0 }}>
                            Rút ngắn SKKN
                        </h2>
                        <p style={{ fontSize: 12, color: '#b45309', margin: 0 }}>
                            Rút ngắn theo số trang • Giữ 80% giải pháp • Giữ nguyên định dạng
                        </p>
                    </div>
                </div>
            </div>

            {/* Step 1: Upload (if no file loaded) */}
            {!originalText && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                    <div
                        className={`upload-zone ${isDragOver ? 'drag-over' : ''}`}
                        onClick={() => fileInputRef.current?.click()}
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        style={{ width: '100%', maxWidth: 560, borderColor: '#f59e0b' }}
                    >
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".docx,.pdf,.txt" style={{ display: 'none' }} />
                        <div style={{ position: 'relative', zIndex: 1 }}>
                            <Upload size={40} color="#f59e0b" style={{ marginBottom: 16, opacity: 0.7 }} />
                            <p style={{ fontSize: 16, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>
                                Tải lên SKKN cần rút ngắn
                            </p>
                            <p style={{ fontSize: 13, color: '#94a3b8' }}>
                                .docx, .pdf, .txt — Tối đa 10MB
                            </p>
                        </div>
                    </div>

                    {parseError && (
                        <div style={{
                            padding: '12px 20px', borderRadius: 12,
                            background: '#fff1f2', border: '1px solid #fecdd3',
                            color: '#e11d48', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
                            maxWidth: 560, width: '100%'
                        }}>
                            <AlertCircle size={16} />
                            {parseError}
                        </div>
                    )}
                </div>
            )}

            {/* Step 2: Configure & Run */}
            {originalText && !result && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* File info */}
                    <div className="card" style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '16px 20px', background: '#fffbeb', border: '1px solid #fde68a'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <FileText size={20} color="#d97706" />
                            <div>
                                <div style={{ fontWeight: 600, color: '#92400e', fontSize: 14 }}>{fileName}</div>
                                <div style={{ fontSize: 12, color: '#b45309' }}>
                                    ~{estimatedOriginalPages} trang • {originalText.split(/\s+/).length.toLocaleString()} từ
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => { setOriginalText(''); setFileName(''); setResult(''); }}
                            className="btn-secondary btn-sm"
                            title="Đổi file"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {/* Target pages input */}
                    <div className="card" style={{ padding: '20px 24px' }}>
                        <label style={{ display: 'block', fontWeight: 700, color: '#1e293b', marginBottom: 12, fontSize: 15 }}>
                            ✂️ Số trang mục tiêu
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <input
                                type="number"
                                value={targetPages}
                                onChange={e => setTargetPages(Math.max(1, parseInt(e.target.value) || 1))}
                                min={1}
                                max={200}
                                className="page-input"
                                style={{
                                    width: 100, padding: '10px 14px', borderRadius: 10,
                                    border: '2px solid #fde68a', fontSize: 18, fontWeight: 700,
                                    textAlign: 'center', color: '#92400e',
                                    background: '#fffbeb', outline: 'none',
                                    transition: 'border-color 0.2s'
                                }}
                            />
                            <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
                                <div>trang (~{(targetPages * 350).toLocaleString()} từ)</div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                    Giảm {estimatedOriginalPages > 0 ? Math.round((1 - targetPages / estimatedOriginalPages) * 100) : 0}% so với bản gốc
                                </div>
                            </div>
                        </div>

                        {/* Distribution preview */}
                        <div style={{
                            marginTop: 16, padding: '12px 16px', borderRadius: 10,
                            background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.12)'
                        }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 8 }}>
                                📊 Phân bổ nội dung:
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                <div style={{
                                    flex: 1, height: 8, borderRadius: 4,
                                    background: 'linear-gradient(90deg, #60a5fa, #3b82f6)'
                                }}></div>
                                <div style={{
                                    flex: 8, height: 8, borderRadius: 4,
                                    background: 'linear-gradient(90deg, #f59e0b, #d97706)'
                                }}></div>
                                <div style={{
                                    flex: 1, height: 8, borderRadius: 4,
                                    background: 'linear-gradient(90deg, #34d399, #10b981)'
                                }}></div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b' }}>
                                <span>🔵 Mở đầu (10%)</span>
                                <span>🟡 Giải pháp (80%)</span>
                                <span>🟢 Kết luận (10%)</span>
                            </div>
                        </div>
                    </div>

                    {/* Error */}
                    {error && (
                        <div style={{
                            padding: '12px 20px', borderRadius: 12,
                            background: '#fff1f2', border: '1px solid #fecdd3',
                            color: '#e11d48', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8
                        }}>
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}

                    {/* Action button */}
                    <button
                        onClick={handleShorten}
                        disabled={!originalText || targetPages < 1}
                        className="btn-primary"
                        style={{
                            padding: '14px 32px', fontSize: 16, fontWeight: 700,
                            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                            boxShadow: '0 4px 0 #b45309, 0 6px 16px rgba(217, 119, 6, 0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            width: '100%', maxWidth: 400, margin: '0 auto'
                        }}
                    >
                        <Scissors size={18} />
                        Rút ngắn xuống {targetPages} trang
                    </button>
                </div>
            )}

            {/* Step 3: Result */}
            {result && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Stats bar */}
                    <div className="card" style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '14px 20px', background: '#f0fdf4', border: '1px solid #bbf7d0',
                        flexWrap: 'wrap', gap: 12
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 20 }}>✅</span>
                            <div>
                                <div style={{ fontWeight: 700, color: '#166534', fontSize: 14 }}>
                                    Rút ngắn thành công!
                                </div>
                                <div style={{ fontSize: 12, color: '#15803d' }}>
                                    ~{Math.round(result.split(/\s+/).length / 350)} trang • {result.split(/\s+/).length.toLocaleString()} từ
                                    (gốc: ~{estimatedOriginalPages} trang)
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={handleExportDocx} className="btn-primary" style={{
                                padding: '8px 16px', fontSize: 13,
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                boxShadow: '0 3px 0 #047857, 0 4px 12px rgba(5, 150, 105, 0.25)'
                            }}>
                                <FileDown size={14} /> Tải DOCX
                            </button>
                            <button
                                onClick={() => { setResult(''); }}
                                className="btn-secondary btn-sm"
                                title="Thử lại với số trang khác"
                            >
                                Thử lại
                            </button>
                        </div>
                    </div>

                    {/* Preview */}
                    <div className="card shorten-result" style={{
                        maxHeight: '60vh', overflow: 'auto', padding: '24px 28px',
                        fontSize: 14, lineHeight: 1.8, color: '#1e293b',
                        whiteSpace: 'pre-wrap', fontFamily: "'Times New Roman', serif"
                    }}>
                        {result}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ShortenSKKN;
