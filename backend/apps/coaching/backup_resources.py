"""Coaching / sınav — yalnızca kaynak tanımı."""

from apps.yedekleme.domain.models import ResourceType
from apps.yedekleme.registry import ResourceSpec

RESOURCES = [
    ResourceSpec(
        code='coaching.core',
        name='Koçluk Kayıtları',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Koç profili, öğrenci ataması ve görüşmeler.',
        config={
            'models': [
                'coaching.CoachProfile',
                'coaching.CoachStudentAssignment',
                'coaching.GorusmeKaydi',
                'coaching.GorusmeAksiyon',
                'coaching.GorusmeDosya',
            ],
        },
        is_default=False,
        priority=130,
    ),
    ResourceSpec(
        code='coaching.files',
        name='Görüşme Dosyaları',
        resource_type=ResourceType.MEDIA,
        description='Koçluk görüşme ekleri.',
        config={'relative_to': 'media', 'path': 'coaching'},
        is_default=False,
        priority=131,
    ),
    ResourceSpec(
        code='olcme.exams',
        name='Sınavlar',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Sınav, cevap anahtarı ve öğrenci cevapları.',
        config={
            'models': [
                'olcme_degerlendirme.Exam',
                'olcme_degerlendirme.ExamSection',
                'olcme_degerlendirme.AnswerKey',
                'olcme_degerlendirme.AnswerKeyItem',
                'olcme_degerlendirme.ExamSession',
                'olcme_degerlendirme.StudentAnswer',
            ],
        },
        is_default=False,
        priority=140,
    ),
]
