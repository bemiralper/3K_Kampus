"""Sohbet sağ panelinin çekirdek bilgileri.

Öğrenci/veli kimliği, sınıf-şube, koç, veli listesi ve iletişim kanalları.
Ödeme, risk, sınav ve ödev özetleri bilinçli olarak kapsam dışı — bu uç
sohbet ekranı açılırken çağrıldığı için tek sorgu bütçesiyle sınırlı tutuldu.
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response

from apps.communication.application.coach_scope import user_can_access_conversation
from apps.communication.infrastructure.repository import ConversationRepository
from apps.communication.interfaces.sube_context import assert_conversation_sube_access
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from apps.communication.interfaces.views.base import CommunicationAPIView


def _full_name(obj, *, ad='ad', soyad='soyad') -> str:
    if obj is None:
        return ''
    return f'{getattr(obj, ad, "") or ""} {getattr(obj, soyad, "") or ""}'.strip()


def _photo_url(obj) -> str | None:
    foto = getattr(obj, 'profil_foto', None)
    if not foto:
        return None
    if isinstance(foto, str):
        return foto or None
    try:
        return foto.url
    except Exception:
        return None


def _latest_kayit(ogrenci):
    """Öğrencinin en güncel yıllık kaydı — sınıf ve seviye buradan gelir."""
    if ogrenci is None:
        return None
    try:
        return (
            ogrenci.kayitlar.select_related('sinif', 'sinif_seviyesi', 'sube', 'egitim_yili')
            .order_by('-egitim_yili_id', '-id')
            .first()
        )
    except Exception:
        return None


def _coach_for_student(ogrenci):
    """Öğrenciye atanmış aktif koç."""
    if ogrenci is None:
        return None
    try:
        from apps.coaching.models import CoachStudentAssignment

        assignment = (
            CoachStudentAssignment.objects.filter(student_id=ogrenci.id, end_date__isnull=True)
            .select_related('coach', 'coach__teacher')
            .order_by('-is_primary', '-start_date')
            .first()
        )
        return assignment.coach if assignment else None
    except Exception:
        return None


class ConversationContextView(CommunicationAPIView):
    """GET /conversations/<id>/context/ — sağ panelin veri kaynağı."""

    def get(self, request, conversation_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        conversation = ConversationRepository.get_by_id(kurum_id, conversation_id, sube_id=sube_id)
        if not conversation:
            return Response({'error': 'Sohbet bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        gate = assert_conversation_sube_access(request, kurum_id, conversation)
        if gate:
            return gate
        if not user_can_access_conversation(request.user, conversation):
            return Response(
                {'error': 'Bu sohbete erişim yetkiniz yok.'}, status=status.HTTP_403_FORBIDDEN,
            )

        ogrenci = conversation.ogrenci
        if ogrenci is None and conversation.veli_id:
            ogrenci = getattr(conversation.veli, 'ogrenci', None)

        payload = {
            'conversation_id': str(conversation.id),
            'contact': self._contact(conversation),
            'ogrenci': self._student(ogrenci),
            'veliler': self._parents(ogrenci),
            'sorumlu': self._owner(conversation),
            'kanal': {
                'account_name': getattr(conversation.channel_config, 'name', '') or '',
                'display_phone': getattr(conversation.channel_config, 'display_phone', '') or '',
                'department': conversation.department,
            },
        }
        return Response(payload)

    def _contact(self, conversation) -> dict:
        from apps.communication.application.conversation_display import (
            resolve_conversation_display_name,
        )

        return {
            'name': resolve_conversation_display_name(conversation, allow_live_lookup=True),
            'phone': conversation.contact_phone,
            'type': conversation.contact_type,
        }

    def _student(self, ogrenci) -> dict | None:
        if ogrenci is None:
            return None
        kayit = _latest_kayit(ogrenci)
        sinif = getattr(kayit, 'sinif', None) if kayit else None
        seviye = getattr(kayit, 'sinif_seviyesi', None) if kayit else None
        sube = getattr(kayit, 'sube', None) if kayit else getattr(ogrenci, 'sube', None)
        coach = _coach_for_student(ogrenci)
        return {
            'id': ogrenci.id,
            'ad_soyad': _full_name(ogrenci),
            'profil_foto': _photo_url(ogrenci),
            'telefon': getattr(ogrenci, 'telefon', '') or '',
            'email': getattr(ogrenci, 'email', '') or '',
            'aktif': bool(getattr(ogrenci, 'aktif_mi', True)),
            'kayit_turu': getattr(ogrenci, 'kayit_turu', '') or '',
            'sinif': getattr(sinif, 'ad', '') or '',
            'sinif_seviyesi': getattr(seviye, 'ad', '') or '',
            'sube': getattr(sube, 'ad', '') or '',
            'egitim_yili': str(getattr(kayit, 'egitim_yili', '') or '') if kayit else '',
            'koc': _full_name(getattr(coach, 'teacher', None)) if coach else '',
            'koc_id': getattr(coach, 'id', None) if coach else None,
        }

    def _parents(self, ogrenci) -> list:
        if ogrenci is None:
            return []
        try:
            veliler = ogrenci.veliler.all()[:5]
        except Exception:
            return []
        return [
            {
                'id': v.id,
                'ad_soyad': _full_name(v),
                'yakinlik': v.get_veli_turu_display() if hasattr(v, 'get_veli_turu_display') else '',
                'telefon': getattr(v, 'telefon', '') or '',
                'email': getattr(v, 'email', '') or '',
            }
            for v in veliler
        ]

    def _owner(self, conversation) -> dict:
        """Sohbetin sorumlusu — üstlenen kullanıcı, yoksa atanmış koç."""
        claimed = conversation.claimed_by_user
        coach = conversation.assigned_coach
        return {
            'claimed_by_id': conversation.claimed_by_user_id,
            'claimed_by_name': (
                (claimed.get_full_name() or claimed.username).strip() if claimed else ''
            ),
            'assigned_coach_id': conversation.assigned_coach_id,
            'assigned_coach_name': _full_name(getattr(coach, 'teacher', None)) if coach else '',
        }
