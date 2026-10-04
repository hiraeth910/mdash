import type { ReactNode } from "react";

type Opt = { label?: ReactNode; children?: ReactNode; value?: unknown } | undefined;

const text = (node: ReactNode): string =>
  typeof node === "string" || typeof node === "number" ? String(node) : Array.isArray(node) ? node.map(text).join(" ") : "";

// Spread on an antd <Select> to make it searchable by what its options show, whether the options
// come from an `options` list (label) or from <Select.Option> children.
export const searchProps = {
  showSearch: true,
  filterOption: (input: string, option: Opt) =>
    (text(option?.label) || text(option?.children) || String(option?.value ?? "")).toLowerCase().includes(input.trim().toLowerCase()),
};
