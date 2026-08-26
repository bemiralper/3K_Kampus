"""
Ödev WhatsApp bildirimi — hafta no, PDF dosya adı, şablon mesajı.
"""
from __future__ import annotations

import re
import unicodedata
from html.parser import HTMLParser

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


def strip_note_html(text: str) -> str:
    """Ödev notundaki HTML etiketlerini düz metne çevirir (biçim yok)."""
    if not text or '<' not in text:
        return (text or '').strip()
    from html import unescape
    plain = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    plain = re.sub(r'</(?:p|div)>', '\n', plain, flags=re.IGNORECASE)
    plain = re.sub(r'<[^>]+>', '', plain)
    plain = unescape(plain)
    plain = re.sub(r'[ \t]+', ' ', plain)
    plain = re.sub(r'\n{3,}', '\n\n', plain)
    return plain.strip()


class _WhatsAppNoteParser(HTMLParser):
    """Kalın → *...*, italik → _..._ (WhatsApp biçimi). Renk WA metninde yok."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.bold = 0
        self.italic = 0

    def handle_starttag(self, tag, attrs):
        t = tag.lower()
        if t in ('b', 'strong'):
            if self.bold == 0:
                self.out.append('*')
            self.bold += 1
        elif t in ('i', 'em'):
            if self.italic == 0:
                self.out.append('_')
            self.italic += 1
        elif t == 'br':
            self.out.append('\n')
        elif t in ('p', 'div') and self.out and self.out[-1] != '\n':
            self.out.append('\n')

    def handle_endtag(self, tag):
        t = tag.lower()
        if t in ('b', 'strong') and self.bold:
            self.bold -= 1
            if self.bold == 0:
                self.out.append('*')
        elif t in ('i', 'em') and self.italic:
            self.italic -= 1
            if self.italic == 0:
                self.out.append('_')
        elif t in ('p', 'div') and self.out and self.out[-1] != '\n':
            self.out.append('\n')

    def handle_data(self, data):
        self.out.append(data)


def html_to_whatsapp(text: str) -> str:
    """Ödev notu HTML → WhatsApp biçimli metin (*kalın*, _italik_)."""
    if not text:
        return ''
    if '<' not in text:
        return text.strip()
    parser = _WhatsAppNoteParser()
    parser.feed(text)
    parser.close()
    result = ''.join(parser.out)
    result = re.sub(r'\n{3,}', '\n\n', result)
    return result.strip()


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
    ctx['odev_not'] = html_to_whatsapp(assignment.description or '')

    if assignment.due_date:
        local = timezone.localtime(assignment.due_date)
        ctx['teslim_tarihi'] = local.strftime('%d.%m.%Y')
    else:
        ctx['teslim_tarihi'] = ''

    return ctx


def _body_matches_notify_type(notify_type: str, body: str) -> bool:
    """Plan gönderiminde rapor metni (ve tersi) kullanılmasın."""
    if not body or notify_type not in (NOTIFY_PLAN, NOTIFY_REPORT):
        return True
    text = body.lower()
    if notify_type == NOTIFY_PLAN and 'kontrol rapor' in text and 'plan' not in text:
        return False
    if notify_type == NOTIFY_REPORT and (
        'ödev planı' in text or 'odev plani' in text
    ) and 'rapor' not in text:
        return False
    return True


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
    body_template = default_pdf_message_body(notify_type, recipient_type)
    if template and _body_matches_notify_type(notify_type, template.body or ''):
        # Rol etiketi varsa plan/rapor slotunun doğru şablon olduğunu doğrula
        from .assignment_template_roles import (
            NOTIFY_RECIPIENT_TO_ROLE,
            get_template_odev_role,
        )
        expected_role = NOTIFY_RECIPIENT_TO_ROLE.get((notify_type, recipient_type))
        role = get_template_odev_role(template)
        if not role or role == expected_role:
            body_template = template.body
        else:
            template = None
    elif template:
        template = None
    ctx = build_assignment_context(
        assignment=assignment,
        notify_type=notify_type,
        veli=veli,
        kurum=kurum,
    )
    message = resolve_variables(body_template, ctx).strip()
    note = ctx.get('odev_not') or ''
    if note and '{{odev_not}}' not in (body_template or '') and note not in message:
        message = f'{message}\n\n{note}'.strip()
    if template:
        from apps.communication.application.template_service import TemplateService
        TemplateService().increment_usage(template)
    return message
