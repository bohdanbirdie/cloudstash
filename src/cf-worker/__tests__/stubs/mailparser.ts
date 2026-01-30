// Stub for mailparser to avoid Workers-incompatible dependencies in tests
// Only used for webhook parsing which we don't test
export const simpleParser = () => Promise.resolve({});
