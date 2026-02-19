import React, { useRef, useState, useCallback } from 'react';
import { Upload, FileText, Sparkles, FileUp, AlertCircle, Loader2 } from 'lucide-react';
import { SAMPLE_SKKN_TEXT } from '../constants';
import mammoth from 'mammoth';

interface StepUploadProps {
  onUpload: (text: string, fileName: string) => void;
  isProcessing: boolean;
  progress?: number;
  stage?: string;
}

const StepUpload: React.FC<StepUploadProps> = ({ onUpload, isProcessing, progress = 0, stage = '' }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const parseFile = async (file: File) => {
    setParseError(null);
    const ext = file.name.split('.').pop()?.toLowerCase();

    try {
      if (ext === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        if (result.value.trim()) {
          onUpload(result.value, file.name);
        } else {
          setParseError('File .docx không có nội dung text. Vui lòng kiểm tra lại.');
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
          const pageText = content.items
            .map((item: any) => item.str)
            .join(' ');
          fullText += pageText + '\n\n';
        }

        if (fullText.trim()) {
          onUpload(fullText, file.name);
        } else {
          setParseError('File .pdf không có nội dung text (có thể là file scan/ảnh). Vui lòng dùng file .docx.');
        }
      } else if (ext === 'txt') {
        const text = await file.text();
        onUpload(text, file.name);
      } else {
        setParseError(`Định dạng .${ext} chưa được hỗ trợ. Vui lòng dùng .docx, .pdf hoặc .txt`);
      }
    } catch (error: any) {
      console.error('Parse error:', error);
      setParseError(`Lỗi đọc file: ${error.message || 'Không xác định'}`);
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

  const handleUseSample = () => {
    onUpload(SAMPLE_SKKN_TEXT, "SKKN_Mau_GeoGebra.txt");
  };

  if (isProcessing) {
    const pct = Math.min(progress, 100);
    return (
      <div className="animate-fade-in" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '60vh', gap: 16
      }}>
        {/* Circular progress */}
        <div style={{
          position: 'relative', width: 100, height: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="6" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="url(#progressGrad)" strokeWidth="6"
              strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 42}`}
              strokeDashoffset={`${2 * Math.PI * 42 * (1 - pct / 100)}`}
              style={{ transition: 'stroke-dashoffset 0.6s ease' }}
            />
            <defs>
              <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#14b8a6" />
                <stop offset="100%" stopColor="#0d9488" />
              </linearGradient>
            </defs>
          </svg>
          <span style={{
            position: 'absolute', fontSize: 22, fontWeight: 800, color: '#0d9488',
            fontVariantNumeric: 'tabular-nums'
          }}>
            {pct}%
          </span>
        </div>

        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#134e4a', margin: 0 }}>
          Đang phân tích tài liệu...
        </h3>
        <p style={{ color: '#0d9488', fontSize: 14, fontWeight: 600, margin: 0 }}>
          {stage || 'Đang xử lý...'}
        </p>
        <div className="progress-bar" style={{ width: 280, marginTop: 4 }}>
          <div className="progress-bar-fill primary" style={{
            width: `${pct}%`, transition: 'width 0.6s ease'
          }}></div>
        </div>
        <p style={{ color: '#94a3b8', fontSize: 11, margin: 0 }}>
          Quá trình phân tích gồm: đánh giá chất lượng → tách cấu trúc → xác nhận
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', padding: 24
    }}>
      {/* Hero Icon */}
      <div className="animate-float" style={{
        width: 72, height: 72, borderRadius: 20,
        background: 'linear-gradient(135deg, #14b8a6, #0d9488)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24,
        boxShadow: '0 6px 0 #0f766e, 0 10px 30px rgba(13, 148, 136, 0.3)'
      }}>
        <FileUp size={32} color="white" />
      </div>

      <h2 style={{ fontSize: 28, fontWeight: 800, color: '#134e4a', marginBottom: 8, textAlign: 'center' }}>
        Tải lên SKKN của bạn
      </h2>
      <p style={{ color: '#64748b', textAlign: 'center', marginBottom: 32, maxWidth: 480, fontSize: 14, lineHeight: 1.6 }}>
        Hỗ trợ file <strong style={{ color: '#0d9488' }}>.docx</strong>, <strong style={{ color: '#0d9488' }}>.pdf</strong> và <strong style={{ color: '#0d9488' }}>.txt</strong>.
        AI sẽ tự động phân tích cấu trúc, đánh giá chất lượng và gợi ý cải thiện.
      </p>

      {/* Upload Zone */}
      <div
        className={`upload-zone ${isDragOver ? 'drag-over' : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        style={{ width: '100%', maxWidth: 560 }}
      >
        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".docx,.pdf,.txt" style={{ display: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <Upload size={40} color="#14b8a6" style={{ marginBottom: 16, opacity: 0.7 }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: '#0f766e', marginBottom: 6 }}>
            Nhấn để chọn file hoặc kéo thả vào đây
          </p>
          <p style={{ fontSize: 13, color: '#94a3b8' }}>
            .docx, .pdf, .txt — Tối đa 10MB
          </p>
        </div>
      </div>

      {/* Error */}
      {parseError && (
        <div style={{
          marginTop: 16, padding: '12px 20px', borderRadius: 12,
          background: '#fff1f2', border: '1px solid #fecdd3',
          color: '#e11d48', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
          maxWidth: 560, width: '100%', boxShadow: '0 2px 8px rgba(244, 63, 94, 0.08)'
        }}>
          <AlertCircle size={16} />
          {parseError}
        </div>
      )}

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0' }}>
        <div style={{ width: 48, height: 2, background: '#e2e8f0', borderRadius: 1 }}></div>
        <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>HOẶC</span>
        <div style={{ width: 48, height: 2, background: '#e2e8f0', borderRadius: 1 }}></div>
      </div>

      {/* Sample Button */}
      <button onClick={handleUseSample} className="btn-secondary">
        <Sparkles size={16} />
        Dùng mẫu thử có sẵn
      </button>
    </div>
  );
};

export default StepUpload;