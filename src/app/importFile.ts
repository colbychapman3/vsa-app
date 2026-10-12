// Pick a file from Files / iCloud / Mail attachments and read it as text. The text then goes through the same checks as a paste
// (checksum, vessel id, no overwrite); nothing here writes to the log.
import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { importFileProblem } from './importLimit.ts';

export type Picked = { ok: true; text: string; name: string } | { ok: false; error: string } | { ok: 'cancelled' };

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
