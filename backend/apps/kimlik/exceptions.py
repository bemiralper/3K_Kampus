"""Kimlik birleştirme istisnaları."""


class KimlikConflictError(Exception):
    """TC / telefon tekilliği ihlali — HTTP 409."""

    def __init__(self, message: str, *, code: str = 'kimlik_conflict', details: dict | None = None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details or {}

    def as_dict(self) -> dict:
        return {
            'success': False,
            'error': self.message,
            'code': self.code,
            'details': self.details,
        }
