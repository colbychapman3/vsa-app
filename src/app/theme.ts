// Look of the VSA Live tracker (docs/reference/vsa-live.html :root): light hi-vis
// theme, Barlow Condensed for big numbers and headings, IBM Plex Sans for text.
import { createContext, useContext } from 'react';
import {
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
} from '@expo-google-fonts/barlow-condensed';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans';

export const color = {
  bg: '#F4F1EA',
  card: '#FFFFFF',
  ink: '#15171A',
  muted: '#4A4F57',
  line: '#D9D3C7',
  soft: '#E6E0D4',
  row: '#EFEAE0',
  blue: '#1D4ED8',
  onBlue: '#FFFFFF',
  orange: '#B45309',
  onOrange: '#FFFFFF',
  onRed: '#FFFFFF',
  oBg: '#FFF7ED',
  oInk: '#7C2D12',
  red: '#B91C1C',
  rBg: '#FEE2E2',
  rInk: '#7F1D1D',
  green: '#15803D',
  gBg: '#DCFCE7',
  gInk: '#14532D',
  head: '#15171A',
  headInk: '#F4F1EA',
  headMuted: '#D6D1C6',
  accent: '#FDBA74',
  done: '#5A5F66',
  // Terminal map data colors (same as the Terminal & Yard Map artifact); only for shapes, never for text.
  mapZone: '#2F8BFF',
  mapSite: '#22C47F',
  mapYard: '#FFB020',
  mapOem: '#A45CF2',
  mapRail: '#27C95A',
  mapMeasure: '#FF4FA3',
} as const;

// Loaded once in App.tsx. Bundled with the app, so they work offline.
export const fontFiles = {
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
};

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
