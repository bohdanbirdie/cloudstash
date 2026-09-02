import type { Meta, StoryObj } from "@storybook/react-vite";
import { Command as CommandPrimitive } from "cmdk";
import { PlusIcon } from "lucide-react";
import { useRef, useState } from "react";

import {
  ApplicationFrame,
  LibraryLayout,
} from "@/components/application-layout";
import { AgentTrigger } from "@/components/bottom-dock/agent-trigger";
import { BottomDockSurface } from "@/components/bottom-dock/bottom-dock";
import { SearchTrigger } from "@/components/bottom-dock/search-trigger";
import { BrandLockup } from "@/components/brand-lockup";
import { CategoryNavSurface } from "@/components/category-nav";
import { LinkList } from "@/components/link-list/link-list";
import { LinkPreviewImage } from "@/components/link-preview-image";
import { LoadingState } from "@/components/loading-screen";
import { MastheadSurface } from "@/components/masthead";
import { DetailSummary } from "@/components/right-pane/detail-view/ai-summary";
import { TopBarSurface } from "@/components/top-bar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { LinkListItem } from "@/livestore/queries/links";

type LayoutState = "checking-session" | "syncing-library" | "ready";

interface MainLayoutPreviewProps {
  state: LayoutState;
}

const LINKS = [
  {
    completedAt: null,
    createdAt: Date.UTC(2026, 7, 27, 12),
    deletedAt: null,
    description: "New routes are making overnight rail practical again.",
    domain: "theguardian.com",
    favicon: null,
    id: "night-train",
    image: null,
    status: "unread",
    title: "The quiet return of the night train",
    url: "https://www.theguardian.com/travel/night-trains",
  },
  {
    completedAt: null,
    createdAt: Date.UTC(2026, 7, 26, 9),
    deletedAt: null,
    description: "A video essay about how urban sound shapes daily life.",
    domain: "youtube.com",
    favicon: null,
    id: "city-sound",
    image: null,
    status: "unread",
    title: "Why cities sound the way they do",
    url: "https://www.youtube.com/watch?v=city-sound",
  },
  {
    completedAt: null,
    createdAt: Date.UTC(2026, 7, 25, 18),
    deletedAt: null,
    description: "A relaxed three-day plan for food, walks, and the river.",
    domain: "lonelyplanet.com",
    favicon: null,
    id: "lisbon-weekend",
    image: null,
    status: "unread",
    title: "A weekend walking through Lisbon",
    url: "https://www.lonelyplanet.com/lisbon/weekend",
  },
] satisfies readonly LinkListItem[];

function MainLayoutPreview({ state }: MainLayoutPreviewProps) {
  const sessionKnown = state !== "checking-session";
  const libraryReady = state === "ready";

  return (
    <ApplicationFrame dock={libraryReady ? <DockFixture /> : null}>
      <LibraryLayout
        topBar={
          <HeaderFixture
            sessionKnown={sessionKnown}
            libraryReady={libraryReady}
          />
        }
        masthead={<MastheadSurface title="Inbox" count={LINKS.length} />}
        rightPane={libraryReady ? <RightPaneFixture /> : null}
        loadingState={
          libraryReady ? undefined : (
            <LoadingState
              className="h-full"
              animationClassName="size-20"
              message={
                sessionKnown ? "Syncing your library" : "Checking your account"
              }
            />
          )
        }
      >
        <LinkList links={LINKS} listKey="main-layout-preview" />
      </LibraryLayout>
    </ApplicationFrame>
  );
}

function HeaderFixture({
  sessionKnown,
  libraryReady,
}: {
  sessionKnown: boolean;
  libraryReady: boolean;
}) {
  return (
    <TopBarSurface
      leading={
        <>
          <BrandLockup wordmarkClassName="hidden text-foreground lg:inline" />
          <CategoryNavSurface pathname="/inbox" interactive={false} />
        </>
      }
      trailing={
        <>
          {sessionKnown ? <Button size="sm">Upgrade</Button> : null}
          <Button
            variant="ghost"
            size="icon"
            disabled={!libraryReady}
            aria-label="Add link"
          >
            <PlusIcon strokeWidth={1.75} aria-hidden="true" />
          </Button>
          {sessionKnown ? (
            <Avatar size="sm" aria-label="Account">
              <AvatarFallback>B</AvatarFallback>
            </Avatar>
          ) : (
            <Skeleton
              className="size-6 rounded-full"
              aria-label="Loading account"
            />
          )}
        </>
      }
    />
  );
}

function DockFixture() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  return (
    <div className="w-full">
      <CommandPrimitive className="contents" label="Search links">
        <BottomDockSurface
          search={
            <SearchTrigger
              inputRef={inputRef}
              active={false}
              value={query}
              onValueChange={setQuery}
              onActivate={() => {}}
            />
          }
          agent={<AgentTrigger active={false} onClick={() => {}} />}
        />
      </CommandPrimitive>
    </div>
  );
}

function RightPaneFixture() {
  return (
    <aside aria-label="Selected link preview" className="h-full pl-3">
      <div className="flex flex-col gap-6 pb-8">
        <div className="aspect-video w-full overflow-hidden rounded-sm">
          <LinkPreviewImage src={null} />
        </div>
        <div className="text-xs font-medium text-muted-foreground">
          theguardian.com
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold leading-tight text-balance">
            The quiet return of the night train
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Overnight rail is finding a new audience as travelers look for a
            slower way to cross Europe.
          </p>
        </div>
        <DetailSummary
          summary="New routes and updated cabins are making sleeper trains useful again for more journeys."
          isProcessing={false}
          isReprocessing={false}
          isFailed={false}
        />
      </div>
    </aside>
  );
}

const meta = {
  title: "Surfaces/Application/Main layout",
  component: MainLayoutPreview,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    state: "ready",
  },
  argTypes: {
    state: {
      control: "inline-radio",
      options: ["checking-session", "syncing-library", "ready"],
    },
  },
} satisfies Meta<typeof MainLayoutPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const CheckingSession: Story = {
  args: {
    state: "checking-session",
  },
};

export const SyncingLibrary: Story = {
  args: {
    state: "syncing-library",
  },
};

export const Ready: Story = {};
