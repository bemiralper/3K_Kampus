"""Optional regression runner: fail any unmocked outbound HTTP call."""
from contextlib import ExitStack
from importlib.util import find_spec
from unittest.mock import patch

from .test_runner import LmsTestRunner


class OfflineLmsTestRunner(LmsTestRunner):
    def run_tests(self, *args, **kwargs):
        def blocked(*args, **kwargs):
            raise AssertionError('External HTTP disabled; use a mocked provider in regression tests')

        with ExitStack() as stack:
            for target in ('httpx.Client.send', 'httpx.AsyncClient.send', 'urllib.request.urlopen'):
                stack.enter_context(patch(target, side_effect=blocked))
            if find_spec('requests'):
                stack.enter_context(patch('requests.sessions.Session.request', side_effect=blocked))
            return super().run_tests(*args, **kwargs)
