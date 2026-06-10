# JWT
from datetime import timedelta

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
}

#REST_FRAMEWORK = {
#    'DEFAULT_THROTTLE_CLASSES': [
#        'rest_framework.throttling.AnonRateThrottle',
#        'rest_framework.throttling.UserRateThrottle',
#    ],
#    'DEFAULT_THROTTLE_RATES': {
#        'anon': '20/min',
#        'user': '200/min',
#    }
#}

REST_FRAMEWORK = {
	'DEFAULT_AUTHENTICATION_CLASSES': (
		'rest_framework_simplejwt.authentication.JWTAuthentication',
	),
	'DEFAULT_PERMISSION_CLASSES': (
		'rest_framework.permissions.IsAuthenticated',
	),
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