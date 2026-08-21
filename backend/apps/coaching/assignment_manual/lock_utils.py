"""Ödev kontrol kilidi — kontrol günü bittikten sonra düzenleme/silme engeli."""

from datetime import date

from django.utils import timezone

from .models import AssignmentTask, ManualAssignment

CONTROL_LOCK_MESSAGE = (
    'Kontrol günü sona erdiği için bu ödev artık düzenlenemez veya silinemez.'
)

CONTROL_LOCK_OVERRIDE_ROLES = frozenset({
    'super_admin',
    'admin',
    'kurum_yoneticisi',
    'sube_yoneticisi',
    'egitim_yoneticisi',
    'mudur',
    'mudir_yardimcisi',
    'sube_muduru',
})


def can_override_assignment_control_lock(user) -> bool:
    """
    Yönetici, kontrol günü geçmiş ödevi düzenleyebilir / yeniden aktif edebilir.

    Koç profili olsa bile rol/süper kullanıcı yeterlidir — unutulan
    ertelemede sonraki haftanın işini yeniden girmek zorunda kalmasınlar.
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False):
        return True
    try:
        role_code = user.user_role.role.code
    except Exception:
        return False
    return role_code in CONTROL_LOCK_OVERRIDE_ROLES


def assignment_due_local_date(assignment) -> date | None:
    if not assignment.due_date:
        return None
    if timezone.is_aware(assignment.due_date):
        return timezone.localtime(assignment.due_date).date()
    return assignment.due_date.date()


def assignment_has_control_evaluation(assignment, *, use_prefetch: bool = False) -> bool:
    """
    En az bir görev değerlendirilmiş veya ödev getirilmedi işaretlenmiş.

    `use_prefetch=True` — çağıran taraf `lessons`/`lessons__tasks` ilişkilerini
    zaten `prefetch_related` ile yüklediyse (örn. liste serializer'ı), bellekteki
    prefetch cache üzerinden hesaplar ve ek bir DB sorgusu yapmaz (N+1 önlenir).
    Varsayılan `False` — tek kayıt (detay/aksiyon) senaryolarında güvenli DB sorgusu.
    """
    if assignment.non_submission_reason:
        return True
    if use_prefetch:
        return any(
            task.completion_status != AssignmentTask.CompletionStatus.PENDING
            for lesson in assignment.lessons.all()
            for task in lesson.tasks.all()
        )
    return AssignmentTask.objects.filter(
        lesson_block__assignment=assignment,
    ).exclude(
        completion_status=AssignmentTask.CompletionStatus.PENDING,
    ).exists()


def is_assignment_control_locked(assignment, *, use_prefetch: bool = False) -> bool:
    """
    Ödev kontrolü yapılmış ve kontrol günü (due_date) takvim günü olarak bitmişse kilitli.
    Aynı gün içinde düzenlemeye izin verilir; ertesi günden itibaren kilitlenir.
    """
    if not assignment_has_control_evaluation(assignment, use_prefetch=use_prefetch):
        return False
    due = assignment_due_local_date(assignment)
    if not due:
        return False
    return timezone.localdate() > due
