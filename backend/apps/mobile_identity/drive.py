"""Kurumun Google Drive ortak sürücüsü. Anahtar dosyası repoda durmaz."""
from __future__ import annotations

import json
import os
import time
from base64 import urlsafe_b64encode

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from django.conf import settings

TOKEN_URL = 'https://oauth2.googleapis.com/token'
DRIVE_URL = 'https://www.googleapis.com/drive/v3/files'
UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files'
FOLDER = 'application/vnd.google-apps.folder'
SCOPE = 'https://www.googleapis.com/auth/drive'


class DriveError(Exception):
    pass


def _b64(raw: bytes) -> str:
    return urlsafe_b64encode(raw).rstrip(b'=').decode('ascii')


def _jwt(email: str, private_key: str) -> str:
    now = int(time.time())
    header = _b64(json.dumps({'alg': 'RS256', 'typ': 'JWT'}, separators=(',', ':')).encode())
    claims = _b64(json.dumps({
        'iss': email,
        'scope': SCOPE,
        'aud': TOKEN_URL,
        'iat': now,
        'exp': now + 3600,
    }, separators=(',', ':')).encode())
    signing_input = f'{header}.{claims}'.encode()
    key = serialization.load_pem_private_key(private_key.encode(), password=None)
    signature = key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
    return f'{header}.{claims}.{_b64(signature)}'


def _escape(name: str) -> str:
    return name.replace('\\', '\\\\').replace("'", "\\'")


class DriveGateway:
    def __init__(self, path: str, drive_id: str):
        with open(path, encoding='utf-8') as handle:
            data = json.load(handle)
        self.email = data['client_email']
        self._key = data['private_key']
        self.drive_id = drive_id
        self._token = ''
        self._token_until = 0

    def _headers(self) -> dict:
        now = time.time()
        if not self._token or now >= self._token_until:
            response = httpx.post(
                TOKEN_URL,
                data={
                    'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                    'assertion': _jwt(self.email, self._key),
                },
                timeout=20,
            )
            if response.status_code != 200:
                raise DriveError('token')
            body = response.json()
            self._token = body['access_token']
            self._token_until = now + int(body.get('expires_in', 3600)) - 60
        return {'Authorization': f'Bearer {self._token}'}

    def _request(self, method: str, url: str, **kwargs):
        headers = {**self._headers(), **(kwargs.pop('headers', None) or {})}
        response = httpx.request(method, url, headers=headers, timeout=60, **kwargs)
        if response.status_code >= 400:
            raise DriveError(f'{method} {response.status_code}')
        return response

    def find_folder(self, parent_id: str, name: str) -> str | None:
        query = (
            f"mimeType = '{FOLDER}' and name = '{_escape(name)}' "
            f"and '{parent_id}' in parents and trashed = false"
        )
        response = self._request(
            'GET',
            DRIVE_URL,
            params={
                'q': query,
                'corpora': 'drive',
                'driveId': self.drive_id,
                'includeItemsFromAllDrives': 'true',
                'supportsAllDrives': 'true',
                'fields': 'files(id)',
                'pageSize': 1,
                'orderBy': 'createdTime',
            },
        )
        files = response.json().get('files') or []
        return files[0]['id'] if files else None

    def ensure_folder(self, parent_id: str, name: str) -> str:
        found = self.find_folder(parent_id, name)
        if found:
            return found
        self._request(
            'POST',
            DRIVE_URL,
            params={'supportsAllDrives': 'true', 'fields': 'id'},
            json={'name': name, 'mimeType': FOLDER, 'parents': [parent_id]},
        )
        found = self.find_folder(parent_id, name)
        if not found:
            raise DriveError('folder')
        return found

    def upload(self, parent_id: str, name: str, mime: str, data: bytes) -> str:
        boundary = '3k_ders_notu'
        meta = json.dumps({'name': name, 'parents': [parent_id], 'mimeType': mime}).encode()
        body = b''.join([
            f'--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'.encode(),
            meta,
            f'\r\n--{boundary}\r\nContent-Type: {mime}\r\n\r\n'.encode(),
            data,
            f'\r\n--{boundary}--'.encode(),
        ])
        response = self._request(
            'POST',
            UPLOAD_URL,
            params={'uploadType': 'multipart', 'supportsAllDrives': 'true', 'fields': 'id'},
            content=body,
            headers={**self._headers(), 'Content-Type': f'multipart/related; boundary={boundary}'},
        )
        return response.json()['id']

    def download(self, file_id: str) -> bytes:
        response = self._request(
            'GET',
            f'{DRIVE_URL}/{file_id}',
            params={'alt': 'media', 'supportsAllDrives': 'true'},
        )
        return response.content

    def delete(self, file_id: str) -> None:
        try:
            response = httpx.delete(
                f'{DRIVE_URL}/{file_id}',
                headers=self._headers(),
                params={'supportsAllDrives': 'true'},
                timeout=20,
            )
        except httpx.HTTPError as exc:
            raise DriveError('delete') from exc
        if response.status_code not in (200, 204, 404):
            raise DriveError('delete')


def configured() -> bool:
    path = getattr(settings, 'GOOGLE_DRIVE_CREDENTIALS_FILE', '') or ''
    drive_id = getattr(settings, 'GOOGLE_DRIVE_SHARED_DRIVE_ID', '') or ''
    return bool(path and drive_id and os.path.isfile(path))


def gateway() -> DriveGateway:
    if not configured():
        raise DriveError('config')
    return DriveGateway(
        settings.GOOGLE_DRIVE_CREDENTIALS_FILE,
        settings.GOOGLE_DRIVE_SHARED_DRIVE_ID,
    )


def store_file(folders: list[str], filename: str, mime: str, data: bytes) -> str:
    client = gateway()
    parent = client.drive_id
    for folder in folders:
        parent = client.ensure_folder(parent, folder)
    return client.upload(parent, filename, mime, data)


def fetch_file(file_id: str) -> bytes:
    return gateway().download(file_id)


def discard_file(file_id: str) -> None:
    try:
        gateway().delete(file_id)
    except DriveError:
        return


def remove_file(file_id: str) -> None:
    gateway().delete(file_id)
