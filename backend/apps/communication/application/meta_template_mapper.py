"""
Named LMS değişkenleri ↔ Meta {{1}}, {{2}} eşlemesi.
Kullanıcı yalnızca {{ogrenci_ad}} görür; Meta payload numaralıdır.
"""
from __future__ import annotations

import re
from typing import Any

from apps.communication.application.variable_resolver import VARIABLE_PATTERN

# Header TEXT / body / URL button params için örnek değerler (Meta zorunlu)
SAMPLE_VALUES: dict[str, str] = {
    'ogrenci_ad': 'Ahmet Yılmaz',
    'veli_ad': 'Ayşe Yılmaz',
    'personel_ad': 'Zeynep Kaya',
    'kurum_ad': 'Demo Kurum',
    'sube': 'Merkez',
    'sinif': '12-A',
    'taksit_tutar': '1.500',
    'kalan_tutar': '1.500',
    'taksit_no': '3',
    'vade_tarihi': '15.09.2026',
    'sozlesme_no': 'SZ-2026-0142',
    'gecikme_gunu': '5',
    'toplam_gecikmis_tutar': '3.000',
    'taksit_sayisi': '2',
    'max_gecikme_gunu': '12',
    'taksit_detay_listesi': '3. taksit: 1.500 TL',
    'belge_turu': 'Ödeme planı',
    'toplam_tahsilat': '125.000',
    'toplam_gider': '18.500',
    'rapor_ad': 'Gün Sonu Raporu',
    'toplam_giren': '1.500',
    'toplam_cikan': '250',
    'odeme_link': 'https://example.com/odeme',
    'tarih': '02.08.2026',
    'saat': '14:30',
    'yoklama_tarihi': '02.08.2026',
    'oturum_ad': 'Sabah',
    'giris_saati': '08:45',
    'cikis_saati': '16:10',
    'salon_ad': 'A Salonu',
    'ders_no': '3',
    'ilk_etut_saati': '08:30',
    'son_etut_cikis_saati': '12:10',
    'sabah_ilk_etut_saati': '08:30',
    'ogle_ilk_etut_saati': '13:00',
    'aksam_ilk_etut_saati': '18:00',
    'hafta': '4. Hafta',
    'hafta_no': '4',
    'odev_baslik': 'Haftalık ödev',
    'teslim_tarihi': '10.08.2026',
    'pdf_baslik': 'Ödev Planı',
    'koc_ad': 'Elif Demir',
    'konu': 'Sınav hazırlığı',
    'sinav_ad': 'TYT Deneme 12',
    'sinav_adi': 'TYT Deneme 12',
    'sinav_tarihi': '12.04.2026',
    'baslama_saati': '10:00',
    'bitis_saati': '12:45',
    'sinav_salonu': 'A Salonu',
    'sira_no': '14',
    'sira': '14',
    'baslik': 'Veli Toplantısı',
    'mesaj': (
        'Haftalık deneme sınavı sonuçları öğrenci paneline yüklenmiştir. '
        'Değerlendirme toplantısı çarşamba saat 18.00’de yapılacaktır.'
    ),
    'aciklama': 'Detaylı açıklama',
    'ders_tarihi': '15 Ocak 2026 Pazartesi',
    'ders_saati': '15.00',
    'ders_adi': 'Matematik',
    'ogretmen_ad': 'Tuba Demir',
    'ders_durumu': 'Öğretmen Gelmedi',
    'sebep': 'Hastalık',
    'ek_bilgi': 'Ek not',
    'telafi_notu': (
        'Ders telafi edilecektir. Telafi tarihi ve saati kesinleştiğinde '
        'tarafınıza ayrıca bilgi verilecektir.'
    ),
    'telafi_tarihi': '18 Ocak 2026 Pazar',
    'telafi_saati': '14.00',
}


def extract_named_variables_in_order(text: str) -> list[str]:
    """İlk geçiş sırasına göre benzersiz named değişkenler."""
    seen: set[str] = set()
    ordered: list[str] = []
    for match in VARIABLE_PATTERN.finditer(text or ''):
        key = match.group(1)
        if key.isdigit():
            continue
        if key not in seen:
            seen.add(key)
            ordered.append(key)
    return ordered


# Meta'da numaralı kalan şablonlar — sync body_named {{1}} bırakır, map boş kalır.
NUMBERED_TEMPLATE_DEFAULT_MAPS: dict[str, dict[str, str]] = {
    'gun_sonu_raporu_personel': {
        '1': 'tarih', '2': 'rapor_ad', '3': 'toplam_giren', '4': 'toplam_cikan',
    },
    'gun_sonu_raporu': {
        '1': 'tarih', '2': 'rapor_ad', '3': 'toplam_giren', '4': 'toplam_cikan',
    },
    'hogeldin_mesaji_ogrenci': {'1': 'ogrenci_ad', '2': 'kurum_ad'},
    'hosgeldin_mesaji_ogrenci': {'1': 'ogrenci_ad', '2': 'kurum_ad'},
    'ogrenci_kayit_sozlesme_personel': {
        '1': 'ogrenci_ad',
        '2': 'sinif_seviyesi',
        '3': 'egitim_paketleri',
        '4': 'kayit_tarihi',
        '5': 'kayit_yapan',
    },
    'toplu_duyuru': {'1': 'mesaj'},
    'ogrenci_toplu_duyuru': {'1': 'mesaj'},
    'ogretmen_toplu_duyuru': {'1': 'mesaj'},
    'duyuru_toplu': {'1': 'mesaj'},
}


def infer_single_numbered_as_mesaj(body_named: str) -> dict[str, str]:
    """Gövde yalnızca {{1}} gibi tek numaralı alan ise kampanya mesajıdır."""
    keys = [match.group(1) for match in VARIABLE_PATTERN.finditer(body_named or '')]
    numbered = [key for key in keys if key.isdigit()]
    named = [key for key in keys if not key.isdigit()]
    unique = list(dict.fromkeys(numbered))
    if unique and not named and len(unique) == 1:
        return {unique[0]: 'mesaj'}
    return {}


def default_variable_map_for_template(name: str, body_named: str = '') -> dict[str, str]:
    mapped = dict(NUMBERED_TEMPLATE_DEFAULT_MAPS.get((name or '').strip(), {}) or {})
    if mapped:
        return mapped
    return infer_single_numbered_as_mesaj(body_named)


def build_variable_map(body_named: str, *extra_texts: str) -> dict[str, str]:
    """
    {'1': 'ogrenci_ad', '2': 'kurum_ad'} — sıra: body, sonra ekstra metinler
    (header text, dynamic URL vb.) içinde ilk görülen named var.
    """
    ordered: list[str] = []
    seen: set[str] = set()
    for text in (body_named, *extra_texts):
        for key in extract_named_variables_in_order(text):
            if key not in seen:
                seen.add(key)
                ordered.append(key)
    return {str(i): name for i, name in enumerate(ordered, start=1)}


def named_to_numbered(text: str, variable_map: dict[str, str]) -> str:
    """{{ogrenci_ad}} → {{1}} (map'e göre)."""
    reverse = {v: k for k, v in variable_map.items()}

    def replacer(match: re.Match) -> str:
        key = match.group(1)
        if key.isdigit():
            return match.group(0)
        idx = reverse.get(key)
        if not idx:
            return match.group(0)
        return '{{' + idx + '}}'

    return VARIABLE_PATTERN.sub(replacer, text or '')


def numbered_to_named(text: str, variable_map: dict[str, str]) -> str:
    """{{1}} → {{ogrenci_ad}}."""

    def replacer(match: re.Match) -> str:
        key = match.group(1)
        name = variable_map.get(key)
        if name:
            return '{{' + name + '}}'
        return match.group(0)

    return VARIABLE_PATTERN.sub(replacer, text or '')


def clean_example_values(raw) -> dict[str, str]:
    """Şablonda saklanan onay örneklerini sadeleştirir; gönderim bağlamına karışmaz."""
    if not isinstance(raw, dict):
        return {}
    cleaned: dict[str, str] = {}
    for key, value in raw.items():
        name = str(key or '').strip()
        text = sanitize_template_param_text(value)
        if name and text and text != '-':
            cleaned[name] = text
    return cleaned


def sample_value(name: str, overrides: dict[str, str] | None = None, *, fallback: str = '') -> str:
    if overrides:
        override = (overrides.get(name) or '').strip()
        if override:
            return sanitize_template_param_text(override)
    return SAMPLE_VALUES.get(name, fallback or f'Örnek {name or ""}'.strip())


def example_values_for_map(
    variable_map: dict[str, str],
    overrides: dict[str, str] | None = None,
) -> list[str]:
    """Meta template create için body/header example dizisi (sıralı)."""
    if not variable_map:
        return []
    max_idx = max(int(k) for k in variable_map if str(k).isdigit())
    values: list[str] = []
    for i in range(1, max_idx + 1):
        name = variable_map.get(str(i), '')
        values.append(sample_value(name, overrides, fallback=f'Örnek{i}'))
    return values


def freeze_variables(text: str, overrides: dict[str, str] | None = None) -> str:
    """
    Named değişkenleri sabit metne çevirir.

    Meta FOOTER bileşeni parametre kabul etmediği için alt bilgideki değişkenler
    payload'a girmeden önce buradaki değerlerle sabitlenir.
    """

    def replacer(match: re.Match) -> str:
        key = match.group(1)
        if key.isdigit():
            return match.group(0)
        return sample_value(key, overrides, fallback=key)

    return VARIABLE_PATTERN.sub(replacer, text or '')


def _header_component(
    header: dict[str, Any],
    variable_map: dict[str, str],
    example_values: dict[str, str] | None = None,
) -> dict[str, Any] | None:
    if not header:
        return None
    htype = (header.get('type') or '').upper()
    if not htype or htype == 'NONE':
        return None

    if htype == 'TEXT':
        text_named = header.get('text') or ''
        text = named_to_numbered(text_named, variable_map)
        comp: dict[str, Any] = {
            'type': 'HEADER',
            'format': 'TEXT',
            'text': text,
        }
        examples = example_values_for_map(
            {k: v for k, v in variable_map.items() if v in extract_named_variables_in_order(text_named)},
            example_values,
        )
        # Header örnekleri yalnızca header'daki değişkenler için
        header_keys = extract_named_variables_in_order(text_named)
        if header_keys:
            reverse = {v: k for k, v in variable_map.items()}
            header_examples = [
                sample_value(k, example_values, fallback=f'Örnek{reverse.get(k, "1")}')
                for k in header_keys
            ]
            comp['example'] = {'header_text': header_examples}
        return comp

    if htype in ('IMAGE', 'VIDEO', 'DOCUMENT'):
        example_handle = header.get('example_handle') or header.get('media_handle') or ''
        comp = {
            'type': 'HEADER',
            'format': htype,
        }
        if example_handle:
            comp['example'] = {'header_handle': [example_handle]}
        return comp

    return None


def _buttons_component(buttons: list[dict[str, Any]], variable_map: dict[str, str]) -> dict[str, Any] | None:
    if not buttons:
        return None
    meta_buttons: list[dict[str, Any]] = []
    for btn in buttons:
        btype = (btn.get('type') or '').upper()
        if btype == 'QUICK_REPLY':
            meta_buttons.append({
                'type': 'QUICK_REPLY',
                'text': (btn.get('text') or '')[:25],
            })
        elif btype == 'URL':
            url_named = btn.get('url') or ''
            url = named_to_numbered(url_named, variable_map)
            entry: dict[str, Any] = {
                'type': 'URL',
                'text': (btn.get('text') or '')[:25],
                'url': url,
            }
            url_vars = extract_named_variables_in_order(url_named)
            if url_vars:
                entry['example'] = [
                    SAMPLE_VALUES.get(url_vars[0], 'ornek'),
                ]
            meta_buttons.append(entry)
        elif btype in ('PHONE_NUMBER', 'PHONE'):
            meta_buttons.append({
                'type': 'PHONE_NUMBER',
                'text': (btn.get('text') or '')[:25],
                'phone_number': btn.get('phone_number') or btn.get('phone') or '',
            })
        elif btype == 'OTP':
            # AUTHENTICATION — Meta OTP button; minimal support
            meta_buttons.append({
                'type': 'OTP',
                'otp_type': btn.get('otp_type') or 'COPY_CODE',
            })
    if not meta_buttons:
        return None
    return {'type': 'BUTTONS', 'buttons': meta_buttons}


def build_meta_components(
    *,
    body_named: str,
    header_json: dict[str, Any] | None = None,
    footer_text: str = '',
    buttons_json: list[dict[str, Any]] | None = None,
    variable_map: dict[str, str] | None = None,
    example_values: dict[str, str] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    """
    Meta create payload components + variable_map.
    Dönüş: (components, variable_map)
    """
    header = header_json or {}
    buttons = buttons_json or []
    header_text = header.get('text') or '' if (header.get('type') or '').upper() == 'TEXT' else ''
    url_texts = [
        b.get('url') or ''
        for b in buttons
        if (b.get('type') or '').upper() == 'URL'
    ]
    vmap = variable_map or build_variable_map(body_named, header_text, *url_texts)
    examples = clean_example_values(example_values)

    components: list[dict[str, Any]] = []
    header_comp = _header_component(header, vmap, examples)
    if header_comp:
        components.append(header_comp)

    body_numbered = named_to_numbered(body_named, vmap)
    body_comp: dict[str, Any] = {
        'type': 'BODY',
        'text': body_numbered,
    }
    body_examples = example_values_for_map(vmap, examples)
    # Body örnekleri: body içinde geçenler
    body_keys = extract_named_variables_in_order(body_named)
    if body_keys:
        reverse = {v: k for k, v in vmap.items()}
        body_only = [
            sample_value(k, examples, fallback=f'Örnek{reverse.get(k, "1")}')
            for k in body_keys
        ]
        body_comp['example'] = {'body_text': [body_only]}
    elif body_examples:
        body_comp['example'] = {'body_text': [body_examples]}
    components.append(body_comp)

    if footer_text:
        components.append({
            'type': 'FOOTER',
            'text': freeze_variables(footer_text, examples)[:60],
        })

    buttons_comp = _buttons_component(buttons, vmap)
    if buttons_comp:
        components.append(buttons_comp)

    return components, vmap


def sanitize_template_param_text(value: Any) -> str:
    """
    Meta body/header text parametreleri boş veya satır sonu içeremez
    (#100 Invalid parameter).
    """
    text = '' if value is None else str(value)
    text = text.replace('\r', ' ').replace('\n', ' ').replace('\t', ' ')
    text = ' '.join(text.split()).strip()
    # Meta boş string'i reddeder
    return text if text else '-'


def build_send_body_parameters(
    variable_map: dict[str, str],
    context: dict[str, Any],
    *,
    body_named: str = '',
) -> list[dict[str, str]]:
    """
    Gönderim anında body parameters.

    - Body hâlâ named (`{{ogrenci_ad}}`) ise Meta named format: parameter_name gerekir.
    - Body numaralı (`{{1}}`) veya variable_map varsa positional parametreler.
    - Yalnızca body'deki değişken sayısı kadar parametre gönderilir.
    """
    named_in_body = extract_named_variables_in_order(body_named)
    numbered_in_body = [
        int(m.group(1))
        for m in VARIABLE_PATTERN.finditer(body_named or '')
        if m.group(1).isdigit()
    ]
    has_positional_map = any(str(k).isdigit() for k in (variable_map or {}))

    # Named-format yalnızca Meta gerçekten named bekliyorsa (map yok).
    # body_named yerelde {{ogrenci_ad}} olsa bile Cloud API şablonu {{1}} ise
    # parameter_name göndermek #100 Invalid parameter üretir; mesaj "bekliyor"da kalır.
    if named_in_body and not numbered_in_body and not has_positional_map:
        return [
            {
                'type': 'text',
                'parameter_name': key,
                'text': sanitize_template_param_text(context.get(key)),
            }
            for key in named_in_body
        ]

    if numbered_in_body:
        indices = sorted(set(numbered_in_body))
    elif variable_map:
        # Body metni yoksa map sırası; body named + map varsa yalnızca body anahtarları
        if named_in_body:
            reverse = {v: int(k) for k, v in variable_map.items() if str(k).isdigit()}
            indices = sorted({reverse[k] for k in named_in_body if k in reverse})
        else:
            indices = sorted(int(k) for k in variable_map if str(k).isdigit())
    else:
        return []

    params: list[dict[str, str]] = []
    for i in indices:
        name = (variable_map or {}).get(str(i), '')
        value = context.get(name) if name else context.get(str(i))
        params.append({'type': 'text', 'text': sanitize_template_param_text(value)})
    return params


def infer_named_body_from_meta_components(components: list[dict[str, Any]]) -> tuple[str, dict, str, list, dict]:
    """
    Meta sync'ten gelen components → body_named ({{1}} kalır; map yoksa),
    header_json, footer, buttons, boş variable_map.
    Kullanıcı named map'i sonradan bağlayabilir; sync'te numaralı bırakılır.
    """
    body = ''
    header: dict[str, Any] = {}
    footer = ''
    buttons: list[dict[str, Any]] = []
    for comp in components or []:
        ctype = (comp.get('type') or '').upper()
        if ctype == 'BODY':
            body = comp.get('text') or ''
        elif ctype == 'HEADER':
            fmt = (comp.get('format') or 'TEXT').upper()
            header = {'type': fmt}
            if fmt == 'TEXT':
                header['text'] = comp.get('text') or ''
            else:
                example = comp.get('example') or {}
                handles = example.get('header_handle') or []
                if handles:
                    header['example_handle'] = handles[0]
        elif ctype == 'FOOTER':
            footer = comp.get('text') or ''
        elif ctype == 'BUTTONS':
            for btn in comp.get('buttons') or []:
                btype = (btn.get('type') or '').upper()
                entry = {'type': btype, 'text': btn.get('text') or ''}
                if btype == 'URL':
                    entry['url'] = btn.get('url') or ''
                elif btype == 'PHONE_NUMBER':
                    entry['phone_number'] = btn.get('phone_number') or ''
                buttons.append(entry)
    return body, header, footer, buttons, {}


def map_meta_status(meta_status: str) -> str:
    from apps.communication.domain.enums import MetaTemplateStatus

    raw = (meta_status or '').upper()
    mapping = {
        'APPROVED': MetaTemplateStatus.APPROVED,
        'PENDING': MetaTemplateStatus.PENDING,
        'REJECTED': MetaTemplateStatus.REJECTED,
        'PAUSED': MetaTemplateStatus.PAUSED,
        'DISABLED': MetaTemplateStatus.DISABLED,
        'IN_APPEAL': MetaTemplateStatus.PENDING,
        'PENDING_DELETION': MetaTemplateStatus.DISABLED,
        'DELETED': MetaTemplateStatus.DISABLED,
    }
    return mapping.get(raw, MetaTemplateStatus.PENDING)
