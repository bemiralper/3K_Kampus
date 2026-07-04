"""
Meta WhatsApp webhook URL — auth dışı.
"""
from django.urls import path

from apps.communication.interfaces.views.webhook import whatsapp_webhook_view

app_name = 'communication_webhook'

urlpatterns = [
    path('', whatsapp_webhook_view, name='whatsapp-webhook'),
]
