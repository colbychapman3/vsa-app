// Settings › Customize Snapshot (Colby, 2026-10-08): each box can be dragged up or down by its handle, nudged with ▲ ▼, shown on
// Snapshot, Plan, Hourly or Decks, or hidden. The vessel remaining box can move but never hides. Saved on the phone only.
import { useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, Text, View } from 'react-native';
import { BOX_TITLE, boxesFor, defaultLayout, moveBox, PINNED, reorder, setHidden, moveToTab, TABS, TAB_TITLE, type BoxId, type BoxTab, type Layout } from '../snapshotLayout.ts';
import { color, TAP, useType } from '../theme.ts';
import { Body, Card, Go, Note, Seg, u } from './ui.tsx';

type Where = BoxTab | 'hidden';

export function CustomizeSnapshot({ layout, onLayout }: { layout: Layout; onLayout: (l: Layout) => void }) {
  const [rowH, setRowH] = useState(150);
  const layoutRef = useRef(layout); layoutRef.current = layout;
  return (
    <View style={{ gap: 10 }}>
      <Note>Drag a box by its handle ⠿ to reorder it, or use ▲ ▼. Pick where it shows. On the Snapshot you can also long press a box for “Move to”.</Note>
      {layout.order.map((id) => (
        <Row key={id} id={id} layout={layout} rowH={rowH} onMeasure={setRowH} onLayout={onLayout} latest={layoutRef} />
      ))}
      <Go ghost label="Reset to the original layout" onPress={() => onLayout(defaultLayout())} />
    </View>
  );
}

function Row({ id, layout, rowH, onMeasure, onLayout, latest }: { id: BoxId; layout: Layout; rowH: number; onMeasure: (h: number) => void; onLayout: (l: Layout) => void; latest: { current: Layout } }) {
  const f = useType();
  const y = useRef(new Animated.Value(0)).current;
  const hidden = layout.hidden.includes(id);
  const where: Where = hidden ? 'hidden' : layout.tab[id];
  const pinned = PINNED.includes(id);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false, // the list does not take the touch back and scroll
    onPanResponderMove: (_, g) => y.setValue(g.dy),
    onPanResponderRelease: (_, g) => {
      const l = latest.current;
      const from = l.order.indexOf(id);
      const to = Math.max(0, Math.min(l.order.length - 1, from + Math.round(g.dy / rowH)));
      Animated.timing(y, { toValue: 0, duration: 120, useNativeDriver: true }).start();
      if (to !== from) onLayout(reorder(l, id, l.order[to]));
    },
    onPanResponderTerminate: () => Animated.timing(y, { toValue: 0, duration: 120, useNativeDriver: true }).start(),
  })).current;
  const options: { value: Where; label: string }[] = [...TABS.map((t) => ({ value: t as Where, label: TAB_TITLE[t] })), ...(pinned ? [] : [{ value: 'hidden' as Where, label: 'Hidden' }])];
  const set = (w: Where) => {
    if (w === 'hidden') return onLayout(setHidden(layout, id, true));
    if (w === layout.tab[id]) return hidden ? onLayout(setHidden(layout, id, false)) : undefined; // shown again where it was
    onLayout(moveToTab(layout, id, w)); // lands at the top of its new tab, shown
  };
  const nudge = (d: -1 | 1) => onLayout(moveBox(layout, id, d));
  const first = boxesFor(layout, layout.tab[id])[0] === id, atEnd = boxesFor(layout, layout.tab[id]).at(-1) === id;
  return (
    <Animated.View style={{ transform: [{ translateY: y }], zIndex: 1 }} onLayout={(e) => onMeasure(e.nativeEvent.layout.height + 10)}>
      <Card style={[u.pad, { gap: 10, opacity: hidden ? 0.7 : 1 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View {...pan.panHandlers} accessibilityRole="adjustable" accessibilityLabel={`Drag ${BOX_TITLE[id]} to reorder`} style={{ width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 28, color: color.muted }}>⠿</Text>
          </View>
          <View style={{ flex: 1 }} />
          <Step label="▲" a11y={`Move ${BOX_TITLE[id]} up`} disabled={hidden || first} onPress={() => nudge(-1)} f={f.bodySemi} />
          <Step label="▼" a11y={`Move ${BOX_TITLE[id]} down`} disabled={hidden || atEnd} onPress={() => nudge(1)} f={f.bodySemi} />
        </View>
        <Body semi style={{ fontSize: 18 }}>{BOX_TITLE[id]}{pinned ? ' (always shown)' : ''}</Body>
        <Seg<Where> columns={pinned ? 4 : 3} value={where} onChange={set} options={options} />
      </Card>
    </Animated.View>
  );
}

function Step({ label, a11y, disabled, onPress, f }: { label: string; a11y: string; disabled: boolean; onPress: () => void; f?: string }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={a11y}
      style={({ pressed }) => [{ width: TAP, height: TAP, borderRadius: 12, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }, pressed && u.pressed]}>
      <Text style={{ fontSize: 20, color: color.ink, fontFamily: f }}>{label}</Text>
    </Pressable>
  );
}
