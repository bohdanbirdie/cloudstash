import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

export function MobileStickyCta() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:hidden">
      <Button
        render={<Link to="/login" />}
        size="lg"
        className="h-11 w-full px-6 text-sm"
      >
        Start saving
      </Button>
    </div>
  );
}
