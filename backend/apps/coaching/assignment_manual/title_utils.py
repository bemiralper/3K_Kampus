"""Ödev başlığı yardımcıları."""
import re

_COMPLETION_SUFFIX_RE = re.compile(r'\s*\(\s*Eksik\s+Tamamlama\s*\)\s*$', re.IGNORECASE)


def strip_completion_title_suffix(title):
    """Eski kayıtlardaki '(Eksik Tamamlama)' başlık ekini kaldır."""
    if not title:
        return title or ''
    return _COMPLETION_SUFFIX_RE.sub('', str(title)).strip()
