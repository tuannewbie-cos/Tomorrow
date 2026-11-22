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
  bgSidebar: '#202020',
  borderSubtle: '#2E2E2E',
  bubbleAI: '#222222',
  textAI: '#F3F4F6',
  borderAI: '#2E2E2E',
  bubbleUser: '#2563EB',
  textUser: '#FFFFFF',
  inputWrapperBg: 'transparent',
  inputBg: '#262626',
  inputBorder: '#363636',
  inputText: '#F3F4F6',
  placeholderText: '#8E8E93',
  sidebarItemActiveBg: '#2C2C2E',
  sidebarItemActiveText: '#F3F4F6',
  sidebarItemActiveSubtext: '#A1A1AA',
  sidebarItemHoverBg: '#282828',
  textPrimary: '#F3F4F6',
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
  bgSidebar: '#F5F5F7',
  borderSubtle: '#E5E7EB',
  bubbleAI: '#F9FAFB',
  textAI: '#18181B',
  borderAI: '#E5E7EB',
  bubbleUser: '#2563EB',
  textUser: '#FFFFFF',
  inputWrapperBg: 'transparent',
  inputBg: '#FFFFFF',
  inputBorder: '#E2E4E8',
  inputText: '#18181B',
  placeholderText: '#9CA3AF',
  sidebarItemActiveBg: '#EAEAEE',
  sidebarItemActiveText: '#18181B',
  sidebarItemActiveSubtext: '#52525B',
  sidebarItemHoverBg: '#EAEAEA',
  textPrimary: '#18181B',
  textSecondary: '#52525B',
  textMuted: '#A1A1AA',
  btnBg: '#F4F4F5',
  btnHover: '#E4E4E7',
  btnIcon: '#27272A',
  liveBadgeBg: 'rgba(16, 185, 129, 0.12)',
  liveBadgeText: '#059669',
};

export const THEME_STORAGE_KEY = 'TOMORROW_THEME_MODE';
