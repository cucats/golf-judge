FROM rust:1.88

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    python3-pip \
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

# Create app directory
WORKDIR /app

# Copy the source code
COPY . .

# Build the application
RUN cargo build --release

# Expose the port the app runs on
EXPOSE 3000

# Run the application
CMD ["./target/release/golf"]
