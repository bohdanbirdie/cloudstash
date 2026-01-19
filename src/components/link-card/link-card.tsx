import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import type { LinkWithDetails } from "@/livestore/queries"

interface LinkCardProps {
  link: LinkWithDetails
  onClick: () => void
}

export function LinkCard({ link, onClick }: LinkCardProps) {
  const displayTitle = link.title || link.url
  const formattedDate = new Date(link.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full text-left transition-opacity hover:opacity-80 cursor-pointer"
    >
      <Card className={link.image ? "h-full pt-0" : "h-full"}>
        {link.image && (
          <div className="aspect-video w-full overflow-hidden">
            <img
              src={link.image}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <CardHeader>
          <div className="flex items-center gap-2">
            {link.favicon && (
              <img src={link.favicon} alt="" className="h-4 w-4 shrink-0" />
            )}
            <span className="text-muted-foreground text-xs truncate">
              {link.domain}
            </span>
          </div>
          <CardTitle className="line-clamp-2">{displayTitle}</CardTitle>
          {link.description && (
            <CardDescription className="line-clamp-2">
              {link.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <span className="text-muted-foreground text-xs">{formattedDate}</span>
        </CardContent>
      </Card>
    </button>
  )
}
