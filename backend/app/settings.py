"""
Django settings for ft_transcendence
"""

from pathlib import Path
from decouple import config
import os

BASE_DIR = Path(__file__).resolve().parent.parent

# ===========================================================================
# SÉCURITÉ
# ===========================================================================

SECRET_KEY = config('DJANGO_SECRET_KEY')

DEBUG = config('DEBUG', default=False, cast=bool)

ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='transcendance.maagosti.fr').split(',')

SITE_URL = config(
	'SITE_URL',
	default=config('CORS_ALLOWED_ORIGINS', default='https://transcendance.maagosti.fr').split(',')[0],
).rstrip('/')

# ===========================================================================
# APPLICATIONS
# ===========================================================================

DJANGO_APPS = [
	'django.contrib.admin',
	'django.contrib.auth',
	'django.contrib.contenttypes',
	'django.contrib.sessions',
	'django.contrib.messages',
	'django.contrib.staticfiles',
]

THIRD_PARTY_APPS = [
	'rest_framework',
	'rest_framework_simplejwt',
	'corsheaders',
	'channels',
]

# APPS Syd
LOCAL_APPS_SYDNEY = [
	'matches',
	'planning',
	'seasons',
	'organizations',
	'public_api',
	'tournaments',
    'stats',
    'achievements',
]

# Apps autres
LOCAL_APPS_TEAM = [
    'users',       # AUTH_USER_MODEL
    'realtime',    # WebSockets
    'performance', # Stats joueur
    'bets',        # paris & wallet
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS_SYDNEY + LOCAL_APPS_TEAM

# ===========================================================================
# MIDDLEWARE
# ===========================================================================

MIDDLEWARE = [
	'django.middleware.security.SecurityMiddleware',
	'corsheaders.middleware.CorsMiddleware',  # doit être haut dans la liste
	'django.contrib.sessions.middleware.SessionMiddleware',
	'django.middleware.common.CommonMiddleware',
	'django.middleware.csrf.CsrfViewMiddleware',
	'django.contrib.auth.middleware.AuthenticationMiddleware',
	'django.contrib.messages.middleware.MessageMiddleware',
	'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'app.urls'

TEMPLATES = [
	{
		'BACKEND': 'django.template.backends.django.DjangoTemplates',
		'DIRS': [],
		'APP_DIRS': True,
		'OPTIONS': {
			'context_processors': [
				'django.template.context_processors.debug',
				'django.template.context_processors.request',
				'django.contrib.auth.context_processors.auth',
				'django.contrib.messages.context_processors.messages',
			],
		},
	},
]

# WebSockets
WSGI_APPLICATION = 'app.wsgi.application'
ASGI_APPLICATION = 'app.asgi.application'

# ===========================================================================
# BASE DE DONNÉES
# ===========================================================================

DATABASES = {
	'default': {
		'ENGINE': 'django.db.backends.postgresql',
		'NAME': config('POSTGRES_DB', default='postgresql'),
		'USER': config('POSTGRES_USER', default='postgresql'),
		'PASSWORD': config('POSTGRES_PASSWORD'),
		'HOST': config('POSTGRES_HOST', default='db'),
		'PORT': config('POSTGRES_PORT', default='5432'),
	}
}

# ===========================================================================
# AUTHENTIFICATION
# ===========================================================================
AUTH_USER_MODEL = 'users.User'

AUTH_PASSWORD_VALIDATORS = [
	{'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
	{'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
	{'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
	{'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ===========================================================================
# DJANGO REST FRAMEWORK
# ===========================================================================

REST_FRAMEWORK = {
	'DEFAULT_AUTHENTICATION_CLASSES': (
		'users.authentication.CookieJWTAuthentication',
	),
	'DEFAULT_PERMISSION_CLASSES': (
		'rest_framework.permissions.IsAuthenticated',
	),
    #'DEFAULT_PERMISSION_CLASSES': (
    #	'rest_framework.permissions.AllowAny',
	#),
	'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
	'PAGE_SIZE': 20,
	'DEFAULT_THROTTLE_CLASSES': [
		'rest_framework.throttling.AnonRateThrottle',
		'rest_framework.throttling.UserRateThrottle',
	],
	'DEFAULT_THROTTLE_RATES': {
		'anon': '100/hour',
		'user': '1000/hour',
		# Rate limiting spécifique à la Public API
		'public_api': '200/hour',
	},
}

# Pas de migrations Django — toutes les tables sont créées par init.sql
MIGRATION_MODULES = {
	'public_api': None,
}

# ===========================================================================
# JWT
# ===========================================================================

from datetime import timedelta

SIMPLE_JWT = {
	'ACCESS_TOKEN_LIFETIME': timedelta(days=1),
	'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
	'ROTATE_REFRESH_TOKENS': True,
	'BLACKLIST_AFTER_ROTATION': True,
	'AUTH_HEADER_TYPES': ('Bearer',),
}

JWT_ACCESS_COOKIE_NAME = config('JWT_ACCESS_COOKIE_NAME', default='access_token')
JWT_REFRESH_COOKIE_NAME = config('JWT_REFRESH_COOKIE_NAME', default='refresh_token')
JWT_COOKIE_SECURE = config('JWT_COOKIE_SECURE', default=True, cast=bool)
JWT_COOKIE_SAMESITE = config('JWT_COOKIE_SAMESITE', default='Lax')

# ===========================================================================
# CORS
# À affiner avec Coraline selon la config nginx
# ===========================================================================

CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='https://transcendance.maagosti.fr,http://localhost:3000'
).split(',')

CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = config(
    'CSRF_TRUSTED_ORIGINS',
    default='https://transcendance.maagosti.fr,http://localhost:3000'
).split(',')

SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = False
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_SAMESITE = "None"
CSRF_COOKIE_SAMESITE = "None"
# ===========================================================================
# CHANNELS (WebSockets — Roman)
# ===========================================================================

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [{
                'host': config('REDIS_HOST', default='redis'),
                'port': config('REDIS_PORT', default=6379, cast=int),
                'socket_timeout': None,
                'socket_keepalive': True,
            }],
        },
    },
}

# ===========================================================================
# CHACHES (pour token 42 — Thaïs)
# ===========================================================================

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": f"redis://{config('REDIS_HOST', default='redis')}:{config('REDIS_PORT', default=6379)}/1",
    }
}

# Sessions stockées dans Redis (pas besoin de table django_session)
SESSION_ENGINE = "django.contrib.sessions.backends.cache"
SESSION_CACHE_ALIAS = "default"

# ===========================================================================
# INTERNATIONALISATION
# ===========================================================================

LANGUAGE_CODE = 'fr-fr'
TIME_ZONE = 'Europe/Paris'
USE_I18N = True
USE_TZ = True

# ===========================================================================
# FICHIERS STATIQUES
# ===========================================================================

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

OAUTH_42_CLIENT_ID = config("OAUTH_42_CLIENT_ID")
OAUTH_42_CLIENT_SECRET = config("OAUTH_42_CLIENT_SECRET")
OAUTH_42_REDIRECT_URI = config("OAUTH_42_REDIRECT_URI")

# mail verification
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
# EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
EMAIL_HOST = "smtp.gmail.com"   # serveur SMTP d'Outlook
EMAIL_PORT = 587                    # port TLS
EMAIL_USE_TLS = True
EMAIL_HOST_USER = "babyfoot42nice@gmail.com"  # ton vrai email
EMAIL_HOST_PASSWORD = "***REMOVED***"   # mot de passe de ton compte ou mot de passe d'application
DEFAULT_FROM_EMAIL = EMAIL_HOST_USER

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# BDE — mot de passe partagé pour créer un tournoi
BDE_PASSWORD = config('BDE_PASSWORD', default='bde42')

# Admin dashboard
ADMIN_LOGIN = config('ADMIN_LOGIN', default='admin')
ADMIN_PASSWORD = config('ADMIN_PASSWORD', default='admin42')
