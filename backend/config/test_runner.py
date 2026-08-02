"""
Proje test runner'ı.

`backend/apps` bir namespace paketidir (`__init__.py` yok). Keşif `apps/<app>`
yolundan başlatıldığında unittest üst dizin olarak `apps/` seçer ve modülleri
`coaching.x` gibi ikinci bir isimle import eder. Aynı model dosyası hem
`apps.coaching.x` hem `coaching.x` altında yüklenince Django uygulama kaydı
"Conflicting models" hatası verir. Keşif kökünü sabitleyerek modül adlarının
gerçek import yoluyla (`apps.*`) aynı kalmasını sağlıyoruz.
"""
from django.conf import settings
from django.test.runner import DiscoverRunner


class LmsTestRunner(DiscoverRunner):
    def __init__(self, *args, top_level=None, **kwargs):
        super().__init__(
            *args,
            top_level=top_level or str(settings.BASE_DIR),
            **kwargs,
        )
