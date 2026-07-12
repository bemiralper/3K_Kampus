"""Sayfa SEO skoru (0–100) ve site geneli uyarılar."""
from __future__ import annotations

import re
from typing import Any

from apps.website.cms_models import IntegrationSettings, MediaAsset, WebPage


def _strip_html(html: str) -> str:
    return re.sub(r'<[^>]+>', ' ', html or '')


def score_page(page: WebPage, blocks: list[dict] | None = None) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    score = 100

    def deduct(points: int, code: str, message: str, severity: str = 'warn'):
        nonlocal score
        score = max(0, score - points)
        checks.append({'code': code, 'message': message, 'severity': severity, 'points': points})

    title = page.meta_title or page.title or ''
    if not title:
        deduct(15, 'missing_title', 'Meta başlık eksik', 'error')
    elif len(title) < 30:
        deduct(5, 'title_short', 'Meta başlık çok kısa (<30)')
    elif len(title) > 60:
        deduct(5, 'title_long', 'Meta başlık çok uzun (>60)')

    desc = page.meta_description or ''
    if not desc:
        deduct(15, 'missing_description', 'Meta açıklama eksik', 'error')
    elif len(desc) < 70:
        deduct(5, 'description_short', 'Meta açıklama kısa')
    elif len(desc) > 160:
        deduct(5, 'description_long', 'Meta açıklama uzun (>160)')

    if not page.canonical_url and not page.is_homepage:
        deduct(5, 'missing_canonical', 'Canonical URL boş')

    if len(page.slug or '') > 80:
        deduct(5, 'slug_long', 'URL / slug çok uzun')

    html_parts: list[str] = []
    h1_count = 0
    img_missing_alt = 0
    for block in blocks or []:
        props = block.get('props') or {}
        btype = block.get('type')
        if btype in ('richText', 'html'):
            html_parts.append(props.get('html') or '')
        if btype == 'heading' and int(props.get('level') or 2) == 1:
            h1_count += 1
        if btype == 'hero' and props.get('title'):
            h1_count += 1
        if btype == 'image':
            if not (props.get('alt') or '').strip():
                img_missing_alt += 1
        if btype == 'gallery':
            for img in props.get('images') or []:
                if isinstance(img, dict) and not (img.get('alt') or '').strip():
                    img_missing_alt += 1

    body = ' '.join(html_parts)
    text = _strip_html(body)
    word_count = len([w for w in text.split() if w])
    if word_count and word_count < 50:
        deduct(10, 'thin_content', 'İnce içerik (<50 kelime)')
    if h1_count == 0:
        deduct(8, 'missing_h1', 'H1 bulunamadı')
    elif h1_count > 1:
        deduct(5, 'multiple_h1', 'Birden fazla H1')
    if img_missing_alt:
        deduct(min(15, img_missing_alt * 3), 'img_alt', f'{img_missing_alt} görselde alt eksik')

    if not page.og_title and not page.meta_title:
        deduct(3, 'og_title', 'Open Graph başlık eksik')
    if not page.og_image:
        deduct(3, 'og_image', 'Open Graph görsel eksik')

    return {
        'score': score,
        'checks': checks,
        'word_count': word_count,
        'h1_count': h1_count,
    }


def site_seo_warnings(kurum_id: int) -> list[dict[str, Any]]:
    warnings: list[dict[str, Any]] = []
    pages = list(WebPage.objects.filter(kurum_id=kurum_id))
    titles: dict[str, list[int]] = {}
    descs: dict[str, list[int]] = {}
    for p in pages:
        mt = (p.meta_title or p.title or '').strip().lower()
        md = (p.meta_description or '').strip().lower()
        if not (p.meta_title or p.title):
            warnings.append({'code': 'page_missing_meta_title', 'page_id': p.id, 'message': f'Eksik meta title: {p.slug}'})
        if not p.meta_description:
            warnings.append({'code': 'page_missing_meta_description', 'page_id': p.id, 'message': f'Eksik meta description: {p.slug}'})
        if mt:
            titles.setdefault(mt, []).append(p.id)
        if md:
            descs.setdefault(md, []).append(p.id)
        if not p.canonical_url and p.status == WebPage.STATUS_PUBLISHED and not p.is_homepage:
            warnings.append({'code': 'missing_canonical', 'page_id': p.id, 'message': f'Canonical eksik: {p.slug}'})

    for key, ids in titles.items():
        if key and len(ids) > 1:
            warnings.append({'code': 'duplicate_title', 'page_ids': ids, 'message': 'Yinelenen meta başlık'})
    for key, ids in descs.items():
        if key and len(ids) > 1:
            warnings.append({'code': 'duplicate_description', 'page_ids': ids, 'message': 'Yinelenen meta açıklama'})

    missing_alt = MediaAsset.objects.filter(kurum_id=kurum_id, kind=MediaAsset.KIND_IMAGE, alt_text='').count()
    if missing_alt:
        warnings.append({'code': 'media_missing_alt', 'count': missing_alt, 'message': f'{missing_alt} görselde alt text yok'})

    integ = IntegrationSettings.objects.filter(kurum_id=kurum_id).first()
    if not integ or not (integ.robots_txt or '').strip():
        warnings.append({'code': 'robots_default', 'message': 'Özel robots.txt tanımlı değil (varsayılan kullanılacak)'})

    return warnings
