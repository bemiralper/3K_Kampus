"""
Finansman Tanımları — API view'ları.

Tüm tanım tipleri (gelir kaynağı, maliyet/gider merkezi, proje, açıklama şablonu,
etiket) tek bir jenerik view tabanı üzerinden CRUD + toggle sunar.
Endpoint kökü: /finans/api/tanimlar/...
"""
from rest_framework import status
from rest_framework.response import Response

from apps.finans.application.cari_v2.etiket_service import CariEtiketService
from apps.finans.application.tanimlar.tanim_service import (
    AciklamaSablonuService,
    GelirKaynagiService,
    MaliyetMerkeziService,
    MasrafTuruService,
    ProjeService,
)
from apps.finans.interfaces.views.base import FinansAPIView as APIView
from apps.finans.interfaces.views.sube_context import (
    assert_record_sube_access,
    resolve_mandatory_finans_sube,
)


def _require_kurum(request, *, from_body=False):
    src = request.data if from_body else request.query_params
    kurum_id = src.get('kurum_id')
    if not kurum_id:
        return None, Response(
            {'error': 'kurum_id parametresi zorunludur.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return kurum_id, None


class _TanimListCreateView(APIView):
    """Jenerik liste + oluştur."""

    service_class = None
    extra_query_keys: tuple = ()

    def get(self, request):
        kurum_id, err = _require_kurum(request)
        if err:
            return err
        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        aktif = request.query_params.get('aktif_mi')
        aktif_mi = None
        if aktif in ('true', '1'):
            aktif_mi = True
        elif aktif in ('false', '0'):
            aktif_mi = False

        extra = {k: request.query_params.get(k) for k in self.extra_query_keys
                 if request.query_params.get(k) not in (None, '')}

        data = self.service_class().list(
            kurum_id, sube_id,
            aktif_mi=aktif_mi,
            arama=request.query_params.get('arama'),
            **extra,
        )
        return Response({'results': data, 'count': len(data)})

    def post(self, request):
        kurum_id, err = _require_kurum(request, from_body=True)
        if err:
            return err
        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        payload = dict(request.data)
        # sube_id gövdede yoksa aktif şubeye bağla (kurum-geneli için sube_id=None gönderilir)
        if 'sube_id' not in payload:
            payload['sube_id'] = sube_id

        obj, errors = self.service_class().create(kurum_id, payload, sube_id=sube_id)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.service_class().serialize(obj), status=status.HTTP_201_CREATED)


class _TanimDetailView(APIView):
    """Jenerik güncelle + sil."""

    service_class = None

    def _gate(self, request, pk):
        svc = self.service_class()
        kurum_id = request.query_params.get('kurum_id') or request.data.get('kurum_id')
        if not kurum_id:
            return None, None, Response(
                {'error': 'kurum_id parametresi zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        obj = svc.get(pk, kurum_id)
        if not obj:
            return None, None, Response(
                {'detail': 'Tanım bulunamadı.'}, status=status.HTTP_404_NOT_FOUND,
            )
        err = assert_record_sube_access(
            request, obj.kurum_id, obj.sube_id, allow_null_sube=True,
        )
        if err:
            return None, None, err
        return svc, obj, None

    def get(self, request, pk):
        svc, obj, err = self._gate(request, pk)
        if err:
            return err
        return Response(svc.serialize(obj))

    def put(self, request, pk):
        svc, obj, err = self._gate(request, pk)
        if err:
            return err
        kurum_id = request.data.get('kurum_id') or request.query_params.get('kurum_id')
        updated, errors = svc.update(pk, kurum_id, dict(request.data))
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(svc.serialize(updated))

    patch = put

    def delete(self, request, pk):
        svc, obj, err = self._gate(request, pk)
        if err:
            return err
        kurum_id = request.query_params.get('kurum_id') or request.data.get('kurum_id')
        ok, errors = svc.delete(pk, kurum_id)
        if not ok:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)


class _TanimToggleView(APIView):
    service_class = None

    def post(self, request, pk):
        kurum_id = request.data.get('kurum_id') or request.query_params.get('kurum_id')
        if not kurum_id:
            return Response(
                {'error': 'kurum_id parametresi zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        svc = self.service_class()
        obj = svc.get(pk, kurum_id)
        if not obj:
            return Response({'detail': 'Tanım bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        err = assert_record_sube_access(
            request, obj.kurum_id, obj.sube_id, allow_null_sube=True,
        )
        if err:
            return err
        updated, errors = svc.toggle(pk, kurum_id)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(svc.serialize(updated))


# ─── Gelir Kaynağı ────────────────────────────────
class GelirKaynagiListCreateView(_TanimListCreateView):
    service_class = GelirKaynagiService


class GelirKaynagiDetailView(_TanimDetailView):
    service_class = GelirKaynagiService


class GelirKaynagiToggleView(_TanimToggleView):
    service_class = GelirKaynagiService


# ─── Maliyet / Gider Merkezi ──────────────────────
class MaliyetMerkeziListCreateView(_TanimListCreateView):
    service_class = MaliyetMerkeziService
    extra_query_keys = ('tip',)


class MaliyetMerkeziDetailView(_TanimDetailView):
    service_class = MaliyetMerkeziService


class MaliyetMerkeziToggleView(_TanimToggleView):
    service_class = MaliyetMerkeziService


# ─── Proje ────────────────────────────────────────
class ProjeListCreateView(_TanimListCreateView):
    service_class = ProjeService
    extra_query_keys = ('durum',)


class ProjeDetailView(_TanimDetailView):
    service_class = ProjeService


class ProjeToggleView(_TanimToggleView):
    service_class = ProjeService


# ─── Açıklama Şablonu ─────────────────────────────
class AciklamaSablonuListCreateView(_TanimListCreateView):
    service_class = AciklamaSablonuService
    extra_query_keys = ('kapsam',)


class AciklamaSablonuDetailView(_TanimDetailView):
    service_class = AciklamaSablonuService


class AciklamaSablonuToggleView(_TanimToggleView):
    service_class = AciklamaSablonuService


# ─── Masraf Türü ──────────────────────────────────
class MasrafTuruListCreateView(_TanimListCreateView):
    service_class = MasrafTuruService
    extra_query_keys = ('odeme_tipi',)


class MasrafTuruDetailView(_TanimDetailView):
    service_class = MasrafTuruService


class MasrafTuruToggleView(_TanimToggleView):
    service_class = MasrafTuruService


# ─── Etiketler (ortak finans etiket havuzu — CariEtiket) ──
class FinansEtiketListCreateView(APIView):
    """Tüm finans modülleri için ortak etiket havuzu (CariEtiket)."""

    def get(self, request):
        kurum_id, err = _require_kurum(request)
        if err:
            return err
        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err
        data = CariEtiketService().list(kurum_id, sube_id)
        return Response({'results': data, 'count': len(data)})

    def post(self, request):
        kurum_id, err = _require_kurum(request, from_body=True)
        if err:
            return err
        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err
        etiket, errors = CariEtiketService().create(
            kurum_id,
            ad=request.data.get('ad'),
            renk=request.data.get('renk', '#0262a7'),
            sube_id=sube_id if request.data.get('sube_id') != '' else None,
        )
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            'id': etiket.id, 'ad': etiket.ad, 'renk': etiket.renk,
            'sube_id': etiket.sube_id,
        }, status=status.HTTP_201_CREATED)
