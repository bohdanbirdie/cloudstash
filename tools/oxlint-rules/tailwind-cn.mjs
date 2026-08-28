const CN_CALLEES = new Set(["cn", "clsx", "classnames", "classNames"]);

const isCnCall = (node) =>
  node != null &&
  node.type === "CallExpression" &&
  node.callee.type === "Identifier" &&
  CN_CALLEES.has(node.callee.name);

const isDynamicTemplate = (node) =>
  node?.type === "TemplateLiteral" && node.expressions.length > 0;

const isTextConcatenation = (node) =>
  node?.type === "BinaryExpression" && node.operator === "+";

const isConditionalExpression = (node) =>
  node?.type === "ConditionalExpression" ||
  (node?.type === "LogicalExpression" && node.operator === "&&");

const requiresCnObjectSyntax = (node) =>
  isDynamicTemplate(node) ||
  isTextConcatenation(node) ||
  isConditionalExpression(node);

const isClassNameAttribute = (node) =>
  node.name?.type === "JSXIdentifier" && node.name.name === "className";

const enforceCn = {
  meta: {
    type: "suggestion",
    messages: {
      noConcatenation:
        "Pass class values as separate cn() arguments instead of concatenating className text; put conditional classes in cn() object syntax.",
      requireObjectSyntax:
        "Use cn() object syntax for conditional classes instead of a ternary or && expression.",
    },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (!isClassNameAttribute(node)) return;
        if (node.value?.type !== "JSXExpressionContainer") return;

        const expression = node.value.expression;
        if (isCnCall(expression)) return;
        if (!requiresCnObjectSyntax(expression)) return;

        context.report({
          node: expression,
          messageId: isConditionalExpression(expression)
            ? "requireObjectSyntax"
            : "noConcatenation",
        });
      },
      CallExpression(node) {
        if (!isCnCall(node)) return;

        for (const argument of node.arguments) {
          if (!requiresCnObjectSyntax(argument)) continue;
          context.report({
            node: argument,
            messageId: isConditionalExpression(argument)
              ? "requireObjectSyntax"
              : "noConcatenation",
          });
        }
      },
    };
  },
};

export default {
  meta: { name: "tailwind-cn" },
  rules: { "enforce-cn": enforceCn },
};
