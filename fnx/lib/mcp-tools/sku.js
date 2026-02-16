/**
 * MCP SKU tool definitions for the hand-rolled MCP server.
 * Uses profile-resolver to read SKU profiles (bundled/cached/CDN).
 *
 * Tools: get_sku_profile, compare_skus
 */

import { resolveProfile, listProfiles } from '../profile-resolver.js';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLED_PROFILES_PATH = join(__dirname, '..', '..', 'profiles', 'sku-profiles.json');

async function loadAllProfiles() {
  // Try bundled profiles directly (fast, no network)
  const raw = await readFile(BUNDLED_PROFILES_PATH, 'utf-8');
  return JSON.parse(raw);
}

export function getSkuTools() {
  return [
    {
      name: 'get_sku_profile',
      description:
        `Get SKU profile details for Azure Functions hosting plans.\n\n` +
        `Returns host version, extension bundle version, status, and notes.\n` +
        `Call with no arguments to list all SKUs, or provide a SKU name for details.\n` +
        `Use this to check SKU compatibility before suggesting features.`,
      inputSchema: {
        type: 'object',
        properties: {
          sku: {
            type: 'string',
            description:
              'SKU name (e.g., flex, linux-premium, windows-consumption). Omit to list all.',
          },
        },
      },
      async handler(args) {
        try {
          if (args.sku) {
            const profile = await resolveProfile(args.sku);
            let text = `# SKU Profile: ${profile.displayName}\n\n`;
            text += `| Property | Value |\n|---|---|\n`;
            text += `| SKU Key | ${args.sku} |\n`;
            text += `| Display Name | ${profile.displayName} |\n`;
            text += `| Host Version | ${profile.hostVersion} |\n`;
            text += `| Host Git Tag | ${profile.hostGitTag} |\n`;
            text += `| Extension Bundle | ${profile.extensionBundleVersion} |\n`;
            text += `| Max Bundle Version | ${profile.maxExtensionBundleVersion || 'n/a'} |\n`;
            text += `| Status | ${profile.status} |\n`;
            if (profile.retirementDate) {
              text += `| Retirement Date | ${profile.retirementDate} |\n`;
            }
            text += `| Notes | ${profile.notes} |\n`;
            return { content: [{ type: 'text', text }] };
          }

          // List all profiles
          const registry = await loadAllProfiles();
          let text = `# Azure Functions SKU Profiles\n\n`;
          text += `| SKU | Display Name | Host Version | Bundle Version | Max Bundle | Status |\n`;
          text += `|-----|-------------|-------------|---------------|-----------|--------|\n`;
          for (const [key, p] of Object.entries(registry.profiles)) {
            text += `| ${key} | ${p.displayName} | ${p.hostVersion} | ${p.extensionBundleVersion} | ${p.maxExtensionBundleVersion || 'n/a'} | ${p.status} |\n`;
          }
          text += `\n*Last updated: ${registry.updatedAt}*\n`;
          return { content: [{ type: 'text', text }] };
        } catch (err) {
          return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
      },
    },
    {
      name: 'compare_skus',
      description:
        `Compare two Azure Functions SKU profiles side by side.\n\n` +
        `Shows differences in host version, bundle version, status, and capabilities.\n` +
        `Use this to understand deployment target differences.`,
      inputSchema: {
        type: 'object',
        properties: {
          sku1: { type: 'string', description: 'First SKU name (e.g., flex)' },
          sku2: { type: 'string', description: 'Second SKU name (e.g., windows-consumption)' },
        },
        required: ['sku1', 'sku2'],
      },
      async handler(args) {
        try {
          const [p1, p2] = await Promise.all([
            resolveProfile(args.sku1),
            resolveProfile(args.sku2),
          ]);

          let text = `# SKU Comparison: ${args.sku1} vs ${args.sku2}\n\n`;
          text += `| Property | ${p1.displayName} | ${p2.displayName} |\n`;
          text += `|----------|---|---|\n`;
          text += `| Host Version | ${p1.hostVersion} | ${p2.hostVersion} |\n`;
          text += `| Extension Bundle | ${p1.extensionBundleVersion} | ${p2.extensionBundleVersion} |\n`;
          text += `| Max Bundle | ${p1.maxExtensionBundleVersion || 'n/a'} | ${p2.maxExtensionBundleVersion || 'n/a'} |\n`;
          text += `| Status | ${p1.status} | ${p2.status} |\n`;

          // Highlight differences
          const diffs = [];
          if (p1.hostVersion !== p2.hostVersion) {
            diffs.push(`Host version differs: ${p1.hostVersion} vs ${p2.hostVersion}`);
          }
          if (p1.extensionBundleVersion !== p2.extensionBundleVersion) {
            diffs.push(`Bundle version range differs: ${p1.extensionBundleVersion} vs ${p2.extensionBundleVersion}`);
          }
          if (p1.maxExtensionBundleVersion !== p2.maxExtensionBundleVersion) {
            diffs.push(`Max bundle cap differs: ${p1.maxExtensionBundleVersion || 'n/a'} vs ${p2.maxExtensionBundleVersion || 'n/a'}`);
          }
          if (p1.status !== p2.status) {
            diffs.push(`Status differs: ${p1.status} vs ${p2.status}`);
          }

          if (diffs.length > 0) {
            text += `\n## Key Differences\n\n`;
            for (const d of diffs) {
              text += `- ⚠️ ${d}\n`;
            }
          } else {
            text += `\n✅ These SKUs have identical configurations.\n`;
          }

          return { content: [{ type: 'text', text }] };
        } catch (err) {
          return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
      },
    },
  ];
}
