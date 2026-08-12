import { useCallback, useEffect, useRef, useState } from "react";

interface Options {
  isSelected: (id: number) => boolean;
  setSelected: (id: number, selected: boolean) => void;
}

// Distance (px) from the edge of the scrolling list where a drag starts
// auto-scrolling; falls back to the viewport when the list itself does not scroll.
const EDGE = 70;
const MAX_SPEED = 18;

const getScrollParent = (el: HTMLElement | null): HTMLElement | null => {
  let node = el;
  while (node && node !== document.body && node !== document.documentElement) {
    const overflowY = getComputedStyle(node).overflowY;
    if (/(auto|scroll)/.test(overflowY) && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
};

/**
 * Press-and-drag selection across any element rendered with the returned props.
 * The first item decides the mode: dragging from an unselected item selects
 * everything it passes over, dragging from a selected item clears them.
 * Dragging near the top/bottom of the screen scrolls the list so long lists
 * can be covered in one gesture.
 */
export function useDragSelect({ isSelected, setSelected }: Options) {
  const [isDragging, setIsDragging] = useState(false);
  const modeRef = useRef(true); // true = selecting, false = deselecting
  const isSelectedRef = useRef(isSelected);
  const setSelectedRef = useRef(setSelected);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const speedRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const pointRef = useRef({ x: 0, y: 0 });
  // Set while a pointer gesture is producing the click that follows it, so the
  // checkbox does not toggle a second time on its own.
  const pointerDrivenRef = useRef(false);

  isSelectedRef.current = isSelected;
  setSelectedRef.current = setSelected;

  // React derives a checkbox's onChange from its click event, so cancelling the
  // click on the React side is too late — it has to be swallowed on the way
  // down, before it reaches React's root listener, or the tap that the pointer
  // handler just acted on would be applied a second time and undo itself.
  useEffect(() => {
    const swallowClick = (event: MouseEvent) => {
      if (!pointerDrivenRef.current) return;
      const target = event.target as HTMLElement | null;
      if (!target?.closest?.("[data-select-id]")) return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("click", swallowClick, true);
    return () => document.removeEventListener("click", swallowClick, true);
  }, []);

  const idAtPoint = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const holder = el?.closest("[data-select-id]") as HTMLElement | null;
    if (!holder) return null;
    const id = Number(holder.dataset.selectId);
    return Number.isNaN(id) ? null : id;
  };

  const stopAutoScroll = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    speedRef.current = 0;
  }, []);

  const runAutoScroll = useCallback(() => {
    frameRef.current = requestAnimationFrame(() => {
      const speed = speedRef.current;
      if (speed !== 0) {
        const scroller = scrollerRef.current;
        if (scroller) scroller.scrollTop += speed;
        else window.scrollBy(0, speed);
        // The pointer is held still at the edge, so pick up the rows that are
        // sliding underneath it.
        const { x, y } = pointRef.current;
        const id = idAtPoint(x, y);
        if (id !== null && isSelectedRef.current(id) !== modeRef.current) {
          setSelectedRef.current(id, modeRef.current);
        }
      }
      if (speedRef.current !== 0) runAutoScroll();
      else frameRef.current = null;
    });
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>, id: number) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // Stops the browser turning the gesture into a scroll or a text selection.
    event.preventDefault();
    pointerDrivenRef.current = true;
    modeRef.current = !isSelectedRef.current(id);
    setSelectedRef.current(id, modeRef.current);
    pointRef.current = { x: event.clientX, y: event.clientY };
    scrollerRef.current = getScrollParent(event.currentTarget);
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (event: PointerEvent) => {
      event.preventDefault();
      pointRef.current = { x: event.clientX, y: event.clientY };
      const id = idAtPoint(event.clientX, event.clientY);
      if (id !== null && isSelectedRef.current(id) !== modeRef.current) {
        setSelectedRef.current(id, modeRef.current);
      }

      const scroller = scrollerRef.current;
      const top = scroller ? scroller.getBoundingClientRect().top : 0;
      const bottom = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight;
      if (event.clientY < top + EDGE) {
        speedRef.current = -Math.ceil(((top + EDGE - event.clientY) / EDGE) * MAX_SPEED);
      } else if (event.clientY > bottom - EDGE) {
        speedRef.current = Math.ceil(((event.clientY - (bottom - EDGE)) / EDGE) * MAX_SPEED);
      } else {
        speedRef.current = 0;
      }
      if (speedRef.current !== 0 && frameRef.current === null) runAutoScroll();
    };

    const handleEnd = () => {
      stopAutoScroll();
      scrollerRef.current = null;
      setIsDragging(false);
      // The click this gesture may produce is dispatched before this timeout,
      // so it still gets swallowed; a later keyboard click does not.
      setTimeout(() => {
        pointerDrivenRef.current = false;
      }, 0);
    };

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);
    document.body.classList.add("drag-selecting");

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
      document.body.classList.remove("drag-selecting");
      stopAutoScroll();
    };
  }, [isDragging, runAutoScroll, stopAutoScroll]);

  const getDragHandleProps = useCallback(
    (id: number) => ({
      "data-select-id": id,
      className: "select-cell",
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => onPointerDown(event, id),
    }),
    [onPointerDown]
  );

  return { isDragging, getDragHandleProps };
}
