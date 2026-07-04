"""Purchase list PDF/HTML rendering with 3K Kampüs branding."""

import base64
import re
from pathlib import Path

from django.conf import settings

BRAND_PRIMARY = '#1F3C88'
BRAND_PRIMARY_DARK = '#162D6B'
BRAND_SECONDARY = '#F4B400'
BRAND_ACCENT = '#2EC4B6'


def get_logo_data_uri():
    candidates = [
        Path(settings.BASE_DIR).parent / 'frontend' / 'public' / 'img' / '3k-logo.png',
        Path(settings.BASE_DIR) / 'static' / 'img' / '3k-logo.png',
    ]
    for path in candidates:
        if path.is_file():
            encoded = base64.b64encode(path.read_bytes()).decode('ascii')
            return f'data:image/png;base64,{encoded}'

    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="48" viewBox="0 0 120 48">'
        f'<rect width="120" height="48" rx="8" fill="{BRAND_PRIMARY}"/>'
        f'<text x="60" y="30" text-anchor="middle" fill="white" font-family="Arial,sans-serif"'
        ' font-size="16" font-weight="700">3K KAMPÜS</text></svg>'
    )
    return 'data:image/svg+xml;base64,' + base64.b64encode(svg.encode()).decode('ascii')


def make_download_filename(purchase_list, student):
    title = purchase_list.title or purchase_list.get_list_type_display()
    raw = f"{title}_{student.ad}_{student.soyad}_{purchase_list.created_at:%Y-%m-%d}"
    safe = re.sub(r'[^\w\s\-]', '', raw, flags=re.UNICODE)
    safe = re.sub(r'[\s\-]+', '_', safe.strip())
    return f"{safe}.html"


def _difficulty_from_book(book):
    if book.zorluk_min and book.zorluk_max:
        return f"{book.zorluk_min}-{book.zorluk_max}"
    if book.zorluk_min:
        return f"{book.zorluk_min}+"
    if book.zorluk_max:
        return f"1-{book.zorluk_max}"
    return '—'


def _item_row(item):
    if item.assignment_id:
        book = item.assignment.resource_book
        lesson_name = item.lesson_name_snapshot or item.assignment.lesson.ad
        name = item.book_name_snapshot or book.ad
        publisher = item.book_publisher_snapshot or book.yayinevi or ''
        book_type = book.book_type.ad if book.book_type else ''
        difficulty = item.difficulty_snapshot or _difficulty_from_book(book)
    else:
        book = item.resource_book
        lesson_name = item.lesson_name_snapshot or (item.lesson.ad if item.lesson else book.ders.ad)
        name = item.book_name_snapshot or book.ad
        publisher = item.book_publisher_snapshot or book.yayinevi or ''
        book_type = book.book_type.ad if book.book_type else ''
        difficulty = item.difficulty_snapshot or _difficulty_from_book(book)

    return {
        'lesson_name': lesson_name,
        'name': name,
        'publisher': publisher,
        'book_type': book_type,
        'difficulty': difficulty,
        'quantity': item.quantity,
        'source_note': item.source_note or '',
    }


def build_purchase_list_html(purchase_list, student, kurum, sinif_adi, coach_name):
    from .models import ResourcePurchaseList, ResourcePurchaseListItem

    logo = get_logo_data_uri()
    list_title = purchase_list.title or ''

    if purchase_list.list_type == ResourcePurchaseList.ListType.INSTITUTION:
        doc_title = list_title or 'Kurum Kaynak Listesi'
        subtitle = 'Aşağıdaki kaynaklar tarafınızdan öğrenciye teslim edilecektir.'
        accent = BRAND_ACCENT
        gradient = f'linear-gradient(135deg, {BRAND_PRIMARY} 0%, {BRAND_ACCENT} 100%)'
    else:
        doc_title = list_title or 'Kırtasiye Satın Alma Listesi'
        subtitle = 'Aşağıdaki kaynakların belirlenen yerden temin edilmesi gerekmektedir.'
        accent = BRAND_SECONDARY
        gradient = f'linear-gradient(135deg, {BRAND_PRIMARY} 0%, {BRAND_PRIMARY_DARK} 100%)'

    lessons = {}
    total_count = 0
    pending_items = purchase_list.items.filter(
        item_status=ResourcePurchaseListItem.ItemStatus.PENDING,
    )
    for item in pending_items.select_related(
        'assignment__lesson',
        'assignment__resource_book',
        'assignment__resource_book__book_type',
        'resource_book',
        'resource_book__book_type',
        'resource_book__ders',
        'lesson',
    ):
        row = _item_row(item)
        lessons.setdefault(row['lesson_name'], []).append(row)
        total_count += row['quantity']

    tc_masked = (
        f"{student.tc_kimlik_no[:4]}****{student.tc_kimlik_no[-3:]}"
        if student.tc_kimlik_no else '-'
    )

    stationery_block = ''
    if purchase_list.stationery_name or purchase_list.stationery_address:
        stationery_block = f"""
        <div class="info-box full-width">
            <h3>Temin Yeri</h3>
            <p><strong>{purchase_list.stationery_name or '—'}</strong></p>
            <p>{purchase_list.stationery_address or ''}</p>
        </div>"""

    lesson_sections = ''
    for lesson_name, books in sorted(lessons.items()):
        rows = ''
        for book in books:
            rows += f"""
                <tr>
                    <td><strong>{book['name']}</strong></td>
                    <td>{book['publisher']}</td>
                    <td><span class="pill">{book['book_type']}</span></td>
                    <td class="center">{book['difficulty']}</td>
                    <td>{book['source_note'] or '—'}</td>
                    <td class="center">{book['quantity']}</td>
                    <td class="center"><span class="checkbox"></span></td>
                </tr>"""

        lesson_sections += f"""
        <section class="lesson-card">
            <div class="lesson-head">{lesson_name} <span class="count">{len(books)} kaynak</span></div>
            <table>
                <thead>
                    <tr>
                        <th>Kaynak</th>
                        <th>Yayınevi</th>
                        <th>Tür</th>
                        <th class="center">Zorluk</th>
                        <th>Temini / Kaynak</th>
                        <th class="center">Adet</th>
                        <th class="center">✓</th>
                    </tr>
                </thead>
                <tbody>{rows}</tbody>
            </table>
        </section>"""

    notes_block = ''
    if purchase_list.notes:
        notes_block = f'<div class="notes"><strong>Not:</strong> {purchase_list.notes}</div>'

    return f"""<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <title>{doc_title} — {student.ad} {student.soyad}</title>
    <style>
        @page {{ size: A4; margin: 12mm; }}
        * {{ box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
        body {{ font-family: 'Segoe UI', system-ui, sans-serif; background: #eef2f7; color: #1e293b; font-size: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
        .page {{ max-width: 210mm; margin: 16px auto; background: #fff; border-radius: 14px; overflow: hidden; box-shadow: 0 12px 40px rgba(31,60,136,0.12); }}
        .hero {{ background: {gradient}; color: #fff; padding: 22px 26px; display: flex; gap: 18px; align-items: center; }}
        .logo {{ width: 64px; height: 64px; border-radius: 12px; background: rgba(255,255,255,0.95); padding: 8px; flex-shrink: 0; }}
        .logo img {{ width: 100%; height: 100%; object-fit: contain; }}
        .hero-text h1 {{ font-size: 20px; font-weight: 700; margin-bottom: 4px; }}
        .hero-text .kurum {{ opacity: 0.9; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }}
        .hero-text .subtitle {{ opacity: 0.92; font-size: 12px; margin-top: 6px; }}
        .content {{ padding: 22px 26px 28px; }}
        .info-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 18px; }}
        .info-box {{ background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid {accent}; border-radius: 10px; padding: 12px 14px; }}
        .info-box.full-width {{ grid-column: 1 / -1; }}
        .info-box h3 {{ font-size: 10px; text-transform: uppercase; color: #64748b; margin-bottom: 8px; letter-spacing: 0.06em; }}
        .info-box p {{ margin-bottom: 4px; }}
        .highlight {{ color: {BRAND_PRIMARY}; font-weight: 700; }}
        .lesson-card {{ border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-bottom: 12px; }}
        .lesson-head {{ background: {BRAND_PRIMARY}; color: #fff; padding: 8px 14px; font-weight: 600; display: flex; justify-content: space-between; }}
        .lesson-head .count {{ background: rgba(255,255,255,0.15); padding: 2px 8px; border-radius: 999px; font-size: 10px; }}
        table {{ width: 100%; border-collapse: collapse; }}
        th, td {{ padding: 8px 10px; text-align: left; border-bottom: 1px solid #f1f5f9; }}
        th {{ background: #f8fafc; font-size: 10px; text-transform: uppercase; color: #64748b; }}
        tr:last-child td {{ border-bottom: none; }}
        .center {{ text-align: center; }}
        .pill {{ display: inline-block; background: rgba(31,60,136,0.08); color: {BRAND_PRIMARY}; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; }}
        .checkbox {{ display: inline-block; width: 14px; height: 14px; border: 2px solid #94a3b8; border-radius: 4px; }}
        .summary {{ margin-top: 16px; padding: 14px 16px; background: linear-gradient(90deg, rgba(31,60,136,0.06), rgba(244,180,0,0.08)); border-radius: 10px; display: flex; justify-content: space-between; }}
        .summary strong {{ color: {BRAND_PRIMARY}; font-size: 14px; }}
        .notes {{ margin-top: 12px; padding: 10px 12px; background: #fffbeb; border-left: 4px solid {BRAND_SECONDARY}; border-radius: 8px; font-size: 11px; }}
        .footer {{ margin-top: 22px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }}
        .sig-line {{ border-bottom: 1px solid #334155; height: 36px; margin-bottom: 6px; }}
        .sig-label {{ text-align: center; font-size: 10px; color: #64748b; }}
        .print-btn {{ position: fixed; bottom: 24px; right: 24px; background: {BRAND_PRIMARY}; color: #fff; border: none; border-radius: 10px; padding: 12px 22px; font-weight: 700; cursor: pointer; }}
        @media print {{
            * {{ -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }}
            body {{ background: #fff; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }}
            .page {{ margin: 0; box-shadow: none; }}
            .print-btn {{ display: none; }}
            .lesson-card {{ page-break-inside: avoid; }}
            .hero {{ background: {gradient} !important; color: #fff !important; }}
            .lesson-head {{ background: {BRAND_PRIMARY} !important; color: #fff !important; }}
            .lesson-head .count {{ background: rgba(255,255,255,0.15) !important; }}
            .info-box {{ background: #f8fafc !important; border-left-color: {accent} !important; }}
            .pill {{ background: rgba(31,60,136,0.08) !important; color: {BRAND_PRIMARY} !important; }}
            .summary {{ background: linear-gradient(90deg, rgba(31,60,136,0.06), rgba(244,180,0,0.08)) !important; }}
            .notes {{ background: #fffbeb !important; border-left-color: {BRAND_SECONDARY} !important; }}
            th {{ background: #f8fafc !important; }}
        }}
    </style>
</head>
<body>
    <div class="page">
        <div class="hero">
            <div class="logo"><img src="{logo}" alt="3K Kampüs"></div>
            <div class="hero-text">
                <div class="kurum">{kurum.ad if kurum else '3K Kampüs'}</div>
                <h1>{doc_title}</h1>
                <p class="subtitle">{subtitle}</p>
            </div>
        </div>
        <div class="content">
            <div class="info-grid">
                <div class="info-box">
                    <h3>Öğrenci</h3>
                    <p><strong>Ad Soyad:</strong> <span class="highlight">{student.ad} {student.soyad}</span></p>
                    <p><strong>Sınıf:</strong> {sinif_adi}</p>
                    <p><strong>TC:</strong> {tc_masked}</p>
                </div>
                <div class="info-box">
                    <h3>Liste</h3>
                    <p><strong>Maestro Koç:</strong> {coach_name or '—'}</p>
                    <p><strong>Tarih:</strong> {purchase_list.created_at:%d.%m.%Y}</p>
                    <p><strong>Toplam:</strong> <span class="highlight">{total_count} adet</span></p>
                </div>
                {stationery_block}
            </div>
            {lesson_sections}
            {notes_block}
            <div class="summary">
                <strong>Toplam {total_count} kaynak</strong>
                <span>Oluşturulma: {purchase_list.created_at:%d.%m.%Y %H:%M}</span>
            </div>
            <div class="footer">
                <div><div class="sig-line"></div><div class="sig-label">Teslim Alan (Öğrenci / Veli)</div></div>
                <div><div class="sig-line"></div><div class="sig-label">Teslim Eden (Kurum Yetkilisi)</div></div>
            </div>
        </div>
    </div>
    <button class="print-btn" onclick="window.print()">Yazdır / PDF Kaydet</button>
</body>
</html>"""
