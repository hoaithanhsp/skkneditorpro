import React, { useState } from 'react';
import { Key, ExternalLink, Zap, Crown, X, Check } from 'lucide-react';
import { AI_MODELS, AIModelId } from '../types';
import { getApiKey, setApiKey, getSelectedModel, setSelectedModel } from '../services/geminiService';

// Danh sách API Key có sẵn (đọc từ biến môi trường)
const PRESET_API_KEYS: string[] = (process.env.VITE_GEMINI_API_KEYS || '')
    .split(',')
    .map(k => k.trim())
    .filter(k => k.length > 0);

// Hàm ẩn API key: hiện 8 ký tự đầu + dấu chấm + 4 ký tự cuối
const maskApiKey = (key: string): string => {
    if (key.length <= 12) return '••••••••••••';
    return key.substring(0, 8) + '••••••••••••••••••••' + key.substring(key.length - 4);
};

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

    const handleSelectPresetKey = (presetKey: string) => {
        setKey(presetKey);
        setError('');
    };

    const handleSave = () => {
        if (!key.trim()) {
            setError('Vui lòng nhập hoặc chọn API key');
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

                {/* Chọn API Key có sẵn - chỉ hiện khi có keys trong env */}
                {PRESET_API_KEYS.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 8 }}>
                            🔑 Chọn API Key có sẵn
                        </label>
                        <div style={{
                            maxHeight: 180, overflowY: 'auto',
                            border: '1px solid #e2e8f0', borderRadius: 12,
                            padding: 6, background: '#f8fafc'
                        }}>
                            {PRESET_API_KEYS.map((presetKey, index) => {
                                const isSelected = key === presetKey;
                                return (
                                    <div
                                        key={index}
                                        onClick={() => handleSelectPresetKey(presetKey)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            padding: '8px 12px', borderRadius: 8,
                                            cursor: 'pointer', transition: 'all 0.15s',
                                            background: isSelected ? '#f0fdfa' : 'transparent',
                                            border: isSelected ? '1.5px solid #14b8a6' : '1.5px solid transparent',
                                            marginBottom: 2,
                                        }}
                                        onMouseEnter={e => {
                                            if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#f1f5f9';
                                        }}
                                        onMouseLeave={e => {
                                            if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                                        }}
                                    >
                                        <div style={{
                                            width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: isSelected ? '#14b8a6' : '#e2e8f0',
                                            transition: 'all 0.15s'
                                        }}>
                                            {isSelected && <Check size={12} color="white" strokeWidth={3} />}
                                        </div>
                                        <span style={{
                                            fontFamily: 'monospace', fontSize: 12, color: '#475569',
                                            letterSpacing: '0.5px'
                                        }}>
                                            Key {index + 1}: {maskApiKey(presetKey)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Hoặc nhập API Key thủ công */}
                <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 8 }}>
                        ✏️ Hoặc nhập API Key thủ công
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
