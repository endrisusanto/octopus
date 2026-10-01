#!/usr/bin/env bash
# ponytail: Simple native .deb packager for Octopus Desktop Agent Bridge
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION=$(grep -m1 'version' "${ROOT_DIR}/agent-bridge/Cargo.toml" | cut -d '"' -f 2)
PKG_NAME="octopus-agent-bridge"
ARCH="amd64"
DEB_NAME="${PKG_NAME}_${VERSION}_${ARCH}.deb"
DIST_DIR="${ROOT_DIR}/dist"
STAGE_DIR="${DIST_DIR}/stage_${PKG_NAME}"

echo "==> [1/4] Compiling Rust release binary (${PKG_NAME} v${VERSION})..."
cargo build --release --manifest-path "${ROOT_DIR}/agent-bridge/Cargo.toml"

echo "==> [2/4] Preparing Debian package layout..."
rm -rf "${STAGE_DIR}"
mkdir -p "${STAGE_DIR}/DEBIAN"
mkdir -p "${STAGE_DIR}/usr/bin"
mkdir -p "${STAGE_DIR}/usr/share/applications"
mkdir -p "${STAGE_DIR}/usr/share/icons/hicolor/512x512/apps"
mkdir -p "${STAGE_DIR}/usr/share/icons/hicolor/128x128/apps"
mkdir -p "${STAGE_DIR}/usr/share/icons/hicolor/32x32/apps"
mkdir -p "${STAGE_DIR}/opt/flashkit/firmware"

# 1. Copy binary & assets
cp "${ROOT_DIR}/agent-bridge/target/release/octopus-agent-bridge" "${STAGE_DIR}/usr/bin/octopus-agent-bridge"
chmod +x "${STAGE_DIR}/usr/bin/octopus-agent-bridge"

if [ -d "${ROOT_DIR}/agent-bridge/assets" ]; then
    mkdir -p "${STAGE_DIR}/usr/share/octopus-agent-bridge/assets"
    cp -r "${ROOT_DIR}/agent-bridge/assets/"* "${STAGE_DIR}/usr/share/octopus-agent-bridge/assets/"
    chmod +x "${STAGE_DIR}/usr/share/octopus-agent-bridge/assets/odin4" 2>/dev/null || true
fi

# 2. Copy App Icons (Hydra Emblem)
if [ -f "${ROOT_DIR}/agent-bridge/icons/icon.png" ]; then
    cp "${ROOT_DIR}/agent-bridge/icons/icon.png" "${STAGE_DIR}/usr/share/icons/hicolor/512x512/apps/octopus-agent-bridge.png"
    cp "${ROOT_DIR}/agent-bridge/icons/128x128.png" "${STAGE_DIR}/usr/share/icons/hicolor/128x128/apps/octopus-agent-bridge.png"
    cp "${ROOT_DIR}/agent-bridge/icons/32x32.png" "${STAGE_DIR}/usr/share/icons/hicolor/32x32/apps/octopus-agent-bridge.png"
fi

# 3. Create Desktop Entry Shortcut
cat <<EOF > "${STAGE_DIR}/usr/share/applications/octopus-agent-bridge.desktop"
[Desktop Entry]
Name=Octopus Agent Bridge
Comment=Distributed Provisioning Suite Bridge Daemon for Samsung & Android
Exec=/usr/bin/octopus-agent-bridge
Icon=octopus-agent-bridge
Terminal=false
Type=Application
Categories=Development;Utility;
Keywords=Android;Odin;ADB;FlashKit;Octopus;
StartupNotify=true
EOF
chmod 644 "${STAGE_DIR}/usr/share/applications/octopus-agent-bridge.desktop"

# 4. Create DEBIAN Control File
cat <<EOF > "${STAGE_DIR}/DEBIAN/control"
Package: ${PKG_NAME}
Version: ${VERSION}
Architecture: ${ARCH}
Maintainer: Endri Susanto <endri@endrisusanto.my.id>
Section: utils
Priority: optional
Depends: libc6, libgtk-3-0, libwebkit2gtk-4.1-0 | libwebkit2gtk-4.0-37, libayatana-appindicator3-1, adb | android-tools-adb
Description: Distributed Provisioning Suite Desktop Bridge
 Native daemon connecting local ADB & Odin USB devices to Octopus Web Hub.
 Includes system tray support, auto silent updater, and local binary folder scanner.
EOF

# 5. Create postinst hook for icon cache update & udev permissions
cat <<'EOF' > "${STAGE_DIR}/DEBIAN/postinst"
#!/bin/sh
set -e
if which update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q || true
fi
if which gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q /usr/share/icons/hicolor || true
fi
mkdir -p /opt/flashkit/firmware
chmod 777 /opt/flashkit/firmware || true
exit 0
EOF
chmod 755 "${STAGE_DIR}/DEBIAN/postinst"

echo "==> [3/4] Building .deb package using dpkg-deb..."
mkdir -p "${DIST_DIR}"
dpkg-deb --build --root-owner-group "${STAGE_DIR}" "${DIST_DIR}/${DEB_NAME}"
rm -rf "${STAGE_DIR}"

DO_INSTALL=false
for arg in "$@"; do
    if [ "$arg" == "--install" ] || [ "$arg" == "-i" ]; then
        DO_INSTALL=true
    fi
done

echo "==> [4/4] Package built successfully!"
echo "--------------------------------------------------------"
echo "Package File: ${DIST_DIR}/${DEB_NAME}"
echo "File Size:    $(du -h "${DIST_DIR}/${DEB_NAME}" | cut -f1)"
echo "--------------------------------------------------------"

if [ "$DO_INSTALL" = true ]; then
    echo "==> [Auto-Install] Menginstall ${DEB_NAME} ke sistem..."
    sudo dpkg -i "${DIST_DIR}/${DEB_NAME}"
    echo "==> [Success] Aplikasi terinstall! Jalankan dengan perintah:"
    echo "    octopus-agent-bridge"
else
    echo "Untuk install di Ubuntu ini, jalankan:"
    echo "  sudo dpkg -i ${DIST_DIR}/${DEB_NAME}"
    echo "Atau jalankan ulang script dengan flag: ./build-deb.sh --install"
fi
echo "--------------------------------------------------------"
