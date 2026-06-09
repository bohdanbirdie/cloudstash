const MOTION_SOURCES = new Set(["motion/react", "framer-motion"]);

const noUseReducedMotion = {
  meta: {
    type: "problem",
    messages: {
      noUseReducedMotion:
        'Don\'t hand-gate animations with useReducedMotion. <MotionConfig reducedMotion="user"> at the app root makes transform and layout animations honor the OS setting globally.',
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (!MOTION_SOURCES.has(node.source.value)) return;
        for (const specifier of node.specifiers) {
          if (
            specifier.type === "ImportSpecifier" &&
            specifier.imported.type === "Identifier" &&
            specifier.imported.name === "useReducedMotion"
          ) {
            context.report({
              node: specifier,
              messageId: "noUseReducedMotion",
            });
          }
        }
      },
    };
  },
};

export default {
  meta: { name: "motion" },
  rules: { "no-use-reduced-motion": noUseReducedMotion },
};
