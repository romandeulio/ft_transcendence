from django.urls import path
from . import views

urlpatterns = [
	path('',                                        views.OrganizationListCreateView.as_view(), name='organization-list'),
	path('<int:pk>/',                               views.OrganizationDetailView.as_view(),     name='organization-detail'),
	path('<int:pk>/members/',                       views.organization_add_member,               name='organization-add-member'),
	path('<int:pk>/members/<int:player_id>/',       views.organization_remove_member,            name='organization-remove-member'),
]
