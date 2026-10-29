"""İndirilen kazanım Excel'i aynı programa geri yazılır, diğer program durur."""
import tempfile
from pathlib import Path

from django.test import TestCase

from apps.coaching.olcme_degerlendirme.models.curriculum import Outcome, Subject, Topic
from apps.coaching.olcme_degerlendirme.services.curriculum_excel_import import (
    import_outcomes_workbook,
)


def _workbook(rows, header=None) -> Path:
    from openpyxl import Workbook

    handle = tempfile.NamedTemporaryFile(suffix='.xlsx', delete=False)
    handle.close()
    path = Path(handle.name)
    wb = Workbook()
    ws = wb.active
    ws.append(header or [
        'Ders', 'Program', 'Konu kodu', 'Konu',
        'Kazanım kodu', 'Kazanım', 'Alt kod', 'Alt metin',
    ])
    for row in rows:
        ws.append(row)
    wb.save(path)
    return path


class OutcomesExcelImportTest(TestCase):
    def setUp(self):
        self.subject = Subject.objects.create(
            code='MATEMATIK', name='Matematik', display_name='Matematik',
        )
        self.maarif = Topic.objects.create(
            subject=self.subject, program='maarif', code='9.21',
            name='Maarif · 9. sınıf · Eski', order=1,
        )
        Outcome.objects.create(topic=self.maarif, code='9.21.1', text='Eski kazanım', order=0)
        self.y2018 = Topic.objects.create(
            subject=self.subject, program='program_2018', code='9.1',
            name='Kümeler', order=2,
        )
        Outcome.objects.create(topic=self.y2018, code='9.1.1', text='2018 kazanımı', order=0)

    def test_maarif_file_replaces_maarif_and_keeps_2018(self):
        path = _workbook([[
            'Matematik', 'Maarif Modeli', '9.21', 'Maarif · 9. sınıf · Sayılar',
            '9.21.1.1', 'Yeni kazanım', '9.21.1.1.1', 'Alt adım',
        ]])
        stats = import_outcomes_workbook(path, program='maarif')
        self.assertEqual(stats['topics'], 1)
        self.assertEqual(stats['outcomes'], 1)
        self.assertEqual(stats['sub_outcomes'], 1)
        self.y2018.refresh_from_db()
        self.assertEqual(self.y2018.outcomes.get().text, '2018 kazanımı')
        topic = Topic.objects.get(subject=self.subject, program='maarif', code='9.21')
        self.assertEqual(topic.name, 'Maarif · 9. sınıf · Sayılar')
        outcome = topic.outcomes.get()
        self.assertEqual(outcome.text, 'Yeni kazanım')
        self.assertEqual(outcome.sub_outcomes.get().text, 'Alt adım')
        self.assertFalse(Topic.objects.filter(name='Maarif · 9. sınıf · Eski').exists())

    def test_file_for_the_other_program_is_refused(self):
        path = _workbook([[
            'Matematik', '2018 Programı', '9.1', 'Kümeler',
            '9.1.1', 'Başka', '', '',
        ]])
        with self.assertRaisesMessage(ValueError, 'Maarif Modeli'):
            import_outcomes_workbook(path, program='maarif')
        self.assertEqual(self.maarif.outcomes.get().text, 'Eski kazanım')

    def test_subject_code_column_selects_the_right_subject(self):
        other = Subject.objects.create(code='MAT_AYT', name='Matematik', display_name='Matematik')
        path = _workbook(
            [[
                'MAT_AYT', 'Matematik', 'Maarif Modeli', '11.21', 'Nicelikler',
                '11.21.1', 'Kazanım', '', '',
            ]],
            header=[
                'Ders kodu', 'Ders', 'Program', 'Konu kodu', 'Konu',
                'Kazanım kodu', 'Kazanım', 'Alt kod', 'Alt metin',
            ],
        )
        import_outcomes_workbook(path, program='maarif')
        self.assertTrue(Topic.objects.filter(subject=other, program='maarif', code='11.21').exists())
        self.assertEqual(
            Topic.objects.get(subject=self.subject, program='maarif', code='9.21').outcomes.get().text,
            'Eski kazanım',
        )

    def test_subject_limit_leaves_the_other_ders_in_the_file(self):
        fizik = Subject.objects.create(code='FIZIK', name='Fizik', display_name='Fizik')
        Topic.objects.create(
            subject=fizik, program='maarif', code='9.21', name='Eski fizik', order=1,
        )
        path = _workbook([
            [
                'MATEMATIK', 'Matematik', 'Maarif Modeli', '9.21', 'Yeni matematik',
                '9.21.1', 'Mat kazanım', '', '',
            ],
            [
                'FIZIK', 'Fizik', 'Maarif Modeli', '9.21', 'Yeni fizik',
                '9.21.1', 'Fiz kazanım', '', '',
            ],
        ], header=[
            'Ders kodu', 'Ders', 'Program', 'Konu kodu', 'Konu',
            'Kazanım kodu', 'Kazanım', 'Alt kod', 'Alt metin',
        ])
        import_outcomes_workbook(path, program='maarif', subject_codes=['MATEMATIK'])
        self.assertEqual(
            Topic.objects.get(subject=self.subject, program='maarif').name,
            'Yeni matematik',
        )
        self.assertEqual(
            Topic.objects.get(subject=fizik, program='maarif').name,
            'Eski fizik',
        )
