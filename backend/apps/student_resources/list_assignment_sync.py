"""Purchase list ↔ student resource assignment sync helpers."""

from django.utils import timezone

from .models import ResourcePurchaseList, ResourcePurchaseListItem, StudentResourceAssignment


def ownership_for_list_type(list_type):
    if list_type == ResourcePurchaseList.ListType.INSTITUTION:
        return StudentResourceAssignment.OwnershipType.INSTITUTION_PROVIDED
    return StudentResourceAssignment.OwnershipType.TO_PURCHASE


def create_assignment_for_list_item(student, book, lesson, list_type, user):
    """Create or reactivate a student resource assignment for a list item."""
    ownership_type = ownership_for_list_type(list_type)
    coach = user if user and getattr(user, 'is_authenticated', False) else None

    inactive = StudentResourceAssignment.objects.filter(
        student=student,
        resource_book=book,
        is_active=False,
    ).first()
    if inactive:
        inactive.is_active = True
        inactive.deleted_at = None
        inactive.lesson = lesson
        inactive.coach = coach
        inactive.ownership_type = ownership_type
        inactive.status = StudentResourceAssignment.Status.ASSIGNED
        inactive.progress_percent = 0
        inactive.completed_at = None
        inactive.difficulty_level_snapshot = ''
        inactive.save()
        return inactive

    active = StudentResourceAssignment.objects.filter(
        student=student,
        resource_book=book,
        is_active=True,
    ).first()
    if active:
        if active.ownership_type != ownership_type:
            active.ownership_type = ownership_type
            active.save(update_fields=['ownership_type', 'updated_at'])
        return active

    return StudentResourceAssignment.objects.create(
        student=student,
        resource_book=book,
        lesson=lesson,
        coach=coach,
        ownership_type=ownership_type,
    )


def apply_list_item_status(item, new_status):
    """Apply item status change and sync linked assignment."""
    item.item_status = new_status
    item.save(update_fields=['item_status'])

    assignment = item.assignment
    if not assignment:
        refresh_list_status(item.purchase_list)
        return item

    if new_status == ResourcePurchaseListItem.ItemStatus.RECEIVED:
        assignment.ownership_type = StudentResourceAssignment.OwnershipType.STUDENT_OWNED
        assignment.save(update_fields=['ownership_type', 'updated_at'])
    elif new_status in (
        ResourcePurchaseListItem.ItemStatus.NOT_RECEIVED,
        ResourcePurchaseListItem.ItemStatus.CANCELLED,
    ):
        assignment.is_active = False
        assignment.deleted_at = timezone.now()
        assignment.save(update_fields=['is_active', 'deleted_at', 'updated_at'])

    refresh_list_status(item.purchase_list)
    return item


def refresh_list_status(purchase_list):
    """Set list DELIVERED when no pending items remain; otherwise FINALIZED."""
    has_pending = purchase_list.items.filter(
        item_status=ResourcePurchaseListItem.ItemStatus.PENDING,
    ).exists()

    if has_pending:
        if purchase_list.status != ResourcePurchaseList.Status.CANCELLED:
            purchase_list.status = ResourcePurchaseList.Status.FINALIZED
            if not purchase_list.finalized_at:
                purchase_list.finalized_at = timezone.now()
            purchase_list.delivered_at = None
            purchase_list.save(update_fields=['status', 'finalized_at', 'delivered_at'])
    else:
        if purchase_list.status not in (
            ResourcePurchaseList.Status.CANCELLED,
            ResourcePurchaseList.Status.DRAFT,
        ):
            purchase_list.status = ResourcePurchaseList.Status.DELIVERED
            if not purchase_list.finalized_at:
                purchase_list.finalized_at = timezone.now()
            purchase_list.delivered_at = timezone.now()
            purchase_list.save(update_fields=['status', 'finalized_at', 'delivered_at'])
