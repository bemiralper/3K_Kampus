"""Bilinen log kalıpları → kısa Türkçe açıklama (uydurma yok; eşleşmezse None)."""

from __future__ import annotations

import re

SCANNER_PROBE_RE = re.compile(
    r'"(GET|POST|HEAD)\s+/(\.env|\.git|phpinfo|phpmyadmin|wp-login|wp-admin|wordpress'
    r'|xmlrpc\.php|vendor/phpunit|\.well-known/[^ ]*\.php|admin\.php|config\.json'
    r'|actuator|solr|cgi-bin)[^ "]*\s',
    re.I,
)

# (pattern, title, explanation) — ilk eşleşen kazanır
LOG_EXPLANATIONS: list[tuple[re.Pattern[str], str, str]] = [
    (
        SCANNER_PROBE_RE,
        'Otomatik bot taraması',
        'İnternetteki tarayıcı botları her sunucuda `.env`, `phpinfo`, `wp-admin` gibi '
        'adresleri dener. 404 dönmesi beklenen ve doğru davranıştır; uygulama hatası '
        'değildir. Aynı IP çok sık deniyorsa fail2ban/nginx ile engellenebilir.',
    ),
    (
        re.compile(r'Handling signal: term|was sent SIGTERM|Shutting down: Master|Worker exiting \(pid:', re.I),
        'Gunicorn kontrollü yeniden başlatma',
        'Bu bir hata değil. systemctl restart / deploy sırasında Gunicorn’a SIGTERM gider; '
        'worker’lar kapanır, master kapanır, hemen ardından yeni süreç ayağa kalkar. '
        'Ardından “Starting gunicorn / Booting worker” satırları gelmeli.',
    ),
    (
        re.compile(r'Using worker: sync', re.I),
        'Gunicorn sync worker (SSE için riskli)',
        'Backend thread’siz (sync) worker ile çalışıyor. İletişim modülünün canlı dinleme '
        '(SSE) bağlantısı sync worker’da açık kaldığı sürece bir worker’ı tamamen tutar; '
        'birkaç açık sekme tüm API’yi 503’e düşürür. systemd biriminde '
        '`--worker-class gthread --threads 8` kullanın.',
    ),
    (
        re.compile(r'Starting gunicorn|Listening at:|Booting worker with pid|Control socket listening', re.I),
        'Gunicorn başladı',
        'Backend (Gunicorn) yeni master/worker süreçleriyle ayağa kalktı. Deploy veya '
        'servis restart sonrası beklenen INFO kaydı.',
    ),
    (
        re.compile(r'WORKER TIMEOUT', re.I),
        'Gunicorn worker zaman aşımı',
        'Bir istek Gunicorn --timeout süresini aştığı için worker süreci öldürüldü. '
        'Sık görülen neden: /api/communication/events/stream/ (SSE) bağlantısının sync '
        'worker’ı bloklaması — çözümü `--worker-class gthread --threads 8`. '
        'Uzun yedek/PDF/rapor işleri de tetikleyebilir; aynı dakikadaki access log’a bakın.',
    ),
    (
        re.compile(r'Error handling request GET /api/communication/events/stream', re.I),
        'İletişim SSE stream kesildi',
        'Koç inbox canlı dinleme (Server-Sent Events) bağlantısı worker öldüğü için koptu. '
        'Genelde WORKER TIMEOUT ile aynı andadır. Stream ~45 sn sonra kendisi kapanıp '
        'yeniden bağlanır ve worker başına eşzamanlı stream sayısı sınırlıdır '
        '(COMMUNICATION_SSE_MAX_STREAMS); tekrarlıyorsa Gunicorn’un gthread ile '
        'çalıştığını doğrulayın.',
    ),
    (
        re.compile(r'was sent SIGKILL|Perhaps out of memory', re.I),
        'Worker zorla öldürüldü (SIGKILL)',
        'Gunicorn worker’a SIGKILL gitti. Mesaj “out of memory?” dese de çoğu zaman timeout '
        'sonrası zorunlu öldürmedir; gerçek OOM için dmesg/journalctl’e bakın. '
        'SSE veya uzun isteklerle birlikte gelirse önce timeout senaryosunu düşünün.',
    ),
    (
        re.compile(r'worker.*exited with code|Worker .* died|Worker \(pid:', re.I),
        'Gunicorn worker çöktü',
        'Worker beklenmedik şekilde kapandı. Üstündeki/altındaki satırlarda Python traceback '
        'veya OOM (bellek) ipucu arayın; sık tekrarlanıyorsa bellek veya kod hatası olabilir.',
    ),
    (
        # Access log satırı: "GET /api/... HTTP/1.1" 503 ...
        re.compile(r'"(GET|POST|PUT|PATCH|DELETE)[^"]*"\s+503\b'),
        'İstek 503 döndü (backend meşgul/kapalı)',
        'Nginx isteği karşılayacak uygulama bulamadı: backend restart ediliyor, bakım modu açık '
        'ya da tüm Gunicorn worker’ları dolu. Aynı dakikada WORKER TIMEOUT / SIGKILL varsa neden '
        'doygunluktur; SSE bağlantıları için gthread worker kullanıldığını doğrulayın.',
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
        # 401 yalın sayı olarak aranırsa UUID/boyut alanlarına takılır; sınırla eşle.
        re.compile(r'Unauthorized|\b401\b|Authentication credentials were not provided|oturum açmanız', re.I),
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
