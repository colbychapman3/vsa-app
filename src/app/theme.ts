// Look of the VSA Live tracker (docs/reference/vsa-live.html :root): light hi-vis (plus a Night palette)
// theme, Barlow Condensed for big numbers and headings, IBM Plex Sans for text.
import { createContext, useContext } from 'react';
import { Appearance, DynamicColorIOS, Platform, type ColorValue } from 'react-native';
import { light, night, type Token } from './palette.ts';
import {
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
} from '@expo-google-fonts/barlow-condensed';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans';

// Every token is a DynamicColorIOS pair (Light / Night, values in palette.ts), so screens keep reading color.ink etc.
// and iOS swaps them when the appearance changes. react-native-svg accepts these (its extractBrush handles dynamic colors).
const make = (k: Token): ColorValue => (Platform.OS === 'ios' ? DynamicColorIOS({ light: light[k], dark: night[k] }) : light[k]);
export const color = Object.fromEntries((Object.keys(light) as Token[]).map((k) => [k, make(k)])) as Record<Token, ColorValue>;

// Settings > Appearance. Light is the default; Auto follows the iPhone. Applied at startup, before the first screen.
export type AppearanceMode = 'light' | 'night' | 'auto';
export const APPEARANCES: AppearanceMode[] = ['light', 'night', 'auto'];
export const asAppearance = (v: string | null): AppearanceMode => (v === 'night' || v === 'auto' ? v : 'light');
export function applyAppearance(m: AppearanceMode) {
  Appearance.setColorScheme(m === 'night' ? 'dark' : m === 'auto' ? 'unspecified' : 'light');
}

// Loaded once in App.tsx. Bundled with the app, so they work offline.
export const fontFiles = {
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
};

// H.A. is blue. Pace is blue too while it equals H.A.; when it differs it turns dark orange so the difference is seen at a glance.
// Dim layer behind the sidebar; the same in Light and Night.
export const SCRIM = 'rgba(0,0,0,0.5)';

export const HA_COLOR = color.blue;
export const PACE_COLOR = color.oInk;

// If fonts fail to load, fall back to system fonts rather than block the app.
export function fonts(loaded: boolean) {
  return {
    display: loaded ? 'BarlowCondensed_700Bold' : undefined,
    displaySemi: loaded ? 'BarlowCondensed_600SemiBold' : undefined,
    body: loaded ? 'IBMPlexSans_400Regular' : undefined,
    bodyMedium: loaded ? 'IBMPlexSans_500Medium' : undefined,
    bodySemi: loaded ? 'IBMPlexSans_600SemiBold' : undefined,
  };
}

// Gloves: nothing tappable smaller than this (points).
export const TAP = 56;

// Font families for the current load state; provided once in App.tsx.
export const FontContext = createContext(fonts(false));
export const useType = () => useContext(FontContext);
