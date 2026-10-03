# syntax=docker/dockerfile:1

FROM ubuntu:24.04 AS runner-common

ARG TARGETARCH=amd64
ARG RUNNER_VERSION=2.337.0
ARG RUNNER_SHA256=70920811a4f8ad4328818682bca5c6469c1c942fab52448868071d0063816613

LABEL org.opencontainers.image.source="https://github.com/mikedlabs/frederick-radius"
LABEL org.opencontainers.image.description="Isolated GitHub Actions runner for trusted Frederick Radius data generators"
LABEL org.opencontainers.image.version="${RUNNER_VERSION}"

ENV DEBIAN_FRONTEND=noninteractive
ENV RUNNER_INSTALL_ROOT=/opt/actions-runner
ENV RUNNER_IDENTITY_DIR=/runner/identity
ENV RUNNER_SCRATCH_DIR=/runner/scratch

RUN test "$TARGETARCH" = "amd64"

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      git \
      gzip \
      iptables \
      jq \
      procps \
      tar \
      tini \
      unzip \
      util-linux \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1001 actions \
    && useradd --uid 1001 --gid actions --create-home --shell /bin/bash runner \
    && install -d -m 0755 -o root -g root /opt/actions-runner /runner \
    && install -d -m 0700 -o runner -g actions /runner/identity /runner/scratch

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

WORKDIR /opt/actions-runner

ENTRYPOINT ["/usr/bin/tini", "--", "/bin/bash", "/usr/local/bin/runner-entrypoint"]

# Registration needs an ordinary runner root so the upstream config command can
# create its hardcoded identity files. That disposable container overlay is
# discarded after the entrypoint copies only the required identity into its
# dedicated volume. This target never accepts a job.
FROM runner-common AS registration

# The job listener starts only after registration populated the identity
# volume. Its required config paths can therefore be non-dangling symlinks,
# while all normal diagnostics and job state stay in disposable scratch.
FROM runner-common AS runtime

RUN rm -rf _diag _work \
    && rm -f .runner .credentials .credentials_rsaparams \
    && ln -s /runner/identity/.runner .runner \
    && ln -s /runner/identity/.credentials .credentials \
    && ln -s /runner/identity/.credentials_rsaparams .credentials_rsaparams \
    && ln -s /runner/scratch/diag _diag \
    && ln -s /runner/scratch/work _work

HEALTHCHECK --interval=30s --timeout=5s --start-period=2m --retries=3 \
  CMD test -f /runner/identity/.registration-complete && pgrep -u 1001 -x Runner.Listener >/dev/null || exit 1
