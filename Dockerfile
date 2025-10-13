FROM rust:1.88 AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    libsystemd-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN cargo build --release

FROM rust:1.88

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    git \
    python3 \
    libcap-dev \
    libsystemd-dev \
    && rm -rf /var/lib/apt/lists/*

# Install isolate (sandboxing tool for code execution)
RUN git clone https://github.com/ioi/isolate.git /tmp/isolate && \
    cd /tmp/isolate && \
    make isolate && \
    make install && \
    rm -rf /tmp/isolate

# Set up isolate directories
RUN mkdir -p /var/local/lib/isolate && \
    chmod 777 /var/local/lib/isolate

WORKDIR /app

# Copy the compiled binary from builder
COPY --from=builder /app/target/release/golf .
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/static ./static
COPY --from=builder /app/problems ./problems

# Expose the port the app runs on
EXPOSE 3000

# Run the application
CMD ["./golf"]
