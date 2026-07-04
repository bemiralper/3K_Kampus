"""
Takvim Modülü — Entegrasyon Servisi

Diğer modüller (Ölçme, Koçluk, Ödev, Çalışma Programı vb.) bu servis
üzerinden takvime otomatik event oluşturur / günceller / siler.

Kullanım:
    from apps.takvim.application.integration_service import CalendarIntegrationService

    svc = CalendarIntegrationService()
    event = svc.sync_exam(kurum_id=1, exam=exam_obj, user_id=req.user.id)
"""
import logging
from datetime import datetime, timedelta, time as dtime
from typing import Optional

from django.db import transaction
from django.utils import timezone

from apps.takvim.domain.models import Event, EventType
from apps.takvim.domain.enums import EventCategory, EventStatus
from apps.takvim.infrastructure.repository import EventRepository
from apps.takvim.application.service import EventService

logger = logging.getLogger('takvim.integration')


# ═══════════════════════════════════════════════════════════
# KAYNAK MODÜL SABİTLERİ
# ═══════════════════════════════════════════════════════════

class KaynakModul:
    """kaynak_modul alanında kullanılacak sabit string'ler"""
    OLCME = 'olcme'                     # Ölçme & Değerlendirme sınavları
    GORUSME = 'gorusme'                 # Koçluk görüşmeleri
    ODEV = 'odev'                       # Manuel ödev atamaları
    CALISMA_PROGRAMI = 'calisma'        # Haftalık çalışma programı
    CALISMA_BLOK = 'calisma_blok'       # Çalışma programı tekil blok
    GOREV = 'gorev'                     # Görev modülü atamaları


# ═══════════════════════════════════════════════════════════
# MERKEZ ENTEGRASYON SERVİSİ
# ═══════════════════════════════════════════════════════════

class CalendarIntegrationService:
    """
    Tek giriş noktası: diğer modüller takvime event oluşturmak /
    güncellemek / silmek istediğinde bu servisi çağırır.
    """

    def __init__(self):
        self.repo = EventRepository()
        self.event_service = EventService()

    # ─── Yardımcı: EventType'ı kategoriye göre bul / oluştur ───

    def _resolve_event_type(self, kurum_id: int, kategori: str) -> EventType:
        """
        Verilen kategori için kurumun aktif EventType'ını döndürür.
        Yoksa varsayılan seed'den oluşturur.
        """
        et = EventType.objects.filter(
            kurum_id=kurum_id, kategori=kategori,
            is_active=True, is_deleted=False,
        ).first()
        if et:
            return et

        # Henüz seed çalışmamış — seed_defaults çağır
        from apps.takvim.application.service import EventTypeService
        EventTypeService.seed_defaults(kurum_id)

        et = EventType.objects.filter(
            kurum_id=kurum_id, kategori=kategori,
            is_active=True, is_deleted=False,
        ).first()
        if et:
            return et

        # Son çare: eksik kategori için tek seferlik oluştur
        fallback = {
            EventCategory.GOREV: {'ad': 'Görev', 'renk': '#6366F1', 'ikon': '✅', 'sira': 10, 'varsayilan_sure_dk': 30},
            EventCategory.DIGER: {'ad': 'Diğer', 'renk': '#9CA3AF', 'ikon': '📌', 'sira': 11, 'varsayilan_sure_dk': 60},
        }.get(kategori)
        if fallback:
            return EventType.objects.create(
                kurum_id=kurum_id,
                kategori=kategori,
                is_system=True,
                is_active=True,
                **fallback,
            )

        return EventType.objects.filter(
            kurum_id=kurum_id, kategori=EventCategory.DIGER,
            is_active=True, is_deleted=False,
        ).first()

    # ─── Mevcut kaynak event'ini bul ───

    def _find_existing(self, kurum_id: int, kaynak_modul: str, kaynak_id: str) -> Optional[Event]:
        """Daha önce oluşturulmuş entegrasyon event'ini bul"""
        return Event.objects.filter(
            kurum_id=kurum_id,
            kaynak_modul=kaynak_modul,
            kaynak_id=str(kaynak_id),
            is_deleted=False,
        ).first()

    # ─── Genel sync (upsert) ───

    @transaction.atomic
    def _sync_event(
        self,
        kurum_id: int,
        kaynak_modul: str,
        kaynak_id: str,
        kategori: str,
        baslik: str,
        baslangic: datetime,
        bitis: datetime,
        user_id: int,
        aciklama: str = '',
        tum_gun: bool = False,
        ogretmen_id: int = None,
        ogrenci_ids: list = None,
        sinif_ids: list = None,
        salon_id=None,
        salon_adi: str = '',
        konum: str = '',
        renk: str = '',
        sube_id: int = None,
        egitim_yili_id: int = None,
        donem_id: int = None,
    ) -> Event:
        """
        Genel event upsert. Varsa günceller, yoksa oluşturur.
        Diğer modüller doğrudan bu metodu değil, modüle özgü
        metodları (sync_exam, sync_gorusme, vb.) çağırmalıdır.
        """
        event_type = self._resolve_event_type(kurum_id, kategori)
        if not event_type:
            logger.warning(f"EventType bulunamadı: kurum={kurum_id}, kategori={kategori}")
            return None

        existing = self._find_existing(kurum_id, kaynak_modul, str(kaynak_id))

        data = {
            'event_type_id': event_type.id,
            'baslik': baslik,
            'aciklama': aciklama,
            'baslangic': baslangic,
            'bitis': bitis,
            'tum_gun': tum_gun,
            'ogretmen_id': ogretmen_id,
            'ogrenci_ids': ogrenci_ids or [],
            'sinif_ids': sinif_ids or [],
            'salon_id': salon_id,
            'salon_adi': salon_adi,
            'konum': konum,
            'renk': renk,
            'kaynak_modul': kaynak_modul,
            'kaynak_id': str(kaynak_id),
            'sube_id': sube_id,
            'egitim_yili_id': egitim_yili_id,
            'donem_id': donem_id,
        }

        if existing:
            data['updated_by'] = user_id
            event = self.repo.update(existing, data)
            logger.info(f"Takvim event güncellendi: {event.id} ← {kaynak_modul}:{kaynak_id}")
        else:
            data['kurum_id'] = kurum_id
            data['created_by'] = user_id
            data['durum'] = EventStatus.SCHEDULED
            event = self.repo.create(data)
            # Varsayılan hatırlatmaları oluştur
            self.event_service._create_default_reminders(event)
            logger.info(f"Takvim event oluşturuldu: {event.id} ← {kaynak_modul}:{kaynak_id}")

        return event

    # ─── Kaynak event'ini sil (soft delete) ───

    @transaction.atomic
    def remove_event(self, kurum_id: int, kaynak_modul: str, kaynak_id: str):
        """Kaynak modül silindiğinde ilgili takvim event'ini soft-delete et"""
        existing = self._find_existing(kurum_id, kaynak_modul, str(kaynak_id))
        if existing:
            self.repo.soft_delete(existing)
            logger.info(f"Takvim event silindi: {existing.id} ← {kaynak_modul}:{kaynak_id}")

    # ─── Kaynak event durumunu değiştir ───

    @transaction.atomic
    def update_status(self, kurum_id: int, kaynak_modul: str, kaynak_id: str, new_status: str):
        """Kaynak modül durumu değiştiğinde takvim event durumunu güncelle"""
        existing = self._find_existing(kurum_id, kaynak_modul, str(kaynak_id))
        if existing:
            existing.durum = new_status
            existing.save(update_fields=['durum', 'updated_at'])
            logger.info(f"Takvim event durum güncellendi: {existing.id} → {new_status}")

    # ═══════════════════════════════════════════════════════
    # 1) ÖLÇME & DEĞERLENDİRME — Sınav / Deneme
    # ═══════════════════════════════════════════════════════

    def sync_exam(self, kurum_id: int, exam, user_id: int) -> Optional[Event]:
        """
        Sınav oluşturulduğunda veya güncellendiğinde takvime yansıt.

        İş Akışı:
        ─────────
        1. Exam oluşturulur (views/exam_views.py → create)
        2. exam.exam_date varsa → takvime otomatik event eklenir
        3. Exam güncellenirse → event da güncellenir (upsert)
        4. Exam silinirse → remove_event çağrılır

        Eşleme:
        - Exam.name            → Event.baslik
        - Exam.exam_date       → Event.baslangic (saat 09:00)
        - Exam.duration_minutes→ Event.bitis (baslangic + süre)
        - Exam.siniflar        → Event.sinif_ids
        - 'olcme'              → Event.kaynak_modul
        - Exam.id              → Event.kaynak_id
        """
        if not exam.exam_date:
            logger.debug(f"Exam {exam.id} exam_date yok, takvim atlanıyor")
            return None

        # Başlangıç zamanı: sınav tarihi + 09:00
        baslangic = timezone.make_aware(
            datetime.combine(exam.exam_date, dtime(9, 0))
        )
        sure = exam.duration_minutes or 180
        bitis = baslangic + timedelta(minutes=sure)

        # Sınıf ID'leri
        sinif_ids = list(exam.siniflar.values_list('id', flat=True))

        aciklama_parts = [exam.get_exam_type_display()]
        if exam.description:
            aciklama_parts.append(exam.description)

        return self._sync_event(
            kurum_id=kurum_id,
            kaynak_modul=KaynakModul.OLCME,
            kaynak_id=str(exam.id),
            kategori=EventCategory.DENEME,
            baslik=f"📝 {exam.name}",
            baslangic=baslangic,
            bitis=bitis,
            user_id=user_id,
            aciklama=' — '.join(aciklama_parts),
            sinif_ids=sinif_ids,
            renk='#EF4444',
        )

    # ═══════════════════════════════════════════════════════
    # 2) KOÇLUK — Görüşme
    # ═══════════════════════════════════════════════════════

    def sync_gorusme(self, kurum_id: int, gorusme, user_id: int) -> Optional[Event]:
        """
        Koç görüşmesi oluşturulduğunda veya güncellendiğinde takvime yansıt.

        İş Akışı:
        ─────────
        1. GorusmeKaydi oluşturulur (gorusme_views.py → post)
        2. gorusme_tarihi + gorusme_saati → takvim event'i
        3. Görüşme iptal/erteleme → event durumu güncellenir
        4. Görüşme silinirse → remove_event

        Eşleme:
        - GorusmeKaydi.konu                → Event.baslik
        - GorusmeKaydi.gorusme_tarihi/saati→ Event.baslangic
        - GorusmeKaydi.sure_dakika         → Event.bitis
        - GorusmeKaydi.koc.teacher.id      → Event.ogretmen_id
        - GorusmeKaydi.ogrenci.id          → Event.ogrenci_ids
        - 'gorusme'                        → Event.kaynak_modul
        """
        gorusme_saati = gorusme.gorusme_saati or dtime(10, 0)
        baslangic = timezone.make_aware(
            datetime.combine(gorusme.gorusme_tarihi, gorusme_saati)
        )
        sure = gorusme.sure_dakika or 30
        bitis = baslangic + timedelta(minutes=sure)

        # Koçun öğretmen (personel) ID'si
        ogretmen_id = None
        try:
            ogretmen_id = gorusme.koc.teacher_id
        except Exception:
            pass

        # Görüşme türü etiketi
        tur_label = dict(gorusme.GORUSME_TURU_CHOICES).get(
            gorusme.gorusme_turu, gorusme.gorusme_turu
        )

        # Durum eşlemesi
        durum_map = {
            'planlandi': EventStatus.SCHEDULED,
            'tamamlandi': EventStatus.COMPLETED,
            'iptal': EventStatus.CANCELLED,
            'ertelendi': EventStatus.SCHEDULED,
        }

        event = self._sync_event(
            kurum_id=kurum_id,
            kaynak_modul=KaynakModul.GORUSME,
            kaynak_id=str(gorusme.id),
            kategori=EventCategory.GORUSME,
            baslik=f"🗣️ {tur_label}: {gorusme.konu[:80]}",
            baslangic=baslangic,
            bitis=bitis,
            user_id=user_id,
            aciklama=gorusme.notlar or '',
            ogretmen_id=ogretmen_id,
            ogrenci_ids=[gorusme.ogrenci_id],
            renk='#8B5CF6',
        )

        # Durum senkronizasyonu
        if event and gorusme.durum in durum_map:
            new_st = durum_map[gorusme.durum]
            if event.durum != new_st:
                event.durum = new_st
                event.save(update_fields=['durum', 'updated_at'])

        return event

    # ═══════════════════════════════════════════════════════
    # 3) MANUEL ÖDEV ATAMASI
    # ═══════════════════════════════════════════════════════

    def sync_assignment(self, kurum_id: int, assignment, user_id: int) -> Optional[Event]:
        """
        Ödev atandığında takvime yansıt.

        İş Akışı:
        ─────────
        1. ManualAssignment create + status=ASSIGNED → takvim event'i
        2. Ödev son teslim tarihi → tüm gün event olarak gösterilir
        3. Ödev tamamlanırsa → event COMPLETED
        4. Ödev iptal → event CANCELLED

        Eşleme:
        - ManualAssignment.title           → Event.baslik
        - ManualAssignment.due_date        → Event.baslangic / bitis (tüm gün)
        - ManualAssignment.coach           → Event.ogretmen_id (user_id)
        - ManualAssignment.student.id      → Event.ogrenci_ids
        - 'odev'                           → Event.kaynak_modul
        """
        if not assignment.due_date:
            return None

        # Tüm gün event — teslim tarihi
        if hasattr(assignment.due_date, 'date'):
            due_date = assignment.due_date.date()
        else:
            due_date = assignment.due_date

        baslangic = timezone.make_aware(
            datetime.combine(due_date, dtime(0, 0))
        )
        bitis = timezone.make_aware(
            datetime.combine(due_date, dtime(23, 59))
        )

        # Durum eşlemesi
        status_map = {
            'ASSIGNED': EventStatus.SCHEDULED,
            'IN_PROGRESS': EventStatus.IN_PROGRESS,
            'COMPLETED': EventStatus.COMPLETED,
            'CANCELLED': EventStatus.CANCELLED,
            'OVERDUE': EventStatus.SCHEDULED,
            'DRAFT': EventStatus.DRAFT,
        }

        # Öncelik etiketi
        priority_labels = {'LOW': '🟢', 'MEDIUM': '🟡', 'HIGH': '🟠', 'URGENT': '🔴'}
        priority_icon = priority_labels.get(assignment.priority, '📋')

        event = self._sync_event(
            kurum_id=kurum_id,
            kaynak_modul=KaynakModul.ODEV,
            kaynak_id=str(assignment.id),
            kategori=EventCategory.ODEV,
            baslik=f"{priority_icon} Ödev: {assignment.title[:80]}",
            baslangic=baslangic,
            bitis=bitis,
            user_id=user_id,
            aciklama=assignment.description or '',
            ogretmen_id=assignment.coach_id,
            ogrenci_ids=[assignment.student_id],
            tum_gun=True,
            renk='#F97316',
        )

        if event and assignment.status in status_map:
            new_st = status_map[assignment.status]
            if event.durum != new_st:
                event.durum = new_st
                event.save(update_fields=['durum', 'updated_at'])

        return event

    # ═══════════════════════════════════════════════════════
    # 4) ÇALIŞMA PROGRAMI — Haftalık Program
    # ═══════════════════════════════════════════════════════

    def sync_weekly_program(self, kurum_id: int, program, user_id: int) -> Optional[Event]:
        """
        Haftalık çalışma programı oluşturulduğunda takvime yansıt.

        İş Akışı:
        ─────────
        1. WeeklyProgram oluşturulur (study_program/views.py → create)
        2. week_start → week_end aralığı tüm gün event olarak eklenir
        3. Program güncellenirse → event güncellenir
        4. Template programlar takvime eklenmez (is_template=True)

        Eşleme:
        - WeeklyProgram.student      → Event.ogrenci_ids
        - WeeklyProgram.coach        → Event.ogretmen_id
        - WeeklyProgram.week_start   → Event.baslangic
        - WeeklyProgram.week_end     → Event.bitis
        - 'calisma'                  → Event.kaynak_modul
        """
        if program.is_template:
            return None

        baslangic = timezone.make_aware(
            datetime.combine(program.week_start, dtime(0, 0))
        )
        bitis = timezone.make_aware(
            datetime.combine(program.week_end, dtime(23, 59))
        )

        student_name = ''
        try:
            student_name = f"{program.student.ad} {program.student.soyad}"
        except Exception:
            student_name = f"Öğrenci #{program.student_id}"

        blok_count = program.total_block_count or 0
        soru_count = program.total_question_count or 0

        return self._sync_event(
            kurum_id=kurum_id,
            kaynak_modul=KaynakModul.CALISMA_PROGRAMI,
            kaynak_id=str(program.id),
            kategori=EventCategory.CALISMA,
            baslik=f"📊 Çalışma Programı: {student_name}",
            baslangic=baslangic,
            bitis=bitis,
            user_id=user_id,
            aciklama=f"{blok_count} blok, {soru_count} soru. {program.coach_note or ''}".strip(),
            ogretmen_id=program.coach_id,
            ogrenci_ids=[program.student_id],
            tum_gun=True,
            renk='#06B6D4',
        )

    # ═══════════════════════════════════════════════════════
    # 5) KOÇLUK — Planlanan Görüşmeler (sonraki_gorusme_tarihi)
    # ═══════════════════════════════════════════════════════

    def sync_sonraki_gorusme(self, kurum_id: int, gorusme, user_id: int) -> Optional[Event]:
        """
        Bir görüşmenin sonraki_gorusme_tarihi alanı doluysa,
        gelecekteki görüşmeyi de takvime ekler.

        İş Akışı:
        ─────────
        1. GorusmeKaydi.sonraki_gorusme_tarihi set edilir
        2. Bu tarih için 'planlandi' durumunda ayrı bir event oluşturulur
        3. kaynak_id = 'sonraki_{gorusme.id}' formatıyla izlenir
        """
        if not gorusme.sonraki_gorusme_tarihi:
            return None

        baslangic = timezone.make_aware(
            datetime.combine(gorusme.sonraki_gorusme_tarihi, dtime(10, 0))
        )
        bitis = baslangic + timedelta(minutes=30)

        ogretmen_id = None
        try:
            ogretmen_id = gorusme.koc.teacher_id
        except Exception:
            pass

        return self._sync_event(
            kurum_id=kurum_id,
            kaynak_modul=KaynakModul.GORUSME,
            kaynak_id=f"sonraki_{gorusme.id}",
            kategori=EventCategory.GORUSME,
            baslik=f"🗓️ Planlanmış Görüşme: {gorusme.ogrenci}",
            baslangic=baslangic,
            bitis=bitis,
            user_id=user_id,
            aciklama=f"Önceki görüşme #{gorusme.id} sonrası planlanan takip görüşmesi",
            ogretmen_id=ogretmen_id,
            ogrenci_ids=[gorusme.ogrenci_id],
            renk='#A855F7',
        )

    # ═══════════════════════════════════════════════════════
    # TOPLU SENKRONIZASYON — Yardımcı
    # ═══════════════════════════════════════════════════════

    def bulk_sync_exams(self, kurum_id: int, user_id: int) -> int:
        """Tüm sınavları toplu senkronize et (backfill için)"""
        from apps.coaching.olcme_degerlendirme.models.exam import Exam
        exams = Exam.objects.filter(
            kurum_id=kurum_id, is_active=True, exam_date__isnull=False
        )
        count = 0
        for exam in exams:
            if self.sync_exam(kurum_id, exam, user_id):
                count += 1
        logger.info(f"Toplu sınav sync: {count}/{exams.count()} kurum={kurum_id}")
        return count

    def bulk_sync_gorusmeler(self, kurum_id: int, user_id: int) -> int:
        """Tüm görüşmeleri toplu senkronize et (backfill için)"""
        from apps.coaching.models import GorusmeKaydi
        gorusmeler = GorusmeKaydi.objects.filter(kurum_id=kurum_id)
        count = 0
        for g in gorusmeler:
            if self.sync_gorusme(kurum_id, g, user_id):
                count += 1
            if g.sonraki_gorusme_tarihi:
                self.sync_sonraki_gorusme(kurum_id, g, user_id)
        logger.info(f"Toplu görüşme sync: {count}/{gorusmeler.count()} kurum={kurum_id}")
        return count

    def bulk_sync_assignments(self, kurum_id: int, user_id: int) -> int:
        """Tüm ödevleri toplu senkronize et"""
        from apps.coaching.assignment_manual.models import ManualAssignment
        # Sadece öğrencileri olan active ödevler
        odevler = ManualAssignment.objects.filter(
            is_active=True, due_date__isnull=False
        )
        # kurum_id filtresi — ManualAssignment'da kurum FK yok,
        # coach.personel üzerinden filtrelenebilir ya da tamamı alınır
        count = 0
        for a in odevler:
            try:
                if self.sync_assignment(kurum_id, a, user_id):
                    count += 1
            except Exception as e:
                logger.error(f"Ödev sync hatası {a.id}: {e}")
        logger.info(f"Toplu ödev sync: {count} kurum={kurum_id}")
        return count
