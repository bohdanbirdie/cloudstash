// One program, one set of Cloudflare runtime types: the GLOBAL declarations
// from @cloudflare/workers-types/index.d.ts (loaded via the triple-slash
// references in src/cf-worker). Under moduleResolution "bundler", a bare
// `import "@cloudflare/workers-types"` (e.g. @livestore/common-cf's CfTypes)
// resolves to the package's MODULE variant (index.ts) — a second declaration
// set that is structurally incompatible with the DOM-merged globals, breaking
// e.g. `handleSyncUpdateRpc(this.ctx, …)`. The tsconfig `paths` entry maps
// that specifier here instead, re-exporting the globals under the module's
// names. Missing a name a dependency uses fails loudly — extend the list.

import $Rpc = Rpc;

type $DurableObject = DurableObject;
type $DurableObjectNamespace<
  T extends Rpc.DurableObjectBranded | undefined = undefined,
> = DurableObjectNamespace<T>;
type $DurableObjectState<Props = unknown> = DurableObjectState<Props>;
type $DurableObjectStorage = DurableObjectStorage;
type $DurableObjectStub<
  T extends Rpc.DurableObjectBranded | undefined = undefined,
> = DurableObjectStub<T>;
type $D1Database = D1Database;
type $ExecutionContext<Props = unknown> = ExecutionContext<Props>;
type $HeadersInit = HeadersInit;
type $ReadableStream<R = any> = ReadableStream<R>;
type $Request<
  CfHostMetadata = unknown,
  Cf = CfProperties<CfHostMetadata>,
> = Request<CfHostMetadata, Cf>;
type $Response = Response;
type $SqlStorage = SqlStorage;
type $WebSocket = WebSocket;

export type {
  $DurableObject as DurableObject,
  $DurableObjectNamespace as DurableObjectNamespace,
  $DurableObjectState as DurableObjectState,
  $DurableObjectStorage as DurableObjectStorage,
  $DurableObjectStub as DurableObjectStub,
  $D1Database as D1Database,
  $ExecutionContext as ExecutionContext,
  $HeadersInit as HeadersInit,
  $ReadableStream as ReadableStream,
  $Request as Request,
  $Response as Response,
  $SqlStorage as SqlStorage,
  $WebSocket as WebSocket,
};
export { $Rpc as Rpc };
