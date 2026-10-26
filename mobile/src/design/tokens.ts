export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  card: 16,
  nav: 22,
  control: 999,
} as const;

export const type = {
  display: 34,
  page: 28,
  section: 22,
  card: 18,
  body: 16,
  support: 15,
  caption: 13,
  button: 16,
  time: 20,
  lesson: 22,
  meta: 13,
} as const;

export const font = {
  regular: 'IBMPlexSans_400Regular',
  medium: 'IBMPlexSans_500Medium',
  semibold: 'IBMPlexSans_600SemiBold',
  bold: 'IBMPlexSans_700Bold',
} as const;

export const icon = {
  size: 24,
  stroke: 1.75,
} as const;

export const band = {
  compact: 600,
  wide: 840,
  detailMin: 320,
  listMin: 280,
  rail: 76,
  railExpanded: 216,
  day: 136,
  time: 52,
} as const;

export const light = {
  midnight: '#1F3C88',
  navyDeep: '#142654',
  paper: '#F6F6F3',
  surface: '#FFFFFF',
  ink: '#111827',
  muted: '#667085',
  accent: '#1F3C88',
  primaryContainer: '#ECF1FA',
  onHero: '#FFFFFF',
  hero: '#1F3C88',
  ok: '#0F9F6E',
  danger: '#D92D20',
  warning: '#B58100',
  warningSurface: '#FEF7E6',
  info: '#2EC4B6',
  line: '#E6E6E1',
  gold: '#F4B400',
  goldSurface: '#FEF7E6',
  teal: '#159A8C',
  tealSurface: '#EAF7F5',
};

export const dark = {
  midnight: '#1F3C88',
  navyDeep: '#0B1430',
  paper: '#0E1730',
  surface: '#16244A',
  ink: '#F8FAFC',
  muted: '#A8B3C7',
  accent: '#F4B400',
  primaryContainer: '#1A2F6E',
  onHero: '#FFFFFF',
  hero: '#1F3C88',
  ok: '#34D399',
  danger: '#F87171',
  warning: '#F4B400',
  warningSurface: '#3A3010',
  info: '#2EC4B6',
  line: '#2A3A62',
  gold: '#F4B400',
  goldSurface: '#3A3010',
  teal: '#2EC4B6',
  tealSurface: '#123834',
};

export type Palette = typeof light;

export const turkishGlyphs = 'AaĞğÜüŞşİıÖöÇç';
