// Snapshot tab (reference: docs/reference/screens/01–03). Layout only; every value comes from view.snapshot().
// A clean page (Colby, 2026-10-14): the numbers and the ship, nothing that pops open. What needs a look lives on the tab
// badges, the due hour on the Log button, and a pace warning at the top of Decks.
import { View } from 'react-native';
import type { Baseline } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import { snapshot, type Banner } from '../view.ts';
import type { Layout } from '../snapshotLayout.ts';
import { BreakScale } from './Graphics.tsx';
import type { Save } from './Plan.tsx';
import { Boxes } from './SnapshotBoxes.tsx';
import { BannerView } from './ui.tsx';
import { NeededCard } from './NeededCard.tsx';

type Props = { state: State; baseline: Baseline; nowMin: number; onOpenTab: (t: 'hourly' | 'decks' | 'plan') => void; onTrack: (b: Banner) => void;
  isTest: boolean; save: Save; onNotice: (n: { ok: boolean; text: string }) => void;
  layout: Layout; onLayout: (l: Layout) => void; onHistory: () => void; onOpenDeck: (id: string) => void };

export function Snapshot({ state, baseline, nowMin, onOpenTab, onTrack, isTest, save, onNotice, layout, onLayout, onHistory, onOpenDeck }: Props) {
  const v = snapshot(state, baseline, nowMin);
  return (
    <View>
      {v.scale && <BreakScale scale={v.scale} />}
      {v.banners.map((b, i) => <BannerView key={i} banner={b} onTrack={onTrack} onGo={onOpenTab} />)}
      {v.needed && <NeededCard n={v.needed} />}
      <Boxes tab="snap" layout={layout} onLayout={onLayout} state={state} baseline={baseline} nowMin={nowMin} isTest={isTest} save={save} onNotice={onNotice} onOpenTab={onOpenTab} onHistory={onHistory} onOpenDeck={onOpenDeck} />
    </View>
  );
}
