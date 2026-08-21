"""Öğrenci özel ders dashboard — KPI, uyarı, ders kartları, timeline."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Optional

from apps.ozel_ders.domain.models import (
    BirebirDersOturumu,
    BirebirHaftalikSlot,
    BirebirOgrenciProgrami,
    OturumDurumu,
    OturumTuru,
    ProgramDurumu,
    TelafiDurumu,
)
from apps.ozel_ders.services.errors import OzelDersError

GUN_LABELS = {
    1: 'Pazartesi',
    2: 'Salı',
    3: 'Çarşamba',
    4: 'Perşembe',
    5: 'Cuma',
    6: 'Cumartesi',
    7: 'Pazar',
}

ATTENDED = {OturumDurumu.ISLENDI, OturumDurumu.ONLINE}
CANCELLED_LIKE = {OturumDurumu.IPTAL, OturumDurumu.OGRENCI_GELMEDI, OturumDurumu.OGRETMEN_GELMEDI}


def _person_ad(obj) -> str:
    if obj is None:
        return ''
    ad = getattr(obj, 'tam_ad', None)
    if ad:
        return str(ad)
    return f'{getattr(obj, "ad", "")} {getattr(obj, "soyad", "")}'.strip()


def _fmt_date(d: Optional[date]) -> Optional[str]:
    return d.isoformat() if d else None


def _fmt_time(t) -> str:
    return t.strftime('%H:%M') if t else ''


def _progress_tone(pct: float) -> str:
    if pct >= 80:
        return 'green'
    if pct >= 50:
        return 'yellow'
    return 'red'


def build_dashboard(
    *,
    ogrenci_id: int,
    kurum_id: int,
    sube_id: int,
    egitim_yili_id: Optional[int] = None,
) -> dict:
    from apps.ogrenci.domain.models import Ogrenci

    try:
        ogrenci = Ogrenci.objects.get(pk=ogrenci_id, kurum_id=kurum_id)
    except Ogrenci.DoesNotExist:
        raise OzelDersError('Öğrenci bulunamadı.', 'not_found', 404)

    # Şube erişimi: öğrencinin şubesi veya aktif bağlam
    if ogrenci.sube_id and ogrenci.sube_id != sube_id:
        # Farklı şube bağlamında yine kendi şube programlarını göster
        pass

    programs_qs = BirebirOgrenciProgrami.objects.filter(
        kurum_id=kurum_id,
        ogrenci_id=ogrenci_id,
    ).select_related('premium_paket', 'ozel_ders_paket', 'ogrenci')
    if sube_id:
        programs_qs = programs_qs.filter(sube_id=sube_id)
    if egitim_yili_id:
        programs_qs = programs_qs.filter(egitim_yili_id=egitim_yili_id)

    programs = list(programs_qs)
    program_ids = [p.id for p in programs]

    oturum_qs = (
        BirebirDersOturumu.objects.filter(
            kurum_id=kurum_id,
            ogrenci_id=ogrenci_id,
            is_active=True,
        )
        .select_related('ders', 'ogretmen', 'program', 'source_slot')
        .order_by('-session_date', '-start_time')
    )
    if sube_id:
        oturum_qs = oturum_qs.filter(sube_id=sube_id)
    if egitim_yili_id:
        oturum_qs = oturum_qs.filter(egitim_yili_id=egitim_yili_id)

    oturumlar = list(oturum_qs)
    today = date.today()

    # ── KPI ──
    total_oturum = len(oturumlar)
    islendi = sum(1 for o in oturumlar if o.durum in ATTENDED)
    iptal = sum(1 for o in oturumlar if o.durum == OturumDurumu.IPTAL)
    ogrenci_gelmedi = sum(1 for o in oturumlar if o.durum == OturumDurumu.OGRENCI_GELMEDI)
    ogretmen_gelmedi = sum(1 for o in oturumlar if o.durum == OturumDurumu.OGRETMEN_GELMEDI)
    telafi_bekleyen = sum(1 for o in oturumlar if o.telafi_durumu == TelafiDurumu.BEKLENIYOR)
    telafi_yapilan = sum(1 for o in oturumlar if o.oturum_turu == OturumTuru.TELAFI and o.durum in ATTENDED)
    planlandi = sum(1 for o in oturumlar if o.durum == OturumDurumu.PLANLANDI)
    total_minutes = sum(o.duration_minutes() for o in oturumlar if o.durum in ATTENDED)
    denom = islendi + ogrenci_gelmedi + ogretmen_gelmedi
    devam_orani = round((islendi / denom) * 100, 1) if denom else 0.0

    past = [o for o in oturumlar if o.session_date < today or (
        o.session_date == today and o.durum in ATTENDED | CANCELLED_LIKE
    )]
    future = [
        o for o in oturumlar
        if o.session_date >= today and o.durum in (OturumDurumu.PLANLANDI, OturumDurumu.ONLINE)
    ]
    future_sorted = sorted(future, key=lambda o: (o.session_date, o.start_time))
    past_sorted = sorted(past, key=lambda o: (o.session_date, o.start_time), reverse=True)
    son_ders = past_sorted[0] if past_sorted else None
    sonraki_ders = future_sorted[0] if future_sorted else None

    aktif_program = sum(1 for p in programs if p.durum == ProgramDurumu.AKTIF)
    # branş = distinct ders across slots+oturumlar
    ders_ids = set()
    for o in oturumlar:
        ders_ids.add(o.ders_id)

    slots = list(
        BirebirHaftalikSlot.objects.filter(
            program_id__in=program_ids,
            aktif=True,
        ).select_related('ders', 'ogretmen', 'program')
        if program_ids
        else []
    )
    for s in slots:
        ders_ids.add(s.ders_id)

    weeks_span = 1
    if programs:
        starts = [p.baslangic_tarihi for p in programs]
        ends = [p.bitis_tarihi or today for p in programs]
        span_days = max((max(ends) - min(starts)).days, 7)
        weeks_span = max(span_days / 7, 1)
    avg_weekly = round(total_oturum / weeks_span, 1) if total_oturum else 0.0

    kpis = {
        'toplam_ozel_ders': len(ders_ids),
        'aktif_ders': aktif_program,
        'tamamlanan_program': sum(1 for p in programs if p.durum == ProgramDurumu.PASIF),
        'planlanan_oturum': planlandi,
        'islenen_oturum': islendi,
        'iptal_oturum': iptal,
        'telafi_bekleyen': telafi_bekleyen,
        'telafi_yapilan': telafi_yapilan,
        'ogrenci_devamsizlik': ogrenci_gelmedi,
        'ogretmen_iptal': ogretmen_gelmedi,
        'toplam_saat': round(total_minutes / 60, 1),
        'devam_orani': devam_orani,
        'ortalama_haftalik': avg_weekly,
        'son_ders': _fmt_date(son_ders.session_date) if son_ders else None,
        'sonraki_ders': _fmt_date(sonraki_ders.session_date) if sonraki_ders else None,
        'toplam_oturum': total_oturum,
    }

    # ── Ders kartları (branş bazlı) ──
    by_ders: dict[int, dict] = {}
    for s in slots:
        row = by_ders.setdefault(s.ders_id, {
            'ders_id': s.ders_id,
            'ders_ad': getattr(s.ders, 'ad', '') or str(s.ders_id),
            'ders_kisa_ad': (getattr(s.ders, 'kisa_ad', None) or '').strip(),
            'ogretmen_id': s.ogretmen_id,
            'ogretmen_ad': _person_ad(s.ogretmen),
            'program_ids': set(),
            'baslangic': s.program.baslangic_tarihi,
            'bitis': s.program.bitis_tarihi,
            'slot_weekly': 0,
            'durum_counts': defaultdict(int),
        })
        row['program_ids'].add(s.program_id)
        row['slot_weekly'] += 1
        if s.program.baslangic_tarihi < row['baslangic']:
            row['baslangic'] = s.program.baslangic_tarihi
        if s.program.bitis_tarihi:
            if row['bitis'] is None or s.program.bitis_tarihi > row['bitis']:
                row['bitis'] = s.program.bitis_tarihi

    from apps.ozel_ders.services.sync_service import resolve_paket_dersleri

    for p in programs:
        for d in resolve_paket_dersleri(p):
            by_ders.setdefault(d['id'], {
                'ders_id': d['id'],
                'ders_ad': d.get('ad') or str(d['id']),
                'ders_kisa_ad': (d.get('kisa_ad') or '').strip(),
                'ogretmen_id': None,
                'ogretmen_ad': '',
                'program_ids': {p.id},
                'baslangic': p.baslangic_tarihi,
                'bitis': p.bitis_tarihi,
                'slot_weekly': 0,
                'durum_counts': defaultdict(int),
            })['program_ids'].add(p.id)

    for o in oturumlar:
        row = by_ders.setdefault(o.ders_id, {
            'ders_id': o.ders_id,
            'ders_ad': getattr(o.ders, 'ad', '') or str(o.ders_id),
            'ders_kisa_ad': (getattr(o.ders, 'kisa_ad', None) or '').strip(),
            'ogretmen_id': o.ogretmen_id,
            'ogretmen_ad': _person_ad(o.ogretmen),
            'program_ids': set(),
            'baslangic': o.program.baslangic_tarihi if o.program_id else o.session_date,
            'bitis': o.program.bitis_tarihi if o.program_id else None,
            'slot_weekly': 0,
            'durum_counts': defaultdict(int),
        })
        if o.program_id:
            row['program_ids'].add(o.program_id)
        row['durum_counts'][o.durum] += 1
        # current teacher = most recent oturum teacher
        if o.session_date >= row.get('_last_date', date.min):
            row['ogretmen_id'] = o.ogretmen_id
            row['ogretmen_ad'] = _person_ad(o.ogretmen)
            row['_last_date'] = o.session_date

    dersler = []
    for ders_id, row in by_ders.items():
        counts = row['durum_counts']
        islenen = counts.get(OturumDurumu.ISLENDI, 0) + counts.get(OturumDurumu.ONLINE, 0)
        planlanan = sum(counts.values()) or max(row['slot_weekly'] * 16, islenen)
        # estimate planned from program window × weekly slots if few oturums
        if row['slot_weekly'] and row['baslangic']:
            end = row['bitis'] or today
            weeks = max(((end - row['baslangic']).days // 7) + 1, 1)
            estimated = row['slot_weekly'] * weeks
            planlanan = max(planlanan, estimated)
        kalan = max(planlanan - islenen - counts.get(OturumDurumu.IPTAL, 0), 0)
        pct = (islenen / planlanan * 100) if planlanan else 0
        dersler.append({
            'ders_id': ders_id,
            'ders_ad': row['ders_ad'],
            'ders_kisa_ad': row['ders_kisa_ad'],
            'ogretmen_id': row['ogretmen_id'],
            'ogretmen_ad': row['ogretmen_ad'],
            'program_ids': list(row['program_ids']),
            'baslangic': _fmt_date(row['baslangic']),
            'bitis': _fmt_date(row['bitis']),
            'planlanan': planlanan,
            'islenen': islenen,
            'kalan': kalan,
            'progress_pct': round(pct, 1),
            'progress_tone': _progress_tone(pct),
            'durum': 'Devam Ediyor' if any(
                p.durum == ProgramDurumu.AKTIF for p in programs if p.id in row['program_ids']
            ) else 'Pasif',
            'durum_counts': {
                'PLANLANDI': counts.get(OturumDurumu.PLANLANDI, 0),
                'ISLENDI': counts.get(OturumDurumu.ISLENDI, 0) + counts.get(OturumDurumu.ONLINE, 0),
                'IPTAL': counts.get(OturumDurumu.IPTAL, 0),
                'TELAFI': sum(
                    1 for o in oturumlar
                    if o.ders_id == ders_id and o.oturum_turu == OturumTuru.TELAFI
                ),
                'OGRENCI_GELMEDI': counts.get(OturumDurumu.OGRENCI_GELMEDI, 0),
                'OGRETMEN_GELMEDI': counts.get(OturumDurumu.OGRETMEN_GELMEDI, 0),
                'TELAFI_BEKLENIYOR': sum(
                    1 for o in oturumlar
                    if o.ders_id == ders_id and o.telafi_durumu == TelafiDurumu.BEKLENIYOR
                ),
                'ONLINE': counts.get(OturumDurumu.ONLINE, 0),
            },
        })
    dersler.sort(key=lambda d: d['ders_ad'])

    # ── Öğretmen geçmişi (branş bazlı) ──
    ogretmen_by_ders: dict[int, list] = defaultdict(list)
    seen_teacher: dict[tuple[int, int], int] = defaultdict(int)
    for o in sorted(oturumlar, key=lambda x: x.session_date):
        key = (o.ders_id, o.ogretmen_id)
        seen_teacher[key] += 1
    for (ders_id, ogretmen_id), cnt in seen_teacher.items():
        sample = next((o for o in oturumlar if o.ders_id == ders_id and o.ogretmen_id == ogretmen_id), None)
        ogretmen_by_ders[ders_id].append({
            'ogretmen_id': ogretmen_id,
            'ogretmen_ad': _person_ad(sample.ogretmen) if sample else str(ogretmen_id),
            'ders_sayisi': cnt,
            'son_ders': _fmt_date(
                max(o.session_date for o in oturumlar if o.ders_id == ders_id and o.ogretmen_id == ogretmen_id)
            ),
        })
    for ders_id in ogretmen_by_ders:
        ogretmen_by_ders[ders_id].sort(key=lambda x: x['son_ders'] or '', reverse=True)

    ogretmenler = []
    for ders_id, chain in ogretmen_by_ders.items():
        dname = next((d['ders_ad'] for d in dersler if d['ders_id'] == ders_id), str(ders_id))
        current = chain[0] if chain else None
        attended_for = [o for o in oturumlar if o.ders_id == ders_id and o.durum in ATTENDED]
        denom_t = len([
            o for o in oturumlar
            if o.ders_id == ders_id and o.durum in ATTENDED | {OturumDurumu.OGRENCI_GELMEDI}
        ])
        devam_t = round(len(attended_for) / denom_t * 100, 1) if denom_t else 0.0
        fut = [o for o in future_sorted if o.ders_id == ders_id]
        past_d = [o for o in past_sorted if o.ders_id == ders_id]
        ogretmenler.append({
            'ders_id': ders_id,
            'ders_ad': dname,
            'current': current,
            'history': chain,
            'toplam_ders': sum(c['ders_sayisi'] for c in chain),
            'son_ders': _fmt_date(past_d[0].session_date) if past_d else None,
            'sonraki_ders': _fmt_date(fut[0].session_date) if fut else None,
            'ortalama_devam': devam_t,
        })

    # ── Paket ──
    satin_alinan = 0
    for p in programs:
        if p.premium_paket_id:
            from apps.ozel_ders.domain.models import PremiumPaketDersKota
            kota = PremiumPaketDersKota.objects.filter(premium_paket_id=p.premium_paket_id)
            for k in kota:
                # haftalık × ~16 hafta tahmini yoksa kota adedi
                satin_alinan += max(k.haftalik_adet or 0, 0) * 16
        elif p.ozel_ders_paket_id:
            # paket ders sayısı bilinmiyorsa planlanan toplam
            satin_alinan += sum(d['planlanan'] for d in dersler) or 0
    if not satin_alinan:
        satin_alinan = sum(d['planlanan'] for d in dersler)
    kullanilan = islendi
    kalan_paket = max(satin_alinan - kullanilan, 0)
    paket = {
        'satin_alinan': satin_alinan,
        'kullanilan': kullanilan,
        'kalan': kalan_paket,
        'progress_pct': round(kullanilan / satin_alinan * 100, 1) if satin_alinan else 0,
        'label': next(
            (p.premium_paket.ad if p.premium_paket_id else (p.ozel_ders_paket.ad if p.ozel_ders_paket_id else None)
             for p in programs),
            None,
        ),
    }

    # ── Tarihler ──
    baslangic = min((p.baslangic_tarihi for p in programs), default=None)
    bitis = None
    for p in programs:
        if p.bitis_tarihi and (bitis is None or p.bitis_tarihi > bitis):
            bitis = p.bitis_tarihi
    # tahmini bitiş: kalan planlanan / haftalık yoğunluk
    weekly = max(sum(s.gun and 1 for s in slots) or len(slots), 1)
    # better: count unique weekdays with slots
    weekly = max(len({s.gun for s in slots}) or 1, 1)
    remaining_sessions = max(sum(d['kalan'] for d in dersler), 0)
    weeks_left = (remaining_sessions / weekly) if weekly else 0
    tahmini = today + timedelta(days=int(weeks_left * 7)) if remaining_sessions else bitis
    tarihler = {
        'baslangic': _fmt_date(baslangic),
        'planlanan_bitis': _fmt_date(bitis),
        'tahmini_bitis': _fmt_date(tahmini),
        'kalan_gun': (tahmini - today).days if tahmini and tahmini >= today else 0,
    }

    # ── Haftalık program ──
    haftalik = []
    for s in sorted(slots, key=lambda x: (x.gun, x.baslangic)):
        haftalik.append({
            'slot_id': s.id,
            'program_id': s.program_id,
            'gun': s.gun,
            'gun_label': GUN_LABELS.get(s.gun, str(s.gun)),
            'baslangic': _fmt_time(s.baslangic),
            'bitis': _fmt_time(s.bitis),
            'ders_id': s.ders_id,
            'ders_ad': getattr(s.ders, 'ad', '') or str(s.ders_id),
            'ogretmen_id': s.ogretmen_id,
            'ogretmen_ad': _person_ad(s.ogretmen),
        })

    # ── Timeline + notlar ──
    timeline = []
    son_notlar = []
    for o in oturumlar[:40]:
        item = {
            'id': o.id,
            'session_date': o.session_date.isoformat(),
            'start_time': _fmt_time(o.start_time),
            'end_time': _fmt_time(o.end_time),
            'ders_id': o.ders_id,
            'ders_ad': getattr(o.ders, 'ad', '') or str(o.ders_id),
            'ogretmen_id': o.ogretmen_id,
            'ogretmen_ad': _person_ad(o.ogretmen),
            'durum': o.durum,
            'durum_display': o.get_durum_display(),
            'oturum_turu': o.oturum_turu,
            'notes': o.notes or '',
            'ok': o.durum in ATTENDED,
        }
        timeline.append(item)
        if o.notes and o.notes.strip():
            son_notlar.append(item)
    son_notlar = son_notlar[:8]

    # ── Performans ──
    def _window_devam(days: int) -> float:
        start = today - timedelta(days=days)
        window = [o for o in oturumlar if start <= o.session_date <= today]
        a = sum(1 for o in window if o.durum in ATTENDED)
        d = sum(1 for o in window if o.durum in ATTENDED | {OturumDurumu.OGRENCI_GELMEDI, OturumDurumu.OGRETMEN_GELMEDI})
        return round(a / d * 100, 1) if d else 0.0

    def _window_iptal(days: int) -> int:
        start = today - timedelta(days=days)
        return sum(
            1 for o in oturumlar
            if start <= o.session_date <= today and o.durum in CANCELLED_LIKE
        )

    iptal_30 = _window_iptal(30)
    iptal_90 = _window_iptal(90)
    iptal_trend = 'azaliyor' if iptal_30 * 3 < iptal_90 else ('artiyor' if iptal_30 * 3 > iptal_90 + 2 else 'stabil')

    performans = {
        'toplam_devam': devam_orani,
        'son_30_gun': _window_devam(30),
        'son_90_gun': _window_devam(90),
        'iptal_egilimi': iptal_trend,
        'iptal_30': iptal_30,
        'iptal_90': iptal_90,
    }

    # ── Uyarılar ──
    uyarilar = []
    if kalan_paket <= 5 and satin_alinan > 0:
        uyarilar.append({'level': 'warning', 'code': 'paket_az', 'message': f'{kalan_paket} ders kaldı.'})
    if kalan_paket <= 2 and satin_alinan > 0:
        uyarilar.append({'level': 'danger', 'code': 'paket_bitiyor', 'message': 'Paket bitmek üzere.'})
    if telafi_bekleyen:
        uyarilar.append({
            'level': 'warning',
            'code': 'telafi',
            'message': f'Telafi bekleyen {telafi_bekleyen} ders var.',
        })
    if son_ders and (today - son_ders.session_date).days >= 10 and aktif_program:
        uyarilar.append({
            'level': 'warning',
            'code': 'ders_yok',
            'message': f'{(today - son_ders.session_date).days} gündür ders yapılmadı.',
        })
    recent_cancel = _window_iptal(21)
    if recent_cancel >= 4:
        uyarilar.append({
            'level': 'warning',
            'code': 'iptal_yogun',
            'message': f'Son 3 haftada {recent_cancel} iptal/devamsızlık.',
        })
    for og in ogretmenler:
        if len(og.get('history') or []) > 1:
            uyarilar.append({
                'level': 'info',
                'code': 'ogretmen_degisti',
                'message': f'{og["ders_ad"]} branşında öğretmen değişti.',
            })
            break

    # ── Devamsızlık özeti ──
    devamsizlik = {
        'ogrenci_gelmedi': ogrenci_gelmedi,
        'ogretmen_iptal': ogretmen_gelmedi,
        'telafi_yapildi': telafi_yapilan,
        'telafi_bekliyor': telafi_bekleyen,
    }

    return {
        'ogrenci_id': ogrenci_id,
        'ogrenci_ad': _person_ad(ogrenci),
        'has_data': bool(programs or oturumlar),
        'kpis': kpis,
        'uyarilar': uyarilar,
        'dersler': dersler,
        'ogretmenler': ogretmenler,
        'paket': paket,
        'tarihler': tarihler,
        'haftalik_program': haftalik,
        'timeline': timeline,
        'son_notlar': son_notlar,
        'performans': performans,
        'devamsizlik': devamsizlik,
        'programs': [
            {
                'id': p.id,
                'durum': p.durum,
                'baslangic_tarihi': _fmt_date(p.baslangic_tarihi),
                'bitis_tarihi': _fmt_date(p.bitis_tarihi),
                'premium_paket_ad': p.premium_paket.ad if p.premium_paket_id else None,
                'ozel_ders_paket_ad': p.ozel_ders_paket.ad if p.ozel_ders_paket_id else None,
            }
            for p in programs
        ],
        'kazanim': {'available': False, 'message': 'Kazanım takibi yakında eklenecek.'},
    }
