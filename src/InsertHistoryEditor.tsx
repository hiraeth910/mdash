import React, { useEffect, useRef } from "react";
import { EditorState, StateEffect, StateField, RangeSetBuilder, Extension, Compartment } from "@codemirror/state";
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
  disabled?: boolean;
}

const InsertHistoryEditor: React.FC<InsertHistoryEditorProps> = ({
  value,
  onValueChange,
  issueMap,
  onPasteImages,
  placeholder,
  className,
  disabled,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const editableCompartment = useRef(new Compartment()).current;
  // Callbacks are read through refs inside CodeMirror's extensions so the EditorView itself never
  // needs to be rebuilt when a parent re-render hands us new function identities.
  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;
  const onPasteImagesRef = useRef(onPasteImages);
  onPasteImagesRef.current = onPasteImages;
  // Holds the exact text we last produced ourselves, set synchronously right as we tell React
  // about our own edit — before React has had any chance to re-render. The external-value-sync
  // effect below compares the `value` prop it receives against this instead of a plain boolean
  // flag: a value equal to what we just produced is our own edit catching up (skip it — the live
  // document is already there or has moved further on, and dispatching the stale `value` would
  // clobber newer typing); a value that differs is a genuine external change (clearing after
  // submit, SP/DP/TP buttons, an image extraction appending lines) and must still be synced in
  // even if it lands in the same render as one of our own edits — a boolean alone can't tell
  // those two cases apart once two different value-changing sources land together.
  const lastSelfValueRef = useRef<string | null>(null);

  useEffect(() => {
    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      const text = update.state.doc.toString();
      lastSelfValueRef.current = text;
      const currentLine = update.state.doc.lineAt(update.state.selection.main.head).number - 1;
      onValueChangeRef.current(text, currentLine, update.view);
    });

    const pasteHandler = EditorView.domEventHandlers({
      paste: (event, view) => {
        const items = Array.from(event.clipboardData?.items || []).filter((item) => item.type.startsWith("image/"));
        if (items.length > 0) {
          event.preventDefault();
          const files = items.map((item) => item.getAsFile()).filter((f): f is File => !!f);
          onPasteImagesRef.current(files);
          return true;
        }
        // Plain text: pasting a block of numbers onto whatever's already on the current line
        // (rather than a fresh line) would glue them into one unparseable line. If the cursor
        // isn't already at the start of a line, start the pasted text on a new one.
        const text = event.clipboardData?.getData("text/plain");
        if (!text) return false;
        const { from, to } = view.state.selection.main;
        if (view.state.doc.lineAt(from).from === from) return false; // already at a line start
        event.preventDefault();
        view.dispatch({
          changes: { from, to, insert: `\n${text}` },
          selection: { anchor: from + 1 + text.length },
        });
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
        // Extra room below the last line -- about 3.5 blank rows worth (line-height 1.5 x 3.5 =
        // 5.25, in em so it scales with the responsive font-size) -- so there's always some
        // visible space to click into and place the cursor, even right after a huge paste fills
        // the box right up to its current last line.
        ".cm-content": { padding: "0.75rem 1rem", paddingBottom: "5.25em", caretColor: "var(--color-text)" },
        ".cm-line": { padding: "0" },
        "&.cm-focused": { outline: "none" },
      }),
      ...(placeholder ? [cmPlaceholder(placeholder)] : []),
      editableCompartment.of([EditorView.editable.of(!disabled), EditorState.readOnly.of(!!disabled)]),
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
  // submit, the SP/DP/TP buttons, an image extraction appending lines, a prop update).
  useEffect(() => {
    // One-shot: only answers for this specific `value` transition, so a later external update
    // landing on the same text some time afterward isn't mistaken for an old self-edit too.
    const selfValue = lastSelfValueRef.current;
    lastSelfValueRef.current = null;
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    if (value === selfValue) return; // our own edit's value catching up to the prop, not an external change
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

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: editableCompartment.reconfigure([EditorView.editable.of(!disabled), EditorState.readOnly.of(!!disabled)]),
    });
  }, [disabled, editableCompartment]);

  return <div ref={hostRef} className={className} />;
};

export default InsertHistoryEditor;
