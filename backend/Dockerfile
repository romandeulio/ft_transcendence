
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
	postgresql-client \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000

# probablement a rajouter a voir avec coco
#COPY entrypoint.sh /entrypoint.sh
#entrypoint.sh = 
#!/bin/sh
#python manage.py migrate --noinput
#exec "$@"
#RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]

CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "app.asgi:application"]