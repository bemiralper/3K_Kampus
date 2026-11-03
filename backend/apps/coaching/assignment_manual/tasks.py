from celery import shared_task


@shared_task(name='assignment_manual.process_operation', ignore_result=True, soft_time_limit=150, time_limit=180)
def process_assignment_operation(operation_id):
    from .operations import process_operation
    return process_operation(operation_id)
