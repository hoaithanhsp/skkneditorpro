import React, { useState } from 'react';
import { Key, ExternalLink, Zap, Crown, X } from 'lucide-react';
import { AI_MODELS, AIModelId } from '../types';
import { getApiKey, setApiKey, getSelectedModel, setSelectedModel } from '../services/geminiService';

interface ApiKeyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    canClose?: boolean; // false = must enter key (first time)
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
                            width: 40, height: 40, borderRadius: 12,
                            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Key size={20} color="white" />
                        </div>
                        <div>
                            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Cài đặt API Key</h2>
                            <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Cần thiết để sử dụng AI phân tích</p>
                        </div>
                    </div>
                    {canClose && (
                        <button onClick={onClose} style={{
                            background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4
                        }}>
                            <X size={20} />
                        </button>
                    )}
                </div>

                {/* API Key Input */}
                <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>
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
                        <p style={{ color: '#f43f5e', fontSize: 12, marginTop: 6 }}>{error}</p>
                    )}
                    <a
                        href="https://aistudio.google.com/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            color: '#818cf8', fontSize: 12, marginTop: 8, textDecoration: 'none'
                        }}
                    >
                        <ExternalLink size={12} />
                        Lấy API key miễn phí từ Google AI Studio
                    </a>
                </div>

                {/* Model Selection */}
                <div style={{ marginBottom: 24 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 10 }}>
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
                                    borderRadius: 12,
                                    cursor: 'pointer',
                                    transition: 'all 0.25s',
                                    background: selectedModelId === model.id ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${selectedModelId === model.id ? 'rgba(99, 102, 241, 0.4)' : 'rgba(255,255,255,0.08)'}`,
                                    boxShadow: selectedModelId === model.id ? '0 0 12px rgba(99, 102, 241, 0.2)' : 'none'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                    {model.id.includes('pro') ? <Crown size={14} color="#f59e0b" /> : <Zap size={14} color="#10b981" />}
                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{model.name}</span>
                                </div>
                                <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>{model.desc}</p>
                                {model.default && (
                                    <span style={{
                                        display: 'inline-block', marginTop: 6,
                                        fontSize: 10, fontWeight: 600,
                                        padding: '2px 8px', borderRadius: 999,
                                        background: 'rgba(16, 185, 129, 0.15)',
                                        color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.2)'
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
