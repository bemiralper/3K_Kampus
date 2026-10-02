"""
Ödeme Takip modelleri — Django model registry için re-export.

Django modelleri app_label.models modülünden yükler.
Domain modelleri domain/ altında tanımlıdır; burada import ederek kayıt ederiz.
"""
from apps.odeme_takip.domain import cek_senet as _cek_senet  # noqa: F401
from apps.odeme_takip.domain import models as _domain_models  # noqa: F401
