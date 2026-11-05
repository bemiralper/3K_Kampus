"""Karne ve koç için ortak güncel kayıp hesabı; koçta geçmiş kanıtı ve kararlar."""
import hashlib
import json


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,default=str).encode()).hexdigest()


def identity_key(row):
    ids=tuple(row.get(k) for k in ('subject_id','topic_id','outcome_id','sub_outcome_id'))
    return ('id',*ids) if ids[2] or ids[3] else ('text',ids[0],row.get('subject'),row.get('topic') or row.get('subject'),row.get('name'))


def current_losses(blocks, score_names, leaves, penalty):
    rows=[]
    for block in blocks:
        for table in block.get('tables') or []:
            if score_names and table.get('title') not in score_names and block.get('heading') not in score_names:
                continue
            for row in table.get('rows') or []:
                w,e=int(row.get('yanlis') or 0),int(row.get('bos') or 0)
                if w+e:
                    rows.append({**row,'subject':table.get('title') or block.get('heading'),'wrong':w,'empty':e,'correct':int(row.get('dogru') or 0),'question_count':int(row.get('soru') or 0),'gain':round(w*(1+penalty)+e,2)})
    if not rows:
        for leaf in leaves:
            w,e=int(leaf.get('wrong') or 0),int(leaf.get('empty') or 0)
            if w+e:
                rows.append({'section_fallback':True,'name':leaf['section_name'],'subject':leaf['section_name'],'topic':'','wrong':w,'empty':e,'correct':leaf.get('correct',0),'question_count':leaf.get('question_count',0),'questions':[],'gain':round(w*(1+penalty)+e,2)})
    return sorted(rows,key=lambda r:(-r['gain'],r.get('basari') or 0,r['name']))


def build_study_agenda(student, answers, outcomes_by_subject, alan):
    from ..models import ExamStudyAction
    from .development_analysis import scoring_scores_by_name, ayt_section_allowed
    from .topic_blocks import build_topic_blocks
    latest=answers[-1]; exam=latest.session.exam
    leaves=[]
    scores=scoring_scores_by_name(latest,exam)
    for name,score in scores.items():
        if not ayt_section_allowed(name,exam.exam_type,alan,score_scope=True) or ('Seçmeli' in name and not(score.correct+score.wrong)):
            continue
        row={'section_name':name,'correct':score.correct,'wrong':score.wrong,'empty':score.empty,'question_count':score.section.question_count}
        if getattr(score,'_incomplete_breakdown',False):
            children=[s for s in scores.values() if s.section.parent_section_id==score.section_id]
            for key in ('correct','wrong','empty'):
                row[key]=max(0,row[key]-sum(getattr(s,key) for s in children))
            row['question_count']=max(0,row['question_count']-sum(s.section.question_count for s in children))
            row['section_name']=name+' · kırılım eksik'
        leaves.append(row)
    blocks=getattr(latest,'_study_topic_blocks',None)
    if blocks is None:
        blocks=build_topic_blocks(exam,latest.comparison or {},latest.booklet or '')
    penalty=1/exam.wrong_answer_count if exam.wrong_answer_count else 0
    if exam.exam_type in ('YKS_AYT','AYT_11') and not exam.per_section_penalty:
        penalty=0
    losses=current_losses(blocks,{r['section_name'] for r in leaves},leaves,penalty) if leaves else []
    for leaf in leaves:
        covered=[r for r in losses if r['subject']==leaf['section_name']]
        w=max(0,leaf['wrong']-sum(r['wrong'] for r in covered))
        e=max(0,leaf['empty']-sum(r['empty'] for r in covered))
        if w+e:
            losses.append({'name':leaf['section_name']+' · kazanımı eşlenmemiş sorular','subject':leaf['section_name'],'topic':'Eşleme eksik',
                           'wrong':w,'empty':e,'correct':0,'question_count':w+e,'gain':round(w*(1+penalty)+e,2),'questions':[]})
    actions={a.source_key:a for a in ExamStudyAction.objects.filter(student=student).select_related('assignment','exam')}
    agenda=[]; identities=set()
    def finish(row):
        row.update(algorithm_version=1, kurum_id=exam.kurum_id, sube_id=exam.sube_id,
                   egitim_yili_id=exam.egitim_yili_id, exam_type=exam.exam_type, alan=alan,
                   wrong_answer_count=exam.wrong_answer_count, per_section_penalty=exam.per_section_penalty)
        row.update(status='new',note='',assignment_id=None,stale=False)
        row['revision']=digest(row)
        action=actions.get(row['key'])
        if action:
            row.update(status=action.status,note=action.note,assignment_id=action.assignment_id,stale=action.revision!=row['revision'])
            if action.assignment_id:
                row['assignment_active']=action.assignment.is_active
                row['assignment_status']=action.assignment.status
                if action.assignment.status=='COMPLETED':
                    row['status']='waiting_measurement'
        agenda.append(row)
    for row in losses:
        ids={key:row.get(key) for key in ('subject_id','topic_id','outcome_id','sub_outcome_id')}
        identity=identity_key(row)
        identities.add(identity_key(row))
        history=next((o for o in outcomes_by_subject.get(row['subject'],[]) if identity_key(o)==identity_key(row)),None)
        points=history['series'] if history else []
        missed=sum(1 for p in points if p['wrong']+p['empty']>0)
        finish({**ids,'key':digest([latest.id,identity]),'kind':'recurring' if missed>=2 else 'current',
                'subject':row['subject'],'topic':row.get('topic') or row['subject'],'name':row['name'],
                'exam_id':exam.id,'answer_id':latest.id,'exam_name':exam.name,'exam_date':str(exam.exam_date) if exam.exam_date else None,'booklet':latest.booklet,
                'questions':row.get('questions') or [],'wrong':row['wrong'],'empty':row['empty'],'correct':row['correct'],'question_count':row['question_count'],'gain':row['gain'],
                'exam_count':len(points) or 1,'missed_exam_count':missed or 1,'evidence':points,'mastery_rate':history['mastery_rate'] if history else None,'confidence':history['data_confidence'] if history and len(points)>=2 else 'insufficient',
                'reason':'Birden fazla ölçümde kayıp var.' if missed>=2 else 'Son sınavda kontrol edilecek yanlış/boş var.'})
    for outcomes in outcomes_by_subject.values():
        for out in outcomes:
            if identity_key(out) in identities or out['mastery_rate'] is None or (out['mastery_rate']>=80 and (not out['series'] or out['series'][-1]['mastery_rate']>=80)) or out['question_count']<3:
                continue
            academic=not ayt_section_allowed(out['subject'],exam.exam_type,alan,score_scope=True)
            finish({**{k:out.get(k) for k in ('subject_id','topic_id','outcome_id','sub_outcome_id')}, 'key':digest(['history',identity_key(out)]),
                    'kind':'academic' if academic else 'recheck','subject':out['subject'],'topic':out['topic'],'name':out['name'],'exam_id':exam.id,'answer_id':latest.id,'exam_name':exam.name,
                    'exam_date':str(exam.exam_date) if exam.exam_date else None,'wrong':out['wrong'],'empty':out['empty'],'correct':out['correct'],'question_count':out['question_count'],'gain':None,'questions':[],
                    'exam_count':len(out['series']),'missed_exam_count':sum(1 for p in out['series'] if p['wrong']+p['empty']),
                    'evidence':out['series'],'mastery_rate':out['mastery_rate'],'confidence':out['data_confidence'] if len(out['series'])>=2 else 'insufficient','reason':'Bu ders seçili puana girmez; genel akademik takip için kontrol edin.' if academic else 'Geçmişte eksik var; son sınavda yeniden ölçülmedi.'})
    agenda.sort(key=lambda r:(r['kind']!='recurring',-(r['gain'] or 0),-r['missed_exam_count'],r['subject']))
    measured=sum(r.get('soru',0) for block in blocks for t in block['tables'] for r in t['rows'])
    followups=[]
    active_ids={a.session.exam_id for a in answers}
    for action in actions.values():
        snap=action.snapshot
        if (not action.assignment_id and action.status!='planned') or action.exam_id==exam.id:
            continue
        if action.exam.kurum_id!=exam.kurum_id or action.exam.egitim_yili_id!=exam.egitim_yili_id or action.exam.exam_type!=exam.exam_type:
            continue
        out=next((o for o in outcomes_by_subject.get(snap.get('subject'),[]) if identity_key(o)==identity_key(snap)),None)
        points=[p for p in (out['series'] if out else []) if p['exam_id']!=action.exam_id and p.get('exam_date') and snap.get('exam_date') and p['exam_date']>snap['exam_date']]
        completed=bool(action.assignment_id and action.assignment.status=='COMPLETED')
        if completed and action.assignment.completed_date:
            completion_day=action.assignment.completed_date.date().isoformat()
            points=[p for p in points if p['exam_date']>completion_day]
        newest=points[-1] if points else None
        followups.append({'id':action.id,'name':snap.get('name'),'subject':snap.get('subject'),
            'assignment_id':action.assignment_id,'status':'Tekrar ölçüldü' if completed and newest else 'Ödev tamamlandı · tekrar ölçüm bekleniyor' if completed else 'Ödev devam ediyor' if action.assignment_id else 'Plana alındı · ödev henüz yok',
            'before':f"{snap.get('correct',0)}/{snap.get('question_count',0)} doğru",
            'after':f"{newest['correct']}/{newest['question_count']} doğru" if newest else None})
    return {'followups':followups,'items':agenda,'source_exam_id':exam.id,'source_answer_id':latest.id,'mapped_questions':measured,'total_questions':exam.total_questions,'empty_reason':'no_priority_needed' if not agenda else None}
