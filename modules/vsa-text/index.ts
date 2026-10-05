// Apple Vision text with word positions (local Expo module, ios/VsaTextModule.swift). Missing from a build = null.
import { requireOptionalNativeModule } from 'expo';
import { addMissedNumerals, type ExtraWord, type Page } from '../../src/app/layout.ts';

export type Read = Page & { lines: string[] };
type Native = { read(path: string, correct: boolean): Promise<Read> };
const native = requireOptionalNativeModule<Native>('VsaText');

export const textReaderAvailable = native != null;

// correct = Apple's language correction. Off for paperwork, so numbers and codes come back as printed.
// A build from before the second pass returns no `extra`: the words are then the full-page read, as before.
export async function readText(uri: string, correct: boolean): Promise<Read> {
  if (!native) throw new Error('Text reading is not in this build. Type the values instead.');
  const r = await native.read(uri.replace('file://', ''), correct);
  const extra: ExtraWord[] = r.extra ?? [];
  return { ...r, words: addMissedNumerals(r.words, extra), extra };
}
