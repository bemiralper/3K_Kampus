"""Handler registry — tip/key → handler instance."""

from __future__ import annotations

from apps.yedekleme.engine.handlers.base import ResourceHandler
from apps.yedekleme.engine.handlers.configuration import ConfigurationHandler
from apps.yedekleme.engine.handlers.database_full import DatabaseFullHandler
from apps.yedekleme.engine.handlers.database_table import DatabaseTableHandler
from apps.yedekleme.engine.handlers.file_directory import FileDirectoryHandler

_HANDLERS = {
    'database_full': DatabaseFullHandler(),
    'database_table': DatabaseTableHandler(),
    'file_directory': FileDirectoryHandler(),
    'configuration': ConfigurationHandler(),
    # aliases
    'media': FileDirectoryHandler(),
    'logs': FileDirectoryHandler(),
    'cache': FileDirectoryHandler(),
    'export': FileDirectoryHandler(),
    'other': FileDirectoryHandler(),
}


def get_handler(key: str) -> ResourceHandler:
    handler = _HANDLERS.get(key)
    if handler is None:
        raise KeyError(f'Bilinmeyen resource handler: {key}')
    return handler
