// Stub for ajv in e2e tests
// MCP SDK imports ajv at top level even though agents uses CfWorkerJsonSchemaValidator
// ajv is CJS and doesn't work in Workers Vitest pool

export class default_ {
  compile() {
    return () => true;
  }
  addSchema() {
    return this;
  }
  addFormat() {
    return this;
  }
  addKeyword() {
    return this;
  }
  getSchema() {
    return undefined;
  }
}

export default default_;
export { default_ as Ajv };

// Named exports that ajv/dist/core.js exports
export const KeywordCxt = {};
export const _ = () => {};
export const str = () => {};
export const stringify = () => {};
export const nil = {};
export class Name {
  _stub = true;
}
export class CodeGen {
  _stub = true;
}
