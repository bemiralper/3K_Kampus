"""
Bildirim olayı katalogu.

Her LMS modülü mesaj gönderirken bir olay anahtarı (`odev.plan` gibi) kullanır.
Hangi şablonun kullanılacağı kodda değil, `NotificationTemplateBinding` kayıtlarında
tutulur; bu katalog yalnızca olayın kimliğini, alıcı rollerini, kullanılabilir
değişkenleri ve şablon bağlanmadığındaki varsayılan metni tanımlar.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Mapping

from apps.communication.domain.enums import RecipientType

MODULE_ODEV = 'odev'
MODULE_YOKLAMA = 'yoklama'
MODULE_ODEME = 'odeme'
MODULE_GORUSME = 'gorusme'
MODULE_SINAV = 'sinav'
MODULE_TAKVIM = 'takvim'
MODULE_DEVAMSIZLIK = 'devamsizlik'
MODULE_FINANS = 'finans'
MODULE_DUYURU = 'duyuru'
MODULE_OGRENCI = 'ogrenci'
MODULE_AKADEMIK = 'akademik'

MODULE_LABELS: Mapping[str, str] = MappingProxyType({
    MODULE_ODEV: 'Ödev',
    MODULE_YOKLAMA: 'Yoklama',
    MODULE_ODEME: 'Ödeme',
    MODULE_GORUSME: 'Görüşme',
    MODULE_SINAV: 'Sınav',
    MODULE_TAKVIM: 'Takvim',
    MODULE_DEVAMSIZLIK: 'Devamsızlık',
    MODULE_FINANS: 'Finans',
    MODULE_DUYURU: 'Duyuru',
    MODULE_OGRENCI: 'Öğrenci',
    MODULE_AKADEMIK: 'Akademik',
})

COMMON_VARIABLES = ('kurum_ad', 'sube', 'sinif')


@dataclass(frozen=True)
class NotificationEvent:
    """Şablon bağlanabilir tek bir bildirim olayı."""

    key: str
    module: str
    label: str
    recipients: tuple[str, ...]
    opt_in_category: str
    variables: tuple[str, ...]
    meta_name_base: str
    default_bodies: Mapping[str, str]
    has_document: bool = False
    # IMAGE header Meta şablonu + runtime görsel eki (doğum günü vb.)
    has_image: bool = False
    description: str = ''
    # True ise Bildirim Şablonları UI/katalogundan gizlenir; dispatch/hook çalışmaya devam eder.
    hidden_in_ui: bool = False
    legacy_meta_names: Mapping[str, tuple[str, ...]] = field(
        default_factory=lambda: MappingProxyType({}),
    )

    @property
    def module_label(self) -> str:
        return MODULE_LABELS.get(self.module, self.module)

    def suggested_meta_name(self, recipient_type: str) -> str:
        return f'{self.meta_name_base}_{(recipient_type or "").lower()}'

    def meta_name_candidates(self, recipient_type: str) -> tuple[str, ...]:
        """Otomatik keşif için aranacak Meta şablon adları (öncelik sırasıyla)."""
        names = [self.suggested_meta_name(recipient_type)]
        names.extend(self.legacy_meta_names.get(recipient_type, ()))
        return tuple(dict.fromkeys(n for n in names if n))

    def default_body(self, recipient_type: str) -> str:
        return self.default_bodies.get(recipient_type) or self.default_bodies.get('*', '')

    def supports(self, recipient_type: str) -> bool:
        return recipient_type in self.recipients

    def all_variables(self) -> tuple[str, ...]:
        return tuple(dict.fromkeys((*self.variables, *COMMON_VARIABLES)))


VELI = RecipientType.VELI
OGRENCI = RecipientType.OGRENCI
PERSONEL = RecipientType.PERSONEL


NOTIFICATION_EVENTS: tuple[NotificationEvent, ...] = (
    NotificationEvent(
        key='odev.plan',
        module=MODULE_ODEV,
        label='Haftalık ödev planı (PDF)',
        description='Haftalık ödev planı PDF olarak veliye/öğrenciye gönderilir.',
        recipients=(VELI, OGRENCI),
        opt_in_category='duyuru',
        has_document=True,
        variables=('ogrenci_ad', 'veli_ad', 'hafta', 'hafta_no', 'teslim_tarihi', 'pdf_baslik'),
        meta_name_base='odev_plani',
        legacy_meta_names=MappingProxyType({
            VELI: ('haftalik_odev_plani_veli',),
            OGRENCI: ('haftalik_odev_plani_ogrenci',),
        }),
        default_bodies=MappingProxyType({
            VELI: '{{ogrenci_ad}} — Ödev planı ektedir.',
            OGRENCI: 'Ödev planı ektedir.',
        }),
    ),
    NotificationEvent(
        key='odev.rapor',
        module=MODULE_ODEV,
        label='Ödev kontrol raporu (PDF)',
        description='Haftalık ödev kontrol raporu PDF olarak gönderilir.',
        recipients=(VELI, OGRENCI),
        opt_in_category='duyuru',
        has_document=True,
        variables=('ogrenci_ad', 'veli_ad', 'hafta', 'hafta_no', 'pdf_baslik'),
        meta_name_base='odev_raporu',
        legacy_meta_names=MappingProxyType({
            VELI: ('haftalik_odev_raporu_veli',),
            OGRENCI: ('haftalik_odev_raporu_ogrenci',),
        }),
        default_bodies=MappingProxyType({
            VELI: '{{ogrenci_ad}} — Ödev kontrol raporu ektedir.',
            OGRENCI: 'Ödev kontrol raporu ektedir.',
        }),
    ),
    NotificationEvent(
        key='odev.atama',
        module=MODULE_ODEV,
        label='Yeni ödev atandı',
        recipients=(VELI,),
        opt_in_category='duyuru',
        variables=('ogrenci_ad', 'veli_ad', 'odev_baslik', 'teslim_tarihi'),
        meta_name_base='odev_atama',
        default_bodies=MappingProxyType({
            VELI: (
                'Sayın velimiz, {{ogrenci_ad}} için yeni ödev atandı: {{odev_baslik}}. '
                'Teslim tarihi: {{teslim_tarihi}}. Bilgilerinize sunarız.'
            ),
        }),
    ),
    NotificationEvent(
        key='yoklama.gelmedi',
        module=MODULE_YOKLAMA,
        label='Yoklama — gelmedi',
        description=(
            'Kütüphane / yoklama sisteminden “gelmedi” bildirimi. '
            'Canlı devamsızlık WhatsApp mesajları bu olay üzerinden gider.'
        ),
        recipients=(VELI,),
        opt_in_category='devamsizlik',
        variables=(
            'ogrenci_ad', 'veli_ad', 'tarih', 'saat',
            'yoklama_tarihi', 'oturum_ad', 'giris_saati', 'cikis_saati',
            'salon_ad', 'ders_no',
        ),
        meta_name_base='yoklama_gelmedi',
        default_bodies=MappingProxyType({
            VELI: (
                'Sayın velimiz, {{ogrenci_ad}} {{tarih}} tarihinde kuruma gelmemiştir. '
                'Bilgilerinize sunarız.'
            ),
        }),
    ),
    NotificationEvent(
        key='yoklama.gec',
        module=MODULE_YOKLAMA,
        label='Yoklama — geç kalma',
        description='Kütüphane / yoklama sisteminden geç giriş bildirimi.',
        recipients=(VELI,),
        opt_in_category='devamsizlik',
        variables=(
            'ogrenci_ad', 'veli_ad', 'tarih', 'saat',
            'yoklama_tarihi', 'oturum_ad', 'giris_saati', 'cikis_saati',
            'salon_ad', 'ders_no',
        ),
        meta_name_base='yoklama_gec',
        default_bodies=MappingProxyType({
            VELI: (
                'Sayın velimiz, {{ogrenci_ad}} {{tarih}} tarihinde kuruma {{saat}} '
                'saatinde geç giriş yapmıştır.'
            ),
        }),
    ),
    NotificationEvent(
        key='yoklama.cikis',
        module=MODULE_YOKLAMA,
        label='Yoklama — çıkış',
        description='Kütüphane / yoklama sisteminden çıkış bildirimi.',
        recipients=(VELI,),
        opt_in_category='devamsizlik',
        variables=(
            'ogrenci_ad', 'veli_ad', 'tarih', 'saat',
            'yoklama_tarihi', 'oturum_ad', 'giris_saati', 'cikis_saati',
            'salon_ad', 'ders_no',
        ),
        meta_name_base='yoklama_cikis',
        default_bodies=MappingProxyType({
            VELI: (
                'Sayın velimiz, {{ogrenci_ad}} {{tarih}} tarihinde {{saat}} saatinde '
                'kurumdan çıkış yapmıştır.'
            ),
        }),
    ),
    NotificationEvent(
        key='odeme.hatirlatma',
        module=MODULE_ODEME,
        label='Ödeme hatırlatma',
        description=(
            'Vadesi yaklaşan taksit hatırlatması (cron / manuel). '
            'Muhasebe WhatsApp hattı üzerinden veliye gider.'
        ),
        recipients=(VELI,),
        opt_in_category='odeme',
        variables=(
            'ogrenci_ad', 'veli_ad', 'taksit_no', 'vade_tarihi',
            'kalan_tutar', 'taksit_tutar', 'sozlesme_no',
        ),
        meta_name_base='odeme_hatirlatma',
        default_bodies=MappingProxyType({
            VELI: (
                'Sayın {{veli_ad}}, {{ogrenci_ad}} öğrencisi için {{taksit_no}}. '
                'taksit ödemesinin vadesi {{vade_tarihi}} tarihidir. '
                'Kalan tutar {{kalan_tutar}} TL. Sözleşme no: {{sozlesme_no}}. '
                'Bilgilerinize sunarız.'
            ),
        }),
    ),
    NotificationEvent(
        key='odeme.gecikme',
        module=MODULE_ODEME,
        label='Ödeme gecikme',
        description=(
            'Gecikmiş taksit bildirimi (tekil veya toplu). '
            'Meta gövdesinde çok satırlı taksit listesi kullanılmaz; '
            'özet tutar alanları tercih edilir.'
        ),
        recipients=(VELI,),
        opt_in_category='odeme',
        variables=(
            'ogrenci_ad', 'veli_ad', 'taksit_no', 'vade_tarihi', 'kalan_tutar',
            'taksit_tutar', 'gecikme_gunu', 'toplam_gecikmis_tutar', 'sozlesme_no',
            'taksit_detay_listesi', 'taksit_sayisi', 'max_gecikme_gunu',
        ),
        meta_name_base='odeme_gecikme',
        default_bodies=MappingProxyType({
            VELI: (
                'Sayın {{veli_ad}}, {{ogrenci_ad}} için gecikmiş taksit ödemesi '
                'bulunmaktadır (taksit: {{taksit_no}}). Gecikme {{gecikme_gunu}} gündür. '
                'Kalan tutar {{kalan_tutar}} TL, toplam gecikmiş tutar '
                '{{toplam_gecikmis_tutar}} TL. Sözleşme no: {{sozlesme_no}}. '
                'Lütfen en kısa sürede ödeme yapınız.'
            ),
        }),
    ),
    NotificationEvent(
        key='odeme.plan',
        module=MODULE_ODEME,
        label='Ödeme planı (PDF)',
        description='Ödeme planı PDF olarak gönderilir (DOCUMENT header Meta şablonu gerekir).',
        recipients=(VELI, OGRENCI),
        opt_in_category='genel',
        has_document=True,
        variables=('ogrenci_ad', 'veli_ad', 'sozlesme_no', 'pdf_baslik'),
        meta_name_base='odeme_plani',
        default_bodies=MappingProxyType({
            VELI: (
                'Sayın {{veli_ad}}, {{ogrenci_ad}} için ödeme planı ektedir. '
                'Sözleşme no: {{sozlesme_no}}. İyi günler dileriz.'
            ),
            OGRENCI: (
                'Merhaba {{ogrenci_ad}}, ödeme planı ektedir. '
                'Sözleşme no: {{sozlesme_no}}. İyi günler dileriz.'
            ),
        }),
    ),
    NotificationEvent(
        key='odeme.makbuz',
        module=MODULE_ODEME,
        label='Tahsilat makbuzu (PDF)',
        description='Tahsilat makbuzu PDF olarak gönderilir (DOCUMENT header Meta şablonu gerekir).',
        recipients=(VELI, OGRENCI),
        opt_in_category='genel',
        has_document=True,
        variables=('ogrenci_ad', 'veli_ad', 'sozlesme_no', 'pdf_baslik'),
        meta_name_base='odeme_makbuzu',
        default_bodies=MappingProxyType({
            VELI: (
                'Sayın {{veli_ad}}, {{ogrenci_ad}} için tahsilat makbuzu ektedir. '
                'Sözleşme no: {{sozlesme_no}}. İyi günler dileriz.'
            ),
            OGRENCI: (
                'Merhaba {{ogrenci_ad}}, tahsilat makbuzu ektedir. '
                'Sözleşme no: {{sozlesme_no}}. İyi günler dileriz.'
            ),
        }),
    ),
    NotificationEvent(
        key='odeme.sozlesme',
        module=MODULE_ODEME,
        label='Sözleşme belgesi (PDF)',
        description='Sözleşme PDF olarak gönderilir (DOCUMENT header Meta şablonu gerekir).',
        recipients=(VELI, OGRENCI),
        opt_in_category='genel',
        has_document=True,
        variables=('ogrenci_ad', 'veli_ad', 'sozlesme_no', 'pdf_baslik'),
        meta_name_base='odeme_sozlesmesi',
        default_bodies=MappingProxyType({
            VELI: (
                'Sayın {{veli_ad}}, {{ogrenci_ad}} için sözleşme belgesi ektedir. '
                'Sözleşme no: {{sozlesme_no}}. İyi günler dileriz.'
            ),
            OGRENCI: (
                'Merhaba {{ogrenci_ad}}, sözleşme belgesi ektedir. '
                'Sözleşme no: {{sozlesme_no}}. İyi günler dileriz.'
            ),
        }),
    ),
    NotificationEvent(
        key='gorusme.hatirlatma',
        module=MODULE_GORUSME,
        label='Görüşme hatırlatma',
        recipients=(VELI, OGRENCI),
        opt_in_category='duyuru',
        variables=('ogrenci_ad', 'veli_ad', 'koc_ad', 'tarih', 'saat', 'konu'),
        meta_name_base='gorusme_hatirlatma',
        default_bodies=MappingProxyType({
            VELI: (
                'Sayın velimiz, {{ogrenci_ad}} için {{tarih}} {{saat}} tarihinde '
                '{{koc_ad}} ile planlanmış görüşme bulunmaktadır. Konu: {{konu}}.'
            ),
            OGRENCI: (
                'Merhaba {{ogrenci_ad}}, {{tarih}} {{saat}} tarihinde {{koc_ad}} ile '
                'görüşmeniz planlandı. Konu: {{konu}}.'
            ),
        }),
    ),
    NotificationEvent(
        key='sinav.sonuc',
        module=MODULE_SINAV,
        label='Sınav sonucu yayınlandı',
        recipients=(VELI,),
        opt_in_category='duyuru',
        variables=('ogrenci_ad', 'veli_ad', 'sinav_ad'),
        meta_name_base='sinav_sonuc',
        default_bodies=MappingProxyType({
            VELI: (
                'Sayın velimiz, "{{sinav_ad}}" sınav sonuçları yayınlandı. '
                'Öğrencinizin sonuçlarını panelden görüntüleyebilirsiniz.'
            ),
        }),
    ),
    NotificationEvent(
        key='takvim.etkinlik',
        module=MODULE_TAKVIM,
        label='Takvim etkinliği bildirimi',
        recipients=(VELI, OGRENCI),
        opt_in_category='duyuru',
        variables=('ogrenci_ad', 'veli_ad', 'baslik', 'tarih', 'saat', 'aciklama'),
        meta_name_base='takvim_etkinlik',
        default_bodies=MappingProxyType({
            '*': 'Sayın velimiz, {{baslik}} etkinliği {{tarih}} tarihindedir. {{aciklama}}',
        }),
    ),
    NotificationEvent(
        key='akademik.sinif_programi',
        module=MODULE_AKADEMIK,
        label='Sınıf ders programı (PDF)',
        description=(
            'Ders Programı ekranından seçilen sınıfların haftalık programı '
            'PDF olarak veliye ve öğrenciye gönderilir (DOCUMENT header Meta şablonu gerekir).'
        ),
        recipients=(VELI, OGRENCI),
        opt_in_category='duyuru',
        has_document=True,
        variables=('ogrenci_ad', 'veli_ad', 'sinif', 'donem', 'pdf_baslik'),
        meta_name_base='sinif_programi',
        default_bodies=MappingProxyType({
            VELI: '{{ogrenci_ad}} ({{sinif}}) ders programı ektedir.',
            OGRENCI: '{{sinif}} ders programın ektedir.',
        }),
    ),
    NotificationEvent(
        key='devamsizlik.bildirim',
        module=MODULE_DEVAMSIZLIK,
        label='Devamsızlık bildirimi',
        description=(
            'Legacy / kullanılmayan olay. Canlı sistem Yoklama (gelmedi/geç/çıkış) '
            'olaylarını kullanır; bu kayıt UI’da gizlidir.'
        ),
        recipients=(VELI,),
        opt_in_category='devamsizlik',
        variables=('ogrenci_ad', 'veli_ad', 'tarih', 'aciklama'),
        meta_name_base='devamsizlik_bildirim',
        hidden_in_ui=True,
        default_bodies=MappingProxyType({
            VELI: (
                'Sayın velimiz, {{ogrenci_ad}} {{tarih}} tarihinde devamsızlık kaydı '
                'oluşturulmuştur. Bilgilerinize sunarız.'
            ),
        }),
    ),
    NotificationEvent(
        key='finans.gun_sonu',
        module=MODULE_FINANS,
        label='Gün sonu raporu (PDF)',
        description=(
            'Gün sonu finansal özet raporu mali hesap yetkilisine gönderilir '
            '(DOCUMENT header Meta şablonu gerekir).'
        ),
        recipients=(PERSONEL,),
        opt_in_category='genel',
        has_document=True,
        variables=('personel_ad', 'tarih', 'toplam_tahsilat', 'toplam_gider', 'pdf_baslik'),
        meta_name_base='gun_sonu_raporu',
        default_bodies=MappingProxyType({
            PERSONEL: (
                'Merhaba {{personel_ad}}, {{tarih}} tarihli gün sonu raporu ektedir. '
                'Toplam tahsilat {{toplam_tahsilat}} TL, toplam gider {{toplam_gider}} TL. '
                'Detay PDF ekindedir.'
            ),
        }),
    ),
    NotificationEvent(
        key='duyuru.genel',
        module=MODULE_DUYURU,
        label='Genel duyuru',
        recipients=(VELI, OGRENCI, PERSONEL),
        opt_in_category='duyuru',
        variables=('ogrenci_ad', 'veli_ad', 'personel_ad', 'baslik', 'mesaj'),
        meta_name_base='genel_duyuru',
        default_bodies=MappingProxyType({
            '*': '{{mesaj}}',
        }),
    ),
    NotificationEvent(
        key='ogrenci.dogum_gunu',
        module=MODULE_OGRENCI,
        label='Doğum günü kutlaması',
        description=(
            'Her gece 00:01’de doğum günü olan aktif öğrenciye WhatsApp ile '
            'görsel + mesaj gönderilir. Görseller Doğum Günü havuzundan seçilir.'
        ),
        recipients=(OGRENCI,),
        opt_in_category='duyuru',
        has_image=True,
        variables=('ogrenci_ad', 'yas', 'kurum_ad', 'sube', 'sinif'),
        meta_name_base='dogum_gunu',
        legacy_meta_names=MappingProxyType({
            OGRENCI: ('dogum_gunu_ogrenci', 'birthday_student'),
        }),
        default_bodies=MappingProxyType({
            OGRENCI: (
                'Merhaba {{ogrenci_ad}}, doğum günün kutlu olsun! '
                '{{yas}}. yaşın sağlık ve başarı getirsin.'
            ),
        }),
    ),
)


_VAR_TOKEN_RE = re.compile(r'\{\{\s*\w+\s*\}\}')

_EXAMPLE_PREFIXES: Mapping[str, str] = MappingProxyType({
    VELI: 'Sayın velimiz, ',
    OGRENCI: 'Merhaba, ',
    PERSONEL: 'Bilgilendirme: ',
})

_EXAMPLE_SUFFIX = ' Bilgilerinize sunarız.'


def build_meta_example_body(event: NotificationEvent, recipient_type: str) -> str:
    """
    Meta şablon taslağı için kurallara uygun örnek gövde.

    Meta gövdenin değişkenle başlamasına veya bitmesine izin vermez; katalogdaki
    varsayılan metin bu kurallara uymuyorsa sabit metinle tamamlanır.
    """
    body = (event.default_body(recipient_type) or '').strip()
    if not body:
        return ''
    if _VAR_TOKEN_RE.match(body):
        body = _EXAMPLE_PREFIXES.get(recipient_type, 'Bilgilendirme: ') + body
    matches = list(_VAR_TOKEN_RE.finditer(body))
    if matches and matches[-1].end() == len(body):
        body += _EXAMPLE_SUFFIX
    return body


_EVENTS_BY_KEY: Mapping[str, NotificationEvent] = MappingProxyType(
    {event.key: event for event in NOTIFICATION_EVENTS},
)


def get_event(event_key: str) -> NotificationEvent | None:
    return _EVENTS_BY_KEY.get(event_key)


def require_event(event_key: str) -> NotificationEvent:
    event = _EVENTS_BY_KEY.get(event_key)
    if event is None:
        raise KeyError(f'Bilinmeyen bildirim olayı: {event_key}')
    return event


def event_keys() -> tuple[str, ...]:
    return tuple(_EVENTS_BY_KEY)


def events_by_module() -> dict[str, list[NotificationEvent]]:
    grouped: dict[str, list[NotificationEvent]] = {}
    for event in NOTIFICATION_EVENTS:
        grouped.setdefault(event.module, []).append(event)
    return grouped
