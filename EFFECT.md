# Effect Best Practices

This document contains patterns and best practices for writing idiomatic Effect code.
Reference: https://www.effect.solutions/

## Basics

### Effect.gen

Just as `async/await` provides a sequential, readable way to work with `Promise` values, `Effect.gen` and `yield*` provide the same ergonomic benefits for `Effect` values.

```typescript
import { Effect } from 'effect'

const program = Effect.gen(function* () {
  const data = yield* fetchData
  yield* Effect.logInfo(`Processing data: ${data}`)
  return yield* processData(data)
})
```

### Effect.fn

Use `Effect.fn` with generator functions for traced, named effects. `Effect.fn` traces where the function is called from, not just where it's defined:

```typescript
import { Effect } from 'effect'

const processUser = Effect.fn('processUser')(function* (userId: string) {
  yield* Effect.logInfo(`Processing user ${userId}`)
  const user = yield* getUser(userId)
  return yield* processData(user)
})
```

**Benefits:**

- Call-site tracing for each invocation
- Stack traces with location details
- Clean signatures
- Automatic spans for telemetry

### Pipe for Instrumentation

Use `.pipe()` to add cross-cutting concerns to Effect values:

```typescript
import { Effect, Schedule } from 'effect'

const program = fetchData.pipe(
  Effect.timeout('5 seconds'),
  Effect.retry(Schedule.exponential('100 millis').pipe(Schedule.compose(Schedule.recurs(3)))),
  Effect.tap((data) => Effect.logInfo(`Fetched: ${data}`)),
  Effect.withSpan('fetchData'),
)
```

**Common instrumentation:**

- `Effect.timeout` - fail if effect takes too long
- `Effect.retry` - retry on failure with a schedule
- `Effect.tap` - run side effect without changing the value
- `Effect.withSpan` - add tracing span

## Services & Layers

### Defining Services

A service is defined using `Context.Tag` as a class:

```typescript
import { Context, Effect } from 'effect'

class Database extends Context.Tag('@app/Database')<
  Database,
  {
    readonly query: (sql: string) => Effect.Effect<unknown[]>
    readonly execute: (sql: string) => Effect.Effect<void>
  }
>() {}
```

**Rules:**

- Tag identifiers must be unique. Use `@path/to/ServiceName` prefix pattern
- Service methods should have no dependencies (`R = never`). Dependencies are handled via Layer composition
- Use readonly properties

### Implementing Layers

A Layer is an implementation of a service:

```typescript
import { Context, Effect, Layer } from 'effect'

class Users extends Context.Tag('@app/Users')<
  Users,
  {
    readonly findById: (id: UserId) => Effect.Effect<User, UsersError>
  }
>() {
  static readonly layer = Layer.effect(
    Users,
    Effect.gen(function* () {
      // 1. yield* services you depend on
      const http = yield* HttpClient.HttpClient

      // 2. define the service methods with Effect.fn for call-site tracing
      const findById = Effect.fn('Users.findById')(function* (id: UserId) {
        const response = yield* http.get(`/users/${id}`)
        return yield* HttpClientResponse.schemaBodyJson(User)(response)
      })

      // 3. return the service
      return Users.of({ findById })
    }),
  )
}
```

**Layer naming:** camelCase with `Layer` suffix: `layer`, `testLayer`, `postgresLayer`, etc.

### Providing Layers

Use `Effect.provide` once at the top of your application:

```typescript
const appLayer = userServiceLayer.pipe(
  Layer.provideMerge(databaseLayer),
  Layer.provideMerge(loggerLayer),
  Layer.provideMerge(configLayer),
)

const main = program.pipe(Effect.provide(appLayer))
Effect.runPromise(main)
```

### Test Implementations

Create lightweight test implementations with `Layer.sync`:

```typescript
class Database extends Context.Tag("@app/Database")<...>() {
  static readonly testLayer = Layer.sync(Database, () => {
    let records: Record<string, unknown> = {}

    const query = (sql: string) => Effect.succeed(Object.values(records))
    const execute = (sql: string) => Console.log(`Test execute: ${sql}`)

    return Database.of({ query, execute })
  })
}
```

## Data Modeling

### Schema.Class for Records

Use `Schema.Class` for composite data models:

```typescript
import { Schema } from 'effect'

const UserId = Schema.String.pipe(Schema.brand('UserId'))
type UserId = typeof UserId.Type

export class User extends Schema.Class<User>('User')({
  id: UserId,
  name: Schema.String,
  email: Schema.String,
  createdAt: Schema.Date,
}) {
  get displayName() {
    return `${this.name} (${this.email})`
  }
}
```

### Branded Types

Use branded types to prevent mixing values with the same underlying type:

```typescript
import { Schema } from 'effect'

export const UserId = Schema.String.pipe(Schema.brand('UserId'))
export type UserId = typeof UserId.Type

export const PostId = Schema.String.pipe(Schema.brand('PostId'))
export type PostId = typeof PostId.Type

// These are now incompatible types
const userId = UserId.make('user-123')
const postId = PostId.make('post-456')
```

**In a well-designed domain model, nearly all primitives should be branded.**

### Variants with TaggedClass

For structured variants with fields:

```typescript
import { Match, Schema } from 'effect'

export class Success extends Schema.TaggedClass<Success>()('Success', {
  value: Schema.Number,
}) {}

export class Failure extends Schema.TaggedClass<Failure>()('Failure', {
  error: Schema.String,
}) {}

export const Result = Schema.Union(Success, Failure)
export type Result = typeof Result.Type

// Pattern match
Match.valueTags(result, {
  Success: ({ value }) => `Got: ${value}`,
  Failure: ({ error }) => `Error: ${error}`,
})
```

### JSON Encoding/Decoding

Use `Schema.parseJson` to parse and validate JSON strings:

```typescript
import { Effect, Schema } from 'effect'

class Move extends Schema.Class<Move>('Move')({
  from: Position,
  to: Position,
}) {}

const MoveFromJson = Schema.parseJson(Move)

const program = Effect.gen(function* () {
  const move = yield* Schema.decodeUnknown(MoveFromJson)(jsonString)
  const json = yield* Schema.encode(MoveFromJson)(move)
  return json
})
```

## Error Handling

### Schema.TaggedError

Define domain errors with `Schema.TaggedError`:

```typescript
import { Schema } from 'effect'

class ValidationError extends Schema.TaggedError<ValidationError>()('ValidationError', {
  field: Schema.String,
  message: Schema.String,
}) {}

class NotFoundError extends Schema.TaggedError<NotFoundError>()('NotFoundError', {
  resource: Schema.String,
  id: Schema.String,
}) {}
```

**Benefits:**

- Serializable (can send over network/save to DB)
- Type-safe with built-in `_tag` for pattern matching
- Yieldable - can be used directly without `Effect.fail()`

### Yieldable Errors

`Schema.TaggedError` creates yieldable errors:

```typescript
// ✅ Good: Yieldable errors can be used directly
return error.response.status === 404 ? UserNotFoundError.make({ id }) : Effect.die(error)

// ❌ Redundant: no need to wrap with Effect.fail
return error.response.status === 404
  ? Effect.fail(UserNotFoundError.make({ id }))
  : Effect.die(error)
```

### Recovering from Errors

**catchTag** - Handle specific errors by their `_tag`:

```typescript
const recovered = program.pipe(
  Effect.catchTag('HttpError', (error) =>
    Effect.gen(function* () {
      yield* Effect.logWarning(`HTTP ${error.statusCode}`)
      return 'Recovered from HttpError'
    }),
  ),
)
```

**catchTags** - Handle multiple error types:

```typescript
const recovered = program.pipe(
  Effect.catchTags({
    HttpError: () => Effect.succeed('Recovered from HttpError'),
    ValidationError: () => Effect.succeed('Recovered from ValidationError'),
  }),
)
```

### Expected Errors vs Defects

**Use typed errors** for domain failures the caller can handle: validation errors, "not found", permission denied.

**Use defects** for unrecoverable situations: bugs and invariant violations.

```typescript
// At app entry: if config fails, nothing can proceed
const main = Effect.gen(function* () {
  const config = yield* loadConfig.pipe(Effect.orDie)
  yield* Effect.log(`Starting on port ${config.port}`)
})
```

### Schema.Defect for Unknown Errors

Use `Schema.Defect` to wrap unknown errors from external libraries:

```typescript
class ApiError extends Schema.TaggedError<ApiError>()('ApiError', {
  endpoint: Schema.String,
  statusCode: Schema.Number,
  error: Schema.Defect, // Wrap the underlying error
}) {}

const fetchUser = (id: string) =>
  Effect.tryPromise({
    try: () => fetch(`/api/users/${id}`).then((r) => r.json()),
    catch: (error) =>
      ApiError.make({
        endpoint: `/api/users/${id}`,
        statusCode: 500,
        error,
      }),
  })
```

## TypeScript Configuration

Key settings for Effect projects:

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "plugins": [{ "name": "@effect/language-service" }],
  },
}
```

For build-time diagnostics: `bunx effect-language-service patch`
