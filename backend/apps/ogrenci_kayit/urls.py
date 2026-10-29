from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .interfaces.gunu_birlik_views import (
    GunuBirlikExcelView,
    GunuBirlikGirisBelgesiView,
    GunuBirlikGirisBelgesiWhatsappView,
    GunuBirlikSablonView,
    GunuBirlikSeceneklerView,
    GunuBirlikSinavIslemView,
    GunuBirlikUcretView,
    GunuBirlikView,
)
from .interfaces.views import (
    DirectRegistrationView,
    TcCheckView,
    VeliTcCheckView,
    WizardDistrictView,
    WizardDraftViewSet,
    WizardMetadataView,
    WizardNextStudentNumberView,
    WizardPackageView,
)

router = DefaultRouter()
router.register("drafts", WizardDraftViewSet, basename="wizard-drafts")

urlpatterns = [
    path("metadata/", WizardMetadataView.as_view(), name="wizard-metadata"),
    path("districts/", WizardDistrictView.as_view(), name="wizard-districts"),
    path("next-student-number/", WizardNextStudentNumberView.as_view(), name="wizard-student-number"),
    path("packages/", WizardPackageView.as_view(), name="wizard-packages"),
    path("tc-check/", TcCheckView.as_view(), name="tc-check"),
    path("veli-tc-check/", VeliTcCheckView.as_view(), name="veli-tc-check"),
    path("register/", DirectRegistrationView.as_view(), name="direct-registration"),
    path("gunu-birlik/", GunuBirlikView.as_view(), name="gunu-birlik"),
    path("gunu-birlik/secenekler/", GunuBirlikSeceneklerView.as_view(), name="gunu-birlik-secenekler"),
    path("gunu-birlik/ucret/", GunuBirlikUcretView.as_view(), name="gunu-birlik-ucret"),
    path("gunu-birlik/sinav/", GunuBirlikSinavIslemView.as_view(), name="gunu-birlik-sinav"),
    path("gunu-birlik/sablon/", GunuBirlikSablonView.as_view(), name="gunu-birlik-sablon"),
    path("gunu-birlik/excel/", GunuBirlikExcelView.as_view(), name="gunu-birlik-excel"),
    path("gunu-birlik/giris-belgesi/", GunuBirlikGirisBelgesiView.as_view(), name="gunu-birlik-giris-belgesi"),
    path(
        "gunu-birlik/giris-belgesi/whatsapp/",
        GunuBirlikGirisBelgesiWhatsappView.as_view(),
        name="gunu-birlik-giris-belgesi-whatsapp",
    ),
    path("", include(router.urls)),
]
