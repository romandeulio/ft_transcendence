"""
URLs principales — ft_transcendence
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import (
	TokenObtainPairView,
	TokenRefreshView,
)
from . import health

urlpatterns = [

	# Admin Django
	path('admin/', admin.site.urls),

	# ===========================================================================
	# AUTHENTIFICATION JWT
	# Les endpoints de login/register de APPS users Thaïs
	# ===========================================================================
	path('api/auth/', include('users.urls')),
	path('api/auth/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
	path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

	# ===========================================================================
	# APPS Syd
	# ===========================================================================
	path('api/matches/', include('matches.urls')),
	path('api/planning/', include('planning.urls')),
	path('api/seasons/', include('seasons.urls')),
	path('api/organizations/', include('organizations.urls')),

	# Public API (module Major — clé d'accès + rate limiting)
	path('api/public/', include('public_api.urls')),

	# ===========================================================================
	# APPS autres
	# ===========================================================================
	# path('api/bets/', include('bets.urls')),  # Roman — commenté en attendant la création de l'app

	path('health', health.health),
]
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)