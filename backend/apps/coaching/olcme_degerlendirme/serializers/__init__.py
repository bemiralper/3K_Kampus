"""
Serializer Paketi

exam         → Sınav CRUD serializer'ları
answer_key   → Cevap anahtarı serializer'ları
session      → DAT oturumu serializer'ları
result       → Sonuç / analiz serializer'ları
curriculum   → Müfredat serializer'ları (Ders / Konu / Kazanım / Alt Kazanım)
"""

from .exam import (
    ExamListSerializer,
    ExamDetailSerializer,
    ExamCreateSerializer,
    ExamUpdateSerializer,
    ExamSectionSerializer,
)

from .answer_key import (
    AnswerKeySerializer,
    AnswerKeyItemSerializer,
    BulkAnswerKeyImportSerializer,
)

from .result import (
    ExamSessionListSerializer,
    StudentAnswerSerializer,
    StudentSectionScoreSerializer,
)

from .mapping_template import MappingTemplateSerializer

from .curriculum import (
    SubjectListSerializer,
    SubjectDetailSerializer,
    SubjectCreateSerializer,
    TopicSerializer,
    TopicCreateSerializer,
    OutcomeSerializer,
    OutcomeCreateSerializer,
    SubOutcomeSerializer,
    SubOutcomeCreateSerializer,
    BulkCurriculumImportSerializer,
    BulkTextImportSerializer,
)

__all__ = [
    'ExamListSerializer',
    'ExamDetailSerializer',
    'ExamCreateSerializer',
    'ExamUpdateSerializer',
    'ExamSectionSerializer',
    'AnswerKeySerializer',
    'AnswerKeyItemSerializer',
    'BulkAnswerKeyImportSerializer',
    'ExamSessionListSerializer',
    'StudentAnswerSerializer',
    'StudentSectionScoreSerializer',
    'MappingTemplateSerializer',
    # Curriculum
    'SubjectListSerializer',
    'SubjectDetailSerializer',
    'SubjectCreateSerializer',
    'TopicSerializer',
    'TopicCreateSerializer',
    'OutcomeSerializer',
    'OutcomeCreateSerializer',
    'SubOutcomeSerializer',
    'SubOutcomeCreateSerializer',
    'BulkCurriculumImportSerializer',
    'BulkTextImportSerializer',
]
