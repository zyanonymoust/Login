FROM node:24-alpine AS build

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./

RUN npm ci

COPY frontend/. .

ARG VITE_API_URL=

ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

FROM nginx:alpine AS final

ENV BACKEND_URL=http://server:8080
ENV PORT=8080
ENV NGINX_ENVSUBST_FILTER="^(BACKEND_URL|DNS_RESOLVER|PORT)$"

COPY frontend/nginx.conf /etc/nginx/templates/default.conf.template
COPY frontend/docker-entrypoint.d/16-railway-resolver.envsh /docker-entrypoint.d/16-railway-resolver.envsh
RUN sed -i 's/\r$//' /docker-entrypoint.d/16-railway-resolver.envsh \
    && chmod +x /docker-entrypoint.d/16-railway-resolver.envsh

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
