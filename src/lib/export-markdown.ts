import type { LinkWithDetails } from "@/livestore/queries/links";

import { displayDescription, displayTitle } from "./link-display";

function formatDate(timestamp: number | null): string {
  if (!timestamp) {
    return "";
  }
  return new Date(timestamp).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function generatePlainLinks(links: readonly LinkWithDetails[]): string {
  if (links.length === 0) {
    return "";
  }
  return links.map((link) => link.url).join("\n");
}

export function generateLinksMarkdown(
  links: readonly LinkWithDetails[],
  title: string
): string {
  const exportDate = new Date().toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  let markdown = `${title} export · exported on ${exportDate}\n\n`;

  if (links.length === 0) {
    markdown += `---\n\n`;
    markdown += `*No links to export*\n`;
    return markdown;
  }

  for (const link of links) {
    const decodedTitle = link.title ? displayTitle(link) : null;
    const decodedDescription = displayDescription(link);
    markdown += `---\n\n`;
    markdown += `### ${decodedTitle || link.url}\n\n`;
    markdown += `**URL:** ${link.url}\n`;
    markdown += `**Domain:** ${link.domain}\n`;
    markdown += `**Status:** ${formatStatus(link.status)}\n`;
    markdown += `**Saved:** ${formatDate(link.createdAt)}\n`;

    if (link.completedAt) {
      markdown += `**Completed:** ${formatDate(link.completedAt)}\n`;
    }

    if (link.image) {
      markdown += `\n![${decodedTitle || "Preview"}](${link.image})\n`;
    }

    markdown += `\n### Description\n\n`;
    markdown += `${decodedDescription || "*No description available*"}\n`;

    markdown += `\n### AI Summary\n\n`;
    markdown += `${link.summary || "*No summary available*"}\n\n`;
  }

  return markdown;
}
