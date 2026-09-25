// Loads the VSA Live tracker's own calculation code (docs/reference/vsa-live.html)
// in a Node sandbox so tests can compare the engine against it. The tracker exposes
// deckCalc/etaCalc/isShort/compute and its state S as window.__VSA_TEST__ before it
// touches the page; the page-drawing code runs against a do-nothing DOM stub.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export type Tracker = {
  deckCalc: (deck: unknown, st?: unknown) => any;
  etaCalc: (rem: number, periods: unknown[], breaks: number[], cb: number) => any;
  isShort: (startHM: string, breaks: number[]) => boolean;
  compute: () => any;
  S: any;
};

// Any property read returns the stub itself, and calling it returns the stub, so
// document.getElementById('x').innerHTML = ... and similar chains are harmless.
function stub(): any {
  const fn: any = function () { return proxy; };
  const proxy: any = new Proxy(fn, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => '' : proxy),
    set: () => true,
  });
  return proxy;
}

const html = readFileSync(new URL('../docs/reference/vsa-live.html', import.meta.url), 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) throw new Error('No <script> block found in vsa-live.html');
const source = match[1];

// Fresh tracker per call so tests don't share state.
export function loadTracker(): Tracker {
  const window: any = {};
  const context = vm.createContext({
    window,
    document: stub(),
    setInterval: () => 0,
    console,
  });
  try {
    vm.runInContext(source, context);
  } catch (e) {
    // Page rendering can fail against the stub; the exports are set before that.
    if (!window.__VSA_TEST__) throw e;
  }
  if (!window.__VSA_TEST__) throw new Error('Tracker did not expose window.__VSA_TEST__');
  return window.__VSA_TEST__;
}
