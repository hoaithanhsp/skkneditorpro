import React, { useState } from 'react';
import { Key, ExternalLink, Zap, Crown, X } from 'lucide-react';
import { AI_MODELS, AIModelId } from '../types';
import { getApiKey, setApiKey, getSelectedModel, setSelectedModel } from '../services/geminiService';

interface ApiKeyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    canClose?: boolean;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onSave, canClose = true }) => {
    const [key, setKey] = useState(getApiKey() || '');
    const [selectedModelId, setSelectedModelId] = useState<AIModelId>(getSelectedModel());
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSave = () => {
        if (!key.trim()) {
            setError('Vui lòng nhập API key');
            return;
        }
        if (!key.startsWith('AI') || key.length < 30) {
            setError('API key không hợp lệ. Key phải bắt đầu bằng "AI" và có độ dài >= 30 ký tự.');
            return;
        }
        setApiKey(key.trim());
        setSelectedModel(selectedModelId);
        setError('');
        onSave();
    };

    return (
        <div className="modal-overlay" onClick={canClose ? onClose : undefined}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 44, height: 44, borderRadius: 14,
                            background: 'linear-gradient(135deg, #14b8a6, #0d9488)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 4px 0 #0f766e, 0 6px 16px rgba(13, 148, 136, 0.25)'
                        }}>
                            <Key size={22} color="white" />
                        </div>
                        <div>
                            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#134e4a', margin: 0 }}>Cài đặt API Key</h2>
                            <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Cần thiết để sử dụng AI phân tích</p>
                        </div>
                    </div>
                    {canClose && (
                        <button onClick={onClose} style={{
                            background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4
                        }}>
                            <X size={20} />
                        </button>
                    )}
                </div>

                {/* API Key Input */}
                <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 8 }}>
                        Google AI API Key
                    </label>
                    <input
                        type="password"
                        value={key}
                        onChange={e => { setKey(e.target.value); setError(''); }}
                        placeholder="AIzaSy..."
                        className="input-field"
                        style={{ fontFamily: 'monospace' }}
                    />
                    {error && (
                        <p style={{ color: '#e11d48', fontSize: 12, marginTop: 6 }}>{error}</p>
                    )}
                    <a
                        href="https://aistudio.google.com/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            color: '#0d9488', fontSize: 12, marginTop: 8, textDecoration: 'none', fontWeight: 600
                        }}
                    >
                        <ExternalLink size={12} />
                        Lấy API key miễn phí từ Google AI Studio
                    </a>
                </div>

                {/* Model Selection */}
                <div style={{ marginBottom: 24 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 10 }}>
                        Chọn Model AI
                    </label>
                    <div style={{ display: 'flex', gap: 10 }}>
                        {AI_MODELS.map(model => (
                            <div
                                key={model.id}
                                onClick={() => setSelectedModelId(model.id)}
                                style={{
                                    flex: 1,
                                    padding: '14px 16px',
                                    borderRadius: 14,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    background: selectedModelId === model.id ? '#f0fdfa' : '#f8fafc',
                                    border: `2px solid ${selectedModelId === model.id ? '#14b8a6' : '#e2e8f0'}`,
                                    borderBottom: selectedModelId === model.id ? '4px solid #0d9488' : '4px solid #e2e8f0',
                                    boxShadow: selectedModelId === model.id ? '0 2px 8px rgba(20, 184, 166, 0.15)' : 'none'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                    {model.id.includes('pro') ? <Crown size={14} color="#f59e0b" /> : <Zap size={14} color="#14b8a6" />}
                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{model.name}</span>
                                </div>
                                <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>{model.desc}</p>
                                {model.default && (
                                    <span style={{
                                        display: 'inline-block', marginTop: 6,
                                        fontSize: 10, fontWeight: 700,
                                        padding: '2px 8px', borderRadius: 999,
                                        background: '#ecfdf5', color: '#047857',
                                        border: '1px solid #a7f3d0'
                                    }}>
                                        Mặc định
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Save Button */}
                <button onClick={handleSave} className="btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }}>
                    <Key size={18} />
                    Lưu cài đặt
                </button>
            </div>
        </div>
    );
};

export default ApiKeyModal;
