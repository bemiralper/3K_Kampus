"""Wizard data access helpers."""
from ..domain.models import WizardDraft


def get_draft_by_id(draft_id):
    return WizardDraft.objects.filter(id=draft_id).first()
