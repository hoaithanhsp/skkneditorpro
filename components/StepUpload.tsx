import React, { useRef, useState, useCallback } from 'react';
import { Upload, FileText, Sparkles, FileUp, AlertCircle, Loader2 } from 'lucide-react';
import { SAMPLE_SKKN_TEXT } from '../constants';
import mammoth from 'mammoth';

interface StepUploadProps {
  onUpload: (text: string, fileName: string) => void;
  isProcessing: boolean;
}

const StepUpload: React.FC<StepUploadProps> = ({ onUpload, isProcessing }) => {
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
        // Dynamic import pdfjs-dist
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
    return (
      <div className="animate-fade-in" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '60vh', gap: 16
      }}>
        <div className="animate-pulse-glow" style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(124, 58, 237, 0.2))',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Loader2 size={36} color="#818cf8" className="animate-spin-slow" />
        </div>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0' }}>Đang phân tích tài liệu...</h3>
        <p style={{ color: '#64748b', fontSize: 14, textAlign: 'center', maxWidth: 400 }}>
          AI đang đọc và đánh giá chi tiết cấu trúc, chất lượng, và nguy cơ đạo văn của SKKN.
        </p>
        <div className="progress-bar" style={{ width: 240, marginTop: 8 }}>
          <div className="progress-bar-fill primary animate-shimmer" style={{ width: '60%' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', padding: 24
    }}>
      {/* Hero Section */}
      <div className="animate-float" style={{
        width: 72, height: 72, borderRadius: 20,
        background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24, boxShadow: '0 8px 32px rgba(79, 70, 229, 0.4)'
      }}>
        <FileUp size={32} color="white" />
      </div>

      <h2 style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9', marginBottom: 8, textAlign: 'center' }}>
        Tải lên SKKN của bạn
      </h2>
      <p style={{ color: '#64748b', textAlign: 'center', marginBottom: 32, maxWidth: 480, fontSize: 14, lineHeight: 1.6 }}>
        Hỗ trợ file <strong style={{ color: '#818cf8' }}>.docx</strong>, <strong style={{ color: '#818cf8' }}>.pdf</strong> và <strong style={{ color: '#818cf8' }}>.txt</strong>.
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
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".docx,.pdf,.txt"
          style={{ display: 'none' }}
        />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <Upload size={40} color="#6366f1" style={{ marginBottom: 16, opacity: 0.7 }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: '#c7d2fe', marginBottom: 6 }}>
            Nhấn để chọn file hoặc kéo thả vào đây
          </p>
          <p style={{ fontSize: 13, color: '#64748b' }}>
            .docx, .pdf, .txt — Tối đa 10MB
          </p>
        </div>
      </div>

      {/* Error */}
      {parseError && (
        <div style={{
          marginTop: 16, padding: '12px 20px', borderRadius: 10,
          background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.2)',
          color: '#fb7185', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
          maxWidth: 560, width: '100%'
        }}>
          <AlertCircle size={16} />
          {parseError}
        </div>
      )}

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0' }}>
        <div style={{ width: 48, height: 1, background: 'rgba(255,255,255,0.08)' }}></div>
        <span style={{ fontSize: 12, color: '#475569', fontWeight: 500 }}>HOẶC</span>
        <div style={{ width: 48, height: 1, background: 'rgba(255,255,255,0.08)' }}></div>
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