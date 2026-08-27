const MODULE_MOCK_METHODS = new Set(["doMock", "mock", "unstable_mockModule"]);

const isTypeAssertion = (node) =>
  node.type === "TSAsExpression" || node.type === "TSTypeAssertion";

const unwrapParentheses = (expression) => {
  let current = expression;
  while (current.type === "ParenthesizedExpression") {
    current = current.expression;
  }
  return current;
};

const isConstAssertion = (node) =>
  node.typeAnnotation.type === "TSTypeReference" &&
  node.typeAnnotation.typeName.type === "Identifier" &&
  node.typeAnnotation.typeName.name === "const";

const isOutermostAssertion = (node) => {
  let current = node;
  let parent = node.parent;
  while (
    parent.type === "ParenthesizedExpression" &&
    parent.expression === current
  ) {
    current = parent;
    parent = parent.parent;
  }
  return !isTypeAssertion(parent) || parent.expression !== current;
};

const isForbiddenAssertionChain = (node) => {
  let assertionCount = 0;
  let hasNonConstAssertion = false;
  let current = node;

  while (isTypeAssertion(current)) {
    assertionCount += 1;
    hasNonConstAssertion ||= !isConstAssertion(current);
    current = unwrapParentheses(current.expression);
  }

  return assertionCount > 1 && hasNonConstAssertion;
};

const noChainedTypeAssertions = {
  meta: {
    type: "problem",
    messages: {
      chained:
        "This assertion chain discards type evidence. Keep the original precise type, or parse untrusted input at its boundary before narrowing it.",
    },
  },
  create(context) {
    const check = (node) => {
      if (isOutermostAssertion(node) && isForbiddenAssertionChain(node)) {
        context.report({ node, messageId: "chained" });
      }
    };
    return { TSAsExpression: check, TSTypeAssertion: check };
  },
};

const resolveVariable = (sourceCode, identifier) => {
  let scope = sourceCode.getScope(identifier);
  while (scope !== null) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) return variable;
    scope = scope.upper;
  }
  return null;
};

const importedName = (node) => {
  if (node.type !== "ImportSpecifier") return null;
  return node.imported.type === "Identifier"
    ? node.imported.name
    : node.imported.value;
};

const isTestFrameworkObject = (sourceCode, expression) => {
  if (expression.type !== "Identifier") return false;
  if (
    (expression.name === "vi" || expression.name === "jest") &&
    sourceCode.isGlobalReference(expression)
  ) {
    return true;
  }

  const variable = resolveVariable(sourceCode, expression);
  if (variable === null || variable.defs.length === 0) {
    return expression.name === "vi" || expression.name === "jest";
  }

  return variable.defs.some((definition) => {
    if (
      definition.type !== "ImportBinding" ||
      definition.parent?.type !== "ImportDeclaration"
    ) {
      return false;
    }
    const source = definition.parent.source.value;
    const name = importedName(definition.node);
    return (
      (source === "vitest" && name === "vi") ||
      (source === "@jest/globals" && name === "jest")
    );
  });
};

const isModuleMockCall = (sourceCode, callee) => {
  if (callee.type !== "MemberExpression") return false;
  if (!isTestFrameworkObject(sourceCode, callee.object)) return false;

  const method = callee.computed
    ? callee.property.type === "Literal"
      ? callee.property.value
      : null
    : callee.property.type === "Identifier"
      ? callee.property.name
      : null;

  return typeof method === "string" && MODULE_MOCK_METHODS.has(method);
};

const noModuleMocking = {
  meta: {
    type: "problem",
    messages: {
      moduleMock:
        "Replace module mocking with dependency injection through a real interface, service layer, or faithful test implementation.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      CallExpression(node) {
        if (isModuleMockCall(sourceCode, node.callee)) {
          context.report({ node, messageId: "moduleMock" });
        }
      },
    };
  },
};

export default {
  meta: { name: "anti-slop" },
  rules: {
    "no-chained-type-assertions": noChainedTypeAssertions,
    "no-module-mocking": noModuleMocking,
  },
};
