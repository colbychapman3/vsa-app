// Photo files live only in the app's document folder (evidence/<vesselId>/<eventId>.jpg), never in the camera roll.
// The event stores the relative path; the full path is resolved here because the folder's full path can change
// when the app is updated. Full size is kept; nothing is ever deleted except a copy that failed to save.
import { Directory, File, Paths } from 'expo-file-system';

// Copy the camera's temporary file into the app folder. Throws with a plain message if it can't.
export function keepPhoto(tmpUri: string, relPath: string): void {
  const parts = relPath.split('/');
  new Directory(Paths.document, ...parts.slice(0, -1)).create({ intermediates: true, idempotent: true });
  new File(tmpUri).copy(new File(Paths.document, ...parts));
}

export const photoUri = (relPath: string) => new File(Paths.document, ...relPath.split('/')).uri;
export const photoExists = (relPath: string) => new File(Paths.document, ...relPath.split('/')).exists;

// Only for a copy made by keepPhoto whose event was then refused: nothing refers to it.
export function dropUnsavedPhoto(relPath: string): void {
  try { const f = new File(Paths.document, ...relPath.split('/')); if (f.exists) f.delete(); } catch { /* an orphan file is harmless */ }
}
