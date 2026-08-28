declare const value: unknown;

const direct = value as string;
const chained = value as unknown as string;
const parenthesized = (value as unknown) as string;

void direct;
void chained;
void parenthesized;
