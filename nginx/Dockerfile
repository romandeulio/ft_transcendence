FROM nginx:alpine

RUN apk add --no-cache openssl

RUN openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/ssl/private/transcendence.key \
    -out /etc/ssl/certs/transcendence.crt \
    -subj "/C=FR/ST=PACA/L=Nice/O=42/CN=localhost"

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 443

CMD ["nginx", "-g", "daemon off;"]