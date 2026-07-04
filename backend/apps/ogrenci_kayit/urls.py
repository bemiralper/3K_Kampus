from django.urls import include, path
from rest_framework.routers import DefaultRouter

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
    path("", include(router.urls)),
]
