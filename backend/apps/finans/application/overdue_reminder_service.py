"""
Toplu gecikmiş ödeme hatırlatması — önizleme ve kuyruk (Faz 2).
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
    build_overdue_context,
    render_overdue_message,
)
from apps.odeme_takip.domain.models import Taksit


class OverdueReminderService:
    """Veli bazlı toplu gecikme hatırlatması."""

    @classmethod
    def _veli_totals(cls, taksitler: list[Taksit]) -> dict[int | None, int]:
        totals: dict[int | None, int] = defaultdict(int)
        for t in taksitler:
            veli_id = t.sozlesme.veli_id
            totals[veli_id] += int(t.kalan_tutar or t.tutar or 0)
        return totals

    @classmethod
    def preview(
        cls,
        kurum_id: int,
        taksit_ids: list[int],
        *,
        template: str | None = None,
    ) -> dict:
        taksitler = list(
            Taksit.objects.filter(
                id__in=taksit_ids,
                sozlesme__kurum_id=kurum_id,
            ).select_related('sozlesme__ogrenci', 'sozlesme__veli', 'sozlesme__kurum')
        )
        veli_totals = cls._veli_totals(taksitler)
        template_text = (template or '').strip() or None

        recipients = []
        for t in sorted(taksitler, key=lambda x: (x.sozlesme.veli_id or 0, x.vade_tarihi)):
            veli = t.sozlesme.veli
            veli_id = veli.id if veli else None
            toplam_veli = veli_totals.get(veli_id, int(t.kalan_tutar or t.tutar or 0))
            ctx = build_overdue_context(t, toplam_gecikmis=toplam_veli)
            if veli:
                ctx['veli_ad'] = veli.tam_ad

            skip_reason = None
            if not veli:
                skip_reason = 'Veli tanımlı değil'
            elif not (veli.telefon or '').strip():
                skip_reason = 'Telefon numarası yok'

            source_id = f'taksit-{t.id}'
            already_24h = False
            if veli_id:
                already_24h = (
                    already_sent(kurum_id, SOURCE_ODEME, source_id, veli_id=veli_id)
                    or recently_sent_within_hours(
                        kurum_id, SOURCE_ODEME, source_id, veli_id=veli_id, hours=24,
                    )
                )

            body = render_overdue_message(
                kurum_id, ctx, template_body=template_text,
            )
            recipients.append({
                'taksit_id': t.id,
                'veli_id': veli_id,
                'veli_adi': ctx.get('veli_ad') or '—',
                'ogrenci_adi': ctx.get('ogrenci_ad') or '—',
                'telefon': (veli.telefon or None) if veli else None,
                'rendered_body': body,
                'skip_reason': skip_reason,
                'already_sent_24h': already_24h,
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
    ) -> dict:
        preview = cls.preview(kurum_id, taksit_ids, template=template)
        sent = 0
        skipped = 0
        errors: list[str] = []
        results = []

        for item in preview['recipients']:
            taksit_id = item['taksit_id']
            veli_adi = item['veli_adi']
            base = {
                'taksit_id': taksit_id,
                'veli_adi': veli_adi,
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

            if not force_resend:
                source_id = f'taksit-{taksit_id}'
                veli_id = item['veli_id']
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
                f'taksit-{taksit_id}',
                sent_by_user_id=sent_by_user_id,
            )
            if result and result.success:
                sent += 1
                results.append({**base, 'status': 'sent'})
            else:
                err = (result.errors[0] if result and result.errors else 'Gönderilemedi')
                errors.append(f'Taksit {taksit_id}: {err}')
                skipped += 1
                results.append({**base, 'status': 'error', 'message': err})

        return {
            'sent': sent,
            'skipped': skipped,
            'errors': errors,
            'results': results,
        }
