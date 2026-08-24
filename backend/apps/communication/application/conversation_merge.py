"""Aynı kişiye ait kopya sohbetleri tek thread altında birleştirir."""
from __future__ import annotations

from collections import defaultdict

from django.db import transaction
from django.db.models import Count

from apps.communication.domain.models import Conversation, Message
from apps.communication.infrastructure.repository import conversation_phone_tail


def conversation_thread_key(conv: Conversation) -> tuple:
    tail = conversation_phone_tail(conv.contact_phone)
    dept = conv.department or ''
    if conv.veli_id:
        return ('veli', conv.veli_id, tail, dept)
    if conv.ogrenci_id and (conv.contact_type or '').upper() != 'PERSONEL':
        return ('ogrenci', conv.ogrenci_id, tail, dept)
    return ('phone', tail, dept)


def merge_duplicate_conversations(kurum_id: int, *, dry_run: bool = False) -> dict:
    """
    Aynı kişi/telefon için birden fazla Conversation varsa mesajları
    en dolu/en güncel kayda taşır, diğerlerini siler.
    """
    convs = list(
        Conversation.objects.filter(kurum_id=kurum_id).annotate(
            _msg_count=Count('messages'),
        )
    )
    groups: dict[tuple, list[Conversation]] = defaultdict(list)
    for conv in convs:
        groups[conversation_thread_key(conv)].append(conv)

    merged = 0
    removed = 0
    groups_touched = 0
    for members in groups.values():
        if len(members) < 2:
            continue
        groups_touched += 1
        winner = _pick_winner(members)
        losers = [c for c in members if c.id != winner.id]
        if dry_run:
            removed += len(losers)
            continue
        with transaction.atomic():
            _absorb(winner, losers)
            removed += len(losers)
            merged += 1

    return {
        'groups': groups_touched,
        'merged': merged,
        'removed': removed,
        'dry_run': dry_run,
    }


def _pick_winner(members: list[Conversation]) -> Conversation:
    return sorted(
        members,
        key=lambda c: (
            getattr(c, '_msg_count', 0) or 0,
            c.last_message_at or c.updated_at or c.created_at,
            c.created_at,
        ),
        reverse=True,
    )[0]


def _absorb(winner: Conversation, losers: list[Conversation]) -> None:
    update_fields = []
    for loser in losers:
        Message.objects.filter(conversation=loser).update(conversation=winner)
        loser.internal_notes.update(conversation=winner)
        loser.transfer_logs.update(conversation=winner)
        loser.events.update(conversation=winner)
        for tag in loser.tags.all():
            winner.tags.add(tag)
        if not winner.contact_name and loser.contact_name:
            winner.contact_name = loser.contact_name
            update_fields.append('contact_name')
        if not winner.contact_identity_id and loser.contact_identity_id:
            winner.contact_identity_id = loser.contact_identity_id
            update_fields.append('contact_identity')
        if loser.unread_count_coach:
            winner.unread_count_coach = (winner.unread_count_coach or 0) + loser.unread_count_coach
            if 'unread_count_coach' not in update_fields:
                update_fields.append('unread_count_coach')
        loser_at = loser.last_message_at
        if loser_at and (not winner.last_message_at or loser_at > winner.last_message_at):
            winner.last_message_at = loser_at
            winner.last_message_preview = loser.last_message_preview
            update_fields.extend(['last_message_at', 'last_message_preview'])
        loser.delete()
    if update_fields:
        winner.save(update_fields=list(dict.fromkeys(update_fields + ['updated_at'])))
