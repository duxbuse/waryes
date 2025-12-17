import os
import glob
from PIL import Image

def fix_icons(root_dir):
    print(f"Scanning {root_dir}...")
    # Find all png files recursively
    files = glob.glob(os.path.join(root_dir, "**/*.png"), recursive=True)
    
    fixed_count = 0
    transparent_count = 0
    
    for file_path in files:
        try:
            with open(file_path, "rb") as f:
                header = f.read(4)
            
            # 1. Fix JPEG disguised as PNG
            if header.startswith(b'\xff\xd8\xff'):
                print(f"Detected JPEG masked as PNG: {file_path}")
                img = Image.open(file_path)
                img.load()
                img.save(file_path, "PNG")
                print(f"Converted to valid PNG: {file_path}")
                
                # Check for white background and fix immediately
                img = Image.open(file_path) # Re-open as PNG
                if make_transparent(img, file_path):
                    transparent_count += 1

                # Remove .import file
                import_file = file_path + ".import"
                if os.path.exists(import_file):
                    os.remove(import_file)
                    print(f"Removed import file: {import_file}")
                
                fixed_count += 1
            
            # 2. Check valid PNGs for white background (that might have been missed or previously fixed)
            elif header.startswith(b'\x89PNG'):
                img = Image.open(file_path)
                if img.mode == 'RGB': # Only check opaque images
                     if make_transparent(img, file_path):
                         transparent_count += 1
                         # Remove .import file to force re-import with new alpha
                         import_file = file_path + ".import"
                         if os.path.exists(import_file):
                             os.remove(import_file)
                             print(f"Removed import file (transparency update): {import_file}")

        except Exception as e:
            print(f"Error processing {file_path}: {e}")

    print(f"Finished. Fixed {fixed_count} corrupt files. Added transparency to {transparent_count} files.")

def make_transparent(img, file_path):
    """
    Checks if top-left pixel is white. If so, makes white pixels transparent.
    Returns True if changed, False otherwise.
    """
    img = img.convert("RGBA")
    datas = img.getdata()
    
    # Check top-left pixel (or just assume if it's RGB and we are running this)
    # But let's be safe.
    # Note: getdata() returns a sequence, checking 0 index is top-left.
    bg_color = datas[0]
    
    # Check if white (or very close to white to handle JPEG artifacts)
    # (255, 255, 255, 255) because we converted to RGBA
    if bg_color[0] > 240 and bg_color[1] > 240 and bg_color[2] > 240:
        newData = []
        for item in datas:
            # If pixel is white-ish, make it transparent
            if item[0] > 240 and item[1] > 240 and item[2] > 240:
                newData.append((255, 255, 255, 0))
            else:
                newData.append(item)
        
        img.putdata(newData)
        img.save(file_path, "PNG")
        print(f"Removed white background: {file_path}")
        return True
    
    return False

if __name__ == "__main__":
    # Adjust path to your project structure
    target_dir = r"C:\Users\duxbu\OneDrive\Documents\code\waryes\game\assets\icons\units"
    fix_icons(target_dir)
