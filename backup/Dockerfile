FROM postgres:15

RUN apt-get update && apt-get install -y cron

COPY backup.sh /backup.sh
RUN chmod +x /backup.sh

RUN echo "0 2 * * * /backup.sh >> /var/log/backup.log 2>&1" > /etc/cron.d/backup
RUN chmod 0644 /etc/cron.d/backup

CMD ["cron", "-f"]