"""Debug Handyman invoice Docling items."""
import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
import warnings
warnings.filterwarnings("ignore", category=RuntimeWarning)

from pathlib import Path
from docling.document_converter import DocumentConverter

PDF_DIR = Path(r"C:\Users\housh\Documents\WeChat Files\wxid_2hlwl0a6tr8y22\FileStorage\File\2026-01\tax\tax\New folder")
pdf = PDF_DIR / "20250316 Handyman Ocean $379.5.pdf"

c = DocumentConverter()
r = c.convert(str(pdf))
doc = r.document

print("All items:")
for item, level in doc.iterate_items():
    prov_pages = [p.page_no for p in item.prov] if hasattr(item, 'prov') and item.prov else []
    txt = str(item.text)[:120] if hasattr(item, 'text') and item.text else type(item).__name__
    print(f"  L{level} pages={prov_pages} type={type(item).__name__} -> {txt}")
