FROM rust:1.90-bookworm AS builder

WORKDIR /app
# Build dependencies against a stub main so this layer stays cached until
# Cargo.toml or Cargo.lock change; a redeploy then only recompiles this crate
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs && \
    cargo build --release && \
    rm -rf src target/release/golf target/release/deps/golf-*

COPY . .
RUN cargo build --release && cp target/release/golf /golf

FROM debian:bookworm-slim AS isolate

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git build-essential pkg-config \
    libcap-dev libseccomp-dev libsystemd-dev \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch v2.7 https://github.com/ioi/isolate.git /tmp/isolate && \
    make -C /tmp/isolate isolate && \
    make -C /tmp/isolate install

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 libcap2 libseccomp2 libsystemd0 \
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

COPY --from=builder /golf .
COPY migrations ./migrations
COPY templates ./templates
COPY static ./static
COPY problems ./problems

EXPOSE 3000

CMD ["./golf"]
