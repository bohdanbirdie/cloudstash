const CLSX_CALLEES = new Set(["cn", "clsx", "classnames", "classNames"]);

const isStringLiteral = (node) =>
  node != null && node.type === "Literal" && typeof node.value === "string";

const isClsxCall = (node) =>
  node != null &&
  node.type === "CallExpression" &&
  node.callee.type === "Identifier" &&
  CLSX_CALLEES.has(node.callee.name);

const FLIPPED_OPERATOR = { "===": "!==", "!==": "===", "==": "!=", "!=": "==" };

const negateText = (sourceCode, test) => {
  if (test.type === "UnaryExpression" && test.operator === "!") {
    return sourceCode.getText(test.argument);
  }
  if (test.type === "BinaryExpression" && FLIPPED_OPERATOR[test.operator]) {
    const left = sourceCode.getText(test.left);
    const right = sourceCode.getText(test.right);
    return `${left} ${FLIPPED_OPERATOR[test.operator]} ${right}`;
  }
  const isAtom =
    test.type === "Identifier" ||
    test.type === "MemberExpression" ||
    test.type === "CallExpression";
  const text = sourceCode.getText(test);
  return isAtom ? `!${text}` : `!(${text})`;
};

const noCnTernary = {
  meta: {
    type: "suggestion",
    fixable: "code",
    messages: {
      preferObject:
        "Use cn() object syntax instead of a ternary for conditional classes.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      ConditionalExpression(node) {
        const parent = node.parent;
        if (!isClsxCall(parent) || !parent.arguments.includes(node)) return;
        if (
          !isStringLiteral(node.consequent) ||
          !isStringLiteral(node.alternate)
        ) {
          return;
        }
        if (node.consequent.value === "" || node.alternate.value === "") return;

        const consequentKey = JSON.stringify(node.consequent.value);
        const alternateKey = JSON.stringify(node.alternate.value);
        const testText = sourceCode.getText(node.test);
        const negated = negateText(sourceCode, node.test);

        context.report({
          node,
          messageId: "preferObject",
          fix(fixer) {
            return fixer.replaceText(
              node,
              `{ ${consequentKey}: ${testText}, ${alternateKey}: ${negated} }`
            );
          },
        });
      },
    };
  },
};

export default {
  meta: { name: "tailwind-cn" },
  rules: { "no-cn-ternary": noCnTernary },
};
