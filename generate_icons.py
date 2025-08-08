#!/usr/bin/env python3
"""
Generate all required icon sizes for Chrome extension from a source PNG
"""

from PIL import Image
import os

def generate_icon_sizes(source_path, output_dir):
    """Generate all required Chrome extension icon sizes"""
    
    # Required sizes for Chrome extensions
    sizes = [16, 32, 48, 128]
    
    try:
        # Open the source image
        with Image.open(source_path) as img:
            print(f"Source image: {img.size[0]}x{img.size[1]} pixels")
            
            # Convert to RGBA if not already (for transparency support)
            if img.mode != 'RGBA':
                img = img.convert('RGBA')
            
            # Generate each required size
            for size in sizes:
                # Create high-quality resized image
                resized = img.resize((size, size), Image.Resampling.LANCZOS)
                
                # Save the resized icon
                output_path = os.path.join(output_dir, f"icon-{size}.png")
                resized.save(output_path, "PNG", optimize=True)
                print(f"Generated: icon-{size}.png ({size}x{size})")
            
            print("\n✅ All icon sizes generated successfully!")
            return True
            
    except Exception as e:
        print(f"❌ Error generating icons: {e}")
        return False

if __name__ == "__main__":
    icons_dir = "icons"
    source_file = os.path.join(icons_dir, "icon.png")
    
    if not os.path.exists(source_file):
        print(f"❌ Source icon not found: {source_file}")
        exit(1)
    
    # Generate all sizes
    success = generate_icon_sizes(source_file, icons_dir)
    
    if success:
        print("\n📋 Files created:")
        for size in [16, 32, 48, 128]:
            filepath = os.path.join(icons_dir, f"icon-{size}.png")
            if os.path.exists(filepath):
                file_size = os.path.getsize(filepath)
                print(f"  - icon-{size}.png ({file_size} bytes)")
    else:
        exit(1)
