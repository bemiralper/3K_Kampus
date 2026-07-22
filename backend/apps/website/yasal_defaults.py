"""Yasal metin varsayılanları — seed ve bootstrap tarafından paylaşılır."""
from __future__ import annotations

from apps.kurum.domain.models import Kurum
from apps.website.models import YasalMetin

YASAL_METIN_DEFAULTS: dict[str, tuple[str, str]] = {
    'kvkk': (
        'KVKK Aydınlatma Metni',
        '<h2>Kişisel Verilerin Korunması</h2>'
        '<p>Bu metin örnek bir KVKK aydınlatma metnidir. Kurumunuza özel metni buraya yapıştırın '
        'veya hukuki danışmanınızdan aldığınız metinle değiştirin.</p>'
        '<p><strong>Veri sorumlusu:</strong> Kurum unvanı · <strong>İletişim:</strong> info@3kkampus.com</p>'
        '<ul><li>İşlenen veriler: kimlik, iletişim, eğitim bilgileri</li>'
        '<li>Amaç: eğitim hizmeti sunumu ve veli bilgilendirme</li>'
        '<li>Haklarınız: erişim, düzeltme, silme, itiraz</li></ul>',
    ),
    'gizlilik': (
        'Gizlilik Politikası',
        '<h2>Gizlilik Politikası</h2>'
        '<p>Web sitemizi ziyaret ettiğinizde toplanan bilgiler, hizmet kalitesini artırmak '
        've yasal yükümlülükleri yerine getirmek amacıyla kullanılır. '
        'Bu metni kurum politikalarınızla güncelleyin.</p>',
    ),
    'kullanim': (
        'Kullanım Koşulları',
        '<h2>Kullanım Koşulları</h2>'
        '<p>Siteye erişerek bu koşulları kabul etmiş sayılırsınız. İçeriklerin izinsiz kopyalanması yasaktır. '
        'Örnek metindir — kendi koşullarınızla değiştirin.</p>',
    ),
    'cerez': (
        'Çerez Politikası',
        '<h2>Çerez Politikası</h2>'
        '<p>Sitemiz, deneyimi iyileştirmek için zorunlu ve analitik çerezler kullanabilir. '
        'GA4 / reklam çerezlerini Entegrasyonlar üzerinden yönetebilirsiniz. Bu metni güncelleyin.</p>',
    ),
}


def ensure_yasal_metinler(kurum: Kurum) -> int:
    """Eksik yasal metin kayıtlarını oluşturur; mevcut içeriği ezmez."""
    created = 0
    for tur, (baslik, icerik) in YASAL_METIN_DEFAULTS.items():
        _, was_created = YasalMetin.objects.get_or_create(
            kurum=kurum,
            tur=tur,
            defaults={'baslik': baslik, 'icerik': icerik, 'aktif': True},
        )
        if was_created:
            created += 1
    return created
