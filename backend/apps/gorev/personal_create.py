"""Kişisel görev oluşturma kısıtları — koç / muhasebe."""
PERSONAL_CREATE_ROLES = frozenset({'koc', 'muhasebe'})

PERSONAL_ALLOWED_TIP_KODLARI = frozenset({
    'HATIRLATMA',
    'YAPILACAK',
    'TELEFON',
    'TOPLANTI',
    'KONTROL',
})


def enforce_personal_gorev_create(data: dict, user_id: int, role_code: str, kurum_id: int):
    """Koç/muhasebe yalnızca kendilerine kişisel görev oluşturabilir."""
    if role_code not in PERSONAL_CREATE_ROLES:
        return data

    from apps.gorev.domain.models import GorevTipi
    from apps.gorev.domain.enums import HedefTipi

    data['hedef_tipi'] = HedefTipi.KULLANICI
    data['hedef_user_ids'] = [user_id]
    data['hedef_rol_kodu'] = ''
    data['hedef_grup_id'] = None

    tip_id = data.get('gorev_tipi_id')
    if tip_id:
        tip = GorevTipi.objects.filter(
            id=tip_id, kurum_id=kurum_id, is_deleted=False, is_active=True,
        ).first()
        if not tip or tip.kod not in PERSONAL_ALLOWED_TIP_KODLARI:
            raise ValueError(
                'Yalnızca Hatırlatma, Yapılacak İş, Telefon, Toplantı veya Kontrol tipinde '
                'kişisel görev oluşturabilirsiniz.'
            )

    return data
