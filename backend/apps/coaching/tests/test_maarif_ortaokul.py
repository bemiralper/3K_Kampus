"""Ortaokul Maarif kataloğu 1–4 ve lise kazanımlarını değiştirmez."""
import json

from django.test import TestCase

from apps.coaching.olcme_degerlendirme.models import Outcome, Subject, Topic
from apps.coaching.olcme_degerlendirme.services.maarif_ortaokul import (
    DATA_PATH,
    replace_ortaokul_catalog,
)
from apps.coaching.olcme_degerlendirme.services.okulizyon_import import restore_ortaokul_catalog
from apps.coaching.olcme_degerlendirme.views.curriculum_views import _match_single_text


class MaarifOrtaokulReplaceTests(TestCase):
    def test_packaged_catalog_covers_grades_5_to_8(self):
        payload = json.loads(DATA_PATH.read_text(encoding='utf-8'))
        codes = set()
        for subject in payload['subjects']:
            self.assertIn(subject['code'], {
                'TURKCE', 'MATEMATIK', 'FEN', 'SOSYAL', 'DKAB', 'INGILIZCE', 'INKILAP',
            })
            for topic in subject['topics']:
                self.assertRegex(topic['name'], r'^[5-8]\. sınıf · ')
                for outcome in topic['outcomes']:
                    codes.add(outcome['code'])
        self.assertIn('MAT.6.1.4', codes)
        self.assertIn('T.Y.8.20', codes)
        self.assertIn('FB.5.5.4', codes)
        self.assertIn('FB.6.7.4', codes)
        self.assertNotIn('9.1.1', codes)

    def test_replace_keeps_primary_and_yks_topics(self):
        subject = Subject.objects.create(code='MATEMATIK', name='Matematik', order=1)
        primary = Topic.objects.create(
            subject=subject, code='4.1', name='4. sınıf · SAYILAR VE İŞLEMLER', order=1,
        )
        Outcome.objects.create(topic=primary, code='4.1.1', text='Eski ilkokul', order=1)
        yks = Topic.objects.create(
            subject=subject, code='9.1', name='9. sınıf · MANTIK', order=2,
        )
        Outcome.objects.create(topic=yks, code='9.1.1', text='Eski lise', order=1)
        okulizyon = Topic.objects.create(
            subject=subject, code='21.1', name='SHG21 · SAYILAR', order=3,
        )
        Outcome.objects.create(topic=okulizyon, code='21.1.1', text='Eski tyt', order=1)
        orta = Topic.objects.create(
            subject=subject, code='8.1', name='8. sınıf · SAYILAR VE İŞLEMLER', order=4,
        )
        Outcome.objects.create(topic=orta, code='8.1.1', text='Eski ortaokul', order=1)

        payload = {
            'subjects': [{
                'code': 'MATEMATIK',
                'name': 'Matematik',
                'topics': [{
                    'code': 'MAT.8.1',
                    'name': '8. sınıf · Sayılar ve Nicelikler',
                    'order': 801,
                    'outcomes': [{
                        'code': 'MAT.8.1.1',
                        'text': 'Üslü ifadeleri yorumlayabilme',
                        'order': 1,
                        'is_active': True,
                        'sub_outcomes': [{
                            'code': 'MAT.8.1.1.a',
                            'text': 'Üslü ifadeleri inceler.',
                            'order': 1,
                            'is_active': True,
                        }],
                    }],
                }],
            }],
        }
        stats = replace_ortaokul_catalog(payload)
        self.assertEqual(stats['deleted_topics'], 1)
        self.assertEqual(stats['kept_topics'], 3)
        names = set(subject.topics.values_list('name', flat=True))
        self.assertIn('4. sınıf · SAYILAR VE İŞLEMLER', names)
        self.assertIn('9. sınıf · MANTIK', names)
        self.assertIn('SHG21 · SAYILAR', names)
        self.assertNotIn('8. sınıf · SAYILAR VE İŞLEMLER', names)
        loaded = Outcome.objects.get(code='MAT.8.1.1')
        self.assertEqual(loaded.topic.subject_id, subject.id)
        self.assertEqual(loaded.sub_outcomes.count(), 1)
        self.assertTrue(Outcome.objects.filter(code='9.1.1').exists())
        self.assertTrue(Outcome.objects.filter(code='4.1.1').exists())
        self.assertFalse(Outcome.objects.filter(code='8.1.1').exists())

    def test_restore_adds_old_codes_beside_maarif(self):
        subject = Subject.objects.create(code='MATEMATIK', name='Matematik', order=1)
        maarif = Topic.objects.create(
            subject=subject, code='MAT.8.1', name='8. sınıf · Sayılar ve Nicelikler', order=801,
        )
        Outcome.objects.create(
            topic=maarif, code='MAT.8.1.1', text='Üslü ifadeleri yorumlayabilme', order=1,
        )
        yks = Topic.objects.create(subject=subject, code='9.1', name='9. sınıf · MANTIK', order=2)
        Outcome.objects.create(topic=yks, code='9.1.1', text='Lise kazanımı', order=1)

        stats = restore_ortaokul_catalog([
            {'ders': 'Matematik', 'kod': '8.1', 'sinif': '8', 'unite': 1, 'konu': 0, 'kazanim': 0, 'alt': 0, 'metin': 'SAYILAR VE İŞLEMLER'},
            {'ders': 'Matematik', 'kod': '8.1.1', 'sinif': '8', 'unite': 1, 'konu': 1, 'kazanim': 0, 'alt': 0, 'metin': 'Çarpanlar ve Katlar'},
            {'ders': 'Matematik', 'kod': '8.1.1.1', 'sinif': '8', 'unite': 1, 'konu': 1, 'kazanim': 1, 'alt': 0, 'metin': 'Verilen pozitif tam sayıların çarpanlarını bulur.'},
            {'ders': 'Matematik', 'kod': '9.2', 'sinif': '9', 'unite': 1, 'konu': 0, 'kazanim': 0, 'alt': 0, 'metin': 'KÜMELER'},
            {'ders': 'Fizik', 'kod': '9.1', 'sinif': '9', 'unite': 1, 'konu': 0, 'kazanim': 0, 'alt': 0, 'metin': 'FİZİK'},
        ])
        self.assertEqual(stats['topics'], 1)
        self.assertEqual(stats['outcomes'], 1)
        self.assertEqual(stats['sub_outcomes'], 1)
        self.assertTrue(Outcome.objects.filter(code='MAT.8.1.1', topic__subject=subject).exists())
        self.assertTrue(Outcome.objects.filter(code='9.1.1', topic__subject=subject).exists())
        self.assertFalse(Topic.objects.filter(subject=subject, code='9.2').exists())

        old = _match_single_text('8.1.1.1', subject)
        new = _match_single_text('MAT.8.1.1', subject)
        self.assertEqual(old['outcome_code'], '8.1.1.1')
        self.assertEqual(new['outcome_code'], 'MAT.8.1.1')

        again = restore_ortaokul_catalog([
            {'ders': 'Matematik', 'kod': '8.1', 'sinif': '8', 'unite': 1, 'konu': 0, 'kazanim': 0, 'alt': 0, 'metin': 'SAYILAR VE İŞLEMLER'},
            {'ders': 'Matematik', 'kod': '8.1.1', 'sinif': '8', 'unite': 1, 'konu': 1, 'kazanim': 0, 'alt': 0, 'metin': 'Çarpanlar ve Katlar'},
            {'ders': 'Matematik', 'kod': '8.1.1.1', 'sinif': '8', 'unite': 1, 'konu': 1, 'kazanim': 1, 'alt': 0, 'metin': 'Verilen pozitif tam sayıların çarpanlarını bulur.'},
        ])
        self.assertEqual(again['topics'], 0)
        self.assertEqual(again['skipped_topics'], 1)
        self.assertEqual(Topic.objects.filter(subject=subject, code='8.1').count(), 1)
