export type ThemeMode = 'dark' | 'light';

export interface ThemeColors {
  mode: ThemeMode;
  bgMain: string;
  bgHeader: string;
  bgSidebar: string;
  borderSubtle: string;
  // Chat Bubble & Indicator
  bubbleAI: string;
  textAI: string;
  borderAI: string;
  bubbleUser: string;
  textUser: string;
  // Input bar
  inputWrapperBg: string;
  inputBg: string;
  inputBorder: string;
  inputText: string;
  placeholderText: string;
  // Sidebar items
  sidebarItemActiveBg: string;
  sidebarItemActiveText: string;
  sidebarItemActiveSubtext: string;
  sidebarItemHoverBg: string;
  // Text & Icons
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  btnBg: string;
  btnHover: string;
  btnIcon: string;
  // Live badge
  liveBadgeBg: string;
  liveBadgeText: string;
}

export const DARK_THEME: ThemeColors = {
  mode: 'dark',
  bgMain: '#0B0D11',
  bgHeader: '#12151C',
  bgSidebar: '#12151C',
  borderSubtle: '#1E2330',
  bubbleAI: '#1E222D',
  textAI: '#F1F5F9',
  borderAI: '#282E3D',
  bubbleUser: '#2563EB',
  textUser: '#FFFFFF',
  inputWrapperBg: 'transparent',
  inputBg: '#161922',
  inputBorder: '#262B38',
  inputText: '#F8FAFC',
  placeholderText: '#64748B',
  sidebarItemActiveBg: '#1E2433',
  sidebarItemActiveText: '#F1F5F9',
  sidebarItemActiveSubtext: '#94A3B8',
  sidebarItemHoverBg: '#1E2433',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  btnBg: '#1E222D',
  btnHover: '#2A303F',
  btnIcon: '#E2E8F0',
  liveBadgeBg: 'rgba(16, 185, 129, 0.15)',
  liveBadgeText: '#10B981',
};

export const LIGHT_THEME: ThemeColors = {
  mode: 'light',
  bgMain: '#F8FAFC',
  bgHeader: '#FFFFFF',
  bgSidebar: '#F1F5F9',
  borderSubtle: '#E2E8F0',
  bubbleAI: '#FFFFFF',
  textAI: '#0F172A',
  borderAI: '#E2E8F0',
  bubbleUser: '#2563EB',
  textUser: '#FFFFFF',
  inputWrapperBg: 'transparent',
  inputBg: '#FFFFFF',
  inputBorder: '#CBD5E1',
  inputText: '#0F172A',
  placeholderText: '#94A3B8',
  sidebarItemActiveBg: '#E2E8F0',
  sidebarItemActiveText: '#0F172A',
  sidebarItemActiveSubtext: '#64748B',
  sidebarItemHoverBg: '#E2E8F0',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  btnBg: '#F1F5F9',
  btnHover: '#E2E8F0',
  btnIcon: '#334155',
  liveBadgeBg: 'rgba(16, 185, 129, 0.12)',
  liveBadgeText: '#059669',
};

export const THEME_STORAGE_KEY = 'TOMORROW_THEME_MODE';
