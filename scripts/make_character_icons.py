import os
from PIL import Image, ImageOps, ImageFilter

src_path = "/home/endri-pro/.gemini/antigravity-ide/brain/88da2ef1-04fb-4e4b-923f-e682534e74bc/.user_uploaded/media_1790387098714.png"
orig = Image.open(src_path)
w, h = orig.size

# Extract left half (black logo on white)
left = orig.crop((0, 0, w // 2, h))
gray = left.convert("L")

# Invert to find exact character bounds
inv = ImageOps.invert(gray)
bbox = inv.getbbox() # (88, 0, 350, 350)

# Crop exactly to the character
char_crop = left.crop(bbox)
char_w, char_h = char_crop.size

# High-res supersampled canvas (1024x1024)
CANVAS_SIZE = 1024
PADDING = 128
target_h = CANVAS_SIZE - 2 * PADDING
target_w = int(char_w * (target_h / char_h))

resized_char = char_crop.resize((target_w, target_h), Image.Resampling.LANCZOS)
char_gray = resized_char.convert("L")

# Generate smooth alpha mask: black ink (value 0) -> alpha 255, white bg (value 255) -> alpha 0
# Create custom lookup table for smooth anti-aliased edges
alpha_mask = Image.eval(char_gray, lambda v: 255 - v if v < 235 else 0)
alpha_mask = alpha_mask.filter(ImageFilter.SMOOTH_MORE)

# 1. Dark character (for Light background): #161b22
dark_char = Image.new("RGBA", (target_w, target_h), (22, 27, 34, 0))
dark_solid = Image.new("RGBA", (target_w, target_h), (22, 27, 34, 255))
dark_char.paste(dark_solid, (0, 0), alpha_mask)

# 2. Light character (for Dark background): #f0f6fc
light_char = Image.new("RGBA", (target_w, target_h), (240, 246, 252, 0))
light_solid = Image.new("RGBA", (target_w, target_h), (240, 246, 252, 255))
light_char.paste(light_solid, (0, 0), alpha_mask)

# 3. Accent character (Sky Blue #58a6ff):
accent_char = Image.new("RGBA", (target_w, target_h), (88, 166, 255, 0))
accent_solid = Image.new("RGBA", (target_w, target_h), (88, 166, 255, 255))
accent_char.paste(accent_solid, (0, 0), alpha_mask)

# Center onto square 1024x1024 transparent canvas
def make_square(char_img):
    sq = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    x = (CANVAS_SIZE - target_w) // 2
    y = (CANVAS_SIZE - target_h) // 2
    sq.paste(char_img, (x, y), char_img)
    return sq

dark_logo_1024 = make_square(dark_char)
light_logo_1024 = make_square(light_char)
accent_logo_1024 = make_square(accent_char)

# 4. App Icon with sleek dark squircle background for Desktop Shortcuts
app_icon_1024 = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (13, 17, 23, 255))
# Paste light character with 15% inner padding
logo_scale = 0.8
scaled_w = int(target_w * logo_scale)
scaled_h = int(target_h * logo_scale)
scaled_char = light_char.resize((scaled_w, scaled_h), Image.Resampling.LANCZOS)
app_icon_1024.paste(
    scaled_char,
    ((CANVAS_SIZE - scaled_w) // 2, (CANVAS_SIZE - scaled_h) // 2),
    scaled_char
)

# Export Web Hub Public Assets
web_public = "/home/endri-pro/dev/octopus/web-hub/client/public"
os.makedirs(web_public, exist_ok=True)

dark_logo_1024.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(web_public, "logo.png"))
light_logo_1024.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(web_public, "logo-light.png"))
accent_logo_1024.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(web_public, "logo-accent.png"))
accent_logo_1024.resize((128, 128), Image.Resampling.LANCZOS).save(os.path.join(web_public, "logo-128.png"))

# Favicon ICO
app_icon_1024.save(
    os.path.join(web_public, "favicon.ico"),
    format="ICO",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
)

# Export Tauri Desktop App Icons
bridge_icons = "/home/endri-pro/dev/octopus/agent-bridge/icons"
os.makedirs(bridge_icons, exist_ok=True)

app_icon_1024.resize((32, 32), Image.Resampling.LANCZOS).save(os.path.join(bridge_icons, "32x32.png"))
app_icon_1024.resize((128, 128), Image.Resampling.LANCZOS).save(os.path.join(bridge_icons, "128x128.png"))
app_icon_1024.resize((256, 256), Image.Resampling.LANCZOS).save(os.path.join(bridge_icons, "128x128@2x.png"))
app_icon_1024.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(bridge_icons, "icon.png"))

app_icon_1024.save(
    os.path.join(bridge_icons, "icon.ico"),
    format="ICO",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
)

# Bridge UI Logo
agent_ui = "/home/endri-pro/dev/octopus/agent-bridge/ui"
os.makedirs(agent_ui, exist_ok=True)
app_icon_1024.resize((64, 64), Image.Resampling.LANCZOS).save(os.path.join(agent_ui, "app-logo.png"))

print("[Done] Octopus mascot character assets generated across Web UI, Favicon, and Tauri App Icons!")
