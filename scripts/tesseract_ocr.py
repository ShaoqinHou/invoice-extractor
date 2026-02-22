"""Run Tesseract OCR on pre-rendered page images.

Accepts a directory of page images (from gs_render.py) and returns
extracted text with per-page confidence scores.

Usage: python tesseract_ocr.py <image_dir>

Outputs JSON to stdout:
{
  "fullText": "...",
  "pages": ["page1 text", "page2 text", ...],
  "totalPages": N,
  "confidence": {
    "mean": 85.2,
    "per_page": [87.1, 83.3],
    "low_confidence_words": 12,
    "total_words": 230
  }
}
"""
import json
import os
import sys

import pytesseract
from PIL import Image


def ocr_with_confidence(image_path: str) -> tuple[str, float, int, int]:
    """Run Tesseract OCR on an image, returning text and confidence metrics.

    Returns (text, mean_confidence, low_confidence_count, total_word_count).
    """
    img = Image.open(image_path)

    # Get per-word data with confidence scores
    data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)

    confidences: list[int] = []
    low_count = 0
    total_words = 0

    for i, conf in enumerate(data["conf"]):
        text = data["text"][i].strip()
        if not text:
            continue
        # Tesseract returns -1 for non-text blocks
        if conf == -1:
            continue

        total_words += 1
        confidences.append(conf)
        if conf < 60:
            low_count += 1

    mean_conf = sum(confidences) / len(confidences) if confidences else 0.0

    # Also get the plain text output (better formatted than reconstructing from data)
    plain_text = pytesseract.image_to_string(img).strip()

    return plain_text, mean_conf, low_count, total_words


def extract(image_dir: str) -> dict:
    """OCR all page images in directory, return text with confidence."""
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

    page_texts: list[str] = []
    page_confidences: list[float] = []
    total_low = 0
    total_words = 0

    for img_path in images:
        text, conf, low, words = ocr_with_confidence(img_path)
        page_texts.append(text)
        page_confidences.append(round(conf, 1))
        total_low += low
        total_words += words

    all_confs = [c for c in page_confidences if c > 0]
    mean_conf = sum(all_confs) / len(all_confs) if all_confs else 0.0

    return {
        "fullText": "\n\n---\n\n".join(page_texts),
        "pages": page_texts,
        "totalPages": len(images),
        "confidence": {
            "mean": round(mean_conf, 1),
            "per_page": page_confidences,
            "low_confidence_words": total_low,
            "total_words": total_words,
        },
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python tesseract_ocr.py <image_dir>"}), file=sys.stderr)
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
