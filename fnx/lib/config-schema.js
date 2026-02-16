// config-schema.js — Canonical mapping: app-config.yaml paths → host environment variables
//
// This is the single source of truth for the config format. fnx is the first consumer,
// but workers, deployment tools, and other components can adopt the same schema.

// ── Structured field mappings (YAML path → env var) ──

export const STRUCTURED_FIELDS = {
  'runtime.name': {
    envVar: 'FUNCTIONS_WORKER_RUNTIME',
    required: true,
    allowed: ['python', 'node', 'dotnet-isolated', 'java', 'powershell', 'custom'],
    description: 'Language runtime for the function app',
  },
  'runtime.version': {
    envVar: 'FUNCTIONS_WORKER_RUNTIME_VERSION',
    required: false,
    description: 'Language runtime version (e.g. "3.11" for Python)',
  },
  'scaleAndConcurrency.maximumInstanceCount': {
    envVar: 'WEBSITE_MAX_DYNAMIC_APPLICATION_SCALE_OUT',
    required: false,
    type: 'number',
    description: 'Maximum number of instances for scale-out',
  },
  'scaleAndConcurrency.instanceMemoryMB': {
    envVar: 'WEBSITE_INSTANCE_MEMORY_MB',
    required: false,
    type: 'number',
    description: 'Memory allocation per instance in MB',
  },
};

// ── Allowlisted configuration keys (non-secret app settings) ──
// These are the only keys permitted in the `configurations:` section.
// Reference: https://learn.microsoft.com/en-us/azure/azure-functions/functions-app-settings

export const ALLOWED_CONFIGURATIONS = new Set([
  // Core runtime
  'AzureWebJobsFeatureFlags',
  'AZURE_FUNCTIONS_ENVIRONMENT',
  'FUNCTIONS_WORKER_PROCESS_COUNT',
  'FUNCTIONS_WORKER_SHARED_MEMORY_DATA_TRANSFER_ENABLED',

  // Python worker
  'PYTHON_ISOLATE_WORKER_DEPENDENCIES',
  'PYTHON_ENABLE_WORKER_EXTENSIONS',
  'PYTHON_THREADPOOL_THREAD_COUNT',
  'PYTHON_ENABLE_DEBUG_LOGGING',

  // Node worker
  'languageWorkers__node__arguments',

  // Java worker
  'JAVA_OPTS',
  'FUNCTIONS_WORKER_JAVA_LOAD_APP_LIBS',

  // .NET (isolated)
  'FUNCTIONS_WORKER_DOTNET_RELEASE_COMPILATION',

  // Host behavior
  'AzureWebJobsDisableHomepage',
  'FUNCTIONS_REQUEST_BODY_SIZE_LIMIT',
  'PythonPath',

  // Extension bundle overrides
  'AzureFunctionsJobHost__extensionBundle__id',
  'AzureFunctionsJobHost__extensionBundle__version',

  // Scale controller
  'WEBSITE_MAX_DYNAMIC_APPLICATION_SCALE_OUT',

  // Misc non-secret behavioral
  'FUNCTIONS_V2_COMPATIBILITY_MODE',
  'AzureWebJobsDotNetReleaseCompilation',
]);

// ── Top-level YAML sections ──

export const VALID_TOP_LEVEL_KEYS = new Set([
  'local',
  'runtime',
  'scaleAndConcurrency',
  'configurations',
  // Reserved for future use
  // 'deployment',
]);

// ── Local section keys (fnx-specific) ──

export const VALID_LOCAL_KEYS = new Set([
  'targetSku',
  'port',
  'mcpPort',
]);

// ── Resolve structured YAML config → flat env var map ──

export function resolveEnvVars(config) {
  const envVars = {};
  const errors = [];

  // Map structured fields
  for (const [yamlPath, spec] of Object.entries(STRUCTURED_FIELDS)) {
    const value = getNestedValue(config, yamlPath);
    if (value !== undefined && value !== null) {
      if (spec.allowed && !spec.allowed.includes(value)) {
        errors.push(`${yamlPath}: "${value}" is not allowed. Valid: ${spec.allowed.join(', ')}`);
        continue;
      }
      if (spec.type === 'number' && typeof value !== 'number') {
        errors.push(`${yamlPath}: expected number, got ${typeof value}`);
        continue;
      }
      envVars[spec.envVar] = String(value);
    } else if (spec.required) {
      errors.push(`${yamlPath} is required (maps to ${spec.envVar})`);
    }
  }

  // Pass through configurations.* as env vars
  if (config.configurations && typeof config.configurations === 'object') {
    for (const [key, value] of Object.entries(config.configurations)) {
      if (!ALLOWED_CONFIGURATIONS.has(key)) {
        errors.push(`configurations.${key}: not in the allowlist. Move to local.settings.json if needed.`);
        continue;
      }
      envVars[key] = String(value);
    }
  }

  return { envVars, errors };
}

// ── Validate top-level structure ──

export function validateStructure(config) {
  const warnings = [];
  if (!config || typeof config !== 'object') {
    return { warnings: ['app-config.yaml is empty or not a valid YAML object'] };
  }
  for (const key of Object.keys(config)) {
    if (!VALID_TOP_LEVEL_KEYS.has(key)) {
      warnings.push(`Unknown top-level key "${key}". Valid keys: ${[...VALID_TOP_LEVEL_KEYS].join(', ')}`);
    }
  }
  if (config.local && typeof config.local === 'object') {
    for (const key of Object.keys(config.local)) {
      if (!VALID_LOCAL_KEYS.has(key)) {
        warnings.push(`Unknown key "local.${key}". Valid keys: ${[...VALID_LOCAL_KEYS].join(', ')}`);
      }
    }
  }
  return { warnings };
}

// ── Helper: get nested value by dot path ──

function getNestedValue(obj, path) {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}
