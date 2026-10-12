// Pick a file from Files / iCloud / Mail attachments and read it as text. The text then goes through the same checks as a paste
// (checksum, vessel id, no overwrite); nothing here writes to the log.
import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { importFileProblem } from './importLimit.ts';

export type Picked = { ok: true; text: string; name: string } | { ok: false; error: string } | { ok: 'cancelled' };

// New vessel › Choose a file: a picture (PNG, JPG, HEIC) goes to the game plan reader; anything else is read as text.
// Colby, 2026-10-12: one button, whatever the file; he shouldn't have to know which format the app wants.
export type PickedAny = Picked | { ok: true; image: string; name: string };
export async function pickSetupFile(): Promise<PickedAny> {
  try {
    const r = await getDocumentAsync({ type: ['image/*', 'application/json', 'text/plain', '*/*'], copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.[0]) return { ok: 'cancelled' };
    const a = r.assets[0];
    if (/^image\//.test(a.mimeType ?? '') || /\.(png|jpe?g|heic|heif)$/i.test(a.name)) return { ok: true, image: a.uri, name: a.name };
    if (/\.pdf$/i.test(a.name) || a.mimeType === 'application/pdf') return { ok: false, error: `${a.name} is a PDF, which isn't read yet. Take a screenshot of the game plan page and choose that, or use the camera.` };
    const bad = importFileProblem(a.name, a.size);
    if (bad) return { ok: false, error: bad };
    const text = await new File(a.uri).text();
    if (text.trim() === '') return { ok: false, error: `${a.name} is empty.` };
    return { ok: true, text, name: a.name };
  } catch (e) {
    return { ok: false, error: `The file could not be read: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function pickTextFile(): Promise<Picked> {
  try {
    const r = await getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.[0]) return { ok: 'cancelled' };
    const a = r.assets[0];
    const bad = importFileProblem(a.name, a.size);
    if (bad) return { ok: false, error: bad };
    const text = await new File(a.uri).text();
    if (text.trim() === '') return { ok: false, error: `${a.name} is empty.` };
    return { ok: true, text, name: a.name };
  } catch (e) {
    return { ok: false, error: `The file could not be read: ${e instanceof Error ? e.message : String(e)}` };
  }
}
