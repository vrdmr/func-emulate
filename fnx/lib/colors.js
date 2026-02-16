// lib/colors.js — zero-dependency ANSI color helper
// Matches func start theme from OutputTheme.cs

const enabled = !process.env.NO_COLOR && process.stdout.isTTY !== false;

const codes = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
};

const c = (code) => (str) => enabled ? `${code}${str}${codes.reset}` : str;

export const title    = c(codes.cyan);           // DarkCyan  — banner, section headers
export const info     = c(codes.cyan);           // DarkCyan  — [fnx] prefixed lines
export const funcName = c(codes.yellow);         // DarkYellow — function names
export const url      = c(codes.green);          // DarkGreen  — URLs
export const success  = c(codes.green);          // DarkGreen  — ✓ success
export const error    = c(codes.red);            // Red        — errors, ✗
export const warning  = c(codes.yellow);         // DarkYellow — ⚠️ warnings
export const verbose  = c(codes.green);          // DarkGreen  — debug/verbose
export const dim      = c(codes.gray);           // DarkGray   — low-priority
export const bold     = c(codes.bold);           // Bold       — emphasis

// Highlight URLs within a string
export function highlightUrls(str) {
  return str.replace(/(https?:\/\/[^\s,)]+)/g, (m) => url(m));
}

export { enabled, codes };
