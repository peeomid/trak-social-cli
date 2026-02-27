export function validateScheduleTime(input: string, now = new Date()): Date {
  const scheduled = new Date(input);
  if (Number.isNaN(scheduled.getTime())) {
    throw new Error("Invalid --at value. Use ISO time, for example 2026-03-05T09:00:00+07:00");
  }

  const min = new Date(now.getTime() + 10 * 60 * 1000);
  const max = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (scheduled < min || scheduled > max) {
    throw new Error("Meta requires scheduled posts to be between 10 minutes and 30 days from now.");
  }

  return scheduled;
}

export function requireValue(value: string | undefined, label: string): string {
  if (!value || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

export function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}
