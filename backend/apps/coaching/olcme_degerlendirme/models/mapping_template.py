"""
Alan Eşleştirme Şablonu  (models/mapping_template.py)

MappingTemplate → DAT dosyası alan eşleştirmelerini sınav türüne göre saklar.
Kullanıcı bir kez eşleştirme yaptığında, bunu TYT/AYT/LGS vb. bazında kaydedip
daha sonra tekrar kullanabilir.
"""
from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class MappingTemplate(models.Model):
    """Kaydedilmiş alan eşleştirme şablonu."""

    EXAM_TYPE_CHOICES = [
        ('YKS_TYT',     'YKS – TYT'),
        ('YKS_AYT',     'YKS – AYT'),
        ('LGS',         'LGS'),
        ('DENEME',      'Deneme Sınavı'),
        ('KURUM_ICI',   'Kurum İçi Sınav'),
        ('KONU_TARAMA', 'Konu Tarama'),
        ('KAZANIM',     'Kazanım Sınavı'),
        ('OZEL',        'Özel Sınav'),
    ]

    name = models.CharField('Şablon Adı', max_length=120)
    exam_type = models.CharField(
        'Sınav Türü', max_length=20,
        choices=EXAM_TYPE_CHOICES,
    )
    mappings = models.JSONField(
        'Alan Eşleştirmeleri', default=list,
        help_text='FieldMapping dizisi: [{field, start, end, label}, ...]',
    )
    first_line_is_header = models.BooleanField('İlk Satır Başlık', default=False)
    student_id_field = models.CharField(
        'Kimlik Alanı', max_length=20, default='ogrenci_no',
    )
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='mapping_templates',
        verbose_name='Oluşturan',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'olcme_degerlendirme'
        verbose_name = 'Eşleştirme Şablonu'
        verbose_name_plural = 'Eşleştirme Şablonları'
        ordering = ['-updated_at']

    def __str__(self):
        return f'{self.name} ({self.get_exam_type_display()})'
