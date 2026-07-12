"""Bilinen log kalıpları → kısa Türkçe açıklama (uydurma yok; eşleşmezse None)."""

from __future__ import annotations

import re

# (pattern, title, explanation) — ilk eşleşen kazanır
LOG_EXPLANATIONS: list[tuple[re.Pattern[str], str, str]] = [
    (
        re.compile(r'WORKER TIMEOUT', re.I),
        'Gunicorn worker zaman aşımı',
        'Bir istek Gunicorn --timeout süresini aştığı için worker süreci öldürüldü. '
        'Genelde uzun süren yedek, PDF/rapor, ağır export veya takılan DB sorgusu tetikler. '
        'Aynı dakikadaki access log’da hangi URL’nin uzun sürdüğüne bakın.',
    ),
    (
        re.compile(r'worker.*exited with code|Worker .* died|Worker \(pid:', re.I),
        'Gunicorn worker çöktü',
        'Worker beklenmedik şekilde kapandı. Üstündeki/altındaki satırlarda Python traceback '
        'veya OOM (bellek) ipucu arayın; sık tekrarlanıyorsa bellek veya kod hatası olabilir.',
    ),
    (
        re.compile(r'Broken pipe|Connection reset by peer', re.I),
        'Bağlantı istemci tarafından kesildi',
        'İstemci (tarayıcı/nginx) yanıt bitmeden bağlantıyı kapattı. Çoğu zaman kullanıcı sayfadan '
        'ayrılır veya proxy zaman aşımı; tek başına uygulama hatası sayılmaz.',
    ),
    (
        re.compile(r'OperationalError|could not connect to server|connection refused.*5432|FATAL:\s+password authentication failed', re.I),
        'PostgreSQL bağlantı sorunu',
        'Uygulama veritabanına bağlanamadı veya kimlik doğrulama başarısız. PostgreSQL servisi, '
        'ağ, şifre veya bağlantı limiti (max_connections) kontrol edilmeli.',
    ),
    (
        re.compile(r'deadlock detected|canceling statement due to statement timeout|too many connections', re.I),
        'PostgreSQL sorgu / kilit sorunu',
        'DB tarafında kilit, sorgu zaman aşımı veya bağlantı doygunluğu. Yoğun işlem saatlerinde '
        'uzun transaction veya eksik indeks sık neden olur.',
    ),
    (
        re.compile(r'DisallowedHost|Invalid HTTP_HOST|CSRF (verification failed|cookie)', re.I),
        'Güvenlik / host doğrulama',
        'İstek ALLOWED_HOSTS veya CSRF kurallarına uymadı. Yanlış domain, eksik CSRF token veya '
        'proxy header (X-Forwarded-*) ayarı olabilir.',
    ),
    (
        re.compile(r'PermissionDenied|403 Forbidden|permission_denied', re.I),
        'Yetki reddi',
        'Kullanıcının bu işlem için rol/izin kodu yok veya oturum yetkisiz. Beklenen bir güvenlik '
        'yanıtı olabilir; yetkisiz erişim denemesi de olabilir.',
    ),
    (
        re.compile(r'Unauthorized|401|Authentication credentials were not provided|oturum açmanız', re.I),
        'Oturum / kimlik doğrulama',
        'Kullanıcı giriş yapmamış veya oturum süresi dolmuş. API çağrısında cookie/session eksik '
        'olabilir.',
    ),
    (
        re.compile(r'MemoryError|Cannot allocate memory|oom-killer|Out of memory', re.I),
        'Bellek yetersiz',
        'Süreç veya sunucu RAM’i bitti. Worker sayısı, büyük dosya/rapor işleri veya sızıntı '
        'kontrol edilmeli; gerekirse swap/RAM artırılır.',
    ),
    (
        re.compile(r'Address already in use|EADDRINUSE', re.I),
        'Port kullanımda',
        'Aynı porta başka bir süreç bağlı. Eski Gunicorn/Next süreci kapanmamış olabilir; '
        'systemctl status ve lsof ile çakışan PID bulunur.',
    ),
    (
        re.compile(r'upstream timed out|connect\(\) failed.*Connection refused|no live upstreams', re.I),
        'Nginx → uygulama erişemedi',
        'Nginx, backend (Gunicorn :8000) veya frontend (:3000) yanıt vermedi / zaman aşımına uğradı. '
        'lms-backend / lms-frontend servis durumuna bakın.',
    ),
    (
        re.compile(r'ssl_certificate|SSL_do_handshake|certificate has expired', re.I),
        'SSL sertifika sorunu',
        'HTTPS sertifikası hatalı, süresi dolmuş veya zincir eksik. Certbot / Let’s Encrypt '
        'yenilemesi gerekebilir.',
    ),
    (
        re.compile(r'Permission denied|EACCES', re.I),
        'Dosya / dizin izni',
        'Süreç dosyayı okuyamadı veya yazamadı. media, backups, log veya staticfiles sahipliği '
        '(lms / www-data) kontrol edilmeli.',
    ),
    (
        re.compile(r'ModuleNotFoundError|ImportError|No module named', re.I),
        'Eksik Python paketi / import',
        'Kod bir modülü bulamadı. venv’de pip install eksik, yanlış PYTHONPATH veya deploy sonrası '
        'restart atlanmış olabilir.',
    ),
    (
        re.compile(r'TemplateDoesNotExist|TemplateSyntaxError', re.I),
        'Şablon hatası',
        'Django template bulunamadı veya sözdizimi bozuk. Genelde yanlış template yolu veya '
        'eski/eksik frontend-backend eşlemesi.',
    ),
    (
        re.compile(r'MultiValueDictKeyError|KeyError:|DoesNotExist|ObjectDoesNotExist', re.I),
        'Eksik veri / kayıt bulunamadı',
        'İstekte beklenen alan yok veya veritabanında kayıt silinmiş/yok. İstemci parametresi veya '
        'silinmiş FK sık neden olur.',
    ),
    (
        re.compile(r'ProgrammingError|relation .* does not exist|column .* does not exist', re.I),
        'Migration / şema uyumsuzluğu',
        'Kod yeni kolon/tablo bekliyor ama veritabanı güncel değil (veya tersi). '
        '`python manage.py migrate` çalıştırılmalı.',
    ),
    (
        re.compile(r'SEO?LSTATE|could not serialize access|current transaction is aborted', re.I),
        'Transaction bozuldu',
        'Önceki SQL hatası transaction’ı abort etti; sonraki sorgular da düşer. İlk gerçek hataya '
        'bakın, bu satır çoğu zaman ikincil belirtidir.',
    ),
    (
        re.compile(r'backup.*(fail|error|başarısız)|yedek.*(fail|error|başarısız)|run_scheduled_backups.*(Error|Traceback)', re.I),
        'Yedekleme hatası',
        'Yedekleme cron veya yönetim komutu başarısız olmuş görünüyor. Yedekleme panelindeki '
        'son çalışma sonucu ve Hata Merkezi’ne bakın.',
    ),
]


def explain_log_line(line: str) -> dict | None:
    if not line or not line.strip():
        return None
    for pattern, title, explanation in LOG_EXPLANATIONS:
        if pattern.search(line):
            return {'title': title, 'text': explanation}
    return None
