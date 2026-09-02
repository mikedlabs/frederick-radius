# syntax=docker/dockerfile:1

FROM ubuntu:24.04

ARG TARGETARCH=amd64
ARG RUNNER_VERSION=2.337.0
ARG RUNNER_SHA256=70920811a4f8ad4328818682bca5c6469c1c942fab52448868071d0063816613

LABEL org.opencontainers.image.source="https://github.com/mikedlabs/frederick-radius"
LABEL org.opencontainers.image.description="Isolated GitHub Actions runner for trusted Frederick Radius data generators"
LABEL org.opencontainers.image.version="${RUNNER_VERSION}"

ENV DEBIAN_FRONTEND=noninteractive
ENV RUNNER_ROOT=/runner

RUN test "$TARGETARCH" = "amd64"

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      git \
      gzip \
      jq \
      procps \
      tar \
      tini \
      unzip \
      util-linux \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1001 actions \
    && useradd --uid 1001 --gid actions --create-home --shell /bin/bash runner \
    && install -d -m 0700 -o runner -g actions /opt/actions-runner /runner

WORKDIR /opt/actions-runner

RUN curl --fail --show-error --silent --location --retry 5 \
      --proto '=https' --tlsv1.2 \
      --output actions-runner.tar.gz \
      "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" \
    && echo "${RUNNER_SHA256}  actions-runner.tar.gz" | sha256sum --check --strict \
    && tar --extract --gzip --file actions-runner.tar.gz \
    && rm actions-runner.tar.gz \
    && ./bin/installdependencies.sh \
    && rm -rf /var/lib/apt/lists/* \
    && chown -R runner:actions /opt/actions-runner

COPY runner-entrypoint.sh /usr/local/bin/runner-entrypoint

RUN chmod 0755 /usr/local/bin/runner-entrypoint

WORKDIR /runner

HEALTHCHECK --interval=30s --timeout=5s --start-period=2m --retries=3 \
  CMD test -f /runner/.runner && pgrep -f 'Runner.Listener run' >/dev/null || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/bin/bash", "/usr/local/bin/runner-entrypoint"]
