// The app's Text and TextInput: React Native's, with the Dynamic Type ceiling built in. iOS "Larger Accessibility Sizes" scales
// text up to 3.1x; the layouts here hold to MAX_TEXT_SCALE (Colby's phone check at the largest size, 2026-10-14: "Closeo/ut",
// a four-line title, numbers larger than their cards). RN has no global switch, so every screen imports Text from here;
// ESLint refuses the react-native one in src/app and App.tsx. A component may still pass its own, lower, maxFontSizeMultiplier.
import { Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from 'react-native';
import { MAX_TEXT_SCALE } from '../theme.ts';

export function Text(p: TextProps) {
  return <RNText maxFontSizeMultiplier={MAX_TEXT_SCALE} {...p} />;
}

export function TextInput(p: TextInputProps) {
  return <RNTextInput maxFontSizeMultiplier={MAX_TEXT_SCALE} {...p} />;
}
