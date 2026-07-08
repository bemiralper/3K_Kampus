"""
Toplu gecikmiş ödeme hatırlatması — önizleme ve kuyruk (Faz 2).
Aynı öğrencide birden fazla gecikmiş taksit tek mesajda birleştirilir.
"""
from __future__ import annotations

from collections import defaultdict

from apps.communication.application.integration_hooks import (
    SOURCE_ODEME,
    already_sent,
    recently_sent_within_hours,
    send_text_to_veli,
)
from apps.finans.application.overdue_messaging import (
    CATEGORY_ODEME_GECIKME,
    build_consolidated_overdue_context,
    render_overdue_message,
)
from apps.odeme_takip.domain.models import Taksit


class OverdueReminderService:
    """Öğrenci bazlı birleşik gecikme hatırlatması."""

    @classmethod
    def _group_by_ogrenci(cls, taksitler: list[Taksit]) -> dict[int, list[Taksit]]:
        groups: dict[int, list[Taksit]] = defaultdict(list)
        for t in taksitler:
            ogrenci_id = t.sozlesme.ogrenci_id or 0
            groups[ogrenci_id].append(t)
        return groups

    @classmethod
    def _veli_options(cls, ogrenci) -> list[dict]:
        from apps.ogrenci.application.veli_contact import effective_veli_phone
        from apps.ogrenci.domain.models import OgrenciVeli

        if not ogrenci:
            return []

        options: list[dict] = []
        for veli in OgrenciVeli.objects.filter(ogrenci=ogrenci).order_by('-varsayilan', '-id'):
            phone = effective_veli_phone(veli, ogrenci)
            options.append({
                'id': veli.id,
                'ad': veli.tam_ad,
                'telefon': phone or None,
                'varsayilan': bool(veli.varsayilan),
                'veli_turu': veli.get_veli_turu_display() if hasattr(veli, 'get_veli_turu_display') else '',
            })
        return options

    @classmethod
    def _resolve_veli(cls, ogrenci, taksitler: list[Taksit], veli_id: int | None):
        from apps.ogrenci.domain.models import OgrenciVeli

        if veli_id and ogrenci:
            veli = OgrenciVeli.objects.filter(id=veli_id, ogrenci=ogrenci).first()
            if veli:
                return veli

        for t in taksitler:
            if t.sozlesme.veli_id:
                return t.sozlesme.veli

        options = cls._veli_options(ogrenci)
        if options:
            match = next((o for o in options if o.get('varsayilan')), options[0])
            return OgrenciVeli.objects.filter(id=match['id']).first()
        return None

    @classmethod
    def _group_toplam(cls, taksitler: list[Taksit]) -> int:
        return sum(int(t.kalan_tutar or t.tutar or 0) for t in taksitler)

    @classmethod
    def _source_id(cls, ogrenci_id: int, taksit_ids: list[int]) -> str:
        ids = '-'.join(str(i) for i in sorted(taksit_ids))
        return f'ogrenci-{ogrenci_id}-overdue-{ids}'

    @classmethod
    def _parse_veli_selections(cls, raw) -> dict[int, int]:
        if not isinstance(raw, dict):
            return {}
        out: dict[int, int] = {}
        for k, v in raw.items():
            try:
                out[int(k)] = int(v)
            except (TypeError, ValueError):
                continue
        return out

    @classmethod
    def preview(
        cls,
        kurum_id: int,
        taksit_ids: list[int],
        *,
        template: str | None = None,
        veli_selections: dict | None = None,
        sube_id: int | None = None,
    ) -> dict:
        taksit_qs = Taksit.objects.filter(
            id__in=taksit_ids,
            sozlesme__kurum_id=kurum_id,
        )
        # Tenant güvenliği: aktif şube dışındaki taksitlere hatırlatma
        # gönderilmesini engelle (başka şubenin taksit ID'leri sızmasın).
        if sube_id is not None:
            taksit_qs = taksit_qs.filter(sozlesme__sube_id=sube_id)
        taksitler = list(
            taksit_qs.select_related(
                'sozlesme__ogrenci',
                'sozlesme__veli',
                'sozlesme__kurum',
            )
        )
        template_text = (template or '').strip() or None
        veli_map = cls._parse_veli_selections(veli_selections)

        recipients = []
        for ogrenci_id, group in sorted(
            cls._group_by_ogrenci(taksitler).items(),
            key=lambda item: (item[0] or 0),
        ):
            ogrenci = group[0].sozlesme.ogrenci if group else None
            selected_veli_id = veli_map.get(ogrenci_id)
            veli = cls._resolve_veli(ogrenci, group, selected_veli_id)
            veli_id = veli.id if veli else None
            toplam = cls._group_toplam(group)
            tids = sorted(t.id for t in group)

            ctx = build_consolidated_overdue_context(group, veli=veli, toplam_gecikmis=toplam)
            skip_reason = None
            telefon = None
            if not veli:
                skip_reason = 'Veli tanımlı değil'
            else:
                from apps.ogrenci.application.veli_contact import effective_veli_phone
                telefon = (effective_veli_phone(veli, ogrenci) or '').strip() or None
                if not telefon:
                    skip_reason = 'Telefon numarası yok'

            source_id = cls._source_id(ogrenci_id, tids)
            already_24h = False
            if veli_id:
                already_24h = (
                    already_sent(kurum_id, SOURCE_ODEME, source_id, veli_id=veli_id)
                    or recently_sent_within_hours(
                        kurum_id, SOURCE_ODEME, source_id, veli_id=veli_id, hours=24,
                    )
                )

            body = render_overdue_message(kurum_id, ctx, template_body=template_text)
            available_veliler = cls._veli_options(ogrenci)

            recipients.append({
                'group_key': str(ogrenci_id),
                'ogrenci_id': ogrenci_id or None,
                'taksit_ids': tids,
                'taksit_id': tids[0] if len(tids) == 1 else None,
                'veli_id': veli_id,
                'veli_adi': ctx.get('veli_ad') or '—',
                'ogrenci_adi': ctx.get('ogrenci_ad') or '—',
                'telefon': telefon,
                'rendered_body': body,
                'skip_reason': skip_reason,
                'already_sent_24h': already_24h,
                'available_veliler': available_veliler,
                'taksit_sayisi': len(group),
                'toplam_gecikmis_tutar': toplam,
            })

        sendable = [r for r in recipients if not r['skip_reason'] and not r['already_sent_24h']]
        skipped = len(recipients) - len(sendable)

        return {
            'recipients': recipients,
            'template': template_text or '',
            'sendable_count': len(sendable),
            'skipped_count': skipped,
        }

    @classmethod
    def send_bulk(
        cls,
        kurum_id: int,
        taksit_ids: list[int],
        *,
        template: str | None = None,
        force_resend: bool = False,
        sent_by_user_id: int | None = None,
        veli_selections: dict | None = None,
        sube_id: int | None = None,
    ) -> dict:
        preview = cls.preview(
            kurum_id,
            taksit_ids,
            template=template,
            veli_selections=veli_selections,
            sube_id=sube_id,
        )
        sent = 0
        skipped = 0
        errors: list[str] = []
        results = []

        for item in preview['recipients']:
            taksit_ids_group = item.get('taksit_ids') or []
            veli_adi = item['veli_adi']
            ogrenci_adi = item.get('ogrenci_adi') or '—'
            base = {
                'taksit_ids': taksit_ids_group,
                'taksit_id': item.get('taksit_id') or (taksit_ids_group[0] if taksit_ids_group else None),
                'veli_adi': veli_adi,
                'ogrenci_adi': ogrenci_adi,
            }

            if item.get('skip_reason'):
                skipped += 1
                results.append({**base, 'status': 'skipped', 'message': item['skip_reason']})
                continue

            if item.get('already_sent_24h') and not force_resend:
                skipped += 1
                msg = 'Son 24 saat içinde hatırlatma gönderildi'
                results.append({**base, 'status': 'skipped', 'message': msg})
                continue

            ogrenci_id = item.get('ogrenci_id') or 0
            source_id = cls._source_id(ogrenci_id, taksit_ids_group)
            veli_id = item['veli_id']

            if not force_resend and veli_id:
                if already_sent(kurum_id, SOURCE_ODEME, source_id, veli_id=veli_id):
                    skipped += 1
                    results.append({**base, 'status': 'skipped', 'message': 'Hatırlatma zaten gönderildi'})
                    continue

            result = send_text_to_veli(
                kurum_id,
                item['veli_id'],
                item['rendered_body'],
                CATEGORY_ODEME_GECIKME,
                SOURCE_ODEME,
                source_id,
                sent_by_user_id=sent_by_user_id,
            )
            if result and result.success:
                sent += 1
                results.append({**base, 'status': 'sent'})
            else:
                err = (result.errors[0] if result and result.errors else 'Gönderilemedi')
                label = taksit_ids_group[0] if taksit_ids_group else '?'
                errors.append(f'Öğrenci {ogrenci_adi} (taksit {label}): {err}')
                skipped += 1
                results.append({**base, 'status': 'error', 'message': err})

        return {
            'sent': sent,
            'skipped': skipped,
            'errors': errors,
            'results': results,
        }
