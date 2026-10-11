// Siri hand-off (local Expo module, ios/VsaIntentsModule.swift). Missing from a build (or not iOS) = nothing pending.
import { requireOptionalNativeModule } from 'expo';
import type { SiriPending } from '../../src/app/siri.ts';

const native = requireOptionalNativeModule<{ takePending(): SiriPending | null }>('VsaIntents');

export function takeSiriPending(): SiriPending | null {
  try { return native?.takePending() ?? null; } catch { return null; }
}
