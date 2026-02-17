// lib/help-art.js — ASCII art banner + QR code for fnx help output
//
// Azure Functions ASCII art credit: marcduiker/azure-functions-ascii-art (MIT)
// QR encodes: https://learn.microsoft.com/azure/azure-functions/

import { dim, url as urlColor, enabled, codes } from './colors.js';

// Two-tone lightning bolt colors from the original SVG:
//   lightning1 (#FBF500) → bright yellow (\x1b[93m])
//   lightning2 (#797C00) → dark yellow   (\x1b[33m])
//   brackets   (#007F7E) → cyan          (\x1b[36m])
const brightYellow = (s) => enabled ? `\x1b[93m${s}${codes.reset}` : s;
const darkYellow   = (s) => enabled ? `\x1b[33m${s}${codes.reset}` : s;
const cyan         = (s) => enabled ? `\x1b[36m${s}${codes.reset}` : s;

// Each entry: { line, bright, dark } where bright/dark are the count of
// %-chars colored as lightning1 vs lightning2 (derived from the SVG coords).
const ART = [
  { line: '                  %%%%%%',          bright: 3, dark: 3 },
  { line: '                 %%%%%%',           bright: 3, dark: 3 },
  { line: '            @   %%%%%%    @',       bright: 3, dark: 3 },
  { line: '          @@   %%%%%%      @@',     bright: 3, dark: 3 },
  { line: '       @@@    %%%%%%%%%%%    @@@',  bright: 3, dark: 8 },
  { line: '     @@      %%%%%%%%%%        @@', bright: 7, dark: 3 },
  { line: '       @@         %%%%       @@',   bright: 1, dark: 3 },
  { line: '         @@      %%%       @@',     bright: 1, dark: 2 },
  { line: '           @@    %%      @@',       bright: 1, dark: 1 },
  { line: '                %%',                bright: 1, dark: 1 },
  { line: '                %',                 bright: 0, dark: 1 },
];

// Pre-generated QR code (qrcode npm, utf8 output, leading/trailing padding stripped).
// URL: https://learn.microsoft.com/azure/azure-functions/
const QR = [
  `█▀▀▀▀▀█ ▀▀▀    ▀██▀▄  ▄▀█ █▀▀▀▀▀█`,
  `█ ███ █ ▄▄█▀█▀▄█▀▄▄██▀▀ █ █ ███ █`,
  `█ ▀▀▀ █ ██ ▄█ █ ▄▄▀█▀█▄▀  █ ▀▀▀ █`,
  `▀▀▀▀▀▀▀ █▄█ █ ▀▄█▄▀ ▀▄█ ▀ ▀▀▀▀▀▀▀`,
  `▀▄  ▀ ▀▀▀▄▄▀▀▄ ▄▄▀ ▀▀█▀▄▀█▀▀▀█▄▄▀`,
  `  ▀██ ▀▄▄   █ ▄▀ █▄▄▀█▀▀ █   ▀ ▄`,
  `▀ █▀▄▄▀▄▄▄ ▄ ▀▀▀▄ ▀█▀█▀▄▀█▀▄▀█  ▀`,
  `▄▀▀▀█▄▀ ▄ ▄▀█▄▀ ▀█▀█▄█ ▀▄███▄ ▀▀`,
  `▄██▀▀ ▀▀ █ █ ▄▀█ ██  █▀█ ▄▀ ▀▄▄█`,
  `   ▄█▄▀▄▄█▀ ▀ ▀█  ▀▄█▄ █▀█▀█ ▀ ▀▄`,
  `▄ ▀▀█▀▀▀▄█  ▀ ▀▀▀▄▄▄██▀▄▀▄▀█▀▀▄█▀`,
  `     █▀▄ ▄    ▀█▄▄▀▄██▀██▀▀ █  ▀▄`,
  `▀▀▀▀▀ ▀ ▄██▄▄▀▄▄▄▀▄ ▀█▀ █▀▀▀█▀▄▀▀`,
  `█▀▀▀▀▀█ ▀▄▀▄▀▄█▀ █▄▄ ▄▄ █ ▀ █▀ █`,
  `█ ███ █ ▀█ ▄█▀ ▀▄ ▀▀█▀█▄█▀███▀  ▀`,
  `█ ▀▀▀ █  █ ▀▄▀█ ▀▄▄▄▀▄▀ ▄▄▀▀▀▀▀`,
  `▀▀▀▀▀▀▀ ▀▀▀▀▀▀ ▀ ▀ ▀ ▀▀▀▀▀   ▀  ▀`,
];

const DOCS_URL = 'https://learn.microsoft.com/azure/azure-functions/';
const ART_WIDTH = 33;  // widest art line (line 6)

function colorizeArtLine(line, bright, dark) {
  if (!enabled) return line;
  return line
    .replace(/@+/g, (m) => cyan(m))
    .replace(/%+/g, (m) => {
      const b = m.slice(0, bright);
      const d = m.slice(bright);
      return (b ? brightYellow(b) : '') + (d ? darkYellow(d) : '');
    });
}

/**
 * Render the Azure Functions banner (colorized ASCII art + QR code).
 * Adapts to terminal width: side-by-side ≥ 74 cols, art-only ≥ 40, URL-only otherwise.
 */
export function renderBanner() {
  const cols = process.stdout.columns || 80;
  const isTTY = process.stdout.isTTY !== false;

  if (isTTY && cols >= 74) return renderSideBySide();
  if (isTTY && cols >= 40) return renderArtOnly();
  return `  ${dim('Docs:')} ${urlColor(DOCS_URL)}`;
}

function renderArtOnly() {
  const lines = ART.map(({ line, bright, dark }) =>
    colorizeArtLine(line, bright, dark),
  );
  lines.push('');
  lines.push(`  ${dim('Docs:')} ${urlColor(DOCS_URL)}`);
  return lines.join('\n');
}

function renderSideBySide() {
  const topPad = Math.floor((QR.length - ART.length) / 2); // 3
  const blankArt = ' '.repeat(ART_WIDTH);
  const gap = '    ';
  const lines = [];

  for (let i = 0; i < QR.length; i++) {
    const artIdx = i - topPad;
    let artCol;
    if (artIdx >= 0 && artIdx < ART.length) {
      const { line, bright, dark } = ART[artIdx];
      artCol = colorizeArtLine(line.padEnd(ART_WIDTH), bright, dark);
    } else {
      artCol = blankArt;
    }
    lines.push(artCol + gap + QR[i]);
  }

  lines.push('');
  lines.push(blankArt + gap + dim('Scan for Azure Functions docs'));
  lines.push(blankArt + gap + urlColor(DOCS_URL));
  return lines.join('\n');
}
