"""
Öğrenci Portalı — Portal İçi Koç Mesajlaşması, Duyurular, Kampüs Story Kapsülleri
ve Saate Duyarlı "Yaşayan Ana Ekran" (Living Home) Servisi.
"""
from __future__ import annotations

from datetime import datetime, timedelta
import html
import re

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.coaching.models import CoachStudentAssignment
from apps.coaching.services.coach_access import get_coach_profile, user_can_access_student
from apps.communication.domain.models import Message as CommMessage
from apps.website.models import Duyuru

from ..auth import ISTANBUL, StudentPortalError
from ..models import StudentCoachMessage
from .exam_service import build_student_exams_overview, build_upcoming_exam_boarding_pass
from .schedule_service import build_campus_life_and_attendance, build_unified_schedule
from .study_service import build_study_workspace
from .achievement_service import build_student_achievements


EXCLUDED_COMM_MODULES = frozenset({
    'odeme',
    'finans',
    'finans.gun_sonu',
    'sozlesme',
    'muhasebe',
    'taksit',
    'forward',
})

FINANCIAL_BODY_KEYWORDS = (
    'tahsilat makbuzu',
    'muhasebe birimi',
    'taksit tutarı',
    'gecikmiş taksit',
    'ödeme hatırlatma',
)

ANNOUNCEMENT_CATEGORIES = (
    ('duyuru', 'Duyuru & Ders Notu'),
    ('sinav', 'Sınav & Sonuç'),
    ('odev', 'Ödev & Ders Planı'),
    ('yoklama', 'Yoklama & Kampüs'),
)


def _html_to_formatted_text(raw_text: str) -> str:
    """
    CMS duyurularındaki HTML etiketlerini (`<p>`, `<br>`, `<strong>`, `<li>` vb.)
    temiz ve okunabilir portal biçimine dönüştürür; ekrana ham `<p>...</p>` sızmasını önler.
    """
    if not raw_text:
        return ''
    txt = str(raw_text)
    if '<' not in txt and '&' not in txt:
        return txt.strip()

    # Script / style bloklarını tamamen kaldır
    txt = re.sub(r'<(script|style)\b[^>]*>[\s\S]*?</\1>', '', txt, flags=re.IGNORECASE)
    # Kalın ve italik etiketlerini WhatsApp/Portal işaretçilerine çevir
    txt = re.sub(r'<(strong|b)\b[^>]*>([\s\S]*?)</\1>', r'*\2*', txt, flags=re.IGNORECASE)
    txt = re.sub(r'<(em|i)\b[^>]*>([\s\S]*?)</\1>', r'_\2_', txt, flags=re.IGNORECASE)
    # Liste maddeleri ve satır sonları
    txt = re.sub(r'<li\b[^>]*>\s*', '\n• ', txt, flags=re.IGNORECASE)
    txt = re.sub(r'<br\s*/?>', '\n', txt, flags=re.IGNORECASE)
    txt = re.sub(r'</(p|div|h[1-6]|li|tr|blockquote)>', '\n', txt, flags=re.IGNORECASE)
    # Kalan tüm HTML etiketlerini temizle
    txt = re.sub(r'<[^>]+>', '', txt)
    txt = html.unescape(txt)
    # Satır içi fazla boşlukları ve ardışık boş satırları düzenle
    lines = [re.sub(r'[ \t]+', ' ', ln).strip() for ln in txt.splitlines()]
    cleaned = '\n'.join(lines)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
    return cleaned.strip()


def _plain_preview_text(raw_text: str, max_len: int = 200) -> str:
    """Story kapsülleri ve kart özetleri için tüm HTML ve yıldız/altçizgi işaretlerini sadeleştirir."""
    txt = _html_to_formatted_text(raw_text)
    txt = re.sub(r'\*\*([^*]+)\*\*', r'\1', txt)
    txt = re.sub(r'\*([^*\n]+)\*', r'\1', txt)
    txt = re.sub(r'(?<!\w)_([^_\n]+)_(?!\w)', r'\1', txt)
    txt = re.sub(r'~([^~\n]+)~', r'\1', txt)
    txt = re.sub(r'`([^`\n]+)`', r'\1', txt)
    txt = re.sub(r'\s+', ' ', txt).strip()
    if len(txt) > max_len:
        return txt[: max_len - 1].rstrip() + '…'
    return txt


def _comm_category_for_module(source_module: str) -> tuple[str, str]:
    mod = (source_module or '').strip().lower()
    if mod == 'sinav':
        return 'sinav', 'Sınav & Sonuç'
    if mod in ('odev', 'ozel_ders', 'akademik', 'koc', 'gorusme'):
        return 'odev', 'Ödev & Ders Planı'
    if mod in ('yoklama_bildirim', 'akademik_yoklama', 'devamsizlik'):
        return 'yoklama', 'Yoklama & Kampüs'
    return 'duyuru', 'Duyuru & Ders Notu'


def _derive_comm_message_title(msg: CommMessage, body_clean: str, attachments: list[dict]) -> str:
    mod = (msg.source_module or '').strip().lower()
    camp_title = ((msg.campaign.title if msg.campaign_id and msg.campaign else '') or '').strip()

    # Kampanya başlığı anlamlıysa (iç teknik kitle filtresi değilse) doğrudan değerlendir
    if camp_title and not camp_title.startswith(('Öğrenciler ·', 'Veliler ·', 'Sınıf şubesi:')):
        return camp_title[:140]

    # Mesaj içinden sınav / ödev / başlık yakalama
    exam_match = re.search(r'Sınav:\*?\s*([^\n*]+)', body_clean, flags=re.IGNORECASE)
    if exam_match:
        return f"{exam_match.group(1).strip()} — Sınav Bilgilendirmesi"[:140]

    bold_matches = [
        m.strip(' :—-*_')
        for m in re.findall(r'\*{1,2}([^*\n]{3,90})\*{1,2}', body_clean)
    ]
    generic_headings = {
        'duyuru', 'bilgilendirme', 'sınav bilgilendirmesi', 'sevgili öğrencimiz',
        'sevgili öğrencimiz,', 'değerli velimiz', 'değerli velimiz,', 'gelmedi',
    }
    specific_bold = next(
        (b for b in bold_matches if b.lower() not in generic_headings and not b.lower().endswith(':')),
        None,
    )

    if mod == 'sinav':
        if 'cevap anahtar' in body_clean.lower():
            return f"{specific_bold or 'Deneme Sınavı'} — Cevap Anahtarı"[:140]
        if 'sonuç belgesi' in body_clean.lower() or 'karne' in body_clean.lower():
            return f"{specific_bold or 'Deneme Sınavı'} — Sınav Sonuç Belgesi"[:140]
        if 'katılım sağlamadığı' in body_clean.lower():
            return f"{specific_bold or 'Deneme Sınavı'} — Katılım Bilgilendirmesi"[:140]
        return f"{specific_bold or 'Deneme Sınavı'} — Sınav Bilgilendirmesi"[:140]

    if mod == 'odev':
        if 'rapor' in body_clean.lower() or 'değerlendirme' in body_clean.lower():
            return f"{specific_bold or 'Haftalık Ödev'} — Değerlendirme Raporu"[:140]
        return f"{specific_bold or 'Haftalık Ödev'} — Ödev Planı"[:140]

    if mod == 'ozel_ders':
        return 'Özel Ders Program Bilgilendirmesi'

    if mod in ('yoklama_bildirim', 'akademik_yoklama', 'devamsizlik'):
        if 'çıkış' in body_clean.lower():
            return 'Kütüphane / Kampüs Çıkış Bilgilendirmesi'
        return 'Yoklama & Devam Bilgilendirmesi'

    if attachments:
        first_name = (attachments[0].get('name') or '').rsplit('.', 1)[0].replace('_', ' ').strip()
        if first_name:
            if 'ders notu' in body_clean.lower():
                return f'Ders Notu — {first_name}'[:140]
            return f'Paylaşılan Belge — {first_name}'[:140]

    if specific_bold:
        return specific_bold[:140]

    first_line = next((ln.strip() for ln in body_clean.splitlines() if ln.strip()), '')
    first_plain = _plain_preview_text(first_line, max_len=90)
    if first_plain.lower() in ('duyuru:', 'duyuru', 'bilgilendirme', 'bilgilendirme:'):
        second_line = next(
            (ln.strip() for ln in body_clean.splitlines()[1:] if ln.strip()),
            '',
        )
        second_plain = _plain_preview_text(second_line, max_len=90)
        if second_plain:
            return f'Kampüs Duyurusu — {second_plain}'[:140]
        return 'Kampüs Duyurusu'
    return first_plain or 'Kampüs Bilgilendirmesi'


def _serialize_comm_attachments(msg: CommMessage) -> list[dict]:
    items = []
    for att in msg.attachments.all():
        if not att.file:
            continue
        try:
            url = att.file.url
        except Exception:
            continue
        if url and not url.startswith('http') and not url.startswith('/'):
            url = f'/media/{url.lstrip("/")}'
        mime = (att.mime_type or '').lower()
        name = att.original_name or 'Ek Dosya'
        lower_name = name.lower()
        items.append({
            'id': str(att.id),
            'name': name,
            'mime_type': att.mime_type or 'application/octet-stream',
            'file_size': int(att.file_size or 0),
            'url': url,
            'is_pdf': 'pdf' in mime or lower_name.endswith('.pdf'),
            'is_image': mime.startswith('image/') or lower_name.endswith(('.png', '.jpg', '.jpeg', '.webp')),
        })
    return items


def _collect_student_comm_messages(scope: dict) -> list[CommMessage]:
    ogrenci = scope['ogrenci']
    qs = (
        CommMessage.objects.select_related('conversation', 'campaign', 'sender_user')
        .prefetch_related('attachments')
        .filter(
            conversation__kurum_id=scope['kurum_id'],
            conversation__ogrenci_id=ogrenci.id,
            direction='OUTBOUND',
        )
        .filter(
            Q(conversation__sube_id__isnull=True) | Q(conversation__sube_id=scope['sube_id'])
        )
        .exclude(status__in=('FAILED', 'CANCELLED'))
        .exclude(source_module__in=EXCLUDED_COMM_MODULES)
        .order_by('-created_at')[:120]
    )

    raw_msgs = list(qs)
    # Öğrencinin kendi hattına (`veli_id is None`) giden mesajları öncele, aynı kampanya/olay
    # veli hattına da gittiyse tekilleştir; finans/muhasebe içeriklerini kesinlikle dışla.
    ordered = sorted(
        raw_msgs,
        key=lambda m: (0 if m.conversation.veli_id is None else 1, -m.created_at.timestamp()),
    )

    seen_dedupe_keys: set[str] = set()
    kept: list[CommMessage] = []
    for m in ordered:
        body_raw = (m.body or '').strip()
        if not body_raw and not m.attachments.all():
            continue
        body_lower = body_raw.lower()
        if any(kw in body_lower for kw in FINANCIAL_BODY_KEYWORDS):
            continue

        dedupe_key = None
        if m.campaign_id:
            dedupe_key = f'camp:{m.campaign_id}'
        elif m.source_module and m.source_ref_id:
            base_ref = str(m.source_ref_id).split(':veli')[0].split(':ogrenci')[0]
            dedupe_key = f'src:{m.source_module}:{base_ref}'

        if dedupe_key and dedupe_key in seen_dedupe_keys:
            continue
        if dedupe_key:
            seen_dedupe_keys.add(dedupe_key)
        kept.append(m)

    kept.sort(key=lambda m: m.created_at, reverse=True)
    return kept[:60]


def list_student_announcements(scope: dict) -> dict:
    """
    Kurum web duyurularını (`website.Duyuru`) VE öğrenciye gönderilen kurumsal
    iletişim mesajlarını (`communication.Message`: duyuru, ders notu PDF, sınav bilgisi,
    karne/cevap anahtarı, ödev planı/raporu, yoklama) tek bir temiz akışta birleştirir.
    """
    now_dt = timezone.localtime(timezone.now(), ISTANBUL)
    today = now_dt.date()
    recent_unread_cutoff = now_dt - timedelta(days=14)

    account = scope['account']
    raw_read = account.read_announcement_ids if isinstance(account.read_announcement_ids, list) else []
    read_keys = {str(x) for x in raw_read}

    rows = (
        Duyuru.objects.filter(
            kurum_id=scope['kurum_id'],
            aktif=True,
        )
        .filter(Q(yayin_tarihi__isnull=True) | Q(yayin_tarihi__lte=today))
        .order_by('-yayin_tarihi', '-created_at', '-id')[:40]
    )

    merged: list[dict] = []

    for row in rows:
        item_key = f'web:{row.id}'
        is_read = (item_key in read_keys) or (str(row.id) in read_keys)
        pub_date = row.yayin_tarihi or timezone.localtime(row.created_at, ISTANBUL).date()
        created_local = timezone.localtime(row.created_at, ISTANBUL)
        sort_dt = (
            datetime.combine(row.yayin_tarihi, created_local.timetz())
            if row.yayin_tarihi
            else created_local
        )
        formatted_body = _html_to_formatted_text(getattr(row, 'icerik', '') or row.ozet or '')
        clean_summary = _plain_preview_text(row.ozet or formatted_body, max_len=200)

        attachments = []
        if getattr(row, 'kapak_gorseli', None):
            try:
                cover_url = row.kapak_gorseli.url
                attachments.append({
                    'id': f'cover-{row.id}',
                    'name': row.baslik,
                    'mime_type': 'image/jpeg',
                    'file_size': 0,
                    'url': cover_url,
                    'is_pdf': False,
                    'is_image': True,
                })
            except Exception:
                pass

        merged.append({
            'id': row.id,
            'item_key': item_key,
            'source_kind': 'website',
            'category': 'duyuru',
            'category_label': 'Kurum Duyurusu',
            'recipient_channel': 'kampus',
            'title': row.baslik,
            'summary': clean_summary,
            'content': formatted_body,
            'published_date': pub_date.isoformat(),
            'published_at': sort_dt.isoformat(timespec='minutes'),
            'is_read': is_read,
            'attachments': attachments,
            '_sort_ts': sort_dt.timestamp(),
        })

    comm_msgs = _collect_student_comm_messages(scope)
    for idx, msg in enumerate(comm_msgs):
        item_key = f'msg:{msg.id}'
        local_created = timezone.localtime(msg.sent_at or msg.created_at, ISTANBUL)
        # 14 günden eski geçmiş mesajlar otomatik okunmuş kabul edilir; yeniler okundu işaretlenene dek yeni görünür
        is_read = (item_key in read_keys) or (local_created < recent_unread_cutoff)
        cat_code, cat_label = _comm_category_for_module(msg.source_module)
        attachments = _serialize_comm_attachments(msg)
        formatted_body = _html_to_formatted_text(msg.body or '')
        title = _derive_comm_message_title(msg, formatted_body, attachments)
        clean_summary = _plain_preview_text(formatted_body, max_len=200)
        if not formatted_body and attachments:
            formatted_body = f"Ek dosya paylaşıldı: {', '.join(a['name'] for a in attachments)}"
            clean_summary = formatted_body

        # Geriye dönük sayısal `id` bekleyen istemciler için negatif/benzersiz int + asıl `item_key`
        synthetic_int_id = -(100000 + idx + 1)
        merged.append({
            'id': synthetic_int_id,
            'item_key': item_key,
            'source_kind': 'message',
            'category': cat_code,
            'category_label': cat_label,
            'recipient_channel': 'ogrenci' if msg.conversation.veli_id is None else 'veli_hatti',
            'title': title,
            'summary': clean_summary,
            'content': formatted_body,
            'published_date': local_created.date().isoformat(),
            'published_at': local_created.isoformat(timespec='minutes'),
            'is_read': is_read,
            'attachments': attachments,
            '_sort_ts': local_created.timestamp(),
        })

    merged.sort(key=lambda it: it['_sort_ts'], reverse=True)

    unread_count = 0
    cat_counts: dict[str, int] = {code: 0 for code, _ in ANNOUNCEMENT_CATEGORIES}
    items = []
    for it in merged[:80]:
        it.pop('_sort_ts', None)
        if not it['is_read']:
            unread_count += 1
        cat_counts[it['category']] = cat_counts.get(it['category'], 0) + 1
        items.append(it)

    return {
        'unread_count': unread_count,
        'categories': [
            {'code': code, 'label': label, 'count': cat_counts.get(code, 0)}
            for code, label in ANNOUNCEMENT_CATEGORIES
            if cat_counts.get(code, 0) > 0
        ],
        'items': items,
    }


def mark_announcements_read(scope: dict, ids: list | None = None) -> dict:
    account = scope['account']
    raw_current = account.read_announcement_ids if isinstance(account.read_announcement_ids, list) else []
    current_ordered: list[str] = [str(x) for x in raw_current if x is not None]
    current_set = set(current_ordered)

    def _add_key(k: str) -> None:
        if k and k not in current_set:
            current_set.add(k)
            current_ordered.append(k)

    if ids:
        for raw_id in ids:
            if raw_id is None:
                continue
            s = str(raw_id).strip()
            if not s:
                continue
            _add_key(s)
            if s.isdigit():
                _add_key(f'web:{s}')
    else:
        feed = list_student_announcements(scope)
        for item in feed['items']:
            _add_key(str(item['item_key']))
            if item.get('source_kind') == 'website' and isinstance(item.get('id'), int) and item['id'] > 0:
                _add_key(str(item['id']))

    account.read_announcement_ids = current_ordered[-600:]
    account.save(update_fields=['read_announcement_ids', 'updated_at'])
    return list_student_announcements(scope)


# ─────────────────────────────────────────────────────────────────────────────
# Portal İçi Öğrenci <-> Koç Çift Yönlü Mesajlaşma
# ─────────────────────────────────────────────────────────────────────────────

def _serialize_portal_message(msg: StudentCoachMessage) -> dict:
    sender_name = ''
    if msg.sender_user:
        sender_name = msg.sender_user.get_full_name() or msg.sender_user.username
    return {
        'id': msg.id,
        'sender_kind': msg.sender_kind,
        'sender_name': sender_name,
        'body': msg.body,
        'created_at': timezone.localtime(msg.created_at, ISTANBUL).isoformat(timespec='seconds'),
        'read_by_student': msg.read_by_student_at is not None,
        'read_by_coach': msg.read_by_coach_at is not None,
    }


def list_student_coach_messages(scope: dict, *, mark_read: bool = True) -> dict:
    ogrenci = scope['ogrenci']
    coach_asgn = scope['coach_assignment']
    now = timezone.now()

    if mark_read:
        StudentCoachMessage.objects.filter(
            student_id=ogrenci.id,
            sender_kind=StudentCoachMessage.SenderKind.COACH,
            read_by_student_at__isnull=True,
        ).update(read_by_student_at=now)

    rows = list(
        StudentCoachMessage.objects.select_related('sender_user')
        .filter(student_id=ogrenci.id, kurum_id=scope['kurum_id'])
        .order_by('-created_at', '-id')[:120]
    )
    rows.reverse()

    coach_info = None
    if coach_asgn and coach_asgn.coach and coach_asgn.coach.teacher:
        t = coach_asgn.coach.teacher
        coach_info = {
            'coach_id': coach_asgn.coach_id,
            'full_name': f'{t.ad} {t.soyad}'.strip(),
            'photo_url': t.fotograf.url if t.fotograf else None,
        }

    unread_count = StudentCoachMessage.objects.filter(
        student_id=ogrenci.id,
        sender_kind=StudentCoachMessage.SenderKind.COACH,
        read_by_student_at__isnull=True,
    ).count()

    return {
        'coach': coach_info,
        'can_send': coach_info is not None,
        'unread_count': unread_count,
        'messages': [_serialize_portal_message(m) for m in rows],
    }


@transaction.atomic
def send_student_message_to_coach(scope: dict, body_text: str) -> dict:
    text = (body_text or '').strip()
    if not text:
        raise StudentPortalError('validation_error', 'Mesaj boş olamaz.', 400)
    if len(text) > 2000:
        raise StudentPortalError('validation_error', 'Mesaj en fazla 2000 karakter olabilir.', 400)

    coach_asgn = scope['coach_assignment']
    if coach_asgn is None or coach_asgn.coach is None:
        raise StudentPortalError(
            'no_coach',
            'Şu anda aktif bir koç atamanız bulunmadığı için mesaj gönderilemiyor.',
            400,
        )

    now = timezone.now()
    msg = StudentCoachMessage.objects.create(
        kurum_id=scope['kurum_id'],
        sube_id=scope['sube_id'],
        student_id=scope['ogrenci'].id,
        coach_id=coach_asgn.coach_id,
        sender_kind=StudentCoachMessage.SenderKind.STUDENT,
        sender_user=scope['user'],
        body=text,
        read_by_student_at=now,
    )
    return _serialize_portal_message(msg)


# Koç Portalı (Student360) için yardımcı okuma/yazma servisi
def coach_list_portal_messages(coach_user, student_id: int) -> dict:
    if not user_can_access_student(coach_user, student_id):
        raise StudentPortalError('forbidden', 'Bu öğrenciye erişim yetkiniz yok.', 403)

    now = timezone.now()
    StudentCoachMessage.objects.filter(
        student_id=student_id,
        sender_kind=StudentCoachMessage.SenderKind.STUDENT,
        read_by_coach_at__isnull=True,
    ).update(read_by_coach_at=now)

    rows = list(
        StudentCoachMessage.objects.select_related('sender_user')
        .filter(student_id=student_id)
        .order_by('-created_at', '-id')[:120]
    )
    rows.reverse()
    return {
        'student_id': student_id,
        'messages': [_serialize_portal_message(m) for m in rows],
    }


@transaction.atomic
def coach_send_portal_message(coach_user, student_id: int, body_text: str) -> dict:
    if not user_can_access_student(coach_user, student_id):
        raise StudentPortalError('forbidden', 'Bu öğrenciye erişim yetkiniz yok.', 403)

    text = (body_text or '').strip()
    if not text:
        raise StudentPortalError('validation_error', 'Mesaj boş olamaz.', 400)
    if len(text) > 2000:
        raise StudentPortalError('validation_error', 'Mesaj en fazla 2000 karakter olabilir.', 400)

    from apps.ogrenci.domain.models import Ogrenci

    student = Ogrenci.objects.filter(pk=student_id).first()
    if student is None:
        raise StudentPortalError('not_found', 'Öğrenci bulunamadı.', 404)

    cp = get_coach_profile(coach_user)
    if cp is None:
        asgn = (
            CoachStudentAssignment.objects.filter(
                student_id=student.id, is_primary=True, end_date__isnull=True,
            )
            .first()
        )
        cp_id = asgn.coach_id if asgn else None
    else:
        cp_id = cp.id

    now = timezone.now()
    msg = StudentCoachMessage.objects.create(
        kurum_id=student.kurum_id,
        sube_id=student.sube_id,
        student_id=student.id,
        coach_id=cp_id,
        sender_kind=StudentCoachMessage.SenderKind.COACH,
        sender_user=coach_user,
        body=text,
        read_by_coach_at=now,
    )
    return _serialize_portal_message(msg)


# ─────────────────────────────────────────────────────────────────────────────
# Saate Göre Şekil Değiştiren "Yaşayan Ana Ekran" (Context-Aware Living Home)
# ─────────────────────────────────────────────────────────────────────────────

def build_living_home(scope: dict) -> dict:
    """
    Günün saatine ve bağlamına göre ana ekran kokpitini oluşturur:
    - Bağlamsal mod (`exam_day`, `campus_hours`, `evening_focus`)
    - Sıradaki / Şu anki canlı ders kapsülü
    - Dijital Sınav Giriş Kartı (Boarding Pass)
    - Kampüs Story Kapsülleri (Yeni duyuru, koç strateji notu, rekor, son rozet)
    - Bugünün çalışma görevleri ve seri özeti
    - Kütüphane masa & dolap kartı
    """
    now_dt = timezone.localtime(timezone.now(), ISTANBUL)
    today = now_dt.date()

    # 7 günlük yakın takvim (bugün + yaklaşanlar)
    schedule = build_unified_schedule(scope, today, today + timedelta(days=7))
    today_schedule = schedule['days'][0]['items'] if schedule['days'] else []
    upcoming_items = []
    for day_entry in schedule['days'][1:]:
        for it in day_entry['items']:
            if it['kind'] in ('exam', 'private_lesson', 'homework', 'holiday', 'event'):
                upcoming_items.append({**it, 'date': day_entry['date']})
    upcoming_items = upcoming_items[:6]

    # Çalışma programı & bugünün blokları
    study = build_study_workspace(scope)
    today_study_day = None
    if study['active_program']:
        today_study_day = next(
            (d for d in study['active_program']['days'] if d['is_today']),
            None,
        )

    # Sınav özeti ve biniş kartı
    exams_overview = build_student_exams_overview(scope)
    boarding_pass = exams_overview['upcoming_boarding_pass']
    latest_exam = exams_overview['kpi']

    # Kampüs (masa/dolap/devam) + Duyuru + Koç mesaj sayacı + Başarı & Lig spotu
    campus = build_campus_life_and_attendance(scope)
    announcements = list_student_announcements(scope)
    achievements = build_student_achievements(scope, include_leaderboard=True)
    unread_coach_msgs = StudentCoachMessage.objects.filter(
        student_id=scope['ogrenci'].id,
        sender_kind=StudentCoachMessage.SenderKind.COACH,
        read_by_student_at__isnull=True,
    ).count()

    # Şu anki / Sıradaki ders kapsülü
    live_or_next_lesson = next(
        (it for it in today_schedule if it['state'] == 'live'),
        None,
    ) or next(
        (it for it in today_schedule if it['state'] == 'upcoming' and not it['all_day']),
        None,
    )

    # Bağlamsal mod seçimi
    hour = now_dt.hour
    if boarding_pass and boarding_pass['is_today']:
        context_mode = 'exam_day'
        greeting_subtitle = 'Sınav günü! Salon ve sıra numaran hazır, başarılar dileriz.'
    elif hour < 16 and live_or_next_lesson:
        context_mode = 'campus_hours'
        greeting_subtitle = (
            f"Şu an {live_or_next_lesson['title']} dersindesin."
            if live_or_next_lesson['state'] == 'live'
            else f"Sıradaki dersin: {live_or_next_lesson['start_time']} {live_or_next_lesson['title']}"
        )
    else:
        context_mode = 'evening_focus'
        remaining = (
            today_study_day['total_block_count'] - today_study_day['completed_block_count']
            if today_study_day
            else 0
        )
        greeting_subtitle = (
            f'Akşam odak zamanı · Bugün {remaining} çalışma görevin seni bekliyor.'
            if remaining > 0
            else 'Günün dersleri tamamlandı · Tekrar veya soru çözümü için harika bir saat.'
        )

    greeting_title = (
        f"Günaydın, {scope['ogrenci'].ad}" if 5 <= hour < 12
        else f"İyi günler, {scope['ogrenci'].ad}" if 12 <= hour < 18
        else f"İyi akşamlar, {scope['ogrenci'].ad}"
    )

    # Kampüs Story Kapsülleri (kaydırılabilir hikayeler)
    stories = []
    if boarding_pass:
        stories.append({
            'id': f"story-exam-{boarding_pass['exam_id']}",
            'badge': 'Sınav Kartı',
            'tone': 'orange',
            'title': boarding_pass['exam_name'],
            'body': f"{boarding_pass['exam_date']} · Saat {boarding_pass['start_time']} · {boarding_pass['room_name']}"
                    + (f" · Sıra {boarding_pass['seat_no']}" if boarding_pass['seat_no'] else ''),
            'cta_label': 'Sınavlara Git',
            'cta_href': '/ogrenci/sinavlar',
        })

    if study['active_program'] and study['active_program']['coach_note']:
        stories.append({
            'id': f"story-coach-note-{study['active_program']['id']}",
            'badge': 'Koçunun Strateji Notu',
            'tone': 'violet',
            'title': study['active_program']['coach_name'] or 'Koçundan Haftalık Mesaj',
            'body': study['active_program']['coach_note'],
            'cta_label': 'Çalışma Planını Aç',
            'cta_href': '/ogrenci/calisma',
        })

    hw_summary = study.get('assignments_summary') or {}
    next_hw = hw_summary.get('next_due')
    if next_hw:
        due_txt = (
            'Bugün kontrol günü!'
            if next_hw.get('is_due_today')
            else (
                'Kontrol tarihi geçti'
                if next_hw.get('is_overdue')
                else (
                    f"{next_hw['days_left']} gün kaldı ({next_hw['due_date']})"
                    if next_hw.get('days_left') is not None
                    else (next_hw.get('due_date') or '')
                )
            )
        )
        stories.append({
            'id': f"story-hw-{next_hw['id']}",
            'badge': 'Koç Ödevin',
            'tone': 'orange' if (next_hw.get('is_overdue') or next_hw.get('is_due_today')) else 'violet',
            'title': next_hw['title'],
            'body': f"{due_txt} · {next_hw['ready_task_count']}/{next_hw['task_count']} test hazırlandı.",
            'cta_label': 'Ödev İçeriğini Aç',
            'cta_href': f"/ogrenci/calisma?tab=odevler&assignment={next_hw['id']}",
        })

    if latest_exam:
        stories.append({
            'id': f"story-latest-exam-{latest_exam['latest_exam_id']}",
            'badge': 'Son Sınavın',
            'tone': 'blue',
            'title': f"{latest_exam['latest_exam_name']} · {latest_exam['latest_net']} Net",
            'body': (
                f"Kurum sırası: {latest_exam['latest_kurum_rank']}/{latest_exam['latest_kurum_total']}"
                if latest_exam['latest_kurum_rank']
                else f"Kişisel en yüksek netin: {latest_exam['personal_best_net']}"
            ),
            'cta_label': 'Analizi İncele',
            'cta_href': f"/ogrenci/sinavlar?exam={latest_exam['latest_exam_id']}",
        })

    for ann in announcements['items'][:2]:
        stories.append({
            'id': f"story-ann-{ann['item_key']}",
            'badge': (
                ('Yeni Mesaj' if ann.get('source_kind') == 'message' else 'Yeni Duyuru')
                if not ann['is_read']
                else (ann.get('category_label') or 'Kampüs Duyurusu')
            ),
            'tone': 'emerald' if not ann['is_read'] else 'slate',
            'title': ann['title'],
            'body': ann['summary'] or _plain_preview_text(ann['content'], max_len=200),
            'cta_label': 'Mesaj & Duyurular',
            'cta_href': '/ogrenci/iletisim?tab=duyurular',
        })

    if study['badges']:
        top_badge = study['badges'][0]
        stories.append({
            'id': f"story-badge-{top_badge['id']}",
            'badge': 'Son Rozetin',
            'tone': 'gold',
            'title': f"{top_badge['icon']} {top_badge['title']}",
            'body': top_badge['description'] or 'İstikrarlı çalışmanla yeni rozet kazandın!',
            'cta_label': 'Rozetlerim',
            'cta_href': '/ogrenci/calisma',
        })

    return {
        'server_time': now_dt.isoformat(timespec='seconds'),
        'context_mode': context_mode,
        'greeting_title': greeting_title,
        'greeting_subtitle': greeting_subtitle,
        'live_or_next_lesson': live_or_next_lesson,
        'boarding_pass': boarding_pass,
        'stories': stories,
        'today_schedule': today_schedule,
        'upcoming_items': upcoming_items,
        'today_study': today_study_day,
        'study_summary': {
            'has_program': study['active_program'] is not None,
            'week_completion_percent': study['active_program']['completion_percent'] if study['active_program'] else 0,
            'streak_days': study['streak_days'],
            'total_focused_minutes': study['total_focused_minutes'],
            'badges_count': achievements['summary']['unlocked_count'],
            'total_badges_count': achievements['summary']['total_count'],
            'active_homework_count': int(hw_summary.get('active_count') or 0),
        },
        'homework_summary': hw_summary,
        'achievements_spotlight': {
            'level': achievements['level'],
            'student_track': achievements['student_track'],
            'monthly_season': {
                'month_label': achievements['monthly_season']['month_label'],
                'days_remaining': achievements['monthly_season']['days_remaining'],
                'completed_quests_count': achievements['monthly_season']['completed_quests_count'],
                'total_quests_count': achievements['monthly_season']['total_quests_count'],
                'season_medal_unlocked': achievements['monthly_season']['season_medal_unlocked'],
            },
            'pinned_badge': achievements['pinned_badge'],
            'closest_target': achievements['closest_target'],
            'unlocked_count': achievements['summary']['unlocked_count'],
            'total_count': achievements['summary']['total_count'],
            'league': {
                'scope_label': achievements['leaderboard']['scope_label'],
                'my_rank': achievements['leaderboard']['my_rank'],
                'my_weekly_focus_minutes': achievements['leaderboard']['my_weekly_focus_minutes'],
                'minutes_to_overtake_next': achievements['leaderboard']['minutes_to_overtake_next'],
            } if achievements.get('leaderboard') else None,
        },
        'latest_exam': latest_exam,
        'campus': {
            'seat': campus['seat'],
            'locker': campus['locker'],
            'attendance_rate': campus['attendance']['rate_percent'],
        },
        'counters': {
            'unread_coach_messages': unread_coach_msgs,
            'unread_announcements': announcements['unread_count'],
        },
    }
