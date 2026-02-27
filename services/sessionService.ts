import { SKKNData, UserRequirements, AppStep } from '../types';
import { saveAs } from 'file-saver';

// --- Cấu trúc file phiên làm việc ---
export interface SessionFile {
    version: 1;
    exportedAt: number;
    appName: 'SKKN Editor Pro';
    data: SKKNData;
    currentStep: AppStep;
    maxReachedStep: number;
    userRequirements: UserRequirements;
}

// --- Xuất phiên ra file JSON ---
export const exportSession = (
    data: SKKNData,
    currentStep: AppStep,
    maxReachedStep: number,
    userRequirements: UserRequirements
): void => {
    const session: SessionFile = {
        version: 1,
        exportedAt: Date.now(),
        appName: 'SKKN Editor Pro',
        data,
        currentStep,
        maxReachedStep,
        userRequirements,
    };

    const json = JSON.stringify(session, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });

    // Tên file: SKKN_Session_<tên file>_<ngày>.json
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const safeName = (data.fileName || 'untitled').replace(/[^a-zA-Z0-9À-ỹ_\-]/g, '_').substring(0, 40);
    const fileName = `SKKN_Session_${safeName}_${dateStr}.json`;

    saveAs(blob, fileName);
};

// --- Nhập phiên từ file JSON ---
export const importSession = (file: File): Promise<SessionFile> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result as string;
                const parsed = JSON.parse(text);

                // Validate cơ bản
                if (!parsed.appName || parsed.appName !== 'SKKN Editor Pro') {
                    reject(new Error('File không phải phiên làm việc của SKKN Editor Pro'));
                    return;
                }
                if (!parsed.data || !parsed.data.sections) {
                    reject(new Error('File phiên làm việc bị lỗi hoặc thiếu dữ liệu'));
                    return;
                }

                // Đảm bảo các trường bắt buộc
                const session: SessionFile = {
                    version: parsed.version || 1,
                    exportedAt: parsed.exportedAt || 0,
                    appName: parsed.appName,
                    data: {
                        fileName: parsed.data.fileName || '',
                        originalText: parsed.data.originalText || '',
                        currentTitle: parsed.data.currentTitle || '',
                        analysis: parsed.data.analysis || null,
                        titleSuggestions: parsed.data.titleSuggestions || [],
                        selectedNewTitle: parsed.data.selectedNewTitle || null,
                        sections: (parsed.data.sections || []).map((s: any) => ({
                            id: s.id || '',
                            title: s.title || '',
                            level: s.level || 1,
                            parentId: s.parentId || undefined,
                            originalContent: s.originalContent || '',
                            refinedContent: s.refinedContent || '',
                            isProcessing: false,
                            suggestions: s.suggestions || [],
                            editSuggestions: (s.editSuggestions || []).map((es: any) => ({
                                ...es,
                                applied: es.applied || false,
                            })),
                        })),
                    },
                    currentStep: parsed.currentStep ?? AppStep.UPLOAD,
                    maxReachedStep: parsed.maxReachedStep ?? 0,
                    userRequirements: parsed.userRequirements || {
                        pageLimit: null,
                        referenceDocuments: [],
                        customInstructions: '',
                    },
                };

                resolve(session);
            } catch (err) {
                reject(new Error('Không thể đọc file phiên làm việc. Đảm bảo đây là file JSON hợp lệ.'));
            }
        };
        reader.onerror = () => reject(new Error('Lỗi đọc file'));
        reader.readAsText(file, 'UTF-8');
    });
};

// --- Xuất 1 entry từ history ra file ---
export const exportHistoryEntry = (
    data: SKKNData,
    maxReachedStep: number
): void => {
    exportSession(data, maxReachedStep as AppStep, maxReachedStep, {
        pageLimit: null,
        referenceDocuments: [],
        customInstructions: '',
    });
};
