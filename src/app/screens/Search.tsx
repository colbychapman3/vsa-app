// Knowledge search: offline keyword search over the bundled pack of SOP, protocol, glossary and
// operations-reference passages. Every result shows its citation; no result says "not found".
// One Sheet: the list and the full passage swap inside it (never two modals). Layout only.
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';
import indexJson from '../../../assets/knowledge/index.json';
import { search, segments, snippet, type Chunk, type KnowledgeIndex } from '../knowledge/search.ts';
import { color, TAP, useType } from '../theme.ts';
import { Card, Go, Note, Sheet, u } from './ui.tsx';

const INDEX = indexJson as unknown as KnowledgeIndex;

function Marked({ text, toks, style }: { text: string; toks: string[]; style: object }) {
  const f = useType();
  return (
    <Text style={style}>
      {segments(text, toks).map((s, i) => <Text key={i} style={s.hit ? { fontFamily: f.bodySemi, backgroundColor: color.accent } : undefined}>{s.t}</Text>)}
    </Text>
  );
}

export function Search({ isTest, onClose }: { isTest: boolean; onClose: () => void }) {
  const f = useType();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Chunk | null>(null);
  const r = useMemo(() => search(INDEX, q), [q]);
  const src = open ? INDEX.sources.find((s) => s.doc === open.doc) : null;
  const body = { fontFamily: f.body, fontSize: 16, color: color.ink, lineHeight: 23 };
  return (
    <Sheet title={open ? 'Passage' : 'Search'} isTest={isTest} onClose={onClose} scrollTopOn={open?.id ?? 'list'}>
      {open ? (
        <>
          <Go ghost label="‹ Results" onPress={() => setOpen(null)} />
          <Card style={[u.pad, { gap: 10 }]}>
            <Text style={{ fontFamily: f.bodySemi, fontSize: 16, color: color.ink }}>{open.cite}</Text>
            {open.flag ? <Text style={{ fontFamily: f.bodySemi, fontSize: 14, color: color.oInk, backgroundColor: color.oBg, borderColor: color.orange, borderWidth: 1.5, borderRadius: 8, padding: 8, overflow: 'hidden' }}>{open.flag}</Text> : null}
            <Marked text={open.text} toks={r.tokens} style={body} />
          </Card>
          {src ? <Note>{src.note}</Note> : null}
          <Note>Quoted from the loaded pack (built {INDEX.builtAt}), not summarized. If this disagrees with the app’s rules or the current protocol, the protocol and Colby’s instruction win.</Note>
        </>
      ) : (
        <>
          <TextInput value={q} onChangeText={setQ} placeholder="Search SOPs, protocol, glossary" placeholderTextColor={color.muted} accessibilityLabel="Search the knowledge pack"
            autoCorrect={false} autoCapitalize="none" returnKeyType="search" clearButtonMode="while-editing"
            style={[u.input, { fontFamily: f.bodyMedium, fontSize: 18 }]} />
          {r.message ? <Card style={[u.pad, { gap: 4 }]}><Text style={{ fontFamily: f.bodySemi, fontSize: 17, color: color.ink }}>{r.message}</Text><Note>Try other words. The app only answers from the documents in the pack and never guesses.</Note></Card> : null}
          {!r.hits.length && r.related.length > 0 && <Note>Closest passages, not an answer. Check them yourself:</Note>}
          {(r.hits.length ? r.hits : r.related).map((h) => (
            <Pressable key={h.chunk.id} onPress={() => setOpen(h.chunk)} style={({ pressed }) => [pressed && u.pressed]} accessibilityRole="button" accessibilityLabel={`${h.chunk.cite}. Open the passage`}>
              <Card style={[u.pad, { gap: 6, minHeight: TAP }]}>
                <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.ink }}>{h.chunk.cite}</Text>
                {h.chunk.flag ? <Text style={{ fontFamily: f.bodySemi, fontSize: 13, color: color.oInk }}>{h.chunk.flag}</Text> : null}
                <Marked text={snippet(h.chunk.text, r.tokens)} toks={r.tokens} style={{ ...body, fontSize: 15, lineHeight: 21 }} />
              </Card>
            </Pressable>
          ))}
          {!q.trim() && <Note>Type a word or two. Works offline. {INDEX.chunks.length} passages from {INDEX.sources.length} documents.</Note>}
          <Note>Pack built {INDEX.builtAt}. The operations reference is older than the protocol; where they differ, Protocol Appendix C wins. Re-export the pack to update it.</Note>
        </>
      )}
    </Sheet>
  );
}
