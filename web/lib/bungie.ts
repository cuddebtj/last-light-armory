// Client-safe (no node imports) — icon paths in the data are relative to
// bungie.net, per ingest's icons migration.
const BUNGIE_ORIGIN = "https://www.bungie.net";

export function bungieUrl(path: string): string {
  return `${BUNGIE_ORIGIN}${path}`;
}
