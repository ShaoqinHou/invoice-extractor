"""Quick test: Compare docling output vs unpdf on the Centurion levy invoice."""
import sys
import json
from pathlib import Path
from docling.document_converter import DocumentConverter

PDF_DIR = Path(r"C:\Users\housh\Documents\WeChat Files\wxid_2hlwl0a6tr8y22\FileStorage\File\2026-01\tax\tax\New folder")

# Test both Centurion levy invoices (the ones with column confusion)
test_files = [
    "2025Levy Invoice.pdf",  # Invoice #10 - known column confusion
    "2024Levy Invoice.pdf",  # Invoice #8 - total failure then column confusion
]

converter = DocumentConverter()

for filename in test_files:
    pdf_path = PDF_DIR / filename
    if not pdf_path.exists():
        print(f"SKIP: {filename} not found")
        continue

    print(f"\n{'='*80}")
    print(f"FILE: {filename}")
    print(f"{'='*80}")

    result = converter.convert(str(pdf_path))

    # Get markdown output (should have tables)
    md = result.document.export_to_markdown()
    print("\n--- MARKDOWN OUTPUT ---")
    print(md)

    print(f"\n{'='*80}")
