"""Shared ResourceBook type/publisher filters for student_resources endpoints."""

from django.db.models import Q


def resolve_student_sinif_seviyesi_ids(student_ids):
    """
    Return distinct sinif_seviyesi IDs from active kayitlar for the given students.

    Uses aktif eğitim yılı (egitim_yili__aktif_mi=True) and aktif kayıt (aktif_mi=True).
    """
    if not student_ids:
        return []

    from apps.ogrenci.domain.models import OgrenciKayit

    return list(
        OgrenciKayit.objects.filter(
            ogrenci_id__in=student_ids,
            aktif_mi=True,
            egitim_yili__aktif_mi=True,
            sinif__sinif_seviyesi_id__isnull=False,
        )
        .values_list('sinif__sinif_seviyesi_id', flat=True)
        .distinct()
    )


def filter_books_by_student_sinif_seviyesi(qs, student_ids):
    """
    Filter ResourceBook queryset to match selected students' active class levels.

    Matches legacy sinif_seviyesi FK and sinif_seviyeleri M2M (multi-class books).
    If student_ids is empty or no matching kayit/sinif_seviyesi is found, qs is unchanged.
    """
    if not student_ids:
        return qs

    sinif_seviyesi_ids = resolve_student_sinif_seviyesi_ids(student_ids)
    if not sinif_seviyesi_ids:
        return qs

    filtered = qs.filter(
        Q(sinif_seviyesi_id__in=sinif_seviyesi_ids)
        | Q(sinif_seviyeleri__id__in=sinif_seviyesi_ids)
    ).distinct()

    return filtered


def filter_resource_books_by_type_publisher(qs, resource_type=None, publisher=None, prefix=''):
    """
    Filter a ResourceBook queryset (or related lookup via prefix) by book type and publisher.

    resource_type matches book_type.kod (case-insensitive exact) or book_type.ad (icontains).
    publisher matches yayinevi (icontains).

    prefix: optional relation prefix, e.g. 'resource_book__' for StudentResourceAssignment querysets.
    """
    if resource_type:
        qs = qs.filter(
            Q(**{f'{prefix}book_type__kod__iexact': resource_type})
            | Q(**{f'{prefix}book_type__ad__icontains': resource_type})
        )
    if publisher:
        qs = qs.filter(**{f'{prefix}yayinevi__icontains': publisher})
    return qs


def get_student_book_acquisition_map(student_id):
    """
    Map resource_book_id -> acquisition metadata for list-building UIs.

    STUDENT_OWNED / teslim edilmiş liste kalemleri: hidden (already acquired).
    Taslak/kesinleşmiş listede: visible but not selectable.
    """
    from .models import (
        StudentResourceAssignment,
        ResourcePurchaseList,
        ResourcePurchaseListItem,
    )

    result = {}

    owned_ids = StudentResourceAssignment.objects.filter(
        student_id=student_id,
        is_active=True,
        ownership_type=StudentResourceAssignment.OwnershipType.STUDENT_OWNED,
    ).values_list('resource_book_id', flat=True)
    for book_id in owned_ids:
        result[book_id] = {
            'acquisition_status': 'STUDENT_OWNED',
            'acquisition_label': 'Öğrencide var',
            'selectable': False,
            'hidden': True,
        }

    list_items = ResourcePurchaseListItem.objects.filter(
        purchase_list__student_id=student_id,
        item_status=ResourcePurchaseListItem.ItemStatus.PENDING,
        purchase_list__status__in=[
            ResourcePurchaseList.Status.DRAFT,
            ResourcePurchaseList.Status.FINALIZED,
        ],
    ).exclude(
        purchase_list__status=ResourcePurchaseList.Status.CANCELLED,
    ).select_related('purchase_list', 'assignment')

    for item in list_items:
        book_id = item.resource_book_id
        if not book_id and item.assignment_id:
            book_id = item.assignment.resource_book_id
        if not book_id:
            continue
        if book_id in result and result[book_id]['acquisition_status'] == 'STUDENT_OWNED':
            continue

        result[book_id] = {
            'acquisition_status': 'ON_LIST',
            'acquisition_label': 'Listede',
            'selectable': False,
            'hidden': False,
        }

    return result
