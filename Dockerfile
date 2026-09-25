FROM golang:1.21-alpine AS build

WORKDIR /src
COPY go.mod ./
COPY . .
RUN go test ./... \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/vini-server .

FROM alpine:3.20

RUN addgroup -S vini && adduser -S -G vini vini
WORKDIR /app
COPY --from=build /out/vini-server /app/vini-server

# The demo binds all interfaces in the container so a published port works.
# Publish 8088 to host loopback only; this process has no authentication.
ENV VINI_HOST=0.0.0.0 \
    VINI_PORT=8088
EXPOSE 8088

USER vini:vini
CMD ["/app/vini-server"]
