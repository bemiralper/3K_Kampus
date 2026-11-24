"""repair_lgs_social_columns'un ters çevirdiği LGS İnkılap/Din sütunlarını geri alır.

Yalnız adı verilen sınav ve şablonlara dokunur. Din sütunu İnkılap'tan önce
değilse (zaten düzse) o oturuma ve cevaplarına dokunmaz; tekrar çalıştırmak güvenlidir.
--apply verilmezse her şey bir işlem içinde yapılıp geri alınır ve önce/sonra
ortalamaları yazdırılır.
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Avg

from apps.coaching.olcme_degerlendirme.models import Exam, MappingTemplate, StudentSectionScore
from apps.coaching.olcme_degerlendirme.services.exam_rescore import rescore_exam_results
from apps.coaching.olcme_degerlendirme.services.student_matching import normalize_name


class _DryRun(Exception):
    pass


def _kind(name) -> str:
    text = normalize_name(name or '')
    if 'inkilap' in text or text == 'tarih':
        return 'inkilap'
    if 'din kulturu' in text or text == 'din':
        return 'din'
    return ''


def _unswap(mappings, kind_of) -> bool:
    """Din sütunu İnkılap'tan önceyse iki aralığı yer değiştirir."""
    found = {}
    for item in mappings or []:
        if isinstance(item, dict) and type(item.get('start')) is int and type(item.get('end')) is int:
            kind = kind_of(item)
            if kind:
                found[kind] = item
    inkilap, din = found.get('inkilap'), found.get('din')
    if not inkilap or not din or din['start'] > inkilap['start']:
        return False
    inkilap['start'], inkilap['end'], din['start'], din['end'] = (
        din['start'], din['end'], inkilap['start'], inkilap['end'],
    )
    return True


def _swap_answers(answers: dict, inkilap, din) -> dict:
    payload = dict(answers or {})
    for offset in range(inkilap.question_end - inkilap.question_start + 1):
        left, right = str(inkilap.question_start + offset), str(din.question_start + offset)
        payload[left], payload[right] = payload.get(right, ''), payload.get(left, '')
    return payload


def _averages(exam, sections) -> str:
    rows = (
        StudentSectionScore.objects
        .filter(student_answer__session__exam=exam, section__in=sections)
        .values('section__name')
        .annotate(avg=Avg('net'))
    )
    return ', '.join(f"{row['section__name']} {row['avg'] or 0:.2f}" for row in rows) or '-'


class Command(BaseCommand):
    help = 'Ters okunmuş LGS İnkılap/Din sütunlarını adı verilen sınav ve şablonlarda geri çevirir.'

    def add_arguments(self, parser):
        parser.add_argument('--exam', type=int, action='append', default=[], help='Sınav ID (tekrarlanabilir)')
        parser.add_argument('--template', type=int, action='append', default=[], help='Şablon ID (tekrarlanabilir)')
        parser.add_argument('--apply', action='store_true', help='Değişiklikleri kaydet (yoksa deneme)')

    def handle(self, *args, **options):
        if not options['exam'] and not options['template']:
            raise CommandError('En az bir --exam veya --template verin.')
        apply = options['apply']
        try:
            with transaction.atomic():
                self._templates(options['template'])
                for exam_id in options['exam']:
                    self._exam(exam_id)
                if not apply:
                    raise _DryRun
        except _DryRun:
            self.stdout.write(self.style.WARNING('Deneme: hiçbir değişiklik kaydedilmedi. Kaydetmek için --apply.'))
            return
        self.stdout.write(self.style.SUCCESS('Kaydedildi.'))

    def _templates(self, ids):
        for template in MappingTemplate.objects.filter(pk__in=ids):
            mappings = list(template.mappings or [])
            if _unswap(mappings, lambda item: _kind(item.get('label'))):
                template.mappings = mappings
                template.save(update_fields=['mappings'])
                self.stdout.write(f'Şablon {template.pk} "{template.name}": düzeltildi')
            else:
                self.stdout.write(f'Şablon {template.pk} "{template.name}": zaten düz, atlandı')
        missing = set(ids) - set(MappingTemplate.objects.filter(pk__in=ids).values_list('pk', flat=True))
        for pk in sorted(missing):
            self.stdout.write(f'Şablon {pk}: bulunamadı')

    def _exam(self, exam_id):
        exam = Exam.objects.filter(pk=exam_id).first()
        if not exam:
            self.stdout.write(f'Sınav {exam_id}: bulunamadı')
            return
        if exam.exam_type != 'LGS':
            self.stdout.write(f'Sınav {exam_id}: LGS değil, atlandı')
            return
        sections = list(exam.sections.filter(is_sub_section=False))
        by_kind = {_kind(section.name): section for section in sections if _kind(section.name)}
        inkilap, din = by_kind.get('inkilap'), by_kind.get('din')
        if not inkilap or not din:
            self.stdout.write(f'Sınav {exam_id}: İnkılap/Din bölümü yok, atlandı')
            return
        if inkilap.question_end - inkilap.question_start != din.question_end - din.question_start:
            self.stdout.write(f'Sınav {exam_id}: İnkılap ve Din soru sayıları farklı, atlandı')
            return
        fields = {f'ders_{inkilap.pk}': 'inkilap', f'ders_{din.pk}': 'din'}
        kind_of = lambda item: fields.get(item.get('field'), '')  # noqa: E731

        before = _averages(exam, [inkilap, din])
        changed_answers = 0
        changed_sessions = 0
        for session in exam.sessions.all():
            mappings = list(session.field_mappings or [])
            settings = dict(session.dual_dat_settings or {})
            verbal = dict(settings['verbal']) if isinstance(settings.get('verbal'), dict) else None
            changed = _unswap(mappings, kind_of)
            if verbal is not None:
                verbal['field_mappings'] = list(verbal.get('field_mappings') or [])
                changed = _unswap(verbal['field_mappings'], kind_of) or changed
            if not changed:
                continue
            for answer in session.student_answers.all():
                answer.answers = _swap_answers(answer.answers, inkilap, din)
                answer.save(update_fields=['answers'])
                changed_answers += 1
            session.field_mappings = mappings
            if verbal is not None:
                settings['verbal'] = verbal
                session.dual_dat_settings = settings
            session.save(update_fields=['field_mappings', 'dual_dat_settings'])
            changed_sessions += 1

        if not changed_sessions:
            self.stdout.write(f'Sınav {exam_id} "{exam.name}": zaten düz, atlandı ({before})')
            return
        rescore_exam_results(exam)
        self.stdout.write(
            f'Sınav {exam_id} "{exam.name}": oturum {changed_sessions}, cevap {changed_answers}\n'
            f'    önce: {before}\n    sonra: {_averages(exam, [inkilap, din])}'
        )
