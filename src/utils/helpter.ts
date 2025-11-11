export function compactLines(input: string): string {
  // Split, trim, and filter out empty lines
  const lines: string[] = input
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const output: string[] = [];
  let buffer: string[] = [];

  for (const line of lines) {
    // Detect pattern "number=something"
    const eqIndex = line.indexOf("=");
    if (eqIndex !== -1) {
      const key = line.slice(0, eqIndex).trim();
      const value = line.slice(eqIndex + 1).trim();

      if (value === "") {
        // Has '=' but no value — collect key
        buffer.push(key);
      } else {
        // Complete value found
        if (buffer.length > 0) {
          const keys = [...buffer, key];
          output.push(`${keys.join(".")}=${value}`);
          buffer = [];
        } else {
          output.push(`${key}=${value}`);
        }
      }
      continue;
    }

    // Handle incomplete lines ending with any symbol (: ; , . + -)
    if (/^\d+[\-\+\:\;\,\.]$/.test(line)) {
      buffer.push(line.replace(/[\-\+\:\;\,\.]/, ""));
      continue;
    }

    // Handle range patterns like "1-100"
    if (/^\d+-\d+$/.test(line)) {
      output.push(line);
      continue;
    }

    // Any other line, emit unchanged
    output.push(line);
  }

  // Emit leftover buffer if not terminated
  if (buffer.length > 0) {
    output.push(`${buffer.join(".")}=`);
  }

  return output.join("\n");
}