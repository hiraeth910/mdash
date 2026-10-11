import React, { useEffect, useRef } from "react";
import { EditorState, StateEffect, StateField, RangeSetBuilder, Extension } from "@codemirror/state";
import {
  EditorView,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
  keymap,
  placeholder as cmPlaceholder,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";

export type LineIssueKind = "invalid" | "ambig" | "filled";

// Holds the current issue map inside CodeMirror's own state, so handing it a new map is an O(1)
// dispatch from React — the actual decoration work below only ever looks at the lines currently
// on screen, not the whole document, however many thousand lines that might be.
const setIssueMap = StateEffect.define<Map<string, LineIssueKind>>();
const issueMapField = StateField.define<Map<string, LineIssueKind>>({
  create: () => new Map(),
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setIssueMap)) value = effect.value;
    return value;
  },
});

const classFor = (kind: LineIssueKind) =>
  kind === "invalid" ? "cm-issue-invalid" : kind === "filled" ? "cm-issue-filled" : "cm-issue-ambig";

// Marks whole lines with a CSS class (background/underline) rather than wrapping inline <span>s
// around specific text — a line decoration only ever changes an existing line element's class, it
// never touches text nodes or the document, so it can never disturb the cursor or selection. That
// alone is what made the old textarea-plus-overlay design fragile (two separately-rendered layers
// kept in sync by hand); CodeMirror is built to get that right by construction.
//
// Decorations are computed only for `view.visibleRanges` — the lines actually on screen — and
// rebuilt on scroll/doc/issue-map changes, rather than walking the entire document on every
// keystroke. For a few thousand lines that distinction is the difference between sub-millisecond
// and (measured) well over a second per keystroke.
const lineIssueHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.transactions.some((tr) => tr.effects.some((e) => e.is(setIssueMap)))
      ) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView): DecorationSet {
      const issueMap = view.state.field(issueMapField);
      const builder = new RangeSetBuilder<Decoration>();
      if (issueMap.size > 0) {
        for (const { from, to } of view.visibleRanges) {
          let pos = from;
          while (pos <= to) {
            const line = view.state.doc.lineAt(pos);
            const kind = issueMap.get(line.text.trim());
            if (kind) builder.add(line.from, line.from, Decoration.line({ class: classFor(kind) }));
            pos = line.to + 1;
          }
        }
      }
      return builder.finish();
    }
  },
  { decorations: (plugin) => plugin.decorations }
);

export interface InsertHistoryEditorProps {
  value: string;
  onValueChange: (next: string, currentLine: number, view: EditorView) => void;
  issueMap: Map<string, LineIssueKind>;
  onPasteImages: (files: File[]) => void;
  placeholder?: string;
  className?: string;
}

const InsertHistoryEditor: React.FC<InsertHistoryEditorProps> = ({
  value,
  onValueChange,
  issueMap,
  onPasteImages,
  placeholder,
  className,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Callbacks are read through refs inside CodeMirror's extensions so the EditorView itself never
  // needs to be rebuilt when a parent re-render hands us new function identities.
  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;
  const onPasteImagesRef = useRef(onPasteImages);
  onPasteImagesRef.current = onPasteImages;
  // Set synchronously, right as we tell React about our own edit — before React has had any
  // chance to re-render. Without this, the external-value-sync effect below can run with a
  // `value` prop that's one render behind CodeMirror's actual (newer, already-typed) document —
  // multiple keystrokes landing before React flushes is enough — and would forcibly overwrite
  // what the person just typed with that stale snapshot. Since this flag is set at the exact
  // moment of the edit rather than discovered later by comparing values, it can't itself be stale.
  const suppressNextSyncRef = useRef(false);

  useEffect(() => {
    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      suppressNextSyncRef.current = true;
      const text = update.state.doc.toString();
      const currentLine = update.state.doc.lineAt(update.state.selection.main.head).number - 1;
      onValueChangeRef.current(text, currentLine, update.view);
    });

    const pasteHandler = EditorView.domEventHandlers({
      paste: (event) => {
        const items = Array.from(event.clipboardData?.items || []).filter((item) => item.type.startsWith("image/"));
        if (items.length === 0) return false; // let CodeMirror insert the text natively
        event.preventDefault();
        const files = items.map((item) => item.getAsFile()).filter((f): f is File => !!f);
        onPasteImagesRef.current(files);
        return true;
      },
    });

    const extensions: Extension[] = [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      issueMapField,
      lineIssueHighlighter,
      updateListener,
      pasteHandler,
      EditorView.lineWrapping,
      EditorView.theme({
        "&": { height: "100%", fontSize: "inherit" },
        ".cm-scroller": { fontFamily: "inherit", lineHeight: "inherit", overflow: "auto" },
        ".cm-content": { padding: "0.75rem 1rem", caretColor: "var(--color-text)" },
        ".cm-line": { padding: "0" },
        "&.cm-focused": { outline: "none" },
      }),
      ...(placeholder ? [cmPlaceholder(placeholder)] : []),
    ];

    const view = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: hostRef.current!,
    });
    viewRef.current = view;
    // Exposes the live EditorView on the host node for Playwright/E2E introspection. No production
    // code reads this; harmless to leave in.
    (hostRef.current as unknown as { __cmView?: EditorView }).__cmView = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Built once; value/issueMap are synced imperatively below so typing is never interrupted by a
    // parent re-render recreating the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Syncs in text that changed for a reason other than the user's own typing here (clearing after
  // submit, the SP/DP/TP buttons, an image extraction appending lines, a prop update). A `value`
  // update that's just React catching up with our own edit is skipped via suppressNextSyncRef
  // (see above) rather than by comparing it to the live document — the live document can already
  // be ahead of this `value` by the time this effect runs, which a value comparison alone can't
  // tell apart from a genuine external change.
  useEffect(() => {
    if (suppressNextSyncRef.current) {
      suppressNextSyncRef.current = false;
      return;
    }
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: { anchor: value.length },
    });
  }, [value]);

  // Just hands the map to CodeMirror's own state — O(1) regardless of document size. The actual
  // per-line lookups happen inside lineIssueHighlighter, scoped to the visible viewport.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setIssueMap.of(issueMap) });
  }, [issueMap]);

  return <div ref={hostRef} className={className} />;
};

export default InsertHistoryEditor;
