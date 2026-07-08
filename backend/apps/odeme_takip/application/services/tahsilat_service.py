"""
Tahsilat Service
İş kuralları: Tahsilat oluşturma, iptal, kısmi ödeme, fazla ödeme, mahsup

MİMARİ:
- Tahsilat = tek ödeme kaydı (toplam tutar)
- TahsilatDagitim = her taksit için dağıtım detayı
- Bir Tahsilat birden fazla taksiti kapatabilir
"""
from django.db import transaction
from django.db.models import Case, IntegerField, Sum, Value, When
from django.utils import timezone

from apps.finans.application.cek_senet.cek_senet_helpers import cek_senet_v2_enabled, is_cek_senet_yontemi
from apps.finans.constants.payment_types import OdemeYontemiTipi
from apps.finans.constants.hareket_types import HareketKaynagi
from apps.finans.domain.payment_method import OdemeYontemi
from apps.finans.application.bakiye_hareketi_service import BakiyeHareketiService
from apps.finans.application.islem_masrafi_service import IslemMasrafiService
from apps.finans.domain.islem_masrafi import IslemMasrafiKaynakTipi
from apps.odeme_takip.domain.cek_senet import CekSenetDetay, CekSenetDurum
from apps.odeme_takip.domain.models import Tahsilat, TahsilatDagitim, SozlesmeGecmisi
from apps.odeme_takip.domain.enums import (
    TahsilatTuru, TahsilatDurum, TaksitDurum, GecmisIslemTuru, SozlesmeDurum,
)
from apps.odeme_takip.infrastructure.repositories.tahsilat_repository import TahsilatRepository
from apps.odeme_takip.infrastructure.repositories.taksit_repository import TaksitRepository
from apps.odeme_takip.infrastructure.repositories.sozlesme_repository import SozlesmeGecmisiRepository


class TahsilatService:

    def __init__(self):
        self.repo = TahsilatRepository()
        self.taksit_repo = TaksitRepository()
        self.gecmis_repo = SozlesmeGecmisiRepository()
        self.bakiye_service = BakiyeHareketiService()
        self.masraf_service = IslemMasrafiService()

    def _resolve_mali_hesap_id(self, data, sozlesme):
        """
        Tahsilatın gireceği mali hesabı belirler:
        1. İstekte açıkça belirtilmişse onu kullan.
        2. Seçilen ödeme yönteminin bağlı olduğu mali hesabı kullan.
        3. Sözleşmede tanımlı mali hesabı kullan.
        """
        mali_hesap_id = data.get('mali_hesap_id')
        if mali_hesap_id:
            return mali_hesap_id

        odeme_yontemi_id = data.get('odeme_yontemi_id')
        if odeme_yontemi_id:
            yontem = OdemeYontemi.objects.filter(id=odeme_yontemi_id).first()
            if yontem and yontem.mali_hesap_id:
                if not (cek_senet_v2_enabled() and is_cek_senet_yontemi(yontem)):
                    return yontem.mali_hesap_id

        if sozlesme.mali_hesap_id:
            return sozlesme.mali_hesap_id

        return None

    def _validate_mali_hesap_for_sozlesme(self, mali_hesap_id, sozlesme):
        """Mali hesabın sözleşmenin kurum/şubesine ait olduğunu doğrular."""
        from apps.finans.domain.financial_account import MaliHesap

        mali_hesap = (
            MaliHesap.objects.filter(id=mali_hesap_id, silindi_mi=False, aktif_mi=True)
            .select_related('sube')
            .first()
        )
        if not mali_hesap:
            return {'mali_hesap_id': 'Mali hesap bulunamadı veya pasif.'}
        if mali_hesap.sube.kurum_id != sozlesme.kurum_id:
            return {'mali_hesap_id': 'Mali hesap bu kuruma ait değil.'}
        if sozlesme.sube_id and mali_hesap.sube_id != sozlesme.sube_id:
            return {'mali_hesap_id': 'Mali hesap sözleşmenin şubesine ait değil.'}
        return None

    def _get_open_taksitler_for_allocation(self, sozlesme_id, reference_date=None):
        """Açık taksitleri dağıtım önceliğine göre döndür: vadesi geçmiş → vade → taksit no."""
        from apps.odeme_takip.domain.models import Taksit as TaksitModel

        today = reference_date or timezone.localdate()
        return (
            TaksitModel.objects.filter(
                sozlesme_id=sozlesme_id,
                kalan_tutar__gt=0,
                durum__in=[
                    TaksitDurum.BEKLEMEDE,
                    TaksitDurum.KISMI_ODENDI,
                    TaksitDurum.GECIKTI,
                ],
            )
            .annotate(
                overdue_rank=Case(
                    When(vade_tarihi__lt=today, then=Value(0)),
                    default=Value(1),
                    output_field=IntegerField(),
                )
            )
            .order_by('overdue_rank', 'vade_tarihi', 'taksit_no')
        )

    def _allocate_payment_to_taksitler(self, tahsilat, sozlesme_id, tutar):
        """Tahsilat tutarını öncelik sırasına göre açık taksitlere dağıt."""
        kalan_tutar = tutar
        dagitimlar = []
        etkilenen_taksitler = []

        for taksit in self._get_open_taksitler_for_allocation(sozlesme_id):
            if kalan_tutar <= 0:
                break
            taksit_odenecek = int(round(min(kalan_tutar, taksit.kalan_tutar)))
            if taksit_odenecek <= 0:
                continue

            dag = TahsilatDagitim.objects.create(
                tahsilat=tahsilat,
                taksit=taksit,
                tutar=taksit_odenecek,
            )
            dagitimlar.append(dag)
            taksit.bakiye_guncelle()
            taksit.save()
            etkilenen_taksitler.append(taksit)
            kalan_tutar -= taksit_odenecek

        return dagitimlar, etkilenen_taksitler, kalan_tutar

    def get_by_sozlesme(self, sozlesme_id):
        return self.repo.get_by_sozlesme(sozlesme_id)

    def get_all(self, kurum_id=None, sube_id=None, egitim_yili_id=None, filters=None):
        return self.repo.get_all(kurum_id, sube_id, egitim_yili_id, filters)

    @transaction.atomic
    def create(self, data, user=None):
        """
        Tahsilat kaydet — TEK kayıt + otomatik taksit dağıtımlı.

        Akış:
        1. TEK Tahsilat kaydı oluşturulur (toplam tutar ile)
        2. Tutar vadesi geçmiş ve eski taksitlerden başlayarak dağıtılır
           (kısmi ödenmiş taksitler önce kapatılır)
        3. UI'dan seçilen taksit yalnızca referans amaçlıdır, öncelik vermez
        4. Tüm taksitler kapandıktan sonra hâlâ para artıyorsa → emanet

        data: {
            sozlesme_id, taksit_id, odeme_yontemi_id,
            tutar, tahsilat_tarihi, referans_no, aciklama
        }
        """
        errors = self._validate(data)
        if errors:
            return None, errors

        if cek_senet_v2_enabled() and not data.get('_skip_cek_senet_guard'):
            yontem = OdemeYontemi.objects.filter(id=data.get('odeme_yontemi_id')).first()
            if is_cek_senet_yontemi(yontem):
                return None, {
                    'error': 'Çek/senet tahsilatı Finans → Çek/Senet modülünden yapılmalıdır.',
                    'redirect': '/finans/cek-senet',
                }

        sozlesme_id = data['sozlesme_id']
        taksit_id = data.get('taksit_id')
        tutar = int(data['tutar'])

        # Sözleşme kontrol
        from apps.odeme_takip.domain.models import Sozlesme
        try:
            sozlesme = Sozlesme.objects.get(id=sozlesme_id)
        except Sozlesme.DoesNotExist:
            return None, {'error': 'Sözleşme bulunamadı'}

        if sozlesme.durum not in [SozlesmeDurum.AKTIF, SozlesmeDurum.DONDURULMUS]:
            return None, {'error': 'Bu sözleşmeye tahsilat kaydedilemez (statü uygun değil)'}

        taksit = None
        if taksit_id:
            taksit = self.taksit_repo.get_by_id(taksit_id)
            if not taksit:
                return None, {'error': 'Taksit bulunamadı'}
            if taksit.sozlesme_id != sozlesme_id:
                return None, {'error': 'Taksit bu sözleşmeye ait değil'}
            if taksit.durum == TaksitDurum.ODENDI:
                return None, {'error': 'Bu taksit zaten ödenmiş'}
            if taksit.durum == TaksitDurum.IPTAL:
                return None, {'error': 'İptal edilmiş taksit için tahsilat alınamaz'}

        # ── Mali hesap belirle (kasa/banka bakiyesi buradan işlenir) ──
        mali_hesap_id = self._resolve_mali_hesap_id(data, sozlesme)
        if not mali_hesap_id:
            return None, {
                'mali_hesap_id': (
                    'Mali hesap (kasa/banka) seçimi zorunludur. '
                    'Tahsilatın hangi hesaba yattığını belirtin.'
                ),
            }
        mali_err = self._validate_mali_hesap_for_sozlesme(mali_hesap_id, sozlesme)
        if mali_err:
            return None, mali_err

        # ── TEK Tahsilat kaydı oluştur (toplam tutar) ──
        tahsilat = self.repo.create({
            'sozlesme_id': sozlesme_id,
            'taksit': taksit,  # başlangıç taksiti (UI'dan seçilen)
            'odeme_yontemi_id': data['odeme_yontemi_id'],
            'mali_hesap_id': mali_hesap_id,
            'tutar': tutar,  # TOPLAM ödeme tutarı
            'tahsilat_tarihi': data['tahsilat_tarihi'],
            'referans_no': data.get('referans_no', ''),
            'tahsilat_turu': TahsilatTuru.NORMAL,
            'durum': TahsilatDurum.AKTIF,
            'islem_yapan': user,
            'aciklama': data.get('aciklama', ''),
        })

        # ── Kasa/banka bakiyesine işle ──────────────
        hareket = self.bakiye_service.tahsilat_giris(
            mali_hesap_id=mali_hesap_id,
            kurum_id=sozlesme.kurum_id,
            sube_id=sozlesme.sube_id,
            egitim_yili_id=sozlesme.egitim_yili_id,
            tutar=tutar,
            islem_tarihi=data['tahsilat_tarihi'],
            tahsilat_id=tahsilat.pk,
            aciklama=f'Tahsilat: {sozlesme.sozlesme_no} — {data.get("aciklama", "")}'.strip(' —'),
            islem_yapan=user,
        )
        tahsilat.bakiye_hareketi_id = hareket.pk
        tahsilat.save(update_fields=['bakiye_hareketi_id'])

        # ── Dağıtım mantığı — geçmiş/kısmi taksitler önce ──
        dagitimlar, etkilenen_taksitler, kalan_tutar = self._allocate_payment_to_taksitler(
            tahsilat, sozlesme_id, tutar,
        )

        if etkilenen_taksitler:
            tahsilat.taksit = etkilenen_taksitler[0]
            tahsilat.save(update_fields=['taksit'])

        # Tüm taksitler ödendikten sonra hâlâ para kaldıysa → emanet olarak işaretle
        if kalan_tutar > 0:
            tahsilat.tahsilat_turu = TahsilatTuru.EMANET
            tahsilat.aciklama = (
                tahsilat.aciklama +
                f' | Emanet: {kalan_tutar} TL (tüm taksitler ödendikten sonra kalan)'
            ).strip(' |')
            tahsilat.save(update_fields=['tahsilat_turu', 'aciklama'])

        # Taksit yokken direkt ödeme (peşinat vb.) — dagitim yok, sadece tahsilat
        # Bu durum taksit seçilmeden ödeme yapıldığında olur

        # ── Audit log ──
        dagitim_bilgisi = []
        for dag in dagitimlar:
            dagitim_bilgisi.append({
                'dagitim_id': dag.id,
                'taksit_no': dag.taksit.taksit_no,
                'tutar': str(dag.tutar),
            })

        self.gecmis_repo.create({
            'sozlesme': sozlesme,
            'islem_turu': GecmisIslemTuru.TAHSILAT,
            'yeni_deger': {
                'tahsilat_id': tahsilat.id,
                'toplam_tutar': str(tutar),
                'dagitim': dagitim_bilgisi,
                'odeme_yontemi_id': data['odeme_yontemi_id'],
            },
            'aciklama': f'Tahsilat kaydedildi: {tutar} TL' + (
                f' → {len(etkilenen_taksitler)} taksit etkilendi' if len(etkilenen_taksitler) > 1 else ''
            ),
            'islem_yapan': user,
        })

        # Dağıtım bilgisini response'a ekle
        tahsilat._dagitim = dagitim_bilgisi

        self._create_cek_senet_detay_if_needed(tahsilat, data)

        try:
            from apps.gorev.application.rule_engine import hook_tahsilat_created
            hook_tahsilat_created(tahsilat, etkilenen_taksitler)
        except Exception:
            pass

        return tahsilat, None

    def _create_cek_senet_detay_if_needed(self, tahsilat, data):
        """Çek/senet ödeme yönteminde CekSenetDetay oluştur."""
        detay = data.get('cek_senet_detay')
        if not detay or not isinstance(detay, dict):
            return

        yontem = OdemeYontemi.objects.filter(id=data.get('odeme_yontemi_id')).first()
        if not yontem or yontem.tip not in (OdemeYontemiTipi.CEK, OdemeYontemiTipi.SENET):
            return

        cek_no = (detay.get('cek_senet_no') or '').strip()
        vade = detay.get('vade_tarihi')
        if not cek_no or not vade:
            return

        durum = detay.get('durum') or CekSenetDurum.PORTFOYDE
        if durum not in dict(CekSenetDurum.CHOICES):
            durum = CekSenetDurum.PORTFOYDE

        CekSenetDetay.objects.create(
            tahsilat=tahsilat,
            cek_senet_no=cek_no,
            banka_adi=(detay.get('banka_adi') or '').strip(),
            vade_tarihi=vade,
            durum=durum,
        )

    @transaction.atomic
    def cancel(self, tahsilat_id, neden, user=None):
        """
        Tahsilat iptal — SİLMEK YOK!
        Statü değişikliği + gerekçe + log
        Tüm TahsilatDagitim kayıtlarına bağlı taksitler de güncellenir.
        """
        tahsilat = self.repo.get_by_id(tahsilat_id)
        if not tahsilat:
            return None, {'error': 'Tahsilat bulunamadı'}

        if tahsilat.durum == TahsilatDurum.IPTAL_EDILDI:
            return None, {'error': 'Bu tahsilat zaten iptal edilmiş'}

        if not neden or len(neden.strip()) < 3:
            return None, {'error': 'İptal nedeni belirtilmeli (en az 3 karakter)'}

        eski_tutar = int(tahsilat.tutar or 0)
        sozlesme = tahsilat.sozlesme

        # ── Bağlı işlem masrafını iptal et ───────────
        _, masraf_err = self.masraf_service.iptal(
            IslemMasrafiKaynakTipi.TAHSILAT,
            tahsilat.pk,
            islem_tarihi=timezone.localdate(),
            islem_yapan=user,
        )
        if masraf_err:
            return None, {'error': masraf_err if isinstance(masraf_err, str) else 'İşlem masrafı iptal edilemedi'}

        # ── Kasa/banka bakiyesini geri al ────────────
        if tahsilat.mali_hesap_id and eski_tutar > 0:
            self.bakiye_service.tahsilat_iptal(
                mali_hesap_id=tahsilat.mali_hesap_id,
                kurum_id=sozlesme.kurum_id,
                sube_id=sozlesme.sube_id,
                egitim_yili_id=sozlesme.egitim_yili_id,
                tutar=eski_tutar,
                islem_tarihi=timezone.localdate(),
                tahsilat_id=tahsilat.pk,
                aciklama=f'Tahsilat iptal: {sozlesme.sozlesme_no} — {neden}',
                islem_yapan=user,
            )

        # ── Bağlı çek/senet kaydını serbest bırak ────
        try:
            detay = CekSenetDetay.objects.filter(tahsilat_id=tahsilat.pk).first()
            if detay and detay.aktif_mi:
                detay.tahsilat = None
                detay.tahsilat_mali_hesap = None
                detay.tahsil_tarihi = None
                if detay.durum in (CekSenetDurum.TAHSIL_EDILDI, CekSenetDurum.TAHSIL):
                    detay.durum = CekSenetDurum.PORTFOYDE
                detay.save(update_fields=[
                    'tahsilat', 'tahsilat_mali_hesap', 'tahsil_tarihi', 'durum', 'updated_at',
                ])
        except Exception:
            pass

        tahsilat.durum = TahsilatDurum.IPTAL_EDILDI
        tahsilat.iptal_nedeni = neden.strip()
        tahsilat.iptal_tarihi = timezone.now()
        tahsilat.iptal_eden = user
        tahsilat.save()

        # Dağıtım kayıtlarına bağlı TÜM taksitlerin bakiyesini güncelle
        etkilenen_taksit_ids = set()
        for dag in tahsilat.dagitimlar.all().select_related('taksit'):
            etkilenen_taksit_ids.add(dag.taksit_id)

        # Eski sistem uyumu: doğrudan taksit FK'si olan tahsilat
        if tahsilat.taksit_id:
            etkilenen_taksit_ids.add(tahsilat.taksit_id)

        from apps.odeme_takip.domain.models import Taksit as TaksitModel
        for taksit_id in etkilenen_taksit_ids:
            try:
                t = TaksitModel.objects.get(id=taksit_id)
                t.bakiye_guncelle()
                t.save()
            except TaksitModel.DoesNotExist:
                pass

        # Audit log
        self.gecmis_repo.create({
            'sozlesme': tahsilat.sozlesme,
            'islem_turu': GecmisIslemTuru.IPTAL,
            'eski_deger': {'tutar': str(eski_tutar), 'durum': 'aktif'},
            'yeni_deger': {'durum': 'iptal_edildi', 'neden': neden},
            'aciklama': f'Tahsilat iptal edildi: {eski_tutar} TL — Neden: {neden}',
            'islem_yapan': user,
        })

        return tahsilat, None

    def iade_yap(self, data, user=None):
        """
        İade — kurumdan öğrenciye/veliye nakit iade (kasadan/bankadan çıkış).

        İki kullanım biçimi vardır:
        1. `kaynak_tahsilat_id` verilirse: o tahsilata bağlı kısmi/tam iade
           yapılır (aynı tahsilata birden fazla kısmi iade yapılabilir,
           toplamı kaynak tahsilatın tutarını aşamaz).
        2. Verilmezse: sözleşme bazında serbest iade yapılır — toplamı
           sözleşmenin net tahsil edilen tutarını (iadeler düşülmüş) aşamaz.

        Not: Taksit dağıtım kayıtları (TahsilatDagitim) değişmez — orijinal
        tahsilat kaydı audit amaçlı olduğu gibi kalır. İade, ayrı bir
        Tahsilat(tahsilat_turu=IADE) kaydı + BakiyeHareketi ÇIKIŞ hareketiyle
        izlenir; taksit tekrar açılmaz (gerekirse manuel statü değişikliği
        sözleşme ekranından yapılabilir).

        data: {
            sozlesme_id, tutar, tahsilat_tarihi, aciklama,
            kaynak_tahsilat_id (opsiyonel), odeme_yontemi_id (opsiyonel),
            mali_hesap_id (opsiyonel — hiçbiri verilmezse kaynak tahsilatın
            veya sözleşmenin varsayılan hesabı kullanılır)
        }
        """
        errors = self._validate_iade(data)
        if errors:
            return None, errors

        sozlesme_id = data['sozlesme_id']
        tutar = int(data['tutar'])

        from apps.odeme_takip.domain.models import Sozlesme
        try:
            sozlesme = Sozlesme.objects.get(id=sozlesme_id)
        except Sozlesme.DoesNotExist:
            return None, {'error': 'Sözleşme bulunamadı'}

        kaynak_tahsilat = None
        kaynak_tahsilat_id = data.get('kaynak_tahsilat_id')
        if kaynak_tahsilat_id:
            kaynak_tahsilat = self.repo.get_by_id(kaynak_tahsilat_id)
            if not kaynak_tahsilat or kaynak_tahsilat.sozlesme_id != int(sozlesme_id):
                return None, {'error': 'Geçerli bir kaynak tahsilat bulunamadı'}
            if kaynak_tahsilat.durum != TahsilatDurum.AKTIF:
                return None, {'error': 'İptal edilmiş bir tahsilat için iade yapılamaz'}
            if kaynak_tahsilat.tahsilat_turu == TahsilatTuru.IADE:
                return None, {'error': 'Bir iade kaydına tekrar iade yapılamaz'}

            zaten_iade_edilen = Tahsilat.objects.filter(
                mahsup_kaynagi_id=kaynak_tahsilat.id,
                tahsilat_turu=TahsilatTuru.IADE,
                durum=TahsilatDurum.AKTIF,
            ).aggregate(t=Sum('tutar'))['t'] or 0
            kalan_iade_edilebilir = kaynak_tahsilat.tutar - int(zaten_iade_edilen)
            if tutar > kalan_iade_edilebilir:
                return None, {
                    'error': f'Bu tahsilat için en fazla {kalan_iade_edilebilir} TL iade edilebilir '
                             f'(daha önce {zaten_iade_edilen} TL iade edilmiş)'
                }
        else:
            toplam_tahsil = sozlesme.tahsilatlar.filter(
                durum=TahsilatDurum.AKTIF,
            ).exclude(tahsilat_turu=TahsilatTuru.IADE).aggregate(t=Sum('tutar'))['t'] or 0
            toplam_iade = sozlesme.tahsilatlar.filter(
                durum=TahsilatDurum.AKTIF, tahsilat_turu=TahsilatTuru.IADE,
            ).aggregate(t=Sum('tutar'))['t'] or 0
            kalan = int(toplam_tahsil) - int(toplam_iade)
            if tutar > kalan:
                return None, {'error': f'Bu sözleşme için en fazla {kalan} TL iade edilebilir'}

        odeme_yontemi_id = data.get('odeme_yontemi_id') or (
            kaynak_tahsilat.odeme_yontemi_id if kaynak_tahsilat else None
        )
        if not odeme_yontemi_id:
            return None, {'error': 'Ödeme yöntemi seçilmedi'}

        mali_hesap_id = data.get('mali_hesap_id') or (
            kaynak_tahsilat.mali_hesap_id if kaynak_tahsilat else None
        ) or sozlesme.mali_hesap_id
        if not mali_hesap_id:
            return None, {'error': 'İade edilecek mali hesap (kasa/banka) belirtilmeli'}

        aciklama = data.get('aciklama') or (
            f'İade — Kaynak Tahsilat #{kaynak_tahsilat.id}' if kaynak_tahsilat
            else f'İade — Sözleşme {sozlesme.sozlesme_no}'
        )

        iade = self.repo.create({
            'sozlesme_id': sozlesme_id,
            'taksit': kaynak_tahsilat.taksit if kaynak_tahsilat else None,
            'odeme_yontemi_id': odeme_yontemi_id,
            'mali_hesap_id': mali_hesap_id,
            'tutar': tutar,
            'tahsilat_tarihi': data['tahsilat_tarihi'],
            'referans_no': data.get('referans_no', ''),
            'tahsilat_turu': TahsilatTuru.IADE,
            'mahsup_kaynagi': kaynak_tahsilat,
            'durum': TahsilatDurum.AKTIF,
            'islem_yapan': user,
            'aciklama': aciklama,
        })

        hareket = self.bakiye_service.iade_cikis(
            mali_hesap_id=mali_hesap_id,
            kurum_id=sozlesme.kurum_id,
            sube_id=sozlesme.sube_id,
            egitim_yili_id=sozlesme.egitim_yili_id,
            tutar=tutar,
            islem_tarihi=data['tahsilat_tarihi'],
            tahsilat_id=iade.pk,
            aciklama=aciklama,
            islem_yapan=user,
        )
        iade.bakiye_hareketi_id = hareket.pk
        iade.save(update_fields=['bakiye_hareketi_id'])

        self.gecmis_repo.create({
            'sozlesme': sozlesme,
            'islem_turu': GecmisIslemTuru.IADE,
            'yeni_deger': {
                'iade_id': iade.id,
                'tutar': str(tutar),
                'kaynak_tahsilat_id': kaynak_tahsilat.id if kaynak_tahsilat else None,
            },
            'aciklama': f'İade yapıldı: {tutar} TL — {aciklama}',
            'islem_yapan': user,
        })

        return iade, None

    def _validate_iade(self, data):
        errors = {}
        if not data.get('sozlesme_id'):
            errors['sozlesme_id'] = 'Sözleşme seçilmedi'
        if not data.get('tahsilat_tarihi'):
            errors['tahsilat_tarihi'] = 'İade tarihi zorunlu'
        tutar = data.get('tutar')
        if tutar is None:
            errors['tutar'] = 'Tutar zorunlu'
        else:
            try:
                if int(tutar) <= 0:
                    errors['tutar'] = "Tutar 0'dan büyük olmalı"
            except (TypeError, ValueError):
                errors['tutar'] = 'Geçersiz tutar'
        return errors if errors else None

    def apply_advance(self, sozlesme_id, emanet_id, taksit_id, user=None):
        """Emaneti sonraki taksite mahsup et"""
        emanet = self.repo.get_by_id(emanet_id)
        if not emanet or emanet.tahsilat_turu != TahsilatTuru.EMANET:
            return None, {'error': 'Geçerli bir emanet kaydı bulunamadı'}
        if emanet.durum != TahsilatDurum.AKTIF:
            return None, {'error': 'Bu emanet zaten kullanılmış veya iptal edilmiş'}

        taksit = self.taksit_repo.get_by_id(taksit_id)
        if not taksit or taksit.sozlesme_id != int(sozlesme_id):
            return None, {'error': 'Geçerli bir taksit bulunamadı'}

        # Mahsup tahsilat oluştur — para zaten emanet tahsilatında kasaya girmişti,
        # burada yalnızca taksit eşleşmesi değişiyor; yeni bir BakiyeHareketi oluşturulmaz.
        mahsup = self.repo.create({
            'sozlesme_id': sozlesme_id,
            'taksit': taksit,
            'odeme_yontemi_id': emanet.odeme_yontemi_id,
            'mali_hesap_id': emanet.mali_hesap_id,
            'tutar': emanet.tutar,
            'tahsilat_tarihi': timezone.now().date(),
            'referans_no': f'MAHSUP-{emanet.id}',
            'tahsilat_turu': TahsilatTuru.MAHSUP,
            'mahsup_kaynagi': emanet,
            'durum': TahsilatDurum.AKTIF,
            'islem_yapan': user,
            'aciklama': f'Emanet mahsubu — Kaynak tahsilat #{emanet.id}',
        })

        # Emaneti iptal (kullanıldı)
        emanet.durum = TahsilatDurum.IPTAL_EDILDI
        emanet.iptal_nedeni = f'Taksit {taksit.taksit_no} mahsubunda kullanıldı'
        emanet.save()

        # Taksit bakiyesini güncelle
        taksit.bakiye_guncelle()
        taksit.save()

        return mahsup, None

    def _validate(self, data):
        errors = {}
        if not data.get('sozlesme_id'):
            errors['sozlesme_id'] = 'Sözleşme seçilmedi'
        if not data.get('odeme_yontemi_id'):
            errors['odeme_yontemi_id'] = 'Ödeme yöntemi seçilmedi'
        if not data.get('tahsilat_tarihi'):
            errors['tahsilat_tarihi'] = 'Tahsilat tarihi zorunlu'
        tutar = data.get('tutar')
        if tutar is None:
            errors['tutar'] = 'Tutar zorunlu'
        elif int(tutar) <= 0:
            errors['tutar'] = 'Tutar 0\'dan büyük olmalı'
        return errors if errors else None
