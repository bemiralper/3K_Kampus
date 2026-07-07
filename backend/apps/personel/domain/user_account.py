"""Personel giriş hesabı çözümleme — kurum genelinde tekil User."""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db.models import Q

from apps.kimlik.domain.phone import normalize_phone
from apps.personel.domain.models import Personel

User = get_user_model()


def _same_person_identity(a: Personel, b: Personel) -> bool:
    """Aynı gerçek kişi mi (çift personel kaydı senaryosu)."""
    if a.kisi_id and b.kisi_id and a.kisi_id == b.kisi_id:
        return True
    if a.tc_kimlik_no and b.tc_kimlik_no and a.tc_kimlik_no == b.tc_kimlik_no:
        return True
    if (
        a.ad.strip().lower() == b.ad.strip().lower()
        and a.soyad.strip().lower() == b.soyad.strip().lower()
    ):
        pa = normalize_phone(a.cep_telefon or a.telefon or '')
        pb = normalize_phone(b.cep_telefon or b.telefon or '')
        if pa and pb and pa == pb:
            return True
        ea = (a.email or '').strip().lower()
        eb = (b.email or '').strip().lower()
        if ea and eb and ea == eb:
            return True
    return False


def _find_sibling_with_user(personel: Personel) -> Personel | None:
    """Aynı kurumda aynı kişiye ait user bağlı personel kaydı."""
    base = Personel.objects.filter(
        kurum_id=personel.kurum_id,
        user__isnull=False,
    ).exclude(pk=personel.pk).select_related('user', 'sube')

    if personel.tc_kimlik_no:
        match = base.filter(tc_kimlik_no=personel.tc_kimlik_no).first()
        if match:
            return match

    if personel.kisi_id:
        match = base.filter(kisi_id=personel.kisi_id).first()
        if match:
            return match

    if personel.email:
        email = personel.email.strip()
        match = base.filter(email__iexact=email).first()
        if match:
            return match

    phone = normalize_phone(personel.cep_telefon or personel.telefon or '')
    if phone:
        for candidate in base.filter(
            ad__iexact=personel.ad.strip(),
            soyad__iexact=personel.soyad.strip(),
        )[:20]:
            cp = normalize_phone(candidate.cep_telefon or candidate.telefon or '')
            if cp == phone:
                return candidate

    return None


def resolve_personel_user(personel: Personel, *, heal_link: bool = False) -> User | None:
    """
    Personelin sisteme giriş User kaydını döndürür.

    Öncelik: doğrudan FK → aynı kişinin diğer personel kaydı → username/e-posta eşleşmesi.
    heal_link yalnızca User başka personelde kullanılmıyorsa FK yazar (OneToOne güvenliği).
    """
    if not personel:
        return None

    if personel.user_id:
        return personel.user

    sibling = _find_sibling_with_user(personel)
    if sibling and sibling.user:
        return sibling.user

    candidates: list[str] = []
    if personel.tc_kimlik_no:
        candidates.append(personel.tc_kimlik_no)
    if personel.email:
        candidates.append(personel.email.strip())

    for username in candidates:
        user = User.objects.filter(Q(username=username) | Q(username__iexact=username)).first()
        if not user and personel.email:
            user = User.objects.filter(email__iexact=personel.email.strip()).first()
        if not user:
            continue

        owner = Personel.objects.filter(user=user).select_related('sube').first()
        if owner and owner.id != personel.id:
            if _same_person_identity(personel, owner):
                return user
            continue

        if heal_link and not owner:
            personel.user = user
            personel.save(update_fields=['user_id'])

        return user

    return None


def personel_user_account_meta(personel: Personel, *, heal_link: bool = False) -> dict:
    """Detay API: hesap durumu + paylaşımlı kaynak bilgisi."""
    user = resolve_personel_user(personel, heal_link=heal_link)
    owner = Personel.objects.filter(user=user).select_related('sube').first() if user else None
    shared = bool(user and owner and owner.id != personel.id)
    return {
        'user': user,
        'has_user_account': user is not None,
        'user_account_shared': shared,
        'user_account_owner_personel_id': owner.id if shared and owner else None,
        'user_account_owner_sube_ad': owner.sube.ad if shared and owner and owner.sube else None,
    }
