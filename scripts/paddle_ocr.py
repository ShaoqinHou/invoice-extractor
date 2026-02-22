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


def build_clean_text(res: dict, img_width: int, img_height: int) -> str:
    """Build clean formatted text from OCR results.

    Groups OCR lines by y-position (same-row items), then joins them
    into single lines separated by spaces. This produces a document
    where items and their prices appear on the same line — exactly
    what an LLM expects for invoice parsing.
    """
    texts = res.get("rec_texts", [])
    scores = res.get("rec_scores", [])
    boxes = res.get("rec_boxes", [])
    if hasattr(boxes, "tolist"):
        boxes = boxes.tolist()

    # Collect valid text fragments with positions
    fragments = []
    for text, score, box in zip(texts, scores, boxes):
        if score < MIN_CONFIDENCE or not text.strip():
            continue
        x_min, y_min = int(box[0]), int(box[1])
        fragments.append((text.strip(), y_min, x_min))

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
        # Join fragments on the same row with spaces
        line = "    ".join(f[0] for f in row)
        output_lines.append(line)

    return "\n".join(output_lines)


def extract(image_dir: str) -> dict:
    """Run PP-StructureV3 on all page images, produce clean text."""
    from paddleocr import PPStructureV3
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

    # Load PP-StructureV3 ONCE for all pages
    pipeline = PPStructureV3(
        use_doc_orientation_classify=True,
        use_doc_unwarping=True,
        use_table_recognition=False,
        use_formula_recognition=False,
        use_seal_recognition=False,
        use_chart_recognition=False,
    )

    page_texts: list[str] = []

    for img_path in images:
        try:
            with Image.open(img_path) as img:
                img_w, img_h = img.size

            results = list(pipeline.predict(input=img_path))
            if not results:
                page_texts.append("[No OCR results]")
                continue

            res = results[0].json
            ocr_res = res["res"]["overall_ocr_res"]
            page_text = build_clean_text(ocr_res, img_w, img_h)
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
