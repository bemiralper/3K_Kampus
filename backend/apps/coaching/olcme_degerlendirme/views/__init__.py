"""
View Paketi

exam_views        → Sınav CRUD + bölüm yönetimi
answer_key_views  → Cevap anahtarı CRUD + toplu aktarım
curriculum_views  → Müfredat CRUD + toplu aktarım
"""
from rest_framework.authentication import SessionAuthentication


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """CSRF doğrulamasını devre dışı bırakır (API istemcileri için)."""
    def enforce_csrf(self, request):
        return


from .exam_views import ExamViewSet
from .answer_key_views import AnswerKeyViewSet
from .result_views import (
    upload_dat,
    parse_dat,
    list_results,
    list_sessions,
    delete_session,
)
from .mapping_template_views import (
    list_mapping_templates,
    create_mapping_template,
    delete_mapping_template,
)
from .analysis_views import (
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
from .student_exam_views import student_exam_results
from .curriculum_views import (
    subject_list,
    subject_detail,
    topic_list,
    topic_detail,
    outcome_list,
    outcome_detail,
    sub_outcome_create,
    sub_outcome_detail,
    bulk_import,
    bulk_text_import,
    link_subject_to_section,
    unlink_subject_from_section,
)

__all__ = [
    'CsrfExemptSessionAuthentication',
    'ExamViewSet',
    'AnswerKeyViewSet',
    'upload_dat',
    'parse_dat',
    'list_results',
    'list_sessions',
    'delete_session',
    'list_mapping_templates',
    'create_mapping_template',
    'delete_mapping_template',
    'exam_analysis_summary',
    'exam_analysis_sections',
    'exam_analysis_students',
    'exam_analysis_student_detail',
    'exam_analysis_classes',
    'exam_analysis_rankings',
    'exam_analysis_questions',
    'exam_analysis_strategy',
    'exam_analysis_comparison',
    'student_exam_results',
    # Curriculum
    'subject_list',
    'subject_detail',
    'topic_list',
    'topic_detail',
    'outcome_list',
    'outcome_detail',
    'sub_outcome_create',
    'sub_outcome_detail',
    'bulk_import',
    'bulk_text_import',
    'link_subject_to_section',
    'unlink_subject_from_section',
]
