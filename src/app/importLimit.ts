// Size checks for a picked import file (pure, so tests can run it).
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

// Pure: why a picked file is refused before reading, or null when it is fine.
export function importFileProblem(name: string, size: number | undefined): string | null {
  if (size != null && size > MAX_IMPORT_BYTES) return `${name} is too large to import (${Math.round(size / 1048576)} MB; the limit is ${MAX_IMPORT_BYTES / 1048576} MB).`;
  if (size === 0) return `${name} is empty.`;
  return null;
}
