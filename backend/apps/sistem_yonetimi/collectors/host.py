"""Host / process metrics via psutil (graceful without psutil / sandbox limits)."""

from __future__ import annotations

from datetime import datetime, timezone


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def collect_host_metrics() -> dict:
    try:
        import psutil
    except ImportError:
        return {
            'available': False,
            'error': 'psutil yüklü değil',
            'collected_at': _now_iso(),
        }

    try:
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        try:
            dio = psutil.disk_io_counters()
            disk_read = int(getattr(dio, 'read_bytes', 0) or 0)
            disk_write = int(getattr(dio, 'write_bytes', 0) or 0)
        except Exception:
            disk_read = disk_write = 0
        try:
            net = psutil.net_io_counters()
            net_sent = int(getattr(net, 'bytes_sent', 0) or 0)
            net_recv = int(getattr(net, 'bytes_recv', 0) or 0)
        except Exception:
            net_sent = net_recv = 0

        boot = None
        try:
            boot = datetime.fromtimestamp(psutil.boot_time(), tz=timezone.utc).isoformat()
        except Exception:
            pass

        try:
            cpu_percent = float(psutil.cpu_percent(interval=0.0))
        except Exception:
            cpu_percent = 0.0
        try:
            cpu_count = int(psutil.cpu_count() or 0)
        except Exception:
            cpu_count = 0
        try:
            load_avg = list(psutil.getloadavg()) if hasattr(psutil, 'getloadavg') else []
        except Exception:
            load_avg = []

        return {
            'available': True,
            'collected_at': _now_iso(),
            'cpu_percent': cpu_percent,
            'cpu_count': cpu_count,
            'ram_percent': float(mem.percent),
            'ram_used_bytes': int(mem.used),
            'ram_total_bytes': int(mem.total),
            'disk_percent': float(disk.percent),
            'disk_used_bytes': int(disk.used),
            'disk_total_bytes': int(disk.total),
            'disk_free_bytes': int(disk.free),
            'disk_read_bytes': disk_read,
            'disk_write_bytes': disk_write,
            'net_bytes_sent': net_sent,
            'net_bytes_recv': net_recv,
            'boot_time': boot,
            'load_avg': load_avg,
        }
    except Exception as exc:  # noqa: BLE001
        return {
            'available': False,
            'error': str(exc),
            'collected_at': _now_iso(),
            'cpu_percent': 0,
            'ram_percent': 0,
            'disk_percent': 0,
        }


def process_memory_rss(pid: int | None) -> int | None:
    if not pid:
        return None
    try:
        import psutil
        return int(psutil.Process(pid).memory_info().rss)
    except Exception:
        return None
