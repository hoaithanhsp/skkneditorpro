import { SKKNData, HistoryEntry } from '../types';

const STORAGE_KEY = 'skkn_editor_history';
const MAX_ENTRIES = 10;

export const getSessions = (): HistoryEntry[] => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as HistoryEntry[];
    } catch {
        return [];
    }
};

export const saveSession = (data: SKKNData, maxReachedStep: number): string => {
    const sessions = getSessions();
    const id = `skkn_${Date.now()}`;

    const entry: HistoryEntry = {
        id,
        fileName: data.fileName,
        currentTitle: data.currentTitle,
        selectedNewTitle: data.selectedNewTitle?.title || '',
        timestamp: Date.now(),
        sectionsCount: data.sections.length,
        completedCount: data.sections.filter(s => s.refinedContent).length,
        data,
        maxReachedStep,
    };

    // Check if same fileName already exists → update it
    const existingIdx = sessions.findIndex(s => s.fileName === data.fileName);
    if (existingIdx !== -1) {
        sessions[existingIdx] = entry;
    } else {
        sessions.unshift(entry);
    }

    // Limit to MAX_ENTRIES
    const trimmed = sessions.slice(0, MAX_ENTRIES);

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e) {
        // localStorage full - remove oldest
        const smaller = trimmed.slice(0, 5);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(smaller));
    }

    return id;
};

export const loadSession = (id: string): HistoryEntry | null => {
    const sessions = getSessions();
    return sessions.find(s => s.id === id) || null;
};

export const deleteSession = (id: string): void => {
    const sessions = getSessions().filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
};

export const clearAllSessions = (): void => {
    localStorage.removeItem(STORAGE_KEY);
};
