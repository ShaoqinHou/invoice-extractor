"""Persistent pymupdf4llm worker — reads requests from stdin, writes NDJSON to stdout.

Stays alive between requests so the Python interpreter and libraries remain loaded.
Each line on stdin is a JSON object: {"pdfPath": "/abs/path.pdf"}
Each response is a JSON object on stdout (one line per response).

Usage: python pymupdf_worker.py
  (reads from stdin, writes to stdout — managed by WorkerManager.ts)
"""
import json
import os
import sys

os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

# Suppress pymupdf4llm's "Consider using pymupdf_layout" message
import io
import contextlib
with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
    import pymupdf4llm
import fitz  # PyMuPDF

# Signal ready
sys.stderr.write("pymupdf_worker ready\n")
sys.stderr.flush()


def extract(pdf_path: str) -> dict:
    """Extract structured text from a PDF using pymupdf4llm."""
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    doc.close()

    full_md = pymupdf4llm.to_markdown(pdf_path, table_strategy="lines")

    page_markdowns: list[str] = []
    for page_num in range(total_pages):
        try:
            page_md = pymupdf4llm.to_markdown(
                pdf_path,
                pages=[page_num],
                table_strategy="lines",
            )
            page_markdowns.append(page_md.strip())
        except Exception:
            page_markdowns.append("")

    return {
        "fullText": full_md,
        "pages": page_markdowns,
        "totalPages": total_pages,
    }


# Main loop: read one JSON request per line from stdin
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue

    try:
        request = json.loads(line)
        pdf_path = request.get("pdfPath", "")

        if not pdf_path or not os.path.exists(pdf_path):
            result = {"error": f"File not found: {pdf_path}"}
        else:
            result = extract(pdf_path)

    except Exception as e:
        result = {"error": str(e)}

    # Write one JSON line to stdout, flush immediately
    sys.stdout.write(json.dumps(result, ensure_ascii=False) + "\n")
    sys.stdout.flush()
