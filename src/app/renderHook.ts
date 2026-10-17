// The web render harness (tools/render) drives the app through renderHook.web.ts; on the phone this does nothing.
export type RenderControls = Record<string, (arg?: never) => unknown>;
export function useRenderHook(_controls: RenderControls): void {}
