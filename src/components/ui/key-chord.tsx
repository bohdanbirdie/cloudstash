import { Fragment, useEffect, useState } from "react";

const MAC_GLYPH: Record<string, string> = {
  cmd: "⌘",
  ctrl: "⌃",
  alt: "⌥",
  opt: "⌥",
  shift: "⇧",
  enter: "↵",
  return: "↵",
  esc: "⎋",
  tab: "⇥",
};

const WIN_GLYPH: Record<string, string> = {
  cmd: "Ctrl",
  ctrl: "Ctrl",
  alt: "Alt",
  opt: "Alt",
  shift: "Shift",
  enter: "Enter",
  return: "Enter",
  esc: "Esc",
  tab: "Tab",
};

function detectIsMac() {
  if (typeof navigator === "undefined") return true;
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}

export function useIsMac() {
  const [isMac, setIsMac] = useState(true);
  useEffect(() => {
    setIsMac(detectIsMac());
  }, []);
  return isMac;
}

export function KeyChord({ keys }: { keys: readonly string[] }) {
  const isMac = useIsMac();
  const map = isMac ? MAC_GLYPH : WIN_GLYPH;
  return (
    <>
      {keys.map((k, i) => {
        const glyph = map[k.toLowerCase()] ?? k.toUpperCase();
        return (
          <Fragment key={i}>
            {i > 0 && !isMac && "+"}
            {glyph}
          </Fragment>
        );
      })}
    </>
  );
}
