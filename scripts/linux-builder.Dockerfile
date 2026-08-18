# Builder image for producing Linux installers from a non-Linux host.
#
# Ubuntu 22.04 sets the glibc floor at 2.35, which is what makes the resulting
# .deb/.AppImage run on Ubuntu 22.04+, Debian 12+ and Fedora 36+. Building on a
# newer base would silently raise that floor and break older colleagues' boxes.
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive \
    CARGO_HOME=/cargo \
    RUSTUP_HOME=/rustup \
    PATH=/cargo/bin:$PATH \
    # appimagetool wants FUSE, which containers do not have. Extracting instead
    # of mounting is the supported escape hatch.
    APPIMAGE_EXTRACT_AND_RUN=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        curl \
        desktop-file-utils \
        file \
        git \
        libayatana-appindicator3-dev \
        libgtk-3-dev \
        librsvg2-dev \
        libssl-dev \
        libwebkit2gtk-4.1-dev \
        patchelf \
        pkg-config \
        librsvg2-common \
        rsync \
        squashfs-tools \
        wget \
        xz-utils \
        zsync \
    && rm -rf /var/lib/apt/lists/*

# Node 20 (matches the CI workflow).
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# rustup's shell installer probes /proc/self/exe to detect bitness, which fails
# under QEMU emulation ("unknown platform bitness"). Passing the host triple
# explicitly skips that probe instead of relying on the fallback.
ARG TARGETARCH
RUN set -eux; \
    case "${TARGETARCH:-amd64}" in \
      amd64) host=x86_64-unknown-linux-gnu ;; \
      arm64) host=aarch64-unknown-linux-gnu ;; \
      *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://static.rust-lang.org/rustup/dist/${host}/rustup-init" -o /tmp/rustup-init; \
    chmod +x /tmp/rustup-init; \
    /tmp/rustup-init -y --profile minimal --default-toolchain stable --default-host "${host}"; \
    rm /tmp/rustup-init; \
    rustc --version

WORKDIR /build
