const MODULE_MOCK_METHODS = new Set(["doMock", "mock", "unstable_mockModule"]);
const SPY_METHODS = new Set(["spyOn"]);

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

const isImportedIdentifier = (
  sourceCode,
  expression,
  expectedName,
  sourceMatches
) => {
  if (expression.type !== "Identifier") return false;

  const variable = resolveVariable(sourceCode, expression);
  if (variable === null) return false;

  return variable.defs.some((definition) => {
    if (
      definition.type !== "ImportBinding" ||
      definition.parent?.type !== "ImportDeclaration"
    ) {
      return false;
    }

    return (
      importedName(definition.node) === expectedName &&
      sourceMatches(definition.parent.source.value)
    );
  });
};

const memberName = (member) => {
  if (member.type !== "MemberExpression") return null;
  if (member.computed) {
    return member.property.type === "Literal" ? member.property.value : null;
  }
  return member.property.type === "Identifier" ? member.property.name : null;
};

const isEffectMemberCall = (sourceCode, expression, method) =>
  expression.type === "CallExpression" &&
  expression.callee.type === "MemberExpression" &&
  memberName(expression.callee) === method &&
  isImportedIdentifier(
    sourceCode,
    expression.callee.object,
    "Effect",
    (source) => source === "effect"
  );

const isAppLayerLiveCall = (sourceCode, expression) =>
  expression?.type === "CallExpression" &&
  isImportedIdentifier(
    sourceCode,
    expression.callee,
    "AppLayerLive",
    (source) =>
      source === "@/cf-worker/auth/service" ||
      (source.startsWith(".") && /(?:^|\/)auth\/service$/.test(source))
  );

const noHiddenAppLayerOutputs = {
  meta: {
    type: "problem",
    messages: {
      hidden:
        "Layer.provide hides AppLayerLive outputs, including tracing. Use Layer.provideMerge, or provide AppLayerLive at the Effect runtime boundary.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      CallExpression(node) {
        if (
          node.callee.type !== "MemberExpression" ||
          memberName(node.callee) !== "provide" ||
          !isImportedIdentifier(
            sourceCode,
            node.callee.object,
            "Layer",
            (source) => source === "effect"
          ) ||
          !isAppLayerLiveCall(sourceCode, node.arguments[0])
        ) {
          return;
        }

        context.report({ node, messageId: "hidden" });
      },
    };
  },
};

const propertyName = (property) => {
  if (property.type !== "Property" || property.computed) return null;
  if (property.key.type === "Identifier") return property.key.name;
  return property.key.type === "Literal" ? property.key.value : null;
};

const isCapabilityDisabledRecovery = (sourceCode, expression) => {
  if (isEffectMemberCall(sourceCode, expression, "catchTag")) {
    return (
      expression.arguments[0]?.type === "Literal" &&
      expression.arguments[0].value === "CapabilityDisabledError"
    );
  }

  if (!isEffectMemberCall(sourceCode, expression, "catchTags")) return false;
  const handlers = expression.arguments[0];
  return (
    handlers?.type === "ObjectExpression" &&
    handlers.properties.some(
      (property) => propertyName(property) === "CapabilityDisabledError"
    )
  );
};

const noCapabilityRecoveryAfterSpan = {
  meta: {
    type: "problem",
    messages: {
      recoveryAfterSpan:
        "Recover CapabilityDisabledError before creating the operation span, or pass the recovery as an Effect.fn transformation, so an expected plan denial does not finalize the span as an error.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      CallExpression(node) {
        if (
          node.callee.type !== "MemberExpression" ||
          memberName(node.callee) !== "pipe"
        ) {
          return;
        }

        const spanIndex = node.arguments.findIndex((argument) =>
          isEffectMemberCall(sourceCode, argument, "withSpan")
        );
        if (spanIndex === -1) return;

        for (const argument of node.arguments.slice(spanIndex + 1)) {
          if (isCapabilityDisabledRecovery(sourceCode, argument)) {
            context.report({ node: argument, messageId: "recoveryAfterSpan" });
          }
        }
      },
    };
  },
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

const isTestSpyCall = (sourceCode, callee) => {
  if (callee.type !== "MemberExpression") return false;
  if (!isTestFrameworkObject(sourceCode, callee.object)) return false;
  const method = memberName(callee);
  return typeof method === "string" && SPY_METHODS.has(method);
};

const noTestSpies = {
  meta: {
    type: "problem",
    messages: {
      spy: "Replace test spies with dependency injection through a real service/layer seam or a faithful test implementation.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      CallExpression(node) {
        if (isTestSpyCall(sourceCode, node.callee)) {
          context.report({ node, messageId: "spy" });
        }
      },
    };
  },
};

export default {
  meta: { name: "anti-slop" },
  rules: {
    "no-chained-type-assertions": noChainedTypeAssertions,
    "no-hidden-app-layer-outputs": noHiddenAppLayerOutputs,
    "no-capability-recovery-after-span": noCapabilityRecoveryAfterSpan,
    "no-module-mocking": noModuleMocking,
    "no-test-spies": noTestSpies,
  },
};
