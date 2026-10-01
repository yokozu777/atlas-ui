# Hub API (FastAPI gateway.py). Build context: atlas-ui repo root.
# Alpine + ansible-core (ansible-vault only). Playbooks run on the worker.
ARG PYTHON_BASE_IMAGE=python:3.14-alpine

FROM ${PYTHON_BASE_IMAGE} AS deps
WORKDIR /build
RUN apk add --no-cache gcc musl-dev libffi-dev openssl-dev
COPY hub/requirements.txt /build/requirements.txt
RUN pip install --no-cache-dir --prefix=/install -r /build/requirements.txt

FROM ${PYTHON_BASE_IMAGE}
ARG INSTALL_CUSTOM_CA_SSL_CERT=true
ARG CA_CERT_URL=https://ca.mxhash.com:8443/roots.pem

WORKDIR /app

RUN apk add --no-cache \
      bash \
      git \
      iputils \
      openssh-client \
      ca-certificates \
      curl \
      libffi \
      openssl \
 && if [ "${INSTALL_CUSTOM_CA_SSL_CERT}" = "true" ]; then \
      mkdir -p /usr/local/share/ca-certificates \
      && curl -fsSk "${CA_CERT_URL}" -o /usr/local/share/ca-certificates/custom_ca.crt \
      && update-ca-certificates; \
    fi \
 && apk del curl

COPY --from=deps /install /usr/local
COPY hub /app
RUN rm -rf /app/tests \
  && rm -f /app/update_admin_password.py /app/Dockerfile /app/Dockerfile.worker \
    /app/.dockerignore \
  && mkdir -p /app/data \
  && chmod +x /app/docker-entrypoint.sh \
  && find /usr/local -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true \
  && find /usr/local -type f -name '*.pyc' -delete 2>/dev/null || true \
  && pip cache purge 2>/dev/null || true

ENV PORT=8000
ENV DATA_DIR=/app/data
ENV PYTHONDONTWRITEBYTECODE=1
EXPOSE 8000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
