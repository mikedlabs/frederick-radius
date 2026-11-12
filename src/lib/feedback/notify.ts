import { toast } from "sonner";

/** A routine save confirms what the control already shows. It leaves quickly,
 *  because inside a place or event sheet the toast sits over the sheet's own
 *  next actions until it goes. */
export const SAVED_TOAST_MS = 3000;
/** Long enough to notice Undo and reach it with a thumb. */
export const UNDO_TOAST_MS = 6000;
/** A next step beside Undo is two controls to read. */
export const CHOICE_TOAST_MS = 7000;
/** Failure copy runs to two sentences and can carry a retry. */
export const ERROR_TOAST_MS = 8000;

type ToastAction = { label: string; onClick: () => void };

/** The thing a save toast is about. Toasts for one item share an id, so
 *  toggling it again replaces its toast instead of stacking a second one. */
export type SavedItem = { type: "place" | "event" | "radius" | "beer" | "outing"; id: string };

const itemToastId = (item?: SavedItem) => (item ? `save:${item.type}:${item.id}` : undefined);
const undoAction = (onUndo: () => void): ToastAction => ({ label: "Undo", onClick: onUndo });

/* Sonner merges a same-id toast into the one on screen, so each helper names
   every slot it owns. An omitted description or cancel button would otherwise
   carry over from the toast being replaced. */

/** Confirms a save and offers the way back. */
export function notifySaved({ label, title, description, onUndo, forward, item }: {
  /** Name of the saved thing. The routine title reads "Saved · {label}". */
  label: string;
  /** Replaces the routine title for a moment worth marking, such as a first save. */
  title?: string;
  description?: string;
  onUndo: () => void;
  /** A next step that takes the action slot. Undo moves beside it. */
  forward?: ToastAction;
  item?: SavedItem;
}) {
  return toast.success(title ?? `Saved · ${label}`, {
    id: itemToastId(item),
    description,
    // A second line or a second control needs reading time. A bare
    // "Saved" does not.
    duration: forward ? CHOICE_TOAST_MS : description ? UNDO_TOAST_MS : SAVED_TOAST_MS,
    action: forward ?? undoAction(onUndo),
    cancel: forward ? undoAction(onUndo) : undefined,
  });
}

/** Confirms a removal. Every removal is reversible, so Undo is not optional. */
export function notifyRemoved({ label, title, onUndo, item }: {
  /** Name of the removed thing. The routine title reads "Removed from Saved · {label}". */
  label: string;
  title?: string;
  onUndo: () => void;
  item?: SavedItem;
}) {
  return toast(title ?? `Removed from Saved · ${label}`, {
    id: itemToastId(item),
    description: undefined,
    duration: UNDO_TOAST_MS,
    action: undoAction(onUndo),
    cancel: undefined,
  });
}

/** Reports a failure, with the reason and a retry when one exists. Failures
 *  never share an item id: a save toast that is leaving the screen would
 *  swallow the message. */
export function notifyError({ title, description, onRetry }: {
  title: string;
  description?: string;
  onRetry?: () => void;
}) {
  return toast.error(title, {
    description,
    duration: ERROR_TOAST_MS,
    action: onRetry ? { label: "Try again", onClick: onRetry } : undefined,
  });
}
