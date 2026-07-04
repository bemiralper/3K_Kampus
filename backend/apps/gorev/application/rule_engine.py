"""Otomatik görev kural motoru — modül tetikleyicileri."""
import logging
from datetime import date, datetime, timedelta
from typing import Optional

from django.db.models import Q
from django.utils import timezone

from apps.gorev.domain.enums import GorevDurum, GorevOncelik, HedefTipi
from apps.gorev.domain.models import Gorev, GorevAtama
from apps.gorev.application.service import GorevService

logger = logging.getLogger('gorev.rule_engine')

KAYNAK_ODEME = 'odeme_takip'
KAYNAK_OLCME = 'olcme'
KAYNAK_OGRENCI = 'ogrenci_inaktif'
KAYNAK_YOKLAMA = 'yoklama'


def _safe(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except Exception:
        logger.exception('GorevRuleEngine hatası: %s', fn.__name__)
        return None


def get_primary_coach_user_id(ogrenci_id: int) -> Optional[int]:
    from apps.coaching.models import CoachStudentAssignment

    assignment = (
        CoachStudentAssignment.objects.filter(
            student_id=ogrenci_id,
            is_primary=True,
            end_date__isnull=True,
        )
        .select_related('coach__teacher')
        .first()
    )
    if assignment and assignment.coach.teacher.user_id:
        return assignment.coach.teacher.user_id
    return None


def debt_action_url(ogrenci_id: int, sozlesme_id=None) -> str:
    params = f'ogrenci_id={ogrenci_id}&tab=borc'
    if sozlesme_id:
        params += f'&sozlesme_id={sozlesme_id}'
    return f'/muhasebe/odeme-takip?{params}'


class GorevRuleEngine:
    def __init__(self):
        self.service = GorevService()

    def gorev_exists(self, kurum_id: int, kaynak_modul: str, kaynak_id: str) -> bool:
        return Gorev.objects.filter(
            kurum_id=kurum_id,
            kaynak_modul=kaynak_modul,
            kaynak_id=kaynak_id,
            is_deleted=False,
            atamalar__durum__in=[
                GorevDurum.BEKLIYOR,
                GorevDurum.BASLADI,
                GorevDurum.DEVAM_EDIYOR,
            ],
        ).exists()

    def _create(
        self,
        kurum_id: int,
        tip_kod: str,
        baslik: str,
        aciklama: str,
        son_tarih: datetime,
        kaynak_modul: str,
        kaynak_id: str,
        hedef_tipi: str,
        hedef_rol_kodu: str = '',
        hedef_user_ids: list = None,
        oncelik: str = GorevOncelik.NORMAL,
        sube_id: int = None,
        egitim_yili_id: int = None,
        aksiyon_url: str = '',
        tum_gun: bool = False,
    ) -> Optional[Gorev]:
        if self.gorev_exists(kurum_id, kaynak_modul, kaynak_id):
            return None

        tip = self.service.tip_service.get_or_seed(kurum_id, tip_kod)
        if not tip:
            logger.warning('Gorev tipi bulunamadı: %s', tip_kod)
            return None

        return self.service.create_gorev(kurum_id, {
            'gorev_tipi_id': str(tip.id),
            'baslik': baslik,
            'aciklama': aciklama,
            'oncelik': oncelik,
            'son_tarih': son_tarih,
            'tum_gun': tum_gun,
            'hedef_tipi': hedef_tipi,
            'hedef_rol_kodu': hedef_rol_kodu,
            'hedef_user_ids': hedef_user_ids or [],
            'kaynak_modul': kaynak_modul,
            'kaynak_id': kaynak_id,
            'aksiyon_url': aksiyon_url,
            'sube_id': sube_id,
            'egitim_yili_id': egitim_yili_id,
        }, olusturan_id=None)

    def complete_by_kaynak_prefix(self, kurum_id: int, kaynak_modul: str, prefix: str):
        """Tahsilat sonrası taksit kaynaklı açık görevleri tamamla."""
        now = timezone.now()
        atamalar = GorevAtama.objects.filter(
            gorev__kurum_id=kurum_id,
            gorev__kaynak_modul=kaynak_modul,
            gorev__kaynak_id__startswith=prefix,
            gorev__is_deleted=False,
            durum__in=[GorevDurum.BEKLIYOR, GorevDurum.BASLADI, GorevDurum.DEVAM_EDIYOR],
        )
        for atama in atamalar:
            atama.durum = GorevDurum.TAMAMLANDI
            atama.tamamlanma_at = now
            atama.save(update_fields=['durum', 'tamamlanma_at', 'updated_at'])
            self.service.bridge.sync_atama(atama)

    # ─── Cron tarayıcıları ───

    def scan_payment_due(self, days_ahead: int = 0, kurum_id: int = None) -> int:
        from apps.odeme_takip.domain.enums import SozlesmeDurum, TaksitDurum
        from apps.odeme_takip.domain.models import Taksit

        today = timezone.localdate()
        target = today + timedelta(days=days_ahead)
        created = 0

        qs = Taksit.objects.select_related('sozlesme__ogrenci', 'sozlesme__veli').filter(
            sozlesme__durum=SozlesmeDurum.AKTIF,
            durum__in=[TaksitDurum.BEKLEMEDE, TaksitDurum.KISMI_ODENDI, TaksitDurum.GECIKTI],
            kalan_tutar__gt=0,
            vade_tarihi=target,
        )
        if kurum_id:
            qs = qs.filter(sozlesme__kurum_id=kurum_id)

        for taksit in qs:
            sz = taksit.sozlesme
            ogrenci = sz.ogrenci
            ad = f'{ogrenci.ad} {ogrenci.soyad}' if ogrenci else sz.sozlesme_no
            kaynak_id = f'taksit-{taksit.id}:due-{target.isoformat()}'
            son_tarih = timezone.make_aware(datetime.combine(target, datetime.min.time().replace(hour=17)))

            gorev = self._create(
                kurum_id=sz.kurum_id,
                tip_kod='TAKSIT_GUNU',
                baslik=f'Taksit vadesi: {ad} — {taksit.taksit_no}. taksit',
                aciklama=f'Vade: {target:%d.%m.%Y} · Kalan: {taksit.kalan_tutar:,.0f} TL',
                son_tarih=son_tarih,
                kaynak_modul=KAYNAK_ODEME,
                kaynak_id=kaynak_id,
                hedef_tipi=HedefTipi.ROL,
                hedef_rol_kodu='muhasebe',
                sube_id=sz.sube_id,
                egitim_yili_id=sz.egitim_yili_id,
                aksiyon_url=debt_action_url(sz.ogrenci_id, sz.id) if sz.ogrenci_id else '',
                tum_gun=True,
            )
            if gorev:
                created += 1
        return created

    def scan_payment_overdue(self, kurum_id: int = None) -> int:
        from apps.odeme_takip.domain.overdue import get_overdue_taksit_queryset, gecikme_gunu

        created = 0
        qs = get_overdue_taksit_queryset(kurum_id=kurum_id)
        for taksit in qs:
            sz = taksit.sozlesme
            ogrenci = sz.ogrenci
            ad = f'{ogrenci.ad} {ogrenci.soyad}' if ogrenci else sz.sozlesme_no
            gecikme = gecikme_gunu(taksit)
            kaynak_id = f'taksit-{taksit.id}:overdue'
            oncelik = GorevOncelik.KRITIK if gecikme >= 7 else GorevOncelik.YUKSEK

            gorev = self._create(
                kurum_id=sz.kurum_id,
                tip_kod='GECIKEN_ODEME',
                baslik=f'Geciken ödeme: {ad} ({gecikme} gün)',
                aciklama=f'{taksit.taksit_no}. taksit · Kalan: {taksit.kalan_tutar:,.0f} TL · Veli araması yapın',
                son_tarih=timezone.now(),
                kaynak_modul=KAYNAK_ODEME,
                kaynak_id=kaynak_id,
                hedef_tipi=HedefTipi.ROL,
                hedef_rol_kodu='muhasebe',
                oncelik=oncelik,
                sube_id=sz.sube_id,
                egitim_yili_id=sz.egitim_yili_id,
                aksiyon_url=debt_action_url(sz.ogrenci_id, sz.id) if sz.ogrenci_id else '',
            )
            if gorev:
                created += 1
        return created

    def scan_senet_vadesi(self, kurum_id: int = None) -> int:
        from apps.odeme_takip.domain.cek_senet import CekSenetDetay, CekSenetDurum
        from apps.odeme_takip.domain.models import Taksit

        today = timezone.localdate()
        created = 0
        qs = CekSenetDetay.objects.filter(
            durum__in=[
                CekSenetDurum.PORTFOYDE,
                CekSenetDurum.TAHSILDE,
                CekSenetDurum.BEKLIYOR,
                CekSenetDurum.VERILDI,
            ],
            vade_tarihi=today,
        )
        if kurum_id:
            qs = qs.filter(
                Q(kurum_id=kurum_id)
                | Q(taksit__sozlesme__kurum_id=kurum_id)
                | Q(tahsilat__sozlesme__kurum_id=kurum_id)
            )

        for detay in qs.select_related('taksit__sozlesme', 'tahsilat__sozlesme', 'cari_hesap'):
            taksit = detay.taksit
            sz = None
            if taksit:
                sz = taksit.sozlesme
            elif detay.tahsilat_id:
                sz = detay.tahsilat.sozlesme

            kurum_id_val = sz.kurum_id if sz else detay.kurum_id
            sube_id_val = sz.sube_id if sz else detay.sube_id
            egitim_yili_id = sz.egitim_yili_id if sz else None
            if not kurum_id_val:
                continue

            yon_label = 'Verilen' if detay.yon == 'verilen' else 'Alınan'
            no = detay.cek_senet_no or f'#{detay.id}'

            gorev = self._create(
                kurum_id=kurum_id_val,
                tip_kod='SENET_TARIHI',
                baslik=f'{yon_label} çek/senet vadesi: {no}',
                aciklama=f'Banka: {detay.banka_adi or "-"} · Vade: {detay.vade_tarihi:%d.%m.%Y}',
                son_tarih=timezone.make_aware(datetime.combine(today, datetime.min.time().replace(hour=12))),
                kaynak_modul=KAYNAK_ODEME,
                kaynak_id=f'cek_senet-{detay.id}',
                hedef_tipi=HedefTipi.ROL,
                hedef_rol_kodu='muhasebe',
                sube_id=sube_id_val,
                egitim_yili_id=egitim_yili_id,
                tum_gun=True,
            )
            if gorev:
                created += 1
        return created

    def scan_student_inactivity(self, inactivity_days: int = 7, kurum_id: int = None) -> int:
        from apps.coaching.models import CoachStudentAssignment, CoachingEvent

        today = timezone.localdate()
        threshold = today - timedelta(days=inactivity_days)
        created = 0

        qs = CoachStudentAssignment.objects.filter(
            is_primary=True,
            end_date__isnull=True,
        ).select_related('student', 'coach__teacher')

        if kurum_id:
            qs = qs.filter(student__kurum_id=kurum_id)

        for assignment in qs:
            last_event = CoachingEvent.objects.filter(
                student_id=assignment.student_id,
                coach_id=assignment.coach_id,
            ).order_by('-event_date').first()

            if last_event:
                last_date = last_event.event_date.date()
            else:
                last_date = assignment.start_date

            if last_date > threshold:
                continue

            coach_user_id = assignment.coach.teacher.user_id
            if not coach_user_id:
                continue

            days_inactive = (today - last_date).days
            week_key = today.isocalendar()
            kaynak_id = f'ogrenci-{assignment.student_id}:inaktif-{week_key.year}W{week_key.week:02d}'

            gorev = self._create(
                kurum_id=assignment.student.kurum_id,
                tip_kod='TAKIP',
                baslik=f'İnaktif öğrenci: {assignment.student.ad} {assignment.student.soyad}',
                aciklama=f'{days_inactive} gündür iletişim yok — görüşme planlayın',
                son_tarih=timezone.now() + timedelta(days=2),
                kaynak_modul=KAYNAK_OGRENCI,
                kaynak_id=kaynak_id,
                hedef_tipi=HedefTipi.KULLANICI,
                hedef_user_ids=[coach_user_id],
                oncelik=GorevOncelik.YUKSEK,
                sube_id=assignment.student.sube_id,
            )
            if gorev:
                created += 1
        return created

    def scan_all(self, kurum_id: int = None) -> dict:
        return {
            'taksit_vadesi': self.scan_payment_due(days_ahead=0, kurum_id=kurum_id),
            'taksit_yaklasan': self.scan_payment_due(days_ahead=3, kurum_id=kurum_id),
            'geciken_odeme': self.scan_payment_overdue(kurum_id=kurum_id),
            'senet_vadesi': self.scan_senet_vadesi(kurum_id=kurum_id),
            'ogrenci_inaktif': self.scan_student_inactivity(inactivity_days=7, kurum_id=kurum_id),
        }

    # ─── Anlık hook'lar ───

    def on_exam_created(self, exam) -> Optional[Gorev]:
        if not exam.kurum_id or not exam.exam_date or exam.is_template:
            return None

        kaynak_id = f'exam-{exam.id}:announce'
        if self.gorev_exists(exam.kurum_id, KAYNAK_OLCME, kaynak_id):
            return None

        coach_user_ids = set()
        from apps.ogrenci.domain.models import OgrenciKayit

        sinif_ids = list(exam.siniflar.values_list('id', flat=True))
        if sinif_ids:
            ogrenci_ids = OgrenciKayit.objects.filter(
                sinif_id__in=sinif_ids,
                aktif_mi=True,
            ).values_list('ogrenci_id', flat=True)
            for oid in ogrenci_ids:
                uid = get_primary_coach_user_id(oid)
                if uid:
                    coach_user_ids.add(uid)

        if not coach_user_ids:
            return self._create(
                kurum_id=exam.kurum_id,
                tip_kod='DENEME_ANALIZ',
                baslik=f'Deneme analizi hazırla: {exam.name}',
                aciklama=f'Sınav tarihi: {exam.exam_date:%d.%m.%Y}',
                son_tarih=timezone.make_aware(
                    datetime.combine(exam.exam_date, datetime.min.time().replace(hour=9))
                ),
                kaynak_modul=KAYNAK_OLCME,
                kaynak_id=kaynak_id,
                hedef_tipi=HedefTipi.ROL,
                hedef_rol_kodu='koc',
                sube_id=exam.sube_id,
                egitim_yili_id=exam.egitim_yili_id,
                tum_gun=True,
            )

        created = None
        for uid in coach_user_ids:
            kid = f'exam-{exam.id}:coach-{uid}'
            g = self._create(
                kurum_id=exam.kurum_id,
                tip_kod='DENEME_ANALIZ',
                baslik=f'Deneme analizi: {exam.name}',
                aciklama=f'Sınav: {exam.exam_date:%d.%m.%Y} — analiz görevini tamamlayın',
                son_tarih=timezone.make_aware(
                    datetime.combine(exam.exam_date + timedelta(days=1), datetime.min.time().replace(hour=17))
                ),
                kaynak_modul=KAYNAK_OLCME,
                kaynak_id=kid,
                hedef_tipi=HedefTipi.KULLANICI,
                hedef_user_ids=[uid],
                sube_id=exam.sube_id,
                egitim_yili_id=exam.egitim_yili_id,
            )
            if g:
                created = g
        return created

    def on_exam_results_published(self, exam) -> Optional[Gorev]:
        if not exam.kurum_id:
            return None
        kaynak_id = f'exam-{exam.id}:results'
        return self._create(
            kurum_id=exam.kurum_id,
            tip_kod='DENEME_ANALIZ',
            baslik=f'Sonuç analizi: {exam.name}',
            aciklama='Sınav sonuçları yayınlandı — öğrenci analizlerini tamamlayın',
            son_tarih=timezone.now() + timedelta(days=3),
            kaynak_modul=KAYNAK_OLCME,
            kaynak_id=kaynak_id,
            hedef_tipi=HedefTipi.ROL,
            hedef_rol_kodu='koc',
            sube_id=exam.sube_id,
            egitim_yili_id=exam.egitim_yili_id,
            oncelik=GorevOncelik.YUKSEK,
        )

    def on_attendance_absent(self, record, kurum_id: int) -> Optional[Gorev]:
        if record.durum != 'ABSENT':
            return None

        coach_user_id = get_primary_coach_user_id(record.ogrenci_id)
        if not coach_user_id:
            return None

        from apps.ogrenci.domain.models import Ogrenci
        try:
            ogrenci = Ogrenci.objects.get(id=record.ogrenci_id)
            ad = f'{ogrenci.ad} {ogrenci.soyad}'
        except Ogrenci.DoesNotExist:
            ad = f'Öğrenci #{record.ogrenci_id}'

        return self._create(
            kurum_id=kurum_id,
            tip_kod='VELI_GORUSME',
            baslik=f'Veli araması: {ad} (devamsız)',
            aciklama='Öğrenci devamsızlık yaptı — veli ile görüşme planlayın',
            son_tarih=timezone.now() + timedelta(days=1),
            kaynak_modul=KAYNAK_YOKLAMA,
            kaynak_id=f'yoklama-{record.id}:absent',
            hedef_tipi=HedefTipi.KULLANICI,
            hedef_user_ids=[coach_user_id],
            oncelik=GorevOncelik.YUKSEK,
        )

    def on_tahsilat_created(self, tahsilat, etkilenen_taksitler: list):
        """Tahsilat sonrası ilgili ödeme görevlerini otomatik kapat."""
        if not etkilenen_taksitler:
            return
        sz = tahsilat.sozlesme
        for taksit in etkilenen_taksitler:
            self.complete_by_kaynak_prefix(sz.kurum_id, KAYNAK_ODEME, f'taksit-{taksit.id}:')


# ─── Modül dışı hook giriş noktaları ───

def hook_exam_created(exam):
    return _safe(GorevRuleEngine().on_exam_created, exam)


def hook_exam_results_published(exam):
    return _safe(GorevRuleEngine().on_exam_results_published, exam)


def hook_attendance_absent(record, kurum_id: int):
    return _safe(GorevRuleEngine().on_attendance_absent, record, kurum_id)


def hook_tahsilat_created(tahsilat, etkilenen_taksitler: list):
    return _safe(GorevRuleEngine().on_tahsilat_created, tahsilat, etkilenen_taksitler)
