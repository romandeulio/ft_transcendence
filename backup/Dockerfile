FROM postgres:15

RUN apt-get update && apt-get install -y cron && rm -rf /var/lib/apt/lists/*

COPY backup.sh /backup.sh
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /backup.sh /entrypoint.sh

# /etc/cron.d entries require a user field (here: root) — without it the job is ignored.
RUN echo "0 2 * * * root /backup.sh >> /var/log/backup.log 2>&1" > /etc/cron.d/backup
RUN chmod 0644 /etc/cron.d/backup

CMD ["/entrypoint.sh"]
