"""Görev analitik servisi — yönetici performans takibi."""
from datetime import datetime
from typing import Optional

from django.contrib.auth.models import User
from django.utils import timezone

from apps.gorev.domain.enums import GorevDurum
from apps.gorev.domain.models import GorevAtama
from apps.personel.domain.models import Personel
from apps.roller.models import UserRole


ACTIVE_DURUMLAR = [
    GorevDurum.BEKLIYOR,
    GorevDurum.BASLADI,
    GorevDurum.DEVAM_EDIYOR,
]


class GorevAnalyticsService:
    def get_analitik(
        self,
        kurum_id: int,
        baslangic: Optional[datetime] = None,
        bitis: Optional[datetime] = None,
        rol_kodu: str = '',
    ) -> dict:
        qs = GorevAtama.objects.filter(
            gorev__kurum_id=kurum_id,
            gorev__is_deleted=False,
        ).select_related('gorev', 'gorev__gorev_tipi')

        if baslangic:
            qs = qs.filter(gorev__son_tarih__gte=baslangic)
        if bitis:
            qs = qs.filter(gorev__son_tarih__lte=bitis)

        if rol_kodu:
            user_ids = list(
                UserRole.objects.filter(role__code=rol_kodu)
                .values_list('user_id', flat=True)
            )
            qs = qs.filter(atanan_user_id__in=user_ids)

        atamalar = list(qs)
        now = timezone.now()

        tamamlanan_list = [a for a in atamalar if a.durum == GorevDurum.TAMAMLANDI]
        geciken_list = [
            a for a in atamalar
            if a.durum not in (GorevDurum.TAMAMLANDI, GorevDurum.IPTAL)
            and a.gorev.son_tarih < now
        ]
        hic_acilmayan = [
            a for a in atamalar
            if a.ilk_acilma_at is None
            and a.durum in ACTIVE_DURUMLAR
        ]
        devam_eden = [
            a for a in atamalar
            if a.durum in ACTIVE_DURUMLAR
        ]

        tamamlama_saatleri = []
        for a in tamamlanan_list:
            if a.tamamlanma_at and a.baslama_at:
                delta = a.tamamlanma_at - a.baslama_at
                tamamlama_saatleri.append(delta.total_seconds() / 3600)
            elif a.tamamlanma_at:
                delta = a.tamamlanma_at - a.created_at
                tamamlama_saatleri.append(delta.total_seconds() / 3600)

        ortalama_saat = (
            round(sum(tamamlama_saatleri) / len(tamamlama_saatleri), 1)
            if tamamlama_saatleri else 0
        )

        user_ids = {a.atanan_user_id for a in atamalar}
        personel_map = {
            p.user_id: p.tam_ad
            for p in Personel.objects.filter(kurum_id=kurum_id, user_id__in=user_ids)
        }
        rol_map = {
            ur.user_id: ur.role.code
            for ur in UserRole.objects.filter(user_id__in=user_ids).select_related('role')
        }
        user_map = {
            u.id: f'{u.first_name} {u.last_name}'.strip() or u.username
            for u in User.objects.filter(id__in=user_ids)
        }

        def display_name(uid):
            return personel_map.get(uid) or user_map.get(uid) or f'Kullanıcı #{uid}'

        by_user: dict[int, dict] = {}
        for a in atamalar:
            uid = a.atanan_user_id
            if uid not in by_user:
                by_user[uid] = {
                    'user_id': uid,
                    'ad': display_name(uid),
                    'rol': rol_map.get(uid, ''),
                    'toplam': 0,
                    'tamamlanan': 0,
                    'geciken': 0,
                    'hic_acilmayan': 0,
                    'tamamlama_saatleri': [],
                }
            entry = by_user[uid]
            entry['toplam'] += 1
            if a.durum == GorevDurum.TAMAMLANDI:
                entry['tamamlanan'] += 1
                if a.tamamlanma_at and a.baslama_at:
                    entry['tamamlama_saatleri'].append(
                        (a.tamamlanma_at - a.baslama_at).total_seconds() / 3600
                    )
            if (
                a.durum not in (GorevDurum.TAMAMLANDI, GorevDurum.IPTAL)
                and a.gorev.son_tarih < now
            ):
                entry['geciken'] += 1
            if a.ilk_acilma_at is None and a.durum in ACTIVE_DURUMLAR:
                entry['hic_acilmayan'] += 1

        personel_performans = []
        for entry in by_user.values():
            saatler = entry.pop('tamamlama_saatleri')
            entry['ortalama_tamamlama_saat'] = (
                round(sum(saatler) / len(saatler), 1) if saatler else 0
            )
            entry['tamamlama_orani'] = (
                round(entry['tamamlanan'] / entry['toplam'] * 100, 1)
                if entry['toplam'] else 0
            )
            personel_performans.append(entry)

        personel_performans.sort(key=lambda x: (-x['geciken'], -x['toplam']))
        en_cok_geciken = sorted(personel_performans, key=lambda x: -x['geciken'])[:10]

        rol_stats: dict[str, dict] = {}
        for p in personel_performans:
            rol = p['rol'] or 'diger'
            if rol not in rol_stats:
                rol_stats[rol] = {'rol': rol, 'toplam': 0, 'tamamlanan': 0, 'geciken': 0}
            rol_stats[rol]['toplam'] += p['toplam']
            rol_stats[rol]['tamamlanan'] += p['tamamlanan']
            rol_stats[rol]['geciken'] += p['geciken']

        son_gorevler = []
        for a in sorted(atamalar, key=lambda x: x.updated_at, reverse=True)[:20]:
            g = a.gorev
            son_gorevler.append({
                'atama_id': str(a.id),
                'baslik': g.baslik,
                'atanan': display_name(a.atanan_user_id),
                'durum': a.durum,
                'gecikti_mi': a.gecikti_mi,
                'ilk_acilma_at': a.ilk_acilma_at.isoformat() if a.ilk_acilma_at else None,
                'tamamlanma_at': a.tamamlanma_at.isoformat() if a.tamamlanma_at else None,
                'son_tarih': g.son_tarih.isoformat() if g.son_tarih else None,
                'gorev_tipi': g.gorev_tipi.ad if g.gorev_tipi_id else '',
            })

        return {
            'ozet': {
                'toplam': len(atamalar),
                'tamamlanan': len(tamamlanan_list),
                'geciken': len(geciken_list),
                'hic_acilmayan': len(hic_acilmayan),
                'devam_eden': len(devam_eden),
                'iptal': len([a for a in atamalar if a.durum == GorevDurum.IPTAL]),
                'ortalama_tamamlama_saat': ortalama_saat,
                'tamamlama_orani': (
                    round(len(tamamlanan_list) / len(atamalar) * 100, 1)
                    if atamalar else 0
                ),
            },
            'personel_performans': personel_performans,
            'en_cok_geciken': en_cok_geciken,
            'rol_kirilimi': list(rol_stats.values()),
            'son_gorevler': son_gorevler,
        }
