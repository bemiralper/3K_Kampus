"""
Host'tan çalıştırılan manage.py'yi canlı Docker Postgres'e yönlendirir.

Docker compose db host'ta :5433 olarak açıktır; Homebrew PG :5432'dir.
Port 8000 Docker'dayken host `migrate` yanlışlıkla boş lms_db'ye giderdi.
LMS_USE_HOST_DB=1 veya DJANGO_ENV=test ile yönlendirme kapanır.
"""
from __future__ import annotations

import os
import socket
import sys


DOCKER_PUBLISHED_PORT = '5433'
_NOTICE = (
    'manage.py: canlı Docker Postgres kullanılıyor ({host}:{port}/{name}). '
    'Host :5432 atlandı. Native Homebrew DB için LMS_USE_HOST_DB=1.'
)


def _truthy(name: str) -> bool:
    return os.environ.get(name, '').strip().lower() in ('1', 'true', 'yes')


def running_in_container() -> bool:
    if os.path.exists('/.dockerenv'):
        return True
    if os.environ.get('DB_HOST', '').strip() == 'db':
        return True
    return False


def _tcp_open(host: str, port: int, timeout: float = 0.25) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def docker_dev_db_published() -> bool:
    return _tcp_open('127.0.0.1', int(DOCKER_PUBLISHED_PORT))


def _load_dotenv(path: str) -> dict[str, str]:
    values: dict[str, str] = {}
    if not os.path.isfile(path):
        return values
    with open(path, encoding='utf-8') as handle:
        for raw in handle:
            line = raw.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def apply_host_docker_db_if_needed(*, backend_dir: str) -> bool:
    """
    Host manage.py + Docker DB :5433 açıksa bağlantıyı oraya çevirir.

    Returns:
        True if environment was redirected.
    """
    if running_in_container():
        return False
    if _truthy('LMS_USE_HOST_DB'):
        return False
    if os.environ.get('DJANGO_ENV', '').strip().lower() in ('test', 'production'):
        return False

    explicit_host = os.environ.get('DB_HOST', '').strip()
    if explicit_host and explicit_host not in ('localhost', '127.0.0.1'):
        return False
    explicit_port = os.environ.get('DB_PORT', '').strip()
    if explicit_port and explicit_port not in ('5432', DOCKER_PUBLISHED_PORT):
        return False

    if not docker_dev_db_published():
        return False

    repo_root = os.path.dirname(backend_dir)
    env_file = os.environ.get('LMS_DOCKER_ENV', '.env.docker')
    docker_env = _load_dotenv(os.path.join(repo_root, env_file))

    os.environ['DB_HOST'] = '127.0.0.1'
    os.environ['DB_PORT'] = DOCKER_PUBLISHED_PORT
    os.environ['DB_NAME'] = docker_env.get('DB_NAME', 'lms_db')
    os.environ['DB_USER'] = docker_env.get('DB_USER', 'lms')
    os.environ['DB_PASSWORD'] = docker_env.get('DB_PASSWORD', 'lms')

    argv = ' '.join(sys.argv[1:2])
    if argv in (
        'migrate', 'makemigrations', 'showmigrations', 'dbshell',
        'shell', 'flush', 'sqlmigrate',
    ):
        print(
            _NOTICE.format(
                host=os.environ['DB_HOST'],
                port=os.environ['DB_PORT'],
                name=os.environ['DB_NAME'],
            ),
            file=sys.stderr,
        )
    return True
