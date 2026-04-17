# ====================================================
# DOCKERFILE FRONTEND - REACT
# ====================================================
# Version active : DEV (hot reload)
# Version PROD disponible en bas du fichier (commentée)
# Pour passer en prod : commenter le bloc DEV et décommenter PROD
# ====================================================

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Server port Vite
EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ====================================================
# VERSION PROD (à activer pour la démo finale)
# ====================================================
# # Stage 1 : build des fichiers statiques
# FROM node:20-alpine AS build
# WORKDIR /app
# COPY package*.json ./
# RUN npm ci
# COPY . .
# RUN npm run build
#
# # Stage 2 : nginx sert les fichiers statiques
# FROM nginx:alpine
# COPY --from=build /app/dist /usr/share/nginx/html
# EXPOSE 80
# CMD ["nginx", "-g", "daemon off;"]