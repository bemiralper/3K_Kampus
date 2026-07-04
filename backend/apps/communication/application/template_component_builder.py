"""
LMS şablon değişkenlerini Meta WhatsApp template components formatına çevirir.
"""
from __future__ import annotations

from typing import Any

from apps.communication.application.variable_resolver import VARIABLE_PATTERN


def extract_variable_names(body_template: str) -> list[str]:
    """Şablondaki {{degisken}} adlarını sırayla döndür."""
    return [match.group(1) for match in VARIABLE_PATTERN.finditer(body_template or '')]


def build_body_parameters(body_template: str, context: dict[str, Any]) -> list[dict[str, str]]:
    """Meta body component parameters listesi."""
    params: list[dict[str, str]] = []
    for key in extract_variable_names(body_template):
        value = context.get(key)
        text = '' if value is None else str(value)
        params.append({'type': 'text', 'text': text})
    return params


def build_template_components(
    body_template: str,
    context: dict[str, Any],
    *,
    extra_components: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """
    Meta Graph API template.components listesi.

    extra_components: header/button vb. önceden hazırlanmış bileşenler
    (recipient_filter_json.template_components_json).
    """
    components: list[dict[str, Any]] = []
    body_params = build_body_parameters(body_template, context)
    if body_params:
        components.append({'type': 'body', 'parameters': body_params})
    if extra_components:
        components.extend(extra_components)
    return components
