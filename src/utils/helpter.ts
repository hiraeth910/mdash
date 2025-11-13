export function fillWithNextValue(input: string): string {
  const lines = input.split(/\r?\n/);
  const output: string[] = [];
  let nextValue: string | null = null;
  let hasChanges = false;

  // Traverse from bottom → top to propagate values forward
  for (let i = lines.length - 1; i >= 0; i--) {
    const raw = lines[i];
    const line = raw.trim();

    // Keep empty lines as-is
    if (line === "") {
      output[i] = raw;
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
      const filled = `${key}${symbol}${nextValue ?? ""}`;
      
      // Mark if we actually made a change
      if (filled !== line) {
        hasChanges = true;
      }
      
      output[i] = filled;
      continue;
    }

    // Range patterns or unknown formats – keep unchanged
    output[i] = line;
  }

  // Return original if no changes were made (optimization)
  return hasChanges ? output.join("\n") : input;
}

/**
 * Check if input contains patterns that would trigger fillWithNextValue
 */
export function needsAutofill(input: string): boolean {
  return /^[0-9A-Za-z]+[=\-\+\:\;\,\.]$/m.test(input);
}