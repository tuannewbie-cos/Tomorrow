import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS, loadSessions, saveSessions } from './chatStorage';
import { ChatSession } from '../types/chat';

export const NOTEBOOKS_STORAGE_KEY = 'TOMORROW_NOTEBOOKS_V1';
export const DEFAULT_NOTEBOOK_ID = 'default-notebook';

export interface NotebookPaneState {
  id: string;
  sessionId: string | null;
}

export interface Notebook {
  id: string;                        // Mặc định: 'default-notebook'
  name: string;                      // VD: "Ghi chú chung", "Tomorrow", "Giải tích 2"
  createdAt: number;
  updatedAt: number;
  savedPanes?: NotebookPaneState[];  // Lưu riêng bộ 1..4 tab Split Screen của sổ này
  activePaneId?: string;
}

export const DEFAULT_NOTEBOOK: Notebook = {
  id: DEFAULT_NOTEBOOK_ID,
  name: 'Ghi chú chung',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  savedPanes: [{ id: 'pane-1', sessionId: null }],
  activePaneId: 'pane-1',
};

/**
 * Định dạng mốc thời gian tương đối kiểu Antigravity:
 * now (< 5m), 15m, 3h, 1d, 2d, 8d...
 */
export function formatRelativeTime(timestamp: number): string {
  if (!timestamp || isNaN(timestamp)) return 'now';
  const now = Date.now();
  const diffMs = Math.max(0, now - timestamp);

  // Dưới 5 phút hiển thị 'now'
  if (diffMs < 5 * 60 * 1000) {
    return 'now';
  }

  // Dưới 1 giờ hiển thị phút (VD: 15m)
  const diffMins = Math.floor(diffMs / (60 * 1000));
  if (diffMins < 60) {
    return `${diffMins}m`;
  }

  // Dưới 24 giờ hiển thị giờ (VD: 3h)
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  // Từ 1 ngày trở lên hiển thị ngày (VD: 1d, 8d)
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  return `${diffDays}d`;
}

/**
 * 1. Tải toàn bộ danh sách Sổ ghi chú từ TOMORROW_NOTEBOOKS_V1
 * Tự khởi tạo sổ gốc 'default-notebook' ("Ghi chú chung") nếu chưa có
 */
export async function loadNotebooks(): Promise<Notebook[]> {
  try {
    const raw = await AsyncStorage.getItem(NOTEBOOKS_STORAGE_KEY);
    if (raw) {
      const parsed: Notebook[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Đảm bảo luôn có default-notebook trong danh sách
        const hasDefault = parsed.some((n) => n.id === DEFAULT_NOTEBOOK_ID);
        let list = parsed;
        if (!hasDefault) {
          list = [DEFAULT_NOTEBOOK, ...parsed];
          await AsyncStorage.setItem(NOTEBOOKS_STORAGE_KEY, JSON.stringify(list));
        }
        // Sắp xếp updatedAt mới nhất lên đầu
        return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      }
    }

    // Khởi tạo sổ mặc định
    const initialList: Notebook[] = [DEFAULT_NOTEBOOK];
    await AsyncStorage.setItem(NOTEBOOKS_STORAGE_KEY, JSON.stringify(initialList));
    return initialList;
  } catch (error) {
    console.error('[NotebookStorage] Lỗi khi load notebooks:', error);
    return [DEFAULT_NOTEBOOK];
  }
}

/**
 * 2. Lưu toàn bộ danh sách Sổ ghi chú vào TOMORROW_NOTEBOOKS_V1
 */
export async function saveNotebooks(notebooks: Notebook[]): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTEBOOKS_STORAGE_KEY, JSON.stringify(notebooks));
  } catch (error) {
    console.error('[NotebookStorage] Lỗi khi lưu notebooks:', error);
  }
}

/**
 * 3. Tạo Sổ ghi chú mới
 */
export async function createNotebook(name: string): Promise<Notebook> {
  const current = await loadNotebooks();
  const cleanName = (name || '').trim() || 'Sổ mới';
  const newId = `nb-${Date.now()}`;
  const paneId = `pane-${Date.now()}`;

  const newNotebook: Notebook = {
    id: newId,
    name: cleanName,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    savedPanes: [{ id: paneId, sessionId: null }],
    activePaneId: paneId,
  };

  const updated = [newNotebook, ...current];
  await saveNotebooks(updated);
  return newNotebook;
}

/**
 * 4. Đổi tên Sổ ghi chú
 */
export async function renameNotebook(id: string, newName: string): Promise<Notebook[]> {
  const current = await loadNotebooks();
  const cleanName = (newName || '').trim();
  if (!cleanName) return current;

  const updated = current.map((n) =>
    n.id === id ? { ...n, name: cleanName, updatedAt: Date.now() } : n
  );
  await saveNotebooks(updated);
  return updated.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/**
 * 5. Xóa Sổ ghi chú (Di chuyển toàn bộ session bên trong về 'default-notebook' để không bao giờ mất dữ liệu)
 * Cấm xóa default-notebook hoặc khi chỉ còn 1 sổ duy nhất.
 */
export async function deleteNotebook(
  id: string,
  existingSessions?: ChatSession[]
): Promise<{ updatedNotebooks: Notebook[]; updatedSessions: ChatSession[] }> {
  const current = await loadNotebooks();
  if (id === DEFAULT_NOTEBOOK_ID || current.length <= 1) {
    console.warn('[NotebookStorage] Không thể xóa sổ mặc định hoặc sổ duy nhất');
    return { updatedNotebooks: current, updatedSessions: existingSessions || [] };
  }

  // Di chuyển toàn bộ session bên trong về default-notebook
  const sessions = existingSessions || (await loadSessions());
  let hasMovedSessions = false;
  const nextSessions = sessions.map((sess) => {
    if (sess.notebookId === id) {
      hasMovedSessions = true;
      return { ...sess, notebookId: DEFAULT_NOTEBOOK_ID, updatedAt: Date.now() };
    }
    return sess;
  });

  if (hasMovedSessions) {
    await saveSessions(nextSessions);
  }

  const updatedNotebooks = current.filter((n) => n.id !== id);
  await saveNotebooks(updatedNotebooks);
  return { updatedNotebooks, updatedSessions: nextSessions };
}

/**
 * 6. Lưu trạng thái Workspace 1..4 panes của riêng Sổ ghi chú đang chọn
 */
export async function saveNotebookWorkspace(
  id: string,
  panes: NotebookPaneState[],
  activePaneId?: string
): Promise<Notebook[]> {
  const current = await loadNotebooks();
  const cleanPanes = (panes || []).slice(0, 4); // Giới hạn an toàn tối đa 4 pane
  const updated = current.map((n) => {
    if (n.id === id) {
      return {
        ...n,
        savedPanes: cleanPanes,
        activePaneId: activePaneId || (cleanPanes[0] ? cleanPanes[0].id : undefined),
        updatedAt: Date.now(),
      };
    }
    return n;
  });

  await saveNotebooks(updated);
  return updated;
}
