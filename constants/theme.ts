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
  bgMain: '#171717',
  bgHeader: '#171717',
  bgSidebar: '#141416',
  borderSubtle: 'rgba(255, 255, 255, 0.07)',
  bubbleAI: '#222222',
  textAI: '#F4F4F5',
  borderAI: '#2E2E2E',
  bubbleUser: '#2563EB',
  textUser: '#FFFFFF',
  inputWrapperBg: 'transparent',
  inputBg: '#262626',
  inputBorder: '#363636',
  inputText: '#F3F4F6',
  placeholderText: '#8E8E93',
  sidebarItemActiveBg: '#222226',
  sidebarItemActiveText: '#F4F4F5',
  sidebarItemActiveSubtext: '#A1A1AA',
  sidebarItemHoverBg: 'rgba(255, 255, 255, 0.045)',
  textPrimary: '#F4F4F5',
  textSecondary: '#A1A1AA',
  textMuted: '#71717A',
  btnBg: '#262626',
  btnHover: '#303030',
  btnIcon: '#E4E4E7',
  liveBadgeBg: 'rgba(16, 185, 129, 0.15)',
  liveBadgeText: '#10B981',
};

export const LIGHT_THEME: ThemeColors = {
  mode: 'light',
  bgMain: '#FFFFFF',
  bgHeader: '#FFFFFF',
  bgSidebar: '#F7F7F8',
  borderSubtle: '#E6E6EA',
  bubbleAI: '#F9FAFB',
  textAI: '#111113',
  borderAI: '#E5E7EB',
  bubbleUser: '#2563EB',
  textUser: '#FFFFFF',
  inputWrapperBg: 'transparent',
  inputBg: '#FFFFFF',
  inputBorder: '#E2E4E8',
  inputText: '#18181B',
  placeholderText: '#9CA3AF',
  sidebarItemActiveBg: '#FFFFFF',
  sidebarItemActiveText: '#111113',
  sidebarItemActiveSubtext: '#52525B',
  sidebarItemHoverBg: 'rgba(0, 0, 0, 0.04)',
  textPrimary: '#111113',
  textSecondary: '#52525B',
  textMuted: '#71717A',
  btnBg: '#F4F4F5',
  btnHover: '#E4E4E7',
  btnIcon: '#27272A',
  liveBadgeBg: 'rgba(16, 185, 129, 0.12)',
  liveBadgeText: '#059669',
};

export const THEME_STORAGE_KEY = 'TOMORROW_THEME_MODE';
