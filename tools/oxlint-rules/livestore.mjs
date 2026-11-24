const MATERIALIZER_FACTORIES = new Set(["materializers", "defineMaterializer"]);

const calleeName = (callee) => {
  if (callee.type === "Identifier") return callee.name;
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier"
  ) {
    return callee.property.name;
  }
  return undefined;
};

const insideMaterializer = (node) => {
  for (let current = node.parent; current; current = current.parent) {
    if (
      current.type === "CallExpression" &&
      MATERIALIZER_FACTORIES.has(calleeName(current.callee))
    ) {
      return true;
    }
  }
  return false;
};

const isIdentifier = (node, name) =>
  node.type === "Identifier" && node.name === name;

const isMember = (node, object, property) =>
  node.type === "MemberExpression" &&
  !node.computed &&
  node.property.type === "Identifier" &&
  node.property.name === property &&
  object(node.object);

const isCrypto = (node) =>
  isIdentifier(node, "crypto") ||
  isMember(node, (object) => isIdentifier(object, "globalThis"), "crypto");

const pureMaterializers = {
  meta: {
    type: "problem",
    messages: {
      impure:
        "Materializers must be pure: {{name}} gives a different value on every replay, so replicas diverge (CS.SYS.DATA-R03). Put the value in the event payload instead.",
    },
  },
  create(context) {
    const report = (node, name) => {
      if (insideMaterializer(node)) {
        context.report({ node, messageId: "impure", data: { name } });
      }
    };
    return {
      MemberExpression(node) {
        if (isMember(node, (object) => isIdentifier(object, "Date"), "now")) {
          report(node, "Date.now");
        } else if (
          isMember(node, (object) => isIdentifier(object, "Math"), "random")
        ) {
          report(node, "Math.random");
        } else if (isMember(node, isCrypto, "randomUUID")) {
          report(node, "crypto.randomUUID");
        }
      },
      NewExpression(node) {
        if (isIdentifier(node.callee, "Date") && node.arguments.length === 0) {
          report(node, "new Date()");
        }
      },
      CallExpression(node) {
        if (isIdentifier(node.callee, "Date")) report(node, "Date()");
        if (isIdentifier(node.callee, "nanoid")) report(node, "nanoid()");
      },
    };
  },
};

export default {
  meta: { name: "livestore" },
  rules: { "pure-materializers": pureMaterializers },
};
