from django.urls import path

from apps.website.interfaces import v2_views as v2

app_name = 'website_v2_admin'

urlpatterns = [
    path('dashboard/', v2.api_v2_dashboard, name='dashboard'),
    path('block-types/', v2.api_v2_block_types, name='block_types'),
    path('pages/', v2.api_v2_pages, name='pages'),
    path('pages/<int:pk>/', v2.api_v2_page_detail, name='page_detail'),
    path('pages/<int:pk>/publish/', v2.api_v2_page_publish, name='page_publish'),
    path('pages/<int:pk>/versions/', v2.api_v2_page_versions, name='page_versions'),
    path('pages/<int:pk>/seo-score/', v2.api_v2_page_seo_score, name='page_seo'),
    path('pages/<int:pk>/duplicate/', v2.api_v2_page_duplicate, name='page_duplicate'),
    path('media/', v2.api_v2_media, name='media'),
    path('media/<int:pk>/', v2.api_v2_media_detail, name='media_detail'),
    path('menus/', v2.api_v2_menus, name='menus'),
    path('menus/<int:menu_id>/items/', v2.api_v2_menu_items, name='menu_items'),
    path('theme/', v2.api_v2_theme, name='theme'),
    path('integrations/', v2.api_v2_integrations, name='integrations'),
    path('integrations/test/', v2.api_v2_integrations_test, name='integrations_test'),
    path('integrations/search-console-file/', v2.api_v2_search_console_file, name='search_console_file'),
    path('redirects/', v2.api_v2_redirects, name='redirects'),
    path('forms/', v2.api_v2_forms, name='forms'),
    path('forms/<int:pk>/', v2.api_v2_form_detail, name='form_detail'),
    path('forms/<int:pk>/submissions/', v2.api_v2_form_submissions, name='form_submissions'),
    path('content/', v2.api_v2_content, name='content'),
    path('content/<int:pk>/', v2.api_v2_content_detail, name='content_detail'),
    path('migrate-legacy/', v2.api_v2_migrate_legacy, name='migrate_legacy'),
    path('ensure-health/', v2.api_v2_ensure_health, name='ensure_health'),
    path('bootstrap-content/', v2.api_v2_bootstrap_content, name='bootstrap_content'),
    path('seo-warnings/', v2.api_v2_seo_warnings, name='seo_warnings'),
]
