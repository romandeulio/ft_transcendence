from django.urls import path
from . import views
from . import RGPD
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    path('register/',         views.RegisterView.as_view()),
    path('login/',            views.LoginView.as_view()),
    path('profile/',          views.ProfileView.as_view()),
    path('users/',            views.UserListView.as_view()),
    path('token/refresh/',    views.CookieTokenRefreshView.as_view()),
    path('logout/',           views.LogoutView.as_view()),
    path('oauth/42/callback/',views.OAuth42CallbackView.as_view()),
    path('2fa/enable/',       views.Enable2FAView.as_view()),
    path('2fa/verify/',       views.Verify2FACodeView.as_view()),
    path("activate/<uidb64>/<token>/", views.ActivateAccountView.as_view(), name="activate"),
    path("oauth/42/login/", views.OAuth42LoginView.as_view()),
    path('avatar/', views.AvatarUploadView.as_view()),
    path('gdpr/export/',      RGPD.GDPRExportView.as_view()),
    path('gdpr/delete/',      RGPD.GDPRDeleteView.as_view()),
    path("profile/update/", views.UpdateProfileView.as_view()),
    path("ticket/", views.TicketView.as_view()),
    path('password/change/', views.ChangePasswordView.as_view()),
    path('2fa/disable/',     views.Disable2FAView.as_view()),
    path('online-users/',    views.OnlineUsersView.as_view()),
    path('friend-notify/',   views.FriendAddNotifyView.as_view()),
    path('my-stats-card/',   views.MyStatsCardView.as_view()),
]