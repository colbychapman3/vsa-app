// Vessel list: switch, start a new one, archive (hide; nothing is ever deleted). Layout only.
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { VesselRow } from '../../storage/vessels.ts';
import { color, TAP, useType } from '../theme.ts';
import type { Reject } from '../../engine/index.ts';
import type { Built } from '../setup.ts';
import { Body, Card, Chip, Go, Note, Sheet, u } from './ui.tsx';
import { Setup } from './Setup.tsx';

const n = (x: number | null) => (x == null ? 'unknown' : x.toLocaleString('en-US'));

// One sheet for the list and for New vessel: the content swaps inside it (never two modals).
export function Vessels({ rows, currentId, isTest, onOpen, onArchive, onCreate, onClose }: {
  rows: VesselRow[]; currentId: string; isTest: boolean;
  onOpen: (id: string) => void; onArchive: (id: string, archived: boolean) => void; onClose: () => void;
  onCreate: (b: Extract<Built, { ok: true }>, isTest: boolean) => Promise<{ ok: true } | Reject>;
}) {
  const [mode, setMode] = useState<'list' | 'new'>('list');
  const [newTest, setNewTest] = useState(false);
  const [key, setKey] = useState('');
  return (
    <Sheet title={mode === 'new' ? 'New vessel' : 'Vessels'} isTest={mode === 'new' ? newTest : isTest} onClose={onClose} scrollKey={mode === 'new' ? key : 'list'}>
      {mode === 'new'
        ? <Setup isTest={newTest} setIsTest={setNewTest} onKey={setKey} onCreate={onCreate} />
        : <List rows={rows} currentId={currentId} onOpen={onOpen} onArchive={onArchive} onNew={() => setMode('new')} />}
    </Sheet>
  );
}

function List({ rows, currentId, onOpen, onArchive, onNew }: {
  rows: VesselRow[]; currentId: string; onOpen: (id: string) => void; onArchive: (id: string, archived: boolean) => void; onNew: () => void;
}) {
  const f = useType();
  const [showArchived, setShowArchived] = useState(false);
  const shown = rows.filter((r) => showArchived || !r.archived || r.operationId === currentId);
  const hidden = rows.filter((r) => r.archived && r.operationId !== currentId).length;
  return (
    <>
      <Go label="New vessel" onPress={onNew} />
      {shown.map((r) => (
        <Card key={r.operationId} style={[u.pad, { gap: 8 }]}>
          <Pressable onPress={() => onOpen(r.operationId)} style={({ pressed }) => [{ minHeight: TAP, justifyContent: 'center', gap: 4 }, pressed && { opacity: 0.6 }]}
            accessibilityRole="button" accessibilityLabel={`Open ${r.name}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Chip text={r.isTest ? 'TEST' : 'LIVE'} tone={r.isTest ? 'orange' : 'plain'} />
              {r.operationId === currentId && <Chip text="Open now" />}
              {r.archived && <Chip text="Archived" />}
            </View>
            <Text style={{ fontFamily: f.display, fontSize: 24, color: color.ink }} numberOfLines={1} adjustsFontSizeToFit>{r.name}</Text>
            <Body>{r.problem ? `Problem: ${r.problem}` : `${r.date} · Remaining ${n(r.remaining)} of ${n(r.start)} · Field ${n(r.field)}`}</Body>
          </Pressable>
          {r.operationId !== currentId && <Go ghost label={r.archived ? 'Unarchive' : 'Archive'} onPress={() => onArchive(r.operationId, !r.archived)} />}
        </Card>
      ))}
      {hidden > 0 && !showArchived && <Go ghost label={`Show ${hidden} archived`} onPress={() => setShowArchived(true)} />}
      <Note>Archive hides a vessel from this list. Its record stays on the phone and can be unarchived.</Note>
    </>
  );
}
