// Apple Vision text with word positions (local Expo module, ios/VsaTextModule.swift). Missing from a build = null.
import { requireOptionalNativeModule } from 'expo';
import type { Page } from '../../src/app/layout.ts';

export type Read = Page & { lines: string[] };
type Native = { read(path: string, correct: boolean): Promise<Read> };
const native = requireOptionalNativeModule<Native>('VsaText');

export const textReaderAvailable = native != null;

// correct = Apple's language correction. Off for paperwork, so numbers and codes come back as printed.
export function readText(uri: string, correct: boolean): Promise<Read> {
  if (!native) return Promise.reject(new Error('Text reading is not in this build. Type the values instead.'));
  return native.read(uri.replace('file://', ''), correct);
}
