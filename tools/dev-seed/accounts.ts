// The local Google stand-in's accounts (scripts/dev.ts). The stand-in always has
// testuser@gmail.com, whose library the dev server fills with the test links;
// the empty account's library is never filled, for testing a new user.
export const SEEDED_ACCOUNT = "testuser@gmail.com";

export const EMPTY_ACCOUNT = {
  email: "empty@cloudstash.test",
  name: "Empty Library",
} as const;
