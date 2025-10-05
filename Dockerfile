# To avoid forkbombs, run with --ulimit nproc=20:20 or similar.

FROM python:3.11

WORKDIR /app

RUN apt-get update && apt-get install -y sudo gcc
RUN pip install uv

COPY uv.lock pyproject.toml ./
RUN uv sync

COPY . .

EXPOSE 5000

CMD ["uv", "run", "python", "app.py"]