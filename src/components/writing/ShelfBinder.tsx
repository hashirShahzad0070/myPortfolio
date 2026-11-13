"use client";

import { useLayoutEffect } from "react";
import { registerStage } from "./shelfBus";

/** Hands the hydrated stage to the shelf. Renders nothing. */
export function ShelfBinder() {
  useLayoutEffect(() => {
    const stage = document.querySelector<HTMLElement>("[data-folders]");
    if (!stage) return;
    return registerStage(stage, document.querySelector<HTMLElement>("[data-folders-classic]"));
  }, []);
  return null;
}
