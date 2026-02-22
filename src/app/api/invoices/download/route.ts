import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { invoices, invoiceEntries } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';

/**
 * Download CSV or Excel for one or more invoices.
 * GET /api/invoices/download?ids=1,2,3&format=csv|xlsx
 *
 * Layout matches the browser view: entries grouped by type with
 * group headers, summary rows (subtotal/total/due/tax) at the bottom.
 */
export async function GET(request: NextRequest) {
  const idsParam = request.nextUrl.searchParams.get('ids');
  if (!idsParam) {
    return NextResponse.json({ error: 'Missing ids parameter' }, { status: 400 });
  }

  const ids = [...new Set(idsParam.split(',').map(Number).filter(n => !isNaN(n)))];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'No valid ids' }, { status: 400 });
  }

  const format = request.nextUrl.searchParams.get('format') ?? 'csv';

  const db = getDb();
  const invoiceRows = db.select().from(invoices).where(inArray(invoices.id, ids)).all();

  if (invoiceRows.length === 0) {
    return NextResponse.json({ error: 'No invoices found' }, { status: 404 });
  }

  // Fetch entries for all invoices
  const invoiceData = invoiceRows.map(inv => {
    const entries = db
      .select()
      .from(invoiceEntries)
      .where(eq(invoiceEntries.invoice_id, inv.id))
      .orderBy(invoiceEntries.sort_order)
      .all();
    return { inv, entries };
  });

  if (format === 'xlsx') {
    return buildExcelResponse(invoiceData);
  }

  return buildCsvResponse(invoiceData);
}

interface InvoiceRow {
  id: number;
  display_name: string;
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total_amount: number | null;
  gst_amount: number | null;
  currency: string | null;
}

interface EntryRow {
  label: string;
  amount: number | null;
  entry_type: string | null;
  attrs: unknown;
}

interface InvoiceData {
  inv: InvoiceRow;
  entries: EntryRow[];
}

// ── Summary type detection ──

const SUMMARY_TYPES = new Set(['subtotal', 'total', 'due', 'tax', 'discount', 'adjustment']);

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Grouping (matches browser layout) ──

interface EntryGroup {
  type: string;
  entries: EntryRow[];
}

interface GroupedResult {
  groups: EntryGroup[];
  summaryEntries: EntryRow[];
}

function groupEntries(entries: EntryRow[]): GroupedResult {
  const groupMap = new Map<string, EntryRow[]>();
  const order: string[] = [];
  const summaryEntries: EntryRow[] = [];

  for (const entry of entries) {
    const type = entry.entry_type ?? 'other';
    if (SUMMARY_TYPES.has(type)) {
      summaryEntries.push(entry);
      continue;
    }
    if (!groupMap.has(type)) {
      groupMap.set(type, []);
      order.push(type);
    }
    groupMap.get(type)!.push(entry);
  }

  const groups = order.map(type => ({ type, entries: groupMap.get(type)! }));
  return { groups, summaryEntries };
}

// ── CSV ──

function buildCsvResponse(data: InvoiceData[]): NextResponse {
  const csvParts = data.map(({ inv, entries }) => buildInvoiceCsv(inv, entries));
  const csv = csvParts.join('\n');
  const filename = data.length === 1
    ? `${sanitizeFilename(data[0].inv.display_name)}.csv`
    : `invoices_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

function buildInvoiceCsv(inv: InvoiceRow, entries: EntryRow[]): string {
  const lines: string[] = [];

  // Invoice header
  lines.push(`"Invoice","${esc(inv.display_name)}"`);
  if (inv.supplier_name) lines.push(`"Supplier","${esc(inv.supplier_name)}"`);
  if (inv.invoice_number) lines.push(`"Invoice #","${esc(inv.invoice_number)}"`);
  if (inv.invoice_date) lines.push(`"Date","${esc(inv.invoice_date)}"`);
  if (inv.currency) lines.push(`"Currency","${esc(inv.currency)}"`);
  lines.push('');

  if (entries.length === 0) {
    if (inv.total_amount != null) lines.push(`"Total","${inv.total_amount}"`);
    if (inv.gst_amount != null) lines.push(`"GST","${inv.gst_amount}"`);
    return lines.join('\n');
  }

  const { groups, summaryEntries } = groupEntries(entries);

  // Each group with a header row showing the group name
  for (const group of groups) {
    const allAttrsKeys = collectAttrsKeys(group.entries);
    // Group name header
    lines.push(`"${esc(titleCase(group.type))}"`);
    // Column headers
    const headers = ['Entry', 'Amount', ...allAttrsKeys];
    lines.push(headers.map(h => `"${esc(h)}"`).join(','));
    // Entries
    for (const entry of group.entries) {
      const attrs = parseAttrs(entry.attrs);
      const row = [
        esc(entry.label),
        entry.amount != null ? String(entry.amount) : '',
        ...allAttrsKeys.map(k => esc(String(attrs[k] ?? ''))),
      ];
      lines.push(row.map(v => `"${v}"`).join(','));
    }
    lines.push('');
  }

  // Summary entries (subtotal, total, due, etc.)
  if (summaryEntries.length > 0) {
    for (const entry of summaryEntries) {
      lines.push(`"${esc(entry.label)}","${entry.amount != null ? entry.amount : ''}"`);
    }
    lines.push('');
  }

  // Invoice-level totals
  if (inv.total_amount != null) lines.push(`"Total","${inv.total_amount}"`);
  if (inv.gst_amount != null) lines.push(`"GST","${inv.gst_amount}"`);

  return lines.join('\n');
}

// ── Excel ──

async function buildExcelResponse(data: InvoiceData[]): Promise<NextResponse> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();

  for (const { inv, entries } of data) {
    const sheetName = sanitizeFilename(inv.display_name).slice(0, 31);
    const sheet = workbook.addWorksheet(sheetName);

    // Invoice header
    sheet.addRow(['Invoice', inv.display_name]);
    if (inv.supplier_name) sheet.addRow(['Supplier', inv.supplier_name]);
    if (inv.invoice_number) sheet.addRow(['Invoice #', inv.invoice_number]);
    if (inv.invoice_date) sheet.addRow(['Date', inv.invoice_date]);
    if (inv.currency) sheet.addRow(['Currency', inv.currency]);
    sheet.addRow([]);

    if (entries.length > 0) {
      const { groups, summaryEntries } = groupEntries(entries);

      for (const group of groups) {
        const allAttrsKeys = collectAttrsKeys(group.entries);
        // Group name header
        const groupRow = sheet.addRow([titleCase(group.type)]);
        groupRow.font = { bold: true };
        // Column headers
        const headerRow = sheet.addRow(['Entry', 'Amount', ...allAttrsKeys]);
        headerRow.font = { italic: true };
        headerRow.eachCell(cell => {
          cell.border = { bottom: { style: 'thin' } };
        });
        // Entries
        for (const entry of group.entries) {
          const attrs = parseAttrs(entry.attrs);
          sheet.addRow([
            entry.label,
            entry.amount,
            ...allAttrsKeys.map(k => {
              const v = attrs[k];
              return v != null ? (typeof v === 'number' ? v : String(v)) : '';
            }),
          ]);
        }
        sheet.addRow([]);
      }

      // Summary entries
      if (summaryEntries.length > 0) {
        for (const entry of summaryEntries) {
          const r = sheet.addRow([entry.label, entry.amount]);
          r.font = { bold: true };
        }
        sheet.addRow([]);
      }
    }

    // Invoice-level totals
    if (inv.total_amount != null) {
      const r = sheet.addRow(['Total', inv.total_amount]);
      r.font = { bold: true };
    }
    if (inv.gst_amount != null) sheet.addRow(['GST', inv.gst_amount]);

    // Auto-fit column widths
    sheet.columns.forEach(col => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: false }, cell => {
        const len = String(cell.value ?? '').length;
        if (len > maxLen) maxLen = len;
      });
      col.width = Math.min(maxLen + 2, 40);
    });
  }

  const buf = await workbook.xlsx.writeBuffer();
  const filename = data.length === 1
    ? `${sanitizeFilename(data[0].inv.display_name)}.xlsx`
    : `invoices_${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

// ── Shared helpers ──

function collectAttrsKeys(entries: EntryRow[]): string[] {
  const keyCounts = new Map<string, number>();
  for (const entry of entries) {
    const attrs = parseAttrs(entry.attrs);
    for (const key of Object.keys(attrs)) {
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
  }

  return [...keyCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key]) => key);
}

function parseAttrs(attrs: unknown): Record<string, unknown> {
  if (!attrs) return {};
  if (typeof attrs === 'object' && !Array.isArray(attrs)) return attrs as Record<string, unknown>;
  if (typeof attrs === 'string') {
    try { return JSON.parse(attrs); } catch { return {}; }
  }
  return {};
}

function esc(s: string): string {
  return s.replace(/"/g, '""');
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\- ]/g, '_').slice(0, 100);
}
