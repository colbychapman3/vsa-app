// Write a backup file to the app's cache so the iOS share sheet can hand it over as a real file (Save to Files, AirDrop, Mail).
// Same content as the old message text. The cache copy may be removed by the system later; the user's saved copy is the backup.
import { File, Paths } from 'expo-file-system';

export function writeCacheFile(name: string, text: string): string {
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  f.create();
  f.write(text);
  return f.uri;
}
