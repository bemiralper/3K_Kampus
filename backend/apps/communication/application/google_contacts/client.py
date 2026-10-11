"""Google People API istemcisi."""
from __future__ import annotations

import logging

import httpx

from apps.communication.application.google_contacts.naming import GROUP_PARENTS, GROUP_STUDENTS
from apps.communication.application.google_contacts.oauth import GoogleOAuthError, ensure_access_token

logger = logging.getLogger(__name__)

PEOPLE_BASE = 'https://people.googleapis.com/v1'


class GoogleContactsError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class GoogleContactNotFound(GoogleContactsError):
    pass


class GooglePeopleClient:
    def __init__(self, account):
        self.account = account
        self._token = ''

    def _headers(self) -> dict[str, str]:
        if not self._token:
            try:
                self._token = ensure_access_token(self.account)
            except GoogleOAuthError as exc:
                raise GoogleContactsError(str(exc), getattr(exc, 'status_code', None)) from exc
        return {'Authorization': f'Bearer {self._token}', 'Content-Type': 'application/json'}

    def _request(self, method: str, url: str, *, json_body=None, params=None, allow_not_found=False):
        try:
            response = httpx.request(
                method,
                url,
                headers=self._headers(),
                json=json_body,
                params=params,
                timeout=20,
            )
        except httpx.HTTPError as exc:
            raise GoogleContactsError('Google Kişiler servisine ulaşılamadı.') from exc
        if response.status_code == 401:
            self._token = ''
            self.account.token_expires_at = None
            try:
                response = httpx.request(
                    method,
                    url,
                    headers=self._headers(),
                    json=json_body,
                    params=params,
                    timeout=20,
                )
            except httpx.HTTPError as exc:
                raise GoogleContactsError('Google Kişiler servisine ulaşılamadı.') from exc
        if response.status_code == 404:
            if allow_not_found:
                return None
            raise GoogleContactNotFound('Google kişisi bulunamadı.', 404)
        if response.status_code == 429:
            raise GoogleContactsError('Google istek limiti doldu. Biraz sonra devam edin.', 429)
        if response.status_code >= 400:
            detail = ''
            try:
                body = response.json()
                detail = (
                    (body.get('error') or {}).get('message')
                    if isinstance(body.get('error'), dict)
                    else ''
                ) or body.get('error_description') or ''
            except Exception:
                detail = response.text[:240]
            raise GoogleContactsError(detail or 'Google Kişiler isteği başarısız.', response.status_code)
        if response.status_code == 204 or not response.content:
            return {}
        return response.json()

    def create_contact(self, body: dict) -> dict:
        created = self._request('POST', f'{PEOPLE_BASE}/people:createContact', json_body=body)
        if not created or not created.get('resourceName'):
            raise GoogleContactsError('Google kişi oluşturma yanıtı boş.')
        return created

    def update_contact(self, resource_name: str, body: dict, etag: str) -> dict:
        payload = dict(body)
        if etag:
            payload['etag'] = etag
        try:
            updated = self._request(
                'PATCH',
                f'{PEOPLE_BASE}/{resource_name}:updateContact',
                json_body=payload,
                params={'updatePersonFields': 'names,phoneNumbers,biographies'},
            )
        except GoogleContactsError as exc:
            if exc.status_code == 400 and etag and 'etag' in str(exc).lower():
                current = self._request(
                    'GET',
                    f'{PEOPLE_BASE}/{resource_name}',
                    params={'personFields': 'metadata'},
                )
                payload['etag'] = (current or {}).get('etag') or etag
                updated = self._request(
                    'PATCH',
                    f'{PEOPLE_BASE}/{resource_name}:updateContact',
                    json_body=payload,
                    params={'updatePersonFields': 'names,phoneNumbers,biographies'},
                )
            else:
                raise
        return updated or {}

    def delete_contact(self, resource_name: str) -> None:
        if not resource_name:
            return
        self._request(
            'DELETE',
            f'{PEOPLE_BASE}/{resource_name}:deleteContact',
            allow_not_found=True,
        )

    def ensure_group(self, name: str) -> str:
        listed = self._request('GET', f'{PEOPLE_BASE}/contactGroups', params={'pageSize': 200}) or {}
        for group in listed.get('contactGroups') or []:
            if (
                group.get('name') == name
                and group.get('groupType') == 'USER_CONTACT_GROUP'
                and group.get('resourceName')
            ):
                return group['resourceName']
        created = self._request(
            'POST',
            f'{PEOPLE_BASE}/contactGroups',
            json_body={'contactGroup': {'name': name}},
        ) or {}
        resource = created.get('resourceName') or (created.get('contactGroup') or {}).get('resourceName')
        if not resource:
            raise GoogleContactsError(f'Google grubu oluşturulamadı: {name}')
        return resource

    def add_to_group(self, group_resource: str, person_resource: str) -> None:
        if not group_resource or not person_resource:
            return
        try:
            self._request(
                'POST',
                f'{PEOPLE_BASE}/{group_resource}/members:modify',
                json_body={'resourceNamesToAdd': [person_resource]},
            )
        except GoogleContactsError as exc:
            message = str(exc).lower()
            if exc.status_code == 400 and ('already' in message or 'member' in message):
                return
            logger.warning('Google grup üyeliği eklenemedi: %s', exc)

    def group_resource(self, kind: str) -> str:
        field = 'student_group_resource' if kind == 'students' else 'parent_group_resource'
        name = GROUP_STUDENTS if kind == 'students' else GROUP_PARENTS
        current = getattr(self.account, field, '') or ''
        if current:
            return current
        resource = self.ensure_group(name)
        setattr(self.account, field, resource)
        self.account.save(update_fields=[field, 'updated_at'])
        return resource
