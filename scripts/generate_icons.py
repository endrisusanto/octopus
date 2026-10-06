#!/usr/bin/env python3
# ponytail: Simple script to generate all app icons, tray icons, and favicons from logo-light.png
import os
import shutil
from PIL import Image

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_LOGO = os.path.join(ROOT_DIR, "web-hub/client/public/logo-light.png")

img = Image.open(SRC_LOGO).convert("RGBA")

# 1. Update web-hub/client/public and web-hub/server/public
for pub_rel in ["web-hub/client/public", "web-hub/server/public"]:
    pub_path = os.path.join(ROOT_DIR, pub_rel)
    os.makedirs(pub_path, exist_ok=True)
    img.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(pub_path, "logo.png"))
    img.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(pub_path, "logo-light.png"))
    img.resize((128, 128), Image.Resampling.LANCZOS).save(os.path.join(pub_path, "logo-128.png"))
    img.save(
        os.path.join(pub_path, "favicon.ico"),
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    )

# 2. Update agent-bridge/icons
bridge_icons = os.path.join(ROOT_DIR, "agent-bridge/icons")
os.makedirs(bridge_icons, exist_ok=True)

img.resize((32, 32), Image.Resampling.LANCZOS).save(os.path.join(bridge_icons, "32x32.png"))
img.resize((64, 64), Image.Resampling.LANCZOS).save(os.path.join(bridge_icons, "64x64.png"))
img.resize((128, 128), Image.Resampling.LANCZOS).save(os.path.join(bridge_icons, "128x128.png"))
img.resize((256, 256), Image.Resampling.LANCZOS).save(os.path.join(bridge_icons, "128x128@2x.png"))
img.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(bridge_icons, "icon.png"))

img.save(
    os.path.join(bridge_icons, "icon.ico"),
    format="ICO",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
)

# Square logos for bundle targets
square_sizes = {
    "Square30x30Logo.png": (30, 30),
    "Square44x44Logo.png": (44, 44),
    "Square71x71Logo.png": (71, 71),
    "Square89x89Logo.png": (89, 89),
    "Square107x107Logo.png": (107, 107),
    "Square142x142Logo.png": (142, 142),
    "Square150x150Logo.png": (150, 150),
    "Square284x284Logo.png": (284, 284),
    "Square310x310Logo.png": (310, 310),
    "StoreLogo.png": (50, 50),
}
for fname, size in square_sizes.items():
    img.resize(size, Image.Resampling.LANCZOS).save(os.path.join(bridge_icons, fname))

# 3. Update agent-bridge/ui
agent_ui = os.path.join(ROOT_DIR, "agent-bridge/ui")
os.makedirs(agent_ui, exist_ok=True)
img.resize((64, 64), Image.Resampling.LANCZOS).save(os.path.join(agent_ui, "app-logo.png"))

print("[Success] All icons and favicons successfully synced from logo-light.png!")
