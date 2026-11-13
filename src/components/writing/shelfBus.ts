/* Meeting point between the shelf engine (owned by the /writing layout) and the stage
   (owned by the /writing page). Either can arrive first; the stage binds once both exist,
   and only after the page has hydrated — so the engine never edits server HTML React still owns. */
import type { ShelfApi } from "./shelf";

let api: ShelfApi | null = null;
let stage: { el: HTMLElement; classic: HTMLElement | null } | null = null;
let unbind: (() => void) | null = null;

const tryBind = () => {
  if (!api || !stage || unbind) return;
  api.toShelf();
  unbind = api.bindStage(stage.el, stage.classic);
};

export function setShelf(next: ShelfApi | null) {
  unbind?.();
  unbind = null;
  api = next;
  tryBind();
}

export function registerStage(el: HTMLElement, classic: HTMLElement | null) {
  stage = { el, classic };
  tryBind();
  return () => {
    if (stage?.el !== el) return;
    stage = null;
    unbind?.();
    unbind = null;
  };
}
