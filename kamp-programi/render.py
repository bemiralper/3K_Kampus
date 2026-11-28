from pathlib import Path

from playwright.sync_api import sync_playwright

here = Path(__file__).resolve().parent
posters = [
    ("afis.html", "12-sinif-kamp-programi.png"),
    ("afis-11.html", "11-sinif-kamp-programi.png"),
]

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1080, "height": 1350}, device_scale_factor=2)
    for source, target in posters:
        page.goto((here / source).as_uri())
        page.wait_for_load_state("networkidle")
        page.screenshot(path=str(here / target))
    browser.close()
