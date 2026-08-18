#!/usr/bin/env bash
#
# Build the Linux installers (.deb, .rpm, .AppImage) from any host with Docker.
#
#   ./scripts/build-linux.sh                 # x86_64, what colleagues run
#   ARCH=arm64 ./scripts/build-linux.sh      # aarch64 Linux
#   BUNDLES=deb,rpm,appimage ./scripts/build-linux.sh   # override bundle list
#
# Artifacts land in ./release/linux-<arch>/. On Apple Silicon the default amd64
# build runs under emulation and takes considerably longer than native — the
# GitHub Actions workflow is the faster path once a remote exists.
#
# AppImage is skipped when emulating: the AppImage runtime is an ELF that QEMU
# user-mode emulation refuses to exec ("Exec format error"), so linuxdeploy
# cannot run at all. .deb and .rpm are pure-Rust bundlers and work fine. The
# amd64 AppImage comes from the CI workflow, which runs on a native x86_64
# runner. Set BUNDLES explicitly to override this default.
set -euo pipefail

ARCH="${ARCH:-amd64}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="claudelens-linux-builder:${ARCH}"
OUT_DIR="${REPO_ROOT}/release/linux-${ARCH}"

case "$ARCH" in
  amd64) RUST_TARGET="x86_64-unknown-linux-gnu" ;;
  arm64) RUST_TARGET="aarch64-unknown-linux-gnu" ;;
  *) echo "Unsupported ARCH '$ARCH' (expected amd64 or arm64)" >&2; exit 1 ;;
esac

case "$(uname -m)" in
  arm64|aarch64) HOST_ARCH="arm64" ;;
  x86_64|amd64)  HOST_ARCH="amd64" ;;
  *)             HOST_ARCH="unknown" ;;
esac

if [ -n "${BUNDLES:-}" ]; then
  :
elif [ "$ARCH" != "$HOST_ARCH" ]; then
  BUNDLES="deb,rpm"
  EMULATED=1
else
  BUNDLES="deb,rpm,appimage"
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop and retry." >&2
  exit 1
fi

echo "==> Building builder image ($ARCH)"
docker build \
  --platform "linux/${ARCH}" \
  -f "${REPO_ROOT}/scripts/linux-builder.Dockerfile" \
  -t "$IMAGE" \
  "${REPO_ROOT}/scripts"

# Named volumes keep the cargo registry and target dir warm between runs. They
# are per-arch so an amd64 build never reuses aarch64 objects.
CARGO_VOL="claudelens-cargo-${ARCH}"
TARGET_VOL="claudelens-target-${ARCH}"

mkdir -p "$OUT_DIR"

if [ "${EMULATED:-0}" = "1" ]; then
  echo "==> Host is ${HOST_ARCH}, target is ${ARCH}: building under emulation."
  echo "    Skipping AppImage (linuxdeploy cannot exec under QEMU). Bundles: ${BUNDLES}"
  echo "    The amd64 AppImage is produced by .github/workflows/ci.yml on a native runner."
fi

echo "==> Bundling for ${RUST_TARGET} (bundles: ${BUNDLES})"
# The repo is mounted read-only and copied inside the container: the host
# node_modules/ holds macOS-native binaries and the host target/ holds macOS
# objects, so neither may leak into the Linux build.
docker run --rm \
  --platform "linux/${ARCH}" \
  -v "${REPO_ROOT}:/src:ro" \
  -v "${OUT_DIR}:/out" \
  -v "${CARGO_VOL}:/cargo" \
  -v "${TARGET_VOL}:/target" \
  -e CARGO_TARGET_DIR=/target \
  "$IMAGE" \
  bash -euo pipefail -c '
    rsync -a --delete \
      --exclude node_modules/ \
      --exclude dist/ \
      --exclude release/ \
      --exclude src-tauri/target/ \
      --exclude .git/ \
      /src/ /build/

    npm ci
    npm run tauri -- build --target '"${RUST_TARGET}"' --bundles '"${BUNDLES}"'

    BUNDLE="/target/'"${RUST_TARGET}"'/release/bundle"
    find "$BUNDLE" -type f \
      \( -name "*.deb" -o -name "*.rpm" -o -name "*.AppImage" \) \
      -exec cp -v {} /out/ \;
  '

echo
echo "==> Done. Artifacts in ${OUT_DIR#"$REPO_ROOT"/}:"
ls -la "$OUT_DIR"
