import { useEffect } from "react";

const DEFAULT_TITLE = "Matka";

// Shows the selected group's name as the browser tab title while it's picked, so switching
// between groups is easy to tell apart from the tab bar; reverts to the site default otherwise.
export function useDocumentTitle(title?: string | null) {
  useEffect(() => {
    document.title = title && title.trim() ? title.trim() : DEFAULT_TITLE;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title]);
}
