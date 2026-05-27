export interface ParsedYouTube {
  videoId: string;
  startSeconds?: number;
}

function parseStart(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
  if (!match) return undefined;
  const [, h, m, s] = match;
  const total = Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
  return total > 0 ? total : undefined;
}

export function parseYouTube(rawUrl: string): ParsedYouTube | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  const startSeconds = parseStart(url.searchParams.get("t"));

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return id ? { videoId: id, startSeconds } : null;
  }

  if (
    host !== "youtube.com" &&
    host !== "m.youtube.com" &&
    host !== "music.youtube.com" &&
    host !== "youtube-nocookie.com"
  )
    return null;

  if (url.pathname === "/watch") {
    const id = url.searchParams.get("v");
    return id ? { videoId: id, startSeconds } : null;
  }
  if (url.pathname.startsWith("/shorts/")) {
    const id = url.pathname.slice("/shorts/".length).split("/")[0];
    return id ? { videoId: id, startSeconds } : null;
  }
  if (url.pathname.startsWith("/embed/")) {
    const id = url.pathname.slice("/embed/".length).split("/")[0];
    return id ? { videoId: id, startSeconds } : null;
  }
  if (url.pathname.startsWith("/live/")) {
    const id = url.pathname.slice("/live/".length).split("/")[0];
    return id ? { videoId: id, startSeconds } : null;
  }

  return null;
}
