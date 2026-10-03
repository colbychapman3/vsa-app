// New vessel: the 5-step Setup inside one sheet. The vessel list lives in the sidebar; archived vessels in Settings.
import { useState } from 'react';
import type { Reject } from '../../engine/index.ts';
import type { Built } from '../setup.ts';
import { Sheet } from './ui.tsx';
import { Setup } from './Setup.tsx';

export function Vessels({ onCreate, onClose }: {
  onClose: () => void;
  onCreate: (b: Extract<Built, { ok: true }>, isTest: boolean, notes: string[]) => Promise<{ ok: true } | Reject>;
}) {
  const [newTest, setNewTest] = useState(false);
  const [key, setKey] = useState('');
  return (
    <Sheet title="New vessel" isTest={newTest} onClose={onClose} scrollTopOn={key}>
      <Setup isTest={newTest} setIsTest={setNewTest} onKey={setKey} onCreate={onCreate} />
    </Sheet>
  );
}
