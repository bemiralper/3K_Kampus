"""
İletişim API view tabanı.
"""
from rest_framework.views import APIView

from apps.communication.permissions import CommunicationModulePermission


class CommunicationAPIView(APIView):
    permission_classes = [CommunicationModulePermission]
