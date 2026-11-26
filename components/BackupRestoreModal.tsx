import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (visible) {
      setSelectedFilename('');
      setValidation(null);
      setRestoreMode('MERGE');
      setIsDragging(false);
      setIsRestoring(false);
      setSuccessMessage(null);
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

  const handleTriggerFileInput = () => {
    if (Platform.OS === 'web' && fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
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

  const dropZoneWebHandlers =
    Platform.OS === 'web'
      ? ({
          onDragOver: (e: any) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(true);
          },
          onDragLeave: (e: any) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
          },
          onDrop: (e: any) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
              handleReadFile(files[0]);
            }
          },
        } as any)
      : {};

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[
          styles.overlay,
          Platform.OS === 'web' && ({ backdropFilter: 'blur(6px)' } as any),
        ]}
        onPress={onClose}
      >
        <Pressable
          style={[
            styles.modalContainer,
            { backgroundColor: modalBg, borderColor },
            Platform.OS === 'web' &&
              ({
                animation: 'macosPalettePop 200ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
              } as any),
          ]}
          onPress={(e) => e.stopPropagation()}
        >
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
            {Platform.OS === 'web' && (
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleReadFile(file);
                }}
              />
            )}

            {/* Vùng chọn / kéo-thả tệp JSON */}
            <View
              {...dropZoneWebHandlers}
              style={[
                styles.dropZone,
                {
                  backgroundColor: cardBg,
                  borderColor: isDragging ? activeBorder : borderColor,
                },
              ]}
            >
              <Upload size={22} color={textSecondary} />
              <Text style={[styles.dropTitle, { color: textPrimary }]}>
                {selectedFilename
                  ? selectedFilename
                  : 'Kéo thả tệp .json vào đây hoặc chọn từ máy'}
              </Text>
              <Text style={[styles.dropSubtitle, { color: textMuted }]}>
                Hỗ trợ tệp sao lưu tomorrow-backup-*.json (schema v1)
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.pickBtn,
                  {
                    backgroundColor: btnPrimaryBg,
                    opacity: pressed ? 0.85 : 1,
                  },
                  Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                ]}
                onPress={handleTriggerFileInput}
              >
                <Text style={[styles.pickBtnText, { color: btnPrimaryText }]}>
                  {selectedFilename ? 'Chọn tệp khác' : 'Chọn tệp .json'}
                </Text>
              </Pressable>
            </View>

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
        </Pressable>
      </Pressable>
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
    gap: 14,
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
  dropSubtitle: {
    fontSize: 12,
    textAlign: 'center',
  },
  pickBtn: {
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  pickBtnText: {
    fontSize: 13,
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
