# Hub API (FastAPI gateway.py)
# Build context: atlas-ui repo root
FROM python:3.14-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    openssh-client \
    ansible \
    && rm -rf /var/lib/apt/lists/*

COPY hub/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY hub /app
RUN rm -rf /app/tests \
  && rm -f /app/update_admin_password.py /app/Dockerfile /app/Dockerfile.worker \
    /app/.dockerignore

RUN mkdir -p /app/data

EXPOSE 8000
ENV PORT=8000
ENV DATA_DIR=/app/data
RUN chmod +x /app/docker-entrypoint.sh
ENTRYPOINT ["/app/docker-entrypoint.sh"]
