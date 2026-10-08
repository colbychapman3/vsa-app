// Photo files live only in the app's document folder (evidence/<vesselId>/<eventId>.jpg), never in the camera roll.
// The event stores the relative path; the full path is resolved here because the folder's full path can change
// when the app is updated. Full size is kept; nothing is deleted except a copy that failed to save and, in the
// prototype phase, the whole folder of a vessel that was deleted.
import { Directory, File, Paths } from 'expo-file-system';

// Copy the camera's temporary file into the app folder. Rejects with a plain message if it can't. File.copy returns
// a promise, so wait for it: the event that points at this file is saved only after the copy has finished.
export async function keepPhoto(tmpUri: string, relPath: string): Promise<void> {
  const parts = relPath.split('/');
  new Directory(Paths.document, ...parts.slice(0, -1)).create({ intermediates: true, idempotent: true });
  await new File(tmpUri).copy(new File(Paths.document, ...parts));
}

export const photoUri = (relPath: string) => new File(Paths.document, ...relPath.split('/')).uri;
export const photoExists = (relPath: string) => new File(Paths.document, ...relPath.split('/')).exists;

// A deleted vessel's photo folder (evidence/<vesselId>/). Best effort: a folder left behind is harmless and refers to nothing.
export function dropVesselPhotos(vesselId: string): void {
  try { const d = new Directory(Paths.document, 'evidence', vesselId); if (d.exists) d.delete(); } catch { /* left behind, harmless */ }
}

// Only for a copy made by keepPhoto whose event was then refused: nothing refers to it.
export function dropUnsavedPhoto(relPath: string): void {
  try { const f = new File(Paths.document, ...relPath.split('/')); if (f.exists) f.delete(); } catch { /* an orphan file is harmless */ }
}

// Save photo files to the camera roll (Colby, 2026-10-09). Add-only permission: the app can put photos in the roll, never read it.
// Copies; the app's own files stay. Returns what happened so the screen can say it plainly.
export async function saveToCameraRoll(relPaths: string[]): Promise<{ ok: true; saved: number; missing: number } | { ok: false; error: string }> {
  let lib: typeof import('expo-media-library');
  try { lib = require('expo-media-library'); } catch { return { ok: false, error: 'Saving to the camera roll is not in this build.' }; }
  const perm = await lib.requestPermissionsAsync(true);
  if (!perm.granted) return { ok: false, error: perm.canAskAgain ? 'Saving to the camera roll was not allowed. Tap the button again and allow it.' : 'Camera roll saving is off for VSA. Turn it on in iPhone Settings › VSA › Photos.' };
  let saved = 0, missing = 0;
  for (const rel of relPaths) {
    if (!photoExists(rel)) { missing++; continue; }
    try { await lib.saveToLibraryAsync(photoUri(rel)); saved++; } catch (e) { return { ok: false, error: `Stopped after ${saved} photo${saved === 1 ? '' : 's'}: ${(e as Error).message}` }; }
  }
  return { ok: true, saved, missing };
}
