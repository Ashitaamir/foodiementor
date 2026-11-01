import 'expo-sqlite/localStorage/install';

import { reloadAppAsync } from 'expo';

// FoodieMentor looks: pixel accents with one of two colour themes.
// Styles are built once when the app starts, so changing theme saves the choice
// and restarts the app (takes a moment, nothing is lost).
export type ThemeName = 'colorful' | 'dark';

type Palette = {
  background: string; // page behind everything
  navy: string; // "ink": main text, outlines, hard shadows, main buttons
  cream: string; // cards and inputs, and text on ink-filled buttons
  plum: string; // secondary text
  berry: string; // links and error messages
  placeholder: string;
  fieldLine: string; // soft dividers
  lycheePink: string; // main accent
  lycheeRed: string;
  arcadeYellow: string; // highlight / selected
  leafGreen: string;
  sky: string;
  grape: string;
  onAccent: string; // text drawn on top of an accent colour
  onInkMuted: string; // quieter text on ink-filled areas
  inkSoft: string; // a step lighter than ink (empty bar segments, console shading)
  inkDeep: string; // a step darker than ink
  bezel: string; // console screen surround
  screen: string; // console LCD
  field: string; // text input background
  consoleBody: string; // console banded gradient
  holoPink: string; // sign-in card gradients
  holoGold: string;
  statusBar: 'light' | 'dark';
};

const COLORFUL: Palette = {
  background: '#DCD3F7', // lavender arcade
  navy: '#1B1B3A',
  cream: '#FFF8F0',
  plum: '#4A2A3A',
  berry: '#7A1235',
  placeholder: '#6E4E5A',
  fieldLine: '#A99CDB',
  lycheePink: '#FF5C8A',
  lycheeRed: '#E8325F',
  arcadeYellow: '#FFD23F',
  leafGreen: '#3DDC84',
  sky: '#5CC8FF',
  grape: '#B07CFF',
  onAccent: '#1B1B3A',
  onInkMuted: '#D9D6F2',
  inkSoft: '#3A3A70',
  inkDeep: '#14142C',
  bezel: '#2A2A55',
  screen: '#9FD8A8',
  field: '#FFFFFF',
  consoleBody:
    'linear-gradient(180deg, #F1F3F6 0%, #F1F3F6 16%, #CDD2DA 16%, #CDD2DA 74%, #AEB4BE 74%, #AEB4BE 100%)',
  holoPink: 'linear-gradient(160deg, #FF8FB0, #FF5C8A 60%, #E8325F)',
  holoGold: 'linear-gradient(160deg, #FFE57F, #FFD23F 60%, #F2B705)',
  statusBar: 'dark',
};

// Black and silver: near-black page, charcoal cards, silver ink. Accents turn into
// silver tones with black text on them; Lilo keeps her own pink so she stands out.
const DARK: Palette = {
  background: '#0E0F12',
  navy: '#D3D8DF',
  cream: '#1B1D22',
  plum: '#A3A9B3',
  berry: '#F2A7B8',
  placeholder: '#7C828D',
  fieldLine: '#3A3D45',
  lycheePink: '#9AA1AC',
  lycheeRed: '#E8325F',
  arcadeYellow: '#E4E7EC',
  leafGreen: '#B5C9BC',
  sky: '#B3C3D4',
  grape: '#C3BAD6',
  onAccent: '#0E0F12',
  onInkMuted: '#3E424C',
  inkSoft: '#2A2C33',
  inkDeep: '#5A5F6B',
  bezel: '#08090B',
  screen: '#B9C8BD',
  field: '#24262C',
  consoleBody:
    'linear-gradient(180deg, #5A5F6B 0%, #5A5F6B 16%, #3E424C 16%, #3E424C 74%, #2E3139 74%, #2E3139 100%)',
  holoPink: 'linear-gradient(160deg, #E4E7EC, #AEB4BE 60%, #8E95A1)',
  holoGold: 'linear-gradient(160deg, #F1F3F6, #CDD2DA 60%, #9AA1AC)',
  statusBar: 'light',
};

export const THEMES: Record<ThemeName, { label: string; detail: string; palette: Palette }> = {
  colorful: { label: 'Colorful', detail: 'Lavender, pink and arcade yellow', palette: COLORFUL },
  dark: { label: 'Dark', detail: 'Black and silver', palette: DARK },
};

const STORAGE_KEY = 'fm-theme';

function savedTheme(): ThemeName {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return value === 'dark' ? 'dark' : 'colorful';
  } catch {
    return 'colorful';
  }
}

export const themeName: ThemeName = savedTheme();
export const colors: Palette = THEMES[themeName].palette;

// Save the new theme and restart so every screen picks it up
export async function setTheme(name: ThemeName) {
  if (name === themeName) return;
  globalThis.localStorage?.setItem(STORAGE_KEY, name);
  await reloadAppAsync('Theme changed');
}

// Pixel font only for the app name, headings and buttons; Nunito for everything else.
export const fonts = {
  pixel: 'PressStart2P_400Regular',
  body: 'Nunito_600SemiBold',
  bodyBold: 'Nunito_700Bold',
  bodyHeavy: 'Nunito_800ExtraBold',
} as const;
