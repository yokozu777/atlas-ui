# Hub API (FastAPI gateway.py). Build context: atlas-ui repo root.
# Alpine + ansible-core (ansible-vault only). Playbooks run on the worker.
ARG PYTHON_BASE_IMAGE=python:3.14-alpine

FROM ${PYTHON_BASE_IMAGE} AS deps
WORKDIR /build
RUN apk add --no-cache gcc musl-dev libffi-dev openssl-dev
COPY hub/requirements.txt /build/requirements.txt
RUN pip install --no-cache-dir --prefix=/install -r /build/requirements.txt \
 && find /install -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true \
 && find /install -type d -name ansible_test -exec rm -rf {} + 2>/dev/null || true \
 && find /install -type d -name tests -path '*/site-packages/*' -exec rm -rf {} + 2>/dev/null || true \
 && find /install -type f -name '*.pyc' -delete 2>/dev/null || true \
 && find /install -type f -name '*.pyi' -delete 2>/dev/null || true \
 && rm -rf \
      /install/lib/python*/site-packages/pip \
      /install/lib/python*/site-packages/pip-*.dist-info \
      /install/lib/python*/site-packages/setuptools \
      /install/lib/python*/site-packages/setuptools-*.dist-info \
      /install/lib/python*/site-packages/_distutils_hack \
      /install/lib/python*/site-packages/distutils-precedence.pth \
      /install/lib/python*/site-packages/pkg_resources

FROM ${PYTHON_BASE_IMAGE}
ARG INSTALL_CUSTOM_CA_SSL_CERT=true
ARG CA_CERT_URL=https://ca.mxhash.com:8443/roots.pem

WORKDIR /app

RUN apk add --no-cache \
      bash \
      git \
      openssh-client \
      ca-certificates \
      curl \
      libffi \
      openssl \
 && apk upgrade --no-cache zlib \
 && if [ "${INSTALL_CUSTOM_CA_SSL_CERT}" = "true" ]; then \
      mkdir -p /usr/local/share/ca-certificates \
      && curl -fsSk "${CA_CERT_URL}" -o /usr/local/share/ca-certificates/custom_ca.crt \
      && update-ca-certificates; \
    fi \
 && apk del curl

COPY --from=deps /install /usr/local
# API surface only — no hub/worker, tests, or Dockerfiles.
COPY hub/*.py /app/
COPY hub/docker-entrypoint.sh /app/docker-entrypoint.sh
# Drop base-image pip (vendored urllib3/msgpack/setuptools) and leftover junk.
RUN mkdir -p /app/data \
  && chmod +x /app/docker-entrypoint.sh \
  && find /usr/local -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true \
  && find /usr/local -type d -name ansible_test -exec rm -rf {} + 2>/dev/null || true \
  && find /usr/local -type f -name '*.pyc' -delete 2>/dev/null || true \
  && rm -rf \
       /usr/local/lib/python*/site-packages/pip \
       /usr/local/lib/python*/site-packages/pip-*.dist-info \
       /usr/local/lib/python*/site-packages/setuptools \
       /usr/local/lib/python*/site-packages/setuptools-*.dist-info \
       /usr/local/lib/python*/site-packages/_distutils_hack \
       /usr/local/lib/python*/site-packages/distutils-precedence.pth \
       /usr/local/lib/python*/site-packages/pkg_resources \
       /usr/local/bin/pip \
       /usr/local/bin/pip3 \
       /usr/local/bin/pip3.*

ENV PORT=8000
ENV DATA_DIR=/app/data
ENV PYTHONDONTWRITEBYTECODE=1
EXPOSE 8000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
