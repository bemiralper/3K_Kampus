"""
Uyumsoft e-Dönüşüm Integration SOAP istemcisi.

Kimlik doğrulama WS-Security UsernameToken ile yapılır.
Bağlantı denemesi WhoAmI çağırır; fatura göndermez.
"""
from __future__ import annotations

import ssl
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from urllib.parse import urlparse
from xml.sax.saxutils import escape

DEFAULT_WS_URL = 'https://edonusumapi.uyum.com.tr/Services/Integration'
DEFAULT_PORTAL_URL = 'https://edonusum.uyum.com.tr'
ALLOWED_HOST_SUFFIXES = ('uyum.com.tr', 'uyumsoft.com.tr')
WHOAMI_ACTION = 'http://tempuri.org/IIntegration/WhoAmI'
_MAX_BODY = 1_000_000


class UyumsoftError(Exception):
    """Uyumsoft çağrısı başarısız. Mesaj kullanıcıya gösterilebilir; şifre içermez."""


def assert_uyumsoft_url(url: str, *, kind: str) -> str:
    raw = (url or '').strip()
    parsed = urlparse(raw)
    host = (parsed.hostname or '').lower()
    if parsed.scheme != 'https' or not host:
        raise UyumsoftError(f'{kind} https ile başlamalıdır.')
    if not any(host == suffix or host.endswith('.' + suffix) for suffix in ALLOWED_HOST_SUFFIXES):
        raise UyumsoftError(f'{kind} yalnızca Uyumsoft alan adlarını kabul eder.')
    if kind == 'Web servis adresi' and not parsed.path.rstrip('/').endswith('/Services/Integration'):
        raise UyumsoftError('Web servis adresi /Services/Integration ile bitmelidir.')
    return raw


def whoami(ws_url: str, username: str, password: str, *, timeout: int = 20) -> dict:
    """Kayıtlı web servis kullanıcısının kimliğini ve e-belge ürünlerini döndürür."""
    url = assert_uyumsoft_url(ws_url, kind='Web servis adresi')
    user = (username or '').strip()
    if not user or not password:
        raise UyumsoftError('Web servis kullanıcısı ve şifresi zorunludur.')

    body = _whoami_envelope(user, password)
    req = urllib.request.Request(
        url,
        data=body.encode('utf-8'),
        headers={
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': f'"{WHOAMI_ACTION}"',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_ssl_context()) as resp:
            payload = resp.read(_MAX_BODY)
    except urllib.error.HTTPError as exc:
        payload = exc.read(_MAX_BODY)
        return _parse_whoami(payload, http_status=exc.code)
    except urllib.error.URLError as exc:
        raise UyumsoftError('Uyumsoft adresine ulaşılamadı.') from exc
    except TimeoutError as exc:
        raise UyumsoftError('Uyumsoft yanıt vermedi.') from exc

    return _parse_whoami(payload, http_status=200)


def _whoami_envelope(username: str, password: str) -> str:
    return (
        '<?xml version="1.0" encoding="utf-8"?>'
        '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"'
        ' xmlns:tem="http://tempuri.org/">'
        '<soap:Header>'
        '<wsse:Security soap:mustUnderstand="1"'
        ' xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">'
        '<wsse:UsernameToken>'
        f'<wsse:Username>{escape(username)}</wsse:Username>'
        '<wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">'
        f'{escape(password)}</wsse:Password>'
        '</wsse:UsernameToken>'
        '</wsse:Security>'
        '</soap:Header>'
        '<soap:Body><tem:WhoAmI/></soap:Body>'
        '</soap:Envelope>'
    )


def _parse_whoami(payload: bytes, *, http_status: int) -> dict:
    text = payload.decode('utf-8', errors='replace')
    try:
        root = ET.fromstring(text)
    except ET.ParseError as exc:
        raise UyumsoftError('Uyumsoft yanıtı okunamadı.') from exc

    fault = _first(root, 'faultstring')
    if fault is not None and (fault.text or '').strip():
        raise UyumsoftError(_clean_fault(fault.text))

    result = _first(root, 'WhoAmIResult')
    if result is None:
        raise UyumsoftError('Uyumsoft kimlik yanıtı gelmedi.')

    succeeded = _attr_bool(result, 'IsSucceded')
    message = (result.attrib.get('Message') or '').strip()
    if not succeeded:
        raise UyumsoftError(message or 'Uyumsoft kimlik doğrulaması başarısız.')

    customer = _first(result, 'Customer')
    user = _first(result, 'User')
    services = _first(result, 'Services')
    summary = {
        'unvan': _text(customer, 'Name'),
        'vkn': _text(customer, 'VkTckNo'),
        'kullanici': _text(user, 'Username'),
        'e_fatura': _attr_bool(services, 'HasEInvoice') if services is not None else None,
        'e_arsiv': _attr_bool(services, 'HasEarchive') if services is not None else None,
        'e_irsaliye': _attr_bool(services, 'HasEDespatch') if services is not None else None,
        'mesaj': message,
        'http_status': http_status,
    }
    return summary


def _clean_fault(raw: str) -> str:
    text = ' '.join((raw or '').split())
    # IP adresini kullanıcıya taşımayalım.
    if ', Ip:' in text:
        text = text.split(', Ip:')[0].strip()
    return text or 'Uyumsoft isteği reddetti.'


def _local(tag: str) -> str:
    return tag.split('}')[-1] if tag else ''


def _first(root: ET.Element, name: str) -> ET.Element | None:
    for node in root.iter():
        if _local(node.tag) == name:
            return node
    return None


def _text(parent: ET.Element | None, name: str) -> str:
    if parent is None:
        return ''
    node = _first(parent, name)
    return (node.text or '').strip() if node is not None else ''


def _attr_bool(node: ET.Element | None, name: str) -> bool:
    if node is None:
        return False
    return (node.attrib.get(name) or '').strip().lower() in ('true', '1')


def is_e_invoice_user(ws_url: str, username: str, password: str, vkn_tckn: str, *, timeout: int = 20) -> bool:
    body = (
        '<tem:IsEInvoiceUser>'
        f'<tem:vknTckn>{escape(vkn_tckn)}</tem:vknTckn>'
        '<tem:alias></tem:alias>'
        '</tem:IsEInvoiceUser>'
    )
    root = soap_call(
        ws_url, username, password,
        action='http://tempuri.org/IIntegration/IsEInvoiceUser',
        inner=body,
        timeout=timeout,
    )
    result = _first(root, 'IsEInvoiceUserResult')
    if result is None:
        raise UyumsoftError('e-Fatura mükellef sorgusu yanıt vermedi.')
    if not _attr_bool(result, 'IsSucceded') and result.attrib.get('IsSucceded') is not None:
        message = (result.attrib.get('Message') or '').strip()
        if message:
            raise UyumsoftError(message)
    return _attr_bool(result, 'Value')


def receiver_alias(ws_url: str, username: str, password: str, vkn_tckn: str, *, timeout: int = 20) -> str:
    body = (
        '<tem:GetUserAliasses>'
        f'<tem:vknTckn>{escape(vkn_tckn)}</tem:vknTckn>'
        '</tem:GetUserAliasses>'
    )
    root = soap_call(
        ws_url, username, password,
        action='http://tempuri.org/IIntegration/GetUserAliasses',
        inner=body,
        timeout=timeout,
    )
    for node in root.iter():
        if _local(node.tag) != 'ReceiverboxAliases':
            continue
        if (node.attrib.get('Enabled') or '').lower() not in ('true', '1'):
            continue
        alias = (node.attrib.get('Alias') or '').strip()
        if alias:
            return alias
    return ''


def save_as_draft(ws_url: str, username: str, password: str, *, invoice_xml: str,
                  local_document_id: str, vkn_tckn: str, title: str, alias: str,
                  scenario: str, create_date_utc: str, timeout: int = 40) -> dict:
    archive = ''
    if scenario == 'eArchive':
        archive = '<tem:EArchiveInvoiceInfo DeliveryType="Electronic"/>'
    target_alias = f' Alias="{escape(alias)}"' if alias else ''
    body = (
        '<tem:SaveAsDraft><tem:invoices><tem:InvoiceInfo'
        f' LocalDocumentId="{escape(local_document_id)}">'
        f'<tem:Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"'
        f' xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">'
        f'{invoice_xml}'
        '</tem:Invoice>'
        f'<tem:TargetCustomer VknTckn="{escape(vkn_tckn)}"{target_alias} Title="{escape(title)}"/>'
        f'{archive}'
        f'<tem:Scenario>{escape(scenario)}</tem:Scenario>'
        f'<tem:CreateDateUtc>{escape(create_date_utc)}</tem:CreateDateUtc>'
        '</tem:InvoiceInfo></tem:invoices></tem:SaveAsDraft>'
    )
    root = soap_call(
        ws_url, username, password,
        action='http://tempuri.org/IIntegration/SaveAsDraft',
        inner=body,
        timeout=timeout,
    )
    result = _first(root, 'SaveAsDraftResult')
    if result is None:
        raise UyumsoftError('Uyumsoft taslak yanıtı gelmedi.')
    if not _attr_bool(result, 'IsSucceded'):
        raise UyumsoftError((result.attrib.get('Message') or '').strip() or 'Taslak kaydedilemedi.')
    identity = _first(result, 'Value')
    return {
        'id': (identity.attrib.get('Id') if identity is not None else '') or '',
        'number': (identity.attrib.get('Number') if identity is not None else '') or '',
        'scenario': (identity.attrib.get('InvoiceScenario') if identity is not None else '') or '',
    }


def cancel_draft(ws_url: str, username: str, password: str, invoice_id: str, *, timeout: int = 40) -> None:
    body = (
        '<tem:CancelDraft><tem:invoiceIds>'
        f'<tem:string>{escape(invoice_id)}</tem:string>'
        '</tem:invoiceIds></tem:CancelDraft>'
    )
    root = soap_call(
        ws_url, username, password,
        action='http://tempuri.org/IIntegration/CancelDraft',
        inner=body,
        timeout=timeout,
    )
    result = _first(root, 'CancelDraftResult')
    if result is None:
        raise UyumsoftError('Uyumsoft iptal yanıtı gelmedi.')
    if not _attr_bool(result, 'IsSucceded'):
        raise UyumsoftError((result.attrib.get('Message') or '').strip() or 'Gönderim iptal edilemedi.')


def soap_call(ws_url: str, username: str, password: str, *, action: str, inner: str, timeout: int = 20) -> ET.Element:
    url = assert_uyumsoft_url(ws_url, kind='Web servis adresi')
    user = (username or '').strip()
    if not user or not password:
        raise UyumsoftError('Web servis kullanıcısı ve şifresi zorunludur.')
    envelope = (
        '<?xml version="1.0" encoding="utf-8"?>'
        '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"'
        ' xmlns:tem="http://tempuri.org/">'
        '<soap:Header>'
        '<wsse:Security soap:mustUnderstand="1"'
        ' xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">'
        '<wsse:UsernameToken>'
        f'<wsse:Username>{escape(user)}</wsse:Username>'
        '<wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">'
        f'{escape(password)}</wsse:Password>'
        '</wsse:UsernameToken></wsse:Security></soap:Header>'
        f'<soap:Body>{inner}</soap:Body></soap:Envelope>'
    )
    req = urllib.request.Request(
        url,
        data=envelope.encode('utf-8'),
        headers={
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': f'"{action}"',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_ssl_context()) as resp:
            payload = resp.read(_MAX_BODY)
    except urllib.error.HTTPError as exc:
        payload = exc.read(_MAX_BODY)
        return _parse_soap(payload)
    except urllib.error.URLError as exc:
        raise UyumsoftError('Uyumsoft adresine ulaşılamadı.') from exc
    except TimeoutError as exc:
        raise UyumsoftError('Uyumsoft yanıt vermedi.') from exc
    return _parse_soap(payload)


def _parse_soap(payload: bytes) -> ET.Element:
    text = payload.decode('utf-8', errors='replace')
    try:
        root = ET.fromstring(text)
    except ET.ParseError as exc:
        raise UyumsoftError('Uyumsoft yanıtı okunamadı.') from exc
    fault = _first(root, 'faultstring')
    if fault is not None and (fault.text or '').strip():
        raise UyumsoftError(_clean_fault(fault.text))
    return root


def _ssl_context() -> ssl.SSLContext:
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()
