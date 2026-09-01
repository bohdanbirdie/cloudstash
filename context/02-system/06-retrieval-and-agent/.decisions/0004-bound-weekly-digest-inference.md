# Bound weekly digest inference

Status: accepted

## Context

A weekly digest previously passed every eligible link to the model and had no
explicit output ceiling. Taking only the newest links would bound cost but could
erase the beginning of an active week.

## Evidence and Argument

A local comparison generated digests for representative 12-, 50-, and 100-link
weeks with 256- and 384-token ceilings. One 256-token response ended mid-sentence
with `finishReason: length`. All 384-token responses completed normally, cited
two or three links, and used 145–314 output tokens.

## Options

| Option                                          | Tradeoff                                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| Keep every link and no output ceiling           | Maximum context, but cost is unbounded and provider defaults control output. |
| Take only the newest 100 links                  | Simple bound, but erases earlier parts of a high-activity week.              |
| Sample 100 across the week and allow 384 tokens | Bounded input while preserving chronology and complete short responses.      |

## Decision

Order eligible links chronologically and, above 100 links, select 100 evenly
spaced entries including the first and last. Normalize and bound titles,
summaries, and tag lists at the final provider boundary, preserve only exact URLs
that fit, and cap the complete user prompt at 24,000 characters. Treat every
saved-link field as untrusted data. Cap digest output at 384 tokens.

## Consequences

- Input cost remains bounded while every part of an ordinary week is represented;
  pathological records may be omitted rather than partially cited.
- The stored digest remains short because the 70-word prose instruction is
  unchanged; 384 is a safety envelope, not a length target.
- No batching, provider cache, or additional persisted state is introduced.
