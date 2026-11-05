from django.conf import settings
from django.db import models

class ExamStudyAction(models.Model):
    """Koç kararı ve dayandığı sınav verisi. Yalnız eylemde yazılır."""
    student = models.ForeignKey('ogrenci.Ogrenci', on_delete=models.CASCADE)
    exam = models.ForeignKey('olcme_degerlendirme.Exam', on_delete=models.CASCADE)
    answer = models.ForeignKey('olcme_degerlendirme.StudentAnswer', on_delete=models.CASCADE)
    source_key = models.CharField(max_length=64)
    revision = models.CharField(max_length=64)
    snapshot = models.JSONField(default=dict)
    events = models.JSONField(default=list)
    status = models.CharField(max_length=20, default='reviewed', choices=[('reviewed','İncelendi'),('planned','Plana alındı'),('assigned','Ödev oluşturuldu'),('deferred','Ertelendi'),('dismissed','Uygun bulunmadı')])
    note = models.TextField(blank=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    assignment = models.ForeignKey('assignment_manual.ManualAssignment', on_delete=models.SET_NULL, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        constraints = [models.UniqueConstraint(fields=['student','source_key'],name='unique_exam_study_action')]
