// Canonical regulatory micro-copy. Kept in a React-free module so unit
// tests can pin the strings without pulling in React Native (which Node's
// test runner can't resolve).
//
// Edit with care — every change to these strings is effectively a legal
// copy change. Disclaimer.test.ts will fail loudly on accidental edits.

export const AI_DISCLAIMER_TEXT =
  "AI-generated summary — may be incomplete or inaccurate. Not financial advice.";

export const DATA_DISCLAIMER_TEXT =
  "Market data provided by Yahoo Finance. Quotes may be delayed up to 15 minutes and are for informational purposes only — not for trading decisions.";
