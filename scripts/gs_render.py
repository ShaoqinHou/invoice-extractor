"""Render PDF pages to PNG images using Ghostscript.

Shared rendering step used by both Tesseract (tier 2) and Docling (tier 3).
Ghostscript is a full PostScript/PDF interpreter that correctly renders
Type3 fonts, broken encodings, and other edge cases.

Usage: python gs_render.py <pdf_path> [output_dir]

If output_dir is not specified, creates a temp directory.

Outputs JSON to stdout:
{
  "image_dir": "/path/to/rendered/pages",
  "images": ["page_1.png", "page_2.png", ...],
  "totalPages": N
}
"""
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile


DPI = 300


def find_ghostscript() -> str:
    """Find the Ghostscript executable."""
    if platform.system() == "Windows":
        candidates = ["gswin64c", "gswin32c", "gs"]
        for candidate in candidates:
            path = shutil.which(candidate)
            if path:
                return path
        for gs_dir in [r"C:\Program Files\gs", r"C:\Program Files (x86)\gs"]:
            if os.path.isdir(gs_dir):
                for sub in sorted(os.listdir(gs_dir), reverse=True):
                    exe = os.path.join(gs_dir, sub, "bin", "gswin64c.exe")
                    if os.path.isfile(exe):
                        return exe
                    exe = os.path.join(gs_dir, sub, "bin", "gswin32c.exe")
                    if os.path.isfile(exe):
                        return exe
        raise FileNotFoundError("Ghostscript not found. Install via: choco install ghostscript")
    else:
        path = shutil.which("gs")
        if path:
            return path
        raise FileNotFoundError("Ghostscript not found. Install via: apt install ghostscript")


def render(pdf_path: str, output_dir: str | None = None, dpi: int = DPI) -> dict:
    """Render PDF pages to PNG images."""
    if output_dir is None:
        output_dir = tempfile.mkdtemp(prefix="gs_render_")
    else:
        os.makedirs(output_dir, exist_ok=True)

    output_pattern = os.path.join(output_dir, "page_%d.png")
    gs_exe = find_ghostscript()

    cmd = [
        gs_exe,
        "-dNOPAUSE",
        "-dBATCH",
        "-dSAFER",
        "-sDEVICE=png16m",
        f"-r{dpi}",
        f"-sOutputFile={output_pattern}",
        pdf_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f"Ghostscript failed: {result.stderr}")

    images = []
    page_num = 1
    while True:
        filename = f"page_{page_num}.png"
        if not os.path.exists(os.path.join(output_dir, filename)):
            break
        images.append(filename)
        page_num += 1

    return {
        "image_dir": output_dir,
        "images": images,
        "totalPages": len(images),
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python gs_render.py <pdf_path> [output_dir]"}), file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else None

    if not os.path.exists(pdf_path):
        print(json.dumps({"error": f"File not found: {pdf_path}"}), file=sys.stderr)
        sys.exit(1)

    try:
        data = render(pdf_path, out_dir)
        print(json.dumps(data, ensure_ascii=False))
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
