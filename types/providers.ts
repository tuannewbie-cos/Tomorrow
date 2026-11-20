/**
 * Tomorrow 90-Day Jarvis Foundation — AI Provider Gateway Configuration
 * Prepares Tomorrow for Phase 6 (Day 85) Multi-Provider Expansion:
 * OpenAI, Gemini, Claude, DeepSeek, Local Ollama.
 */

export type AIProviderId = 'openai' | 'gemini' | 'claude' | 'deepseek' | 'local_ollama';

export interface AIProviderConfig {
  id: AIProviderId;
  name: string;
  enabled: boolean;
  supportsVision: boolean;
  supportsJson: boolean;
  priority: number;
  models: string[];
  apiKeyEnv?: string;
  baseUrl?: string;
  defaultMaxTokens?: number;
  defaultTemperature?: number;
}

export const DEFAULT_AI_PROVIDERS: AIProviderConfig[] = [
  {
    id: 'openai',
    name: 'OpenAI (Primary Ultra-Fast Brain)',
    enabled: true,
    supportsVision: true,
    supportsJson: true,
    priority: 1,
    models: ['gpt-4o-mini', 'gpt-4o'],
    apiKeyEnv: 'EXPO_PUBLIC_OPENAI_API_KEY',
    defaultMaxTokens: 250,
    defaultTemperature: 0.75,
  },
  {
    id: 'gemini',
    name: 'Google Gemini (Resilient Free Chain)',
    enabled: true,
    supportsVision: true,
    supportsJson: true,
    priority: 2,
    models: [
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3.1-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash',
    ],
    apiKeyEnv: 'EXPO_PUBLIC_GEMINI_API_KEY',
    defaultMaxTokens: 1200,
    defaultTemperature: 0.7,
  },
  {
    id: 'claude',
    name: 'Anthropic Claude (Deep Reasoning & STEM)',
    enabled: false,
    supportsVision: true,
    supportsJson: true,
    priority: 3,
    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    apiKeyEnv: 'CLAUDE_API_KEY',
    defaultMaxTokens: 2000,
    defaultTemperature: 0.35,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek (Quant & Code Optimization)',
    enabled: false,
    supportsVision: false,
    supportsJson: true,
    priority: 4,
    models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultMaxTokens: 2000,
    defaultTemperature: 0.35,
  },
  {
    id: 'local_ollama',
    name: 'Local Ollama (100% Private On-Device)',
    enabled: false,
    supportsVision: false,
    supportsJson: true,
    priority: 5,
    models: ['llama3.2:3b', 'qwen2.5-coder:7b', 'deepseek-r1:8b'],
    baseUrl: 'http://localhost:11434',
    defaultMaxTokens: 1500,
    defaultTemperature: 0.4,
  },
];
