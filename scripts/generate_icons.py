import os
from PIL import Image, ImageOps

input_path = "/home/endri-pro/.gemini/antigravity-ide/brain/88da2ef1-04fb-4e4b-923f-e682534e74bc/.user_uploaded/media_1790387098714.png"
img = Image.open(input_path).convert("RGBA")
width, height = img.size

# Left side has the black logo on white background (0 to width//2)
# Crop the left half
left_half = img.crop((0, 0, width // 2, height))

# Convert white background to transparent for the black logo
# Find bounding box of the black strokes
# Grayscale threshold
gray = left_half.convert("L")
# Invert so black logo becomes white (foreground)
inv = ImageOps.invert(gray)
# Get bounding box of foreground
bbox = inv.getbbox()

if bbox:
    # Add small padding
    pad = 20
    x0 = max(0, bbox[0] - pad)
    y0 = max(0, bbox[1] - pad)
    x1 = min(left_half.width, bbox[2] + pad)
    y1 = min(left_half.height, bbox[3] + pad)
    cropped_logo = left_half.crop((x0, y0, x1, y1))
    
    # Make a square canvas with transparent background
    size = max(cropped_logo.width, cropped_logo.height)
    square_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    offset = ((size - cropped_logo.width) // 2, (size - cropped_logo.height) // 2)
    square_img.paste(cropped_logo, offset)
    
    # Process transparency: turn near-white background to transparent
    datas = square_img.getdata()
    new_data = []
    for item in datas:
        # If pixel is very bright / white, make transparent
        if item[0] > 220 and item[1] > 220 and item[2] > 220:
            new_data.append((255, 255, 255, 0))
        else:
            # Keep the black stroke with smooth alpha
            alpha = int(255 - (item[0] + item[1] + item[2]) / 3)
            new_data.append((26, 26, 26, min(255, alpha * 2)))
    
    transparent_logo = Image.new("RGBA", square_img.size)
    transparent_logo.putdata(new_data)
    
    # Also create white-stroke version for dark mode / dark icon
    white_data = []
    for item in new_data:
        if item[3] > 0:
            white_data.append((240, 246, 252, item[3]))
        else:
            white_data.append((0, 0, 0, 0))
    white_logo = Image.new("RGBA", square_img.size)
    white_logo.putdata(white_data)

    # Save to web-hub/client/public
    web_public = "/home/endri-pro/dev/octopus/web-hub/client/public"
    os.makedirs(web_public, exist_ok=True)
    
    transparent_logo.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(web_public, "logo.png"))
    transparent_logo.resize((128, 128), Image.Resampling.LANCZOS).save(os.path.join(web_public, "logo-128.png"))
    white_logo.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(web_public, "logo-dark-mode.png"))
    
    # Save favicon.ico (multi-res)
    transparent_logo.save(
        os.path.join(web_public, "favicon.ico"),
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    )

    # Save to agent-bridge/icons
    bridge_icons = "/home/endri-pro/dev/octopus/agent-bridge/icons"
    os.makedirs(bridge_icons, exist_ok=True)
    
    # Create branded dark squircle app icon for desktop shortcut
    app_icon = Image.new("RGBA", (512, 512), (13, 17, 23, 255))
    logo_resized = white_logo.resize((360, 360), Image.Resampling.LANCZOS)
    app_icon.paste(logo_resized, (76, 76), logo_resized)
    
    app_icon.resize((32, 32), Image.Resampling.LANCZOS).save(os.path.join(bridge_icons, "32x32.png"))
    app_icon.resize((128, 128), Image.Resampling.LANCZOS).save(os.path.join(bridge_icons, "128x128.png"))
    app_icon.resize((256, 256), Image.Resampling.LANCZOS).save(os.path.join(bridge_icons, "128x128@2x.png"))
    app_icon.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(bridge_icons, "icon.png"))
    
    app_icon.save(
        os.path.join(bridge_icons, "icon.ico"),
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    )
    
    # Also save to agent-bridge/ui
    agent_ui = "/home/endri-pro/dev/octopus/agent-bridge/ui"
    os.makedirs(agent_ui, exist_ok=True)
    app_icon.resize((64, 64), Image.Resampling.LANCZOS).save(os.path.join(agent_ui, "app-logo.png"))
    
    print("[Success] All logos, favicons, and app shortcut icons generated successfully!")
