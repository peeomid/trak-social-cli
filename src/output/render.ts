import type { OutputFormat } from "../types/models.js";

export function renderOutput(data: unknown, format: OutputFormat): void {
  if (format === "json") {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  renderTableLike(data);
}

function renderTableLike(data: unknown): void {
  if (Array.isArray(data)) {
    if (data.length === 0) {
      console.log("(no rows)");
      return;
    }

    if (typeof data[0] === "object" && data[0] !== null) {
      printTable(data as Array<Record<string, unknown>>);
      return;
    }
  }

  if (typeof data === "object" && data !== null) {
    printObject(data as Record<string, unknown>);
    return;
  }

  console.log(String(data));
}

function printObject(obj: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(obj)) {
    console.log(`${key}: ${stringifyValue(value)}`);
  }
}

function printTable(rows: Array<Record<string, unknown>>): void {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const widths = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => stringifyValue(row[column]).length)),
  );

  const header = columns.map((column, index) => column.padEnd(widths[index] ?? column.length)).join("  ");
  const divider = widths.map((width) => "-".repeat(width)).join("  ");
  console.log(header);
  console.log(divider);

  for (const row of rows) {
    console.log(
      columns
        .map((column, index) => stringifyValue(row[column]).padEnd(widths[index] ?? column.length))
        .join("  "),
    );
  }
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}
