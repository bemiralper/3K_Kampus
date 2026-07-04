"""
HTML → vektörel PDF (Chromium headless print-to-pdf).
Tarayıcı yazdırma ile aynı motor; metin seçilebilir kalır.
"""
from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

_MIN_PDF_BYTES = 2500


def _extract_body_html(html: str) -> str:
    match = re.search(r'<body[^>]*>(.*?)</body>', html, re.DOTALL | re.IGNORECASE)
    return (match.group(1) if match else '').strip()


def _validate_html_for_pdf(html: str) -> None:
    if len(html.strip()) < 200:
        raise RuntimeError('Rapor HTML çok kısa.')
    body = _extract_body_html(html)
    if not body:
        raise RuntimeError('Rapor içeriği boş.')
    # Görünür metin yoksa boş PDF riski yüksek
    text_only = re.sub(r'<[^>]+>', ' ', body)
    if len(text_only.strip()) < 20:
        raise RuntimeError('Rapor içeriğinde yeterli metin yok.')


def _validate_pdf_bytes(data: bytes) -> None:
    if not data.startswith(b'%PDF'):
        raise RuntimeError('PDF oluşturulamadı (geçersiz dosya).')
    if len(data) < _MIN_PDF_BYTES:
        raise RuntimeError('PDF çıktısı çok küçük — içerik render edilemedi.')


def _find_chrome() -> str | None:
    candidates = [
        os.environ.get('CHROME_BIN', ''),
        os.environ.get('PUPPETEER_EXECUTABLE_PATH', ''),
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        'google-chrome',
        'google-chrome-stable',
        'chromium',
        'chromium-browser',
    ]
    for path in candidates:
        if not path:
            continue
        if os.path.isfile(path):
            return path
        found = shutil.which(path)
        if found:
            return found
    return None


def render_html_to_pdf(html: str, *, timeout: int = 90, landscape: bool = False, footer_template: str | None = None) -> bytes:
    """Tam HTML belgesini PDF baytlarına çevirir."""
    _validate_html_for_pdf(html)

    playwright_err: RuntimeError | None = None
    try:
        return _render_html_playwright(
            html, timeout_ms=timeout * 1000, landscape=landscape, footer_template=footer_template,
        )
    except RuntimeError as exc:
        playwright_err = exc
        logger.warning('Playwright HTML PDF failed, trying Chrome CLI: %s', exc)

    try:
        return _render_html_chrome_cli(html, timeout=timeout)
    except RuntimeError:
        if playwright_err:
            raise playwright_err
        raise


def _render_html_playwright(
    html: str,
    *,
    timeout_ms: int = 90000,
    landscape: bool = False,
    footer_template: str | None = None,
) -> bytes:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError('Playwright yüklü değil.') from exc

    pdf_bytes: bytes
    with sync_playwright() as playwright:
        browser = _launch_playwright_browser(playwright)
        try:
            page = browser.new_page(viewport={'width': 1280, 'height': 1800})
            page.set_content(html, wait_until='networkidle', timeout=timeout_ms)
            pdf_kwargs: dict = {
                'format': 'A4',
                'landscape': landscape,
                'print_background': True,
                'margin': {'top': '10mm', 'bottom': '16mm', 'left': '8mm', 'right': '8mm'},
            }
            if footer_template:
                pdf_kwargs['display_header_footer'] = True
                pdf_kwargs['footer_template'] = footer_template
                pdf_kwargs['header_template'] = '<div></div>'
            pdf_bytes = page.pdf(**pdf_kwargs)
        finally:
            browser.close()

    _validate_pdf_bytes(pdf_bytes)
    return pdf_bytes


def _render_html_chrome_cli(html: str, *, timeout: int = 90) -> bytes:
    chrome = _find_chrome()
    if not chrome:
        raise RuntimeError(
            'PDF oluşturmak için Chrome/Chromium bulunamadı. '
            'CHROME_BIN ortam değişkenini ayarlayın.'
        )

    with tempfile.TemporaryDirectory(prefix='odev-pdf-') as tmp:
        html_path = os.path.join(tmp, 'document.html')
        pdf_path = os.path.join(tmp, 'document.pdf')
        with open(html_path, 'w', encoding='utf-8') as fh:
            fh.write(html)

        file_url = Path(html_path).resolve().as_uri()
        cmd = [
            chrome,
            '--headless=new',
            '--disable-gpu',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--run-all-compositor-stages-before-draw',
            '--virtual-time-budget=20000',
            '--font-render-hinting=none',
            '--window-size=1280,2400',
            f'--print-to-pdf={pdf_path}',
            '--no-pdf-header-footer',
            file_url,
        ]
        try:
            subprocess.run(
                cmd,
                check=True,
                timeout=timeout,
                capture_output=True,
            )
        except subprocess.CalledProcessError as exc:
            stderr = (exc.stderr or b'').decode('utf-8', errors='replace')[:500]
            logger.error('Chromium PDF failed: %s', stderr)
            raise RuntimeError('PDF oluşturulamadı.') from exc
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError('PDF oluşturma zaman aşımına uğradı.') from exc

        if not os.path.isfile(pdf_path):
            raise RuntimeError('PDF dosyası oluşturulamadı.')

        with open(pdf_path, 'rb') as fh:
            data = fh.read()
        _validate_pdf_bytes(data)
        return data


def _launch_playwright_browser(playwright):
    """Playwright Chromium — önce paketli, sonra sistem Chrome."""
    launch_errors: list[str] = []
    for kwargs in (
        {'headless': True},
        {'headless': True, 'channel': 'chrome'},
    ):
        try:
            return playwright.chromium.launch(**kwargs)
        except Exception as exc:
            launch_errors.append(str(exc))
            logger.warning('Playwright launch failed (%s): %s', kwargs, exc)

    chrome_path = _find_chrome()
    if chrome_path:
        try:
            return playwright.chromium.launch(
                headless=True,
                executable_path=chrome_path,
            )
        except Exception as exc:
            launch_errors.append(str(exc))
            logger.warning('Playwright launch with CHROME_BIN failed: %s', exc)

    hint = (
        'Playwright tarayıcısı bulunamadı. '
        'Komut satırında çalıştırın: python3 -m playwright install chromium'
    )
    raise RuntimeError(f'{hint}\n{" | ".join(launch_errors[:2])}')


def render_url_to_pdf(
    url: str,
    *,
    wait_selector: str = '[data-pdf-ready="true"]',
    landscape: bool = False,
    timeout_ms: int = 90000,
) -> bytes:
    """Canlı URL'yi (React print route) headless Chromium ile PDF'e çevirir."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError(
            'Playwright yüklü değil. '
            'pip install playwright && python3 -m playwright install chromium'
        ) from exc

    pdf_bytes: bytes
    try:
        with sync_playwright() as playwright:
            browser = _launch_playwright_browser(playwright)
            try:
                page = browser.new_page(viewport={'width': 1280, 'height': 1800})
                page.goto(url, wait_until='networkidle', timeout=timeout_ms)
                page.wait_for_selector(wait_selector, timeout=timeout_ms)
                pdf_bytes = page.pdf(
                    format='A4',
                    landscape=landscape,
                    print_background=True,
                    margin={'top': '8mm', 'bottom': '8mm', 'left': '10mm', 'right': '10mm'},
                )
            finally:
                browser.close()
    except RuntimeError:
        raise
    except Exception as exc:
        logger.error('Playwright URL PDF failed for %s: %s', url, exc)
        msg = str(exc)
        if 'Executable doesn' in msg or "doesn't exist" in msg:
            raise RuntimeError(
                'Playwright tarayıcısı kurulu değil. '
                'Terminalde çalıştırın: python3 -m playwright install chromium'
            ) from exc
        raise RuntimeError(f'PDF oluşturulamadı: {exc}') from exc

    _validate_pdf_bytes(pdf_bytes)
    return pdf_bytes
