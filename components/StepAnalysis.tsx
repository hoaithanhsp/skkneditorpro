import React from 'react';
import { AnalysisMetrics } from '../types';
import { CheckCircle2, XCircle, AlertTriangle, ShieldCheck, Search, Globe, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';

interface StepAnalysisProps {
  metrics: AnalysisMetrics;
  onContinue: () => void;
}

const StepAnalysis: React.FC<StepAnalysisProps> = ({ metrics, onContinue }) => {
  const chartData = metrics.qualityCriteria.map(c => ({
    name: c.criteria.length > 12 ? c.criteria.substring(0, 12) + '...' : c.criteria,
    fullName: c.criteria,
    score: c.score,
    comment: c.comment
  }));

  const radarData = metrics.qualityCriteria.slice(0, 8).map(c => ({
    subject: c.criteria.length > 10 ? c.criteria.substring(0, 10) + '..' : c.criteria,
    value: c.score,
    fullMark: 10
  }));

  const getColor = (score: number) => {
    if (score >= 8) return '#10b981';
    if (score >= 5) return '#f59e0b';
    return '#f43f5e';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return { text: 'Tốt', color: '#10b981' };
    if (score >= 60) return { text: 'Trung bình', color: '#f59e0b' };
    return { text: 'Cần cải thiện', color: '#f43f5e' };
  };

  const qualityLabel = getScoreLabel(metrics.qualityScore);

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const qualityOffset = circumference - (metrics.qualityScore / 100) * circumference;
  const plagiarismOffset = circumference - (metrics.plagiarismScore / 100) * circumference;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: '#134e4a', marginBottom: 4 }}>Kết quả Phân tích</h2>
        <p style={{ color: '#64748b', fontSize: 14 }}>AI đã đánh giá chi tiết SKKN của bạn</p>
      </div>

      {/* Score Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {/* Quality Score */}
        <div className="stat-card" style={{ textAlign: 'center' }}>
          <p className="stat-label">Chất lượng tổng thể</p>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
            <svg width={120} height={120} viewBox="0 0 120 120">
              <circle cx="60" cy="60" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="8" />
              <circle
                cx="60" cy="60" r={radius} fill="none"
                stroke={qualityLabel.color}
                strokeWidth="8" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={qualityOffset}
                style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 1s ease' }}
              />
              <text x="60" y="55" textAnchor="middle" fill={qualityLabel.color} fontSize="28" fontWeight="800">
                {metrics.qualityScore}
              </text>
              <text x="60" y="72" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="500">
                / 100 điểm
              </text>
            </svg>
          </div>
          <span className="badge badge-accent" style={{ color: qualityLabel.color }}>{qualityLabel.text}</span>
        </div>

        {/* Plagiarism Score */}
        <div className="stat-card" style={{ textAlign: 'center' }}>
          <p className="stat-label">Nguy cơ Đạo văn</p>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
            <svg width={120} height={120} viewBox="0 0 120 120">
              <circle cx="60" cy="60" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="8" />
              <circle
                cx="60" cy="60" r={radius} fill="none"
                stroke={metrics.plagiarismScore > 30 ? '#f43f5e' : metrics.plagiarismScore > 15 ? '#f59e0b' : '#10b981'}
                strokeWidth="8" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={plagiarismOffset}
                style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 1s ease' }}
              />
              <text x="60" y="55" textAnchor="middle" fill={metrics.plagiarismScore > 30 ? '#f43f5e' : '#10b981'} fontSize="28" fontWeight="800">
                {metrics.plagiarismScore}%
              </text>
              <text x="60" y="72" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="500">
                trùng lặp
              </text>
            </svg>
          </div>
          <span className={`badge ${metrics.plagiarismScore > 30 ? 'badge-danger' : 'badge-accent'}`}>
            {metrics.plagiarismScore > 30 ? 'Cần giảm' : 'An toàn'}
          </span>
        </div>

        {/* Structure */}
        <div className="stat-card">
          <p className="stat-label">Cấu trúc SKKN</p>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { key: 'hasIntro', label: 'Đặt vấn đề' },
              { key: 'hasTheory', label: 'Cơ sở lý luận' },
              { key: 'hasReality', label: 'Thực trạng' },
              { key: 'hasSolution', label: 'Giải pháp' },
              { key: 'hasResult', label: 'Kết quả' },
              { key: 'hasConclusion', label: 'Kết luận' },
            ].map(item => (
              <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#475569' }}>{item.label}</span>
                {(metrics.structure as any)[item.key]
                  ? <CheckCircle2 size={16} color="#10b981" />
                  : <XCircle size={16} color="#f43f5e" />
                }
              </div>
            ))}
          </div>
          {metrics.structure.missing.length > 0 && (
            <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: '#fff1f2', border: '1px solid #fecdd3' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#e11d48', fontSize: 12, fontWeight: 600 }}>
                <AlertTriangle size={14} /> Thiếu: {metrics.structure.missing.join(', ')}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Charts Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Radar Chart */}
        <div className="glass-card" style={{ padding: 20 }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 16 }}>Tổng quan tiêu chí</h4>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#64748b' }} />
                <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
                <Radar dataKey="value" stroke="#14b8a6" fill="#14b8a6" fillOpacity={0.15} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar Chart */}
        <div className="glass-card" style={{ padding: 20 }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 16 }}>Chi tiết điểm số</h4>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <XAxis dataKey="name" fontSize={9} tickLine={false} axisLine={false} tick={{ fill: '#64748b' }} />
                <YAxis domain={[0, 10]} hide />
                <Tooltip
                  contentStyle={{
                    borderRadius: 10, border: '1px solid #e2e8f0',
                    background: '#fff', color: '#1e293b',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.1)', fontSize: 12
                  }}
                  cursor={{ fill: 'rgba(20, 184, 166, 0.04)' }}
                />
                <Bar dataKey="score" radius={[4, 4, 0, 0]} barSize={28}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getColor(entry.score)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Criteria Detail List */}
      <div className="glass-card" style={{ padding: 20 }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 16 }}>Đánh giá chi tiết từng tiêu chí</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {metrics.qualityCriteria.map((item, idx) => {
            const displayScore = Number.isInteger(item.score) ? item.score : Number(item.score.toFixed(1));
            const scoreFontSize = String(displayScore).length > 2 ? 12 : 15;
            return (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderRadius: 12,
                background: item.score >= 8 ? '#ecfdf5' : item.score >= 5 ? '#fffbeb' : '#fff1f2',
                border: `1px solid ${item.score >= 8 ? '#a7f3d0' : item.score >= 5 ? '#fde68a' : '#fecdd3'}`,
                boxShadow: `0 2px 0 ${item.score >= 8 ? '#d1fae5' : item.score >= 5 ? '#fef3c7' : '#ffe4e6'}`
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                  <div style={{
                    minWidth: 38, height: 38, borderRadius: 10, padding: '0 4px',
                    background: getColor(item.score),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: scoreFontSize, fontWeight: 800, color: 'white', flexShrink: 0,
                    boxShadow: `0 2px 0 ${item.score >= 8 ? '#059669' : item.score >= 5 ? '#d97706' : '#dc2626'}`
                  }}>
                    {displayScore}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{item.criteria}</span>
                </div>
                <span style={{
                  fontSize: 12, color: item.score >= 8 ? '#047857' : item.score >= 5 ? '#92400e' : '#be123c',
                  fontWeight: 500, textAlign: 'right', maxWidth: '40%', lineHeight: 1.4
                }}>
                  {item.comment}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Plagiarism layers */}
      <div className="glass-card" style={{ padding: 20 }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldCheck size={18} color="#14b8a6" /> Kiểm tra Đạo văn
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { icon: <CheckCircle2 size={16} />, color: '#14b8a6', bg: '#f0fdfa', title: 'Database Nội bộ', desc: 'So sánh với 5,000+ SKKN mẫu' },
            { icon: <Search size={16} />, color: '#8b5cf6', bg: '#f5f3ff', title: 'Internet Real-time', desc: 'Quét trùng lặp câu văn' },
            { icon: <Globe size={16} />, color: '#f59e0b', bg: '#fffbeb', title: 'Web Giáo dục', desc: 'violet.vn, moet.gov.vn...' },
          ].map((layer, i) => (
            <div key={i} style={{
              padding: 14, borderRadius: 10, background: layer.bg, border: `1px solid ${layer.color}20`,
              boxShadow: '0 2px 0 rgba(0,0,0,0.03)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: layer.color, marginBottom: 6 }}>
                {layer.icon}
                <span style={{ fontSize: 13, fontWeight: 600 }}>{layer.title}</span>
              </div>
              <p style={{ fontSize: 11, color: '#64748b' }}>{layer.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Continue Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}>
        <button onClick={onContinue} className="btn-primary btn-lg">
          Tiếp tục: Tổng quan & Gợi ý
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
};

export default StepAnalysis;