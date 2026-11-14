export type DiceType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';

export type TableSurface =
  | 'dark_wood'
  | 'green_felt'
  | 'red_velvet'
  | 'midnight_felt'
  | 'obsidian_stone';

export interface DiceConfig {
  scale: number;
  themeId: string;
  primaryColor: string;
  secondaryColor: string;
  numeralColor: string;
  metalness: number;
  roughness: number;
}

export interface DiceTheme {
  id: string;
  name: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
  numeralColor: string;
  metalness: number;
  roughness: number;
}

export interface TableSurfaceOption {
  id: TableSurface;
  name: string;
  accent: string;
  bgColor: string;
}

export interface RollResult {
  total: number;
  individualRolls: number[];
  modifier: number;
  notation: string;
  isCritSuccess: boolean;
  isCritFail: boolean;
}

export interface OllamaConfig {
  endpoint: string;
  model: string;
  temperature: number;
}

export const DICE_THEMES: DiceTheme[] = [
  {
    id: 'brass',
    name: 'Oro y Latón',
    description: 'Pátina medieval clásica y reflejos dorados',
    primaryColor: '#2e2318',
    secondaryColor: '#0c0805',
    numeralColor: '#fff9e6',
    metalness: 0.8,
    roughness: 0.35,
  },
  {
    id: 'ruby',
    name: 'Rubí de Dragón',
    description: 'Carmesí profundo con inscripciones doradas',
    primaryColor: '#5c0d16',
    secondaryColor: '#1f0407',
    numeralColor: '#ffd700',
    metalness: 0.45,
    roughness: 0.2,
  },
  {
    id: 'emerald',
    name: 'Esmeralda Arcana',
    description: 'Verde bosque profundo con brillo místico',
    primaryColor: '#0e4a30',
    secondaryColor: '#031f13',
    numeralColor: '#ebfffa',
    metalness: 0.5,
    roughness: 0.25,
  },
  {
    id: 'obsidian',
    name: 'Obsidiana Volcánica',
    description: 'Negro azabache pulido con caracteres en blanco puro',
    primaryColor: '#18181b',
    secondaryColor: '#050507',
    numeralColor: '#ffffff',
    metalness: 0.9,
    roughness: 0.15,
  },
  {
    id: 'amethyst',
    name: 'Amatista Sombría',
    description: 'Púrpura arcano con runas en plata brillante',
    primaryColor: '#451347',
    secondaryColor: '#18041a',
    numeralColor: '#f3dcff',
    metalness: 0.6,
    roughness: 0.25,
  },
  {
    id: 'lapis',
    name: 'Lapislázuli Real',
    description: 'Azul cobalto imperial con grabados en oro',
    primaryColor: '#0f275e',
    secondaryColor: '#040b21',
    numeralColor: '#ffd875',
    metalness: 0.7,
    roughness: 0.25,
  },
  {
    id: 'ivory',
    name: 'Hueso y Marfil',
    description: 'Hueso ancestral tallado con tinta rúnica oscura',
    primaryColor: '#d6caa9',
    secondaryColor: '#8a7d5c',
    numeralColor: '#1a1207',
    metalness: 0.05,
    roughness: 0.75,
  },
  {
    id: 'sunfire',
    name: 'Fuego Solar',
    description: 'Ámbar abrasador con números incandescentes',
    primaryColor: '#8a3307',
    secondaryColor: '#330e00',
    numeralColor: '#fff1a8',
    metalness: 0.5,
    roughness: 0.3,
  },
];

export const DEFAULT_DICE_CONFIG: DiceConfig = {
  scale: 1,
  themeId: 'brass',
  primaryColor: '#2e2318',
  secondaryColor: '#0c0805',
  numeralColor: '#fff9e6',
  metalness: 0.8,
  roughness: 0.35,
};

export const TABLE_SURFACES: TableSurfaceOption[] = [
  { id: 'dark_wood', name: 'Madera de Roble Oscuro', accent: '#d4af37', bgColor: '#140f0a' },
  { id: 'green_felt', name: 'Tapete Verde Taberna', accent: '#4ade80', bgColor: '#0b2615' },
  { id: 'red_velvet', name: 'Terciopelo Carmesí Real', accent: '#f87171', bgColor: '#2b090e' },
  { id: 'midnight_felt', name: 'Tapete Azul Medianoche', accent: '#60a5fa', bgColor: '#0b162c' },
  { id: 'obsidian_stone', name: 'Losa de Piedra Ancestral', accent: '#94a3b8', bgColor: '#111317' },
];

export const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
  endpoint: 'http://localhost:11434',
  model: 'qwen3.8:latest',
  temperature: 0.7,
};
