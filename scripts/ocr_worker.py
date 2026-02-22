"""Persistent OCR worker — Tesseract first, PaddleOCR on demand.

Reads requests from stdin (NDJSON), writes results to stdout.
PaddleOCR model loads lazily on first need and stays in memory.

Request format:
{
  "imageDir": "/abs/path/to/page_images",
  "textLayerRef": "optional text layer for cross-reference"
}

Response format:
{
  "fullText": "...",
  "pages": ["page1", ...],
  "totalPages": N,
  "ocrTier": 2 or 3,
  "confidence": {...}  (when tier 2)
}

Usage: python ocr_worker.py
  (reads from stdin, writes to stdout — managed by WorkerManager.ts)
"""
import json
import os
import sys

os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import warnings
warnings.filterwarnings("ignore", category=RuntimeWarning)
warnings.filterwarnings("ignore", category=DeprecationWarning)

import logging
logging.getLogger("ppocr").setLevel(logging.ERROR)
logging.getLogger("paddlex").setLevel(logging.ERROR)
logging.getLogger("paddle").setLevel(logging.ERROR)

import pytesseract
from PIL import Image

# PaddleOCR pipeline — loaded lazily on first need
_paddle_pipeline = None

# Quality thresholds (same as extract.ts logic)
MIN_CONFIDENCE = 80
MAX_LOW_CONFIDENCE_RATIO = 0.10
MIN_TEXT_LENGTH = 50
MIN_NUMBER_MATCH_RATIO = 0.5
MIN_PADDLE_CONFIDENCE = 0.30

# Signal ready
sys.stderr.write("ocr_worker ready\n")
sys.stderr.flush()


def find_page_images(image_dir: str) -> list[str]:
    """Find page_N.png images in order."""
    images = []
    page_num = 1
    while True:
        img_path = os.path.join(image_dir, f"page_{page_num}.png")
        if not os.path.exists(img_path):
            break
        images.append(img_path)
        page_num += 1
    return images


def run_tesseract(image_dir: str) -> dict:
    """Run Tesseract OCR on page images, return text + confidence."""
    images = find_page_images(image_dir)
    if not images:
        raise FileNotFoundError(f"No page_*.png images found in {image_dir}")

    page_texts: list[str] = []
    page_confidences: list[float] = []
    total_low = 0
    total_words = 0

    for img_path in images:
        img = Image.open(img_path)
        data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)

        confidences: list[int] = []
        low_count = 0
        words = 0

        for i, conf in enumerate(data["conf"]):
            text = data["text"][i].strip()
            if not text or conf == -1:
                continue
            words += 1
            confidences.append(conf)
            if conf < 60:
                low_count += 1

        mean_conf = sum(confidences) / len(confidences) if confidences else 0.0
        plain_text = pytesseract.image_to_string(img).strip()

        page_texts.append(plain_text)
        page_confidences.append(round(mean_conf, 1))
        total_low += low_count
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


def extract_numbers(text: str) -> list[str]:
    """Extract distinct number-like patterns for cross-referencing."""
    import re
    matches = re.findall(r"\d[\d,.\-/]+\d", text)
    return list(set(m.replace("$", "").replace(",", "") for m in matches))


def assess_quality(tesseract_result: dict, text_layer_ref: str | None) -> dict:
    """Assess Tesseract quality — same logic as extract.ts assessQuality."""
    conf = tesseract_result["confidence"]

    if conf["mean"] < MIN_CONFIDENCE:
        return {"accept": False, "reason": f"confidence {conf['mean']}% < {MIN_CONFIDENCE}%"}

    if conf["total_words"] > 0:
        low_ratio = conf["low_confidence_words"] / conf["total_words"]
        if low_ratio > MAX_LOW_CONFIDENCE_RATIO:
            pct = round(low_ratio * 100)
            return {"accept": False, "reason": f"{pct}% low-confidence words > {MAX_LOW_CONFIDENCE_RATIO * 100}%"}

    if len(tesseract_result["fullText"].strip()) < MIN_TEXT_LENGTH:
        return {"accept": False, "reason": f"text too short ({len(tesseract_result['fullText'].strip())} < {MIN_TEXT_LENGTH})"}

    if text_layer_ref and len(text_layer_ref.strip()) > 100:
        tl_numbers = extract_numbers(text_layer_ref)
        ts_numbers = extract_numbers(tesseract_result["fullText"])
        if len(tl_numbers) > 3:
            matched = len([n for n in tl_numbers if n in ts_numbers])
            match_ratio = matched / len(tl_numbers)
            if match_ratio < MIN_NUMBER_MATCH_RATIO:
                return {"accept": False, "reason": f"number cross-ref {matched}/{len(tl_numbers)} ({round(match_ratio * 100)}%)"}

    return {"accept": True, "reason": f"confidence {conf['mean']}%"}


def run_paddle(image_dir: str) -> dict:
    """Run PaddleOCR on page images. Loads model lazily.

    Uses the lightweight PaddleOCR class (det + rec only) instead of the
    heavy PPStructureV3 pipeline, which loads ~7 models and needs >4GB RAM.
    """
    global _paddle_pipeline

    if _paddle_pipeline is None:
        sys.stderr.write("ocr_worker: loading PaddleOCR model...\n")
        sys.stderr.flush()
        from paddleocr import PaddleOCR
        _paddle_pipeline = PaddleOCR(lang="en", use_angle_cls=True)
        sys.stderr.write("ocr_worker: PaddleOCR model loaded\n")
        sys.stderr.flush()

    images = find_page_images(image_dir)
    if not images:
        raise FileNotFoundError(f"No page_*.png images found in {image_dir}")

    page_texts: list[str] = []

    for img_path in images:
        try:
            result = _paddle_pipeline.ocr(img_path)
            if not result or not result[0]:
                page_texts.append("[No OCR results]")
                continue

            ocr_result = result[0]

            # PaddleOCR v3+ returns OCRResult dict with rec_texts, rec_scores, dt_polys
            # Older versions returned [[box, (text, score)], ...]
            fragments = []
            if hasattr(ocr_result, "keys") and "rec_texts" in ocr_result:
                for text, score, poly in zip(ocr_result["rec_texts"], ocr_result["rec_scores"], ocr_result["dt_polys"]):
                    if score < MIN_PADDLE_CONFIDENCE or not text.strip():
                        continue
                    x_min = int(min(p[0] for p in poly))
                    y_min = int(min(p[1] for p in poly))
                    fragments.append((text.strip(), y_min, x_min))
            else:
                for line in ocr_result:
                    box, (text, score) = line
                    if score < MIN_PADDLE_CONFIDENCE or not text.strip():
                        continue
                    x_min = int(min(p[0] for p in box))
                    y_min = int(min(p[1] for p in box))
                    fragments.append((text.strip(), y_min, x_min))

            if not fragments:
                page_texts.append("[No text detected]")
                continue

            page_text = build_clean_text_from_fragments(fragments)
            page_texts.append(page_text)
        except Exception as e:
            page_texts.append(f"[PaddleOCR failed: {e}]")

    return {
        "fullText": "\n\n---\n\n".join(page_texts),
        "pages": page_texts,
        "totalPages": len(images),
    }


def build_clean_text_from_fragments(fragments: list[tuple[str, int, int]]) -> str:
    """Build clean formatted text from (text, y, x) fragments.

    Groups fragments by y-position (same-row items), then joins them
    into single lines separated by spaces.
    """
    if not fragments:
        return "[No text detected]"

    fragments.sort(key=lambda f: (f[1], f[2]))

    ROW_THRESHOLD = 50
    rows: list[list[tuple[str, int, int]]] = []
    for text, y, x in fragments:
        if rows and abs(y - rows[-1][0][1]) < ROW_THRESHOLD:
            rows[-1].append((text, y, x))
        else:
            rows.append([(text, y, x)])

    output_lines = []
    for row in rows:
        row.sort(key=lambda f: f[2])
        line = "    ".join(f[0] for f in row)
        output_lines.append(line)

    return "\n".join(output_lines)


# Main loop: read one JSON request per line from stdin
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue

    try:
        request = json.loads(line)
        image_dir = request.get("imageDir", "")
        text_layer_ref = request.get("textLayerRef")

        if not image_dir or not os.path.isdir(image_dir):
            result = {"error": f"Directory not found: {image_dir}"}
            sys.stdout.write(json.dumps(result, ensure_ascii=False) + "\n")
            sys.stdout.flush()
            continue

        # Step 1: Try Tesseract
        tesseract_result = run_tesseract(image_dir)
        quality = assess_quality(tesseract_result, text_layer_ref)

        if quality["accept"]:
            result = {
                "fullText": tesseract_result["fullText"],
                "pages": tesseract_result["pages"],
                "totalPages": tesseract_result["totalPages"],
                "ocrTier": 2,
                "confidence": tesseract_result["confidence"],
                "qualityReason": quality["reason"],
            }
        else:
            # Step 2: Escalate to PaddleOCR (model loads on first use, stays loaded)
            sys.stderr.write(f"ocr_worker: Tesseract rejected ({quality['reason']}), escalating to PaddleOCR\n")
            sys.stderr.flush()
            paddle_result = run_paddle(image_dir)
            result = {
                "fullText": paddle_result["fullText"],
                "pages": paddle_result["pages"],
                "totalPages": paddle_result["totalPages"],
                "ocrTier": 3,
                "qualityReason": f"Tesseract rejected: {quality['reason']}",
            }

    except Exception as e:
        result = {"error": str(e)}

    sys.stdout.write(json.dumps(result, ensure_ascii=False) + "\n")
    sys.stdout.flush()
