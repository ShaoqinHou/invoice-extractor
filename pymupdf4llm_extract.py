"""Extract structured text from a PDF using pymupdf4llm (text-layer, no OCR).

Fast text-layer extraction that preserves table structure via PyMuPDF's
table detection. No image rendering, no OCR — reads the PDF text directly.

Usage: python pymupdf4llm_extract.py <pdf_path>

Outputs JSON to stdout (same format as docling_image_extract.py):
{
  "fullText": "... markdown with tables ...",
  "pages": ["page1 markdown", "page2 markdown", ...],
  "totalPages": N
}
"""
import json
import os
import sys

os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

# Suppress pymupdf4llm's "Consider using pymupdf_layout" message on stdout/stderr
import io
import contextlib
with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
    import pymupdf4llm
import fitz  # PyMuPDF


def extract(pdf_path: str) -> dict:
    """Extract structured text from a PDF using pymupdf4llm."""
    # Get total page count
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    doc.close()

    # Extract full markdown with table detection
    full_md = pymupdf4llm.to_markdown(pdf_path, table_strategy="lines")

    # Also extract per-page markdown
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


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(
            json.dumps({"error": "Usage: python pymupdf4llm_extract.py <pdf_path>"}),
            file=sys.stderr,
        )
        sys.exit(1)

    pdf_path = sys.argv[1]
    if not os.path.exists(pdf_path):
        print(
            json.dumps({"error": f"File not found: {pdf_path}"}),
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        data = extract(pdf_path)
        print(json.dumps(data, ensure_ascii=False))
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(
            json.dumps({"error": str(e)}),
            file=sys.stderr,
        )
        sys.exit(1)
