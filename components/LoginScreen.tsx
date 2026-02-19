import React, { useState } from 'react';
import { Lock, User, Eye, EyeOff, AlertCircle, LogIn } from 'lucide-react';
import accountsData from '../data/accounts.json';

interface LoginScreenProps {
    onLoginSuccess: (displayName: string) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!username.trim() || !password.trim()) {
            setError('Vui lòng nhập đầy đủ tài khoản và mật khẩu.');
            return;
        }

        setIsLoading(true);

        try {
            // Check if password is correct (fixed: SKKN100)
            if (password === 'SKKN100') {
                const accounts = accountsData as { username: string; password: string; displayName: string }[];
                // Try to find if user exists in our data to get a nice display name
                const matched = accounts.find(
                    acc => acc.username === username.trim()
                );

                const displayName = matched ? matched.displayName : username.trim();

                sessionStorage.setItem('skkn_logged_in', 'true');
                sessionStorage.setItem('skkn_display_name', displayName);
                onLoginSuccess(displayName);
            } else {
                setError('Mật khẩu không đúng. Vui lòng thử lại.');
            }
        } catch (err) {
            setError('Lỗi xác thực. Vui lòng thử lại.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 30%, #e0e7ff 70%, #f0fdfa 100%)',
            padding: 20
        }}>
            {/* Decorative circles */}
            <div style={{
                position: 'fixed', top: -120, right: -120, width: 400, height: 400,
                borderRadius: '50%', background: 'rgba(20, 184, 166, 0.06)',
                pointerEvents: 'none'
            }} />
            <div style={{
                position: 'fixed', bottom: -80, left: -80, width: 300, height: 300,
                borderRadius: '50%', background: 'rgba(99, 102, 241, 0.04)',
                pointerEvents: 'none'
            }} />

            <div className="animate-fade-in" style={{
                width: '100%', maxWidth: 420,
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px)',
                borderRadius: 24, padding: '40px 36px',
                border: '1px solid rgba(13, 148, 136, 0.12)',
                boxShadow: '0 20px 60px rgba(13, 148, 136, 0.1), 0 8px 20px rgba(0, 0, 0, 0.04)',
                position: 'relative', zIndex: 1
            }}>
                {/* Logo / Branding */}
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <div style={{
                        width: 72, height: 72, borderRadius: 20, margin: '0 auto 16px',
                        background: 'linear-gradient(135deg, #14b8a6, #0d9488)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 6px 0 #0f766e, 0 8px 24px rgba(13, 148, 136, 0.25)',
                        position: 'relative', top: 0,
                        transition: 'all 0.2s'
                    }}>
                        <Lock size={32} color="white" strokeWidth={2.5} />
                    </div>
                    <h1 style={{
                        fontSize: 24, fontWeight: 800,
                        background: 'linear-gradient(135deg, #0f766e, #14b8a6)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        marginBottom: 4
                    }}>
                        SKKN Editor Pro
                    </h1>
                    <p style={{ fontSize: 13, color: '#64748b' }}>
                        Nhập tài khoản bất kỳ & Mật khẩu: SKKN100
                    </p>
                </div>

                <form onSubmit={handleLogin}>
                    {/* Username */}
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                            Tài khoản
                        </label>
                        <div style={{ position: 'relative' }}>
                            <User size={16} color="#94a3b8" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                            <input
                                type="text"
                                value={username}
                                onChange={e => { setUsername(e.target.value); setError(''); }}
                                placeholder="Nhập tài khoản"
                                autoComplete="username"
                                autoFocus
                                style={{
                                    width: '100%', padding: '12px 16px 12px 42px',
                                    border: '2px solid #e2e8f0', borderRadius: 12,
                                    fontSize: 14, color: '#1e293b', background: '#f8fafc',
                                    outline: 'none', transition: 'all 0.2s',
                                    ...(error ? { borderColor: '#fecdd3' } : {})
                                }}
                                onFocus={e => { e.target.style.borderColor = '#14b8a6'; e.target.style.boxShadow = '0 0 0 4px rgba(20, 184, 166, 0.1)'; }}
                                onBlur={e => { e.target.style.borderColor = error ? '#fecdd3' : '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
                            />
                        </div>
                    </div>

                    {/* Password */}
                    <div style={{ marginBottom: 20 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                            Mật khẩu
                        </label>
                        <div style={{ position: 'relative' }}>
                            <Lock size={16} color="#94a3b8" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={e => { setPassword(e.target.value); setError(''); }}
                                placeholder="Nhập mật khẩu"
                                autoComplete="current-password"
                                style={{
                                    width: '100%', padding: '12px 44px 12px 42px',
                                    border: '2px solid #e2e8f0', borderRadius: 12,
                                    fontSize: 14, color: '#1e293b', background: '#f8fafc',
                                    outline: 'none', transition: 'all 0.2s',
                                    ...(error ? { borderColor: '#fecdd3' } : {})
                                }}
                                onFocus={e => { e.target.style.borderColor = '#14b8a6'; e.target.style.boxShadow = '0 0 0 4px rgba(20, 184, 166, 0.1)'; }}
                                onBlur={e => { e.target.style.borderColor = error ? '#fecdd3' : '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                style={{
                                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                                    background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                                    color: '#94a3b8', display: 'flex'
                                }}
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    {/* Error */}
                    {error && (
                        <div style={{
                            padding: '10px 14px', borderRadius: 10, marginBottom: 16,
                            background: '#fff1f2', border: '1px solid #fecdd3',
                            color: '#e11d48', fontSize: 13, fontWeight: 500,
                            display: 'flex', alignItems: 'center', gap: 8
                        }}>
                            <AlertCircle size={15} />
                            {error}
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="btn-primary"
                        style={{
                            width: '100%', padding: '13px 24px', fontSize: 15, fontWeight: 700,
                            borderRadius: 12, justifyContent: 'center',
                            opacity: isLoading ? 0.7 : 1,
                            cursor: isLoading ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {isLoading ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className="animate-spin-slow" style={{ display: 'inline-flex' }}>⏳</span>
                                Đang xác thực...
                            </span>
                        ) : (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <LogIn size={17} />
                                Đăng nhập
                            </span>
                        )}
                    </button>
                </form>

                {/* Footer */}
                <div style={{
                    textAlign: 'center', marginTop: 24, paddingTop: 20,
                    borderTop: '1px solid rgba(13, 148, 136, 0.08)'
                }}>
                    <p style={{ fontSize: 11, color: '#94a3b8' }}>
                        © 2026 SKKN Editor Pro • Hệ thống quản lý sáng kiến kinh nghiệm
                    </p>
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;
