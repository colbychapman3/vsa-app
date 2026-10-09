// "Extra visible" (Settings): for direct sun and gloves, type steps up one weight (IBM Plex is loaded in three: Regular, Medium,
// SemiBold; SemiBold and the display face are already the heaviest), and borders go from 1 to 2 points.
// Pure, so node:test can cover it; theme.ts holds the React side.
export type Families = { display?: string; displaySemi?: string; body?: string; bodyMedium?: string; bodySemi?: string };

export const asSun = (v: string | null): boolean => v === '1';

export function sunFamilies<T extends Families>(f: T): T {
  return { ...f, body: f.bodyMedium, bodyMedium: f.bodySemi };
}
