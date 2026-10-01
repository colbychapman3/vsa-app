// PDF copy of a photo: long side ~1600 px, JPEG 0.7, returned as a data URI so the report HTML is self-contained.
// Estimate: a 4000x3000 photo is 12 MP, about 4-6 MB as a JPEG; 1600x1200 at 0.7 is about 0.25-0.4 MB (~15x smaller).
// Scaling in the HTML (CSS) does not shrink what is embedded, so the copy is made here. The stored original is never touched.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { photoExists, photoUri } from './evidenceFiles.ts';

const LONG_SIDE = 1600;

// null = the file is missing or could not be read; the report then says so instead of showing a picture.
export async function reducedPhotoData(relPath: string): Promise<string | null> {
  if (!photoExists(relPath)) return null;
  try {
    const full = await ImageManipulator.manipulate(photoUri(relPath)).renderAsync();
    const small = full.width >= full.height ? { width: Math.min(LONG_SIDE, full.width) } : { height: Math.min(LONG_SIDE, full.height) };
    const out = await (await ImageManipulator.manipulate(full).resize(small).renderAsync()).saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
    return out.base64 ? `data:image/jpeg;base64,${out.base64}` : null;
  } catch {
    return null;
  }
}
