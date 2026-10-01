// Write a text file to the app's cache and open the iPhone share sheet for it (so it can be attached in any AI app).
// The file holds only what the preview showed; it is in the cache folder and the system may remove it later.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function shareTextFile(name: string, text: string): Promise<string | null> {
  try {
    if (!(await Sharing.isAvailableAsync())) return 'Sharing is not available on this device.';
    const f = new File(Paths.cache, name);
    if (f.exists) f.delete();
    f.create();
    f.write(text);
    await Sharing.shareAsync(f.uri, { mimeType: 'text/markdown', UTI: 'net.daringfireball.markdown', dialogTitle: name });
    return null;
  } catch (e) {
    return `Could not share the file: ${(e as Error).message}`;
  }
}
