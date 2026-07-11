"""
Uçtan uca test: 10 personel → görevlendirme → sözleşme → öğretmen uygunluğu.

Frontend'in kullandığı REST API uç noktalarını Django test client ile çağırır.
"""
from __future__ import annotations

import json
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.test import Client

from apps.academic.domain.weekly_cycle import WeeklyCycle
from apps.egitim_tanimlari.models import Brans
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.personel.application.contract_calc_service import default_mesai_saatleri
from apps.personel.domain.models import Personel
from apps.roller.models import Role
from apps.sube.domain.models import Sube


def _mesai_weekdays_only():
    return default_mesai_saatleri()


def _mesai_days(active_days: list[int], start='09:00', end='18:00'):
    rows = []
    for gun in range(1, 8):
        aktif = gun in active_days
        rows.append({
            'gun': gun,
            'baslangic': start if aktif else None,
            'bitis': end if aktif else None,
            'mola_dakika': 60 if aktif else 0,
            'aktif': aktif,
        })
    return rows


def _maas_plan(bas: str, bit: str, maas: float = 30000):
    return [{
        'sira_no': 1,
        'baslangic_tarihi': bas,
        'bitis_tarihi': bit,
        'calisilan_gun': 0,
        'maas': maas,
        'aciklama': 'E2E test',
    }]


SCENARIOS = [
    {'sozlesme_turu': 'TAM_ZAMANLI', 'mesai': _mesai_weekdays_only(), 'brut': 35000, 'net': 28000, 'gun': 5},
    {'sozlesme_turu': 'DERS_UCRETLI', 'mesai': _mesai_days([3, 4, 5]), 'brut': 0, 'net': 0, 'gun': 3, 'ders': True},
    {'sozlesme_turu': 'KARMA', 'mesai': _mesai_days([1, 2, 3, 4]), 'brut': 20000, 'net': 16000, 'gun': 4, 'ders': True},
    {'sozlesme_turu': 'TAM_ZAMANLI', 'mesai': _mesai_days([1, 2, 3, 4, 5, 6], '08:30', '16:30'), 'brut': 32000, 'net': 26000, 'gun': 6},
    {'sozlesme_turu': 'DERS_UCRETLI', 'mesai': _mesai_days([2, 4], '17:00', '21:00'), 'brut': 0, 'net': 0, 'gun': 2, 'ders': True},
    {'sozlesme_turu': 'KARMA', 'mesai': _mesai_days([1, 3, 5]), 'brut': 15000, 'net': 12000, 'gun': 3, 'ders': True},
    {'sozlesme_turu': 'TAM_ZAMANLI', 'mesai': _mesai_days([1, 2, 3, 4]), 'brut': 40000, 'net': 32000, 'gun': 4},
    {'sozlesme_turu': 'DERS_UCRETLI', 'mesai': _mesai_days([6, 7], '10:00', '18:00'), 'brut': 0, 'net': 0, 'gun': 2, 'ders': True},
    {'sozlesme_turu': 'KARMA', 'mesai': _mesai_days([1, 2, 3, 4, 5], '10:00', '19:00'), 'brut': 18000, 'net': 14500, 'gun': 5, 'ders': True},
    {'sozlesme_turu': 'TAM_ZAMANLI', 'mesai': _mesai_weekdays_only(), 'brut': 38000, 'net': 30000, 'gun': 5},
]


class Command(BaseCommand):
    help = 'E2E: 10 öğretmen personel + görevlendirme + sözleşme + uygunluk (UI API akışı)'

    def add_arguments(self, parser):
        parser.add_argument('--kurum-id', type=int, default=0)
        parser.add_argument('--sube-id', type=int, default=0)
        parser.add_argument('--egitim-yili-id', type=int, default=0)
        parser.add_argument('--cleanup', action='store_true', help='E2E Test* personellerini sil')

    def handle(self, *args, **options):
        if options['cleanup']:
            self._cleanup()
            return

        kurum = Kurum.objects.filter(pk=options['kurum_id']).first() if options['kurum_id'] else Kurum.objects.filter(aktif_mi=True).first()
        sube = Sube.objects.filter(pk=options['sube_id']).first() if options['sube_id'] else Sube.objects.filter(kurum=kurum, aktif_mi=True).first()
        ey = EgitimYili.objects.filter(pk=options['egitim_yili_id']).first() if options['egitim_yili_id'] else EgitimYili.objects.filter(aktif_mi=True).order_by('-baslangic_yil').first()

        if not kurum or not sube or not ey:
            self.stderr.write('Kurum/şube/eğitim yılı bulunamadı.')
            return

        ogretmen_rol = Role.objects.filter(code__iexact='ogretmen').first()
        if not ogretmen_rol:
            ogretmen_rol = Role.objects.filter(name__icontains='Öğretmen').first()
        if not ogretmen_rol:
            self.stderr.write('Öğretmen rolü bulunamadı.')
            return

        branslar = list(Brans.objects.all()[:10])
        if not branslar:
            self.stderr.write('Branş tanımı yok.')
            return

        calendars = list(WeeklyCycle.objects.filter(kurum=kurum, sube=sube, is_active=True))
        if not calendars:
            self.stderr.write('Çalışma takvimi yok — önce Tanımlar > Çalışma Takvimi oluşturun.')
            return

        user = get_user_model().objects.filter(is_superuser=True, is_active=True).first()
        if not user:
            self.stderr.write('Superuser yok.')
            return

        client = Client(HTTP_HOST='localhost')
        client.force_login(user)
        hdr = {
            'HTTP_X_KURUM_ID': str(kurum.id),
            'HTTP_X_SUBE_ID': str(sube.id),
            'HTTP_X_EGITIMYILI_ID': str(ey.id),
        }

        bas = date.today().isoformat()
        bit = (date.today() + timedelta(days=365)).isoformat()

        report: list[dict] = []
        errors: list[str] = []

        self.stdout.write(f'Kurum={kurum.ad} Şube={sube.ad} EY={ey}')

        for i in range(10):
            idx = i + 1
            brans = branslar[i % len(branslar)]
            scenario = SCENARIOS[i]
            tc = f'9{idx:02d}0000000{i}'[:11]
            label = f'E2E Test Öğretmen {idx:02d}'

            step = {'idx': idx, 'ad': label, 'steps': {}}

            # 1) Personel oluştur (UI: Personel listesi)
            pr = client.post(
                '/personel/api/create/',
                data=json.dumps({
                    'ad': 'E2E Test',
                    'soyad': f'Öğretmen {idx:02d}',
                    'tc_kimlik_no': tc,
                    'aktif_mi': True,
                    'email': f'e2e.ogretmen{idx:02d}@test.local',
                }),
                content_type='application/json',
                **hdr,
            )
            if pr.status_code != 200:
                errors.append(f'#{idx} personel: {pr.status_code} {pr.content[:200]}')
                report.append(step)
                continue
            personel_id = pr.json()['personel']['id']
            step['steps']['personel'] = personel_id

            # 2) Görevlendirme (UI: Görevlendirmeler)
            gr = client.post(
                '/personel/api/gorevlendirme/create/',
                data=json.dumps({
                    'personel_id': personel_id,
                    'egitim_yili_id': ey.id,
                    'gorev_sube_id': sube.id,
                    'rol_id': ogretmen_rol.id,
                    'brans_id': brans.id,
                    'gorev_baslangic': bas,
                    'aktif_mi': True,
                }),
                content_type='application/json',
                **hdr,
            )
            if gr.status_code != 200:
                errors.append(f'#{idx} görevlendirme: {gr.status_code} {gr.content[:200]}')
                report.append(step)
                continue
            gorev_id = gr.json()['data']['id']
            step['steps']['gorevlendirme'] = gorev_id

            # 3) Sözleşme (UI: Sözleşmeler)
            body = {
                'personel_id': personel_id,
                'sube_id': sube.id,
                'gorevlendirme_id': gorev_id,
                'sozlesme_turu': scenario['sozlesme_turu'],
                'durum': 'TASLAK',
                'baslangic_tarihi': bas,
                'bitis_tarihi': bit,
                'duzenlenme_tarihi': bas,
                'brut_maas': scenario['brut'],
                'net_maas': scenario['net'],
                'sgk_gun': 30,
                'haftalik_calisma_gun_sayisi': scenario['gun'],
                'haftalik_izin_gunleri': [6, 7],
                'brans_snapshot': brans.ad,
                'gorev_snapshot': 'Öğretmen',
                'mesai_saatleri': scenario['mesai'],
                'maas_plani': _maas_plan(bas, bit, scenario['brut'] or 5000),
                'ders_ucreti_aktif': bool(scenario.get('ders')),
                'ders_ucretleri': [{
                    'brans_id': brans.id,
                    'ucret_tipi': 'SAAT_BASI',
                    'birim_ucret': 350,
                    'haftalik_saat': 12,
                    'notlar': 'E2E',
                }] if scenario.get('ders') else [],
                'maddeler': [],
            }
            sr = client.post(
                '/personel/api/sozlesmeler/',
                data=json.dumps(body),
                content_type='application/json',
                **hdr,
            )
            if sr.status_code not in (200, 201):
                errors.append(f'#{idx} sözleşme: {sr.status_code} {sr.content[:300]}')
                report.append(step)
                continue
            sozlesme_id = sr.json()['data']['id']
            step['steps']['sozlesme'] = sozlesme_id

            # 4) Sözleşmeyi aktifleştir
            ar = client.post(
                f'/personel/api/sozlesmeler/{sozlesme_id}/durum/',
                data=json.dumps({'durum': 'AKTIF'}),
                content_type='application/json',
                **hdr,
            )
            if ar.status_code != 200:
                errors.append(f'#{idx} sözleşme aktif: {ar.status_code} {ar.content[:200]}')
                report.append(step)
                continue
            step['steps']['sozlesme_aktif'] = True

            # 5) Öğretmen uygunluğu (UI: Akademik > Öğretmen Uygunlukları)
            cal = calendars[i % len(calendars)]
            cal_ids = [c.id for c in calendars[: min(2, len(calendars))]]

            grid_r = client.get(
                f'/api/academic/teacher-availability/{personel_id}/grid/{cal.id}/',
                **hdr,
            )
            cells: dict[str, str] = {}
            if grid_r.status_code == 200:
                grid = grid_r.json().get('data') or {}
                for day in grid.get('days') or []:
                    for slot in day.get('slots') or []:
                        dow = day['day_of_week']
                        # İlk 2 slot uygun, 3. tercihli (varsa)
                        if slot['order'] <= 2:
                            cells[f'{cal.id}:{dow}:{slot["timeslot_id"]}'] = 'AVAILABLE'
                        elif slot['order'] == 3:
                            cells[f'{cal.id}:{dow}:{slot["timeslot_id"]}'] = 'PREFERRED'

            save_body = {
                'kind': 'DEFAULT',
                'calendar_ids': cal_ids,
                'cells': cells,
                'force_save': True,
            }
            if idx == 10:
                save_body = {
                    'kind': 'TEMPORARY',
                    'title': 'E2E Yaz Dönemi',
                    'valid_from': bas,
                    'valid_until': (date.today() + timedelta(days=60)).isoformat(),
                    'calendar_ids': [cal.id],
                    'cells': cells,
                    'force_save': True,
                }

            ur = client.put(
                f'/api/academic/teacher-availability/{personel_id}/save/',
                data=json.dumps(save_body),
                content_type='application/json',
                **hdr,
            )
            if ur.status_code != 200:
                errors.append(f'#{idx} uygunluk: {ur.status_code} {ur.content[:300]}')
            else:
                step['steps']['uygunluk'] = ur.json().get('data', {}).get('id')
                step['steps']['slot_count'] = len(cells)

            report.append(step)
            self.stdout.write(self.style.SUCCESS(f'  ✓ #{idx:02d} {label} — personel={personel_id}'))

        # Doğrulama: öğretmen listesi API
        tr = client.get('/api/academic/teacher-availability/teachers/', **hdr)
        teacher_count = 0
        e2e_count = 0
        if tr.status_code == 200:
            teachers = tr.json().get('data') or []
            teacher_count = len(teachers)
            e2e_count = sum(1 for t in teachers if 'E2E Test' in t.get('tam_ad', ''))

        self.stdout.write('')
        self.stdout.write('=' * 60)
        self.stdout.write(f'Tamamlanan kayıt: {sum(1 for r in report if r.get("steps", {}).get("uygunluk"))}/10')
        self.stdout.write(f'Öğretmen listesi API: {teacher_count} öğretmen ({e2e_count} E2E)')
        if errors:
            self.stdout.write(self.style.ERROR(f'Hatalar ({len(errors)}):'))
            for e in errors:
                self.stdout.write(f'  - {e}')
        else:
            self.stdout.write(self.style.SUCCESS('Tüm adımlar başarılı.'))

        self.stdout.write('')
        self.stdout.write('Senaryo özeti:')
        for r in report:
            s = r.get('steps', {})
            self.stdout.write(
                f"  #{r['idx']:02d} P={s.get('personel')} G={s.get('gorevlendirme')} "
                f"S={s.get('sozlesme')} U={s.get('uygunluk')} slots={s.get('slot_count', 0)}"
            )

    def _cleanup(self):
        qs = Personel.objects.filter(ad='E2E Test', soyad__startswith='Öğretmen')
        n = qs.count()
        qs.delete()
        self.stdout.write(self.style.WARNING(f'{n} E2E test personeli silindi.'))
