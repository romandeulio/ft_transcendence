from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError


class Organization(models.Model):
    """
    Groupe/club de joueurs (module Organisation).
    Sert à regrouper des joueurs sous une bannière commune,
    organiser des tournois inter-équipes, afficher des stats de groupe.
    Les équipes pour les matchs 2v2 sont composées à la volée lors de chaque réservation.
    """

    name        = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, default='')
    avatar      = models.ImageField(
        upload_to='organizations/avatars/',
        null=True, blank=True,
        help_text="Avatar du groupe. Optionnel.",
    )

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='owned_organizations',
        help_text="Créateur du groupe. Peut modifier, supprimer, gérer les membres.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    @property
    def member_count(self):
        return self.members.count()

    def get_members(self):
        return [m.player for m in self.members.select_related('player').all()]


class OrganizationMember(models.Model):
    """
    Appartenance d'un joueur à un groupe.
    Un joueur ne peut appartenir qu'à un seul groupe à la fois.
    """

    class Role(models.TextChoices):
        OWNER  = 'OWNER',  'Propriétaire'
        MEMBER = 'MEMBER', 'Membre'

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='members',
    )
    player = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='organization_memberships',
    )
    role = models.CharField(
        max_length=10,
        choices=Role.choices,
        default=Role.MEMBER,
    )
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('organization', 'player')]
        ordering = ['joined_at']

    def __str__(self):
        return f"{self.player} — {self.organization.name} ({self.get_role_display()})"

    def clean(self):
        # Un joueur ne peut appartenir qu'à un seul groupe à la fois
        already_in = OrganizationMember.objects.filter(
            player=self.player
        ).exclude(pk=self.pk).first()
        if already_in:
            raise ValidationError(
                f"{self.player} appartient déjà au groupe '{already_in.organization.name}'. "
                "Il faut quitter ce groupe avant d'en rejoindre un autre."
            )
