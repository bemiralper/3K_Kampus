"""
Ödev WhatsApp bildirimi — hafta no, PDF dosya adı, şablon mesajı.
"""
from __future__ import annotations

import re
import unicodedata

from django.utils import timezone

from apps.communication.application.variable_resolver import build_recipient_context, resolve_variables

from .assignment_template_seed import (
    default_pdf_message_body,
    get_pdf_message_template,
)
from .models import ManualAssignment

NOTIFY_PLAN = 'plan'
NOTIFY_REPORT = 'report'

_TR_ASCII = str.maketrans({
    'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I',
    'ö': 'o', 'Ö': 'O', 'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U',
})


def slugify_filename_part(text: str) -> str:
    s = (text or '').strip().translate(_TR_ASCII)
    s = unicodedata.normalize('NFKD', s)
    s = re.sub(r'[^\w\s-]', '', s, flags=re.UNICODE)
    s = re.sub(r'[\s_]+', '-', s).strip('-')
    return s[:80] or 'odev'


def extract_hafta_no(assignment: ManualAssignment) -> str:
    """Ödev başlığından (örn. 'Haziran Ayı 4. Hafta Ödevi') veya tarihten hafta no."""
    title = assignment.title or ''
    match = re.search(r'(\d+)\.\s*Hafta', title, re.IGNORECASE)
    if match:
        return match.group(1)
    dt = assignment.assigned_date or assignment.due_date
    if dt:
        local = timezone.localtime(dt) if timezone.is_aware(dt) else dt
        return str(local.isocalendar()[1])
    return ''


def build_assignment_pdf_filename(assignment: ManualAssignment, notify_type: str) -> str:
    ogrenci = assignment.student
    name_part = slugify_filename_part(f'{ogrenci.ad} {ogrenci.soyad}')
    hafta = extract_hafta_no(assignment)
    hafta_part = f'{hafta}-Hafta' if hafta else 'Hafta'
    kind = 'Odev-Plani' if notify_type == NOTIFY_PLAN else 'Odev-Raporu'
    return f'{name_part}-{hafta_part}-{kind}.pdf'


def pdf_title_label(notify_type: str) -> str:
    if notify_type == NOTIFY_PLAN:
        return 'Ödev Planı'
    return 'Ödev Kontrol Raporu'


def build_assignment_context(
    *,
    assignment: ManualAssignment,
    notify_type: str = '',
    veli=None,
    kurum=None,
) -> dict[str, str]:
    """Haftalık ödev PDF WhatsApp mesajı şablon değişkenleri."""
    ogrenci = assignment.student
    ctx = build_recipient_context(
        display_name=getattr(veli, 'tam_ad', '') if veli else f'{ogrenci.ad} {ogrenci.soyad}'.strip(),
        recipient_type='VELI' if veli else 'OGRENCI',
        ogrenci=ogrenci,
        veli=veli,
        kurum=kurum,
    )

    hafta_no = extract_hafta_no(assignment)
    ctx['hafta_no'] = hafta_no
    ctx['hafta'] = f'{hafta_no}. Hafta' if hafta_no else ''
    ctx['odev_baslik'] = assignment.title or ''
    ctx['pdf_baslik'] = pdf_title_label(notify_type) if notify_type else ''

    if assignment.due_date:
        local = timezone.localtime(assignment.due_date)
        ctx['teslim_tarihi'] = local.strftime('%d.%m.%Y')
    else:
        ctx['teslim_tarihi'] = ''

    return ctx


def build_pdf_attachment_message(
    assignment: ManualAssignment,
    kurum_id: int,
    notify_type: str,
    *,
    for_veli: bool,
    veli=None,
    kurum=None,
) -> str:
    recipient_type = 'veli' if for_veli else 'ogrenci'
    template = get_pdf_message_template(kurum_id, notify_type, recipient_type)
    body_template = template.body if template else default_pdf_message_body(notify_type, recipient_type)
    ctx = build_assignment_context(
        assignment=assignment,
        notify_type=notify_type,
        veli=veli,
        kurum=kurum,
    )
    message = resolve_variables(body_template, ctx).strip()
    if template:
        from apps.communication.application.template_service import TemplateService
        TemplateService().increment_usage(template)
    return message
