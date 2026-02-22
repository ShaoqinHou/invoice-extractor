"""Run PaddleOCR PP-StructureV3 on pre-rendered page images.

Accepts a directory of page images (from gs_render.py or image_to_pages.py).
PP-StructureV3 handles deskewing/unwarping internally, then extracts text with
bounding box positions. We use the position data to reconstruct a clean text
layout — items and prices on the same line — for the downstream LLM.

The model is loaded ONCE and reused for all pages.

Usage: python paddle_ocr.py <image_dir>

Outputs JSON to stdout:
{
  "fullText": "clean formatted text ...",
  "pages": ["page1 text", ...],
  "totalPages": N
}
"""
import json
import os
import sys

# Suppress OpenMP duplicate library warning
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import warnings
warnings.filterwarnings("ignore", category=RuntimeWarning)
warnings.filterwarnings("ignore", category=DeprecationWarning)

import logging
logging.getLogger("ppocr").setLevel(logging.ERROR)
logging.getLogger("paddlex").setLevel(logging.ERROR)
logging.getLogger("paddle").setLevel(logging.ERROR)

# Minimum confidence to include a line
MIN_CONFIDENCE = 0.30


def build_clean_text(fragments: list[tuple[str, int, int]]) -> str:
    """Build clean formatted text from (text, y, x) fragments.

    Groups fragments by y-position (same-row items), then joins them
    into single lines separated by spaces. This produces a document
    where items and their prices appear on the same line — exactly
    what an LLM expects for invoice parsing.
    """
    if not fragments:
        return "[No text detected]"

    # Sort by y then x
    fragments.sort(key=lambda f: (f[1], f[2]))

    # Group into rows: fragments within ROW_THRESHOLD pixels of each other
    ROW_THRESHOLD = 50
    rows: list[list[tuple[str, int, int]]] = []
    for text, y, x in fragments:
        if rows and abs(y - rows[-1][0][1]) < ROW_THRESHOLD:
            rows[-1].append((text, y, x))
        else:
            rows.append([(text, y, x)])

    # Sort each row by x-position, then join into single lines
    output_lines = []
    for row in rows:
        row.sort(key=lambda f: f[2])
        line = "    ".join(f[0] for f in row)
        output_lines.append(line)

    return "\n".join(output_lines)


def extract(image_dir: str) -> dict:
    """Run PaddleOCR on all page images, produce clean text.

    Uses the lightweight PaddleOCR class (det + rec only) instead of the
    heavy PPStructureV3 pipeline, which loads ~7 models and needs >4GB RAM.
    """
    from paddleocr import PaddleOCR
    from PIL import Image

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

    # Load PaddleOCR ONCE for all pages
    ocr = PaddleOCR(lang="en", use_angle_cls=True)

    page_texts: list[str] = []

    for img_path in images:
        try:
            result = ocr.ocr(img_path)
            if not result or not result[0]:
                page_texts.append("[No OCR results]")
                continue

            ocr_result = result[0]

            # PaddleOCR v3+ returns OCRResult dict with rec_texts, rec_scores, dt_polys
            # Older versions returned [[box, (text, score)], ...]
            if hasattr(ocr_result, "keys") and "rec_texts" in ocr_result:
                rec_texts = ocr_result["rec_texts"]
                rec_scores = ocr_result["rec_scores"]
                dt_polys = ocr_result["dt_polys"]
                fragments = []
                for text, score, poly in zip(rec_texts, rec_scores, dt_polys):
                    if score < MIN_CONFIDENCE or not text.strip():
                        continue
                    x_min = int(min(p[0] for p in poly))
                    y_min = int(min(p[1] for p in poly))
                    fragments.append((text.strip(), y_min, x_min))
            else:
                # Legacy format: [[box, (text, score)], ...]
                fragments = []
                for line in ocr_result:
                    box, (text, score) = line
                    if score < MIN_CONFIDENCE or not text.strip():
                        continue
                    x_min = int(min(p[0] for p in box))
                    y_min = int(min(p[1] for p in box))
                    fragments.append((text.strip(), y_min, x_min))

            page_text = build_clean_text(fragments)
            page_texts.append(page_text)

        except Exception as e:
            page_texts.append(f"[PaddleOCR extraction failed: {e}]")

    full_text = "\n\n---\n\n".join(page_texts)

    return {
        "fullText": full_text,
        "pages": page_texts,
        "totalPages": len(images),
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python paddle_ocr.py <image_dir>"}), file=sys.stderr)
        sys.exit(1)

    image_dir = sys.argv[1]
    if not os.path.isdir(image_dir):
        print(json.dumps({"error": f"Directory not found: {image_dir}"}), file=sys.stderr)
        sys.exit(1)

    try:
        data = extract(image_dir)
        print(json.dumps(data, ensure_ascii=False))
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
