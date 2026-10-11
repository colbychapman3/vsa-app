// Design B "Ship Plan" (Colby, 2026-10-11): Schibsted Grotesk for numbers, headings and text, DM Mono for small
// labels and times. Light (steel grey and navy) plus a Night palette; values in palette.ts.
import { createContext, useContext } from 'react';
import { Appearance, DynamicColorIOS, Platform, Settings as DeviceSettings, useColorScheme, type ColorValue } from 'react-native';
import { light, night, sunLight, type Token } from './palette.ts';
// One import per weight: the packages' index files require every weight and style (32 files, 4.8 MB) into the app bundle.
import { SchibstedGrotesk_400Regular } from '@expo-google-fonts/schibsted-grotesk/400Regular';
import { SchibstedGrotesk_500Medium } from '@expo-google-fonts/schibsted-grotesk/500Medium';
import { SchibstedGrotesk_600SemiBold } from '@expo-google-fonts/schibsted-grotesk/600SemiBold';
import { SchibstedGrotesk_700Bold } from '@expo-google-fonts/schibsted-grotesk/700Bold';
import { SchibstedGrotesk_900Black } from '@expo-google-fonts/schibsted-grotesk/900Black';
import { DMMono_500Medium } from '@expo-google-fonts/dm-mono/500Medium';

// Every token is a DynamicColorIOS pair (Light / Night, values in palette.ts), so screens keep reading color.ink etc.
// and iOS swaps them when the appearance changes. react-native-svg accepts these (its extractBrush handles dynamic colors).
// Extra visible swaps the Light palette for sunLight. Colors are fixed when the app starts, so the choice is mirrored in the
// iPhone's own preferences (read at once, before the database opens) and applies on the next launch.
const SUN_KEY = 'vsa.extraVisible';
const readSun = () => { try { return Platform.OS === 'ios' && DeviceSettings.get(SUN_KEY) === '1'; } catch { return false; } };
export const sunPaletteLoaded = readSun();
export function setSunPalette(on: boolean) { try { if (Platform.OS === 'ios') DeviceSettings.set({ [SUN_KEY]: on ? '1' : '0' }); } catch { /* the loaded palette stays */ } }
const day = sunPaletteLoaded ? sunLight : light;
const make = (k: Token): ColorValue => (Platform.OS === 'ios' ? DynamicColorIOS({ light: day[k], dark: night[k] }) : day[k]);
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
  SchibstedGrotesk_400Regular,
  SchibstedGrotesk_500Medium,
  SchibstedGrotesk_600SemiBold,
  SchibstedGrotesk_700Bold,
  SchibstedGrotesk_900Black,
  DMMono_500Medium,
};

// H.A. is blue. Pace is blue too while it equals H.A.; when it differs it turns dark orange so the difference is seen at a glance.
// Dim layer behind the sidebar; the same in Light and Night.
export const SCRIM = 'rgba(0,0,0,0.5)';

export const HA_COLOR = color.blue;
export const PACE_COLOR = color.oInk;

// If fonts fail to load, fall back to system fonts rather than block the app.
export function fonts(loaded: boolean) {
  return {
    display: loaded ? 'SchibstedGrotesk_900Black' : undefined,
    displaySemi: loaded ? 'SchibstedGrotesk_700Bold' : undefined,
    body: loaded ? 'SchibstedGrotesk_400Regular' : undefined,
    bodyMedium: loaded ? 'SchibstedGrotesk_500Medium' : undefined,
    bodySemi: loaded ? 'SchibstedGrotesk_600SemiBold' : undefined,
    mono: loaded ? 'DMMono_500Medium' : undefined,
  };
}

// Gloves: nothing tappable smaller than this (points).
export const TAP = 56;

// Depth: soft shadows lift cards and buttons off the page. A black shadow cannot show on the dark Night page, so the shadow
// color goes clear there and the card border carries the edge (the header and tab bar are the same dark as the page).
const shade: ColorValue = Platform.OS === 'ios' ? DynamicColorIOS({ light: '#000000', dark: '#00000000' }) : '#000000';
export const elev = {
  card: { shadowColor: shade, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 8 },
  raised: { shadowColor: shade, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.26, shadowRadius: 8 },
} as const;

// Font families for the current load state; provided once in App.tsx (already stepped up when Extra visible is on).
export const FontContext = createContext(fonts(false));
export const useType = () => useContext(FontContext);

// Extra visible: 2 pt ink borders and a point more on running text. Families are stepped in App.tsx through sunFamilies().
export const SunContext = createContext(false);
export const useSun = () => useContext(SunContext);
// Border colors are fixed on the layer, and iOS resolves a dynamic color there with the phone's own Light/Dark, not the app's
// forced Night, so Extra visible's black outline vanished on the dark page. The outline is therefore picked from the app's scheme.
export function useEdge() {
  const sun = useSun(), dark = useColorScheme() === 'dark';
  return sun ? { borderWidth: 2, borderColor: dark ? night.ink : (sunPaletteLoaded ? sunLight : light).ink } : null;
}
