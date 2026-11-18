# Backend API + seed tool. Build: docker build -t pos-apotek-api ./backend
FROM golang:1.25-alpine AS build
WORKDIR /src
ENV CGO_ENABLED=0 GOTOOLCHAIN=local
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# docs/ (swagger) is committed; the binary embeds it, so swag is not needed here.
RUN go build -trimpath -ldflags="-s -w" -o /out/api . \
    && go build -trimpath -ldflags="-s -w" -o /out/seed ./cmd/seed

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata \
    && adduser -D -H -u 10001 app
ENV TZ=Asia/Jakarta \
    APP_ENV=production \
    APP_PORT=8072 \
    LOG_DIR=storage/logs
WORKDIR /app
COPY --from=build /out/api /out/seed ./
# Uploads (logo, product images) and logs live in a volume; back up storage/uploads together with the database.
RUN mkdir -p storage/uploads storage/logs && chown -R app:app storage
USER app
VOLUME ["/app/storage"]
EXPOSE 8072
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO- "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null || exit 1
CMD ["./api"]
