import os
from PIL import Image

src_path = "/home/endri-pro/.gemini/antigravity-ide/brain/88da2ef1-04fb-4e4b-923f-e682534e74bc/.user_uploaded/media_1790388369381.png"
logo = Image.open(src_path).convert("RGBA")

# Target directories
web_public = "/home/endri-pro/dev/octopus/web-hub/client/public"
bridge_icons = "/home/endri-pro/dev/octopus/agent-bridge/icons"
agent_ui = "/home/endri-pro/dev/octopus/agent-bridge/ui"

os.makedirs(web_public, exist_ok=True)
os.makedirs(bridge_icons, exist_ok=True)
os.makedirs(agent_ui, exist_ok=True)

# 1. Web Hub Public Assets
logo.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(web_public, "logo.png"))
logo.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(web_public, "logo-light.png"))
logo.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(web_public, "logo-accent.png"))
logo.resize((128, 128), Image.Resampling.LANCZOS).save(os.path.join(web_public, "logo-128.png"))

# Favicon ICO
logo.save(
    os.path.join(web_public, "favicon.ico"),
    format="ICO",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
)

# 2. Tauri Desktop App Icons
logo.resize((32, 32), Image.Resampling.LANCZOS).save(os.path.join(bridge_icons, "32x32.png"))
logo.resize((128, 128), Image.Resampling.LANCZOS).save(os.path.join(bridge_icons, "128x128.png"))
logo.resize((256, 256), Image.Resampling.LANCZOS).save(os.path.join(bridge_icons, "128x128@2x.png"))
logo.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(bridge_icons, "icon.png"))

logo.save(
    os.path.join(bridge_icons, "icon.ico"),
    format="ICO",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
)

# 3. Agent Bridge UI Logo
logo.resize((64, 64), Image.Resampling.LANCZOS).save(os.path.join(agent_ui, "app-logo.png"))

print("[Done] Updated all Octopus icons across Web Hub, Favicon, Tauri, and Agent Bridge UI!")
