// ================================================================
// NGÂN HÀNG KIẾN THỨC CHUYÊN MÔN CHO SKKN EDITOR PRO
// ================================================================

// --- TIÊU CHÍ CHẤM SKKN (theo Nghị định 13/2012/NĐ-CP & hướng dẫn) ---
export const SCORING_CRITERIA = {
    novelty: {
        name: 'Tính mới',
        maxScore: 30,
        description: 'SKKN phải chứng minh được điểm MỚI so với các giải pháp hiện có. Không chỉ "áp dụng công nghệ" mà phải có sáng tạo riêng.',
        levels: [
            { range: '25-30', label: 'Hoàn toàn mới, chưa có ai thực hiện trong lĩnh vực/địa bàn tương tự' },
            { range: '20-24', label: 'Có cải tiến đáng kể so với giải pháp đã có' },
            { range: '15-19', label: 'Có một số điểm mới nhưng phần lớn lặp lại giải pháp cũ' },
            { range: '0-14', label: 'Không có điểm mới, sao chép giải pháp phổ biến' },
        ]
    },
    effectiveness: {
        name: 'Tính hiệu quả',
        maxScore: 30,
        description: 'Phải có số liệu trước/sau, bảng so sánh đối chứng-thực nghiệm, kết quả kiểm định thống kê.',
        levels: [
            { range: '25-30', label: 'Có kiểm định thống kê (t-test, chi-square), bảng so sánh rõ ràng' },
            { range: '20-24', label: 'Có số liệu trước/sau nhưng chưa kiểm định thống kê' },
            { range: '15-19', label: 'Có nhận xét chung nhưng thiếu số liệu cụ thể' },
            { range: '0-14', label: 'Không có bằng chứng hiệu quả' },
        ]
    },
    applicability: {
        name: 'Khả năng áp dụng',
        maxScore: 20,
        description: 'Giải pháp dễ nhân rộng, không phụ thuộc điều kiện đặc thù, có thể triển khai ở trường khác.',
        levels: [
            { range: '17-20', label: 'Áp dụng được trên toàn quốc, không cần điều kiện đặc biệt' },
            { range: '13-16', label: 'Áp dụng được trong tỉnh/thành phố' },
            { range: '9-12', label: 'Chỉ áp dụng được ở môi trường tương tự' },
            { range: '0-8', label: 'Khó áp dụng ở nơi khác' },
        ]
    },
    scientific: {
        name: 'Tính khoa học',
        maxScore: 20,
        description: 'Lý luận chặt chẽ, cơ sở lý thuyết vững, logic Lý luận → Thực trạng → Giải pháp → Kết quả.',
        levels: [
            { range: '17-20', label: 'Có viện dẫn lý thuyết đầy đủ, logic mạch lạc, phương pháp NCKH chuẩn' },
            { range: '13-16', label: 'Cơ sở lý luận có nhưng chưa sâu' },
            { range: '9-12', label: 'Thiếu cơ sở lý luận, logic chưa chặt' },
            { range: '0-8', label: 'Không có cơ sở khoa học' },
        ]
    }
};

// --- MẪU CÂU HỌC THUẬT THEO TỪNG PHẦN ---
export const ACADEMIC_PHRASES: Record<string, {
    purpose: string;
    goodPhrases: string[];
    avoidPhrases: string[];
    tips: string[];
}> = {
    'dat_van_de': {
        purpose: 'Nêu lý do, bối cảnh, tầm quan trọng của đề tài',
        goodPhrases: [
            'Xuất phát từ thực tiễn giảng dạy tại [Trường], tác giả nhận thấy...',
            'Nghiên cứu này được thực hiện nhằm giải quyết mâu thuẫn giữa...',
            'Qua [X] năm trực tiếp giảng dạy, tác giả quan sát được hiện tượng...',
            'Trước thực trạng [vấn đề cụ thể], việc tìm kiếm giải pháp trở nên cấp thiết.',
            'Theo báo cáo của [cơ quan], tỷ lệ [thống kê cụ thể], cho thấy...',
            'Mục tiêu của sáng kiến: (1)...; (2)...; (3)...',
        ],
        avoidPhrases: [
            'Trong bối cảnh đổi mới giáo dục hiện nay...',
            'Với sự phát triển mạnh mẽ của khoa học công nghệ...',
            'Nhận thức được tầm quan trọng của việc...',
            'Trong xu thế hội nhập quốc tế...',
            'Đảng và Nhà nước ta luôn quan tâm đến...',
        ],
        tips: [
            'Dẫn dắt TRỰC TIẾP vào vấn đề, tránh mở bài lan man',
            'Nêu CON SỐ cụ thể ngay từ đầu để tạo sức thuyết phục',
            'Phân biệt rõ: mục tiêu, đối tượng, phạm vi nghiên cứu'
        ]
    },
    'co_so_ly_luan': {
        purpose: 'Trình bày nền tảng lý thuyết, khung lý luận cho đề tài',
        goodPhrases: [
            'Theo lý thuyết kiến tạo của Vygotsky (1978), học tập là quá trình...',
            'Dựa trên phân loại tư duy Bloom sửa đổi (Anderson & Krathwohl, 2001)...',
            'Chương trình Giáo dục phổ thông 2018 (Thông tư 32/2018/TT-BGDĐT) xác định...',
            'Howard Gardner (1983) đề xuất thuyết đa trí tuệ, trong đó...',
            'Piaget (1954) phân chia phát triển nhận thức thành 4 giai đoạn:...',
            'Mô hình ADDIE (Analysis-Design-Development-Implementation-Evaluation) được sử dụng...',
            'Theo Kolb (1984), chu trình học tập trải nghiệm gồm 4 bước:...',
            'Phương pháp STEM/STEAM tích hợp liên môn (Bybee, 2013)...',
        ],
        avoidPhrases: [
            'Như chúng ta đã biết...',
            'Ai cũng nhận thấy rằng...',
            'Theo nhiều nhà nghiên cứu...',
        ],
        tips: [
            'LUÔN ghi rõ tên tác giả + năm xuất bản khi viện dẫn',
            'Nên có 5-10 tài liệu tham khảo',
            'Kết nối lý thuyết với đề tài cụ thể, tránh liệt kê suông'
        ]
    },
    'thuc_trang': {
        purpose: 'Khảo sát, phân tích tình hình thực tế trước khi áp dụng giải pháp',
        goodPhrases: [
            'Khảo sát được thực hiện trên [N] học sinh lớp [X] trường [Tên], năm học [YYYY-YYYY].',
            'Phiếu khảo sát gồm [N] câu hỏi, chia thành [N] nhóm tiêu chí.',
            'Bảng 1: Kết quả khảo sát thực trạng [nội dung]',
            'Biểu đồ 1: Tỷ lệ [tiêu chí] trước khi áp dụng giải pháp',
            'Qua dự giờ [N] tiết dạy, phỏng vấn [N] giáo viên, kết quả cho thấy...',
            'Phân tích kết quả học tập [N] học kỳ gần nhất cho thấy xu hướng...',
        ],
        avoidPhrases: [
            'Qua quan sát thấy...',
            'Có thể nói rằng...',
            'Nhìn chung...',
        ],
        tips: [
            'BẮT BUỘC có số liệu định lượng (%, số lượng)',
            'Trình bày dạng BẢNG hoặc BIỂU ĐỒ',
            'Nêu rõ: đối tượng khảo sát, thời gian, công cụ, phương pháp'
        ]
    },
    'giai_phap': {
        purpose: 'Trình bày chi tiết các giải pháp/biện pháp đề xuất',
        goodPhrases: [
            'Giải pháp [N]: [Tên giải pháp rõ ràng, cụ thể]',
            'Mục đích: Giải quyết [vấn đề gì] đã nêu ở phần thực trạng.',
            'Cách thực hiện: Bước 1:...; Bước 2:...; Bước 3:...',
            'So với phương pháp truyền thống, điểm khác biệt cốt lõi là...',
            'Điều kiện thực hiện: (1) Về cơ sở vật chất:...; (2) Về nhân lực:...',
            'Lưu ý khi thực hiện: [các rủi ro và cách khắc phục]',
            'Minh họa: [hình ảnh/ảnh chụp/sản phẩm thực tế]',
        ],
        avoidPhrases: [
            'Tôi đã áp dụng nhiều phương pháp...',
            'Giải pháp này rất hiệu quả...',
        ],
        tips: [
            'Mỗi giải pháp phải có: Tên → Mục đích → Cách thực hiện → Kết quả → Minh họa',
            'Nêu ĐIỂM MỚI so với cách làm cũ',
            'Có hình ảnh/video/sản phẩm minh chứng'
        ]
    },
    'ket_qua': {
        purpose: 'Trình bày kết quả sau khi áp dụng giải pháp, so sánh trước/sau',
        goodPhrases: [
            'Bảng so sánh kết quả trước và sau thực nghiệm:',
            'Kết quả kiểm định t-test (independent samples) cho thấy p = [giá trị] < 0.05, chứng tỏ...',
            'Biểu đồ 2: So sánh kết quả nhóm đối chứng và nhóm thực nghiệm',
            'Độ lệch chuẩn (SD) của nhóm thực nghiệm là [X], thấp hơn nhóm đối chứng [Y], cho thấy...',
            'Tỷ lệ học sinh đạt mức [Giỏi/Khá] tăng từ [X]% lên [Y]% (tăng [Z]%).',
            'Hiệu quả size (Cohen\'s d) = [giá trị], thuộc mức [nhỏ/trung bình/lớn].',
            'Khảo sát mức độ hài lòng: [N]% đánh giá "Rất hài lòng", [N]% "Hài lòng".',
        ],
        avoidPhrases: [
            'Kết quả bước đầu cho thấy...',
            'Qua quan sát nhận thấy có tiến bộ...',
        ],
        tips: [
            'BẮT BUỘC có bảng so sánh TRƯỚC/SAU',
            'Nếu có thể, dùng kiểm định thống kê (t-test, chi-square)',
            'Phân tích cả ĐỊNH LƯỢNG (số liệu) và ĐỊNH TÍNH (nhận xét, phỏng vấn)'
        ]
    },
    'ket_luan': {
        purpose: 'Tóm tắt, đánh giá, hướng phát triển',
        goodPhrases: [
            'Sáng kiến đã đạt được [N] mục tiêu đề ra ban đầu:...',
            'Kết quả nghiên cứu khẳng định: [kết luận chính].',
            'Hạn chế: (1)...; (2)... Hướng khắc phục trong tương lai:...',
            'Kiến nghị: (1) Đối với nhà trường:...; (2) Đối với Sở GD&ĐT:...; (3) Đối với giáo viên:...',
            'Đề tài có thể mở rộng theo hướng:...',
        ],
        avoidPhrases: [
            'Tóm lại, đề tài đã hoàn thành tốt...',
            'Trên đây là toàn bộ nội dung...',
        ],
        tips: [
            'Đối chiếu kết luận với mục tiêu ban đầu (ở Phần I)',
            'Nêu HẠN CHẾ trước, rồi đến HƯỚNG PHÁT TRIỂN',
            'Kiến nghị phải CỤ THỂ, khả thi'
        ]
    }
};

// --- PHƯƠNG PHÁP NGHIÊN CỨU KHOA HỌC ---
export const RESEARCH_METHODS = {
    experimental: {
        name: 'Thực nghiệm sư phạm',
        description: 'So sánh nhóm đối chứng (dạy truyền thống) vs nhóm thực nghiệm (áp dụng giải pháp)',
        template: `
Thiết kế nghiên cứu:
- Nhóm thực nghiệm (TN): [N] học sinh lớp [X], áp dụng [giải pháp]
- Nhóm đối chứng (ĐC): [N] học sinh lớp [Y], dạy theo phương pháp truyền thống
- Thời gian: [N] tuần/tháng, năm học [YYYY-YYYY]
- Bài kiểm tra: [N] bài, thang điểm 10

Bảng kết quả:
| Mức đạt | TN (n=...) | ĐC (n=...) |
|---------|-----------|-----------|
| Giỏi (8-10) | ...% | ...% |
| Khá (6.5-7.9) | ...% | ...% |
| TB (5-6.4) | ...% | ...% |
| Yếu (<5) | ...% | ...% |
| ĐTB ± SD | ... ± ... | ... ± ... |
| p-value (t-test) | ... | |`
    },
    survey: {
        name: 'Khảo sát (Phiếu điều tra)',
        description: 'Thu thập ý kiến bằng phiếu khảo sát (Likert scale)',
        template: `
Phiếu khảo sát mức độ hài lòng (thang Likert 5 mức):
| Tiêu chí | Rất hài lòng | Hài lòng | Bình thường | Không hài lòng | Rất không hài lòng |
|----------|-------------|---------|------------|--------------|-------------------|
| [Tiêu chí 1] | ...% | ...% | ...% | ...% | ...% |
| [Tiêu chí 2] | ...% | ...% | ...% | ...% | ...% |
| ĐTB chung | ... / 5.0 | | | | |`
    },
    action_research: {
        name: 'Nghiên cứu hành động (Action Research)',
        description: 'Chu trình: Kế hoạch → Hành động → Quan sát → Phản ánh → Điều chỉnh',
        template: `
Chu kỳ nghiên cứu hành động:
Vòng 1: Kế hoạch ban đầu → Thực hiện → Quan sát → Kết quả → Điều chỉnh
Vòng 2: Kế hoạch cải tiến → Thực hiện → Quan sát → Kết quả → Đánh giá`
    }
};

// --- BẢNG MẪU SO SÁNH TRƯỚC/SAU ---
export const COMPARISON_TABLE_TEMPLATE = `
| Tiêu chí | Trước thực nghiệm | Sau thực nghiệm | Chênh lệch |
|----------|-------------------|-----------------|------------|
| HS Giỏi (%) | | | |
| HS Khá (%) | | | |
| HS TB (%) | | | |
| HS Yếu (%) | | | |
| Điểm TB ± SD | | | |
| p-value | | | |`;

// --- HÀM HELPER: lấy knowledge theo loại section ---
export const getKnowledgeForSection = (sectionTitle: string): {
    phrases: typeof ACADEMIC_PHRASES[string] | null;
    method: typeof RESEARCH_METHODS[keyof typeof RESEARCH_METHODS] | null;
    scoringFocus: typeof SCORING_CRITERIA[keyof typeof SCORING_CRITERIA] | null;
} => {
    const lower = sectionTitle.toLowerCase();

    let phrasesKey: string | null = null;
    let methodKey: string | null = null;
    let scoringKey: keyof typeof SCORING_CRITERIA | null = null;

    if (lower.includes('đặt vấn đề') || lower.includes('mở đầu') || lower.includes('phần i')) {
        phrasesKey = 'dat_van_de';
        scoringKey = 'scientific';
    } else if (lower.includes('lý luận') || lower.includes('cơ sở') || lower.includes('phần ii')) {
        phrasesKey = 'co_so_ly_luan';
        scoringKey = 'scientific';
    } else if (lower.includes('thực trạng') || lower.includes('phần iii') || lower.includes('khảo sát')) {
        phrasesKey = 'thuc_trang';
        methodKey = 'survey';
        scoringKey = 'effectiveness';
    } else if (lower.includes('giải pháp') || lower.includes('biện pháp') || lower.includes('phần iv')) {
        phrasesKey = 'giai_phap';
        scoringKey = 'novelty';
    } else if (lower.includes('kết quả') || lower.includes('phần v') || lower.includes('hiệu quả')) {
        phrasesKey = 'ket_qua';
        methodKey = 'experimental';
        scoringKey = 'effectiveness';
    } else if (lower.includes('kết luận') || lower.includes('phần vi') || lower.includes('kiến nghị')) {
        phrasesKey = 'ket_luan';
        scoringKey = 'applicability';
    }

    return {
        phrases: phrasesKey ? ACADEMIC_PHRASES[phrasesKey] : null,
        method: methodKey ? RESEARCH_METHODS[methodKey as keyof typeof RESEARCH_METHODS] : null,
        scoringFocus: scoringKey ? SCORING_CRITERIA[scoringKey] : null,
    };
};

// --- Danh sách câu sáo rỗng phải TRÁNH ---
export const CLICHE_PHRASES = [
    'Trong bối cảnh đổi mới giáo dục hiện nay',
    'Với sự phát triển mạnh mẽ của khoa học công nghệ',
    'Nhận thức được tầm quan trọng của',
    'Trong xu thế hội nhập quốc tế',
    'Đảng và Nhà nước ta luôn quan tâm',
    'Trước yêu cầu đổi mới căn bản toàn diện',
    'Như chúng ta đã biết',
    'Ai cũng nhận thấy rằng',
    'Qua thực tế cho thấy',
    'Kết quả bước đầu cho thấy',
    'Tóm lại, đề tài đã hoàn thành tốt',
    'Trên đây là toàn bộ nội dung',
    'Trong quá trình thực hiện không tránh khỏi thiếu sót',
    'Rất mong nhận được sự đóng góp ý kiến',
    'Theo nhiều nhà nghiên cứu',
    'Có thể nói rằng',
    'Nhìn chung',
    'Một cách tổng quát',
];

// --- Xây dựng prompt context từ knowledge base ---
export const buildKnowledgeContext = (sectionTitle: string): string => {
    const knowledge = getKnowledgeForSection(sectionTitle);
    let context = '';

    if (knowledge.scoringFocus) {
        const sc = knowledge.scoringFocus;
        context += `\n[TIÊU CHÍ CHẤM TRỌNG TÂM - ${sc.name} (${sc.maxScore} điểm)]:\n`;
        context += `${sc.description}\n`;
        context += `Mức cao nhất: ${sc.levels[0].label}\n`;
    }

    if (knowledge.phrases) {
        const ph = knowledge.phrases;
        context += `\n[MẪU CÂU NÊN DÙNG cho phần "${sectionTitle}"]:\n`;
        ph.goodPhrases.forEach(p => { context += `  ✓ ${p}\n`; });
        context += `\n[CÂU SÁO RỖNG PHẢI TRÁNH]:\n`;
        ph.avoidPhrases.forEach(p => { context += `  ✗ ${p}\n`; });
        context += `\n[MẸO VIẾT HAY]:\n`;
        ph.tips.forEach(t => { context += `  • ${t}\n`; });
    }

    if (knowledge.method) {
        context += `\n[PHƯƠNG PHÁP NCKH GỢI Ý - ${knowledge.method.name}]:\n`;
        context += `${knowledge.method.description}\n`;
        context += `Mẫu trình bày:\n${knowledge.method.template}\n`;
    }

    // Always add cliché warning
    context += `\n[DANH SÁCH CÂU PHẢI LOẠI BỎ - nếu gặp phải thay bằng diễn đạt mới]:\n`;
    CLICHE_PHRASES.slice(0, 10).forEach(c => { context += `  ✗ "${c}"\n`; });

    return context;
};
