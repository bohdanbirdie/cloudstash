"use client";

import { AnimatePresence, motion } from "motion/react";
import type {
  TargetAndTransition,
  Transition,
  Variant,
  Variants,
} from "motion/react";
import React from "react";

import { cn } from "@/lib/utils";

export type TextEffectPreset =
  | "blur"
  | "fade-in-blur"
  | "scale"
  | "fade"
  | "slide";

export type TextEffectPer = "word" | "char" | "line";

export interface TextEffectProps {
  children: string;
  per?: TextEffectPer;
  as?: keyof React.JSX.IntrinsicElements;
  variants?: {
    container?: Variants;
    item?: Variants;
  };
  className?: string;
  preset?: TextEffectPreset;
  delay?: number;
  speedReveal?: number;
  speedSegment?: number;
  trigger?: boolean;
  onAnimationComplete?: () => void;
  onAnimationStart?: () => void;
  segmentWrapperClassName?: string;
  containerTransition?: Transition;
  segmentTransition?: Transition;
  style?: React.CSSProperties;
}

const DEFAULT_STAGGER_TIMES: Record<TextEffectPer, number> = {
  char: 0.03,
  word: 0.05,
  line: 0.1,
};

const DEFAULT_CONTAINER_VARIANTS: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
  exit: {
    transition: { staggerChildren: 0.05, staggerDirection: -1 },
  },
};

const DEFAULT_ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const PRESET_VARIANTS: Record<
  TextEffectPreset,
  { container: Variants; item: Variants }
> = {
  blur: {
    container: DEFAULT_CONTAINER_VARIANTS,
    item: {
      hidden: { opacity: 0, filter: "blur(12px)" },
      visible: { opacity: 1, filter: "blur(0px)" },
      exit: { opacity: 0, filter: "blur(12px)" },
    },
  },
  "fade-in-blur": {
    container: DEFAULT_CONTAINER_VARIANTS,
    item: {
      hidden: { opacity: 0, y: 20, filter: "blur(12px)" },
      visible: { opacity: 1, y: 0, filter: "blur(0px)" },
      exit: { opacity: 0, y: 20, filter: "blur(12px)" },
    },
  },
  scale: {
    container: DEFAULT_CONTAINER_VARIANTS,
    item: {
      hidden: { opacity: 0, scale: 0 },
      visible: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0 },
    },
  },
  fade: {
    container: DEFAULT_CONTAINER_VARIANTS,
    item: DEFAULT_ITEM_VARIANTS,
  },
  slide: {
    container: DEFAULT_CONTAINER_VARIANTS,
    item: {
      hidden: { opacity: 0, y: 20 },
      visible: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 20 },
    },
  },
};

const AnimatedSegment = React.memo(function AnimatedSegment({
  segment,
  variants,
  per,
  segmentWrapperClassName,
}: {
  segment: string;
  variants: Variants;
  per: TextEffectPer;
  segmentWrapperClassName?: string;
}) {
  const content =
    per === "line" ? (
      <motion.span variants={variants} className="block">
        {segment}
      </motion.span>
    ) : per === "word" ? (
      <motion.span
        aria-hidden="true"
        variants={variants}
        className="inline-block whitespace-pre"
      >
        {segment}
      </motion.span>
    ) : (
      <motion.span className="inline-block whitespace-pre">
        {segment.split("").map((character, index) => (
          <motion.span
            key={`${character}-${index}`}
            aria-hidden="true"
            variants={variants}
            className="inline-block whitespace-pre"
          >
            {character}
          </motion.span>
        ))}
      </motion.span>
    );

  if (!segmentWrapperClassName) return content;

  return (
    <span
      className={cn(
        { block: per === "line", "inline-block": per !== "line" },
        segmentWrapperClassName
      )}
    >
      {content}
    </span>
  );
});

const splitText = (text: string, per: TextEffectPer) =>
  per === "line" ? text.split("\n") : text.split(/(\s+)/);

const hasTransition = (
  variant?: Variant
): variant is TargetAndTransition & { transition?: Transition } =>
  Boolean(variant && typeof variant === "object" && "transition" in variant);

const asTargetAndTransition = (variant?: Variant): TargetAndTransition =>
  variant && typeof variant === "object" ? variant : {};

const createVariantsWithTransition = (
  baseVariants: Variants,
  transition?: Transition & { exit?: Transition }
): Variants => {
  if (!transition) return baseVariants;

  const { exit: _, ...mainTransition } = transition;
  const visible = asTargetAndTransition(baseVariants.visible);
  const exit = asTargetAndTransition(baseVariants.exit);

  return {
    ...baseVariants,
    visible: {
      ...visible,
      transition: {
        ...visible.transition,
        ...mainTransition,
      },
    },
    exit: {
      ...exit,
      transition: {
        ...exit.transition,
        ...mainTransition,
        staggerDirection: -1,
      },
    },
  };
};

type ResolvedTextEffectProps = TextEffectProps &
  Required<
    Pick<
      TextEffectProps,
      | "as"
      | "delay"
      | "per"
      | "preset"
      | "speedReveal"
      | "speedSegment"
      | "trigger"
    >
  >;

const TEXT_EFFECT_DEFAULTS = {
  as: "p",
  delay: 0,
  per: "word",
  preset: "fade",
  speedReveal: 1,
  speedSegment: 1,
  trigger: true,
} satisfies Pick<
  ResolvedTextEffectProps,
  "as" | "delay" | "per" | "preset" | "speedReveal" | "speedSegment" | "trigger"
>;

const resolveTextEffectProps = (
  props: TextEffectProps
): ResolvedTextEffectProps => ({
  ...TEXT_EFFECT_DEFAULTS,
  ...props,
});

export function TextEffect(props: TextEffectProps) {
  return <ResolvedTextEffect {...resolveTextEffectProps(props)} />;
}

function ResolvedTextEffect({
  children,
  per,
  as,
  variants,
  className,
  preset,
  delay,
  speedReveal,
  speedSegment,
  trigger,
  onAnimationComplete,
  onAnimationStart,
  segmentWrapperClassName,
  containerTransition,
  segmentTransition,
  style,
}: ResolvedTextEffectProps) {
  const segments = splitText(children, per);
  const MotionTag = motion[as as keyof typeof motion] as typeof motion.div;
  const baseVariants = PRESET_VARIANTS[preset];
  const stagger = DEFAULT_STAGGER_TIMES[per] / speedReveal;
  const baseDuration = 0.3 / speedSegment;

  const customStagger = hasTransition(variants?.container?.visible)
    ? variants.container.visible.transition?.staggerChildren
    : undefined;
  const customDelay = hasTransition(variants?.container?.visible)
    ? variants.container.visible.transition?.delayChildren
    : undefined;

  const computedVariants = {
    container: createVariantsWithTransition(
      variants?.container ?? baseVariants.container,
      {
        staggerChildren: customStagger ?? stagger,
        delayChildren: customDelay ?? delay,
        ...containerTransition,
        exit: {
          staggerChildren: customStagger ?? stagger,
          staggerDirection: -1,
        },
      }
    ),
    item: createVariantsWithTransition(variants?.item ?? baseVariants.item, {
      duration: baseDuration,
      ...segmentTransition,
    }),
  };

  return (
    <AnimatePresence mode="popLayout">
      {trigger ? (
        <MotionTag
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={computedVariants.container}
          className={className}
          onAnimationComplete={onAnimationComplete}
          onAnimationStart={onAnimationStart}
          style={style}
        >
          {per === "line" ? null : <span className="sr-only">{children}</span>}
          {segments.map((segment, index) => (
            <AnimatedSegment
              key={`${per}-${index}-${segment}`}
              segment={segment}
              variants={computedVariants.item}
              per={per}
              segmentWrapperClassName={segmentWrapperClassName}
            />
          ))}
        </MotionTag>
      ) : null}
    </AnimatePresence>
  );
}
