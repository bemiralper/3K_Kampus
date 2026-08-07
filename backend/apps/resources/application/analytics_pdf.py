"""Kaynak analiz HTML → PDF."""
from __future__ import annotations

import html
from datetime import datetime

from django.utils import timezone

from apps.communication.application.html_to_pdf import render_html_to_pdf
from apps.resources.application import analytics as A


REPORT_TITLES = {
    'genel': 'Genel Kaynak Raporu',
    'yayinevi': 'Yayınevi Kullanım Raporu',
    'ders': 'Ders Bazlı Kaynak Raporu',
    'tamamlanma': 'İçerik Tamamlanma Raporu',
    'eksik': 'Eksik İçerikli Kaynaklar',
    'kullanilan': 'Öğrencilerde Kullanılan Kaynaklar',
    'top': 'En Çok Kullanılan Kaynaklar',
    'mudahale': 'Müdahale Gerektiren Kaynaklar',
}


def _table(headers: list[str], rows: list[list]) -> str:
    th = ''.join(f'<th>{html.escape(str(h))}</th>' for h in headers)
    body = ''
    for row in rows:
        tds = ''.join(f'<td>{html.escape(str(c))}</td>' for c in row)
        body += f'<tr>{tds}</tr>'
    return f'<table><thead><tr>{th}</tr></thead><tbody>{body}</tbody></table>'


def build_analytics_html(request, report_type: str = 'genel') -> str:
    title = REPORT_TITLES.get(report_type, REPORT_TITLES['genel'])
    now = timezone.localtime(timezone.now()).strftime('%d.%m.%Y %H:%M')
    sections = []

    s = A.summary(request)
    sections.append('<h2>Genel Durum</h2>')
    sections.append(_table(
        ['Metrik', 'Değer'],
        [
            ['Toplam Kitap', s['total_books']],
            ['Kullanılan Kitap', s['used_books']],
            ['Havuz ataması (öğrenci-kitap)', s['student_assignments']],
            ['İçeriği Tamamlanan', s['content_complete']],
            ['İçeriği Eksik', s['content_incomplete']],
            ['Yayınevi', s['publisher_count']],
            ['Yayınevi Eşleşmemiş', s['unmatched_publisher']],
        ],
    ))

    if report_type in ('genel', 'yayinevi'):
        pubs = A.publishers_report(request)[:20]
        sections.append('<h2>Yayınevi Kullanımı</h2>')
        sections.append(_table(
            ['Yayınevi', 'Kitap', 'Havuzdaki öğrenci', 'Ödev kullanımı', 'Pay %'],
            [
                [p['publisher_ad'], p['book_count'], p['student_count'], p['intensity'], p['share_percent']]
                for p in pubs
            ],
        ))

    if report_type in ('genel', 'ders', 'tamamlanma'):
        lessons = A.by_lesson(request)
        sections.append('<h2>Ders Bazlı Analiz</h2>')
        sections.append(_table(
            ['Ders', 'Kitap', 'Kullanılan', 'Tamam', 'Eksik', 'İlişki'],
            [
                [
                    r['ders_ad'], r['book_count'], r['used_books'],
                    r['content_complete'], r['content_incomplete'],
                    r['student_assignments'],
                ]
                for r in lessons
            ],
        ))

    if report_type in ('genel', 'top', 'kullanilan'):
        top = A.top_books(request, metric='students', limit=20)
        sections.append('<h2>En Çok Kullanılan Kitaplar</h2>')
        sections.append(_table(
            ['Kitap', 'Yayınevi', 'Ders', 'Havuzdaki öğrenci', 'İçerik'],
            [
                [
                    r['ad'], r['publisher_ad'], r['ders_ad'], r['student_count'],
                    'Tamam' if r['icerik_tamamlandi_mi'] else 'Eksik',
                ]
                for r in top
            ],
        ))

    if report_type in ('genel', 'eksik', 'mudahale', 'tamamlanma'):
        rows = A.intervention(request) if report_type == 'mudahale' else A.incomplete_books(request)
        sections.append('<h2>Eksik / Müdahale Kaynaklar</h2>')
        sections.append(_table(
            ['Kitap', 'Ders', 'Yayınevi', 'Havuzdaki öğrenci', 'Öncelik'],
            [
                [r['ad'], r['ders_ad'], r['publisher_ad'], r['student_count'], r['priority']]
                for r in rows[:40]
            ],
        ))

    body = '\n'.join(sections)
    return f"""<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8"/>
<title>{html.escape(title)}</title>
<style>
  body {{ font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 24px; font-size: 12px; }}
  h1 {{ color: #1F3C88; font-size: 20px; margin: 0 0 4px; }}
  h2 {{ color: #1F3C88; font-size: 14px; margin: 20px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }}
  .meta {{ color: #64748b; margin-bottom: 16px; }}
  table {{ width: 100%; border-collapse: collapse; margin-bottom: 12px; }}
  th, td {{ border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }}
  th {{ background: #f1f5f9; font-weight: 600; }}
  .brand {{ font-weight: 700; color: #1F3C88; letter-spacing: 0.02em; }}
</style></head>
<body>
  <div class="brand">3K KAMPÜS</div>
  <h1>Kaynak Yönetimi Analiz Raporu</h1>
  <div class="meta">{html.escape(title)} · Rapor tarihi: {now}</div>
  {body}
</body></html>"""


def build_analytics_pdf(request, report_type: str = 'genel') -> bytes:
    html_doc = build_analytics_html(request, report_type=report_type)
    return render_html_to_pdf(html_doc)
