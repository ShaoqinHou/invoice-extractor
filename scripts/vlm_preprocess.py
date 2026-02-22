"""Preprocess page images for VLM OCR.

Pipeline:
1. Orientation detection (PP-LCNet_x1_0_doc_ori via PaddleX) — detect 0/90/180/270, auto-rotate
2. Unwarping (UVDoc via PaddleX) — flatten curved/folded documents
3. Format + Resize (Pillow) — JPEG q90, only scale down if >5MB

Models are loaded ONCE and reused for all pages.

Usage: python vlm_preprocess.py <image_dir>

Outputs preprocessed images as page_N_pre.jpg in the same directory.
JSON to stdout: { "pages": [{ "page": 1, "file": "page_1_pre.jpg", "rotated": 0, "unwarped": true }] }
"""
import json
import os
import sys
import io

os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import warnings
warnings.filterwarnings("ignore", category=RuntimeWarning)
warnings.filterwarnings("ignore", category=DeprecationWarning)

import logging
logging.getLogger("ppocr").setLevel(logging.ERROR)
logging.getLogger("paddlex").setLevel(logging.ERROR)
logging.getLogger("paddle").setLevel(logging.ERROR)

MAX_JPEG_BYTES = 5 * 1024 * 1024  # 5MB VLM API limit


def save_capped_jpeg(img, out_path: str, quality: int = 90) -> None:
    """Save PIL Image as JPEG, scaling down progressively if >5MB."""
    from PIL import Image

    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)

    while buf.tell() > MAX_JPEG_BYTES:
        w, h = img.size
        img = img.resize((int(w * 0.85), int(h * 0.85)), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality)

    with open(out_path, "wb") as f:
        f.write(buf.getvalue())


def preprocess(image_dir: str) -> dict:
    """Run orientation + unwarping + JPEG conversion on all page images."""
    from paddlex import create_model
    from PIL import Image
    import numpy as np

    # Load models once
    sys.stderr.write("vlm_preprocess: loading orientation model...\n")
    sys.stderr.flush()
    ori_model = create_model("PP-LCNet_x1_0_doc_ori")

    sys.stderr.write("vlm_preprocess: loading UVDoc model...\n")
    sys.stderr.flush()
    unwarp_model = create_model("UVDoc")

    sys.stderr.write("vlm_preprocess: models loaded\n")
    sys.stderr.flush()

    # Find page images in order
    images = []
    page_num = 1
    while True:
        img_path = os.path.join(image_dir, f"page_{page_num}.png")
        if not os.path.exists(img_path):
            break
        images.append(img_path)
        page_num += 1

    if not images:
        raise FileNotFoundError(f"No page_*.png images found in {image_dir}")

    pages = []
    for img_path in images:
        page_idx = len(pages) + 1
        info = {"page": page_idx, "rotated": 0, "unwarped": False}

        try:
            # Step 1: Detect orientation and auto-rotate
            ori_result = next(ori_model.predict(input=img_path))
            angle = int(ori_result["label_names"][0])
            info["rotated"] = angle

            img = Image.open(img_path)
            if angle != 0:
                # PIL rotate is counter-clockwise; to correct a document
                # detected as rotated N° CW, we rotate N° CCW
                img = img.rotate(angle, expand=True)
                sys.stderr.write(f"  page {page_idx}: rotated {angle}° to correct\n")
                sys.stderr.flush()

            # Step 2: Unwarp curved/folded documents
            try:
                # UVDoc expects a file path — save rotated image to temp file
                if angle != 0:
                    import tempfile
                    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                        tmp_path = tmp.name
                    img.save(tmp_path)
                    unwarp_input = tmp_path
                else:
                    unwarp_input = img_path
                    tmp_path = None

                unwarp_result = next(unwarp_model.predict(input=unwarp_input))
                doctr_img = unwarp_result["doctr_img"]  # numpy ndarray (H, W, 3) BGR

                if isinstance(doctr_img, np.ndarray):
                    # BGR -> RGB for PIL
                    img = Image.fromarray(doctr_img[:, :, ::-1])
                    info["unwarped"] = True
                    sys.stderr.write(f"  page {page_idx}: unwarped\n")
                    sys.stderr.flush()

                if tmp_path:
                    os.unlink(tmp_path)

            except Exception as e:
                sys.stderr.write(f"  page {page_idx}: unwarping skipped ({e})\n")
                sys.stderr.flush()

            # Step 3: Convert to JPEG q90, cap at 5MB
            out_file = f"page_{page_idx}_pre.jpg"
            out_path = os.path.join(image_dir, out_file)
            save_capped_jpeg(img, out_path)
            info["file"] = out_file

            size_kb = os.path.getsize(out_path) / 1024
            sys.stderr.write(f"  page {page_idx}: saved {out_file} ({size_kb:.0f}KB)\n")
            sys.stderr.flush()

        except Exception as e:
            # Fallback: just convert original to JPEG
            sys.stderr.write(f"  page {page_idx}: preprocessing failed ({e}), using fallback\n")
            sys.stderr.flush()
            img = Image.open(img_path)
            out_file = f"page_{page_idx}_pre.jpg"
            out_path = os.path.join(image_dir, out_file)
            save_capped_jpeg(img, out_path)
            info["file"] = out_file

        pages.append(info)

    return {"pages": pages}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python vlm_preprocess.py <image_dir>"}), file=sys.stderr)
        sys.exit(1)

    image_dir = sys.argv[1]
    if not os.path.isdir(image_dir):
        print(json.dumps({"error": f"Directory not found: {image_dir}"}), file=sys.stderr)
        sys.exit(1)

    try:
        data = preprocess(image_dir)
        print(json.dumps(data, ensure_ascii=False))
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
