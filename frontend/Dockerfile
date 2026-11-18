# Frontend SPA served by nginx. The API address is baked in at build time:
#   docker build -t pos-apotek-web --build-arg VITE_API_URL=https://api.apotek.example/api \
#     --build-arg VITE_STORAGE_URL=https://api.apotek.example/storage/uploads ./frontend
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG VITE_API_URL
ARG VITE_STORAGE_URL
RUN test -n "$VITE_API_URL" && test -n "$VITE_STORAGE_URL" \
    || (echo "build-arg VITE_API_URL dan VITE_STORAGE_URL wajib diisi" && exit 1)
ENV VITE_API_URL=$VITE_API_URL VITE_STORAGE_URL=$VITE_STORAGE_URL
RUN npm run build

FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
