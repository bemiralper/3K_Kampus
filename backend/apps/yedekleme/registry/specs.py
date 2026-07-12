"""Resource Spec — modüller yalnızca bunu kullanarak kaynak tanımlar."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ResourceSpec:
    code: str
    name: str
    resource_type: str
    description: str = ''
    handler_key: str = ''
    config: dict[str, Any] = field(default_factory=dict)
    is_default: bool = True
    encrypt: bool = False
    compress: bool = True
    priority: int = 100
    is_restorable: bool = True
    is_system: bool = False

    def resolved_handler(self) -> str:
        if self.handler_key:
            return self.handler_key
        mapping = {
            'database_table': 'database_table',
            'file_directory': 'file_directory',
            'configuration': 'configuration',
            'media': 'file_directory',
            'logs': 'file_directory',
            'cache': 'file_directory',
            'export': 'file_directory',
            'other': 'other',
        }
        return mapping.get(self.resource_type, 'other')
