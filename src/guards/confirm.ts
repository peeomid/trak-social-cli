export function dryRunNotice(payload: unknown): void {
  console.log("Dry run only. No request sent.");
  console.log(JSON.stringify(payload, null, 2));
}
