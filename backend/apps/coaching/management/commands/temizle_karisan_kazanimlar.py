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
from django.core.management.base import BaseCommand

from apps.coaching.olcme_degerlendirme.models.answer_key import AnswerKeyItem
from apps.coaching.olcme_degerlendirme.services.curriculum_heal import (
    karisan_kazanimlari_bul,
    uygula_karisan_kazanim_temizligi,
)


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

        pasif, bag = uygula_karisan_kazanim_temizligi()
        self.stdout.write(
            f'{pasif} kazanım pasifleştirildi, {bag} satırın bağı koparıldı.'
        )
