"""Convert an image file (HEIC, JPG, PNG, TIFF, BMP, WebP) to page images.

For image-based documents (receipts, scanned invoices), this normalizes the
input into the same page_N.png format that gs_render.py produces for PDFs.

HEIC/HEIF support:
- Primary: pillow-heif (fast, pure Python)
- Fallback: ffmpeg (handles complex HEIC with aux images that pillow-heif rejects)

Usage: python image_to_pages.py <image_path> [output_dir]

Outputs JSON to stdout:
{
  "image_dir": "/path/to/pages",
  "images": ["page_1.png"],
  "totalPages": 1
}
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

# Register HEIC/HEIF support if available
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

from PIL import Image


def convert_with_pillow(image_path: str, output_dir: str) -> bool:
    """Try to convert image with Pillow. Returns True on success."""
    try:
        img = Image.open(image_path)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        out_path = os.path.join(output_dir, "page_1.png")
        img.save(out_path, "PNG")
        return True
    except Exception:
        return False


def convert_with_ffmpeg(image_path: str, output_dir: str) -> bool:
    """Fallback: convert image with ffmpeg. Handles complex HEIC files."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return False

    out_path = os.path.join(output_dir, "page_1.png")
    try:
        # Try extracting the main image group first (for HEIC with tile grids)
        result = subprocess.run(
            [ffmpeg, "-y", "-i", image_path,
             "-map", "0:g:0", "-frames:v", "1", "-update", "1", out_path],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0 and os.path.exists(out_path) and os.path.getsize(out_path) > 1000:
            return True

        # Fallback: simple conversion without -map
        result = subprocess.run(
            [ffmpeg, "-y", "-i", image_path,
             "-frames:v", "1", "-update", "1", out_path],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0 and os.path.exists(out_path) and os.path.getsize(out_path) > 1000:
            return True

        return False
    except Exception:
        return False


def convert(image_path: str, output_dir: str | None = None) -> dict:
    """Convert an image file to a page PNG."""
    if output_dir is None:
        output_dir = tempfile.mkdtemp(prefix="img_pages_")
    else:
        os.makedirs(output_dir, exist_ok=True)

    # Try Pillow first, then ffmpeg fallback
    if not convert_with_pillow(image_path, output_dir):
        if not convert_with_ffmpeg(image_path, output_dir):
            raise RuntimeError(f"Cannot convert image: {image_path}. Install pillow-heif or ffmpeg for HEIC support.")

    return {
        "image_dir": output_dir,
        "images": ["page_1.png"],
        "totalPages": 1,
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python image_to_pages.py <image_path> [output_dir]"}), file=sys.stderr)
        sys.exit(1)

    image_path = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else None

    if not os.path.exists(image_path):
        print(json.dumps({"error": f"File not found: {image_path}"}), file=sys.stderr)
        sys.exit(1)

    try:
        data = convert(image_path, out_dir)
        print(json.dumps(data, ensure_ascii=False))
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
