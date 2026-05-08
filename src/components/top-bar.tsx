import { Option, Schema } from "effect";
import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { AccountMenu } from "@/components/account-menu";
import { useAddLink } from "@/components/add-link";
import { CategoryNav } from "@/components/category-nav";
import { CloudstashLogo } from "@/components/cloudstash-logo";
import { SyncStatusIndicator } from "@/components/sync-status-indicator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getHotkeyLabel } from "@/lib/hotkey-label";

const UrlSchema = Schema.URL;

export function TopBar() {
  const { addLink } = useAddLink();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const url = value.trim();
    if (!url) return;

    const isValid = Option.isSome(Schema.decodeUnknownOption(UrlSchema)(url));
    addLink(url);
    if (isValid) {
      setValue("");
      setOpen(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setValue("");
  };

  return (
    <header className="flex items-start justify-between gap-6 px-2">
      <div className="flex items-center gap-10">
        <div className="flex items-center gap-2.5">
          <CloudstashLogo className="size-5 rounded-sm" variant="branded" />
          <span className="text-[13px] font-medium tracking-[-0.005em] text-foreground">
            cloudstash
          </span>
        </div>
        <CategoryNav />
      </div>

      <div className="flex items-center gap-2">
        <SyncStatusIndicator />
        <Popover open={open} onOpenChange={handleOpenChange}>
          <Tooltip>
            <TooltipTrigger
              render={
                <PopoverTrigger
                  render={
                    <Button variant="ghost" size="icon" aria-label="Add link">
                      <PlusIcon strokeWidth={1.75} />
                    </Button>
                  }
                />
              }
            />
            <TooltipContent side="bottom" align="end">
              Add link · {getHotkeyLabel("meta+v")}
            </TooltipContent>
          </Tooltip>
          <PopoverContent
            align="end"
            sideOffset={6}
            className="w-[22rem] gap-0 p-0"
          >
            <form onSubmit={handleSubmit} noValidate>
              <div className="px-3 pt-3 pb-2.5">
                <Input
                  variant="bare"
                  type="url"
                  placeholder="URL"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex items-center justify-between border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground/70">
                <span>Or paste anywhere</span>
                <Kbd>{getHotkeyLabel("meta+v")}</Kbd>
              </div>
            </form>
          </PopoverContent>
        </Popover>
        <AccountMenu />
      </div>
    </header>
  );
}
