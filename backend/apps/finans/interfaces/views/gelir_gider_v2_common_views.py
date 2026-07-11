"""
Gelir & Gider v2 — ortak view'lar: rapor, dropdown, yetkiler, işlem log.
Kök: /finans/api/gelir-gider/v2/...
"""
from rest_framework import status
from rest_framework.response import Response

from apps.finans.application.finans_v2.rapor_service import FinansV2RaporService, SLUGS
from apps.finans.application.finans_v2.audit import FinansAuditService
from apps.finans.application.cari_v2.permissions import cari_effective_permissions
from apps.finans.constants.cari_types import CariHesapTuru, GelirDurum
from apps.finans.constants.gider_types import GiderDurum, KdvOrani
from apps.finans.domain.cari_hesap import CariHesap
from apps.finans.domain.gelir_kategorisi import GelirKategorisi
from apps.finans.domain.gider_kategorisi import GiderKategorisi
from apps.finans.domain.cari_etiket import CariEtiket
from apps.finans.domain.payment_method import OdemeYontemi
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.finansman_tanimlari import (
    GelirKaynagi, MaliyetMerkezi, Proje, AciklamaSablonu, MasrafTuru,
)
from apps.finans.interfaces.views.base import FinansAPIView as APIView
from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube


def _require_kurum(request):
    kurum_id = request.query_params.get('kurum_id')
    if not kurum_id:
        return None, Response(
            {'error': 'kurum_id parametresi zorunludur.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return kurum_id, None


class GelirGiderV2ReportView(APIView):
    """GET → tek rapor (slug)."""

    def get(self, request, slug):
        if slug not in SLUGS:
            return Response({'error': 'Geçersiz rapor.'}, status=status.HTTP_404_NOT_FOUND)
        kurum_id, err = _require_kurum(request)
        if err:
            return err
        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err
        params = {k: v for k, v in request.query_params.items()}
        data = FinansV2RaporService().build(slug, kurum_id, sube_id, params)
        if data is None:
            return Response({'error': 'Rapor üretilemedi.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(data)


class GelirGiderV2ReportExportView(APIView):
    """
    GET → tek raporu ortak export standardıyla PDF/Excel/CSV/JSON dışa aktar.
    /finans/api/gelir-gider/v2/rapor/<slug>/export/?format=pdf|xlsx|csv|json
    """

    _KPI_TL = {'tl'}

    def get(self, request, slug):
        if slug not in SLUGS:
            return Response({'error': 'Geçersiz rapor.'}, status=status.HTTP_404_NOT_FOUND)
        kurum_id, err = _require_kurum(request)
        if err:
            return err
        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        params = {k: v for k, v in request.query_params.items()}
        data = FinansV2RaporService().build(slug, kurum_id, sube_id, params)
        if data is None:
            return Response({'error': 'Rapor üretilemedi.'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.finans.application.export.export_service import ExportService
        from apps.finans.interfaces.views.expansion_views import _enrich_filters_meta

        # NOT: 'format' query paramı DRF içerik müzakeresine takılır; 'fmt' kullanılır.
        fmt = (request.query_params.get('fmt') or request.query_params.get('bicim') or 'pdf').lower()
        if fmt not in ExportService.SUPPORTED_FORMATS:
            return Response({'error': f'Desteklenmeyen format: {fmt}'}, status=400)

        columns = data.get('columns') or []
        rows = data.get('rows') or []
        title = data.get('baslik') or 'Finans Raporu'

        # KPI kartlarını ortak özet kutularına dönüştür
        summary_chips = []
        for kpi in (data.get('kpis') or []):
            val = kpi.get('value')
            if kpi.get('format') in self._KPI_TL and isinstance(val, (int, float)):
                val = f'{val:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.') + ' TL'
            summary_chips.append({'label': kpi.get('label'), 'value': val})

        meta = {
            'kurum_id': kurum_id,
            'sube_id': sube_id,
            'report_kind': f'gelir_gider_{slug.replace("-", "_")}',
            'rapor_adi': title,
            'summary_chips': summary_chips,
            'adet': len(rows),
        }
        for fk in ('baslangic', 'bitis', 'modul', 'gorunum', 'vade_durumu'):
            if params.get(fk):
                meta[fk] = params[fk]
        if data.get('ozet'):
            meta['report_totals'] = data['ozet']
        if request.user.is_authenticated:
            meta['raporu_olusturan'] = (
                request.user.get_full_name() or request.user.username
            )
        meta = _enrich_filters_meta(meta, kurum_id)

        orientation = ExportService._normalize_orientation(
            request.query_params.get('orientation'),
        )
        try:
            result = ExportService.build(
                fmt, rows, columns,
                title=title, filters_meta=meta, orientation=orientation,
            )
        except (ValueError, RuntimeError) as exc:
            return Response({'error': str(exc)}, status=400)

        if isinstance(result, dict):
            return Response(result)
        return result


def _tl_str(v):
    try:
        return f'{float(v):,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    except (TypeError, ValueError):
        return '0,00'


def _tr_date(iso):
    if not iso:
        return ''
    try:
        from datetime import date, datetime
        d = datetime.fromisoformat(str(iso))
        return d.strftime('%d.%m.%Y')
    except ValueError:
        return str(iso)


_LISTE_FILTER_KEYS = (
    'arama', 'durum', 'cari_hesap_id', 'gelir_kategorisi_id', 'gider_kategorisi_id',
    'gelir_kaynagi_id', 'maliyet_merkezi_id', 'proje_id', 'odeme_yontemi_id',
    'olusturan_id', 'etiket_id', 'belge_no', 'baslangic', 'bitis',
    'tutar_min', 'tutar_max', 'kdv_var', 'kdv_orani', 'tahsil_durumu', 'odeme_durumu',
)


class GelirGiderV2ListExportView(APIView):
    """
    GET → Gelir/Gider LİSTESİNİ (aktif filtrelerle) kurumsal PDF/Excel/CSV şablonuyla dışa aktarır.
    /finans/api/gelir-gider/v2/liste-export/?modul=gider&fmt=pdf&<filtreler>
    """

    def get(self, request):
        kurum_id, err = _require_kurum(request)
        if err:
            return err
        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        from apps.finans.application.export.export_service import ExportService
        from apps.finans.interfaces.views.expansion_views import _enrich_filters_meta
        from apps.finans.application.gelir_v2.gelir_query_service import GelirQueryService
        from apps.finans.application.gider_v2.gider_query_service import GiderQueryService

        modul = (request.query_params.get('modul') or 'gelir').lower()
        is_gider = modul == 'gider'
        fmt = (request.query_params.get('fmt') or request.query_params.get('bicim') or 'pdf').lower()
        if fmt not in ExportService.SUPPORTED_FORMATS:
            return Response({'error': f'Desteklenmeyen format: {fmt}'}, status=400)

        filters = {k: request.query_params.get(k) for k in _LISTE_FILTER_KEYS
                   if request.query_params.get(k) not in (None, '')}
        svc = GiderQueryService() if is_gider else GelirQueryService()
        data = svc.list_paginated(
            kurum_id, sube_id, filters=filters,
            sort=request.query_params.get('sort'),
            page=1, page_size=100000,
        )
        items = data.get('results', [])

        odenen_key = 'odenen_toplam' if is_gider else 'tahsil_edilen'
        kategori_key = 'gider_kategorisi' if is_gider else 'gelir_kategorisi'
        ikinci_key = 'maliyet_merkezi' if is_gider else 'gelir_kaynagi'
        odenen_label = 'Ödenen' if is_gider else 'Tahsil Edilen'
        ikinci_label = 'Maliyet Merkezi' if is_gider else 'Gelir Kaynağı'

        columns = [
            {'key': 'fatura_no', 'label': 'Belge No'},
            {'key': 'fatura_tarihi', 'label': 'Tarih'},
            {'key': 'cari', 'label': 'Cari'},
            {'key': 'kategori', 'label': 'Kategori'},
            {'key': 'ikinci', 'label': ikinci_label},
            {'key': 'proje', 'label': 'Proje'},
            {'key': 'net_tutar', 'label': 'Net Tutar', 'format': 'tl'},
            {'key': 'kdv_tutar', 'label': 'KDV', 'format': 'tl'},
            {'key': 'odenen', 'label': odenen_label, 'format': 'tl'},
            {'key': 'kalan', 'label': 'Kalan', 'format': 'tl'},
            {'key': 'durum', 'label': 'Durum'},
        ]

        rows = []
        toplam_net = toplam_odenen = toplam_kalan = 0.0
        for it in items:
            net = float(it.get('net_tutar') or 0)
            odenen = float(it.get(odenen_key) or 0)
            kalan = float(it.get('kalan_tutar') or 0)
            toplam_net += net
            toplam_odenen += odenen
            toplam_kalan += kalan
            rows.append({
                'fatura_no': it.get('fatura_no') or 'Belgesiz',
                'fatura_tarihi': _tr_date(it.get('fatura_tarihi')),
                'cari': (it.get('cari_hesap') or {}).get('unvan') or '—',
                'kategori': (it.get(kategori_key) or {}).get('ad') or '—',
                'ikinci': (it.get(ikinci_key) or {}).get('ad') or '—',
                'proje': (it.get('proje') or {}).get('ad') or '—',
                'net_tutar': net,
                'kdv_tutar': float(it.get('kdv_tutar') or 0),
                'odenen': odenen,
                'kalan': kalan,
                'durum': it.get('durum_label') or it.get('durum') or '',
            })

        title = 'Gider Listesi' if is_gider else 'Gelir Listesi'
        summary_chips = [
            {'label': 'Kayıt Sayısı', 'value': str(len(rows))},
            {'label': 'Toplam Net', 'value': _tl_str(toplam_net) + ' TL'},
            {'label': odenen_label, 'value': _tl_str(toplam_odenen) + ' TL'},
            {'label': 'Toplam Kalan', 'value': _tl_str(toplam_kalan) + ' TL'},
        ]
        meta = {
            'kurum_id': kurum_id,
            'sube_id': sube_id,
            'report_kind': f'gelir_gider_liste_{modul}',
            'rapor_adi': title,
            'summary_chips': summary_chips,
            'adet': len(rows),
        }
        for fk in ('baslangic', 'bitis'):
            if filters.get(fk):
                meta[fk] = filters[fk]
        if request.user.is_authenticated:
            meta['raporu_olusturan'] = request.user.get_full_name() or request.user.username
        meta = _enrich_filters_meta(meta, kurum_id)

        orientation = ExportService._normalize_orientation(
            request.query_params.get('orientation') or 'landscape',
        )
        try:
            result = ExportService.build(
                fmt, rows, columns, title=title, filters_meta=meta, orientation=orientation,
            )
        except (ValueError, RuntimeError) as exc:
            return Response({'error': str(exc)}, status=400)
        if isinstance(result, dict):
            return Response(result)
        return result


class GelirGiderV2YetkilerView(APIView):
    def get(self, request):
        return Response(cari_effective_permissions(request.user))


class GelirGiderV2LogView(APIView):
    """GET → finans işlem (audit) logu."""

    def get(self, request):
        kurum_id, err = _require_kurum(request)
        if err:
            return err
        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err
        data = FinansAuditService.list(
            kurum_id,
            sube_id=sube_id,
            modul=request.query_params.get('modul'),
            kayit_tip=request.query_params.get('kayit_tip'),
            kayit_id=request.query_params.get('kayit_id'),
            limit=int(request.query_params.get('limit', 200)),
        )
        return Response({'results': data, 'count': len(data)})


class GelirGiderV2DropdownView(APIView):
    """
    GET → form/filtre için gerekli tüm seçenekler.
    ?modul=gelir|gider ile cari filtresi ve kategori seti belirlenir.
    """

    def get(self, request):
        kurum_id, err = _require_kurum(request)
        if err:
            return err
        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        modul = request.query_params.get('modul', 'gelir')

        # Cari hesaplar — yeteneğe göre filtrele
        cari_qs = CariHesap.objects.filter(kurum_id=kurum_id, sube_id=sube_id, aktif_mi=True)
        if modul == 'gider':
            uygun = [CariHesapTuru.TEDARIKCI, CariHesapTuru.KARMA,
                     CariHesapTuru.GIDER_HESABI, CariHesapTuru.DIGER]
        else:
            uygun = [CariHesapTuru.MUSTERI, CariHesapTuru.KARMA,
                     CariHesapTuru.GELIR_HESABI, CariHesapTuru.DIGER]
        cari_qs = cari_qs.filter(hesap_turu__in=uygun).order_by('unvan')
        cari_qs = cari_qs.prefetch_related('gelir_kategorileri', 'gider_kategorileri')
        cariler = [
            {
                'id': c.id,
                'unvan': c.unvan,
                'hesap_turu': c.hesap_turu,
                'gelir_kategorileri': list(c.gelir_kategorileri.values_list('id', flat=True)),
                'gider_kategorileri': list(c.gider_kategorileri.values_list('id', flat=True)),
            }
            for c in cari_qs[:1000]
        ]

        def _tanim(qs):
            return [{'id': o.id, 'ad': o.ad} for o in qs]

        from django.db.models import Q
        from apps.finans.application.odeme_yontemi_plan_helpers import (
            dedupe_odeme_yontemleri_for_plan,
            ensure_kurum_plan_odeme_yontemleri,
        )

        sube_filter = Q(sube_id=sube_id) | Q(sube__isnull=True)

        # Form/filtre «Ödeme Şekli»: tip başına tek kanal (plan).
        # Aksi halde plan kanonikleri + her mali hesabın yöntemleri üst üste biner.
        ensure_kurum_plan_odeme_yontemleri(int(kurum_id))
        oy_qs = OdemeYontemi.objects.filter(
            kurum_id=kurum_id,
            aktif_mi=True,
            silindi_mi=False,
        ).filter(
            Q(mali_hesap__sube_id=sube_id) | Q(mali_hesap__isnull=True),
        )
        odeme_yontemleri_plan = dedupe_odeme_yontemleri_for_plan(oy_qs)

        # Operasyonel ödeme (ödeme drawer): şube mali hesaplarına bağlı yöntemler + çek/senet
        odeme_yontemleri_operasyon = [
            {
                'id': o.id,
                'ad': o.ad,
                'tip': o.tip,
                'mali_hesap_id': o.mali_hesap_id,
            }
            for o in oy_qs.filter(
                Q(mali_hesap__sube_id=sube_id)
                | Q(mali_hesap__isnull=True, tip__in=['cek', 'senet']),
            ).order_by('siralama', 'ad', 'id')
        ]

        payload = {
            'cariler': cariler,
            'odeme_yontemleri': odeme_yontemleri_plan,
            'odeme_yontemleri_operasyon': odeme_yontemleri_operasyon,
            'mali_hesaplar': [
                {'id': m.id, 'ad': m.ad, 'tip': m.tip}
                for m in MaliHesap.objects.filter(
                    sube_id=sube_id, aktif_mi=True, silindi_mi=False,
                ).order_by('ad')
            ],
            'projeler': _tanim(
                Proje.objects.filter(kurum_id=kurum_id, aktif_mi=True).filter(sube_filter).order_by('ad')
            ),
            'etiketler': [
                {'id': e.id, 'ad': e.ad, 'renk': e.renk}
                for e in CariEtiket.objects.filter(kurum_id=kurum_id).filter(sube_filter).order_by('ad')
            ],
            'kdv_oranlari': [{'value': v, 'label': lbl} for v, lbl in KdvOrani.CHOICES],
            'kdv_modlari': [
                {'value': 'haric', 'label': 'KDV Hariç'},
                {'value': 'dahil', 'label': 'KDV Dahil'},
                {'value': 'muaf', 'label': 'KDV Muaf'},
            ],
            'masraf_turleri': [
                {
                    'id': mt.id, 'ad': mt.ad, 'odeme_tipi': mt.odeme_tipi,
                    'kesinti_turu': mt.kesinti_turu,
                    'varsayilan_tutar': str(mt.varsayilan_tutar),
                }
                for mt in MasrafTuru.objects.filter(
                    kurum_id=kurum_id, aktif_mi=True,
                ).filter(sube_filter).order_by('siralama', 'ad')
            ],
            'aciklama_sablonlari': [
                {'id': s.id, 'ad': s.ad, 'icerik': s.icerik}
                for s in AciklamaSablonu.objects.filter(
                    kurum_id=kurum_id, aktif_mi=True
                ).filter(sube_filter).filter(
                    Q(kapsam=modul) | Q(kapsam='genel')
                ).order_by('ad')
            ],
        }

        if modul == 'gider':
            payload['kategoriler'] = [
                {'id': k.id, 'ad': k.ad, 'parent_id': k.parent_id}
                for k in GiderKategorisi.objects.filter(
                    kurum_id=kurum_id, sube_id=sube_id, aktif_mi=True).order_by('ad')
            ]
            payload['maliyet_merkezleri'] = _tanim(
                MaliyetMerkezi.objects.filter(kurum_id=kurum_id, aktif_mi=True).filter(sube_filter).order_by('ad')
            )
            payload['durumlar'] = [{'value': v, 'label': lbl} for v, lbl in GiderDurum.CHOICES]
        else:
            payload['kategoriler'] = [
                {'id': k.id, 'ad': k.ad, 'parent_id': k.parent_id}
                for k in GelirKategorisi.objects.filter(
                    kurum_id=kurum_id, sube_id=sube_id, aktif_mi=True).order_by('ad')
            ]
            payload['gelir_kaynaklari'] = _tanim(
                GelirKaynagi.objects.filter(kurum_id=kurum_id, aktif_mi=True).filter(sube_filter).order_by('ad')
            )
            payload['durumlar'] = [{'value': v, 'label': lbl} for v, lbl in GelirDurum.CHOICES]

        return Response(payload)
