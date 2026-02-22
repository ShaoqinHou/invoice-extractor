import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { invoices } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { readUploadedFile } from '@/lib/storage/files';
import path from 'path';

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const invoiceId = parseInt(id, 10);
  if (isNaN(invoiceId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  const db = getDb();
  const invoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
  if (!invoice) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!invoice.file_path) {
    return NextResponse.json({ error: 'No file available' }, { status: 404 });
  }

  try {
    const buffer = await readUploadedFile(invoice.file_path);
    const ext = path.extname(invoice.original_filename).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${invoice.original_filename}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 });
  }
}
