FROM oven/bun:1.4.2-debian AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
ARG BUILD_ORIGIN
RUN bun run build

FROM oven/bun:1.4.2-debian AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile --ignore-scripts

FROM debian:trixie-slim AS isolate

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git build-essential pkg-config \
    libcap-dev libseccomp-dev libsystemd-dev \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch v2.7 https://github.com/ioi/isolate.git /tmp/isolate && \
    make -C /tmp/isolate isolate && \
    make -C /tmp/isolate install

# Submissions run on this interpreter; 3.15 adds unpacking in comprehensions
FROM python:3.15.0-slim-trixie

RUN apt-get update && apt-get install -y --no-install-recommends \
    libcap2 libseccomp2 libsystemd0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=isolate /usr/local/bin/isolate /usr/local/bin/isolate
COPY --from=isolate /usr/local/etc/isolate /usr/local/etc/isolate
RUN chmod u+s /usr/local/bin/isolate

# isolate 2.x runs each box under a uid/gid taken from the isolate user's subid range
RUN useradd --system --no-create-home isolate && \
    echo "isolate:100000:65536" >> /etc/subuid && \
    echo "isolate:100000:65536" >> /etc/subgid

RUN mkdir -p /var/local/lib/isolate && \
    chmod 777 /var/local/lib/isolate

WORKDIR /app

COPY --from=builder /usr/local/bin/bun /usr/local/bin/bun
COPY --from=builder /app/build ./build
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY migrations ./migrations
COPY scripts/migrate.mjs ./scripts/migrate.mjs

EXPOSE 3000

ENV HOST=0.0.0.0 PORT=3000

CMD ["sh", "-c", "bun scripts/migrate.mjs && exec bun build/index.js"]
