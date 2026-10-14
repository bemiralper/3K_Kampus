'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { daireSablonApi, yaziciProfiliApi } from './api';
import { clamp, mmToScreen, mmToStage, roundMm, screenToMm } from './geometry';
import {
  ORNEK_DEGERLER,
  TUR_ETIKETLERI,
  VERI_KAYNAKLARI,
  alanDegeri,
  alanUyarilari,
  bosAlan,
  etiketler,
  hazirlaBelge,
  isaretMerkezleri,
  kutuDilimleri,
  kutuMetni,
  kutuYonu,
  metinKapasite,
  sigdirAdSoyad,
  trUpper,
  varsayilanMetinKutusu,
  yeniId,
} from './kodlama';
import type { AlgilananDaire, AlgilananDizi, DaireAlan, DaireBelge, DaireLayout, DaireSablonDetay, DaireTur, KutuYonu, MetinKutusu, SolIz, TaramaKalibrasyonu } from './types';
import s from './daireDizisi.module.css';

type Tool = 'sec' | 'daire' | 'metin' | 'pan';
type Drag =
  | { kind: 'pan'; px: number; py: number; panX: number; panY: number }
  | { kind: 'create' | 'text-create'; id: string }
  | { kind: 'move'; id: string; grabX: number; grabY: number; originX: number; originY: number }
  | { kind: 'kutu-move' | 'kutu-olcu'; id: string }
  | { kind: 'count' | 'cap' | 'pitch-x' | 'pitch-y' | 'text-width' | 'text-height' | 'text-size'; id: string };

interface Props {
  sablon: DaireSablonDetay;
  onChange: (next: DaireSablonDetay) => void;
  onToast: (message: string) => void;
  onError: (message: string) => void;
  onDirty?: (dirty: boolean) => void;
}

function withTur(alan: DaireAlan, tur: DaireTur): DaireAlan {
  const next = { ...alan, tur };
  const fresh = alan.tur === 'daire_dizisi' && alan.satir === 1 && alan.sutun === 1;
  if (tur === 'metin') {
    return { ...next, ad: alan.ad === 'Daire dizisi' ? 'Metin alanı' : alan.ad, veri_kaynagi: alan.veri_kaynagi || 'ad_soyad' };
  }
  if (!fresh) return next;
  if (tur === 'tc_kimlik') {
    return { ...next, ad: 'T.C. Kimlik No', satir: 11, sutun: 10, veri_kaynagi: 'tc', etiketler: [], kodlama_yonu: 'satir_karakter' };
  }
  if (tur === 'ogrenci_numarasi') {
    return { ...next, ad: 'Öğrenci numarası', satir: 5, sutun: 10, veri_kaynagi: 'ogrenci_no', etiketler: [] };
  }
  if (tur === 'sinav_numarasi') {
    return { ...next, ad: 'Sınav numarası', satir: 4, sutun: 10, veri_kaynagi: 'sinav_no', etiketler: [] };
  }
  if (tur === 'sayisal_kodlama') {
    return { ...next, ad: 'Sayısal kod', satir: 4, sutun: 10, etiketler: [] };
  }
  if (tur === 'kitapcik_turu') {
    return { ...next, ad: 'Kitapçık türü', satir: 1, sutun: 4, etiketler: ['A', 'B', 'C', 'D'], veri_kaynagi: 'kitapcik' };
  }
  if (tur === 'tek_secim' || tur === 'coklu_secim') {
    return { ...next, ad: tur === 'tek_secim' ? 'Tek seçim' : 'Çoklu seçim', satir: 1, sutun: 4, etiketler: ['A', 'B', 'C', 'D'] };
  }
  if (tur === 'cevap_bloku') {
    return {
      ...next,
      ad: 'Cevap bloğu',
      satir: 20,
      sutun: 5,
      etiketler: ['A', 'B', 'C', 'D', 'E'],
      veri_kaynagi: '',
      cevap_bloku: {
        bolum_id: '',
        soru_baslangic: 1,
        soru_sayisi: 20,
        secenekler: ['A', 'B', 'C', 'D', 'E'],
        fiziksel_sira: [],
        coklu_isaret: false,
      },
    };
  }
  return next;
}

export default function DaireDizisiEditor({ sablon, onChange, onToast, onError, onDirty }: Props) {
  const [belge, setBelgeState] = useState<DaireBelge>(() => hazirlaBelge(sablon.belge));
  const belgeRef = useRef(belge);
  const [tool, setTool] = useState<Tool>('sec');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [secim, setSecimState] = useState<'alan' | 'kutu'>('alan');
  const secimRef = useRef<'alan' | 'kutu'>('alan');
  const setSecim = (next: 'alan' | 'kutu') => {
    secimRef.current = next;
    setSecimState(next);
  };
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 16, y: 16 });
  const [showGrid, setShowGrid] = useState(false);
  const [preview, setPreview] = useState(false);
  const [snap, setSnap] = useState(true);
  const [imageUrl, setImageUrl] = useState('');
  const [rasterUyari, setRasterUyari] = useState('');
  const [base, setBase] = useState({ w: 1000, h: 1414 });
  const [detected, setDetected] = useState<AlgilananDaire[]>([]);
  const [detectedGrids, setDetectedGrids] = useState<AlgilananDizi[]>([]);
  const [detectedTypes, setDetectedTypes] = useState<Record<number, DaireTur>>({});
  const [detectedOptionCounts, setDetectedOptionCounts] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [tarama, setTarama] = useState<TaramaKalibrasyonu | null>(null);
  const [hist, setHist] = useState(0);
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const [copyArmed, setCopyArmed] = useState(false);
  const [resolvedLayout, setResolvedLayout] = useState<DaireLayout | null>(null);
  const [layoutError, setLayoutError] = useState('');
  const savedSnapshot = useRef(JSON.stringify(hazirlaBelge(sablon.belge)));
  const viewportRef = useRef<HTMLDivElement>(null);
  const fmtRef = useRef<HTMLInputElement>(null);
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const past = useRef<DaireBelge[]>([]);
  const future = useRef<DaireBelge[]>([]);
  const gesture = useRef<DaireBelge | null>(null);
  const drag = useRef<Drag | null>(null);
  const space = useRef(false);
  const userView = useRef(false);
  const pageW = sablon.sayfa_genislik_mm;
  const pageH = sablon.sayfa_yukseklik_mm;

  const setBelge = useCallback((next: DaireBelge) => {
    belgeRef.current = next;
    setBelgeState(next);
  }, []);

  useEffect(() => {
    const next = hazirlaBelge(sablon.belge);
    setBelge(next);
    setSelectedId(null);
    setSecim('alan');
    past.current = [];
    future.current = [];
    savedSnapshot.current = JSON.stringify(next);
    setDetected([]);
    setDetectedGrids([]);
  }, [sablon.id, sablon.belge, setBelge]);

  const dirty = JSON.stringify(belge) !== savedSnapshot.current;
  useEffect(() => {
    onDirty?.(dirty);
    return () => onDirty?.(false);
  }, [dirty, onDirty]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      daireSablonApi.layout(sablon.id, belgeRef.current, true)
        .then(layout => {
          if (!cancelled) {
            setResolvedLayout(layout);
            setLayoutError('');
          }
        })
        .catch(err => {
          if (!cancelled) {
            setResolvedLayout(null);
            setLayoutError(err instanceof Error ? err.message : 'Yerleşim baskıya hazır değil.');
          }
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [sablon.id, belge]);

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    daireSablonApi.sayfa(sablon.id, sablon.sayfa_no)
      .then(res => {
        if (cancelled) {
          URL.revokeObjectURL(res.url);
          return;
        }
        objectUrl = res.url;
        setImageUrl(res.url);
        setRasterUyari(res.uyari);
      })
      .catch(err => {
        if (!cancelled) onError(err instanceof Error ? err.message : 'Form görüntüsü alınamadı.');
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sablon.id, sablon.sayfa_no, onError]);

  const toMm = useCallback((localX: number, localY: number) => screenToMm(
    localX, localY, panRef.current.x, panRef.current.y, zoomRef.current,
    base.w, base.h, pageW, pageH,
  ), [base.w, base.h, pageW, pageH]);

  const fit = useCallback(() => {
    const node = viewportRef.current;
    if (!node || !base.w || node.clientWidth < 40 || node.clientHeight < 40) return;
    userView.current = false;
    const scale = Math.min(node.clientWidth / base.w, node.clientHeight / base.h) * 0.96;
    const next = clamp(scale, 0.15, 8);
    setZoom(next);
    setPan({
      x: (node.clientWidth - base.w * next) / 2,
      y: (node.clientHeight - base.h * next) / 2,
    });
  }, [base.w, base.h]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      if (userView.current) return;
      fit();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [fit]);

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    userView.current = true;
    const current = zoomRef.current;
    const origin = panRef.current;
    const next = clamp(current * factor, 0.15, 8);
    const stageX = (cx - origin.x) / current;
    const stageY = (cy - origin.y) / current;
    setZoom(next);
    setPan({ x: cx - stageX * next, y: cy - stageY * next });
  }, []);

  const panBy = useCallback((dx: number, dy: number) => {
    userView.current = true;
    setPan({ x: panRef.current.x + dx, y: panRef.current.y + dy });
  }, []);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        zoomAt(event.deltaY < 0 ? 1.08 : 1 / 1.08, event.clientX - rect.left, event.clientY - rect.top);
        return;
      }
      const dx = event.shiftKey ? event.deltaY : event.deltaX;
      const dy = event.shiftKey ? 0 : event.deltaY;
      panBy(-dx, -dy);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [zoomAt, panBy]);

  const beginGesture = () => {
    if (!gesture.current) gesture.current = structuredClone(belgeRef.current);
  };
  const endGesture = () => {
    const before = gesture.current;
    gesture.current = null;
    if (!before) return;
    if (JSON.stringify(before) !== JSON.stringify(belgeRef.current)) {
      past.current = [...past.current, before].slice(-60);
      future.current = [];
      setHist(value => value + 1);
    }
  };
  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(structuredClone(belgeRef.current));
    setBelge(prev);
    setHist(value => value + 1);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(structuredClone(belgeRef.current));
    setBelge(next);
    setHist(value => value + 1);
  };

  const patchAlan = (id: string, patch: Partial<DaireAlan>) => {
    setBelge({
      ...belgeRef.current,
      alanlar: belgeRef.current.alanlar.map(alan => (alan.id === id ? { ...alan, ...patch } : alan)),
    });
  };

  const snapPoint = (x: number, y: number) => {
    if (!snap || detected.length === 0) return { x, y };
    let best: AlgilananDaire | null = null;
    let bestDist = 0.4;
    detected.forEach(circle => {
      const dist = Math.hypot(circle.x_mm - x, circle.y_mm - y);
      if (dist <= bestDist) {
        best = circle;
        bestDist = dist;
      }
    });
    const hit = best as AlgilananDaire | null;
    return hit ? { x: hit.x_mm, y: hit.y_mm } : { x, y };
  };

  const applyDrag = (mmx: number, mmy: number) => {
    const current = drag.current;
    if (!current || current.kind === 'pan') return;
    const alan = belgeRef.current.alanlar.find(item => item.id === current.id);
    if (!alan) return;
    if (current.kind === 'create' || current.kind === 'count') {
      const dx = mmx - alan.x_mm;
      const dy = mmy - alan.y_mm;
      patchAlan(alan.id, {
        sutun: clamp(Math.round(Math.max(dx, 0) / alan.aralik_x_mm) + 1, 1, 80),
        satir: clamp(Math.round(Math.max(dy, 0) / alan.aralik_y_mm) + 1, 1, 80),
      });
      return;
    }
    if (current.kind === 'kutu-move' && alan.metin_kutusu) {
      const yon = kutuYonu(alan, mmx, mmy);
      if (yon !== alan.metin_kutusu.yon) {
        patchAlan(alan.id, { metin_kutusu: { ...alan.metin_kutusu, yon } });
      }
      return;
    }
    if (current.kind === 'kutu-olcu' && alan.metin_kutusu) {
      const yon = alan.metin_kutusu.yon;
      const cap = alan.cap_mm;
      const bosluk = alan.metin_kutusu.bosluk_mm;
      let olcu = alan.metin_kutusu.olcu_mm;
      if (yon === 'ust') olcu = alan.y_mm - cap / 2 - bosluk - mmy;
      if (yon === 'alt') olcu = mmy - (alan.y_mm + (alan.satir - 1) * alan.aralik_y_mm + cap / 2 + bosluk);
      if (yon === 'sol') olcu = alan.x_mm - cap / 2 - bosluk - mmx;
      if (yon === 'sag') olcu = mmx - (alan.x_mm + (alan.sutun - 1) * alan.aralik_x_mm + cap / 2 + bosluk);
      patchAlan(alan.id, { metin_kutusu: { ...alan.metin_kutusu, olcu_mm: roundMm(clamp(olcu, 1.5, 40)) } });
      return;
    }
    if (current.kind === 'move') {
      const rawX = current.originX + (mmx - current.grabX);
      const rawY = current.originY + (mmy - current.grabY);
      const snapped = alan.tur === 'metin' ? { x: rawX, y: rawY } : snapPoint(rawX, rawY);
      patchAlan(alan.id, {
        x_mm: roundMm(clamp(snapped.x, 0, pageW)),
        y_mm: roundMm(clamp(snapped.y, 0, pageH)),
      });
      return;
    }
    if (current.kind === 'cap') {
      patchAlan(alan.id, { cap_mm: roundMm(clamp((mmx - alan.x_mm) * 2, 0.8, 15)) });
      return;
    }
    if (current.kind === 'pitch-x') {
      patchAlan(alan.id, { aralik_x_mm: roundMm(clamp(mmx - alan.x_mm, 0.8, 40)) });
      return;
    }
    if (current.kind === 'pitch-y') {
      patchAlan(alan.id, { aralik_y_mm: roundMm(clamp(mmy - alan.y_mm, 0.8, 40)) });
      return;
    }
    if (current.kind === 'text-width' || current.kind === 'text-height' || current.kind === 'text-size' || current.kind === 'text-create') {
      const patch: Partial<DaireAlan> = {};
      if (current.kind !== 'text-height') patch.genislik_mm = roundMm(clamp(mmx - alan.x_mm, 4, pageW));
      if (current.kind !== 'text-width') patch.yukseklik_mm = roundMm(clamp(mmy - alan.y_mm, 3, pageH));
      patchAlan(alan.id, patch);
      return;
    }
  };

  const boxContains = (x: number, y: number, w: number, h: number, mmx: number, mmy: number, slop: number) => (
    mmx >= x - slop && mmx <= x + w + slop && mmy >= y - slop && mmy <= y + h + slop
  );

  const hitField = (mmx: number, mmy: number): { id: string; part: 'alan' | 'kutu' } | null => {
    const slop = 12 / zoomRef.current / (base.w / pageW);
    const alanlar = belgeRef.current.alanlar;
    for (let index = alanlar.length - 1; index >= 0; index -= 1) {
      const alan = alanlar[index];
      if (alan.tur === 'metin' && boxContains(alan.x_mm, alan.y_mm, alan.genislik_mm, alan.yukseklik_mm, mmx, mmy, slop)) {
        return { id: alan.id, part: 'alan' };
      }
      if (kutuDilimleri(alan, '').some(dilim => boxContains(dilim.x_mm, dilim.y_mm, dilim.genislik_mm, dilim.yukseklik_mm, mmx, mmy, slop))) {
        return { id: alan.id, part: 'kutu' };
      }
    }
    let best: { id: string; dist: number } | null = null;
    alanlar.forEach(alan => {
      if (alan.tur === 'metin') return;
      for (let row = 0; row < alan.satir; row += 1) {
        for (let col = 0; col < alan.sutun; col += 1) {
          const cx = alan.x_mm + col * alan.aralik_x_mm;
          const cy = alan.y_mm + row * alan.aralik_y_mm;
          const dist = Math.hypot(mmx - cx, mmy - cy);
          if (dist <= Math.max(alan.cap_mm / 2, slop) && (!best || dist < best.dist)) {
            best = { id: alan.id, dist };
          }
        }
      }
    });
    const hit = best as { id: string; dist: number } | null;
    return hit ? { id: hit.id, part: 'alan' } : null;
  };

  const localFromEvent = (event: { clientX: number; clientY: number }) => {
    const rect = viewportRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const kopyaAlan = (alan: DaireAlan, dx = 0, dy = 0): DaireAlan => ({
    ...alan,
    id: yeniId(),
    ad: alan.ad.endsWith(' kopya') ? alan.ad : `${alan.ad} kopya`,
    x_mm: roundMm(clamp(alan.x_mm + dx, 0, pageW)),
    y_mm: roundMm(clamp(alan.y_mm + dy, 0, pageH)),
    etiketler: [...(alan.etiketler || [])],
    metin_kutusu: alan.metin_kutusu ? { ...alan.metin_kutusu } : null,
  });

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button === 2) {
      event.preventDefault();
      return;
    }
    if ((event.target as HTMLElement).dataset.handle) return;
    const local = localFromEvent(event);
    const copyDrag = event.button === 0 && event.altKey && (event.metaKey || event.ctrlKey);
    const hand = !copyDrag && (tool === 'pan' || space.current || event.ctrlKey || event.metaKey);
    if (event.button === 1 || (event.button === 0 && hand)) {
      drag.current = { kind: 'pan', px: local.x, py: local.y, panX: panRef.current.x, panY: panRef.current.y };
      setPanning(true);
      if (event.currentTarget.hasPointerCapture?.(event.pointerId) === false) {
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* sürükleme yakalama olmadan da sürer */ }
      }
      return;
    }
    const mm = toMm(local.x, local.y);
    if (mm.x < -5 || mm.y < -5 || mm.x > pageW + 5 || mm.y > pageH + 5) return;
    if (copyDrag) {
      event.preventDefault();
      const hit = hitField(mm.x, mm.y);
      if (!hit) return;
      const alan = belgeRef.current.alanlar.find(item => item.id === hit.id);
      if (!alan) return;
      beginGesture();
      const copy = kopyaAlan(alan);
      setBelge({ ...belgeRef.current, alanlar: [...belgeRef.current.alanlar, copy] });
      setSelectedId(copy.id);
      setSecim('alan');
      setTool('sec');
      drag.current = { kind: 'move', id: copy.id, grabX: mm.x, grabY: mm.y, originX: copy.x_mm, originY: copy.y_mm };
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* sürükleme yakalama olmadan da sürer */ }
      return;
    }
    if (tool === 'daire' || tool === 'metin') {
      beginGesture();
      const alan = bosAlan({
        tur: tool === 'metin' ? 'metin' : 'daire_dizisi',
        x_mm: roundMm(clamp(mm.x, 0, pageW)),
        y_mm: roundMm(clamp(mm.y, 0, pageH)),
        veri_kaynagi: tool === 'metin' ? 'ad_soyad' : '',
      });
      setBelge({ ...belgeRef.current, alanlar: [...belgeRef.current.alanlar, alan] });
      setSelectedId(alan.id);
      setSecim('alan');
      drag.current = tool === 'daire'
        ? { kind: 'create', id: alan.id }
        : { kind: 'text-create', id: alan.id };
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* sürükleme yakalama olmadan da sürer */ }
      return;
    }
    const hit = hitField(mm.x, mm.y);
    setSelectedId(hit?.id || null);
    setSecim(hit?.part === 'kutu' ? 'kutu' : 'alan');
    if (!hit) return;
    const alan = belgeRef.current.alanlar.find(item => item.id === hit.id);
    if (!alan) return;
    beginGesture();
    if (hit.part === 'kutu' && alan.metin_kutusu) {
      drag.current = { kind: 'kutu-move', id: hit.id };
    } else {
      drag.current = { kind: 'move', id: hit.id, grabX: mm.x, grabY: mm.y, originX: alan.x_mm, originY: alan.y_mm };
    }
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* sürükleme yakalama olmadan da sürer */ }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    const local = localFromEvent(event);
    if (current.kind === 'pan') {
      userView.current = true;
      setPan({ x: current.panX + (local.x - current.px), y: current.panY + (local.y - current.py) });
      return;
    }
    const mm = toMm(local.x, local.y);
    applyDrag(mm.x, mm.y);
  };

  const onPointerUp = () => {
    const current = drag.current;
    if (current?.kind === 'text-create') {
      const alan = belgeRef.current.alanlar.find(item => item.id === current.id);
      if (alan && alan.genislik_mm < 12 && alan.yukseklik_mm < 6) {
        patchAlan(alan.id, { genislik_mm: 45, yukseklik_mm: 8 });
      }
    }
    if (current?.kind !== 'pan') endGesture();
    drag.current = null;
    setPanning(false);
  };

  const startHandle = (kind: Drag['kind'], id: string, event: React.PointerEvent) => {
    event.stopPropagation();
    event.preventDefault();
    beginGesture();
    drag.current = { kind, id } as Drag;
    (viewportRef.current as HTMLDivElement).setPointerCapture(event.pointerId);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
      setCopyArmed(Boolean(!typing && event.altKey && (event.metaKey || event.ctrlKey)));
      if (event.code === 'Space' && !typing) {
        event.preventDefault();
        if (!space.current) {
          space.current = true;
          setSpaceDown(true);
        }
      }
      if (typing) return;
      const meta = event.metaKey || event.ctrlKey;
      if (meta && (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd')) {
        event.preventDefault();
        const node = viewportRef.current;
        if (node) zoomAt(1.15, node.clientWidth / 2, node.clientHeight / 2);
        return;
      }
      if (meta && (event.key === '-' || event.key === '_' || event.code === 'NumpadSubtract')) {
        event.preventDefault();
        const node = viewportRef.current;
        if (node) zoomAt(1 / 1.15, node.clientWidth / 2, node.clientHeight / 2);
        return;
      }
      if (meta && (event.key === '0' || event.code === 'Numpad0')) {
        event.preventDefault();
        fit();
        return;
      }
      if (meta && (event.key === '1' || event.code === 'Numpad1')) {
        event.preventDefault();
        const node = viewportRef.current;
        const current = zoomRef.current || 1;
        if (node) zoomAt(1 / current, node.clientWidth / 2, node.clientHeight / 2);
        return;
      }
      if (!meta && !event.altKey && event.key.toLowerCase() === 'h') {
        setTool('pan');
        return;
      }
      if (!meta && !event.altKey && event.key.toLowerCase() === 'v') {
        setTool('sec');
        return;
      }
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (meta && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicate();
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault();
        removeSelected();
        return;
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      const moveSheet = meta || tool === 'pan' || space.current || !selectedId;
      if (moveSheet) {
        event.preventDefault();
        const step = event.shiftKey ? 160 : 56;
        const dx = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0;
        const dy = event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0;
        panBy(dx, dy);
        return;
      }
      event.preventDefault();
      const step = event.shiftKey ? 1 : 0.2;
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      const alan = belgeRef.current.alanlar.find(item => item.id === selectedId);
      if (!alan) return;
      beginGesture();
      if (secimRef.current === 'kutu' && alan.metin_kutusu?.aktif) {
        const yonlar: Record<string, KutuYonu> = {
          ArrowUp: 'ust', ArrowDown: 'alt', ArrowLeft: 'sol', ArrowRight: 'sag',
        };
        if (event.shiftKey) {
          const delta = event.key === 'ArrowUp' || event.key === 'ArrowRight' ? 0.5 : -0.5;
          patchAlan(selectedId, {
            metin_kutusu: { ...alan.metin_kutusu, olcu_mm: roundMm(clamp(alan.metin_kutusu.olcu_mm + delta, 1.5, 40)) },
          });
        } else {
          patchAlan(selectedId, { metin_kutusu: { ...alan.metin_kutusu, yon: yonlar[event.key] } });
        }
      } else {
        patchAlan(selectedId, {
          x_mm: roundMm(clamp(alan.x_mm + dx, 0, pageW)),
          y_mm: roundMm(clamp(alan.y_mm + dy, 0, pageH)),
        });
      }
      endGesture();
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        space.current = false;
        setSpaceDown(false);
      }
      setCopyArmed(Boolean(event.altKey && (event.metaKey || event.ctrlKey)));
    };
    const blur = () => {
      space.current = false;
      setSpaceDown(false);
      setPanning(false);
      setCopyArmed(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  });

  const selected = belge.alanlar.find(alan => alan.id === selectedId) || null;

  const addAtCenter = (tur: 'daire_dizisi' | 'metin') => {
    const node = viewportRef.current;
    const mm = node
      ? toMm(node.clientWidth / 2, node.clientHeight / 2)
      : { x: pageW / 2, y: pageH / 2 };
    beginGesture();
    const alan = bosAlan({
      tur,
      x_mm: roundMm(clamp(mm.x, 0, pageW)),
      y_mm: roundMm(clamp(mm.y, 0, pageH)),
      veri_kaynagi: tur === 'metin' ? 'ad_soyad' : '',
    });
    setBelge({ ...belgeRef.current, alanlar: [...belgeRef.current.alanlar, alan] });
    setSelectedId(alan.id);
    setTool('sec');
    endGesture();
  };

  const removeSelected = () => {
    if (!selectedId) return;
    const alan = belgeRef.current.alanlar.find(item => item.id === selectedId);
    if (secimRef.current === 'kutu' && alan?.metin_kutusu) {
      beginGesture();
      patchAlan(selectedId, { metin_kutusu: { ...alan.metin_kutusu, aktif: false } });
      setSecim('alan');
      endGesture();
      return;
    }
    beginGesture();
    setBelge({ ...belgeRef.current, alanlar: belgeRef.current.alanlar.filter(item => item.id !== selectedId) });
    setSelectedId(null);
    setSecim('alan');
    endGesture();
  };

  const duplicate = () => {
    const alan = belgeRef.current.alanlar.find(item => item.id === selectedId);
    if (!alan) return;
    beginGesture();
    const copy = kopyaAlan(alan, 5, 5);
    setBelge({ ...belgeRef.current, alanlar: [...belgeRef.current.alanlar, copy] });
    setSelectedId(copy.id);
    endGesture();
  };

  const save = async () => {
    setBusy(true);
    try {
      await daireSablonApi.layout(sablon.id, belgeRef.current, true);
      const saved = await daireSablonApi.saveBelge(sablon.id, belgeRef.current);
      onChange(saved);
      const next = hazirlaBelge(saved.belge);
      setBelge(next);
      savedSnapshot.current = JSON.stringify(next);
      onToast(saved.uyarilar?.length ? `Kaydedildi. ${saved.uyarilar[0]}` : 'Şablon kaydedildi.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Şablon kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const uygulaIz = (sonraki: SolIz, izler?: SolIz[]) => {
    setBelge({ ...belgeRef.current, iz: sonraki, izler: izler || belgeRef.current.izler || [] });
  };

  const duzenleIz = (patch: Partial<SolIz>) => {
    const onceki = belgeRef.current.iz;
    if (!onceki) return;
    const sonraki = { ...onceki, ...patch };
    sonraki.adet = clamp(Math.round(sonraki.adet), 4, 200);
    sonraki.aralik_mm = roundMm(clamp(sonraki.aralik_mm, 2, 20));
    sonraki.satirlar_mm = Array.from(
      { length: sonraki.adet },
      (_unused, index) => roundMm(sonraki.y0_mm + index * sonraki.aralik_mm),
    );
    uygulaIz(sonraki, [sonraki, ...(belgeRef.current.izler || []).filter(item => item.id !== sonraki.id)]);
  };

  const kaldirIz = () => {
    setBelge({
      ...belgeRef.current,
      iz: null,
      izler: [],
      alanlar: belgeRef.current.alanlar.map(alan => ({
        ...alan,
        iz_id: '',
        iz_satir: null,
        iz_satirlar: [],
      })),
    });
  };

  const hizalaIz = async () => {
    setBusy(true);
    try {
      const result = await daireSablonApi.algila(sablon.id, sablon.sayfa_no, true);
      if (!result.iz) {
        onError(result.uyari || 'Sol kenarda kesikli iz bulunamadı.');
        return;
      }
      beginGesture();
      uygulaIz(result.iz, result.izler || [result.iz]);
      endGesture();
      onToast(`${result.iz.adet} sol iz bulundu. Aralık ${result.iz.aralik_mm.toFixed(3)} mm. Dairelerin yeri değişmedi. Okuma bu ize kilitlenir.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Sol iz ölçülemedi.');
    } finally {
      setBusy(false);
    }
  };

  const olcTarama = async (dosya: File) => {
    setBusy(true);
    setTarama(null);
    try {
      setTarama(await daireSablonApi.taramaKalibrasyon(sablon.id, dosya));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Tarama ölçülemedi.');
    } finally {
      setBusy(false);
    }
  };

  const uygulaTarama = () => {
    if (!tarama) return;
    beginGesture();
    setBelge({ ...belgeRef.current, kalibrasyon: { ...belgeRef.current.kalibrasyon, ...tarama.kalibrasyon } });
    endGesture();
    setTarama(null);
    onToast('Kalibrasyon taramaya göre ayarlandı. Kaydedince sonraki çıktılara uygulanır.');
  };

  const profiliKaydet = async () => {
    const ad = window.prompt('Yazıcı profili adı');
    if (!ad?.trim()) return;
    setBusy(true);
    try {
      const profile = await yaziciProfiliApi.create({
        ad: ad.trim(),
        kalibrasyon: belgeRef.current.kalibrasyon,
        son_kalite: tarama ? {
          once_mm: tarama.once_mm,
          sonra_mm: tarama.sonra_mm,
          isaret: tarama.isaret,
        } : {},
      });
      const saved = await daireSablonApi.update(sablon.id, { yazici_profili_id: profile.id });
      onChange(saved);
      onToast(`“${profile.ad}” yazıcı profili kaydedildi ve şablona bağlandı.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Yazıcı profili kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const detect = async () => {
    setBusy(true);
    try {
      const result = await daireSablonApi.algila(sablon.id, sablon.sayfa_no);
      setDetected(result.daireler);
      setDetectedGrids(result.diziler);
      setDetectedTypes(Object.fromEntries(result.diziler.map((_item, index) => [index, 'daire_dizisi'])));
      setDetectedOptionCounts(Object.fromEntries(result.diziler.map((_item, index) => [index, 5])));
      onToast(result.uyari || `${result.daireler.length} daire, ${result.diziler.length} dizi önerildi. Onaylamadan kaydedilmez.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Algılama yapılamadı.');
    } finally {
      setBusy(false);
    }
  };

  const acceptDetection = () => {
    const stash = detectedGrids;
    if (!stash.length) {
      onToast('Eklenecek düzenli dizi yok. Daireleri elle oluşturabilirsiniz.');
      return;
    }
    beginGesture();
    let nextQuestion = 1;
    const ek = stash.flatMap((dizi, index) => {
      const tur = detectedTypes[index] || 'daire_dizisi';
      const optionCount = Math.max(2, Math.min(dizi.sutun, detectedOptionCounts[index] || 5));
      const partCount = tur === 'cevap_bloku' ? Math.ceil(dizi.sutun / optionCount) : 1;
      return Array.from({ length: partCount }, (_unused, part) => {
        const colOffset = part * optionCount;
        const cols = Math.min(optionCount, dizi.sutun - colOffset);
        const baseAlan = bosAlan({
          tur: 'daire_dizisi',
          ad: partCount > 1 ? `Algılanan dizi ${index + 1}.${part + 1}` : `Algılanan dizi ${index + 1}`,
          x_mm: dizi.x_mm + colOffset * dizi.aralik_x_mm,
          y_mm: dizi.y_mm,
          satir: dizi.satir,
          sutun: cols,
          cap_mm: dizi.cap_mm,
          aralik_x_mm: dizi.aralik_x_mm,
          aralik_y_mm: dizi.aralik_y_mm,
        });
        const typed = withTur(baseAlan, tur);
        const source = tur === 'tc_kimlik' ? 'tc'
          : tur === 'ogrenci_numarasi' ? 'ogrenci_no'
            : tur === 'sinav_numarasi' ? 'sinav_no'
              : tur === 'kitapcik_turu' ? 'kitapcik' : '';
        const questionStart = nextQuestion;
        if (tur === 'cevap_bloku') nextQuestion += dizi.satir;
        return {
          ...typed,
          x_mm: baseAlan.x_mm,
          y_mm: dizi.y_mm,
          satir: dizi.satir,
          sutun: cols,
          cap_mm: dizi.cap_mm,
          aralik_x_mm: dizi.aralik_x_mm,
          aralik_y_mm: dizi.aralik_y_mm,
          veri_kaynagi: source,
          cevap_bloku: tur === 'cevap_bloku' ? {
            bolum_id: '',
            soru_baslangic: questionStart,
            soru_sayisi: dizi.satir,
            secenekler: Array.from({ length: cols }, (_v, pos) => String.fromCharCode(65 + pos)),
            fiziksel_sira: [],
            coklu_isaret: false,
          } : typed.cevap_bloku,
        };
      });
    });
    setBelge({ ...belgeRef.current, alanlar: [...belgeRef.current.alanlar, ...ek] });
    setSelectedId(ek[0]?.id || null);
    endGesture();
    onToast('Algılanan diziler eklendi. Kaydetmeden kalıcı olmaz.');
  };

  const changePage = async (no: number) => {
    if (no === sablon.sayfa_no) return;
    if (belge.alanlar.length && !window.confirm('Sayfa değişince mevcut alanlar bu sayfanın ölçüsüne göre durur. Devam edilsin mi?')) return;
    setBusy(true);
    try {
      onChange(await daireSablonApi.update(sablon.id, { sayfa_no: no }));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Sayfa seçilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const zoomBy = (factor: number) => {
    const node = viewportRef.current;
    if (!node) return;
    zoomAt(factor, node.clientWidth / 2, node.clientHeight / 2);
  };

  const viewCursor = panning
    ? s.grabbing
    : copyArmed
      ? s.copy
    : tool === 'pan' || spaceDown
      ? s.grab
      : tool === 'daire' || tool === 'metin'
        ? s.cross
        : '';

  const gridLines = [];
  if (showGrid) {
    for (let mm = 0; mm <= pageW; mm += 5) {
      const x = mmToStage(mm, pageW, base.w);
      gridLines.push(<line key={`v${mm}`} x1={x} y1={0} x2={x} y2={base.h} />);
    }
    for (let mm = 0; mm <= pageH; mm += 5) {
      const y = mmToStage(mm, pageH, base.h);
      gridLines.push(<line key={`h${mm}`} x1={0} y1={y} x2={base.w} y2={y} />);
    }
  }

  const screenOf = (x: number, y: number) => mmToScreen(x, y, pan.x, pan.y, zoom, base.w, base.h, pageW, pageH);

  const drawText = (
    key: string,
    box: { x_mm: number; y_mm: number; genislik_mm: number; yukseklik_mm: number; punto: number; hizalama: 'sol' | 'orta' | 'sag' },
    active: boolean,
    value: string,
  ) => {
    const x = mmToStage(box.x_mm, pageW, base.w);
    const y = mmToStage(box.y_mm, pageH, base.h);
    const w = mmToStage(box.genislik_mm, pageW, base.w);
    const h = mmToStage(Math.max(box.yukseklik_mm, 2), pageH, base.h);
    const anchor = box.hizalama === 'orta' ? 'middle' : box.hizalama === 'sag' ? 'end' : 'start';
    const tx = box.hizalama === 'orta' ? x + w / 2 : box.hizalama === 'sag' ? x + w - 2 : x + 2;
    const label = trUpper(value);
    return (
      <g key={key}>
        <rect x={x} y={y} width={Math.max(w, 1)} height={Math.max(h, 1)} className={active ? s.boxOn : s.box} />
        {label && (
          <text
            x={tx}
            y={y + h * 0.72}
            textAnchor={anchor}
            className={s.previewText}
            fontSize={Math.max(mmToStage(box.punto * 25.4 / 72, pageH, base.h), 1)}
          >
            {label}
          </text>
        )}
      </g>
    );
  };

  const okuFmt = async (file: File) => {
    setBusy(true);
    try {
      const sonuc = await daireSablonApi.fmt(sablon.id, file);
      beginGesture();
      setBelge({
        ...belgeRef.current,
        fmt: sonuc.fmt,
        alanlar: sonuc.alanlar,
      });
      endGesture();
      setSelectedId(null);
      const parcalar = [`${sonuc.alanlar.length} alan FMT dosyasından kuruldu.`];
      if (sonuc.fmt?.bagli) parcalar.push(`Izgara “${sonuc.fmt.bagli}” alanının ölçüsüne oturdu.`);
      if (sonuc.uyari) parcalar.push(sonuc.uyari);
      if (sonuc.atlanan?.length) parcalar.push(`Aynı hücreyi kullanan ${sonuc.atlanan.join(', ')} atlandı.`);
      parcalar.push('Kaydedince kalıcı olur.');
      onToast(parcalar.join(' '));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'FMT okunamadı.');
    } finally {
      setBusy(false);
      if (fmtRef.current) fmtRef.current.value = '';
    }
  };

  return (
    <div className={s.workspace}>
      <div className={s.toolbar}>
        <button
          type="button"
          className={s.primary}
          style={{ background: '#0262a7', color: '#fff', fontWeight: 600, padding: '6px 14px' }}
          onClick={() => fmtRef.current?.click()}
          disabled={busy}
          title="FMT dosyası yükleyerek tüm alanları ve ızgarayı otomatik kurun"
        >
          📄 FMT Oku
        </button>
        <input
          ref={fmtRef}
          type="file"
          accept=".fmt,text/plain"
          hidden
          onChange={event => {
            const file = event.target.files?.[0];
            if (file) void okuFmt(file);
          }}
        />
        <span className={s.sep} />
        <button type="button" className={`${s.toolBtn} ${tool === 'sec' ? s.toolOn : ''}`} onClick={() => setTool('sec')} title="Seç ve Taşı">Seç</button>
        <button type="button" className={`${s.toolBtn} ${tool === 'pan' ? s.toolOn : ''}`} onClick={() => setTool('pan')} title="Tuvali Kaydır">El</button>
        <button type="button" className={`${s.toolBtn} ${tool === 'daire' ? s.toolOn : ''}`} onClick={() => setTool('daire')} title="Manuel Daire Alanı Ekle">+ Daire Alanı</button>
        <button type="button" className={`${s.toolBtn} ${tool === 'metin' ? s.toolOn : ''}`} onClick={() => setTool('metin')} title="Manuel Metin Alanı Ekle">+ Metin Alanı</button>
        <span className={s.sep} />
        <button type="button" className={s.toolBtn} onClick={() => zoomBy(1.15)}>Yakınlaştır</button>
        <button type="button" className={s.toolBtn} onClick={() => zoomBy(1 / 1.15)}>Uzaklaştır</button>
        <button type="button" className={s.toolBtn} onClick={fit}>Sığdır</button>
        <button type="button" className={`${s.toolBtn} ${showGrid ? s.toolOn : ''}`} onClick={() => setShowGrid(value => !value)}>Izgara</button>
        <button type="button" className={`${s.toolBtn} ${preview ? s.toolOn : ''}`} onClick={() => setPreview(value => !value)}>Önizleme</button>
        <button type="button" className={s.toolBtn} onClick={undo} disabled={!past.current.length}>Geri al</button>
        <button type="button" className={s.toolBtn} onClick={redo} disabled={!future.current.length}>Yinele</button>
        <button type="button" className={s.primary} onClick={save} disabled={busy}>Kaydet</button>
        <span className={s.note}>{pageW.toFixed(2)} × {pageH.toFixed(2)} mm</span>
        {sablon.sayfa_sayisi > 1 && (
          <label className={s.pagePick}>
            Sayfa
            <select value={sablon.sayfa_no} onChange={event => changePage(Number(event.target.value))}>
              {Array.from({ length: sablon.sayfa_sayisi }, (_, index) => (
                <option key={index + 1} value={index + 1}>{index + 1}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {dirty && <p className={s.note}>Kaydedilmemiş değişiklikler var.</p>}
      {layoutError && <p className={s.banner}>{layoutError}</p>}
      {rasterUyari && <p className={s.note}>{rasterUyari}</p>}
      {detected.length > 0 && (
        <div className={s.banner}>
          <span>{detected.length} daire göründü{detectedGrids.length ? `, ${detectedGrids.length} ayrı dizi önerildi` : ''}. Her dizinin görevini seçin; algılanan geometri değiştirilmez.</span>
          {detectedGrids.map((grid, index) => (
            <label key={`${grid.x_mm}-${grid.y_mm}`} className={s.pagePick}>
              {index + 1}. dizi ({grid.satir}×{grid.sutun})
              <select value={detectedTypes[index] || 'daire_dizisi'} onChange={event => setDetectedTypes(current => ({ ...current, [index]: event.target.value as DaireTur }))}>
                <option value="tc_kimlik">T.C.</option>
                <option value="daire_dizisi">Ad soyad</option>
                <option value="ogrenci_numarasi">Öğrenci no</option>
                <option value="sinav_numarasi">Sınav no</option>
                <option value="kitapcik_turu">Kitapçık</option>
                <option value="cevap_bloku">Cevap bloğu</option>
                <option value="tek_secim">Tek seçim</option>
                <option value="coklu_secim">Çoklu seçim</option>
              </select>
              {(detectedTypes[index] || 'daire_dizisi') === 'cevap_bloku' && (
                <input
                  type="number"
                  min={2}
                  max={grid.sutun}
                  title="Her sorudaki seçenek sayısı; geniş diziler buna göre otomatik bölünür."
                  value={detectedOptionCounts[index] || 5}
                  onChange={event => setDetectedOptionCounts(current => ({
                    ...current,
                    [index]: Number(event.target.value) || 5,
                  }))}
                />
              )}
            </label>
          ))}
          <button type="button" className={s.toolBtn} onClick={acceptDetection}>Dizileri ekle</button>
          <button type="button" className={s.toolBtn} onClick={() => { setDetected([]); setDetectedGrids([]); }}>Reddet</button>
          <label className={s.check}>
            <input type="checkbox" checked={snap} onChange={event => setSnap(event.target.checked)} />
            Algılanan merkeze hizala
          </label>
        </div>
      )}
      <div className={s.editorBody}>
        <div
          ref={viewportRef}
          className={`${s.viewport} ${viewCursor}`}
          role="application"
          aria-label="Optik form tuvali"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={event => event.preventDefault()}
        >
          <div className={s.stage} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
            {imageUrl && (
              <img
                src={imageUrl}
                alt=""
                className={s.formImg}
                draggable={false}
                onLoad={event => {
                  const img = event.currentTarget;
                  const w = img.naturalWidth || 1;
                  const h = img.naturalHeight || 1;
                  setBase({ w, h });
                  const node = viewportRef.current;
                  if (!node) return;
                  const scale = clamp(Math.min(node.clientWidth / w, node.clientHeight / h) * 0.96, 0.15, 8);
                  setZoom(scale);
                  setPan({
                    x: (node.clientWidth - w * scale) / 2,
                    y: (node.clientHeight - h * scale) / 2,
                  });
                }}
              />
            )}
            {base.w > 0 && (
            <svg className={s.overlay} viewBox={`0 0 ${base.w} ${base.h}`} preserveAspectRatio="none" aria-hidden>
              <g className={s.grid}>{gridLines}</g>
              {belge.iz && Array.from({ length: belge.iz.adet }, (_, index) => {
                const iz = belge.iz!;
                const satir = iz.satirlar_mm && iz.satirlar_mm.length === iz.adet
                  ? iz.satirlar_mm[index]
                  : iz.y0_mm + index * iz.aralik_mm;
                const y = mmToStage(satir, pageH, base.h);
                const x1 = mmToStage(iz.x_mm, pageW, base.w);
                const x0 = mmToStage(iz.x_mm - iz.genislik_mm, pageW, base.w);
                return <line key={`iz${index}`} x1={x0} y1={y} x2={x1} y2={y} className={s.tick} />;
              })}
              {detected.map((circle, index) => {
                const p = { x: mmToStage(circle.x_mm, pageW, base.w), y: mmToStage(circle.y_mm, pageH, base.h) };
                const r = mmToStage(circle.cap_mm / 2, pageW, base.w);
                return <circle key={`d${index}`} cx={p.x} cy={p.y} r={r} className={s.ghost} />;
              })}
              {belge.alanlar.map(alan => {
                const active = alan.id === selectedId && secim === 'alan';
                if (alan.tur === 'metin') return null;
                const localMarks = preview ? isaretMerkezleri(alan, alanDegeri(alan, ORNEK_DEGERLER)) : [];
                const merkezler = Array.from({ length: alan.satir * alan.sutun }, (_, index) => ({
                  satir: Math.floor(index / alan.sutun),
                  sutun: index % alan.sutun,
                  x_mm: alan.x_mm + (index % alan.sutun) * alan.aralik_x_mm,
                  y_mm: alan.y_mm + Math.floor(index / alan.sutun) * alan.aralik_y_mm,
                  cap_mm: alan.cap_mm,
                }));
                const circles = [];
                for (const merkez of merkezler) {
                    const { satir: row, sutun: col, x_mm: cx, y_mm: cy } = merkez;
                    const p = { x: mmToStage(cx, pageW, base.w), y: mmToStage(cy, pageH, base.h) };
                    const r = mmToStage(merkez.cap_mm / 2, pageW, base.w);
                    const filled = localMarks.some(mark => Math.abs(mark.x - cx) < 0.05 && Math.abs(mark.y - cy) < 0.05);
                    const fillRadius = mmToStage(
                      (alan.isaret_cap_mm || alan.cap_mm * 0.68) / 2,
                      pageW,
                      base.w,
                    );
                    circles.push(
                      <g key={`${alan.id}-${row}-${col}`}>
                        <circle cx={p.x} cy={p.y} r={Math.max(r, 0.5)} className={active ? s.bubbleOn : s.bubble} />
                        <circle cx={p.x} cy={p.y} r={2} className={s.center} />
                        {filled && <circle cx={p.x} cy={p.y} r={Math.max(fillRadius, 0.5)} className={s.fill} />}
                      </g>,
                    );
                }
                const xs = merkezler.map(item => item.x_mm);
                const ys = merkezler.map(item => item.y_mm);
                const radius = (merkezler[0]?.cap_mm || alan.cap_mm) / 2;
                const x0 = mmToStage(Math.min(...xs) - radius, pageW, base.w);
                const y0 = mmToStage(Math.min(...ys) - radius, pageH, base.h);
                const x1 = mmToStage(Math.max(...xs) + radius, pageW, base.w);
                const y1 = mmToStage(Math.max(...ys) + radius, pageH, base.h);
                return (
                  <g key={alan.id}>
                    {active && <rect x={x0} y={y0} width={Math.max(x1 - x0, 1)} height={Math.max(y1 - y0, 1)} className={s.bounds} />}
                    {circles}
                  </g>
                );
              })}
              {belge.alanlar.map(alan => {
                if (alan.tur === 'metin') {
                  return drawText(
                    alan.id,
                    alan,
                    alan.id === selectedId,
                    preview && resolvedLayout ? '' : alan.veri_kaynagi === 'ad_soyad'
                      ? sigdirAdSoyad(alanDegeri(alan, ORNEK_DEGERLER), metinKapasite(alan.genislik_mm, alan.punto, alan.karakter_araligi))
                      : alanDegeri(alan, ORNEK_DEGERLER),
                  );
                }
                const kutu = alan.metin_kutusu;
                if (!kutu?.aktif) return null;
                const active = alan.id === selectedId && secim === 'kutu';
                return (
                  <g key={`${alan.id}-kutular`}>
                    {kutuDilimleri(alan, kutuMetni(alan, ORNEK_DEGERLER)).map((dilim, index) => drawText(
                      `${alan.id}-kutu-${index}`,
                      { ...dilim, punto: kutu.punto, hizalama: kutu.hizalama },
                      active,
                      preview && resolvedLayout ? '' : dilim.metin,
                    ))}
                  </g>
                );
              })}
              {preview && resolvedLayout?.ornek.metinler.map((line, index) => {
                const xMm = Number(line.x_mm);
                const yMm = Number(line.y_mm);
                const widthMm = Number(line.width_mm);
                const align = String(line.hizalama || 'sol');
                const anchor = align === 'orta' ? 'middle' : align === 'sag' ? 'end' : 'start';
                const x = xMm + (align === 'orta' ? widthMm / 2 : align === 'sag' ? widthMm : 0);
                return (
                  <text
                    key={`backend-text-${index}`}
                    x={mmToStage(x, pageW, base.w)}
                    y={mmToStage(yMm, pageH, base.h)}
                    textAnchor={anchor}
                    className={s.previewText}
                    fontSize={mmToStage(Number(line.size) * 25.4 / 72, pageH, base.h)}
                  >
                    {String(line.text || '')}
                  </text>
                );
              })}
            </svg>
            )}
          </div>
          {selected && selected.tur !== 'metin' && secim === 'alan' && (
            <>
              <Handle title="Satır ve sütun" className={s.handleCount} x={screenOf(selected.x_mm + (selected.sutun - 1) * selected.aralik_x_mm, selected.y_mm + (selected.satir - 1) * selected.aralik_y_mm).x + 16} y={screenOf(selected.x_mm + (selected.sutun - 1) * selected.aralik_x_mm, selected.y_mm + (selected.satir - 1) * selected.aralik_y_mm).y + 16} onPointerDown={event => startHandle('count', selected.id, event)} />
              <Handle title="Çap" className={s.handleCap} x={screenOf(selected.x_mm + selected.cap_mm / 2, selected.y_mm).x + 10} y={screenOf(selected.x_mm + selected.cap_mm / 2, selected.y_mm).y} onPointerDown={event => startHandle('cap', selected.id, event)} />
              <Handle title="Yatay aralık" className={s.handlePitch} x={screenOf(selected.x_mm + selected.aralik_x_mm, selected.y_mm).x} y={screenOf(selected.x_mm + selected.aralik_x_mm, selected.y_mm).y - 16} onPointerDown={event => startHandle('pitch-x', selected.id, event)} />
              <Handle title="Dikey aralık" className={s.handlePitch} x={screenOf(selected.x_mm, selected.y_mm + selected.aralik_y_mm).x - 16} y={screenOf(selected.x_mm, selected.y_mm + selected.aralik_y_mm).y} onPointerDown={event => startHandle('pitch-y', selected.id, event)} />
            </>
          )}
          {selected && selected.tur === 'metin' && (
            <BoxHandles
              x={selected.x_mm}
              y={selected.y_mm}
              w={selected.genislik_mm}
              h={selected.yukseklik_mm}
              onWidth={event => startHandle('text-width', selected.id, event)}
              onHeight={event => startHandle('text-height', selected.id, event)}
              onCorner={event => startHandle('text-size', selected.id, event)}
              screenOf={screenOf}
            />
          )}
          {selected && secim === 'kutu' && selected.metin_kutusu?.aktif && (
            <KutuOlcuHandle alan={selected} screenOf={screenOf} onPointerDown={event => startHandle('kutu-olcu', selected.id, event)} />
          )}
        </div>
        <aside className={s.panel}>
          <h2>Özellikler</h2>
          <div className={s.fieldList}>
            {belge.alanlar.map(alan => (
              <button key={alan.id} type="button" className={alan.id === selectedId ? s.fieldOn : s.fieldBtn} onClick={() => { setSelectedId(alan.id); setSecim('alan'); setTool('sec'); }}>
                <strong>{alan.ad}</strong>
                <span>{TUR_ETIKETLERI.find(item => item.id === alan.tur)?.label}</span>
              </button>
            ))}
            {belge.alanlar.length === 0 && <p className={s.note}>Henüz alan yok. Daire dizisini formun ilk dairesinden sürükleyin.</p>}
          </div>
          {selected && (
            <AlanFormu
              alan={selected}
              onFocus={beginGesture}
              onBlur={endGesture}
              onPatch={patch => patchAlan(selected.id, patch)}
              onTur={tur => patchAlan(selected.id, withTur(selected, tur))}
              onDelete={removeSelected}
              onDuplicate={duplicate}
              onKutu={() => setSecim('kutu')}
              izler={belge.izler || []}
            />
          )}
          <h3>Zamanlama İzleri (OMR)</h3>
          <p className={s.note}>Formun solundaki siyah dikdörtgenler, dolu kâğıt taranıp optik okuma yapılırken sayfayı şablona kilitlemek içindir. Form yüklendiğinde otomatik taranır.</p>
          <button type="button" className={s.ghost} disabled={busy} onClick={hizalaIz}>Zamanlama izlerini yeniden tara</button>
          {belge.iz && (
            <>
              <div className={s.grid2}>
                <Num label="İlk iz (mm)" value={belge.iz.y0_mm} step="0.05" onFocus={beginGesture} onBlur={endGesture} onChange={value => duzenleIz({ y0_mm: value })} />
                <Num label="İz aralığı (mm)" value={belge.iz.aralik_mm} step="0.005" onFocus={beginGesture} onBlur={endGesture} onChange={value => duzenleIz({ aralik_mm: value })} />
                <Num label="İz sayısı" value={belge.iz.adet} step="1" onFocus={beginGesture} onBlur={endGesture} onChange={value => duzenleIz({ adet: value })} />
                <Num label="İz sağ kenarı (mm)" value={belge.iz.x_mm} step="0.05" onFocus={beginGesture} onBlur={endGesture} onChange={value => duzenleIz({ x_mm: value })} />
              </div>
              <button type="button" className={s.ghost} onClick={kaldirIz}>İzleri kaldır</button>
            </>
          )}
          <h3>Baskı kalibrasyonu</h3>
          {sablon.yazici_profili_ad ? (
            <div style={{ margin: '6px 0 10px', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13, color: '#166534' }}>
              Bağlı Yazıcı Profili: <strong>{sablon.yazici_profili_ad}</strong>
              <div style={{ fontSize: 11.5, color: '#15803d', marginTop: 2 }}>Değerler şablon ve bağlı yazıcı profiliyle eşzamanlı kaydedilir. Çıktıda bu profil uygulanır.</div>
            </div>
          ) : (
            <p className={s.note}>Ofset ve ölçek dairelerin kayıtlı ölçüsünü değiştirmez. Dikey ölçek yalnız satır aralığını ve baskıdaki kâğıt esnemesini telafi eder.</p>
          )}
          <div className={s.grid2}>
            <Num label="Yatay ofset (mm)" value={belge.kalibrasyon.ofset_x_mm} step="0.1" onFocus={beginGesture} onBlur={endGesture} onChange={value => setBelge({ ...belgeRef.current, kalibrasyon: { ...belgeRef.current.kalibrasyon, ofset_x_mm: value } })} />
            <Num label="Dikey ofset (mm)" value={belge.kalibrasyon.ofset_y_mm} step="0.1" onFocus={beginGesture} onBlur={endGesture} onChange={value => setBelge({ ...belgeRef.current, kalibrasyon: { ...belgeRef.current.kalibrasyon, ofset_y_mm: value } })} />
            <Num label="Yatay ölçek" value={belge.kalibrasyon.olcek} step="0.005" onFocus={beginGesture} onBlur={endGesture} onChange={value => {
              const kal = belgeRef.current.kalibrasyon;
              const bagli = Math.abs(kal.olcek_y - kal.olcek) < 0.0001;
              setBelge({ ...belgeRef.current, kalibrasyon: { ...kal, olcek: value, olcek_y: bagli ? value : kal.olcek_y } });
            }} />
            <Num label="Dikey ölçek" value={belge.kalibrasyon.olcek_y} step="0.005" onFocus={beginGesture} onBlur={endGesture} onChange={value => setBelge({ ...belgeRef.current, kalibrasyon: { ...belgeRef.current.kalibrasyon, olcek_y: value } })} />
            {belge.iz && (
              <Num
                label="Baskıdaki iz aralığı (mm)"
                value={Math.round(belge.iz.aralik_mm * belge.kalibrasyon.olcek_y * 1000) / 1000}
                step="0.005"
                onFocus={beginGesture}
                onBlur={endGesture}
                onChange={value => {
                  const aralik = belgeRef.current.iz?.aralik_mm || 0;
                  if (aralik <= 0) return;
                  const olcekY = Math.min(1.15, Math.max(0.85, value / aralik));
                  setBelge({ ...belgeRef.current, kalibrasyon: { ...belgeRef.current.kalibrasyon, olcek_y: Math.round(olcekY * 1000) / 1000 } });
                }}
              />
            )}
          </div>
          <div className={s.rowActions}>
            <button type="button" className={s.ghost} disabled={busy} onClick={() => daireSablonApi.onizleme(sablon.id).then(notes => { if (notes.length) onToast(notes.join(' ')); }).catch(err => onError(err instanceof Error ? err.message : 'Önizleme indirilemedi.'))}>PDF önizleme</button>
            <button type="button" className={s.ghost} disabled={busy} onClick={() => daireSablonApi.testBaski(sablon.id).then(notes => { if (notes.length) onToast(notes.join(' ')); }).catch(err => onError(err instanceof Error ? err.message : 'Test baskısı indirilemedi.'))}>Test baskısı</button>
            <button type="button" className={s.ghost} disabled={busy} onClick={profiliKaydet}>Yazıcı profili olarak kaydet</button>
          </div>
          <p className={s.note}>PDF önizleme formu da gösterir. Test baskısı ve sınav çıktısı yalnız yazı ile karalamayı basar. Yazdırırken ölçek yüzde 100 kalsın, sayfaya sığdırma kapalı olsun.</p>
          <h3>Taramadan ayarla</h3>
          <p className={s.note}>Kaydedilmiş şablonla test baskısını ön baskılı forma basın, sayfayı kırpmadan tarayın ve yükleyin. Her işaretin düştüğü yer ölçülür; yazıcının büyütmesi ve kayması kalibrasyona çevrilir.</p>
          <label className={s.ghost}>
            Taramayı seç (PDF, JPG, PNG)
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              className={s.hidden}
              disabled={busy}
              onChange={event => {
                const dosya = event.target.files?.[0];
                event.target.value = '';
                if (dosya) olcTarama(dosya);
              }}
            />
          </label>
          {tarama && (
            <div className={s.note}>
              <p>
                {tarama.isaret} işaret ölçüldü. Şu an dairelerden ortalama {tarama.once_mm.medyan.toFixed(2)} mm (en çok {tarama.once_mm.en_cok.toFixed(2)} mm) kaçıyor.
                Öneriyle beklenen sapma {tarama.sonra_mm.medyan.toFixed(2)} mm (en çok {tarama.sonra_mm.en_cok.toFixed(2)} mm).
              </p>
              <p>
                Yatay ölçek {tarama.kalibrasyon.olcek.toFixed(4)}, dikey ölçek {tarama.kalibrasyon.olcek_y.toFixed(4)},
                yatay ofset {tarama.kalibrasyon.ofset_x_mm.toFixed(2)} mm, dikey ofset {tarama.kalibrasyon.ofset_y_mm.toFixed(2)} mm.
              </p>
              <p>Ölçüm kalitesi %{Math.round((tarama.kalite ?? 0) * 100)}{tarama.yazici.donus_derece != null ? ` · tarama eğimi ${tarama.yazici.donus_derece.toFixed(2)}°` : ''}.</p>
              {tarama.uyari && <p>{tarama.uyari}</p>}
              <div className={s.rowActions}>
                <button type="button" className={s.primary} onClick={uygulaTarama}>Uygula</button>
                <button type="button" className={s.ghost} onClick={() => setTarama(null)}>Vazgeç</button>
              </div>
            </div>
          )}
          <span className={s.hidden}>{hist}</span>
        </aside>
      </div>
    </div>
  );
}

function KutuOlcuHandle({ alan, screenOf, onPointerDown }: {
  alan: DaireAlan;
  screenOf: (x: number, y: number) => { x: number; y: number };
  onPointerDown: (event: React.PointerEvent) => void;
}) {
  const kutu = alan.metin_kutusu;
  const dilimler = kutuDilimleri(alan, '');
  if (!kutu || !dilimler.length) return null;
  const minX = Math.min(...dilimler.map(item => item.x_mm));
  const maxX = Math.max(...dilimler.map(item => item.x_mm + item.genislik_mm));
  const minY = Math.min(...dilimler.map(item => item.y_mm));
  const maxY = Math.max(...dilimler.map(item => item.y_mm + item.yukseklik_mm));
  const yatay = kutu.yon === 'ust' || kutu.yon === 'alt';
  const point = screenOf(
    kutu.yon === 'sol' ? minX : kutu.yon === 'sag' ? maxX : (minX + maxX) / 2,
    kutu.yon === 'ust' ? minY : kutu.yon === 'alt' ? maxY : (minY + maxY) / 2,
  );
  return (
    <Handle
      title={yatay ? 'Yükseklik' : 'Genişlik'}
      className={yatay ? s.handleHeight : s.handleCap}
      x={point.x}
      y={point.y}
      onPointerDown={onPointerDown}
    />
  );
}

function BoxHandles({ x, y, w, h, onWidth, onHeight, onCorner, screenOf }: {
  x: number;
  y: number;
  w: number;
  h: number;
  onWidth: (event: React.PointerEvent) => void;
  onHeight: (event: React.PointerEvent) => void;
  onCorner: (event: React.PointerEvent) => void;
  screenOf: (x: number, y: number) => { x: number; y: number };
}) {
  const right = screenOf(x + w, y + h / 2);
  const bottom = screenOf(x + w / 2, y + h);
  const corner = screenOf(x + w, y + h);
  return (
    <>
      <Handle title="Genişlik" className={s.handleCap} x={right.x} y={right.y} onPointerDown={onWidth} />
      <Handle title="Yükseklik" className={s.handleHeight} x={bottom.x} y={bottom.y} onPointerDown={onHeight} />
      <Handle title="Boyut" className={s.handleCount} x={corner.x} y={corner.y} onPointerDown={onCorner} />
    </>
  );
}

function Handle({ title, className, x, y, onPointerDown }: { title: string; className: string; x: number; y: number; onPointerDown: (event: React.PointerEvent) => void }) {
  return (
    <button
      type="button"
      title={title}
      data-handle="1"
      className={`${s.handle} ${className}`}
      style={{ left: x, top: y }}
      onPointerDown={onPointerDown}
    />
  );
}

function Num({ label, value, step, onChange, onFocus, onBlur }: {
  label: string;
  value: number;
  step: string;
  onChange: (value: number) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onFocus={onFocus}
        onBlur={onBlur}
        onChange={event => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}

function AlanFormu({ alan, onPatch, onTur, onDelete, onDuplicate, onFocus, onBlur, onKutu, izler }: {
  alan: DaireAlan;
  onPatch: (patch: Partial<DaireAlan>) => void;
  onTur: (tur: DaireTur) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onKutu: () => void;
  izler: SolIz[];
}) {
  const uyarilar = alanUyarilari(alan);
  const daire = alan.tur !== 'metin';
  return (
    <div className={s.form}>
      <label className={s.check}>
        <input type="checkbox" checked={alan.aktif} onChange={event => onPatch({ aktif: event.target.checked })} />
        Bu alan baskı ve OMR’de aktif
      </label>
      <label>
        Alan adı
        <input value={alan.ad} onFocus={onFocus} onBlur={onBlur} onChange={event => onPatch({ ad: event.target.value })} />
      </label>
      <label>
        Alan türü
        <select value={alan.tur} onChange={event => onTur(event.target.value as DaireTur)}>
          {TUR_ETIKETLERI.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <label>
        Veri kaynağı
        <select value={alan.veri_kaynagi} onChange={event => onPatch({ veri_kaynagi: event.target.value })}>
          <option value="">Sabit değer</option>
          {VERI_KAYNAKLARI.map(item => (
            <option key={item.kod} value={item.kod}>{item.etiket}</option>
          ))}
        </select>
      </label>
      <p className={s.kaynak}>
        {alan.veri_kaynagi
          ? VERI_KAYNAKLARI.find(item => item.kod === alan.veri_kaynagi)?.kaynak
          : 'Alan adı ile kayıtlı veri ayrıdır.'}
      </p>
      {!alan.veri_kaynagi && (
        <label>
          Sabit değer
          <input value={alan.sabit_deger} onFocus={onFocus} onBlur={onBlur} onChange={event => onPatch({ sabit_deger: event.target.value })} />
        </label>
      )}
      {daire && (
        <>
          <div className={s.grid2}>
            <Num label="Satır" value={alan.satir} step="1" onFocus={onFocus} onBlur={onBlur} onChange={value => onPatch({ satir: clamp(Math.round(value), 1, 80) })} />
            <Num label="Sütun" value={alan.sutun} step="1" onFocus={onFocus} onBlur={onBlur} onChange={value => onPatch({ sutun: clamp(Math.round(value), 1, 80) })} />
            <Num label="Daire çapı (mm)" value={alan.cap_mm} step="0.1" onFocus={onFocus} onBlur={onBlur} onChange={value => {
              const cap = roundMm(clamp(value, 0.8, 15));
              onPatch({ cap_mm: cap, isaret_cap_mm: Math.min(alan.isaret_cap_mm || cap * 0.68, cap) });
            }} />
            <Num label="Siyah işaret çapı (mm)" value={alan.isaret_cap_mm || roundMm(alan.cap_mm * 0.68)} step="0.1" onFocus={onFocus} onBlur={onBlur} onChange={value => onPatch({ isaret_cap_mm: roundMm(clamp(value, 0.4, alan.cap_mm)) })} />
            <Num label="Yatay aralık (mm)" value={alan.aralik_x_mm} step="0.1" onFocus={onFocus} onBlur={onBlur} onChange={value => onPatch({ aralik_x_mm: roundMm(value) })} />
            <Num label="Dikey aralık (mm)" value={alan.aralik_y_mm} step="0.1" onFocus={onFocus} onBlur={onBlur} onChange={value => onPatch({ aralik_y_mm: roundMm(value) })} />
          </div>
          <label>
            Kodlama yönü
            <select value={alan.kodlama_yonu} onChange={event => onPatch({ kodlama_yonu: event.target.value as DaireAlan['kodlama_yonu'] })}>
              <option value="satir_karakter">Satırlar karakter, sütunlar seçenek</option>
              <option value="sutun_karakter">Sütunlar karakter, satırlar seçenek</option>
            </select>
          </label>
          {izler.length > 0 && (
            <label>
              Satır zaman izi
              <select value={alan.iz_id || ''} onChange={event => onPatch({ iz_id: event.target.value })}>
                <option value="">Eski/varsayılan iz</option>
                {izler.map((iz, index) => <option key={iz.id || index} value={iz.id || ''}>{iz.kenar === 'sag' ? 'Sağ' : 'Sol'} iz {index + 1}</option>)}
              </select>
            </label>
          )}
          <label>
            Sayı hizası
            <select value={alan.kod_hizasi} onChange={event => onPatch({ kod_hizasi: event.target.value as 'sol' | 'sag' })}>
              <option value="sol">Sola</option>
              <option value="sag">Sağa</option>
            </select>
          </label>
          <label>
            Seçenek etiketleri
            <input
              value={alan.etiketler.join(',')}
              placeholder={etiketler(alan).join(',')}
              onFocus={onFocus}
              onBlur={onBlur}
              onChange={event => onPatch({
                etiketler: event.target.value.split(',').map(item => item.trim()),
              })}
            />
          </label>
          {alan.tur === 'cevap_bloku' && alan.cevap_bloku && (
            <>
              <div className={s.grid2}>
                <Num label="İlk soru" value={alan.cevap_bloku.soru_baslangic} step="1" onFocus={onFocus} onBlur={onBlur} onChange={value => onPatch({ cevap_bloku: { ...alan.cevap_bloku!, soru_baslangic: Math.max(1, Math.round(value)) } })} />
                <Num
                  label="Soru sayısı"
                  value={alan.cevap_bloku.soru_sayisi}
                  step="1"
                  onFocus={onFocus}
                  onBlur={onBlur}
                  onChange={value => {
                    const count = clamp(Math.round(value), 1, 500);
                    const characterRows = alan.kodlama_yonu === 'satir_karakter';
                    onPatch({
                      cevap_bloku: { ...alan.cevap_bloku!, soru_sayisi: count },
                      ...(characterRows ? { satir: count } : { sutun: count }),
                    });
                  }}
                />
              </div>
              <label>
                Bölüm kimliği (isteğe bağlı)
                <input value={alan.cevap_bloku.bolum_id} onChange={event => onPatch({ cevap_bloku: { ...alan.cevap_bloku!, bolum_id: event.target.value } })} />
              </label>
              <label className={s.check}>
                <input type="checkbox" checked={alan.cevap_bloku.coklu_isaret} onChange={event => onPatch({ cevap_bloku: { ...alan.cevap_bloku!, coklu_isaret: event.target.checked } })} />
                Bir soruda birden fazla işarete izin ver
              </label>
            </>
          )}
          <label className={s.check}>
            <input
              type="checkbox"
              checked={Boolean(alan.metin_kutusu?.aktif)}
              onChange={event => {
                if (event.target.checked) {
                  onPatch({
                    metin_kutusu: alan.metin_kutusu
                      ? { ...alan.metin_kutusu, aktif: true }
                      : varsayilanMetinKutusu(alan),
                  });
                  onKutu();
                  return;
                }
                if (alan.metin_kutusu) onPatch({ metin_kutusu: { ...alan.metin_kutusu, aktif: false } });
              }}
            />
            Metin kutusu
          </label>
          <p className={s.note}>
            {alan.metin_kutusu?.aktif
              ? `${kutuDilimleri(alan, '').length} kutu, birbirine yapışık.`
              : 'Kapalıyken kutu yoktur. Açınca her daire diliminin yanına bir kutu gelir.'}
          </p>
          {alan.metin_kutusu?.aktif && (
            <>
              <label>
                Kutu yönü
                <select
                  value={alan.metin_kutusu.yon}
                  onChange={event => onPatch({ metin_kutusu: { ...alan.metin_kutusu!, yon: event.target.value as KutuYonu } })}
                >
                  <option value="ust">Üst</option>
                  <option value="alt">Alt</option>
                  <option value="sol">Sol</option>
                  <option value="sag">Sağ</option>
                </select>
              </label>
              <label>
                Kutu veri kaynağı
                <select
                  value={alan.metin_kutusu.veri_kaynagi}
                  onChange={event => onPatch({ metin_kutusu: { ...alan.metin_kutusu!, veri_kaynagi: event.target.value } })}
                >
                  <option value="">Sabit değer</option>
                  {VERI_KAYNAKLARI.map(item => (
                    <option key={item.kod} value={item.kod}>{item.etiket}</option>
                  ))}
                </select>
              </label>
              {!alan.metin_kutusu.veri_kaynagi && (
                <label>
                  Kutu sabit değeri
                  <input
                    value={alan.metin_kutusu.sabit_deger}
                    onFocus={onFocus}
                    onBlur={onBlur}
                    onChange={event => onPatch({ metin_kutusu: { ...alan.metin_kutusu!, sabit_deger: event.target.value } })}
                  />
                </label>
              )}
              <div className={s.grid2}>
                <Num
                  label={alan.metin_kutusu.yon === 'sol' || alan.metin_kutusu.yon === 'sag' ? 'Genişlik (mm)' : 'Yükseklik (mm)'}
                  value={alan.metin_kutusu.olcu_mm}
                  step="0.5"
                  onFocus={onFocus}
                  onBlur={onBlur}
                  onChange={value => onPatch({ metin_kutusu: { ...alan.metin_kutusu!, olcu_mm: roundMm(clamp(value, 1.5, 40)) } })}
                />
                <Num
                  label="Daire boşluğu (mm)"
                  value={alan.metin_kutusu.bosluk_mm}
                  step="0.1"
                  onFocus={onFocus}
                  onBlur={onBlur}
                  onChange={value => onPatch({ metin_kutusu: { ...alan.metin_kutusu!, bosluk_mm: roundMm(clamp(value, 0, 30)) } })}
                />
                <Num label="Punto" value={alan.metin_kutusu.punto} step="0.5" onFocus={onFocus} onBlur={onBlur} onChange={value => onPatch({ metin_kutusu: { ...alan.metin_kutusu!, punto: roundMm(value) } })} />
                <label>
                  Hizalama
                  <select
                    value={alan.metin_kutusu.hizalama}
                    onChange={event => onPatch({ metin_kutusu: { ...alan.metin_kutusu!, hizalama: event.target.value as MetinKutusu['hizalama'] } })}
                  >
                    <option value="sol">Sol</option>
                    <option value="orta">Orta</option>
                    <option value="sag">Sağ</option>
                  </select>
                </label>
              </div>
              <p className={s.note}>Kutular birbirine değer. Daire boşluğu, şerit ile dairelerin arasını açar. Sıfırken daireye yapışıktır.</p>
            </>
          )}
        </>
      )}
      {alan.tur === 'metin' && (
        <div className={s.grid2}>
          <Num label="Punto" value={alan.punto} step="0.5" onFocus={onFocus} onBlur={onBlur} onChange={value => onPatch({ punto: roundMm(value) })} />
          <Num label="Genişlik (mm)" value={alan.genislik_mm} step="0.5" onFocus={onFocus} onBlur={onBlur} onChange={value => onPatch({ genislik_mm: roundMm(value) })} />
          <Num label="Yükseklik (mm)" value={alan.yukseklik_mm} step="0.5" onFocus={onFocus} onBlur={onBlur} onChange={value => onPatch({ yukseklik_mm: roundMm(value) })} />
          <Num label="Karakter aralığı" value={alan.karakter_araligi} step="0.1" onFocus={onFocus} onBlur={onBlur} onChange={value => onPatch({ karakter_araligi: roundMm(value) })} />
          <label>
            Hizalama
            <select value={alan.hizalama} onChange={event => onPatch({ hizalama: event.target.value as DaireAlan['hizalama'] })}>
              <option value="sol">Sol</option>
              <option value="orta">Orta</option>
              <option value="sag">Sağ</option>
            </select>
          </label>
        </div>
      )}
      {uyarilar.map(uyari => <p key={uyari} className={s.warn}>{uyari}</p>)}
      <div className={s.rowActions}>
        <button type="button" className={s.ghost} onClick={onDuplicate}>Çoğalt</button>
        <button type="button" className={s.danger} onClick={onDelete}>Sil</button>
      </div>
    </div>
  );
}
