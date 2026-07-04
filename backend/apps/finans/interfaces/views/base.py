"""
Finans API view tabanı — oturum + modül izni.
"""
from rest_framework.views import APIView

from shared.permissions import FinansModulePermission


class FinansAPIView(APIView):
    permission_classes = [FinansModulePermission]
