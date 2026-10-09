// Terminal & Yard Map: the bundled satellite image with lots, rail and roads over it. Pan with one
// finger, pinch with two, tap a lot or landmark for its card, chips highlight groups, Measure gives a
// rough "map estimate" only. Layout only: every fact comes from src/app/map/model.ts (directory-backed).
// Full-screen Modal, opened from the header; it is the only modal open while it is showing.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAP, type Pt } from '../map/data.ts';
import { CHIPS, FEATURES, card, featureAt, highlighted, measure, pathD, type ChipId, type Feature } from '../map/model.ts';
import { color, TAP, useType } from '../theme.ts';
import { Go, InfoNote, Note } from './ui.tsx';

const KIND_COLOR = { zone: color.mapZone, site: color.mapSite, yard: color.mapYard, oem: color.mapOem, point: color.ink } as const;
const MAX_ZOOM = 10; // times the fit-to-screen scale

type View3 = { k: number; tx: number; ty: number };

// The heavy layer: image + shapes. Memoized so panning only moves the wrapper, never re-renders 60 paths.
const Layer = memo(function Layer({ on, selId, pts }: { on: ChipId[]; selId: string | null; pts: Pt[] }) {
  const lit = useMemo(() => new Set(highlighted(on).map((f) => f.id)), [on]);
  const dimming = on.length > 0;
  const flat = (p: Pt[]) => p.map((q) => `${q[0]},${q[1]}`).join(' ');
  return (
    <>
      <Image source={require('../../../assets/terminal-map.jpg')} style={{ position: 'absolute', left: 0, top: 0, width: MAP.w, height: MAP.h }} />
      <Svg width={MAP.w} height={MAP.h} viewBox={`0 0 ${MAP.w} ${MAP.h}`} style={StyleSheet.absoluteFill}>
        {MAP.roads.map((r, i) => <Path key={i} d={pathD(r)} fill="#E9EBEE" fillOpacity={0.5} />)}
        <Polyline points={flat(MAP.rail.yard)} stroke={color.mapRail} strokeOpacity={0.3} strokeWidth={40} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {[MAP.rail.ramp, MAP.rail.yard].map((r, i) => <Polyline key={i} points={flat(r)} stroke={color.mapRail} strokeWidth={4} strokeDasharray="14 9" fill="none" />)}
        {FEATURES.filter((f) => f.poly).map((f) => {
          const c = KIND_COLOR[f.kind], on_ = lit.has(f.id), sel = f.id === selId;
          return <Path key={f.id} d={pathD(f.poly!)} fill={c} fillOpacity={sel ? 0.5 : dimming ? (on_ ? 0.42 : 0.06) : 0.3} stroke={sel ? '#FFFFFF' : c} strokeOpacity={dimming && !on_ && !sel ? 0.3 : 0.95} strokeWidth={sel ? 6 : 3} strokeLinejoin="round" />;
        })}
        {MAP.nroads.map((r) => <Polyline key={r.id} points={flat(r.pts)} stroke="#F3F4F6" strokeOpacity={0.85} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
        {MAP.land.map((m) => <Circle key={m.id} cx={m.x} cy={m.y} r={m.id === selId ? 11 : 6} fill={m.id === selId ? color.accent : '#FFFFFF'} stroke={color.ink} strokeWidth={3} />)}
        {pts.length > 1 && <Polyline points={flat(pts)} stroke={color.mapMeasure} strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
        {pts.map((p, i) => <Circle key={i} cx={p[0]} cy={p[1]} r={i === 0 ? 10 : 8} fill="#FFFFFF" stroke={color.mapMeasure} strokeWidth={4} />)}
      </Svg>
    </>
  );
});

export function MapScreen({ onClose }: { onClose: () => void }) {
  const f = useType();
  const insets = useSafeAreaInsets();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View3>({ k: 0, tx: 0, ty: 0 });
  const [on, setOn] = useState<ChipId[]>([]);
  const [sel, setSel] = useState<Feature | null>(null);
  const [measuring, setMeasuring] = useState(false); // running: the map fills the whole screen
  const [ready, setReady] = useState(false); // Measure tapped, waiting for Start
  const [pts, setPts] = useState<Pt[]>([]);

  const k0 = box.w ? Math.min(box.w / MAP.w, box.h / MAP.h) : 1;
  // Latest values for the gesture handlers (created once).
  const live = useRef({ view, box, k0, measuring, origin: { x: 0, y: 0 } });
  live.current = { ...live.current, view, box, k0, measuring };
  const areaRef = useRef<View>(null);

  const clamp = (v: View3): View3 => {
    const { box: b, k0: base } = live.current;
    const k = Math.min(Math.max(v.k, base), base * MAX_ZOOM);
    const fit = (size: number, view_: number, t: number) => (size * k <= view_ ? (view_ - size * k) / 2 : Math.min(0, Math.max(view_ - size * k, t)));
    return { k, tx: fit(MAP.w, b.w, v.tx), ty: fit(MAP.h, b.h, v.ty) };
  };
  const fitAll = () => setView(clamp({ k: live.current.k0, tx: 0, ty: 0 }));
  useEffect(() => { if (box.w) fitAll(); }, [box.w, box.h]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomAbout = (cx: number, cy: number, factor: number) => setView((v) => {
    const k = Math.min(Math.max(v.k * factor, live.current.k0), live.current.k0 * MAX_ZOOM), r = k / v.k;
    return clamp({ k, tx: cx - (cx - v.tx) * r, ty: cy - (cy - v.ty) * r });
  });

  const tap = (x: number, y: number) => {
    const { view: v } = live.current;
    const p: Pt = [(x - v.tx) / v.k, (y - v.ty) / v.k];
    if (live.current.measuring) { setPts((a) => [...a, p]); return; }
    setSel(featureAt(p, 28 / v.k)); // 28 pt finger radius around a gate / AVP marker
  };

  const g = useRef({ n: 0, x: 0, y: 0, d: 0, moved: 0, multi: false, t: 0 });
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      areaRef.current?.measureInWindow((x, y) => { live.current.origin = { x, y }; });
      g.current = { n: 0, x: 0, y: 0, d: 0, moved: 0, multi: false, t: Date.now() };
    },
    onPanResponderMove: (e: GestureResponderEvent) => {
      const ts = e.nativeEvent.touches, s = g.current, o = live.current.origin;
      if (ts.length >= 2) {
        const cx = (ts[0].pageX + ts[1].pageX) / 2 - o.x, cy = (ts[0].pageY + ts[1].pageY) / 2 - o.y;
        const d = Math.hypot(ts[0].pageX - ts[1].pageX, ts[0].pageY - ts[1].pageY);
        if (s.n === 2 && s.d > 0) {
          const dx = cx - s.x, dy = cy - s.y, fac = d / s.d;
          setView((v) => { const k = Math.min(Math.max(v.k * fac, live.current.k0), live.current.k0 * MAX_ZOOM), r = k / v.k; return clamp({ k, tx: cx - (cx - v.tx) * r + dx, ty: cy - (cy - v.ty) * r + dy }); });
        }
        s.n = 2; s.x = cx; s.y = cy; s.d = d; s.multi = true;
      } else if (ts.length === 1) {
        const x = ts[0].pageX - o.x, y = ts[0].pageY - o.y;
        if (s.n === 1) {
          const dx = x - s.x, dy = y - s.y;
          s.moved += Math.abs(dx) + Math.abs(dy);
          setView((v) => clamp({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
        } else if (s.n === 0) { s.moved = 0; }
        s.n = 1; s.x = x; s.y = y; s.d = 0;
      }
    },
    onPanResponderRelease: (e: GestureResponderEvent) => {
      const s = g.current;
      if (!s.multi && s.moved < 12 && Date.now() - s.t < 600) {
        const { pageX, pageY } = e.nativeEvent, o = live.current.origin;
        tap(pageX - o.x, pageY - o.y);
      }
    },
  })).current;

  const toggle = (id: ChipId) => setOn((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  const shown = useMemo(() => highlighted(on), [on]);
  const pick = (ft: Feature) => {
    setMeasuring(false); setReady(false); setSel(ft);
    const { box: b, k0: base } = live.current;
    const xs = ft.poly ? ft.poly.map((q) => q[0]) : [ft.at[0] - 60, ft.at[0] + 60], ys = ft.poly ? ft.poly.map((q) => q[1]) : [ft.at[1] - 60, ft.at[1] + 60];
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const k = Math.min(Math.max(Math.min(b.w / (x1 - x0), b.h / (y1 - y0)) * 0.6, base), base * MAX_ZOOM);
    setView(clamp({ k, tx: b.w / 2 - ((x0 + x1) / 2) * k, ty: b.h / 2 - ((y0 + y1) / 2) * k }));
  };

  const m = measure(pts);
  const c = sel ? card(sel) : null;
  const zoomed = box.w ? view.k / k0 : 1;
  const labelOf = (ft: Feature) => (ft.kind === 'point' || zoomed >= 2.2 ? ft.name : MAP.items.find((i) => i.id === ft.id)?.short ?? ft.name);
  const inView = (p: Pt) => { const x = p[0] * view.k + view.tx, y = p[1] * view.k + view.ty; return x > -40 && y > -20 && x < box.w + 40 && y < box.h + 20 ? { x, y } : null; };
  const lit = useMemo(() => new Set(shown.map((x) => x.id)), [shown]);

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: measuring ? 0 : insets.top }}>
        {!measuring && (
          <>
        <View style={s.top}>
          <Text style={[s.title, { fontFamily: f.display }]} numberOfLines={1} adjustsFontSizeToFit>Terminal map</Text>
          <Pressable onPress={() => { setSel(null); setPts([]); setReady((x) => !x); }} style={({ pressed }) => [s.btn, ready && s.btnOn, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityState={{ selected: ready }} accessibilityLabel="Measure a rough distance on the map">
            <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: ready ? color.bg : color.ink }} numberOfLines={1}>Measure</Text>
          </Pressable>
          <Pressable onPress={onClose} style={({ pressed }) => [s.x, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Close map"><Text style={{ fontSize: 18, color: color.ink }}>✕</Text></Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.strip} contentContainerStyle={s.stripIn}>
          {CHIPS.map((ch) => {
            const isOn = on.includes(ch.id);
            return (
              <Pressable key={ch.id} onPress={() => toggle(ch.id)} accessibilityRole="button" accessibilityState={{ selected: isOn }} style={({ pressed }) => [s.chip, isOn && s.chipOn, pressed && { opacity: 0.6 }]}>
                <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: isOn ? color.bg : color.ink }} numberOfLines={1}>{ch.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.strip} contentContainerStyle={s.stripIn}>
          {shown.map((ft) => (
            <Pressable key={ft.id} onPress={() => pick(ft)} accessibilityRole="button" accessibilityLabel={`Find ${ft.name}`} style={({ pressed }) => [s.chip, sel?.id === ft.id && s.chipOn, pressed && { opacity: 0.6 }]}>
              <Text style={{ fontFamily: f.bodyMedium, fontSize: 15, color: sel?.id === ft.id ? color.bg : color.ink }} numberOfLines={1}>{ft.name}</Text>
            </Pressable>
          ))}
        </ScrollView>

          </>
        )}

        <View ref={areaRef} style={s.area} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          {box.w > 0 && (
            <>
              <View style={{ position: 'absolute', left: 0, top: 0, width: MAP.w, height: MAP.h, transformOrigin: 'top left', transform: [{ translateX: view.tx }, { translateY: view.ty }, { scale: view.k }] }}>
                <Layer on={on} selId={sel?.id ?? null} pts={pts} />
              </View>
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                {MAP.land.filter((l) => !FEATURES.some((x) => x.id === l.id)).map((l) => {
                  const p = inView([l.x, l.y]);
                  return p && zoomed >= 1.6 ? <Pin key={l.id} x={p.x} y={p.y - 30} text={l.label} lm /> : null;
                })}
                {(() => {
                  const selP = sel ? inView(sel.at) : null;
                  const small = zoomed < 1.6;
                  const shown = FEATURES.flatMap((ft) => {
                    const p = inView(ft.at);
                    if (!p || (on.length > 0 && !lit.has(ft.id) && sel?.id !== ft.id)) return [];
                    return [{ ft, x: p.x, y: p.y - (ft.poly ? 10 : 30) }];
                  });
                  // Other labels that would sit on the selected one are left off; the selected label draws last (on top).
                  const others = shown.filter((q) => q.ft.id !== sel?.id && !(selP && Math.abs(q.x - selP.x) < 90 && Math.abs(q.y - (selP.y - (sel!.poly ? 10 : 30))) < 26));
                  const top = shown.find((q) => q.ft.id === sel?.id);
                  return [...others, ...(top ? [top] : [])].map((q) => <Pin key={q.ft.id} x={q.x} y={q.y} text={labelOf(q.ft)} sel={q.ft.id === sel?.id} small={small && q.ft.id !== sel?.id} />);
                })()}
              </View>
              <View style={StyleSheet.absoluteFill} {...pan.panHandlers} accessibilityLabel="Terminal map. Drag to move, pinch to zoom, tap a lot for its card." />
              <View style={[s.ctl, measuring && { bottom: insets.bottom + 92 }]}>
                <Pressable onPress={() => zoomAbout(box.w / 2, box.h / 2, 1.6)} style={({ pressed }) => [s.round, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Zoom in"><Text style={s.rt}>+</Text></Pressable>
                <Pressable onPress={() => zoomAbout(box.w / 2, box.h / 2, 1 / 1.6)} style={({ pressed }) => [s.round, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Zoom out"><Text style={s.rt}>−</Text></Pressable>
                <Pressable onPress={fitAll} style={({ pressed }) => [s.round, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Fit the whole map"><Text style={[s.rt, { fontSize: 14, fontFamily: f.bodySemi }]}>Fit</Text></Pressable>
              </View>
            </>
          )}
        </View>

        {measuring ? (
          <>
            <View style={{ position: 'absolute', left: 12, right: 12, top: insets.top + 8, backgroundColor: color.card, borderRadius: 12, borderWidth: 1.5, borderColor: color.line, padding: 10 }} pointerEvents="none">
              <Text style={{ fontFamily: f.display, fontSize: 28, color: color.ink }} numberOfLines={1} adjustsFontSizeToFit>{m ? m.text : 'Tap points on the map'}</Text>
              <Text style={{ fontFamily: f.bodySemi, fontSize: 13, color: color.oInk }} numberOfLines={1} adjustsFontSizeToFit>{m ? `${m.label[0].toUpperCase()}${m.label.slice(1)}` : 'Map estimate, not a route distance'}</Text>
            </View>
            <View style={{ position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 12, flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Go ghost label="Undo" onPress={() => setPts((a) => a.slice(0, -1))} disabled={!pts.length} /></View>
              <View style={{ flex: 1 }}><Go ghost label="Clear" onPress={() => setPts([])} disabled={!pts.length} /></View>
              <View style={{ flex: 1 }}><Go label="Done" onPress={() => { setMeasuring(false); setPts([]); }} /></View>
            </View>
          </>
        ) : ready ? (
          <View style={[s.panel, { paddingBottom: insets.bottom + 12 }]}>
            <Text style={{ fontFamily: f.display, fontSize: 28, color: color.ink }}>Measure a rough distance</Text>
            <Text style={{ fontFamily: f.bodySemi, fontSize: 14, color: color.oInk }}>Start opens the map full screen. Tap a point at the start, then at every turn.</Text>
            <InfoNote><Note>Lot outlines and the map scale are approximate (about plus or minus 10%). For route distances use the berth miles on each lot's card.</Note></InfoNote>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Go ghost label="Cancel" onPress={() => setReady(false)} /></View>
              <View style={{ flex: 1 }}><Go label="Start" onPress={() => { setReady(false); setPts([]); setMeasuring(true); }} /></View>
            </View>
          </View>
        ) : c && sel ? (
          <View style={[s.panel, { paddingBottom: insets.bottom + 12, maxHeight: '42%' }]}>
            <ScrollView contentContainerStyle={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: KIND_COLOR[sel.kind], borderWidth: 1, borderColor: color.ink }} />
                <Text style={{ fontFamily: f.display, fontSize: 28, color: color.ink, flex: 1 }} numberOfLines={1} adjustsFontSizeToFit>{c.title}</Text>
                <Pressable onPress={() => setSel(null)} style={({ pressed }) => [s.x, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Close card"><Text style={{ fontSize: 18, color: color.ink }}>✕</Text></Pressable>
              </View>
              {c.flags.map((t) => <Text key={t} style={[s.flag, { fontFamily: f.bodyMedium }]}>{t}</Text>)}
              {c.rows.map((r) => (
                <View key={r.k} style={s.kv}>
                  <Text style={{ fontFamily: f.body, fontSize: 15, color: color.muted, maxWidth: '45%' }}>{r.k}</Text>
                  <Text style={{ fontFamily: f.bodySemi, fontSize: 16, color: color.ink, flex: 1, textAlign: 'right' }}>{r.v}</Text>
                </View>
              ))}
              <Note>{c.foot}</Note>
            </ScrollView>
          </View>
        ) : (
          <View style={[s.panel, { paddingBottom: insets.bottom + 12 }]}>
            <InfoNote><Note>Tap a lot or a marker for its card, or pick one from the list above. Works offline. Side, cutoff and miles come from the terminal directory (Appendix C and D).</Note></InfoNote>
          </View>
        )}
      </View>
    </Modal>
  );
}

// A short label centered on a point. The wrapper is only a positioning box; the text shrinks, never breaks mid-word.
function Pin({ x, y, text, lm, sel, small }: { x: number; y: number; text: string; lm?: boolean; sel?: boolean; small?: boolean }) {
  const f = useType();
  return (
    <View style={{ position: 'absolute', left: x - 90, top: y, width: 180, alignItems: 'center' }}>
      <Text style={[s.pill, lm && s.pillLm, sel && s.pillSel, small && s.pillSmall, { fontFamily: f.bodySemi }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 6 },
  title: { flex: 1, fontSize: 30, color: color.ink },
  btn: { minHeight: TAP, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.5, borderColor: color.line, backgroundColor: color.card, alignItems: 'center', justifyContent: 'center' },
  btnOn: { backgroundColor: color.ink, borderColor: color.ink },
  x: { minWidth: TAP, minHeight: TAP, borderRadius: 999, backgroundColor: color.soft, alignItems: 'center', justifyContent: 'center' },
  strip: { flexGrow: 0 },
  stripIn: { gap: 8, paddingHorizontal: 16, paddingVertical: 4 },
  chip: { minHeight: TAP, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1.5, borderColor: color.line, backgroundColor: color.card, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: color.ink, borderColor: color.ink },
  area: { flex: 1, overflow: 'hidden', backgroundColor: color.head },
  ctl: { position: 'absolute', right: 12, bottom: 12, gap: 10 },
  round: { width: TAP, height: TAP, borderRadius: TAP / 2, backgroundColor: color.card, borderWidth: 1.5, borderColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  rt: { fontSize: 28, color: color.ink, lineHeight: 32 },
  pillSmall: { fontSize: 9, paddingHorizontal: 3, paddingVertical: 0, borderRadius: 4 },
  pill: { maxWidth: 180, textAlign: 'center', fontSize: 12, color: color.ink, backgroundColor: color.card, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden', borderWidth: 1, borderColor: color.line },
  pillLm: { backgroundColor: color.head, color: color.headInk, borderColor: color.head },
  pillSel: { backgroundColor: color.accent, color: color.onAccent },
  panel: { backgroundColor: color.card, borderTopWidth: 1, borderTopColor: color.line, paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: color.soft },
  flag: { fontSize: 14, color: color.oInk, backgroundColor: color.oBg, borderWidth: 1.5, borderColor: color.orange, borderRadius: 10, padding: 10, overflow: 'hidden' },
});
