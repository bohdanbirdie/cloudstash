import { useEffect } from "react";

export type InputMode = "keyboard" | "mouse";

export const INPUT_MODE_ATTR = "data-input-mode";

let listenerCount = 0;
let detach: (() => void) | null = null;

function attach(): () => void {
  const setKeyboard = () => {
    document.documentElement.setAttribute(INPUT_MODE_ATTR, "keyboard");
  };
  const setMouse = () => {
    document.documentElement.setAttribute(INPUT_MODE_ATTR, "mouse");
  };
  window.addEventListener("keydown", setKeyboard);
  window.addEventListener("pointermove", setMouse);
  return () => {
    window.removeEventListener("keydown", setKeyboard);
    window.removeEventListener("pointermove", setMouse);
  };
}

export function isKeyboardMode(): boolean {
  return document.documentElement.getAttribute(INPUT_MODE_ATTR) === "keyboard";
}

export function useInputMode(): void {
  useEffect(() => {
    if (listenerCount === 0) detach = attach();
    listenerCount++;
    return () => {
      listenerCount--;
      if (listenerCount === 0 && detach) {
        detach();
        detach = null;
      }
    };
  }, []);
}
