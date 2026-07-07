"""
Mevcut Personel / Öğrenci / Veli kayıtlarını Kisi'ye bağlar.
Çakışmalar otomatik birleştirilmez — raporlanır.
"""
from __future__ import annotations

import json
from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.kimlik.application.kisi_service import KisiService
from apps.kimlik.domain.models import Kisi
from apps.kimlik.domain.phone import normalize_phone
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
from apps.personel.domain.models import Personel


def collect_conflicts(kurum_id: int | None = None, dry_run: bool = True) -> list[dict]:
    """TC / telefon çakışmalarını tespit et."""
    conflicts: list[dict] = []
    kurum_qs = Kurum.objects.filter(aktif_mi=True)
    if kurum_id:
        kurum_qs = kurum_qs.filter(id=kurum_id)

    for kurum in kurum_qs:
        tc_map: dict[str, list[dict]] = defaultdict(list)
        tel_map: dict[str, list[dict]] = defaultdict(list)

        for p in Personel.objects.filter(kurum=kurum).exclude(tc_kimlik_no__isnull=True).exclude(tc_kimlik_no=''):
            tc_map[p.tc_kimlik_no].append({'model': 'Personel', 'id': p.id, 'ad': p.tam_ad})
            tel = normalize_phone(p.cep_telefon or p.telefon)
            if tel:
                tel_map[tel].append({'model': 'Personel', 'id': p.id, 'ad': p.tam_ad, 'tc': p.tc_kimlik_no})

        for o in Ogrenci.objects.filter(kurum=kurum).exclude(tc_kimlik_no__isnull=True).exclude(tc_kimlik_no=''):
            tc_map[o.tc_kimlik_no].append({'model': 'Ogrenci', 'id': o.id, 'ad': o.tam_ad})
            tel = normalize_phone(o.telefon)
            if tel:
                tel_map[tel].append({'model': 'Ogrenci', 'id': o.id, 'ad': o.tam_ad, 'tc': o.tc_kimlik_no})

        for v in OgrenciVeli.objects.filter(ogrenci__kurum=kurum).exclude(tc_kimlik_no=''):
            tc_map[v.tc_kimlik_no].append({'model': 'OgrenciVeli', 'id': v.id, 'ad': v.tam_ad})
            tel = normalize_phone(v.telefon)
            if tel:
                tel_map[tel].append({'model': 'OgrenciVeli', 'id': v.id, 'ad': v.tam_ad, 'tc': v.tc_kimlik_no})

        for tc, kayitlar in tc_map.items():
            models = {k['model'] for k in kayitlar}
            if len(models) > 1 or len(kayitlar) > 1 and 'Personel' in models and 'Ogrenci' in models:
                conflicts.append({
                    'tip': 'tc_cross_entity',
                    'kurum_id': kurum.id,
                    'kurum_ad': kurum.ad,
                    'tc': tc,
                    'kayitlar': kayitlar,
                    'onerilen_aksiyon': 'Manuel birleştirme — merge_kisi veya admin',
                })

        for tel, kayitlar in tel_map.items():
            tcs = {k.get('tc') for k in kayitlar if k.get('tc')}
            if len(tcs) > 1:
                conflicts.append({
                    'tip': 'telefon_farkli_tc',
                    'kurum_id': kurum.id,
                    'kurum_ad': kurum.ad,
                    'telefon': tel,
                    'kayitlar': kayitlar,
                    'onerilen_aksiyon': 'Manuel inceleme gerekli',
                })

    return conflicts


class Command(BaseCommand):
    help = 'Mevcut kayıtları Kisi tablosuna bağlar; çakışmaları raporlar.'

    def add_arguments(self, parser):
        parser.add_argument('--kurum-id', type=int, default=None)
        parser.add_argument('--report', type=str, default=None, help='Çakışma raporu JSON dosyası')
        parser.add_argument('--dry-run', action='store_true', help='Sadece rapor, yazma yok')

    def handle(self, *args, **options):
        kurum_id = options.get('kurum_id')
        dry_run = options.get('dry_run')
        report_path = options.get('report')

        conflicts = collect_conflicts(kurum_id=kurum_id, dry_run=True)
        if report_path:
            with open(report_path, 'w', encoding='utf-8') as f:
                json.dump(conflicts, f, ensure_ascii=False, indent=2)
            self.stdout.write(self.style.WARNING(f'Çakışma raporu: {report_path} ({len(conflicts)} kayıt)'))

        if dry_run:
            self.stdout.write(self.style.SUCCESS(f'Dry-run tamamlandı. {len(conflicts)} çakışma.'))
            return

        conflict_tcs = {c['tc'] for c in conflicts if c.get('tc')}
        linked = 0

        kurum_qs = Kurum.objects.filter(aktif_mi=True)
        if kurum_id:
            kurum_qs = kurum_qs.filter(id=kurum_id)

        for kurum in kurum_qs:
            with transaction.atomic():
                tc_to_kisi: dict[str, Kisi] = {}

                for p in Personel.objects.filter(kurum=kurum, kisi__isnull=True):
                    if not p.tc_kimlik_no or p.tc_kimlik_no in conflict_tcs:
                        continue
                    if p.tc_kimlik_no in tc_to_kisi:
                        kisi = tc_to_kisi[p.tc_kimlik_no]
                    else:
                        kisi = KisiService.create_from_profile(kurum.id, {
                            'tc_kimlik_no': p.tc_kimlik_no,
                            'ad': p.ad,
                            'soyad': p.soyad,
                            'dogum_tarihi': p.dogum_tarihi,
                            'cinsiyet': p.cinsiyet,
                            'telefon': p.cep_telefon or p.telefon,
                            'email': p.email,
                            'adres': p.adres,
                            'il': p.il,
                            'ilce': p.ilce,
                        })
                        tc_to_kisi[p.tc_kimlik_no] = kisi
                    KisiService.link_personel(p, kisi)
                    linked += 1

                for o in Ogrenci.objects.filter(kurum=kurum, kisi__isnull=True):
                    if not o.tc_kimlik_no or o.tc_kimlik_no in conflict_tcs:
                        continue
                    if o.tc_kimlik_no in tc_to_kisi:
                        continue  # cross-entity conflict — skip
                    kisi = KisiService.create_from_profile(kurum.id, {
                        'tc_kimlik_no': o.tc_kimlik_no,
                        'ad': o.ad,
                        'soyad': o.soyad,
                        'dogum_tarihi': o.dogum_tarihi,
                        'cinsiyet': o.cinsiyet,
                        'telefon': o.telefon,
                        'email': o.email,
                        'adres': o.adres,
                    })
                    tc_to_kisi[o.tc_kimlik_no] = kisi
                    KisiService.link_ogrenci(o, kisi)
                    linked += 1

                for v in OgrenciVeli.objects.filter(ogrenci__kurum=kurum, kisi__isnull=True):
                    if not v.tc_kimlik_no or v.tc_kimlik_no in conflict_tcs:
                        continue
                    if v.tc_kimlik_no in tc_to_kisi:
                        KisiService.link_veli(v, tc_to_kisi[v.tc_kimlik_no])
                    else:
                        kisi = KisiService.create_from_profile(kurum.id, {
                            'tc_kimlik_no': v.tc_kimlik_no,
                            'ad': v.ad,
                            'soyad': v.soyad,
                            'telefon': v.telefon,
                            'email': v.email,
                        })
                        tc_to_kisi[v.tc_kimlik_no] = kisi
                        KisiService.link_veli(v, kisi)
                    linked += 1

        self.stdout.write(self.style.SUCCESS(f'Backfill tamamlandı. {linked} bağlantı, {len(conflicts)} çakışma raporlandı.'))
