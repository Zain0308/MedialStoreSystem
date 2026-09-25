export type CsvValue = string | number | null | undefined;

export function downloadCsv(filename: string, headers: readonly string[], rows: readonly (readonly CsvValue[])[]): void {
  const quote = (value: CsvValue) => {
    const text = value == null ? '' : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  };
  const contents = [headers, ...rows].map(row => row.map(quote).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${contents}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(value: string): string {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'account';
}
