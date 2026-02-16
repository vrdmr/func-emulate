// config.js — App config loader, validator, and auto-creator
//
// Reads app-config.yaml (primary) or auto-creates it from local.settings.json.
// Validates against config-schema.js, checks for secrets, manages .gitignore protection.

import { readFile, writeFile, access, readdir } from 'node:fs/promises';
import { join, resolve as resolvePath } from 'node:path';
import { createInterface } from 'node:readline';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { resolveEnvVars, validateStructure, ALLOWED_CONFIGURATIONS, STRUCTURED_FIELDS } from './config-schema.js';
import { detectSecrets } from './secret-patterns.js';
import { error as errorColor, warning as warningColor, success as successColor, info as infoColor, dim } from './colors.js';

const APP_CONFIG_FILE = 'app-config.yaml';
const LEGACY_APP_CONFIG_FILE = 'app.config.json';
const LOCAL_SETTINGS_FILE = 'local.settings.json';

// ── Public API ──

/**
 * Load and validate app configuration from the given app directory.
 *
 * Resolution order:
 *   1. app-config.yaml exists → read, validate, return
 *   2. app-config.yaml missing + local.settings.json exists → auto-create from local.settings.json
 *   3. Neither exists → interactive prompt to generate
 *
 * Returns: { config, envVars, mergedValues, workerRuntime, sku, skuSource }
 */
export async function loadConfig(appPath, opts = {}) {
  const appConfigPath = join(appPath, APP_CONFIG_FILE);
  const legacyConfigPath = join(appPath, LEGACY_APP_CONFIG_FILE);
  const localSettingsPath = join(appPath, LOCAL_SETTINGS_FILE);

  let config;
  const hasAppConfig = await fileExists(appConfigPath);
  const hasLegacyConfig = await fileExists(legacyConfigPath);
  const hasLocalSettings = await fileExists(localSettingsPath);

  if (hasAppConfig) {
    // Case 1: app-config.yaml exists
    config = await readAppConfig(appConfigPath);
  } else if (hasLegacyConfig) {
    // Case 1b: Legacy app.config.json — convert to structured format
    config = await readLegacyConfig(legacyConfigPath);
  } else if (hasLocalSettings) {
    // Case 2: Auto-create from local.settings.json
    config = await autoCreateFromLocalSettings(appPath, localSettingsPath);
  } else {
    // Case 3: Nothing exists — interactive or error
    const isInteractive = process.stdin.isTTY && !opts.nonInteractive;
    if (!isInteractive) {
      console.error(errorColor('Error: No app-config.yaml or local.settings.json found.'));
      console.error(dim(`  Create app-config.yaml in ${appPath} or run fnx interactively.`));
      process.exit(1);
    }
    config = await interactiveCreate(appPath);
  }

  // Validate structure
  const { warnings } = validateStructure(config);
  for (const w of warnings) {
    console.error(warningColor(`  ⚠ ${w}`));
  }

  // Secret detection
  const secrets = detectSecrets(config);
  if (secrets.length > 0) {
    await addToGitignore(appPath, APP_CONFIG_FILE);
    console.error(errorColor('\n  ✗ Secrets detected in app-config.yaml:'));
    for (const s of secrets) {
      console.error(errorColor(`    • ${s.path}: ${s.reason}`));
    }
    console.error(errorColor(`\n  app-config.yaml has been added to .gitignore as a safety measure.`));
    console.error(dim(`  Move secrets to local.settings.json, then remove app-config.yaml from .gitignore.`));
    process.exit(1);
  }

  // Ensure app-config.yaml is NOT in .gitignore (clean state)
  await removeFromGitignore(appPath, APP_CONFIG_FILE);

  // Resolve structured fields → env vars
  const { envVars, errors } = resolveEnvVars(config);
  if (errors.length > 0) {
    for (const e of errors) {
      console.error(errorColor(`  ✗ ${e}`));
    }
    process.exit(1);
  }

  // Read local.settings.json for secrets/overrides
  const localSettings = hasLocalSettings ? await readJsonFile(localSettingsPath) : null;
  const localValues = localSettings?.Values || {};

  // Merge: app-config.yaml envVars → local.settings.json overrides
  const mergedValues = { ...envVars, ...localValues };

  // Resolve worker runtime
  const workerRuntime = mergedValues.FUNCTIONS_WORKER_RUNTIME;

  // Resolve SKU: config.local.targetSku (CLI flag handled by caller)
  const sku = config.local?.targetSku || null;
  const skuSource = sku ? 'app-config.yaml' : null;

  return {
    config,
    envVars,
    mergedValues,
    workerRuntime,
    sku,
    skuSource,
  };
}

/**
 * Migrate local.settings.json → app-config.yaml (standalone command).
 * Returns the generated config object.
 */
export async function migrateConfig(appPath) {
  const appConfigPath = join(appPath, APP_CONFIG_FILE);
  const localSettingsPath = join(appPath, LOCAL_SETTINGS_FILE);

  if (await fileExists(appConfigPath)) {
    console.log(infoColor(`  app-config.yaml already exists at ${appConfigPath}`));
    return readAppConfig(appConfigPath);
  }

  if (!await fileExists(localSettingsPath)) {
    console.error(errorColor(`  No local.settings.json found at ${localSettingsPath}`));
    process.exit(1);
  }

  return autoCreateFromLocalSettings(appPath, localSettingsPath);
}

/**
 * Validate app-config.yaml (standalone command).
 * Returns { valid, errors, warnings, secrets }.
 */
export async function validateConfig(appPath) {
  const appConfigPath = join(appPath, APP_CONFIG_FILE);

  if (!await fileExists(appConfigPath)) {
    return { valid: false, errors: ['app-config.yaml not found'], warnings: [], secrets: [] };
  }

  const config = await readAppConfig(appConfigPath);
  const { warnings } = validateStructure(config);
  const { errors } = resolveEnvVars(config);
  const secrets = detectSecrets(config);

  return {
    valid: errors.length === 0 && secrets.length === 0,
    errors,
    warnings,
    secrets,
  };
}

/**
 * Show resolved config with provenance (standalone command).
 */
export async function showResolvedConfig(appPath) {
  const appConfigPath = join(appPath, APP_CONFIG_FILE);
  const localSettingsPath = join(appPath, LOCAL_SETTINGS_FILE);

  const hasAppConfig = await fileExists(appConfigPath);
  const hasLocalSettings = await fileExists(localSettingsPath);

  if (!hasAppConfig && !hasLocalSettings) {
    console.error(errorColor('  No configuration files found.'));
    return;
  }

  let appConfigEnvVars = {};
  if (hasAppConfig) {
    const config = await readAppConfig(appConfigPath);
    const result = resolveEnvVars(config);
    appConfigEnvVars = result.envVars;
  }

  const localSettings = hasLocalSettings ? await readJsonFile(localSettingsPath) : null;
  const localValues = localSettings?.Values || {};

  // Sensitive keys to redact
  const sensitiveKeys = ['AzureWebJobsStorage', 'EventHubConnectionString', 'ServiceBusConnectionString'];

  console.log(infoColor('\n  Resolved Configuration:\n'));
  console.log(dim('  Source precedence: CLI flags > local.settings.json > app-config.yaml\n'));

  const merged = { ...appConfigEnvVars, ...localValues };
  const maxKeyLen = Math.max(...Object.keys(merged).map(k => k.length), 10);

  for (const [key, value] of Object.entries(merged).sort(([a], [b]) => a.localeCompare(b))) {
    const source = (key in localValues) ? 'local.settings.json' : 'app-config.yaml';
    const isSecret = sensitiveKeys.some(sk => key.includes(sk)) && value !== 'UseDevelopmentStorage=true';
    const displayValue = isSecret ? '***REDACTED***' : value;
    console.log(`  ${key.padEnd(maxKeyLen)}  ${dim(displayValue)}  ${dim(`← ${source}`)}`);
  }
  console.log('');
}

// ── Internal helpers ──

async function readAppConfig(filePath) {
  const raw = await readFile(filePath, 'utf-8');
  const config = parseYaml(raw);
  if (!config || typeof config !== 'object') {
    console.error(errorColor(`  ✗ app-config.yaml is empty or invalid YAML`));
    process.exit(1);
  }
  return config;
}

/**
 * Read legacy app.config.json and convert to structured config format.
 * This provides backward compatibility during the transition to app-config.yaml.
 */
async function readLegacyConfig(filePath) {
  const legacy = await readJsonFile(filePath);
  if (!legacy) {
    console.error(errorColor(`  ✗ app.config.json is empty or invalid JSON`));
    process.exit(1);
  }

  const config = {};

  // Map TargetSku → local.targetSku
  if (legacy.TargetSku) {
    config.local = { targetSku: legacy.TargetSku };
  }

  // Map Values.FUNCTIONS_WORKER_RUNTIME → runtime.name
  const values = legacy.Values || {};
  if (values.FUNCTIONS_WORKER_RUNTIME) {
    config.runtime = { name: values.FUNCTIONS_WORKER_RUNTIME };
    if (values.FUNCTIONS_WORKER_RUNTIME_VERSION) {
      config.runtime.version = values.FUNCTIONS_WORKER_RUNTIME_VERSION;
    }
  }

  // Remaining values → configurations (skip structured fields)
  const structuredEnvVars = new Set(['FUNCTIONS_WORKER_RUNTIME', 'FUNCTIONS_WORKER_RUNTIME_VERSION']);
  const configEntries = {};
  for (const [key, value] of Object.entries(values)) {
    if (!structuredEnvVars.has(key)) {
      configEntries[key] = value;
    }
  }
  if (Object.keys(configEntries).length > 0) {
    config.configurations = configEntries;
  }

  return config;
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

async function autoCreateFromLocalSettings(appPath, localSettingsPath) {
  const localSettings = await readJsonFile(localSettingsPath);
  if (!localSettings?.Values) {
    console.error(errorColor('  local.settings.json has no Values section.'));
    process.exit(1);
  }

  const values = localSettings.Values;
  const secrets = detectSecretsInFlatValues(values);
  const nonSecretKeys = Object.keys(values).filter(k => !secrets.has(k));

  // Build structured config
  const config = {};

  // Extract runtime
  const runtime = values.FUNCTIONS_WORKER_RUNTIME;
  if (runtime) {
    config.runtime = { name: runtime };
    // Check for runtime version in env or values
    const version = values.FUNCTIONS_WORKER_RUNTIME_VERSION;
    if (version) config.runtime.version = version;
  }

  // Extract targetSku from local settings (non-standard but some users set it)
  if (localSettings.TargetSku) {
    config.local = { targetSku: localSettings.TargetSku };
  }

  // Remaining non-secret, non-structured values → configurations
  const structuredEnvVars = new Set(Object.values(STRUCTURED_FIELDS).map(s => s.envVar));
  const configEntries = {};
  for (const key of nonSecretKeys) {
    if (structuredEnvVars.has(key)) continue; // Already mapped structurally
    if (ALLOWED_CONFIGURATIONS.has(key)) {
      configEntries[key] = values[key];
    }
  }
  if (Object.keys(configEntries).length > 0) {
    config.configurations = configEntries;
  }

  // Write app-config.yaml
  const yaml = generateYaml(config);
  const appConfigPath = join(appPath, APP_CONFIG_FILE);
  await writeFile(appConfigPath, yaml, 'utf-8');

  console.log(successColor(`  ✓ Created app-config.yaml from local.settings.json (non-secret settings extracted)`));
  if (secrets.size > 0) {
    console.log(dim(`    ${secrets.size} secret(s) left in local.settings.json: ${[...secrets].join(', ')}`));
  }

  return config;
}

async function interactiveCreate(appPath) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(r => rl.question(q, r));

  console.log(warningColor('\n  No configuration files found.\n'));

  const proceed = await ask('  Generate app-config.yaml? [Y/n] ');
  if (proceed.toLowerCase() === 'n') {
    rl.close();
    console.error(errorColor('  Cannot proceed without configuration.'));
    process.exit(1);
  }

  console.log(dim('  Select your runtime:'));
  console.log(dim('    1) node'));
  console.log(dim('    2) python'));
  console.log(dim('    3) dotnet-isolated'));
  console.log(dim('    4) java'));
  console.log(dim('    5) powershell'));

  const choice = await ask('  Runtime [1-5]: ');
  const runtimes = { '1': 'node', '2': 'python', '3': 'dotnet-isolated', '4': 'java', '5': 'powershell' };
  const runtime = runtimes[choice.trim()] || 'node';

  rl.close();

  const config = {
    local: { targetSku: 'flex' },
    runtime: { name: runtime },
    configurations: {
      AzureWebJobsFeatureFlags: 'EnableWorkerIndexing',
    },
  };

  // Write app-config.yaml
  const yaml = generateYaml(config);
  await writeFile(join(appPath, APP_CONFIG_FILE), yaml, 'utf-8');
  console.log(successColor(`  ✓ Created app-config.yaml`));

  // Also create local.settings.json with Azurite
  const localSettingsPath = join(appPath, LOCAL_SETTINGS_FILE);
  if (!await fileExists(localSettingsPath)) {
    const localSettings = {
      IsEncrypted: false,
      Values: {
        AzureWebJobsStorage: 'UseDevelopmentStorage=true',
      },
    };
    await writeFile(localSettingsPath, JSON.stringify(localSettings, null, 2) + '\n', 'utf-8');
    console.log(successColor(`  ✓ Created local.settings.json (with Azurite storage)`));
  }

  return config;
}

function generateYaml(config) {
  const lines = [
    '# Azure Functions App Configuration',
    '# Commit this to source control. Do NOT put secrets here.',
    '# Secrets and connection strings go in local.settings.json (git-ignored).',
    '#',
    '# Reference: https://learn.microsoft.com/en-us/azure/azure-functions/functions-app-settings',
    '',
  ];

  if (config.local) {
    lines.push('# Local emulator (fnx) settings');
    lines.push(stringifyYaml({ local: config.local }).trim());
    lines.push('');
  }

  if (config.runtime) {
    lines.push('# Runtime configuration');
    lines.push(stringifyYaml({ runtime: config.runtime }).trim());
    lines.push('');
  }

  if (config.scaleAndConcurrency) {
    lines.push('# Scale & concurrency (mirrors ARM functionAppConfig)');
    lines.push(stringifyYaml({ scaleAndConcurrency: config.scaleAndConcurrency }).trim());
    lines.push('');
  }

  if (config.configurations) {
    lines.push('# App settings (non-secret behavioral config)');
    lines.push(stringifyYaml({ configurations: config.configurations }).trim());
    lines.push('');
  }

  return lines.join('\n') + '\n';
}

/**
 * Detect which keys in a flat values map are secrets (for migration).
 * Returns a Set of secret key names.
 */
function detectSecretsInFlatValues(values) {
  const secretKeys = new Set();
  const secretKeyPatterns = [
    /ConnectionString$/i,
    /^AzureWebJobsStorage$/i,
    /^APPINSIGHTS_INSTRUMENTATIONKEY$/i,
    /^APPLICATIONINSIGHTS_CONNECTION_STRING$/i,
    /Password$/i, /Secret$/i, /ApiKey$/i, /Token$/i,
  ];
  const secretValuePatterns = [
    /DefaultEndpointsProtocol\s*=/i,
    /AccountKey\s*=/i,
    /SharedAccessSignature\s*=/i,
    /Endpoint\s*=\s*sb:\/\//i,
  ];

  for (const [key, value] of Object.entries(values)) {
    const strValue = String(value);
    // Azurite marker is not a secret
    if (strValue === 'UseDevelopmentStorage=true') continue;

    if (secretKeyPatterns.some(p => p.test(key))) { secretKeys.add(key); continue; }
    if (secretValuePatterns.some(p => p.test(strValue))) { secretKeys.add(key); continue; }
  }
  return secretKeys;
}

async function fileExists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

async function addToGitignore(appPath, filename) {
  const gitignorePath = join(appPath, '.gitignore');
  try {
    const content = await readFile(gitignorePath, 'utf-8');
    if (content.includes(filename)) return; // Already there
    await writeFile(gitignorePath, content.trimEnd() + '\n' + filename + '\n', 'utf-8');
  } catch {
    await writeFile(gitignorePath, filename + '\n', 'utf-8');
  }
}

async function removeFromGitignore(appPath, filename) {
  const gitignorePath = join(appPath, '.gitignore');
  try {
    const content = await readFile(gitignorePath, 'utf-8');
    if (!content.includes(filename)) return;
    const lines = content.split('\n').filter(l => l.trim() !== filename);
    await writeFile(gitignorePath, lines.join('\n'), 'utf-8');
  } catch {
    // No .gitignore — nothing to do
  }
}
