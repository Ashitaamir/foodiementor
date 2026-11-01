// FoodieMentor look: blush background, navy text, pixel accents.
export const colors = {
  blush: '#F5C0BA',
  navy: '#1B1B3A',
  cream: '#FFF8F0',
  plum: '#4A2A3A',
  berry: '#7A1235',
  placeholder: '#6E4E5A',
  fieldLine: '#D98E87',
  lycheePink: '#FF5C8A',
  lycheeRed: '#E8325F',
  arcadeYellow: '#FFD23F',
  leafGreen: '#3DDC84',
} as const;

// Pixel font only for the app name, headings and buttons; Nunito for everything else.
export const fonts = {
  pixel: 'PressStart2P_400Regular',
  body: 'Nunito_600SemiBold',
  bodyBold: 'Nunito_700Bold',
  bodyHeavy: 'Nunito_800ExtraBold',
} as const;
