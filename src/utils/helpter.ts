/**
 * Fills incomplete lines by taking the next non-empty value that appears below them,
 * while preserving blank lines (important for textarea behavior).
 */
export function fillWithNextValue(input: string): string {
  // Split, but DO NOT filter out empty lines
  const lines = input.split(/\r?\n/);
  const output: string[] = new Array(lines.length);
  let nextValue: string | null = null;

  // Traverse from bottom → top to propagate values forward
  for (let i = lines.length - 1; i >= 0; i--) {
    const raw = lines[i];
    const line = raw.trim();

    // Keep empty lines as-is
    if (line === "") {
      output[i] = raw; // maintain spacing and newline behavior
      continue;
    }

    // Detect full key=value pair
    if (/^[0-9A-Za-z]+=[0-9A-Za-z]+$/.test(line)) {
      const [key, value] = line.split("=");
      nextValue = value;
      output[i] = `${key}=${value}`;
      continue;
    }

    // Incomplete (ends with any symbol)
    if (/^[0-9A-Za-z]+[=\-\+\:\;\,\.]$/.test(line)) {
      const key = line.slice(0, -1);
      const symbol = line.slice(-1);
      output[i] = `${key}${symbol}${nextValue ?? ""}`;
      continue;
    }

    // Range patterns or unknown formats — keep unchanged
    output[i] = line;
  }

  return output.join("\n");
}
