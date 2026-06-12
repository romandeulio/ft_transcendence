NAME = ft_transcendence
COMPOSE = docker compose

all: up

# Build and start containers
up:
	$(COMPOSE) up --build -d

# Stop containers
down:
	$(COMPOSE) down

# Restart everything
restart: down up

# Stop + remove containers, networks, volumes
clean:
	$(COMPOSE) down -v

# Full clean (images too)
fclean: clean
	docker system prune -af

# Rebuild from scratch
re: fclean up

# Logs
logs:
	$(COMPOSE) logs -f

# Exec into containers
exec-backend:
	docker exec -it transcendence_backend bash

exec-frontend:
	docker exec -it transcendence_frontend sh

exec-db:
	docker exec -it transcendence_postgresql psql -U $(POSTGRES_USER)

# Status
ps:
	$(COMPOSE) ps

backup:
	docker exec transcendence_backup /backup.sh

# Joueurs de test (à supprimer quand plus besoin)
seed:
	docker exec transcendence_backend python manage.py seed_users

unseed:
	docker exec transcendence_backend python manage.py seed_users --clean

.PHONY: all up down restart clean fclean re logs exec-backend exec-frontend exec-db ps backup seed unseed