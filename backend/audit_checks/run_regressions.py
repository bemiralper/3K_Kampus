"""Run academic audit regressions and PostgreSQL concurrency checks."""
import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
os.environ.setdefault('DJANGO_ENV', 'test')
if os.environ['DJANGO_ENV'] != 'test':
    raise SystemExit('Audit regressions require DJANGO_ENV=test.')

import django
django.setup()
from django.core.management import call_command

call_command('test', 'apps.academic.tests.test_audit_regressions',
             'apps.academic.tests.test_payroll_concurrency',
             interactive=False, keepdb=True, verbosity=2)
