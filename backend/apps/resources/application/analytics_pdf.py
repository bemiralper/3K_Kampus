"""Kaynak analiz HTML → PDF — her analiz sekmesi için ayrı rapor."""
from __future__ import annotations

import html

from django.utils import timezone

from apps.communication.application.html_to_pdf import render_html_to_pdf
from apps.resources.application import analytics as A


REPORT_TITLES = {
    'ozet': 'Özet Raporu',
    'kullanim': 'Kullanım Raporu',
    'yayinevi': 'Yayınevi Raporu',
    'ders': 'Ders Raporu',
    'icerik': 'İçerik Raporu',
    'koc': 'Koç Raporu',
    'atil': 'Atıl Kaynaklar Raporu',
    'degisim': 'Değişim Raporu',
}

# Eski istemci / kayıtlı bağlantılar
REPORT_ALIASES = {
    'genel': 'ozet',
    'top': 'kullanim',
    'kullanilan': 'kullanim',
    'eksik': 'icerik',
    'mudahale': 'icerik',
    'tamamlanma': 'ders',
}


def normalize_report_type(report_type: str | None) -> str:
    key = (report_type or 'ozet').strip().lower()
    key = REPORT_ALIASES.get(key, key)
    if key not in REPORT_TITLES:
        return 'ozet'
    return key


def _table(headers: list[str], rows: list[list]) -> str:
    th = ''.join(f'<th>{html.escape(str(h))}</th>' for h in headers)
    body = ''
    for row in rows:
        tds = ''.join(f'<td>{html.escape(str(c))}</td>' for c in row)
        body += f'<tr>{tds}</tr>'
    if not rows:
        body = f'<tr><td colspan="{len(headers)}">Kayıt yok</td></tr>'
    return f'<table><thead><tr>{th}</tr></thead><tbody>{body}</tbody></table>'


def _request_extra(request, key: str) -> str | None:
    return A._filter_value(request, key)


def _filter_caption(request) -> str:
    f = A._parse_filters(request)
    parts: list[str] = []
    icerik = f.get('icerik')
    if icerik == 'tamam':
        parts.append('İçerik: Tamam')
    elif icerik == 'eksik':
        parts.append('İçerik: Eksik')
    else:
        parts.append('İçerik: Tümü')

    publisher_id = f.get('publisher_id')
    if publisher_id:
        if str(publisher_id).lower() in ('null', 'none', 'empty', '0'):
            parts.append('Yayınevi: Boş')
        else:
            from apps.resources.models import ResourcePublisher
            pub = ResourcePublisher.objects.filter(pk=publisher_id).first()
            parts.append(f'Yayınevi: {pub.ad if pub else publisher_id}')

    ders_id = f.get('ders_id')
    if ders_id:
        from apps.egitim_tanimlari.models import Ders
        ders = Ders.objects.filter(pk=ders_id).first()
        parts.append(f'Ders: {ders.ad if ders else ders_id}')

    sinif_id = f.get('sinif_id')
    if sinif_id:
        from apps.egitim_tanimlari.models import SinifSeviyesi
        sinif = SinifSeviyesi.objects.filter(pk=sinif_id).first()
        parts.append(f'Sınıf: {sinif.ad if sinif else sinif_id}')

    date_from = f.get('date_from')
    date_to = f.get('date_to')
    if date_from or date_to:
        parts.append(f'Tarih: {date_from or "…"} – {date_to or "…"}')

    days = _request_extra(request, 'days')
    if days:
        parts.append(f'Atıl penceresi: son {days} gün')

    metric = _request_extra(request, 'metric')
    if metric == 'intensity':
        parts.append('Sıralama: ödev kullanımı')
    elif metric == 'students':
        parts.append('Sıralama: havuzdaki öğrenci')

    return ' · '.join(parts)


def _sections_ozet(request) -> list[str]:
    s = A.summary(request)
    actions = A.action_items(request)
    priority = A.priority_summary(request)
    rate = A.usage_rate(request)
    return [
        '<h2>Genel Durum</h2>',
        _table(
            ['Metrik', 'Değer'],
            [
                ['Toplam Kaynak', s['total_books']],
                ['Kullanılan', s['used_books']],
                ['Havuz ataması (öğrenci-kitap)', s['student_assignments']],
                ['Yayınevi', s['publisher_count']],
                ['İçeriği Tamam', s['content_complete']],
                ['İçeriği Eksik', s['content_incomplete']],
                ['Yayınevi eşleşmemiş', s['unmatched_publisher']],
            ],
        ),
        '<h2>Aksiyon Gerekenler</h2>',
        _table(
            ['Kalem', 'Adet'],
            [
                ['Çok kullanılan + içerik eksik', actions.get('hot_incomplete', 0)],
                ['İçerik tamamlanmamış', actions.get('content_incomplete', 0)],
                ['Kullanılmayan', actions.get('idle_books', 0)],
                ['Yayınevi eşleşmemiş', actions.get('unmatched_publisher', 0)],
            ],
        ),
        '<h2>Öncelik ve kullanım oranı</h2>',
        _table(
            ['Metrik', 'Değer'],
            [
                ['Kritik', priority.get('kritik', 0)],
                ['Yüksek', priority.get('yuksek', 0)],
                ['Orta', priority.get('orta', 0)],
                ['Düşük', priority.get('dusuk', 0)],
                ['Kullanım oranı %', rate.get('usage_rate_percent', 0)],
            ],
        ),
    ]


def _usage_rows(request) -> list[dict]:
    metric = _request_extra(request, 'metric') or 'students'
    if metric not in ('students', 'intensity', 'any'):
        metric = 'students'
    return A.top_books(request, metric=metric, limit=0, used_only=True)


def _sections_kullanim(request) -> list[str]:
    rows = _usage_rows(request)
    trend = A.usage_trend(request)
    return [
        '<h2>Kullanılan Kitaplar</h2>',
        f'<p class="note">{len(rows)} kullanılan kitap (içerik filtresi uygulanmış)</p>',
        _table(
            ['Kitap', 'Yayınevi', 'Ders', 'Havuzdaki öğrenci', 'Ödev kullanımı', 'İçerik'],
            [
                [
                    r['ad'],
                    r['publisher_ad'] or '—',
                    r['ders_ad'],
                    r['student_count'],
                    r['intensity'],
                    'Tamam' if r['icerik_tamamlandi_mi'] else 'Eksik',
                ]
                for r in rows
            ],
        ),
        '<h2>Trend</h2>',
        _table(
            ['Ay', 'Havuza ekleme', 'Ödev kullanımı'],
            [[r['month'], r['assignments'], r['intensity']] for r in trend],
        ),
    ]


def _sections_yayinevi(request) -> list[str]:
    pubs = A.publishers_report(request)
    return [
        '<h2>Yayınevi Kullanımı</h2>',
        _table(
            ['Yayınevi', 'Kitap', 'Havuzdaki öğrenci', 'Ödev kullanımı', 'Pay %'],
            [
                [
                    p['publisher_ad'], p['book_count'], p['student_count'],
                    p['intensity'], p['share_percent'],
                ]
                for p in pubs
            ],
        ),
    ]


def _sections_ders(request) -> list[str]:
    lessons = A.by_lesson(request)
    avg = A.avg_per_student(request)
    matrix = A.lesson_publisher_matrix(request)
    sections = [
        '<h2>Ders Bazlı Analiz</h2>',
        _table(
            ['Ders', 'Kitap', 'Kullanılan', 'Tamam', 'Eksik', 'İlişki'],
            [
                [
                    r['ders_ad'], r['book_count'], r['used_books'],
                    r['content_complete'], r['content_incomplete'],
                    r['student_assignments'],
                ]
                for r in lessons
            ],
        ),
        '<h2>Öğrenci başına ortalama</h2>',
        _table(
            ['Ders', 'Öğrenci', 'Ortalama'],
            [[r['ders_ad'], r['student_count'], r['avg_resources']] for r in avg],
        ),
    ]
    publishers = (matrix or {}).get('publishers') or []
    if publishers and len(publishers) <= 14:
        headers = ['Ders'] + [p['ad'] for p in publishers]
        matrix_rows = []
        for row in (matrix or {}).get('rows') or []:
            matrix_rows.append(
                [row['ders_ad']]
                + [row.get('values', {}).get(str(p['id'] or 0), 0) for p in publishers]
            )
        sections.extend([
            '<h2>Ders × Yayınevi</h2>',
            _table(headers, matrix_rows),
        ])
    elif publishers:
        sections.append(
            f'<p class="note">Ders × Yayınevi matrisi {len(publishers)} yayınevi '
            'içerdiği için PDF’e eklenmedi. Ekrandan inceleyin.</p>'
        )
    return sections


def _sections_icerik(request) -> list[str]:
    incomplete = A.incomplete_books(request)
    inter = A.intervention(request)
    hot = A.hot_incomplete(request)
    return [
        '<h2>İçeriği Eksik</h2>',
        _table(
            ['Kitap', 'Ders', 'Yayınevi', 'Havuzdaki öğrenci', 'Öncelik'],
            [
                [
                    r['ad'], r['ders_ad'], r['publisher_ad'] or '—',
                    r['student_count'], r['priority'],
                ]
                for r in incomplete
            ],
        ),
        '<h2>Müdahale Gereken</h2>',
        _table(
            ['Öncelik', 'Kitap', 'Havuzdaki öğrenci'],
            [[r['priority'], r['ad'], r['student_count']] for r in inter],
        ),
        '<h2>Çok kullanılan + eksik</h2>',
        _table(
            ['Kitap', 'Havuzdaki öğrenci', 'Ödev kullanımı', 'Yayınevi'],
            [
                [r['ad'], r['student_count'], r['intensity'], r['publisher_ad'] or '—']
                for r in hot
            ],
        ),
    ]


def _sections_koc(request) -> list[str]:
    rows = A.by_coach(request)
    return [
        '<h2>Koç Bazlı Kullanım</h2>',
        _table(
            ['Koç', 'Öğrenci sayısı', 'Havuz ataması', 'Öğrenci başı kaynak'],
            [
                [r['coach_ad'], r['student_count'], r['resource_count'], r['avg_resources']]
                for r in rows
            ],
        ),
    ]


def _sections_atil(request) -> list[str]:
    days_raw = _request_extra(request, 'days')
    days = int(days_raw) if days_raw not in (None, '', 'null') else None
    rows = A.idle_books(request, days=days)
    window = f'Son {days} günde atama yok' if days else 'Hiç kullanılmayan'
    return [
        '<h2>Atıl Kaynaklar</h2>',
        f'<p class="note">{window} · {len(rows)} kitap</p>',
        _table(
            ['Kitap', 'Ders', 'Yayınevi'],
            [[r['ad'], r['ders_ad'], r['publisher_ad'] or '—'] for r in rows],
        ),
    ]


def _sections_degisim(request) -> list[str]:
    growth = A.pool_growth(request)
    churn_rows = A.churn(request)
    return [
        '<h2>Havuz büyüme</h2>',
        _table(
            ['Ay', 'Eklenen', 'Kaldırılan', 'Net', 'Büyüme %'],
            [
                [
                    r['month'], r['added'], r['removed'], r['net'],
                    r['growth_percent'] if r['growth_percent'] is not None else '—',
                ]
                for r in growth
            ],
        ),
        '<h2>Havuza giriş-çıkış</h2>',
        _table(
            ['Kitap', 'Eklenme', 'Kaldırılma', 'Net'],
            [[r['ad'], r['added'], r['removed'], r['net']] for r in churn_rows],
        ),
    ]


SECTION_BUILDERS = {
    'ozet': _sections_ozet,
    'kullanim': _sections_kullanim,
    'yayinevi': _sections_yayinevi,
    'ders': _sections_ders,
    'icerik': _sections_icerik,
    'koc': _sections_koc,
    'atil': _sections_atil,
    'degisim': _sections_degisim,
}


def build_analytics_html(request, report_type: str = 'ozet') -> str:
    report_type = normalize_report_type(report_type)
    title = REPORT_TITLES[report_type]
    now = timezone.localtime(timezone.now()).strftime('%d.%m.%Y %H:%M')
    filters = _filter_caption(request)
    sections = SECTION_BUILDERS[report_type](request)
    body = '\n'.join(sections)
    return f"""<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8"/>
<title>{html.escape(title)}</title>
<style>
  body {{ font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 24px; font-size: 12px; }}
  h1 {{ color: #1F3C88; font-size: 20px; margin: 0 0 4px; }}
  h2 {{ color: #1F3C88; font-size: 14px; margin: 20px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }}
  .meta {{ color: #64748b; margin-bottom: 8px; }}
  .filters {{ color: #334155; margin-bottom: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; }}
  .note {{ color: #64748b; margin: 0 0 8px; }}
  table {{ width: 100%; border-collapse: collapse; margin-bottom: 12px; }}
  th, td {{ border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }}
  th {{ background: #f1f5f9; font-weight: 600; }}
  .brand {{ font-weight: 700; color: #1F3C88; letter-spacing: 0.02em; }}
</style></head>
<body>
  <div class="brand">3K KAMPÜS</div>
  <h1>Kaynak Yönetimi — {html.escape(title)}</h1>
  <div class="meta">Rapor tarihi: {now}</div>
  <div class="filters">{html.escape(filters)}</div>
  {body}
</body></html>"""


def build_analytics_pdf(request, report_type: str = 'ozet') -> bytes:
    html_doc = build_analytics_html(request, report_type=report_type)
    return render_html_to_pdf(html_doc)
