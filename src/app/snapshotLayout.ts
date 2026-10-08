// Which boxes the Snapshot shows, in what order, and on which tab (Colby, 2026-10-08). A per-phone preference: never part of a
// vessel's record. Pure, so it is tested without a screen. A missing, corrupt or older saved layout falls back to the default.
export const BOXES = ['hero', 'field', 'eta', 'ha', 'brands', 'side', 'vessel'] as const;
export type BoxId = (typeof BOXES)[number];
export const TABS = ['snap', 'plan', 'hourly', 'decks'] as const;
export type BoxTab = (typeof TABS)[number];
export const BOX_TITLE: Record<BoxId, string> = { hero: 'Vessel remaining', field: 'Field record', eta: 'Est. completion', ha: 'Avg hourly (H.A.)', brands: 'Remaining by brand', side: 'Side split', vessel: 'Vessel notes and cards' };
export const TAB_TITLE: Record<BoxTab, string> = { snap: 'Snapshot', plan: 'Plan', hourly: 'Hourly', decks: 'Decks' };
export const PINNED: readonly BoxId[] = ['hero']; // a vessel balance is never hidden

export type Layout = { order: BoxId[]; hidden: BoxId[]; tab: Record<BoxId, BoxTab> };

export const defaultLayout = (): Layout => ({ order: [...BOXES], hidden: [], tab: Object.fromEntries(BOXES.map((b) => [b, 'snap'])) as Record<BoxId, BoxTab> });

const isBox = (x: unknown): x is BoxId => typeof x === 'string' && (BOXES as readonly string[]).includes(x);
const isTab = (x: unknown): x is BoxTab => typeof x === 'string' && (TABS as readonly string[]).includes(x);

// Text from the settings table → a layout. Anything unreadable or inconsistent gives the default, never a blank screen.
export function parseLayout(text: string | null): Layout {
  const d = defaultLayout();
  if (!text) return d;
  try {
    const j = JSON.parse(text) as { order?: unknown; hidden?: unknown; tab?: unknown };
    const order = Array.isArray(j.order) ? [...new Set(j.order.filter(isBox))] : [];
    for (const b of BOXES) if (!order.includes(b)) order.push(b); // a box added by a later version appears at the end
    const hidden = Array.isArray(j.hidden) ? [...new Set(j.hidden.filter(isBox))].filter((b) => !PINNED.includes(b)) : [];
    const tab = { ...d.tab };
    if (j.tab && typeof j.tab === 'object') for (const b of BOXES) { const t = (j.tab as Record<string, unknown>)[b]; if (isTab(t)) tab[b] = t; }
    return { order, hidden, tab };
  } catch { return d; }
}
export const layoutText = (l: Layout) => JSON.stringify(l);

// Boxes for one tab, in order, hidden ones left out.
export const boxesFor = (l: Layout, t: BoxTab): BoxId[] => l.order.filter((b) => l.tab[b] === t && !l.hidden.includes(b));
export const hiddenBoxes = (l: Layout): BoxId[] => l.order.filter((b) => l.hidden.includes(b));

// Move a box one place up or down among the boxes it shares a tab with.
export function moveBox(l: Layout, id: BoxId, dir: -1 | 1): Layout {
  const mates = l.order.filter((b) => l.tab[b] === l.tab[id]);
  const at = mates.indexOf(id), to = at + dir;
  if (at < 0 || to < 0 || to >= mates.length) return l;
  return reorder(l, id, mates[to]);
}

// Put `id` where `target` is (dragging a box onto another). Both move within the whole order; tab membership is unchanged.
export function reorder(l: Layout, id: BoxId, target: BoxId): Layout {
  if (id === target) return l;
  const order = l.order.filter((b) => b !== id);
  const i = order.indexOf(target);
  const was = l.order.indexOf(id), ti = l.order.indexOf(target);
  order.splice(was < ti ? i + 1 : i, 0, id);
  return { ...l, order };
}

export const setHidden = (l: Layout, id: BoxId, hide: boolean): Layout =>
  PINNED.includes(id) ? l : { ...l, hidden: hide ? [...new Set([...l.hidden, id])] : l.hidden.filter((b) => b !== id) };

// Move a box to another tab: it lands at the top of that tab and is shown (moving it is a choice to see it there).
export const moveToTab = (l: Layout, id: BoxId, t: BoxTab): Layout => ({
  order: [id, ...l.order.filter((b) => b !== id)], hidden: l.hidden.filter((b) => b !== id), tab: { ...l.tab, [id]: t },
});
