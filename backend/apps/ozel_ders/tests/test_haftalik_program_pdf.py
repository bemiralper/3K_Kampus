from datetime import date, time
from unittest.mock import MagicMock, patch

from django.test import TestCase

from apps.egitim_tanimlari.models import Ders
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
from apps.ozel_ders.domain.models import (
    BirebirHaftalikSlot,
    BirebirOgrenciProgrami,
    ProgramDurumu,
)
from apps.ozel_ders.services.errors import OzelDersError
from apps.ozel_ders.services.haftalik_program_pdf import (
    EVENT_KEY,
    collect_weekly_program,
    preview_haftalik_program,
    render_haftalik_program_pdf,
    send_haftalik_program,
)
from apps.personel.domain.models import Personel
from apps.sube.domain.models import Sube


class HaftalikProgramPdfTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='OD PDF', kod='ODPDF')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='PDF')
        self.ey = EgitimYili.objects.create(baslangic_yil=2026, bitis_yil=2027, aktif_mi=True)
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Zeynep',
            soyad='Kaya',
            telefon='05551112233',
            aktif_mi=True,
        )
        self.veli = OgrenciVeli.objects.create(
            ogrenci=self.ogrenci,
            veli_turu='anne',
            ad='Ayşe',
            soyad='Kaya',
            telefon='05559998877',
            varsayilan=True,
        )
        self.ders = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Fizik', kod='FIZ-P', kisa_ad='Fiz',
        )
        self.ogretmen = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Can', soyad='Yıldız', aktif_mi=True,
        )
        self.program = BirebirOgrenciProgrami.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.ey,
            ogrenci=self.ogrenci,
            baslangic_tarihi=date(2026, 9, 1),
            durum=ProgramDurumu.AKTIF,
        )
        BirebirHaftalikSlot.objects.create(
            program=self.program,
            gun=1,
            baslangic=time(16, 0),
            bitis=time(17, 0),
            sure_dk=60,
            ders=self.ders,
            ogretmen=self.ogretmen,
            aktif=True,
        )

    def test_collect_and_render_pdf(self):
        payload = collect_weekly_program(
            ogrenci_id=self.ogrenci.id,
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
        )
        self.assertEqual(payload['ogrenci_ad'], 'Zeynep Kaya')
        self.assertEqual(len(payload['slots']), 1)
        self.assertEqual(payload['slots'][0]['ders_ad'], 'Fizik')
        pdf_bytes, filename = render_haftalik_program_pdf(payload)
        self.assertTrue(pdf_bytes.startswith(b'%PDF'))
        self.assertIn('Zeynep', filename)
        self.assertGreater(len(pdf_bytes), 400)

    @patch('apps.ozel_ders.services.haftalik_program_pdf.dispatch_event')
    def test_send_veli_and_ogrenci(self, dispatch):
        dispatch.return_value = MagicMock(success=True, errors=[])
        result = send_haftalik_program(
            ogrenci_id=self.ogrenci.id,
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
        )
        self.assertEqual(result['veli_sent'], 1)
        self.assertEqual(result['ogrenci_sent'], 1)
        keys = [c.args[1] for c in dispatch.call_args_list]
        self.assertEqual(keys, [EVENT_KEY, EVENT_KEY])
        types = [c.kwargs['recipient'].recipient_type for c in dispatch.call_args_list]
        self.assertIn('VELI', types)
        self.assertIn('OGRENCI', types)
        for call in dispatch.call_args_list:
            att = call.kwargs['attachment']
            self.assertTrue(att.file_bytes.startswith(b'%PDF'))

    def test_preview_recipients_and_template(self):
        data = preview_haftalik_program(
            ogrenci_id=self.ogrenci.id,
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
        )
        self.assertTrue(data['has_template'])
        self.assertEqual(data['event_key'], EVENT_KEY)
        types = [r['recipient_type'] for r in data['recipients']]
        self.assertIn('veli', types)
        self.assertIn('ogrenci', types)
        veli = next(r for r in data['recipients'] if r['recipient_type'] == 'veli')
        self.assertIn('Ayşe', veli['display_name'])
        self.assertIn('özel ders haftalık programı', veli['body'])
        ogr = next(r for r in data['recipients'] if r['recipient_type'] == 'ogrenci')
        self.assertIn('programın ektedir', ogr['body'])

    @patch('apps.ozel_ders.services.haftalik_program_pdf.dispatch_event')
    def test_send_respects_recipient_selection(self, dispatch):
        dispatch.return_value = MagicMock(success=True, errors=[])
        result = send_haftalik_program(
            ogrenci_id=self.ogrenci.id,
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            veli_ids=[],
            include_student=True,
        )
        self.assertEqual(result['veli_sent'], 0)
        self.assertEqual(result['ogrenci_sent'], 1)
        self.assertEqual(len(dispatch.call_args_list), 1)

    def test_send_empty_slots_raises(self):
        BirebirHaftalikSlot.objects.all().delete()
        with self.assertRaises(OzelDersError) as ctx:
            send_haftalik_program(
                ogrenci_id=self.ogrenci.id,
                kurum_id=self.kurum.id,
                sube_id=self.sube.id,
            )
        self.assertEqual(ctx.exception.code, 'empty')
