"""Test Docling force_ocr mode on the Watercare PDF."""
import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import warnings
warnings.filterwarnings("ignore", category=RuntimeWarning)

from pathlib import Path
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.pipeline_options import PdfPipelineOptions

PDF_DIR = Path(r"C:\Users\housh\Documents\WeChat Files\wxid_2hlwl0a6tr8y22\FileStorage\File\2026-01\tax\tax\New folder")

# Watercare PDF - has broken Type3 fonts
watercare = PDF_DIR / "20250224 Watercare $55.88.pdf"
# Handyman PDF - missing footer rows
handyman = PDF_DIR / "20250316 Handyman Ocean $379.5.pdf"

pipeline_opts = PdfPipelineOptions(do_ocr=True, force_ocr=True)
converter = DocumentConverter(
    format_options={
        "application/pdf": PdfFormatOption(pipeline_options=pipeline_opts)
    }
)

for pdf in [watercare, handyman]:
    print(f"\n{'='*60}")
    print(f"FILE: {pdf.name} (force_ocr=True)")
    print(f"{'='*60}")
    r = converter.convert(str(pdf))
    md = r.document.export_to_markdown()
    print(md[:2000])
