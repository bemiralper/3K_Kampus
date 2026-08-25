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
MODULE_KOC = 'koc'
MODULE_OZEL_DERS = 'ozel_ders'

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
    MODULE_KOC: 'Koçluk',
    MODULE_OZEL_DERS: 'Özel Ders',
})

YOKLAMA_GROUP_LABELS: Mapping[str, str] = MappingProxyType({
    'kutuphane': 'Yoklama — Kütüphane',
    'sinif': 'Yoklama — Sınıf',
})


def template_group_for_event(event: 'NotificationEvent | None') -> str:
    """Bildirim olayının yerel şablon grubu anahtarı (`yoklama:kutuphane`, `odeme`)."""
    if event is None:
        return ''
    if event.module == MODULE_YOKLAMA and event.group:
        return f'{MODULE_YOKLAMA}:{event.group}'
    return event.module or ''


def template_group_for_event_key(event_key: str | None) -> str:
    if not event_key:
        return ''
    return template_group_for_event(get_event(event_key))


def template_group_label(group_key: str | None) -> str:
    key = (group_key or '').strip()
    if not key:
        return 'Genel'
    if key.startswith(f'{MODULE_YOKLAMA}:'):
        suffix = key.split(':', 1)[1]
        return YOKLAMA_GROUP_LABELS.get(
            suffix, f'{MODULE_LABELS.get(MODULE_YOKLAMA, MODULE_YOKLAMA)} — {suffix}',
        )
    return MODULE_LABELS.get(key, key)


def list_template_groups() -> list[dict[str, str]]:
    """UI filtreleri için benzersiz şablon grupları."""
    seen: set[str] = set()
    items: list[dict[str, str]] = []
    for event in NOTIFICATION_EVENTS:
        if event.hidden_in_ui:
            continue
        key = template_group_for_event(event)
        if not key or key in seen:
            continue
        seen.add(key)
        items.append({'key': key, 'label': template_group_label(key)})
    return items

COMMON_VARIABLES = ('kurum_ad', 'sube', 'sinif')
KUTUPHANE_ETUT_VARIABLES = (
    'ilk_etut_saati',
    'son_etut_cikis_saati',
)


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
    # Bildirim Şablonları'nda aynı modül altında alt başlık (ör. Yoklama → Kütüphane / Sınıf).
    group: str = ''
    group_label: str = ''
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
        label='Kütüphane — gelmedi',
        group='kutuphane',
        group_label='Kütüphane',
        description='Kütüphane / etüt salonu yoklamasında öğrenci gelmedi bildirimi (veli).',
        recipients=(VELI, OGRENCI),
        opt_in_category='devamsizlik',
        variables=(
            'ogrenci_ad', 'veli_ad', 'tarih', 'saat',
            'yoklama_tarihi', 'oturum_ad', 'giris_saati', 'cikis_saati',
            'salon_ad', 'ders_no', *KUTUPHANE_ETUT_VARIABLES,
        ),
        meta_name_base='yoklama_gelmedi',
        legacy_meta_names=MappingProxyType({
            VELI: (
                'yoklama_devamsizlik_veli',
                'kutuphane_yoklama_veli_gelmedi',
            ),
        }),
        default_bodies=MappingProxyType({
            VELI: (
                'Sayın {{veli_ad}}, {{ogrenci_ad}} bugün {{yoklama_tarihi}} tarihinde '
                '{{oturum_ad}} oturumuna {{salon_ad}} salonunda gelmemiştir. '
                '{{kurum_ad}} bilgilerinize sunarız.'
            ),
            OGRENCI: (
                'Merhaba {{ogrenci_ad}}, {{yoklama_tarihi}} tarihinde {{oturum_ad}} '
                'oturumuna gelmedi olarak işlendi. Bilgine sunarız.'
            ),
        }),
    ),
    NotificationEvent(
        key='yoklama.gec',
        module=MODULE_YOKLAMA,
        label='Kütüphane — geç kalma',
        group='kutuphane',
        group_label='Kütüphane',
        description='Kütüphane / etüt salonu yoklamasında geç giriş bildirimi.',
        recipients=(VELI, OGRENCI),
        opt_in_category='devamsizlik',
        variables=(
            'ogrenci_ad', 'veli_ad', 'tarih', 'saat',
            'yoklama_tarihi', 'oturum_ad', 'giris_saati', 'cikis_saati',
            'salon_ad', 'ders_no', *KUTUPHANE_ETUT_VARIABLES,
        ),
        meta_name_base='yoklama_gec',
        legacy_meta_names=MappingProxyType({
            VELI: (
                'kutuphane_yoklama_veli_gec_v2',
                'kutuphane_yoklama_veli_gec',
            ),
        }),
        default_bodies=MappingProxyType({
            VELI: (
                'Sayın {{veli_ad}}, {{ogrenci_ad}} bugün {{oturum_ad}} oturumuna '
                '{{giris_saati}} saatinde geç giriş yapmıştır. '
                '({{salon_ad}} — {{yoklama_tarihi}}) {{kurum_ad}} bilgilerinize sunarız.'
            ),
            OGRENCI: (
                'Merhaba {{ogrenci_ad}}, {{yoklama_tarihi}} tarihinde yoklama kaydın '
                'geç olarak işlendi. Bilgine sunarız.'
            ),
        }),
    ),
    NotificationEvent(
        key='yoklama.cikis',
        module=MODULE_YOKLAMA,
        label='Kütüphane — çıkış',
        group='kutuphane',
        group_label='Kütüphane',
        description='Kütüphane / etüt salonu yoklamasında çıkış bildirimi.',
        recipients=(VELI,),
        opt_in_category='devamsizlik',
        variables=(
            'ogrenci_ad', 'veli_ad', 'tarih', 'saat',
            'yoklama_tarihi', 'oturum_ad', 'giris_saati', 'cikis_saati',
            'salon_ad', 'ders_no', *KUTUPHANE_ETUT_VARIABLES,
        ),
        meta_name_base='yoklama_cikis',
        legacy_meta_names=MappingProxyType({
            VELI: (
                'kutuphane_yoklama_veli_cks',
                'kutuphane_yoklama_veli_cikis',
            ),
        }),
        default_bodies=MappingProxyType({
            VELI: (
                'Sayın {{veli_ad}}, {{ogrenci_ad}} öğrencisi {{oturum_ad}} oturumunda '
                '{{cikis_saati}} saatinde çıkış yapmıştır. '
                '({{salon_ad}}, {{yoklama_tarihi}}) {{kurum_ad}} bilgilerinize sunarız.'
            ),
        }),
    ),
    NotificationEvent(
        key='sinif.yoklama.gelmedi',
        module=MODULE_YOKLAMA,
        label='Sınıf — gelmedi',
        group='sinif',
        group_label='Sınıf',
        description='Sınıf ders / günlük yoklamasında öğrenci gelmedi bildirimi.',
        recipients=(VELI, OGRENCI),
        opt_in_category='devamsizlik',
        variables=('ogrenci_ad', 'veli_ad', 'tarih', 'saat', 'sinif', 'oturum_ad', 'giris_saati'),
        meta_name_base='sinif_yoklama_gelmedi',
        legacy_meta_names=MappingProxyType({
            VELI: (
                'gunluk_ders_yoklama_veli',
                'gunluk_ders_yoklama_veli_gelmedi',
                'sinif_yoklama_gelmedi',
            ),
            OGRENCI: ('sinif_yoklama_gelmedi',),
        }),
        default_bodies=MappingProxyType({
            VELI: (
                '*Değerli Velimiz,*\n'
                'Öğrencimiz {{ogrenci_ad}}’ın {{tarih}} tarihinde gerçekleştirilen '
                '{{sinif}} sınıfı derslerine katılım sağlamadığı ve yoklama durumunun '
                '*“Gelmedi” *olarak sisteme kaydedildiği bilgilerinize sunarız.\n'
                'Öğrencimizin ders devamlılığını düzenli şekilde sürdürmesini önemle rica ederiz.'
            ),
            OGRENCI: (
                'Merhaba {{ogrenci_ad}}, {{tarih}} tarihinde {{sinif}} sınıfı '
                'yoklamasında gelmedi olarak işlendi. Bilgine sunarız.'
            ),
        }),
    ),
    NotificationEvent(
        key='sinif.yoklama.gec',
        module=MODULE_YOKLAMA,
        label='Sınıf — geç kalma',
        group='sinif',
        group_label='Sınıf',
        description='Sınıf ders / günlük yoklamasında geç giriş bildirimi.',
        recipients=(VELI, OGRENCI),
        opt_in_category='devamsizlik',
        variables=('ogrenci_ad', 'veli_ad', 'tarih', 'saat', 'sinif', 'oturum_ad', 'giris_saati'),
        meta_name_base='sinif_yoklama_gec',
        legacy_meta_names=MappingProxyType({
            VELI: (
                'gunluk_ders_yoklama_veli_gec',
                'sinif_yoklama_gec',
            ),
            OGRENCI: ('sinif_yoklama_gec',),
        }),
        default_bodies=MappingProxyType({
            VELI: (
                '*Değerli Velimiz,*\n\n'
                'Öğrencimiz {{ogrenci_ad}}’ın {{tarih}} tarihinde gerçekleştirilen '
                '{{sinif}} sınıfı derslerine *{{saat}} itibarıyla katılım sağladığı* '
                've yoklama durumunun *“Geç”* olarak sisteme kaydedildiği bilgilerinize sunarız.\n\n'
                'Öğrencimizin derslere zamanında katılım göstermesini önemle rica ederiz.'
            ),
            OGRENCI: (
                'Merhaba {{ogrenci_ad}}, {{tarih}} tarihinde {{sinif}} sınıfı '
                'yoklamasında geç olarak işlendi. Bilgine sunarız.'
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
        key='sinav.karne',
        module=MODULE_SINAV,
        label='Sınav karnesi (PDF)',
        description=(
            'Ölçme → öğrenci listesinden sınav sonuç belgesi (karne) PDF olarak '
            'veliye ve öğrenciye WhatsApp ile gönderilir '
            '(DOCUMENT header Meta şablonu gerekir).'
        ),
        recipients=(VELI, OGRENCI),
        opt_in_category='duyuru',
        has_document=True,
        variables=('ogrenci_ad', 'veli_ad', 'sinav_ad', 'puan', 'net', 'pdf_baslik'),
        meta_name_base='sinav_karne',
        default_bodies=MappingProxyType({
            VELI: (
                'Sayın velimiz, {{ogrenci_ad}} öğrencimizin "{{sinav_ad}}" '
                'sınav sonuç belgesi ektedir. Puan: {{puan}}, net: {{net}}.'
            ),
            OGRENCI: (
                'Merhaba {{ogrenci_ad}}, "{{sinav_ad}}" sınav sonuç belgen ektedir. '
                'Puan: {{puan}}, net: {{net}}.'
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
            'Planlama → Ders Programı ekranından “Programı Bildir” ile seçilen '
            'sınıfların haftalık programı PDF olarak veliye ve öğrenciye gönderilir '
            '(DOCUMENT header Meta şablonu gerekir).'
        ),
        recipients=(VELI, OGRENCI),
        opt_in_category='duyuru',
        has_document=True,
        variables=('ogrenci_ad', 'veli_ad', 'sinif', 'donem', 'pdf_baslik'),
        meta_name_base='sinif_programi',
        default_bodies=MappingProxyType({
            VELI: (
                'Sayın {{veli_ad}},\n\n'
                '{{sube}} şubesinde {{ogrenci_ad}} ({{sinif}}) öğrencimizin '
                '{{donem}} dönemi haftalık ders programı ektedir.\n\n'
                'Bilgilerinize sunarız.'
            ),
            OGRENCI: (
                'Merhaba {{ogrenci_ad}},\n\n'
                '{{sube}} — {{sinif}} sınıfının {{donem}} dönemi haftalık '
                'ders programın ektedir.\n\n'
                'Bilgine sunarız.'
            ),
        }),
    ),
    NotificationEvent(
        key='koc.calisma_programi',
        module=MODULE_KOC,
        label='Haftalık çalışma programı (PDF)',
        description=(
            'Koç çalışma programı çıktısı PDF olarak veliye ve öğrenciye '
            'WhatsApp ile gönderilir (DOCUMENT header Meta şablonu gerekir).'
        ),
        recipients=(VELI, OGRENCI),
        opt_in_category='duyuru',
        has_document=True,
        variables=('ogrenci_ad', 'veli_ad', 'hafta', 'koc_ad', 'pdf_baslik'),
        meta_name_base='calisma_programi',
        default_bodies=MappingProxyType({
            VELI: (
                'Sayın {{veli_ad}},\n\n'
                '{{ogrenci_ad}} öğrencimizin {{hafta}} haftalık çalışma programı ektedir.\n\n'
                'Bilgilerinize sunarız.'
            ),
            OGRENCI: (
                'Merhaba {{ogrenci_ad}},\n\n'
                '{{hafta}} haftalık çalışma programın ektedir.\n\n'
                'Bilgine sunarız.'
            ),
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
        label='Gün sonu raporları (PDF)',
        description=(
            'Özet sayfasından gün sonu, detay sayfasından detay PDF’i '
            'ayrı gönderilir. Otomatik ayarda hangisinin gideceği seçilir. '
            'Tek Meta şablonunda {{rapor_ad}}, {{toplam_giren}}, '
            '{{toplam_cikan}} kullanılır. DOCUMENT header gerekir.'
        ),
        recipients=(PERSONEL,),
        opt_in_category='genel',
        has_document=True,
        variables=(
            'tarih', 'rapor_ad', 'pdf_baslik', 'personel_ad',
            'toplam_giren', 'toplam_cikan',
        ),
        meta_name_base='gun_sonu_raporu',
        default_bodies=MappingProxyType({
            PERSONEL: (
                'Değerli Yetkilimiz,\n'
                '{{tarih}} tarihine ait {{rapor_ad}} ekte PDF olarak '
                'bilgilerinize sunulmuştur.\n\n'
                'Kuruma giren: {{toplam_giren}} TL\n'
                'Kurumdan çıkan: {{toplam_cikan}} TL\n\n'
                'İyi çalışmalar dileriz.'
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
    NotificationEvent(
        key='ogrenci.hosgeldin',
        module=MODULE_OGRENCI,
        label='Hoş geldin mesajı (öğrenci)',
        description=(
            'Sözleşme aktif edilince öğrencinin WhatsApp (cep) numarası varsa '
            'muhasebe hattından otomatik hoş geldin mesajı gider. Numara yoksa atlanır.'
        ),
        recipients=(OGRENCI,),
        opt_in_category='duyuru',
        variables=(
            'ogrenci_ad', 'sinif_seviyesi', 'egitim_paketleri',
            'kayit_tarihi', 'sozlesme_no',
        ),
        meta_name_base='hosgeldin_mesaji',
        legacy_meta_names=MappingProxyType({
            OGRENCI: (
                'hogeldin_mesaji_ogrenci',
                'hosgeldin_ogrenci',
                'hosgeldin',
            ),
        }),
        default_bodies=MappingProxyType({
            OGRENCI: (
                'Merhaba {{ogrenci_ad}},\n\n'
                '{{kurum_ad}} ailesine hoş geldin. Şuben {{sube}}.\n\n'
                'Başarılar dileriz.'
            ),
        }),
    ),
    NotificationEvent(
        key='ogrenci.kayit_sozlesme',
        module=MODULE_OGRENCI,
        label='Yeni kayıt sözleşmesi (yönetici)',
        description=(
            'Sözleşme aktif edilince önceden seçilmiş kurum / şube / eğitim '
            'yöneticilerine WhatsApp özeti gider. Alıcılar bu ekrandan işaretlenir.'
        ),
        recipients=(PERSONEL,),
        opt_in_category='genel',
        variables=(
            'ogrenci_ad', 'sinif_seviyesi', 'egitim_paketleri',
            'kayit_tarihi', 'kayit_yapan', 'personel_ad', 'sozlesme_no',
        ),
        meta_name_base='ogrenci_kayit_sozlesme',
        default_bodies=MappingProxyType({
            PERSONEL: (
                'Sisteme yeni bir öğrenci kaydı oluşturuldu.\n'
                '\n'
                'Öğrenci Bilgileri\n'
                'Öğrenci: {{ogrenci_ad}}\n'
                'Sınıf Seviyesi: {{sinif_seviyesi}}\n'
                'Paketler: {{egitim_paketleri}}\n'
                '\n'
                'Kayıt Bilgileri\n'
                'Kayıt Tarihi: {{kayit_tarihi}}\n'
                'Kayıt Yapan: {{kayit_yapan}}\n'
                '\n'
                'Bilginize sunarız.'
            ),
        }),
    ),
    # ── Özel ders (her olayın kendi Meta şablonu) ──
    NotificationEvent(
        key='ozel_ders.ogretmen_gelmedi',
        module=MODULE_OZEL_DERS,
        label='Özel ders — öğretmen gelmedi',
        description='Özel ders yoklamasında öğretmen gelmedi; veliye telafi bilgisi (tarih belirsiz).',
        recipients=(VELI,),
        opt_in_category='devamsizlik',
        variables=(
            'veli_ad', 'ogrenci_ad', 'ders_tarihi', 'ders_saati', 'ders_adi',
            'ogretmen_ad', 'ders_durumu', 'sebep', 'ek_bilgi', 'telafi_notu',
        ),
        meta_name_base='ozel_ders_ogretmen_gelmedi',
        legacy_meta_names=MappingProxyType({
            VELI: ('ozel_ders_bilgi_veli',),
        }),
        default_bodies=MappingProxyType({
            VELI: (
                'Değerli Velimiz,\n'
                '\n'
                '{{ogrenci_ad}} öğrencimizin *{{ders_tarihi}} tarihinde saat '
                '{{ders_saati}}’te {{ders_adi}} özel dersi*, öğretmenimizin katılım '
                'sağlayamaması nedeniyle yapılamamıştır.\n'
                '\n'
                '{{telafi_notu}}\n'
                '\n'
                'Anlayışınız için teşekkür ederiz.'
            ),
        }),
    ),
    NotificationEvent(
        key='ozel_ders.ogrenci_gelmedi',
        module=MODULE_OZEL_DERS,
        label='Özel ders — öğrenci gelmedi',
        description='Özel ders yoklamasında öğrenci gelmedi bildirimi.',
        recipients=(VELI,),
        opt_in_category='devamsizlik',
        variables=(
            'veli_ad', 'ogrenci_ad', 'ders_tarihi', 'ders_saati', 'ders_adi',
            'ogretmen_ad', 'ders_durumu', 'sebep', 'ek_bilgi', 'telafi_notu',
        ),
        meta_name_base='ozel_ders_ogrenci_gelmedi',
        legacy_meta_names=MappingProxyType({
            VELI: ('ozel_ders_bilgi_veli',),
        }),
        default_bodies=MappingProxyType({
            VELI: (
                'Değerli Velimiz,\n'
                '\n'
                '{{ogrenci_ad}} öğrencimizin *{{ders_tarihi}} tarihinde saat '
                '{{ders_saati}}’te {{ders_adi}} özel dersine katılım sağlanamamıştır.*\n'
                '\n'
                '{{telafi_notu}}\n'
                '\n'
                'Bilginize sunarız.'
            ),
        }),
    ),
    NotificationEvent(
        key='ozel_ders.iptal',
        module=MODULE_OZEL_DERS,
        label='Özel ders — iptal',
        description='Özel ders iptal bildirimi.',
        recipients=(VELI,),
        opt_in_category='devamsizlik',
        variables=(
            'veli_ad', 'ogrenci_ad', 'ders_tarihi', 'ders_saati', 'ders_adi',
            'ogretmen_ad', 'ders_durumu', 'sebep', 'ek_bilgi',
        ),
        meta_name_base='ozel_ders_iptal',
        legacy_meta_names=MappingProxyType({
            VELI: ('ozel_ders_bilgi_veli',),
        }),
        default_bodies=MappingProxyType({
            VELI: (
                'Değerli Velimiz,\n'
                '\n'
                '{{ogrenci_ad}} öğrencimizin *{{ders_tarihi}} tarihinde saat '
                '{{ders_saati}}’te yapılması planlanan {{ders_adi}} özel dersi* '
                'iptal edilmiştir.\n'
                '\n'
                '*İptal nedeni:* {{sebep}}\n'
                '\n'
                'Ek bilgi: {{ek_bilgi}}\n'
                '\n'
                'Bilginize sunar, anlayışınız için teşekkür ederiz.'
            ),
        }),
    ),
    NotificationEvent(
        key='ozel_ders.telafi_planlandi',
        module=MODULE_OZEL_DERS,
        label='Özel ders — telafi planlandı',
        description=(
            'Telafi dersi oluşturulduğunda veliye bildirim. '
            'Mesajda orijinal ders tarihi/saati ve telafi tarihi/saati yer alır.'
        ),
        recipients=(VELI,),
        opt_in_category='devamsizlik',
        variables=(
            'veli_ad', 'ogrenci_ad', 'ders_tarihi', 'ders_saati', 'ders_adi',
            'ogretmen_ad', 'ders_durumu', 'sebep', 'ek_bilgi',
            'telafi_tarihi', 'telafi_saati',
        ),
        meta_name_base='ozel_ders_telafi',
        legacy_meta_names=MappingProxyType({
            VELI: ('ozel_ders_bilgi_veli',),
        }),
        default_bodies=MappingProxyType({
            VELI: (
                'Değerli Velimiz,\n'
                '\n'
                '{{ogrenci_ad}} öğrencimizin *{{ders_tarihi}} tarihinde saat '
                '{{ders_saati}}’te yapılamayan {{ders_adi}} özel dersinin telafisi '
                'planlanmıştır.*\n'
                '\n'
                '*Telafi Tarihi:* {{telafi_tarihi}}\n'
                '*Telafi Saati:* {{telafi_saati}}\n'
                '\n'
                'Ek bilgi: {{ek_bilgi}}\n'
                '\n'
                'Bilginize sunar, öğrencimize verimli bir ders dileriz.'
            ),
        }),
    ),
    NotificationEvent(
        key='ozel_ders.islendi',
        module=MODULE_OZEL_DERS,
        label='Özel ders — işlendi (opt-in)',
        description='Normal ders sonrası veli bildirimi; varsayılan kapalı, kullanıcı isterse açar.',
        recipients=(VELI,),
        opt_in_category='devamsizlik',
        variables=(
            'veli_ad', 'ogrenci_ad', 'ders_tarihi', 'ders_saati', 'ders_adi',
            'ogretmen_ad', 'ders_durumu', 'sebep', 'ek_bilgi',
        ),
        meta_name_base='ozel_ders_islendi',
        legacy_meta_names=MappingProxyType({
            VELI: ('ozel_ders_bilgi_veli',),
        }),
        default_bodies=MappingProxyType({
            VELI: (
                'Değerli Velimiz,\n'
                '\n'
                '{{ogrenci_ad}} öğrencimizin *{{ders_tarihi}} tarihinde saat '
                '{{ders_saati}}’te {{ders_adi}} özel dersi gerçekleştirilmiştir.*\n'
                '\n'
                'Bilginize sunarız.'
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
