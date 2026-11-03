"""Yedek sürecinin gerçekten çalışıp çalışmadığı.

Karar yaşa bakmaz. Aynı kilit dosyası cron ile panelde ortaktır
(`/var/lock/lms-backup.lock`). Süreç düşünce çekirdek kilidi bırakır.
Nabız dosyası pid ve zaman yazar; süreç yaşıyorsa yeni yedek açılmaz.
"""

from __future__ import annotations

import os
import socket
import threading
import time
from pathlib import Path


def backup_lock_path() -> Path:
    override = (os.environ.get('LMS_BACKUP_LOCK') or '').strip()
    if override:
        return Path(override)
    return Path('/var/lock/lms-backup.lock')


def heartbeat_path() -> Path:
    override = (os.environ.get('LMS_BACKUP_HEARTBEAT') or '').strip()
    if override:
        return Path(override)
    return Path('/var/log/lms/cron-state/backup.heartbeat')


def process_alive(pid: int | None) -> bool:
    if not pid or int(pid) <= 0:
        return False
    if int(pid) == os.getpid():
        return False
    try:
        os.kill(int(pid), 0)
    except OSError:
        return False
    return True


def read_heartbeat() -> dict | None:
    path = heartbeat_path()
    try:
        text = path.read_text(encoding='utf-8')
    except OSError:
        return None
    data: dict[str, str] = {}
    for line in text.splitlines():
        if '=' not in line:
            continue
        key, value = line.split('=', 1)
        data[key.strip()] = value.strip()
    if 'pid' not in data or 'beat' not in data:
        return None
    return data


def foreign_heartbeat_alive(*, max_age_seconds: int = 30) -> bool:
    data = read_heartbeat()
    if not data:
        return False
    try:
        pid = int(data['pid'])
        beat = int(data['beat'])
    except (TypeError, ValueError):
        return False
    if time.time() - beat > max_age_seconds:
        return False
    return process_alive(pid)


class BackupRunGuard:
    """Kilit tutulurken nabız yazılır. Bırakılınca dosya silinmez."""

    def __init__(self):
        self.fd: int | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def try_acquire(self) -> bool:
        path = backup_lock_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(path, os.O_RDWR | os.O_CREAT, 0o644)
        try:
            import fcntl
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            os.close(fd)
            return False
        except OSError:
            os.close(fd)
            raise
        self.fd = fd
        return True

    def start_heartbeat(self) -> None:
        if self._thread is not None:
            return
        self._write_beat()
        self._thread = threading.Thread(target=self._loop, name='backup-heartbeat', daemon=True)
        self._thread.start()

    def release(self) -> None:
        self._stop.set()
        thread = self._thread
        self._thread = None
        if thread is not None and thread is not threading.current_thread():
            thread.join(timeout=1)
        fd = self.fd
        self.fd = None
        if fd is None:
            return
        try:
            import fcntl
            fcntl.flock(fd, fcntl.LOCK_UN)
        except OSError:
            pass
        try:
            os.close(fd)
        except OSError:
            pass

    def _loop(self) -> None:
        while not self._stop.wait(2):
            self._write_beat()

    def _write_beat(self) -> None:
        path = heartbeat_path()
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(
                f'pid={os.getpid()}\nhost={socket.gethostname()}\nbeat={int(time.time())}\n',
                encoding='utf-8',
            )
        except OSError:
            return


def backup_owner_alive() -> bool:
    """Başka bir süreç yedek kilidini veya taze nabzı tutuyorsa doğrudur."""
    guard = BackupRunGuard()
    try:
        if not guard.try_acquire():
            return True
    except OSError:
        # Kilit dosyası yoklanamıyorsa ikinci yedeği güvenli sayma.
        return True
    try:
        return foreign_heartbeat_alive()
    finally:
        guard.release()
