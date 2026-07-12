from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable


@dataclass
class ServiceSpec:
    code: str
    label: str
    unit: str
    description: str = ''


@dataclass
class LogSourceSpec:
    code: str
    label: str
    path: str
    category: str = 'app'  # django|gunicorn|nginx|postgres|backup|scheduler|mail|whatsapp|sms|api|security


@dataclass
class HealthCheckSpec:
    code: str
    label: str
    check: Callable[[], dict]  # returns {status, message, detail}
    category: str = 'service'


@dataclass
class JobSpec:
    code: str
    label: str
    command: str
    description: str = ''
    cron_hint: str = ''
    category: str = 'system'
    options: dict = field(default_factory=dict)


_SERVICES: dict[str, ServiceSpec] = {}
_LOGS: dict[str, LogSourceSpec] = {}
_HEALTH: dict[str, HealthCheckSpec] = {}
_JOBS: dict[str, JobSpec] = {}


def register_service(spec: ServiceSpec) -> None:
    _SERVICES[spec.code] = spec


def register_log_source(spec: LogSourceSpec) -> None:
    _LOGS[spec.code] = spec


def register_health_check(spec: HealthCheckSpec) -> None:
    _HEALTH[spec.code] = spec


def register_job(spec: JobSpec) -> None:
    _JOBS[spec.code] = spec


def all_services() -> list[ServiceSpec]:
    return list(_SERVICES.values())


def all_log_sources() -> list[LogSourceSpec]:
    return list(_LOGS.values())


def all_health_checks() -> list[HealthCheckSpec]:
    return list(_HEALTH.values())


def all_jobs() -> list[JobSpec]:
    return list(_JOBS.values())


def get_service(code: str) -> ServiceSpec | None:
    return _SERVICES.get(code)


def get_log_source(code: str) -> LogSourceSpec | None:
    return _LOGS.get(code)


def get_job(code: str) -> JobSpec | None:
    return _JOBS.get(code)
