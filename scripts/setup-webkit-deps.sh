#!/usr/bin/env bash
# ZARI-010 — user-space WebKit dependency provisioning.
#
# `npx playwright install-deps webkit` requires root. On hosts where the
# developer is unprivileged this script installs the Debian packages that
# Playwright WebKit (WPE MiniBrowser) needs into ~/.cache/zari-webkit-deps
# instead: archives are fetched with `apt-get download` (no root), unpacked
# with `dpkg-deb -x`, and the extracted libraries are copied into the
# Playwright bundle's sys/lib directory which its wrapper already adds to
# the loader path. Finally it writes env.json with the GLVND/Mesa lookup
# paths that playwright.config.ts applies to the webkit launch env.
#
# Requirements: Debian/Ubuntu host with apt metadata already populated
# (apt-get download does not need root), Playwright WebKit already fetched
# via `npx playwright install webkit`.
#
# On hosts with proper system packages this script is unnecessary — the
# webkit project runs with stock configuration. This script changes no
# repository state; ~/.cache/zari-webkit-deps/env.json is the only marker
# playwright.config.ts reads.
set -euo pipefail

DEPS="${ZARI_WEBKIT_DEPS:-$HOME/.cache/zari-webkit-deps}"
BROWSERS="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"

if ! command -v apt-get >/dev/null 2>&1 || ! command -v dpkg-deb >/dev/null 2>&1; then
  echo "setup-webkit-deps: apt-get and dpkg-deb are required (Debian/Ubuntu host)." >&2
  exit 1
fi
if ! ls "$BROWSERS"/webkit-*/minibrowser-wpe/bin/MiniBrowser >/dev/null 2>&1; then
  echo "setup-webkit-deps: Playwright WebKit not found; run npx playwright install webkit first." >&2
  exit 1
fi

# gtk-4 + WPE MiniBrowser dependency closure for Debian 13 (trixie) amd64.
PACKAGES=(
  libavif16 libcairo-script-interpreter2 libdrm-amdgpu1 libdrm-intel1
  libdrm-nouveau2 libdrm-radeon1 libdrm2 libegl-mesa0 libegl1
  libenchant-2-2 libevdev2 libevent-2.1-7t64 libgav1-1 libgbm1 libgl1
  libgl1-mesa-dri libgles2 libglvnd0 libglx0 libgraphene-1.0-0
  libgstreamer-gl1.0-0 libgstreamer-plugins-bad1.0-0 libgtk-4-1
  libharfbuzz-subset0 libhidapi-hidraw0 libllvm19 libmanette-0.2-0
  libopengl0 libsensors5 libsoup-3.0-0 libxcb-dri3-0 libxcb-present0
  libxcb-randr0 libxcb-sync1 libxcb-xfixes0 libxshmfence1 libyuv0
  mesa-vulkan-drivers
)

mkdir -p "$DEPS/debs" "$DEPS/root"
cd "$DEPS/debs"
echo "setup-webkit-deps: downloading ${#PACKAGES[@]} packages into $DEPS/debs"
apt-get download "${PACKAGES[@]}"
for archive in ./*.deb; do
  dpkg-deb -x "$archive" "$DEPS/root"
done

# The Playwright wrapper clears LD_LIBRARY_PATH but keeps its bundled
# sys/lib on the loader path, so the extracted libraries live there.
for bundle in "$BROWSERS"/webkit-*/minibrowser-wpe "$BROWSERS"/webkit-*/minibrowser-gtk; do
  [ -d "$bundle/sys/lib" ] || continue
  cp -an "$DEPS/root/usr/lib/x86_64-linux-gnu/." "$bundle/sys/lib/"
done

cat > "$DEPS/env.json" <<EOF
{
  "__EGL_VENDOR_LIBRARY_DIRS": "$DEPS/root/usr/share/glvnd/egl_vendor.d",
  "GBM_BACKENDS_PATH": "$DEPS/root/usr/lib/x86_64-linux-gnu/gbm",
  "LIBGL_ALWAYS_SOFTWARE": "1",
  "LIBGL_DRIVERS_PATH": "$DEPS/root/usr/lib/x86_64-linux-gnu/dri"
}
EOF
rm -rf "$DEPS/debs"

echo "setup-webkit-deps: ready. playwright.config.ts will apply $DEPS/env.json to the webkit project."
echo "setup-webkit-deps: verify with: npx playwright test --project=webkit --list"
