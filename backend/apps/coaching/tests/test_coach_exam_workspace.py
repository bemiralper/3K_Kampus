"""Koç sınav çalışma merkezi: erişim, son kayıt, karar ve ödev bağı."""
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.exceptions import ValidationError
from apps.coaching.tests import test_olcme_development_analysis as fixture_module
from apps.coaching.olcme_degerlendirme.models import ExamSession, StudentAnswer, StudentSectionScore, ExamStudyAction
from apps.coaching.olcme_degerlendirme.services.stored_scores import refresh_exam_scores
from apps.coaching.olcme_degerlendirme.views.analysis_views import build_student_detail_payload
from apps.coaching.assignment_manual.serializers import ManualAssignmentCreateSerializer
from apps.coaching.assignment_manual.models import ManualAssignment
from apps.egitim_yili.domain.models import EgitimYili
from apps.ogrenci.domain.models import Ogrenci


class CoachExamWorkspaceTests(TestCase):
    def setUp(self):
        fixture_module.DevelopmentAnalysisScenariosTest.setUp(self)
        self.year=EgitimYili.objects.create(baslangic_yil=2026,bitis_yil=2027,aktif_mi=True)
        self.user=get_user_model().objects.create_user(username='exam-coach-admin',is_superuser=True)
        self.client=APIClient();self.client.force_authenticate(self.user)
        self.headers={'HTTP_X_KURUM_ID':str(self.kurum.id),'HTTP_X_SUBE_ID':str(self.sube.id),'HTTP_X_EGITIMYILI_ID':str(self.year.id)}
        self.exam,self.answer,self.section=self.make_exam()

    def make_exam(self,name='TYT',day=date(2026,11,1),**kwargs):
        result=fixture_module.DevelopmentAnalysisScenariosTest._exam(self,name,day,**kwargs)
        result[0].egitim_yili=self.year;result[0].save()
        return result

    def url(self,suffix=''):
        return f'/api/coaching/olcme-degerlendirme/student-exams/{self.ogrenci.id}/{suffix}'

    def dev(self,**params):
        return self.client.get(self.url('development/'),{'exam_type':'TYT','window':'all',**params},**self.headers)

    def decision(self,status='planned'):
        data=self.dev().json();row=data['agenda']['items'][0]
        response=self.client.post(self.url('study-action/'),{'key':row['key'],'revision':row['revision'],'status':status,'note':'Konu tekrarını birlikte planla.','filters':data['filters']},format='json',**self.headers)
        self.assertEqual(response.status_code,200,response.data)
        return response.data,row

    def test_empty_custom_selection_is_empty(self):
        self.assertEqual(self.dev(window='custom').json()['exam_count'],0)

    def test_invalid_reference_year_is_400(self):
        for value in ['bad','2030','0']:
            self.assertEqual(self.client.get(self.url(),{'ranking_year':value},**self.headers).status_code,400)

    def test_repeat_uploads_use_latest_in_both_views(self):
        session=ExamSession.objects.create(exam=self.exam,status='COMPLETED')
        latest=StudentAnswer.objects.create(session=session,student=self.ogrenci,total_net=Decimal('30'))
        StudentSectionScore.objects.create(student_answer=latest,section=self.section,net=Decimal('30'),correct=30,empty=10)
        rows=self.client.get(self.url(),**self.headers).json()['exams']
        self.assertEqual(len(rows),1);self.assertEqual(rows[0]['answer_id'],latest.id)
        self.assertEqual(self.dev().json()['exam_count'],1)

    def test_selected_school_year_is_enforced(self):
        old,_,_=self.make_exam('Old',date(2025,1,1))
        old.egitim_yili=EgitimYili.objects.create(baslangic_yil=2024,bitis_yil=2025);old.save()
        self.assertEqual(len(self.client.get(self.url(),**self.headers).json()['exams']),1)
        self.assertEqual(self.dev().json()['exam_count'],1)

    def test_tied_rank_matches_karne(self):
        other=Ogrenci.objects.create(kurum=self.kurum,sube=self.sube,ad='B',soyad='B')
        answer=StudentAnswer.objects.create(session=self.answer.session,student=other,raw_student_id='9999',total_net=Decimal('20'))
        StudentSectionScore.objects.create(student_answer=answer,section=self.section,net=Decimal('20'))
        refresh_exam_scores(self.exam)
        url=f'/api/coaching/olcme-degerlendirme/student-exams/{other.id}/'
        row=self.client.get(url,**self.headers).json()['exams'][0]
        detail=build_student_detail_payload(self.exam,answer,2026,include_trend=False)
        self.assertEqual(row['kurum_ici_sira'],detail['kurum_ici_sira']);self.assertEqual(row['kurum_ici_sira'],1)

    def test_local_staff_cannot_read_foreign_student(self):
        from apps.personel.domain.models import Personel
        from apps.kurum.domain.models import Kurum
        from apps.sube.domain.models import Sube
        user=get_user_model().objects.create_user(username='local-staff',is_staff=True)
        Personel.objects.create(kurum=self.kurum,sube=self.sube,user=user,ad='Local',soyad='Staff')
        foreign=Kurum.objects.create(ad='Foreign',kod='FOREIGN');branch=Sube.objects.create(kurum=foreign,ad='F',kod='FOREIGN-F')
        student=Ogrenci.objects.create(kurum=foreign,sube=branch,ad='Foreign',soyad='Student')
        self.client.force_authenticate(user)
        for suffix in ['', 'development/', 'study-action/']:
            response=self.client.get(f'/api/coaching/olcme-degerlendirme/student-exams/{student.id}/{suffix}',**self.headers)
            self.assertEqual(response.status_code,403)

    def test_get_does_not_create_decisions(self):
        data=self.dev().json()
        self.assertTrue(data['agenda']['items']);self.assertFalse(ExamStudyAction.objects.exists())
        self.assertEqual(data['agenda']['mapped_questions'],0)
        self.assertEqual(data['agenda']['items'][0]['kind'],'current')

    def test_review_is_persistent_and_idempotent(self):
        data,row=self.decision()
        again,_=self.decision()
        self.assertEqual(data['id'],again['id']);self.assertEqual(ExamStudyAction.objects.count(),1)
        live=self.dev().json()['agenda']['items'][0]
        self.assertEqual(live['status'],'planned');self.assertEqual(live['note'],'Konu tekrarını birlikte planla.')

    def test_changed_score_rejects_stale_decision(self):
        data=self.dev().json();row=data['agenda']['items'][0]
        score=self.answer.section_scores.get(section=self.section);score.wrong=1;score.empty=19;score.save()
        response=self.client.post(self.url('study-action/'),{'key':row['key'],'revision':row['revision'],'status':'planned','filters':data['filters']},format='json',**self.headers)
        self.assertEqual(response.status_code,409)

    def serializer(self,action_id,**extra):
        request=SimpleNamespace(user=self.user,headers={'X-Kurum-ID':str(self.kurum.id),'X-EgitimYili-ID':str(self.year.id)},session={},query_params={})
        return ManualAssignmentCreateSerializer(data={'student':self.ogrenci.id,'title':'Sınav çalışması','status':'DRAFT','due_date':timezone.now().isoformat(),'lessons':[],'exam_study_action':action_id,**extra},context={'request':request})

    def test_assignment_link_is_atomic_and_does_not_duplicate(self):
        action,_=self.decision()
        serializer=self.serializer(action['id']);self.assertTrue(serializer.is_valid(),serializer.errors)
        assignment=serializer.save()
        again=self.serializer(action['id']);self.assertTrue(again.is_valid(),again.errors)
        self.assertEqual(again.save().pk,assignment.pk)
        self.assertEqual(ManualAssignment.objects.filter(student=self.ogrenci).count(),1)
        self.assertEqual(ExamStudyAction.objects.get(pk=action['id']).assignment_id,assignment.pk)

    def test_stale_recommendation_cannot_create_assignment(self):
        action,_=self.decision()
        score=self.answer.section_scores.get();score.wrong=1;score.save()
        serializer=self.serializer(action['id']);self.assertTrue(serializer.is_valid(),serializer.errors)
        with self.assertRaises(ValidationError):serializer.save()
        self.assertFalse(ManualAssignment.objects.filter(student=self.ogrenci).exists())

    def test_completed_assignment_waits_for_measurement(self):
        action,_=self.decision();serializer=self.serializer(action['id']);self.assertTrue(serializer.is_valid(),serializer.errors)
        assignment=serializer.save();assignment.status='COMPLETED';assignment.save()
        self.assertEqual(self.dev().json()['agenda']['items'][0]['status'],'waiting_measurement')

    def test_decision_history_keeps_previous_note(self):
        first,_=self.decision('planned')
        self.decision('reviewed')
        action=ExamStudyAction.objects.get(pk=first['id'])
        self.assertEqual(len(action.events),2)
        self.assertEqual(action.events[-1]['note'],'Konu tekrarını birlikte planla.')

    def test_recurring_loss_has_real_measurement_evidence(self):
        for i in range(2):
            self.make_exam(f'Mapped {i}',date(2026,11,2+i),items=[(1,self.outcome_main,'wrong'),(2,self.outcome_main,'wrong'),(3,self.outcome_main,'correct')])
        items=self.dev().json()['agenda']['items']
        row=next(r for r in items if r['name']==self.outcome_main.text)
        self.assertEqual(row['kind'],'recurring');self.assertEqual(row['missed_exam_count'],2)
        self.assertEqual(row['question_count'],3);self.assertEqual(row['outcome_id'],self.outcome_main.id)
        self.assertEqual(len(row['evidence']),2)

    def test_new_upload_invalidates_old_assignment_source(self):
        action,_=self.decision()
        session=ExamSession.objects.create(exam=self.exam,status='COMPLETED')
        latest=StudentAnswer.objects.create(session=session,student=self.ogrenci,total_net=Decimal('30'))
        StudentSectionScore.objects.create(student_answer=latest,section=self.section,correct=30,empty=10,net=Decimal('30'))
        serializer=self.serializer(action['id']);self.assertTrue(serializer.is_valid(),serializer.errors)
        with self.assertRaises(ValidationError):serializer.save()
        self.assertFalse(ManualAssignment.objects.filter(student=self.ogrenci).exists())

    def test_other_student_cannot_use_action(self):
        action,_=self.decision()
        other=Ogrenci.objects.create(kurum=self.kurum,sube=self.sube,ad='Other',soyad='Student')
        serializer=self.serializer(action['id'],student=other.pk);self.assertTrue(serializer.is_valid(),serializer.errors)
        with self.assertRaises(ValidationError):serializer.save()
        self.assertFalse(ManualAssignment.objects.filter(student=other).exists())

    def test_partial_breakdown_keeps_parent_total(self):
        from apps.coaching.olcme_degerlendirme.models import ExamSection
        self.section.name='Fen Bilimleri';self.section.save()
        child=ExamSection.objects.create(exam=self.exam,name='Fizik',question_start=1,question_end=7,order=2,is_sub_section=True,parent_section=self.section)
        StudentSectionScore.objects.create(student_answer=self.answer,section=child,correct=3,wrong=2,empty=2,net=Decimal('2.5'))
        subjects=self.dev().json()['subjects']
        parent=next(s for s in subjects if s['name']=='Fen Bilimleri')
        self.assertTrue(parent['incomplete_breakdown'])
        self.assertIn('Fizik',[s['name'] for s in subjects])

    def test_action_detail_rejects_bad_id(self):
        response=self.client.get(self.url('study-action/'),{'action_id':'bad'},**self.headers)
        self.assertEqual(response.status_code,400)

    def test_imported_outcomes_without_ids_keep_distinct_actions(self):
        from apps.coaching.olcme_degerlendirme.models import AnswerKey, AnswerKeyItem
        key=AnswerKey.objects.create(exam=self.exam,booklet='A',is_primary=True)
        for number,name in [(1,'Paragrafta ana düşünce'),(2,'Sözcük anlamı')]:
            AnswerKeyItem.objects.create(answer_key=key,section=self.section,question_number=number,correct_answer='A',imported_outcome_text=name)
        self.answer.comparison={'1':{'result':'wrong'},'2':{'result':'wrong'}};self.answer.save()
        data=self.dev().json();rows=data['agenda']['items']
        keys=[r['key'] for r in rows]
        self.assertEqual(len(keys),len(set(keys)))
        mapped=[r for r in rows if r['name'] in ('Paragrafta ana düşünce','Sözcük anlamı')]
        self.assertEqual(len(mapped),2)
        for row in mapped:
            response=self.client.post(self.url('study-action/'),{'key':row['key'],'revision':row['revision'],'status':'planned','filters':data['filters']},format='json',**self.headers)
            self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(ExamStudyAction.objects.count(),2)

    def test_light_catalog_never_recalculates_scores(self):
        from unittest.mock import patch
        with patch('apps.coaching.olcme_degerlendirme.views.student_exam_views.blocks_for_answers',side_effect=AssertionError('Score path must not run')):
            response=self.client.get(self.url(),{'light':'1'},**self.headers)
        self.assertEqual(response.status_code,200)
        data=response.json()
        self.assertFalse(data['scores_loaded']);self.assertIsNone(data['exams'][0]['puan'])
        self.assertIsNone(data['kpi']);self.assertEqual(data['net_trend'],[])
        self.assertEqual(data['exams'][0]['total_net'],20)

    def test_light_and_full_ayt_field_net_agree(self):
        self.exam.exam_type='YKS_AYT';self.exam.save()
        self.section.name='Matematik';self.section.save()
        light=self.client.get(self.url(),{'light':'1'},**self.headers).json()['exams'][0]
        full=self.client.get(self.url(),{'ranking_year':'2026'},**self.headers).json()['exams'][0]
        self.assertEqual(light['total_net'],full['total_net']);self.assertEqual(full['total_net'],20)
        self.assertIsNone(light['puan']);self.assertIsNotNone(full['puan'])

    def test_ayt11_keeps_academic_subject_without_claiming_score_gain(self):
        from apps.coaching.olcme_degerlendirme.models import AnswerKey, AnswerKeyItem
        self.exam.exam_type='AYT_11';self.exam.save()
        self.section.name='Felsefe';self.section.save()
        key=AnswerKey.objects.create(exam=self.exam,booklet='A',is_primary=True)
        for number in range(1,4):
            AnswerKeyItem.objects.create(answer_key=key,section=self.section,question_number=number,correct_answer='A',imported_outcome_text='Felsefede bilgi')
        self.answer.comparison={str(n):{'result':'wrong'} for n in range(1,4)};self.answer.save()
        data=self.dev(exam_type='AYT_11').json()
        subject=next(s for s in data['subjects'] if s['name']=='Felsefe')
        self.assertFalse(subject['score_included'])
        row=next(r for r in data['agenda']['items'] if r['name']=='Felsefede bilgi')
        self.assertEqual(row['kind'],'academic');self.assertIsNone(row['gain'])
