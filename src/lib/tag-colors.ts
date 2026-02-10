const TAG_COLORS = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "teal",
  "cyan",
  "blue",
  "violet",
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

export function getTagColor(name: string): TagColor {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash = hash & hash;
  }
  const index = Math.abs(hash) % TAG_COLORS.length;
  return TAG_COLORS[index];
}

export const tagColorStyles: Record<
  TagColor,
  { badge: string; badgeHover: string; dot: string }
> = {
  red: {
    badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    badgeHover: "hover:bg-red-200 dark:hover:bg-red-900/50",
    dot: "bg-red-500",
  },
  orange: {
    badge:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    badgeHover: "hover:bg-orange-200 dark:hover:bg-orange-900/50",
    dot: "bg-orange-500",
  },
  amber: {
    badge:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    badgeHover: "hover:bg-amber-200 dark:hover:bg-amber-900/50",
    dot: "bg-amber-500",
  },
  yellow: {
    badge:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    badgeHover: "hover:bg-yellow-200 dark:hover:bg-yellow-900/50",
    dot: "bg-yellow-500",
  },
  lime: {
    badge: "bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400",
    badgeHover: "hover:bg-lime-200 dark:hover:bg-lime-900/50",
    dot: "bg-lime-500",
  },
  green: {
    badge:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    badgeHover: "hover:bg-green-200 dark:hover:bg-green-900/50",
    dot: "bg-green-500",
  },
  teal: {
    badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
    badgeHover: "hover:bg-teal-200 dark:hover:bg-teal-900/50",
    dot: "bg-teal-500",
  },
  cyan: {
    badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
    badgeHover: "hover:bg-cyan-200 dark:hover:bg-cyan-900/50",
    dot: "bg-cyan-500",
  },
  blue: {
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    badgeHover: "hover:bg-blue-200 dark:hover:bg-blue-900/50",
    dot: "bg-blue-500",
  },
  violet: {
    badge:
      "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
    badgeHover: "hover:bg-violet-200 dark:hover:bg-violet-900/50",
    dot: "bg-violet-500",
  },
};
