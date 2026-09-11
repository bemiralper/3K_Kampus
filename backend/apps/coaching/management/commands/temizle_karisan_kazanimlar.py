"""
Başka dersin müfredatına yazılmış kazanımları tespit eder ve pasifleştirir.

Subject/Topic/Outcome tabloları kurumdan bağımsızdır. Cevap anahtarında
yanlış bölüme yapıştırılan satırlar (ör. Türkçe kazanımları Matematik
bölümüne) `create_if_missing` ile o dersin altında yeni kazanım olarak
yaratılıyordu; sonuç tüm kurumlarda "Matematikte Türkçe kazanımı".

Yeni yazımlar `text_belongs_to_other_subject` ile engellendi; bu komut
halihazırda yazılmış olanları temizler.

  python manage.py temizle_karisan_kazanimlar            # yalnız rapor
  python manage.py temizle_karisan_kazanimlar --uygula   # pasifleştir
"""
from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.coaching.olcme_degerlendirme.models.answer_key import AnswerKeyItem
from apps.coaching.olcme_degerlendirme.models.curriculum import Outcome
from apps.coaching.olcme_degerlendirme.views.curriculum_views import outcome_prose

MIN_METIN_UZUNLUGU = 12


def karisan_kazanimlari_bul():
    """Metni birden çok derste geçen kazanımlarda, sonradan yazılanları döner.

    Aynı metin iki derste varsa özgün olan önce içeri aktarılmıştır; en
    küçük id özgün kabul edilir, sonrakiler kopyadır. Kodlar dersler
    arasında meşru biçimde tekrar ettiği için karşılaştırma yalnız metin
    üzerinden yapılır.
    """
    by_text = defaultdict(list)
    qs = (
        Outcome.objects
        .filter(is_active=True)
        .select_related('topic', 'topic__subject')
        .order_by('id')
    )
    for outcome in qs.iterator():
        prose = outcome_prose(outcome.text or '').lower()
        if len(prose) < MIN_METIN_UZUNLUGU:
            continue
        by_text[prose].append(outcome)

    kopyalar = []
    for grup in by_text.values():
        subject_ids = {o.topic.subject_id for o in grup}
        if len(subject_ids) < 2:
            continue
        ozgun_subject = grup[0].topic.subject_id
        kopyalar.extend(o for o in grup if o.topic.subject_id != ozgun_subject)
    return kopyalar


class Command(BaseCommand):
    help = 'Başka dersin altına yazılmış kazanımları bulur / pasifleştirir'

    def add_arguments(self, parser):
        parser.add_argument(
            '--uygula', action='store_true',
            help='Bulunanları pasifleştirir; verilmezse yalnız rapor basılır.',
        )
        parser.add_argument(
            '--limit', type=int, default=40,
            help='Raporda gösterilecek satır sayısı.',
        )

    def handle(self, *args, **options):
        kopyalar = karisan_kazanimlari_bul()
        if not kopyalar:
            self.stdout.write('Karışmış kazanım bulunamadı.')
            return

        limit = options['limit']
        for outcome in kopyalar[:limit]:
            self.stdout.write(
                f'#{outcome.id} [{outcome.topic.subject}] '
                f'{outcome.topic.name} / {outcome.code} — {outcome.text[:70]}'
            )
        if len(kopyalar) > limit:
            self.stdout.write(f'… ve {len(kopyalar) - limit} kayıt daha')

        ids = [o.id for o in kopyalar]
        bagli = AnswerKeyItem.objects.filter(outcome_id__in=ids).count()
        self.stdout.write(
            f'Toplam {len(kopyalar)} karışmış kazanım, '
            f'{bagli} cevap anahtarı satırı bunlara bağlı.'
        )

        if not options['uygula']:
            self.stdout.write('Kuru çalışma — değişiklik yapılmadı (--uygula ile uygulayın).')
            return

        with transaction.atomic():
            # Yalnız yanlış müfredat bağı kopar; kullanıcının gördüğü metin
            # kalsın diye bağ kopmadan önce satıra yazılır.
            for item in AnswerKeyItem.objects.filter(
                outcome_id__in=ids,
            ).select_related('outcome'):
                if not (item.imported_outcome_text or '').strip():
                    item.imported_outcome_text = item.outcome.text
                item.outcome = None
                item.sub_outcome = None
                item.save(
                    update_fields=['imported_outcome_text', 'outcome', 'sub_outcome'],
                )
            Outcome.objects.filter(id__in=ids).update(is_active=False)

        self.stdout.write(
            f'{len(kopyalar)} kazanım pasifleştirildi, {bagli} satırın bağı koparıldı.'
        )
