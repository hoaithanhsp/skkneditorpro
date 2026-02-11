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
    if (score >= 8) return '#34d399';
    if (score >= 5) return '#fbbf24';
    return '#fb7185';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return { text: 'Tốt', color: '#34d399' };
    if (score >= 60) return { text: 'Trung bình', color: '#fbbf24' };
    return { text: 'Cần cải thiện', color: '#fb7185' };
  };

  const qualityLabel = getScoreLabel(metrics.qualityScore);

  // Progress ring SVG
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const qualityOffset = circumference - (metrics.qualityScore / 100) * circumference;
  const plagiarismOffset = circumference - (metrics.plagiarismScore / 100) * circumference;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f1f5f9', marginBottom: 4 }}>Kết quả Phân tích</h2>
        <p style={{ color: '#64748b', fontSize: 14 }}>AI đã đánh giá chi tiết SKKN của bạn</p>
      </div>

      {/* Score Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {/* Quality Score */}
        <div className="stat-card" style={{ textAlign: 'center' }}>
          <p className="stat-label">Chất lượng tổng thể</p>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
            <svg width={120} height={120} viewBox="0 0 120 120">
              <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
              <circle
                cx="60" cy="60" r={radius} fill="none"
                stroke={qualityLabel.color}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={qualityOffset}
                style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 1s ease' }}
              />
              <text x="60" y="55" textAnchor="middle" fill={qualityLabel.color} fontSize="28" fontWeight="800">
                {metrics.qualityScore}
              </text>
              <text x="60" y="72" textAnchor="middle" fill="#64748b" fontSize="10" fontWeight="500">
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
              <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
              <circle
                cx="60" cy="60" r={radius} fill="none"
                stroke={metrics.plagiarismScore > 30 ? '#fb7185' : metrics.plagiarismScore > 15 ? '#fbbf24' : '#34d399'}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={plagiarismOffset}
                style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 1s ease' }}
              />
              <text x="60" y="55" textAnchor="middle" fill={metrics.plagiarismScore > 30 ? '#fb7185' : '#34d399'} fontSize="28" fontWeight="800">
                {metrics.plagiarismScore}%
              </text>
              <text x="60" y="72" textAnchor="middle" fill="#64748b" fontSize="10" fontWeight="500">
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
                <span style={{ color: '#94a3b8' }}>{item.label}</span>
                {(metrics.structure as any)[item.key]
                  ? <CheckCircle2 size={16} color="#34d399" />
                  : <XCircle size={16} color="#fb7185" />
                }
              </div>
            ))}
          </div>
          {metrics.structure.missing.length > 0 && (
            <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.15)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fb7185', fontSize: 12, fontWeight: 600 }}>
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
          <h4 style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>Tổng quan tiêu chí</h4>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(255,255,255,0.08)" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
                <Radar dataKey="value" stroke="#818cf8" fill="#6366f1" fillOpacity={0.2} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar Chart */}
        <div className="glass-card" style={{ padding: 20 }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>Chi tiết điểm số</h4>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <XAxis dataKey="name" fontSize={9} tickLine={false} axisLine={false} tick={{ fill: '#64748b' }} />
                <YAxis domain={[0, 10]} hide />
                <Tooltip
                  contentStyle={{
                    borderRadius: 10, border: 'none',
                    background: '#1e293b', color: '#e2e8f0',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)', fontSize: 12
                  }}
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
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
        <h4 style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>Đánh giá chi tiết từng tiêu chí</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {metrics.qualityCriteria.map((item, idx) => (
            <div key={idx} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', borderRadius: 10,
              background: 'rgba(255,255,255,0.02)',
              borderBottom: '1px solid rgba(255,255,255,0.04)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: `${getColor(item.score)}15`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: getColor(item.score), flexShrink: 0
                }}>
                  {item.score}
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#cbd5e1' }}>{item.criteria}</span>
              </div>
              <span style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', textAlign: 'right', maxWidth: '40%' }}>
                {item.comment}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Plagiarism layers */}
      <div className="glass-card" style={{ padding: 20 }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldCheck size={18} color="#818cf8" /> Kiểm tra Đạo văn
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { icon: <CheckCircle2 size={16} />, color: '#818cf8', bg: 'rgba(99, 102, 241, 0.1)', title: 'Database Nội bộ', desc: 'So sánh với 5,000+ SKKN mẫu' },
            { icon: <Search size={16} />, color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.1)', title: 'Internet Real-time', desc: 'Quét trùng lặp câu văn' },
            { icon: <Globe size={16} />, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', title: 'Web Giáo dục', desc: 'violet.vn, moet.gov.vn...' },
          ].map((layer, i) => (
            <div key={i} style={{
              padding: 14, borderRadius: 10, background: layer.bg, border: `1px solid ${layer.color}20`
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