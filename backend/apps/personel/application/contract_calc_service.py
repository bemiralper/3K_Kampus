"""
Personel sözleşmesi — paylaşılan hesaplama mantığı.
Frontend contractCalc.ts ile aynı kuralları uygular.
"""
from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

AVG_MONTH_DAYS = Decimal('30.4375')


def _dec(val: Any, default: str = '0') -> Decimal:
    if val is None or val == '':
        return Decimal(default)
    return Decimal(str(val))


def _parse_date(val: date | str | None) -> date | None:
    if val is None or val == '':
        return None
    if isinstance(val, date):
        return val
    return datetime.strptime(str(val)[:10], '%Y-%m-%d').date()


def calc_calisilan_gun(baslangic: date | str | None, bitis: date | str | None) -> int:
    b = _parse_date(baslangic)
    e = _parse_date(bitis)
    if not b or not e or e < b:
        return 0
    return (e - b).days + 1


def add_months(d: date, months: int) -> date:
    """Ay ekle; gün ay sonunu aşarsa ayın son gününe düş."""
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    day = min(d.day, monthrange(year, month)[1])
    return date(year, month, day)


def month_end(d: date) -> date:
    return date(d.year, d.month, monthrange(d.year, d.month)[1])


def derive_month_dates(rows: list[dict], contract_start: date | str | None) -> list[dict]:
    """1. ay başlangıcından itibaren sonraki ayların tarihlerini türet."""
    if not rows:
        return rows
    start = _parse_date(contract_start) or _parse_date(rows[0].get('baslangic_tarihi'))
    if not start:
        return rows

    out: list[dict] = []
    for i, row in enumerate(rows):
        r = dict(row)
        if i == 0:
            if not r.get('baslangic_tarihi'):
                r['baslangic_tarihi'] = start.isoformat()
            b = _parse_date(r['baslangic_tarihi']) or start
            if not r.get('bitis_tarihi'):
                r['bitis_tarihi'] = month_end(b).isoformat()
        else:
            prev_end = _parse_date(out[i - 1].get('bitis_tarihi'))
            if prev_end:
                b = prev_end + timedelta(days=1)
            else:
                b = add_months(start, i)
            r['baslangic_tarihi'] = b.isoformat()
            r['bitis_tarihi'] = month_end(b).isoformat()
        r['calisilan_gun'] = calc_calisilan_gun(r['baslangic_tarihi'], r['bitis_tarihi'])
        out.append(r)
    return out


def chain_fill_from_index(rows: list[dict], index: int, fields: list[str] | None = None) -> list[dict]:
    """
    index satırındaki değerleri sonraki satırlara kopyala.
    fields: ['maas'] veya ['baslangic_tarihi','bitis_tarihi','maas']
    """
    if not rows or index < 0 or index >= len(rows):
        return rows
    fields = fields or ['maas']
    out = [dict(r) for r in rows]
    source = out[index]
    date_fields = {'baslangic_tarihi', 'bitis_tarihi'}
    copy_fields = [f for f in fields if f not in date_fields]
    for i in range(index + 1, len(out)):
        for f in copy_fields:
            if f in source and source[f] not in (None, ''):
                out[i][f] = source[f]
    return derive_month_dates(out, out[0].get('baslangic_tarihi'))


def calc_toplam_maas(rows: list[dict]) -> Decimal:
    return sum(_dec(r.get('maas')) for r in rows)


def calc_toplam_calisma_suresi(
    rows: list[dict],
    contract_start: date | str | None = None,
    contract_end: date | str | None = None,
) -> Decimal:
    """
    Sözleşme süresini ay cinsinden hesapla.
    Maaş planı satır sayısı, plan tarih aralığı ve sözleşme tarihleri birlikte değerlendirilir;
    en geniş kapsam kullanılır (12 satırlı plan + 1 aylık üst tarih → 12 ay).
    """
    candidates: list[Decimal] = []

    if rows:
        candidates.append(Decimal(len(rows)))
        plan_start = _parse_date(rows[0].get('baslangic_tarihi'))
        plan_end = _parse_date(rows[-1].get('bitis_tarihi'))
        if plan_start and plan_end and plan_end >= plan_start:
            candidates.append(_months_from_span(plan_start, plan_end))

    start = _parse_date(contract_start)
    end = _parse_date(contract_end)
    if start and end and end >= start:
        candidates.append(_months_from_span(start, end))

    if not candidates:
        return Decimal('0')
    return max(candidates)


def _months_from_span(start: date, end: date) -> Decimal:
    total_days = (end - start).days + 1
    if total_days <= 0:
        return Decimal('0')
    raw = float(total_days) / float(AVG_MONTH_DAYS)
    half = round(raw * 2) / 2
    if abs(half - round(half)) < 0.001:
        return Decimal(int(round(half)))
    return Decimal(str(half))


def format_calisma_suresi_ay(months: Decimal | float | int) -> str:
    """Görüntüleme: 12 ay, 12,5 ay (1.02 gibi anlamsız ondalıklar yok)."""
    try:
        m = float(months)
    except (TypeError, ValueError):
        return '—'
    half = round(m * 2) / 2
    if abs(half - round(half)) < 0.001:
        return f'{int(round(half))} ay'
    whole = int(half)
    return f'{whole},5 ay'


def is_ogretmen_sozlesmesi(
    *,
    gorev_snapshot: str = '',
    brans_snapshot: str = '',
    rol_kodu: str = '',
    rol_ad: str = '',
) -> bool:
    """Öğretmen → Öğretmen İş Sözleşmesi; aksi halde Personel İş Sözleşmesi."""
    for val in (gorev_snapshot, rol_ad):
        low = (val or '').lower()
        if 'öğretmen' in low or 'ogretmen' in low:
            return True
    kod = (rol_kodu or '').lower()
    if kod in ('ogretmen', 'öğretmen', 'ogretmen'):
        return True
    return False


def sozlesme_belge_basligi(
    *,
    gorev_snapshot: str = '',
    brans_snapshot: str = '',
    rol_kodu: str = '',
    rol_ad: str = '',
) -> str:
    if is_ogretmen_sozlesmesi(
        gorev_snapshot=gorev_snapshot,
        brans_snapshot=brans_snapshot,
        rol_kodu=rol_kodu,
        rol_ad=rol_ad,
    ):
        return 'Öğretmen İş Sözleşmesi'
    return 'Personel İş Sözleşmesi'


def _time_to_minutes(t: time | str | None) -> int | None:
    if t is None or t == '':
        return None
    if isinstance(t, str):
        parts = t.split(':')
        return int(parts[0]) * 60 + int(parts[1])
    return t.hour * 60 + t.minute


def calc_gunluk_saat(baslangic: time | str | None, bitis: time | str | None, mola_dakika: int = 0) -> Decimal:
    s = _time_to_minutes(baslangic)
    e = _time_to_minutes(bitis)
    if s is None or e is None or e <= s:
        return Decimal('0')
    minutes = e - s - int(mola_dakika or 0)
    if minutes <= 0:
        return Decimal('0')
    return (Decimal(minutes) / Decimal('60')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def calc_haftalik_saat(mesai_rows: list[dict]) -> Decimal:
    total = Decimal('0')
    for row in mesai_rows:
        if not row.get('aktif', True):
            continue
        total += calc_gunluk_saat(row.get('baslangic'), row.get('bitis'), row.get('mola_dakika', 0))
    return total


def default_mesai_saatleri() -> list[dict]:
    rows = []
    for gun in range(1, 8):
        aktif = gun <= 5
        rows.append({
            'gun': gun,
            'baslangic': '09:00' if aktif else None,
            'bitis': '18:00' if aktif else None,
            'mola_dakika': 0,
            'aktif': aktif,
        })
    return rows


def calc_ozet_metrikleri(
    *,
    maas_plani: list[dict],
    mesai_saatleri: list[dict],
    ders_birim_ucret: Decimal | float | str = 0,
    ders_ucret_tipi: str = '',
    sgk_gun: int = 30,
    haftalik_calisma_gun: int = 5,
    baslangic_tarihi: date | str | None = None,
    bitis_tarihi: date | str | None = None,
) -> dict:
    toplam_maas = calc_toplam_maas(maas_plani)
    contract_start = baslangic_tarihi or (maas_plani[0].get('baslangic_tarihi') if maas_plani else None)
    toplam_ay = calc_toplam_calisma_suresi(
        maas_plani,
        contract_start=contract_start,
        contract_end=bitis_tarihi,
    )
    haftalik_saat = calc_haftalik_saat(mesai_saatleri)
    ders_ucret = _dec(ders_birim_ucret)

    total_days = sum(
        calc_calisilan_gun(r.get('baslangic_tarihi'), r.get('bitis_tarihi'))
        for r in maas_plani
    )
    gunluk_ucret = (toplam_maas / Decimal(total_days)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP) if total_days else Decimal('0')
    saatlik_ucret = (gunluk_ucret / Decimal('8')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP) if gunluk_ucret else Decimal('0')

    ay_sayisi = len(maas_plani) or 1
    tahmini_aylik = (toplam_maas / Decimal(ay_sayisi)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    kalan_gun = 0
    bitis = _parse_date(bitis_tarihi)
    if bitis:
        kalan_gun = max(0, (bitis - date.today()).days)

    return {
        'toplam_maas': float(toplam_maas),
        'toplam_calisma_suresi_ay': float(toplam_ay),
        'haftalik_calisma_saati': float(haftalik_saat),
        'ders_ucreti': float(ders_ucret),
        'ders_ucret_tipi': ders_ucret_tipi,
        'sgk_gun': sgk_gun,
        'haftalik_calisma_gun': haftalik_calisma_gun,
        'gunluk_ucret': float(gunluk_ucret),
        'saatlik_ucret': float(saatlik_ucret),
        'tahmini_aylik_maliyet': float(tahmini_aylik),
        'kalan_gun': kalan_gun,
    }


def apply_computed_totals(sozlesme, maas_plani: list) -> None:
    """Model instance üzerinde cache alanlarını güncelle."""
    rows = []
    for r in maas_plani:
        rows.append({
            'maas': r.maas if hasattr(r, 'maas') else r.get('maas'),
            'baslangic_tarihi': r.baslangic_tarihi if hasattr(r, 'baslangic_tarihi') else r.get('baslangic_tarihi'),
            'bitis_tarihi': r.bitis_tarihi if hasattr(r, 'bitis_tarihi') else r.get('bitis_tarihi'),
        })
    sozlesme.toplam_sozlesme_bedeli = calc_toplam_maas(rows)
    sozlesme.toplam_calisma_suresi_ay = calc_toplam_calisma_suresi(
        rows,
        contract_start=sozlesme.baslangic_tarihi,
        contract_end=sozlesme.bitis_tarihi,
    )
    if rows:
        first_maas = rows[0]['maas']
        sozlesme.net_maas = _dec(first_maas)
        last_end = _parse_date(rows[-1].get('bitis_tarihi'))
        first_start = _parse_date(rows[0].get('baslangic_tarihi'))
        if first_start and (not sozlesme.baslangic_tarihi or _parse_date(sozlesme.baslangic_tarihi) != first_start):
            sozlesme.baslangic_tarihi = first_start
        if last_end and (not sozlesme.bitis_tarihi or _parse_date(sozlesme.bitis_tarihi) < last_end):
            sozlesme.bitis_tarihi = last_end


def generate_sozlesme_no(kurum_id: int, egitim_yili_id: int) -> str:
    from apps.personel.domain.sozlesme_models import PersonelSozlesme
    from apps.egitim_yili.domain.models import EgitimYili

    try:
        ey = EgitimYili.objects.get(pk=egitim_yili_id)
        yil = ey.baslangic_yil
    except EgitimYili.DoesNotExist:
        yil = date.today().year

    prefix = f'PS-{yil}-'
    last = (
        PersonelSozlesme.objects.filter(kurum_id=kurum_id, sozlesme_no__startswith=prefix)
        .order_by('-sozlesme_no')
        .values_list('sozlesme_no', flat=True)
        .first()
    )
    if last:
        try:
            seq = int(last.split('-')[-1]) + 1
        except ValueError:
            seq = 1
    else:
        seq = 1
    return f'{prefix}{seq:04d}'


def personel_no_from_id(personel_id: int) -> str:
    return f'P-{personel_id:06d}'
