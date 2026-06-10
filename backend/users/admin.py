from django.contrib import admin
from .models import User


@admin.register(User)
class CustomUserAdmin(admin.ModelAdmin):
    list_display = (
        "email",
        "username",
        "role",
        "is_active",
        "created_at",
    )

    search_fields = (
        "email",
        "username",
    )

    list_filter = (
        "role",
        "is_active",
    )
