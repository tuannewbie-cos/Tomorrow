import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import {
  X,
  Upload,
  FileJson,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Layers,
  RefreshCw,
} from 'lucide-react-native';
import { ThemeColors, ThemeMode } from '../constants/theme';
import {
  BackupValidationResult,
  RestoreBackupResult,
  validateAndPreviewBackup,
  restoreBackupBundle,
} from '../services/backupService';

export interface BackupRestoreModalProps {
  visible: boolean;
  onClose: () => void;
  theme: ThemeColors;
  themeMode: ThemeMode;
  onRestoreComplete: (result: RestoreBackupResult) => void;
}

function formatIsoDate(iso?: string): string {
  if (!iso) return 'Không rõ';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} • ${hh}:${min}`;
}

export const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({
  visible,
  onClose,
  theme,
  themeMode,
  onRestoreComplete,
}) => {
  const [selectedFilename, setSelectedFilename] = useState<string>('');
  const [validation, setValidation] = useState<BackupValidationResult | null>(null);
  const [restoreMode, setRestoreMode] = useState<'MERGE' | 'REPLACE'>('MERGE');
  const [isDragging, setIsDragging] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pastedJson, setPastedJson] = useState('');

  useEffect(() => {
    if (visible) {
      setSelectedFilename('');
      setValidation(null);
      setRestoreMode('MERGE');
      setIsDragging(false);
      setIsRestoring(false);
      setSuccessMessage(null);
      setShowPasteBox(false);
      setPastedJson('');
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);

  const handleReadFile = (file: File) => {
    setSelectedFilename(file.name);
    setSuccessMessage(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const result = validateAndPreviewBackup(text);
      setValidation(result);
    };
    reader.onerror = () => {
      setValidation({
        valid: false,
        checksumValid: false,
        error: 'Không thể đọc tệp từ máy. Vui lòng thử chọn lại tệp JSON.',
      });
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleReadFile(file);
    }
  };

  const handleCheckPastedJson = () => {
    setSelectedFilename('Nội dung JSON đã dán');
    setSuccessMessage(null);
    const result = validateAndPreviewBackup(pastedJson);
    setValidation(result);
  };

  const handleConfirmRestore = async () => {
    if (!validation?.valid || !validation.bundle || isRestoring) return;
    setIsRestoring(true);
    try {
      const result = await restoreBackupBundle(validation.bundle, restoreMode);
      onRestoreComplete(result);
      setSuccessMessage(
        restoreMode === 'MERGE'
          ? `Đã gộp xong ${result.sessions.length} đoạn chat và ${result.notebooks.length} sổ ghi chú.`
          : `Đã khôi phục toàn bộ ${result.sessions.length} đoạn chat và ${result.notebooks.length} sổ ghi chú.`
      );
      setTimeout(() => {
        onClose();
      }, 850);
    } catch {
      setValidation({
        valid: false,
        checksumValid: false,
        error: 'Có lỗi khi ghi dữ liệu khôi phục xuống bộ nhớ cục bộ.',
      });
    } finally {
      setIsRestoring(false);
    }
  };

  if (!visible) return null;

  const isDark = themeMode === 'dark';
  const modalBg = isDark ? '#141416' : '#FFFFFF';
  const cardBg = isDark ? '#1E1E22' : '#F7F7F8';
  const borderColor = isDark ? 'rgba(255, 255, 255, 0.10)' : '#E6E6EA';
  const activeBorder = isDark ? '#F4F4F5' : '#111113';
  const activeFill = isDark ? '#242429' : '#EBEBED';
  const btnPrimaryBg = isDark ? '#F4F4F5' : '#111113';
  const btnPrimaryText = isDark ? '#111113' : '#FFFFFF';
  const textPrimary = theme.textPrimary;
  const textSecondary = theme.textSecondary;
  const textMuted = theme.textMuted;

  const modalContentInner = (
    <>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <View style={styles.headerTitleRow}>
          <FileJson size={18} color={textPrimary} />
          <Text style={[styles.headerTitle, { color: textPrimary }]}>
            Khôi phục dữ liệu từ JSON
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.closeButton,
            pressed && { opacity: 0.6 },
            Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
          ]}
          onPress={onClose}
          hitSlop={8}
        >
          <X size={18} color={textSecondary} />
        </Pressable>
      </View>

      <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.bodyContent}>
        {/* Vùng chọn / kéo-thả tệp JSON bằng DOM thuần trên Web để WebKit/Safari luôn mở Finder */}
        {Platform.OS === 'web' ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(false);
              const file = e.dataTransfer?.files?.[0];
              if (file) {
                handleReadFile(file);
              }
            }}
            style={{
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: isDragging ? activeBorder : borderColor,
              backgroundColor: cardBg,
              borderRadius: 12,
              padding: '20px 16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              boxSizing: 'border-box',
            }}
          >
            <Upload size={22} color={textSecondary} />
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: textPrimary,
                textAlign: 'center',
                fontFamily:
                  "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
              }}
            >
              {selectedFilename
                ? selectedFilename
                : 'Kéo thả tệp .json vào đây hoặc chọn từ máy'}
            </span>
            <span
              style={{
                fontSize: 12,
                color: textMuted,
                textAlign: 'center',
                fontFamily:
                  "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
              }}
            >
              Hỗ trợ tệp sao lưu tomorrow-backup-*.json (schema v1)
            </span>

            <label
              htmlFor="tomorrow-backup-file-input"
              style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 6,
                padding: '8px 14px',
                borderRadius: 8,
                backgroundColor: btnPrimaryBg,
                color: btnPrimaryText,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                userSelect: 'none',
                fontFamily:
                  "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
              }}
            >
              <span>{selectedFilename ? 'Chọn tệp khác' : 'Chọn tệp .json'}</span>
              <input
                id="tomorrow-backup-file-input"
                type="file"
                accept=".json,application/json,text/plain"
                onChange={handleFileChange}
                onClick={(e) => {
                  // Reset value để chọn lại cùng 1 file vẫn kích hoạt onChange
                  e.currentTarget.value = '';
                }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  opacity: 0,
                  cursor: 'pointer',
                }}
              />
            </label>
          </div>
        ) : (
          <View
            style={[
              styles.dropZone,
              {
                backgroundColor: cardBg,
                borderColor,
              },
            ]}
          >
            <Upload size={22} color={textSecondary} />
            <Text style={[styles.dropTitle, { color: textPrimary }]}>
              {selectedFilename || 'Dán nội dung JSON để khôi phục dữ liệu'}
            </Text>
          </View>
        )}

        {/* Tùy chọn dự phòng gọn: Hoặc dán trực tiếp nội dung JSON */}
        <View style={styles.pasteToggleRow}>
          <Pressable
            onPress={() => setShowPasteBox((prev) => !prev)}
            style={({ pressed }) => [
              styles.pasteToggleBtn,
              pressed && { opacity: 0.7 },
              Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
            ]}
          >
            <Text style={[styles.pasteToggleText, { color: textSecondary }]}>
              {showPasteBox
                ? 'Ẩn khung dán nội dung JSON'
                : 'Hoặc dán trực tiếp nội dung JSON'}
            </Text>
          </Pressable>
        </View>

        {showPasteBox && (
          <View style={[styles.pasteCard, { backgroundColor: cardBg, borderColor }]}>
            {Platform.OS === 'web' ? (
              <textarea
                value={pastedJson}
                onChange={(e) => setPastedJson(e.target.value)}
                placeholder='Dán toàn bộ nội dung tệp tomorrow-backup-*.json vào đây...'
                rows={5}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  borderRadius: 8,
                  border: `1px solid ${borderColor}`,
                  backgroundColor: modalBg,
                  color: textPrimary,
                  padding: '8px 10px',
                  fontSize: 12,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  resize: 'vertical',
                  outline: 'none',
                }}
              />
            ) : (
              <TextInput
                multiline
                value={pastedJson}
                onChangeText={setPastedJson}
                placeholder='Dán nội dung JSON vào đây...'
                placeholderTextColor={textMuted}
                style={[
                  styles.pasteInputNative,
                  { backgroundColor: modalBg, borderColor, color: textPrimary },
                ]}
              />
            )}
            <View style={styles.pasteActionRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.checkJsonBtn,
                  {
                    backgroundColor: btnPrimaryBg,
                    opacity: !pastedJson.trim() ? 0.45 : pressed ? 0.85 : 1,
                  },
                  Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                ]}
                onPress={handleCheckPastedJson}
                disabled={!pastedJson.trim()}
              >
                <Text style={[styles.checkJsonBtnText, { color: btnPrimaryText }]}>
                  Kiểm tra JSON
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Thông báo lỗi cấu trúc JSON */}
        {validation && !validation.valid && (
          <View
            style={[
              styles.alertBox,
              {
                backgroundColor: isDark
                  ? 'rgba(239, 68, 68, 0.12)'
                  : 'rgba(239, 68, 68, 0.08)',
                borderColor: isDark
                  ? 'rgba(239, 68, 68, 0.35)'
                  : 'rgba(239, 68, 68, 0.25)',
              },
            ]}
          >
            <ShieldAlert size={18} color="#EF4444" />
            <Text style={[styles.alertText, { color: isDark ? '#FCA5A5' : '#B91C1C' }]}>
              {validation.error}
            </Text>
          </View>
        )}

        {/* Bảng thống kê xem trước & chọn chế độ */}
        {validation?.valid && validation.preview && (
          <>
            {!validation.checksumValid && validation.warning && (
              <View
                style={[
                  styles.alertBox,
                  {
                    backgroundColor: isDark
                      ? 'rgba(245, 158, 11, 0.12)'
                      : 'rgba(245, 158, 11, 0.08)',
                    borderColor: isDark
                      ? 'rgba(245, 158, 11, 0.35)'
                      : 'rgba(245, 158, 11, 0.28)',
                  },
                ]}
              >
                <AlertTriangle size={18} color="#F59E0B" />
                <Text style={[styles.alertText, { color: isDark ? '#FCD34D' : '#B45309' }]}>
                  {validation.warning}
                </Text>
              </View>
            )}

            <View style={[styles.previewCard, { backgroundColor: cardBg, borderColor }]}>
              <Text style={[styles.sectionLabel, { color: textMuted }]}>
                XEM TRƯỚC BẢN SAO LƯU
              </Text>

              <View style={styles.statsGrid}>
                <View style={[styles.statRow, { borderBottomColor: borderColor }]}>
                  <Text style={[styles.statKey, { color: textSecondary }]}>Ngày xuất</Text>
                  <Text style={[styles.statVal, { color: textPrimary }]}>
                    {formatIsoDate(validation.preview.exportedAt)}
                  </Text>
                </View>
                <View style={[styles.statRow, { borderBottomColor: borderColor }]}>
                  <Text style={[styles.statKey, { color: textSecondary }]}>Phiên bản</Text>
                  <Text style={[styles.statVal, { color: textPrimary }]}>
                    {validation.preview.appVersion}
                  </Text>
                </View>
                <View style={[styles.statRow, { borderBottomColor: borderColor }]}>
                  <Text style={[styles.statKey, { color: textSecondary }]}>Sổ ghi chú</Text>
                  <Text style={[styles.statVal, { color: textPrimary }]}>
                    {validation.preview.notebookCount} sổ
                  </Text>
                </View>
                <View style={[styles.statRow, { borderBottomColor: borderColor }]}>
                  <Text style={[styles.statKey, { color: textSecondary }]}>Đoạn chat & Tin nhắn</Text>
                  <Text style={[styles.statVal, { color: textPrimary }]}>
                    {validation.preview.sessionCount} phiên • {validation.preview.messageCount} tin nhắn
                  </Text>
                </View>
                <View style={[styles.statRow, { borderBottomColor: borderColor }]}>
                  <Text style={[styles.statKey, { color: textSecondary }]}>Học tập & Tài chính</Text>
                  <Text style={[styles.statVal, { color: textPrimary }]}>
                    {validation.preview.studySubjectCount} môn học • {validation.preview.financeGoalCount} mục tiêu
                  </Text>
                </View>
                <View style={[styles.statRow, { borderBottomWidth: 0 }]}>
                  <Text style={[styles.statKey, { color: textSecondary }]}>Trạng thái Checksum</Text>
                  <View style={styles.checksumBadgeRow}>
                    {validation.preview.checksumValid ? (
                      <>
                        <CheckCircle2 size={14} color="#10B981" />
                        <Text style={[styles.statVal, { color: '#10B981' }]}>
                          Hợp lệ (Toàn vẹn 100%)
                        </Text>
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={14} color="#F59E0B" />
                        <Text style={[styles.statVal, { color: '#F59E0B' }]}>
                          Không khớp
                        </Text>
                      </>
                    )}
                  </View>
                </View>
              </View>
            </View>

            {/* Lựa chọn phương thức khôi phục */}
            <View style={styles.modeSection}>
              <Text style={[styles.sectionLabel, { color: textMuted }]}>
                PHƯƠNG THỨC KHÔI PHỤC
              </Text>

              <Pressable
                style={[
                  styles.modeOption,
                  {
                    backgroundColor: restoreMode === 'MERGE' ? activeFill : cardBg,
                    borderColor: restoreMode === 'MERGE' ? activeBorder : borderColor,
                  },
                  Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                ]}
                onPress={() => setRestoreMode('MERGE')}
              >
                <Layers size={16} color={textPrimary} />
                <View style={styles.modeTextCol}>
                  <Text style={[styles.modeTitle, { color: textPrimary }]}>
                    Gộp thông minh (Merge — Không mất dữ liệu hiện tại)
                  </Text>
                  <Text style={[styles.modeDesc, { color: textSecondary }]}>
                    Bổ sung sổ & phiên mới, giữ bản chat đầy đủ hơn và giữ quota hôm nay.
                  </Text>
                </View>
              </Pressable>

              <Pressable
                style={[
                  styles.modeOption,
                  {
                    backgroundColor: restoreMode === 'REPLACE' ? activeFill : cardBg,
                    borderColor: restoreMode === 'REPLACE' ? activeBorder : borderColor,
                  },
                  Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                ]}
                onPress={() => setRestoreMode('REPLACE')}
              >
                <RefreshCw size={16} color={textPrimary} />
                <View style={styles.modeTextCol}>
                  <Text style={[styles.modeTitle, { color: textPrimary }]}>
                    Ghi đè toàn bộ (Replace — Đưa về đúng bản sao lưu)
                  </Text>
                  <Text style={[styles.modeDesc, { color: textSecondary }]}>
                    Thay thế toàn bộ 5 khóa dữ liệu cục bộ bằng nội dung trong tệp JSON.
                  </Text>
                </View>
              </Pressable>
            </View>

            {successMessage && (
              <View
                style={[
                  styles.alertBox,
                  {
                    backgroundColor: isDark
                      ? 'rgba(16, 185, 129, 0.14)'
                      : 'rgba(16, 185, 129, 0.10)',
                    borderColor: 'rgba(16, 185, 129, 0.35)',
                  },
                ]}
              >
                <CheckCircle2 size={18} color="#10B981" />
                <Text style={[styles.alertText, { color: isDark ? '#6EE7B7' : '#047857' }]}>
                  {successMessage}
                </Text>
              </View>
            )}

            <View style={styles.footerActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.cancelBtn,
                  { borderColor, opacity: pressed ? 0.7 : 1 },
                  Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                ]}
                onPress={onClose}
              >
                <Text style={[styles.cancelBtnText, { color: textSecondary }]}>Hủy</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.confirmBtn,
                  {
                    backgroundColor: btnPrimaryBg,
                    opacity: isRestoring ? 0.6 : pressed ? 0.85 : 1,
                  },
                  Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                ]}
                onPress={handleConfirmRestore}
                disabled={isRestoring}
              >
                <Text style={[styles.confirmBtnText, { color: btnPrimaryText }]}>
                  {isRestoring ? 'Đang khôi phục...' : 'Xác nhận khôi phục'}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {Platform.OS === 'web' ? (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.62)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 16,
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 560,
              maxHeight: '88vh',
              backgroundColor: modalBg,
              borderRadius: 16,
              border: `1px solid ${borderColor}`,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.38)',
              animation: 'macosPalettePop 200ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
            }}
          >
            {modalContentInner}
          </div>
        </div>
      ) : (
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable
            style={[styles.modalContainer, { backgroundColor: modalBg, borderColor }]}
            onPress={(e) => e.stopPropagation()}
          >
            {modalContentInner}
          </Pressable>
        </Pressable>
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '88%',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.38,
    shadowRadius: 28,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  headerTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    letterSpacing: -0.2,
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
        : undefined,
  },
  closeButton: {
    padding: 4,
    borderRadius: 6,
  },
  bodyScroll: {
    flexGrow: 0,
  },
  bodyContent: {
    padding: 18,
    gap: 12,
  },
  dropZone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dropTitle: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  pasteToggleRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pasteToggleBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  pasteToggleText: {
    fontSize: 12.5,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  pasteCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 8,
  },
  pasteInputNative: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    minHeight: 90,
    fontSize: 12,
    textAlignVertical: 'top',
  },
  pasteActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  checkJsonBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  checkJsonBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  alertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  alertText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  previewCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  statsGrid: {
    gap: 0,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
  },
  statKey: {
    fontSize: 13,
    fontWeight: '500',
  },
  statVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  checksumBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  modeSection: {
    gap: 8,
  },
  modeOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  modeTextCol: {
    flex: 1,
    gap: 2,
  },
  modeTitle: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  modeDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 2,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  confirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 9,
  },
  confirmBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
});
