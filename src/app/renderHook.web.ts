// Web only (Metro picks this over renderHook.ts): exposes the app's own setters as window.__vsa so the
// UI conformance harness (tools/render) can open a board's tab, sheet and theme. Never in the iOS bundle.
import { useEffect } from 'react';
import type { RenderControls } from './renderHook';

export function useRenderHook(controls: RenderControls): void {
  useEffect(() => { (globalThis as { __vsa?: RenderControls }).__vsa = controls; });
}
