export function fillWithNextValue(input: string, currentLine?: number): string {
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

    // Detect a full key<separator>value pair ("x"/"X" counts as a separator too)
    const fullPair = line.match(/^[0-9A-Za-z]+[=\-\+\:\;\,\.xX]([0-9A-Za-z]+)$/);
    if (fullPair) {
      // The line the cursor is on may still be mid-typed (e.g. "43-1" on the way to "43-10"), so
      // it can be a fill target but must never become the source value for earlier lines yet.
      if (i !== currentLine) nextValue = fullPair[1];
      output[i] = line;
      continue;
    }

    // Incomplete (ends with any symbol)
    if (/^[0-9A-Za-z]+[=\-\+\:\;\,\.xX]$/.test(line)) {
      // The line the cursor is on may just have gotten its separator a moment ago, with the person
      // about to type their own amount right after it (e.g. "37-" on the way to "37-25"). Filling
      // it immediately would race them: their next keystroke would land after the auto-filled
      // value instead of replacing it. Leave it alone until they move off this line — the same
      // rule that already protects it from being used as a fill *source* above.
      if (i === currentLine) {
        output[i] = line;
        continue;
      }

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
  return /^[0-9A-Za-z]+[=\-\+\:\;\,\.xX]$/m.test(input);
}