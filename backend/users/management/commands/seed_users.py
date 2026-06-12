from django.core.management.base import BaseCommand
from django.db import connection
from users.models import User

SEED_USERS = [
    {"username": "player1", "email": "seed_player1@test.local", "password": "Test1234!"},
    {"username": "player2", "email": "seed_player2@test.local", "password": "Test1234!"},
    {"username": "player3", "email": "seed_player3@test.local", "password": "Test1234!"},
    {"username": "player4", "email": "seed_player4@test.local", "password": "Test1234!"},
    {"username": "player5", "email": "seed_player5@test.local", "password": "Test1234!"},
    {"username": "player6", "email": "seed_player6@test.local", "password": "Test1234!"},
    {"username": "player7", "email": "seed_player7@test.local", "password": "Test1234!"},
    {"username": "player8", "email": "seed_player8@test.local", "password": "Test1234!"},
]

SEED_EMAILS = {u["email"] for u in SEED_USERS}


class Command(BaseCommand):
    help = "Crée (ou supprime) 8 joueurs de test. --clean pour les supprimer."

    def add_arguments(self, parser):
        parser.add_argument(
            "--clean",
            action="store_true",
            help="Supprime les 8 joueurs de test de la base",
        )

    def handle(self, *args, **options):
        if options["clean"]:
            placeholders = ','.join(['%s'] * len(SEED_EMAILS))
            with connection.cursor() as cursor:
                cursor.execute(
                    f"DELETE FROM users WHERE email IN ({placeholders})",
                    list(SEED_EMAILS),
                )
                deleted = cursor.rowcount
            self.stdout.write(self.style.SUCCESS(f"{deleted} joueur(s) de test supprimé(s)."))
            return

        created = 0
        skipped = 0
        for data in SEED_USERS:
            if User.objects.filter(email=data["email"]).exists():
                skipped += 1
                continue
            user = User.objects.create_user(
                email=data["email"],
                username=data["username"],
                password=data["password"],
            )
            user.is_active = True
            user.save(update_fields=["is_active"])
            created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"{created} joueur(s) créé(s), {skipped} déjà existant(s).\n"
                f"Login : seed_playerX@test.local / Test1234!"
            )
        )
