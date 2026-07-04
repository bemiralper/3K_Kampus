"""Ödev tamamlanma yüzdesi hesaplama yardımcıları."""


def effective_task_completion_percent(task) -> int:
    """
    Görevin rapor/özet için etkin tamamlanma yüzdesi.
    PARTIAL en fazla %90; NOT_DONE ve PENDING %0; DONE %100.
    """
    status = task.completion_status
    if status in ('PENDING', 'NOT_DONE'):
        return 0
    if status == 'DONE':
        return 100
    if status == 'PARTIAL':
        pct = task.task_completion_percent or 0
        return min(90, max(10, pct))
    return max(0, min(100, task.task_completion_percent or 0))


def compute_weighted_completion_percent(tasks) -> int:
    """
    Tüm görevlerin ağırlıklı ortalaması (eksik/yapmadı dahil).
    Tek görev %70 eksik + bir görev yaptı → ortalama %85 gibi.
    """
    task_list = list(tasks)
    if not task_list:
        return 0
    total = sum(effective_task_completion_percent(t) for t in task_list)
    return round(total / len(task_list))


def build_report_summary_counts(tasks):
    """Rapor özeti sayaçları ve yüzdeleri."""
    task_list = list(tasks)
    total_tasks = len(task_list)
    done_tasks = sum(1 for t in task_list if t.completion_status == 'DONE')
    not_done_tasks = sum(1 for t in task_list if t.completion_status == 'NOT_DONE')
    partial_tasks = sum(1 for t in task_list if t.completion_status == 'PARTIAL')
    pending_tasks = sum(1 for t in task_list if t.completion_status == 'PENDING')

    total_questions = sum(t.question_count or 0 for t in task_list)
    completed_questions = sum(t.completed_question_count or 0 for t in task_list)
    total_pages = sum(t.page_count or 0 for t in task_list)
    completed_pages = sum(t.completed_page_count or 0 for t in task_list)

    weighted_percent = compute_weighted_completion_percent(task_list)

    return {
        'total_tasks': total_tasks,
        'done_tasks': done_tasks,
        'not_done_tasks': not_done_tasks,
        'partial_tasks': partial_tasks,
        'pending_tasks': pending_tasks,
        'total_questions': total_questions,
        'completed_questions': completed_questions,
        'remaining_questions': total_questions - completed_questions,
        'total_pages': total_pages,
        'completed_pages': completed_pages,
        'remaining_pages': total_pages - completed_pages,
        'question_completion_percent': round(
            (completed_questions / total_questions * 100) if total_questions > 0 else 0
        ),
        'page_completion_percent': round(
            (completed_pages / total_pages * 100) if total_pages > 0 else 0
        ),
        # Ağırlıklı ortalama — eksik görevler dahil; "yaptı sayısı / toplam" değil
        'task_completion_percent': weighted_percent,
        'overall_completion_percent': weighted_percent,
    }


def classify_assignment_outcome(assignment, tasks) -> str:
    """
    Tek ödevi sonuç kategorisine ayırır (karşılıklı dışlayan).
    not_brought | not_done | other | pending | partial | full
    """
    reason = assignment.non_submission_reason
    if reason == 'NOT_BROUGHT':
        return 'not_brought'
    if reason == 'NOT_DONE':
        return 'not_done'
    if reason in ('CONTROL_NOT_POSSIBLE', 'OTHER'):
        return 'other'

    task_list = list(tasks)
    if not task_list:
        return 'pending'

    statuses = [t.completion_status for t in task_list]
    if all(s == 'PENDING' for s in statuses):
        return 'pending'

    has_partial = any(s == 'PARTIAL' for s in statuses)
    has_not_done = any(s == 'NOT_DONE' for s in statuses)
    has_done = any(s == 'DONE' for s in statuses)
    all_done = all(s == 'DONE' for s in statuses)

    if all_done and not has_partial:
        return 'full'
    if has_partial:
        return 'partial'
    if has_not_done and not has_done and not has_partial:
        return 'not_done'
    if compute_weighted_completion_percent(task_list) >= 100 and all_done:
        return 'full'
    return 'partial'


def build_assignment_outcome_stats(assignments, tasks_by_assignment_id=None):
    """Öğrencinin bugüne kadar aldığı ödevlerin ödev bazlı dağılımı."""
    tasks_by_assignment_id = tasks_by_assignment_id or {}
    counts = {
        'full_assignments': 0,
        'partial_assignments': 0,
        'not_brought_assignments': 0,
        'not_done_assignments': 0,
        'other_non_submission_assignments': 0,
        'pending_evaluations': 0,
    }
    for assignment in assignments:
        tasks = tasks_by_assignment_id.get(assignment.id, [])
        outcome = classify_assignment_outcome(assignment, tasks)
        key_map = {
            'full': 'full_assignments',
            'partial': 'partial_assignments',
            'not_brought': 'not_brought_assignments',
            'not_done': 'not_done_assignments',
            'other': 'other_non_submission_assignments',
            'pending': 'pending_evaluations',
        }
        counts[key_map[outcome]] += 1

    total = len(assignments)
    evaluated = total - counts['pending_evaluations']
    counts['evaluated_assignments'] = evaluated
    counts['assignment_success_percent'] = round(
        (counts['full_assignments'] / total * 100) if total > 0 else 0
    )
    return counts
