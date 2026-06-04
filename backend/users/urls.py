from django.urls import path
from . import views
from rest_framework_simplejwt.views import TokenRefreshView


urlpatterns = [
    path('register/',         views.RegisterView.as_view()),
    path('login/',            views.LoginView.as_view()),
    path('token/refresh/',    TokenRefreshView.as_view()),
    path('oauth/42/callback/',views.OAuth42CallbackView.as_view()),
    path('2fa/enable/',       views.Enable2FAView.as_view()),
    path("activate/<uidb64>/<token>/", views.ActivateAccountView.as_view(), name="activate"),
    #path('gdpr/export/',      views.GDPRExportView.as_view()),
    #path('gdpr/delete/',      views.GDPRDeleteView.as_view()),
]