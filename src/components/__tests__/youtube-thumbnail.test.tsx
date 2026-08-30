// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { YouTubeThumbnail } from "@/components/youtube-thumbnail";

// FE-12-A. The failure flag was a bare boolean that nothing reset, and the
// detail view renders DesktopYouTubeSlot without a key, so the component is
// reused across link navigation. One 404 therefore suppressed every later
// thumbnail. Tracking which src failed makes the reset fall out of the props.

const renderThumb = (videoId: string, thumbnail: string | null = null) =>
  render(
    <YouTubeThumbnail
      videoId={videoId}
      thumbnail={thumbnail}
      onPlay={vi.fn()}
    />
  );

afterEach(cleanup);

describe("YouTubeThumbnail", () => {
  it("hides the image once it fails to load", () => {
    renderThumb("aaa");
    const img = screen.getByRole("presentation", { hidden: true });

    fireEvent.error(img);

    expect(screen.queryByRole("presentation", { hidden: true })).toBeNull();
  });

  it("shows a thumbnail again after navigating to another video", () => {
    const view = renderThumb("aaa");
    fireEvent.error(screen.getByRole("presentation", { hidden: true }));
    expect(screen.queryByRole("presentation", { hidden: true })).toBeNull();

    // Same component instance, different video — the previous failure must not
    // carry over.
    view.rerender(
      <YouTubeThumbnail videoId="bbb" thumbnail={null} onPlay={vi.fn()} />
    );

    const next = screen.getByRole("presentation", { hidden: true });
    expect(next.getAttribute("src")).toContain("bbb");
  });

  it("keeps hiding the image while the failing video stays mounted", () => {
    const view = renderThumb("aaa");
    fireEvent.error(screen.getByRole("presentation", { hidden: true }));

    view.rerender(
      <YouTubeThumbnail videoId="aaa" thumbnail={null} onPlay={vi.fn()} />
    );

    expect(screen.queryByRole("presentation", { hidden: true })).toBeNull();
  });
});
