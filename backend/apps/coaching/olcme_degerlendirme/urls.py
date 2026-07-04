"""
Ölçme & Değerlendirme — URL Router
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views.exam_views import ExamViewSet
from .views.answer_key_views import AnswerKeyViewSet
from .views.result_views import (
    upload_dat, parse_dat,
    list_results, list_sessions, delete_session,
    update_student_booklet, update_student_match,
    session_results, search_students, rematch_unmatched,
    rematch_all_exams,
)
from .views.analysis_views import (
    exam_analysis_summary,
    exam_analysis_sections,
    exam_analysis_students,
    exam_analysis_student_detail,
    exam_analysis_classes,
    exam_analysis_rankings,
    exam_analysis_questions,
    exam_analysis_strategy,
    exam_analysis_comparison,
)
from .views.mapping_template_views import (
    list_mapping_templates, create_mapping_template, delete_mapping_template,
)
from .views.student_exam_views import student_exam_results
from .views.curriculum_views import (
    subject_list, subject_detail,
    topic_list, topic_detail,
    outcome_list, outcome_detail,
    sub_outcome_create, sub_outcome_detail,
    bulk_import, bulk_text_import,
    link_subject_to_section, unlink_subject_from_section,
    reorder_topics,
    match_outcomes,
)

router = DefaultRouter()
router.register(r'exams', ExamViewSet, basename='exam')

# Nested answer-key endpoints under /exams/{exam_pk}/answer-keys/
answer_key_list = AnswerKeyViewSet.as_view({
    'get': 'list',
    'post': 'create',
})
answer_key_detail = AnswerKeyViewSet.as_view({
    'get': 'retrieve',
    'delete': 'destroy',
})
answer_key_bulk_import = AnswerKeyViewSet.as_view({
    'post': 'bulk_import',
})
answer_key_outcomes = AnswerKeyViewSet.as_view({
    'get': 'outcomes',
})
answer_key_update_item = AnswerKeyViewSet.as_view({
    'patch': 'update_item',
})

urlpatterns = [
    # Mapping templates & toplu işlemler — router'dan ÖNCE tanımlanmalı!
    # DefaultRouter exams/<pk>/ ile her string'i yakalayacağı için
    # exams/mapping-templates/ ve exams/rematch-all/ önce tanımlanmazsa router tarafından yutulur.
    path('exams/rematch-all/', rematch_all_exams, name='result-rematch-all'),
    path('exams/mapping-templates/', list_mapping_templates, name='mapping-template-list'),
    path('exams/mapping-templates/create/', create_mapping_template, name='mapping-template-create'),
    path('exams/mapping-templates/<int:template_pk>/', delete_mapping_template, name='mapping-template-delete'),

    path('', include(router.urls)),
    # Answer keys (nested under exam)
    path('exams/<int:exam_pk>/answer-keys/', answer_key_list, name='answer-key-list'),
    path('exams/<int:exam_pk>/answer-keys/<int:pk>/', answer_key_detail, name='answer-key-detail'),
    path('exams/<int:exam_pk>/answer-keys/bulk-import/', answer_key_bulk_import, name='answer-key-bulk-import'),
    path('exams/<int:exam_pk>/answer-keys/outcomes/', answer_key_outcomes, name='answer-key-outcomes'),
    path('exams/<int:exam_pk>/answer-keys/<int:pk>/update-item/', answer_key_update_item, name='answer-key-update-item'),

    # Results / DAT upload
    path('exams/<int:exam_pk>/results/', list_results, name='result-list'),
    path('exams/<int:exam_pk>/results/upload/', upload_dat, name='result-upload'),
    path('exams/<int:exam_pk>/results/sessions/', list_sessions, name='result-sessions'),
    path('exams/<int:exam_pk>/results/sessions/<int:session_pk>/', delete_session, name='result-session-delete'),
    path('exams/<int:exam_pk>/results/<int:session_pk>/parse/', parse_dat, name='result-parse'),
    path('exams/<int:exam_pk>/results/sessions/<int:session_pk>/results/', session_results, name='session-results'),
    path('exams/<int:exam_pk>/results/students/search/', search_students, name='student-search'),
    path('exams/<int:exam_pk>/results/students/<int:answer_pk>/booklet/', update_student_booklet, name='student-booklet-update'),
    path('exams/<int:exam_pk>/results/students/<int:answer_pk>/match/', update_student_match, name='student-match-update'),
    path('exams/<int:exam_pk>/results/rematch/', rematch_unmatched, name='result-rematch'),

    # Analysis endpoints
    path('exams/<int:exam_pk>/analysis/summary/', exam_analysis_summary, name='analysis-summary'),

    # Student exam results (cross-exam)
    path('student-exams/<int:student_id>/', student_exam_results, name='student-exam-results'),
    path('exams/<int:exam_pk>/analysis/sections/', exam_analysis_sections, name='analysis-sections'),
    path('exams/<int:exam_pk>/analysis/students/', exam_analysis_students, name='analysis-students'),
    path('exams/<int:exam_pk>/analysis/students/<int:answer_pk>/detail/', exam_analysis_student_detail, name='analysis-student-detail'),
    path('exams/<int:exam_pk>/analysis/classes/', exam_analysis_classes, name='analysis-classes'),
    path('exams/<int:exam_pk>/analysis/rankings/', exam_analysis_rankings, name='analysis-rankings'),
    path('exams/<int:exam_pk>/analysis/questions/', exam_analysis_questions, name='analysis-questions'),
    path('exams/<int:exam_pk>/analysis/strategy/', exam_analysis_strategy, name='analysis-strategy'),
    path('exams/<int:exam_pk>/analysis/comparison/', exam_analysis_comparison, name='analysis-comparison'),

    # ── MÜFREDAT / KAZANIM YÖNETİMİ ─────────────────────────────────────────
    # Subject (Ders) CRUD
    path('curriculum/subjects/', subject_list, name='subject-list'),
    path('curriculum/subjects/<int:subject_pk>/', subject_detail, name='subject-detail'),

    # Topic (Konu) CRUD
    path('curriculum/subjects/<int:subject_pk>/topics/', topic_list, name='topic-list'),
    path('curriculum/subjects/<int:subject_pk>/topics/<int:topic_pk>/', topic_detail, name='topic-detail'),
    path('curriculum/subjects/<int:subject_pk>/reorder-topics/', reorder_topics, name='reorder-topics'),
    path('curriculum/subjects/<int:subject_pk>/match-outcomes/', match_outcomes, name='match-outcomes'),

    # Outcome (Kazanım) CRUD
    path('curriculum/subjects/<int:subject_pk>/topics/<int:topic_pk>/outcomes/', outcome_list, name='outcome-list'),
    path('curriculum/subjects/<int:subject_pk>/topics/<int:topic_pk>/outcomes/<int:outcome_pk>/', outcome_detail, name='outcome-detail'),

    # SubOutcome (Alt Kazanım) CRUD
    path('curriculum/subjects/<int:subject_pk>/topics/<int:topic_pk>/outcomes/<int:outcome_pk>/sub-outcomes/', sub_outcome_create, name='sub-outcome-create'),
    path('curriculum/subjects/<int:subject_pk>/topics/<int:topic_pk>/outcomes/<int:outcome_pk>/sub-outcomes/<int:sub_outcome_pk>/', sub_outcome_detail, name='sub-outcome-detail'),

    # Toplu İçe Aktarım
    path('curriculum/bulk-import/', bulk_import, name='curriculum-bulk-import'),
    path('curriculum/bulk-text-import/', bulk_text_import, name='curriculum-bulk-text-import'),

    # Ders ↔ Sınav Bölümü Bağlama
    path('curriculum/link-section/', link_subject_to_section, name='curriculum-link-section'),
    path('curriculum/unlink-section/', unlink_subject_from_section, name='curriculum-unlink-section'),
]
