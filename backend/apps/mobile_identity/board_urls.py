from django.urls import path

from .board_views import board_page_api, board_poll_api, board_start_api

urlpatterns = [
    path('display/start/', board_start_api, name='board-display-start'),
    path('display/', board_poll_api, name='board-display-poll'),
    path('display/page/', board_page_api, name='board-display-page'),
]
