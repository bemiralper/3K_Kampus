"""
Öğrenci Portalı — Kapsamlı Uçtan Uca Fonksiyon, İzolasyon ve Güvenlik Testleri:
1. Yaşayan Ana Ekran (`/api/student/home/`), Takvim (`/schedule/`), Dersler (`/courses/`), Kampüs (`/campus/`)
2. Aktif Çalışma Programı, Pomodoro `actual_duration` biriktirme, `EKSIKSIZ_GUN` rozeti ve `DailyFeedback`
3. Sınav Biniş Kartı (Boarding Pass), yayınlanmış/yayınlanmamış sınav görünürlüğü ve çapraz öğrenci izolasyonu
4. Öğrenci <-> Koç çift yönlü portal mesajlaşması ve koç kapsam kontrolü
5. `STUDENT_PORTAL_ENABLED=False` acil geri dönüş (rollback) bayrağı
"""
from datetime import date, timedelta

from django.contrib.auth.models import User
from django.test import Client, TestCase, override_settings
from django.utils import timezone

from apps.coaching.assignment_manual.models import ManualAssignment
from apps.coaching.models import CoachProfile, CoachStudentAssignment
from apps.coaching.olcme_degerlendirme.models import (
    Exam,
    ExamParticipant,
    ExamRoom,
    ExamSection,
    ExamSession,
    StudentAnswer,
    StudentSectionScore,
)
from apps.coaching.study_program.models import (
    Badge,
    BadgeCode,
    DailyFeedback,
    ProgramBlock,
    ProgramDay,
    WeeklyProgram,
)
from apps.egitim_tanimlari.models import Alan
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit
from apps.personel.domain.models import Personel
from apps.student_portal.auth import create_portal_account_for_student
from apps.sube.domain.models import Sube
from apps.website.models import Duyuru


class StudentPortalEndToEndAndIsolationTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='3K Merkez Kampüs', kod='3K-MERKEZ')
        self.sube_a = Sube.objects.create(kurum=self.kurum, ad='Kadıköy Şube', kod='KDK')
        self.sube_b = Sube.objects.create(kurum=self.kurum, ad='Beşiktaş Şube', kod='BSK')
        self.yil = EgitimYili.objects.create(
            baslangic_yil=2026,
            bitis_yil=2027,
            aktif_mi=True,
        )

        # Öğrenci A (Kadıköy)
        self.student_a = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            ad='Zeynep',
            soyad='Kaya',
            tc_kimlik_no='23456789012',
            aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=self.student_a,
            egitim_yili=self.yil,
            kurum=self.kurum,
            sube=self.sube_a,
            okul_no='2026101',
            aktif_mi=True,
        )
        _, _pw_a = create_portal_account_for_student(self.student_a)
        self.user_a = self.student_a.portal_account.user
        self.user_a.set_password('GuvenliSifre2026!')
        self.user_a.save()
        ur_a = self.user_a.user_role
        ur_a.must_change_password = False
        ur_a.save(update_fields=['must_change_password'])

        # Öğrenci B (Beşiktaş — başka şube ve başka öğrenci)
        self.student_b = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube_b,
            ad='Kerem',
            soyad='Demir',
            tc_kimlik_no='34567890123',
            aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=self.student_b,
            egitim_yili=self.yil,
            kurum=self.kurum,
            sube=self.sube_b,
            okul_no='2026202',
            aktif_mi=True,
        )
        _, _pw_b = create_portal_account_for_student(self.student_b)
        self.user_b = self.student_b.portal_account.user
        self.user_b.set_password('GuvenliSifre2026!')
        self.user_b.save()
        ur_b = self.user_b.user_role
        ur_b.must_change_password = False
        ur_b.save(update_fields=['must_change_password'])

        # Öğrenci A'nın Birincil Koçu
        self.coach_user = User.objects.create_user(
            username='koc_ahmet', password='KocPassword2026!', first_name='Ahmet', last_name='Hoca',
        )
        self.coach_personel = Personel.objects.create(
            user=self.coach_user,
            kurum=self.kurum,
            sube=self.sube_a,
            ad='Ahmet',
            soyad='Hoca',
            aktif_mi=True,
        )
        self.coach_profile = CoachProfile.objects.create(
            teacher=self.coach_personel,
            is_active=True,
        )
        CoachStudentAssignment.objects.create(
            coach=self.coach_profile,
            student=self.student_a,
            start_date=date.today() - timedelta(days=30),
            is_primary=True,
        )

    def _logged_in_client(self, user: User) -> Client:
        c = Client()
        c.force_login(user)
        return c

    def test_living_home_boarding_pass_and_announcements(self):
        Duyuru.objects.create(
            kurum=self.kurum,
            baslik='Deneme Sınavı Saat Değişikliği',
            ozet='Cumartesi TYT provası 09:30 da başlayacaktır.',
            yayin_tarihi=date.today(),
            aktif=True,
        )
        upcoming_exam = Exam.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            egitim_yili=self.yil,
            name='Türkiye Geneli TYT-4',
            exam_type='YKS_TYT',
            exam_date=date.today() + timedelta(days=2),
            status='DRAFT',
            is_active=True,
        )
        room = ExamRoom.objects.create(
            exam=upcoming_exam, name='A-204 Amfi', capacity=30,
        )
        ExamParticipant.objects.create(
            exam=upcoming_exam,
            student=self.student_a,
            room=room,
            seat_no=14,
            desk_no='B-14',
        )

        client = self._logged_in_client(self.user_a)
        res = client.get('/api/student/home/')
        self.assertEqual(res.status_code, 200)
        payload = res.json()['data']
        self.assertIsNotNone(payload['boarding_pass'])
        self.assertEqual(payload['boarding_pass']['room_name'], 'A-204 Amfi')
        self.assertEqual(payload['boarding_pass']['seat_no'], 14)
        self.assertEqual(payload['counters']['unread_announcements'], 1)

        # Duyuru okundu işaretleme
        read_res = client.post(
            '/api/student/announcements/read/',
            data='{}',
            content_type='application/json',
        )
        self.assertEqual(read_res.status_code, 200)
        self.assertEqual(read_res.json()['data']['unread_count'], 0)

    def test_study_block_focus_duration_badges_and_cross_student_isolation(self):
        today = timezone.localdate()
        monday = today - timedelta(days=today.weekday())
        prog_a = WeeklyProgram.objects.create(
            student=self.student_a,
            coach=self.coach_user,
            week_start=monday,
            week_end=monday + timedelta(days=6),
        )
        day_a = ProgramDay.objects.create(
            program=prog_a,
            weekday=today.weekday(),
            day_date=today,
        )
        blk_a = ProgramBlock.objects.create(
            day=day_a,
            order=1,
            block_type='SORU_COZUMU',
            title='Matematik',
            topic_name='Problemler',
            question_count=40,
            estimated_duration_minutes=45,
        )

        # Öğrenci B kendi oturumuyla Öğrenci A'nın çalışma bloğunu ASLA tamamlayamaz!
        client_b = self._logged_in_client(self.user_b)
        forbidden = client_b.post(
            f'/api/student/study-program/blocks/{blk_a.id}/complete/',
            data='{"is_completed": true, "focus_minutes_added": 30}',
            content_type='application/json',
        )
        self.assertEqual(forbidden.status_code, 404)
        blk_a.refresh_from_db()
        self.assertFalse(blk_a.is_completed)

        # Öğrenci A odak sayacıyla tamamlar -> actual_duration ve EKSIKSIZ_GUN rozeti oluşur
        client_a = self._logged_in_client(self.user_a)
        ok_res = client_a.post(
            f'/api/student/study-program/blocks/{blk_a.id}/complete/',
            data='{"is_completed": true, "focus_minutes_added": 35}',
            content_type='application/json',
        )
        self.assertEqual(ok_res.status_code, 200)
        blk_a.refresh_from_db()
        self.assertTrue(blk_a.is_completed)
        self.assertEqual(blk_a.actual_duration, 35)
        self.assertTrue(
            Badge.objects.filter(
                student=self.student_a, code=BadgeCode.EKSIKSIZ_GUN,
            ).exists()
        )

        # Gün sonu 30 saniye check-in -> DailyFeedback tablosuna düşer
        fb_res = client_a.post(
            f'/api/student/study-program/days/{day_a.id}/feedback/',
            data='{"difficulty": "ZOR", "time_sufficient": false, "unclear_topic": "Hız Problemleri"}',
            content_type='application/json',
        )
        self.assertEqual(fb_res.status_code, 200)
        fb = DailyFeedback.objects.get(day=day_a)
        self.assertTrue(fb.struggled)
        self.assertFalse(fb.time_enough)
        self.assertEqual(fb.unclear_topic, 'Hız Problemleri')

    def test_exam_visibility_and_cross_student_exam_isolation(self):
        # Yayınlanmış sınav (Öğrenci B'ye ait sonuç)
        exam_b = Exam.objects.create(
            kurum=self.kurum,
            sube=self.sube_b,
            egitim_yili=self.yil,
            name='Beşiktaş Özel TYT',
            exam_type='YKS_TYT',
            exam_date=date.today() - timedelta(days=3),
            status='COMPLETED',
            is_active=True,
        )
        sess_b = ExamSession.objects.create(exam=exam_b, status='COMPLETED')
        sec_b = ExamSection.objects.create(exam=exam_b, name='Matematik', question_count=40, order=1)
        ans_b = StudentAnswer.objects.create(
            session=sess_b,
            student=self.student_b,
            total_correct=32,
            total_wrong=4,
            total_empty=4,
            total_net=31.0,
            is_processed=True,
        )
        StudentSectionScore.objects.create(
            student_answer=ans_b,
            section=sec_b,
            correct=32,
            wrong=4,
            empty=4,
            net=31.0,
        )

        # Öğrenci A, Öğrenci B'nin sınav detayına veya Karne PDF'ine erişemez -> 404
        client_a = self._logged_in_client(self.user_a)
        self.assertEqual(client_a.get(f'/api/student/exams/{exam_b.id}/').status_code, 404)
        self.assertEqual(client_a.get(f'/api/student/exams/{exam_b.id}/karne-pdf/').status_code, 404)

        # Öğrenci B kendi sınavını görebilir
        client_b = self._logged_in_client(self.user_b)
        res_b = client_b.get('/api/student/exams/')
        self.assertEqual(res_b.status_code, 200)
        self.assertEqual(len(res_b.json()['data']['exams']), 1)

        # Henüz yayın tarihi gelmemiş sınav Öğrenci B'ye bile görünmez
        exam_b.result_publish_date = timezone.now() + timedelta(days=2)
        exam_b.save(update_fields=['result_publish_date'])
        res_hidden = client_b.get('/api/student/exams/')
        self.assertEqual(len(res_hidden.json()['data']['exams']), 0)
        self.assertEqual(client_b.get(f'/api/student/exams/{exam_b.id}/').status_code, 403)

    def test_two_way_student_coach_portal_messaging(self):
        client_a = self._logged_in_client(self.user_a)
        send_res = client_a.post(
            '/api/student/messages/',
            data='{"body": "Hocam türev fasikülünü bitirdim!"}',
            content_type='application/json',
        )
        self.assertEqual(send_res.status_code, 201)

        # Koç kendi oturumuyla mesajı okur ve yanıtlar
        coach_client = self._logged_in_client(self.coach_user)
        thread_res = coach_client.get(
            f'/api/student/coach-threads/{self.student_a.id}/',
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(thread_res.status_code, 200)
        self.assertEqual(len(thread_res.json()['data']['messages']), 1)

        reply_res = coach_client.post(
            f'/api/student/coach-threads/{self.student_a.id}/',
            data='{"body": "Harikasın Zeynep, yarın deneme analizi yapalım."}',
            content_type='application/json',
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(reply_res.status_code, 201)

        # Koç atanmamış başka şube öğrencisine (student_b) erişemez -> 403
        blocked_coach = coach_client.get(
            f'/api/student/coach-threads/{self.student_b.id}/',
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertIn(blocked_coach.status_code, (403, 404))

        # Öğrenci A koçun yanıtını görür
        inbox_a = client_a.get('/api/student/messages/')
        self.assertEqual(inbox_a.status_code, 200)
        self.assertEqual(len(inbox_a.json()['data']['messages']), 2)

    @override_settings(STUDENT_PORTAL_ENABLED=False)
    def test_feature_flag_instant_rollback(self):
        client_a = self._logged_in_client(self.user_a)
        res = client_a.get('/api/student/home/')
        self.assertEqual(res.status_code, 404)

    def test_custom_focus_presets_and_branding_fallback(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        tiny_png = (
            b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
            b'\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01'
            b'\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
        )
        # 1. Yalnızca kurum logosu varken -> kurum logosuna düşer
        self.kurum.app_logo = SimpleUploadedFile('kurum.png', tiny_png, content_type='image/png')
        self.kurum.save()

        client_a = self._logged_in_client(self.user_a)
        me_kurum = client_a.get('/api/student/me/').json()['data']
        self.assertEqual(me_kurum['institution']['branding']['logo_source'], 'kurum')
        self.assertIn('kurum_branding', me_kurum['institution']['branding']['app_logo_url'])

        # 2. Şube logosu yüklendiğinde -> kesinlikle şube logosu öncelik alır
        self.sube_a.app_logo = SimpleUploadedFile('sube.png', tiny_png, content_type='image/png')
        self.sube_a.save()

        me_sube = client_a.get('/api/student/me/').json()['data']
        self.assertEqual(me_sube['institution']['branding']['logo_source'], 'sube')
        self.assertIn('sube_branding', me_sube['institution']['branding']['app_logo_url'])

        # 3. Öğrenci kendi odak sürelerini (focus_presets) oluşturabilir ve varsayılan seçebilir
        pref_res = client_a.patch(
            '/api/student/preferences/',
            data='{"focus_presets": [30, 60, 40], "focus_minutes": 40}',
            content_type='application/json',
        )
        self.assertEqual(pref_res.status_code, 200)
        prefs = pref_res.json()['data']
        self.assertEqual(prefs['focus_presets'], [30, 40, 60])
        self.assertEqual(prefs['focus_minutes'], 40)

    def test_coach_homework_tree_isolation_and_control_lock_invariants(self):
        from apps.coaching.assignment_manual.lock_utils import is_assignment_control_locked
        from apps.coaching.assignment_manual.models import (
            AssignmentLesson,
            AssignmentTask,
            ManualAssignment,
        )
        from apps.coaching.assignment_manual.serializers import ManualAssignmentDetailSerializer
        from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
        from apps.resources.models import BookType, ResourceBook, ResourceContent, ResourceTopic, ResourceUnit

        ders = Ders.objects.create(kurum=self.kurum, sube=self.sube_a, ad='Matematik', kod='MAT-HW')
        seviye = SinifSeviyesi.objects.create(kurum=self.kurum, sube=self.sube_a, ad='12. Sınıf', sira=12)
        btype = BookType.objects.create(kod='SORU-BANKASI', ad='Soru Bankası')
        book = ResourceBook.objects.create(
            ad='3D AYT Matematik Soru Bankası',
            kod='3D-AYT-MAT',
            kurum=self.kurum,
            sube=self.sube_a,
            book_type=btype,
            ders=ders,
            sinif_seviyesi=seviye,
        )
        unit = ResourceUnit.objects.create(book=book, ad='Türev', kod='U-TRV', sira=1)
        topic = ResourceTopic.objects.create(unit=unit, ad='Türev Alma Kuralları', kod='T-TRV1', sira=1)
        content = ResourceContent.objects.create(
            topic=topic,
            ad='Test 1 — Türev Kuralları',
            content_type='TEST_SET',
            question_count=16,
            page_start=44,
            page_end=47,
        )

        due_dt = timezone.now() + timedelta(days=2)
        hw = ManualAssignment.objects.create(
            coach=self.coach_user,
            student=self.student_a,
            title='Haftalık Türev Ödevi',
            description='Önce konu özetini gözden geçir.',
            status=ManualAssignment.Status.ASSIGNED,
            due_date=due_dt,
            coach_notes='SADECE_KOC_GOREBILIR_GIZLI_NOT',
        )
        lesson_blk = AssignmentLesson.objects.create(
            assignment=hw,
            lesson=ders,
            resource_book=book,
            topic_name='Türev Alma Kuralları',
            k3_mode=AssignmentLesson.K3Mode.HIZLAN,
            k3_target_minutes=20,
            order=1,
        )
        task_1 = AssignmentTask.objects.create(
            lesson_block=lesson_blk,
            content=content,
            task_type=AssignmentTask.TaskType.SOLVE_TEST,
            title='Test 1',
            question_count=16,
            page_count=4,
            order=1,
        )

        # 1. Çapraz öğrenci izolasyonu: Öğrenci B hiçbir uca erişemez (404)
        client_b = self._logged_in_client(self.user_b)
        self.assertEqual(client_b.get(f'/api/student/assignments/{hw.id}/').status_code, 404)
        self.assertEqual(
            client_b.patch(
                f'/api/student/assignments/tasks/{task_1.id}/',
                data='{"prepared": true}',
                content_type='application/json',
            ).status_code,
            404,
        )
        self.assertEqual(
            client_b.patch(
                f'/api/student/assignments/{hw.id}/note/',
                data='{"student_notes": "Sızma denemesi"}',
                content_type='application/json',
            ).status_code,
            404,
        )
        self.assertEqual(client_b.get(f'/api/student/assignments/{hw.id}/pdf/').status_code, 404)

        # 2. Öğrenci A zengin ağacı görür, ancak `coach_notes` ASLA sızmaz
        client_a = self._logged_in_client(self.user_a)
        detail_res = client_a.get(f'/api/student/assignments/{hw.id}/')
        self.assertEqual(detail_res.status_code, 200)
        raw_text = detail_res.content.decode('utf-8')
        self.assertNotIn('SADECE_KOC_GOREBILIR_GIZLI_NOT', raw_text)

        detail_data = detail_res.json()['data']
        self.assertEqual(len(detail_data['lessons']), 1)
        self.assertEqual(detail_data['lessons'][0]['k3_mode'], 'HIZLAN')
        self.assertEqual(detail_data['lessons'][0]['tasks'][0]['target_minutes'], 20)
        self.assertEqual(detail_data['lessons'][0]['tasks'][0]['page_start'], 44)
        self.assertEqual(detail_data['lessons'][0]['tasks'][0]['title'], 'Test 1 — Türev Kuralları')

        # 3. Öğrenci A testi "Çözdüm" işaretler, 22 dk odak süresi ve not ekler ->
        #    Koçun resmi `completion_status` ve `lock_utils` kilidi KESİNLİKLE değişmez!
        patch_task = client_a.patch(
            f'/api/student/assignments/tasks/{task_1.id}/',
            data='{"prepared": true, "focus_minutes_added": 22, "student_feedback": "3 sorum boş kaldı hocam"}',
            content_type='application/json',
        )
        self.assertEqual(patch_task.status_code, 200)

        patch_note = client_a.patch(
            f'/api/student/assignments/{hw.id}/note/',
            data='{"student_notes": "Kitabı yarın yanımda getireceğim."}',
            content_type='application/json',
        )
        self.assertEqual(patch_note.status_code, 200)

        task_1.refresh_from_db()
        hw.refresh_from_db()
        self.assertEqual(task_1.completion_status, AssignmentTask.CompletionStatus.PENDING)
        self.assertEqual(task_1.status, AssignmentTask.TaskStatus.NOT_STARTED)
        self.assertEqual(hw.status, ManualAssignment.Status.ASSIGNED)
        self.assertFalse(is_assignment_control_locked(hw))
        self.assertEqual(task_1.actual_duration_minutes, 22)
        self.assertEqual(task_1.student_feedback, '3 sorum boş kaldı hocam')
        self.assertEqual(hw.student_notes, 'Kitabı yarın yanımda getireceğim.')

        # 4. Koç Ödev Kontrol serializer'ı öğrenci hazırlığını salt-okunur olarak görür
        coach_serialized = ManualAssignmentDetailSerializer(hw).data
        self.assertEqual(coach_serialized['student_notes'], 'Kitabı yarın yanımda getireceğim.')
        self.assertTrue(coach_serialized['lessons'][0]['tasks'][0]['student_prepared'])
        self.assertEqual(coach_serialized['lessons'][0]['tasks'][0]['actual_duration_minutes'], 22)

    def test_achievements_catalog_xp_pinning_and_sube_masked_leaderboard(self):
        today = timezone.localdate()
        monday = today - timedelta(days=today.weekday())

        # Aynı şubede (Kadıköy - sube_a) rakip öğrenci: Ayşe Yılmaz (90 dk odak)
        peer_same_sube = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            ad='Ayşe',
            soyad='Yılmaz',
            tc_kimlik_no='45678901234',
            aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=peer_same_sube,
            egitim_yili=self.yil,
            kurum=self.kurum,
            sube=self.sube_a,
            okul_no='2026109',
            aktif_mi=True,
        )
        _, _ = create_portal_account_for_student(peer_same_sube)

        prog_peer = WeeklyProgram.objects.create(
            student=peer_same_sube,
            coach=self.coach_user,
            week_start=monday,
            week_end=monday + timedelta(days=6),
        )
        day_peer = ProgramDay.objects.create(
            program=prog_peer, weekday=today.weekday(), day_date=today,
        )
        ProgramBlock.objects.create(
            day=day_peer,
            order=1,
            block_type='SORU_COZUMU',
            title='Fizik',
            is_completed=True,
            actual_duration=90,
        )

        # Başka şubede (Beşiktaş - sube_b) öğrenci B: 300 dk odak (Kadıköy ligine ASLA girmemeli!)
        prog_b = WeeklyProgram.objects.create(
            student=self.student_b,
            week_start=monday,
            week_end=monday + timedelta(days=6),
        )
        day_b = ProgramDay.objects.create(
            program=prog_b, weekday=today.weekday(), day_date=today,
        )
        ProgramBlock.objects.create(
            day=day_b,
            order=1,
            block_type='SORU_COZUMU',
            title='Kimya',
            is_completed=True,
            actual_duration=300,
        )

        # Öğrenci A (Zeynep Kaya - Kadıköy): 50 dk odak + eksiksiz gün
        prog_a = WeeklyProgram.objects.create(
            student=self.student_a,
            coach=self.coach_user,
            week_start=monday,
            week_end=monday + timedelta(days=6),
        )
        day_a = ProgramDay.objects.create(
            program=prog_a, weekday=today.weekday(), day_date=today,
        )
        blk_a = ProgramBlock.objects.create(
            day=day_a,
            order=1,
            block_type='SORU_COZUMU',
            title='Matematik',
            question_count=30,
        )

        client_a = self._logged_in_client(self.user_a)
        complete_res = client_a.post(
            f'/api/student/study-program/blocks/{blk_a.id}/complete/',
            data='{"is_completed": true, "focus_minutes_added": 50}',
            content_type='application/json',
        )
        self.assertEqual(complete_res.status_code, 200)

        ach_res = client_a.get('/api/student/achievements/')
        self.assertEqual(ach_res.status_code, 200)
        ach = ach_res.json()['data']

        # 1. Seviye / XP ve kilitli hedef ilerlemesi
        self.assertGreaterEqual(ach['level']['total_xp'], 150)
        self.assertIsNotNone(ach['closest_target'])
        derin_odak = next(b for b in ach['badges'] if b['code'] == 'DERIN_ODAK_120')
        self.assertFalse(derin_odak['is_unlocked'])
        self.assertEqual(derin_odak['current_value'], 50)
        self.assertEqual(derin_odak['remaining_value'], 70)

        # 2. Kilitli rozet iğnelenemez (400), açılmış rozet iğnelenebilir (200)
        locked_pin = client_a.patch(
            '/api/student/achievements/preferences/',
            data='{"pinned_badge_code": "SERI_14"}',
            content_type='application/json',
        )
        self.assertEqual(locked_pin.status_code, 400)

        ok_pin = client_a.patch(
            '/api/student/achievements/preferences/',
            data='{"pinned_badge_code": "EKSIKSIZ_GUN"}',
            content_type='application/json',
        )
        self.assertEqual(ok_pin.status_code, 200)
        self.assertEqual(ok_pin.json()['data']['pinned_badge']['code'], 'EKSIKSIZ_GUN')

        # 3. Şube Haftalık Odak Ligi: KVKK maskeleme + şube izolasyonu
        lb = ach['leaderboard']
        self.assertEqual(lb['my_rank'], 2)
        self.assertEqual(lb['my_weekly_focus_minutes'], 50)
        self.assertEqual(lb['minutes_to_overtake_next'], 41)
        names = [e['display_name'] for e in lb['entries']]
        self.assertIn('A*** Y.', names)
        self.assertNotIn('Ayşe Yılmaz', names)
        # Beşiktaş şubesindeki Kerem (300 dk) Kadıköy liginde yer almaz
        self.assertEqual(len(lb['entries']), 2)

        # 4. Koç Student360 başarı önizleme ucu yetki kontrolü
        coach_client = self._logged_in_client(self.coach_user)
        coach_ok = coach_client.get(
            f'/api/student/coach-achievements/{self.student_a.id}/',
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(coach_ok.status_code, 200)
        self.assertTrue(coach_ok.json()['data']['has_data'])

        coach_blocked = coach_client.get(
            f'/api/student/coach-achievements/{self.student_b.id}/',
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertIn(coach_blocked.status_code, (403, 404))

    def test_sayisal_vs_esit_agirlik_track_badges_and_ayt_triathlon(self):
        alan_say = Alan.objects.create(
            kurum=self.kurum, sube=self.sube_a, ad='Sayısal', kod='SAY',
        )
        alan_ea = Alan.objects.create(
            kurum=self.kurum, sube=self.sube_a, ad='Eşit Ağırlık', kod='EA',
        )

        # 1. Öğrenci A -> SAYISAL kulvarı
        kayit_a = OgrenciKayit.objects.get(ogrenci=self.student_a, egitim_yili=self.yil)
        kayit_a.alan = alan_say
        kayit_a.save(update_fields=['alan'])

        # 2. Aynı şubede Eşit Ağırlık öğrencisi oluştur
        ea_student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            ad='Emre',
            soyad='Arslan',
            tc_kimlik_no='67890123456',
            aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=ea_student,
            egitim_yili=self.yil,
            kurum=self.kurum,
            sube=self.sube_a,
            alan=alan_ea,
            okul_no='2026155',
            aktif_mi=True,
        )
        _, _ = create_portal_account_for_student(ea_student)
        ea_user = ea_student.portal_account.user
        ea_user.set_password('GuvenliSifre2026!')
        ea_user.save()
        ea_ur = ea_user.user_role
        ea_ur.must_change_password = False
        ea_ur.save(update_fields=['must_change_password'])

        today = timezone.localtime(timezone.now()).date()
        ayt_exam = Exam.objects.create(
            name='Türkiye Geneli AYT-1',
            exam_type='YKS_AYT',
            status='COMPLETED',
            kurum=self.kurum,
            sube=self.sube_a,
            egitim_yili=self.yil,
            exam_date=today,
            is_active=True,
        )
        sec_mat = ExamSection.objects.create(exam=ayt_exam, name='Matematik', order=1, question_count=40)
        sec_fiz = ExamSection.objects.create(exam=ayt_exam, name='Fizik', order=2, question_count=14)
        sec_kim = ExamSection.objects.create(exam=ayt_exam, name='Kimya', order=3, question_count=13)
        sec_bio = ExamSection.objects.create(exam=ayt_exam, name='Biyoloji', order=4, question_count=13)
        sec_edb = ExamSection.objects.create(exam=ayt_exam, name='Edebiyat', order=5, question_count=24)
        sec_tr1 = ExamSection.objects.create(exam=ayt_exam, name='Tarih-1', order=6, question_count=10)
        sec_cg1 = ExamSection.objects.create(exam=ayt_exam, name='Coğrafya-1', order=7, question_count=6)

        ayt_session = ExamSession.objects.create(exam=ayt_exam, status='COMPLETED')

        # SAYISAL öğrenci: Mat 34, Fizik 12.5, Kimya 11.5, Biyoloji 11.25 -> SAY Toplam 69.25 net
        ans_say = StudentAnswer.objects.create(
            session=ayt_session,
            student=self.student_a,
            total_correct=70,
            total_wrong=3,
            total_empty=7,
            total_net=69.25,
            is_processed=True,
        )
        StudentSectionScore.objects.bulk_create([
            StudentSectionScore(student_answer=ans_say, section=sec_mat, correct=34, wrong=0, empty=6, net=34.0),
            StudentSectionScore(student_answer=ans_say, section=sec_fiz, correct=13, wrong=2, empty=0, net=12.5),
            StudentSectionScore(student_answer=ans_say, section=sec_kim, correct=12, wrong=2, empty=0, net=11.5),
            StudentSectionScore(student_answer=ans_say, section=sec_bio, correct=11, wrong=0, empty=2, net=11.25),
        ])

        # EA öğrenci: Mat 32, Edebiyat 22, Tarih-1 8, Coğrafya-1 5.5 -> Ed-Sos1 35.5, EA Toplam 67.5 net
        ans_ea = StudentAnswer.objects.create(
            session=ayt_session,
            student=ea_student,
            total_correct=68,
            total_wrong=2,
            total_empty=10,
            total_net=67.5,
            is_processed=True,
        )
        StudentSectionScore.objects.bulk_create([
            StudentSectionScore(student_answer=ans_ea, section=sec_mat, correct=32, wrong=0, empty=8, net=32.0),
            StudentSectionScore(student_answer=ans_ea, section=sec_edb, correct=22, wrong=0, empty=2, net=22.0),
            StudentSectionScore(student_answer=ans_ea, section=sec_tr1, correct=8, wrong=0, empty=2, net=8.0),
            StudentSectionScore(student_answer=ans_ea, section=sec_cg1, correct=6, wrong=2, empty=0, net=5.5),
        ])

        # SAY doğrulaması
        say_data = self._logged_in_client(self.user_a).get('/api/student/achievements/').json()['data']
        self.assertEqual(say_data['student_track']['code'], 'SAYISAL')
        say_map = {b['code']: b for b in say_data['badges']}
        self.assertTrue(say_map['AYT_SAY_62']['is_unlocked'])
        self.assertFalse(say_map['AYT_SAY_70']['is_unlocked'])
        self.assertTrue(say_map['AYT_SAY_70']['is_active_tier'])
        self.assertFalse(say_map['AYT_SAY_76']['is_active_tier'])
        self.assertTrue(say_map['AYT_FIZIK_12']['is_unlocked'])
        self.assertTrue(say_map['AYT_KIMYA_11']['is_unlocked'])
        self.assertTrue(say_map['AYT_BIYOLOJI_11']['is_unlocked'])
        self.assertTrue(say_map['FEN_TRIATLONU']['is_unlocked'])
        self.assertTrue(say_map['KESKIN_NISANCI_92']['is_unlocked'])
        # EA/SÖZ rozetleri SAY öğrencisine kesinlikle görünmez
        self.assertNotIn('AYT_EDEBIYAT_21', say_map)
        self.assertNotIn('TM_DENGE_USTASI', say_map)
        self.assertNotIn('SOZEL_TAM_SAHA', say_map)

        # EA doğrulaması
        ea_data = self._logged_in_client(ea_user).get('/api/student/achievements/').json()['data']
        self.assertEqual(ea_data['student_track']['code'], 'ESIT_AGIRLIK')
        ea_map = {b['code']: b for b in ea_data['badges']}
        self.assertTrue(ea_map['AYT_EA_62']['is_unlocked'])
        self.assertTrue(ea_map['AYT_EDEBIYAT_21']['is_unlocked'])
        self.assertTrue(ea_map['AYT_TAR1_COG1_13']['is_unlocked'])
        self.assertTrue(ea_map['TM_DENGE_USTASI']['is_unlocked'])
        # SAY fen rozetleri EA öğrencisine kesinlikle görünmez
        self.assertNotIn('AYT_FIZIK_12', ea_map)
        self.assertNotIn('FEN_TRIATLONU', ea_map)

    def test_tiered_marathon_chains_and_monthly_season_medal(self):
        today = timezone.localtime(timezone.now()).date()
        monday = today - timedelta(days=today.weekday())

        prog = WeeklyProgram.objects.create(
            student=self.student_a,
            coach=self.coach_user,
            week_start=monday,
            week_end=monday + timedelta(days=6),
        )
        day = ProgramDay.objects.create(program=prog, weekday=today.weekday(), day_date=today)
        # 1.900 dk odak + 2.600 soru -> Ayın Odak (1.800) ve Ayın Soru (2.500) görevleri biter
        ProgramBlock.objects.create(
            day=day,
            order=1,
            block_type='SORU_COZUMU',
            title='Maraton Kampı',
            question_count=2600,
            actual_duration=1900,
            is_completed=True,
        )

        # Koç ödevi (`completed_date` ve `due_date` DateTimeField olarak doğrulanır)
        now_dt = timezone.now()
        ManualAssignment.objects.create(
            student=self.student_a,
            coach=self.coach_user,
            title='Kasım Kamp Ödevi',
            status=ManualAssignment.Status.COMPLETED,
            assigned_date=now_dt - timedelta(days=3),
            due_date=now_dt + timedelta(days=1),
            completed_date=now_dt,
            completion_percent=95,
            is_active=True,
        )

        # Bu ay 2 deneme -> 3. aylık görev (Ayın Deneme Hamlesi) biter -> Sezon Madalyası açılır!
        for idx in (1, 2):
            ex = Exam.objects.create(
                name=f'Sezon TYT-{idx}',
                exam_type='YKS_TYT',
                status='COMPLETED',
                kurum=self.kurum,
                sube=self.sube_a,
                egitim_yili=self.yil,
                exam_date=today,
                is_active=True,
            )
            sess = ExamSession.objects.create(exam=ex, status='COMPLETED')
            StudentAnswer.objects.create(
                session=sess,
                student=self.student_a,
                total_correct=80,
                total_wrong=8,
                total_empty=32,
                total_net=78.0,
                is_processed=True,
            )

        res = self._logged_in_client(self.user_a).get('/api/student/achievements/')
        self.assertEqual(res.status_code, 200)
        data = res.json()['data']
        self.assertEqual(data['level']['max_level'], 50)
        self.assertGreaterEqual(len(data['badges']), 55)

        badge_map = {b['code']: b for b in data['badges']}
        # Odak zincirinde 500 ve 1.500 açılmış, 3.000 sıradaki aktif kademe, 6.000..30.000 maraton kademesi
        self.assertTrue(badge_map['ODAK_500']['is_unlocked'])
        self.assertTrue(badge_map['ODAK_1500']['is_unlocked'])
        self.assertFalse(badge_map['ODAK_3000']['is_unlocked'])
        self.assertTrue(badge_map['ODAK_3000']['is_active_tier'])
        self.assertFalse(badge_map['ODAK_6000']['is_active_tier'])
        self.assertFalse(badge_map['ODAK_30000']['is_active_tier'])

        # Aylık Sezon Madalyası kazanılmış ve kalıcı olarak mühürlenmiş olmalı
        season = data['monthly_season']
        self.assertGreaterEqual(season['completed_quests_count'], 3)
        self.assertTrue(season['season_medal_unlocked'])
        self.assertEqual(len(season['earned_medals']), 1)
        self.student_a.portal_account.refresh_from_db()
        self.assertIn(
            season['month_key'],
            self.student_a.portal_account.preferences.get('monthly_season_medals', {}),
        )



