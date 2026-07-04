"""
Koçluk hizmeti almaya uygun öğrencileri belirler.

Kaynaklar:
- OgrenciEkHizmet (aktif koçluk ek hizmeti)
- SozlesmeKalemi (ek hizmet / ek hizmet satışı — koçluk)
- Grup dersi sözleşmesi (pakete dahil koçluk)
"""
from django.db.models import Q

from apps.odeme_takip.domain.enums import KalemTuru, SozlesmeDurum
from apps.odeme_takip.domain.models import Sozlesme, SozlesmeKalemi


AKTIF_SOZLESME_DURUMLARI = (
    SozlesmeDurum.AKTIF,
    SozlesmeDurum.TAMAMLANDI,
    SozlesmeDurum.DONDURULMUS,
)


def _kocluk_ek_hizmet_ids():
    from apps.egitim_paketleri.models import EkHizmet

    return list(
        EkHizmet.objects.filter(
            aktif_mi=True,
        ).filter(
            Q(hizmet_turu='kocluk')
            | Q(
                hizmet_turu='kutuphane',
                ad__icontains='koç',
            )
            | Q(
                hizmet_turu='kutuphane',
                ad__icontains='kocluk',
            )
            | Q(
                hizmet_turu='kutuphane',
                kod__icontains='KOCLUK',
            )
            | Q(
                hizmet_turu='kutuphane',
                kod__icontains='KOC_',
            )
        ).values_list('id', flat=True)
    )


def get_kocluk_ogrenci_ids(*, kurum_id=None, sube_id=None, egitim_yili_id=None):
    """Koçluk hizmeti alan aktif öğrenci ID'lerini döndürür."""
    from apps.ogrenci.domain.models import Ogrenci, OgrenciEkHizmet

    kocluk_hizmet_ids = _kocluk_ek_hizmet_ids()
    if not kocluk_hizmet_ids:
        return set()

    student_ids = set()

    ek_qs = OgrenciEkHizmet.objects.filter(
        ek_hizmet_id__in=kocluk_hizmet_ids,
        aktif_mi=True,
    )
    if egitim_yili_id:
        ek_qs = ek_qs.filter(Q(egitim_yili_id=egitim_yili_id) | Q(egitim_yili__isnull=True))
    student_ids.update(ek_qs.values_list('ogrenci_id', flat=True))

    soz_qs = Sozlesme.objects.filter(durum__in=AKTIF_SOZLESME_DURUMLARI)
    if kurum_id:
        soz_qs = soz_qs.filter(kurum_id=kurum_id)
    if sube_id:
        soz_qs = soz_qs.filter(sube_id=sube_id)
    if egitim_yili_id:
        soz_qs = soz_qs.filter(egitim_yili_id=egitim_yili_id)

    student_ids.update(
        SozlesmeKalemi.objects.filter(
            sozlesme__in=soz_qs,
            kalem_turu__in=(KalemTuru.EK_HIZMET, KalemTuru.EK_HIZMET_SATISI),
            kalem_id__in=kocluk_hizmet_ids,
        ).values_list('sozlesme__ogrenci_id', flat=True)
    )

    student_ids.update(_students_from_grup_dersi_sozlesmeler(soz_qs, kocluk_hizmet_ids))

    ogrenci_qs = Ogrenci.objects.filter(id__in=student_ids, aktif_mi=True)
    if kurum_id:
        ogrenci_qs = ogrenci_qs.filter(kurum_id=kurum_id)
    if sube_id:
        ogrenci_qs = ogrenci_qs.filter(sube_id=sube_id)

    return set(ogrenci_qs.values_list('id', flat=True))


def _students_from_grup_dersi_sozlesmeler(soz_qs, kocluk_hizmet_ids):
    from apps.egitim_paketleri.models import EkHizmet, GrupDersi
    from apps.ogrenci_kayit.application.services import resolve_grup_dersi_inclusions

    ids = set()
    kalemler = SozlesmeKalemi.objects.filter(
        sozlesme__in=soz_qs,
        kalem_turu=KalemTuru.GRUP_DERSI,
    ).select_related('sozlesme')

    for kalem in kalemler:
        try:
            grup = GrupDersi.objects.get(id=kalem.kalem_id)
        except GrupDersi.DoesNotExist:
            continue

        soz = kalem.sozlesme
        dahil_ids, _ = resolve_grup_dersi_inclusions(
            grup,
            kurum_id=soz.kurum_id,
            sube_id=soz.sube_id,
            egitim_yili_id=soz.egitim_yili_id,
        )
        if EkHizmet.objects.filter(
            id__in=dahil_ids,
            hizmet_turu='kocluk',
            aktif_mi=True,
        ).exists():
            ids.add(soz.ogrenci_id)

    return ids


def get_assignable_kocluk_ogrenci_queryset(*, kurum_id=None, sube_id=None, egitim_yili_id=None):
    """Koça atanabilecek (henüz birincil koçu olmayan) koçluk öğrencileri."""
    from apps.coaching.models import CoachStudentAssignment
    from apps.ogrenci.domain.models import Ogrenci

    kocluk_ids = get_kocluk_ogrenci_ids(
        kurum_id=kurum_id,
        sube_id=sube_id,
        egitim_yili_id=egitim_yili_id,
    )
    if not kocluk_ids:
        return Ogrenci.objects.none()

    assigned_ids = CoachStudentAssignment.objects.filter(
        end_date__isnull=True,
        is_primary=True,
    ).values_list('student_id', flat=True)

    return Ogrenci.objects.filter(
        id__in=kocluk_ids,
        aktif_mi=True,
    ).exclude(id__in=assigned_ids)
