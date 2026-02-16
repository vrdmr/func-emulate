// secret-patterns.js — Heuristics for detecting secrets in app-config.yaml values
//
// If any value matches these patterns, app-config.yaml is added to .gitignore
// and fnx operations are blocked until the secret is moved to local.settings.json.

// ── Connection string patterns ──

const CONNECTION_STRING_PATTERNS = [
  /DefaultEndpointsProtocol\s*=/i,
  /AccountKey\s*=/i,
  /SharedAccessSignature\s*=/i,
  /Endpoint\s*=\s*sb:\/\//i,           // Service Bus
  /Endpoint\s*=\s*https?:\/\//i,       // Generic endpoint-based
  /Data Source\s*=.*Password\s*=/i,     // SQL connection string
  /Server\s*=.*User Id\s*=/i,          // SQL alternate format
  /mongodb(\+srv)?:\/\//i,             // MongoDB
  /redis:\/\//i,                        // Redis
  /amqps?:\/\//i,                       // AMQP (Event Hub, RabbitMQ)
];

// ── Key name patterns (these setting NAMES typically hold secrets) ──

const SECRET_KEY_NAMES = [
  /ConnectionString$/i,
  /^AzureWebJobsStorage$/i,
  /^APPINSIGHTS_INSTRUMENTATIONKEY$/i,
  /^APPLICATIONINSIGHTS_CONNECTION_STRING$/i,
  /StorageConnectionString/i,
  /EventHubConnectionString/i,
  /ServiceBusConnectionString/i,
  /^AzureWebJobsSecretStorage/i,
  /SecretStorageKeyVault/i,
  /Password$/i,
  /Secret$/i,
  /ApiKey$/i,
  /Token$/i,
  /^SAS_/i,
];

// ── Value patterns (values that look like secrets regardless of key name) ──

const SECRET_VALUE_PATTERNS = [
  /^sig=[A-Za-z0-9%+/=]{20,}/,         // SAS token signature
  /^Bearer\s+[A-Za-z0-9._-]{20,}/,     // Bearer token
  /^ey[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,  // JWT
];

// Special case: "UseDevelopmentStorage=true" is NOT a secret
const AZURITE_VALUE = 'UseDevelopmentStorage=true';

/**
 * Scan all values in the config for secrets.
 * Returns array of { path, reason } for each detected secret.
 */
export function detectSecrets(config) {
  const findings = [];

  // Scan configurations.* section
  if (config.configurations && typeof config.configurations === 'object') {
    for (const [key, value] of Object.entries(config.configurations)) {
      const strValue = String(value);

      // Skip Azurite marker — it's not a real secret
      if (strValue === AZURITE_VALUE) continue;

      // Check key name
      for (const pattern of SECRET_KEY_NAMES) {
        if (pattern.test(key)) {
          findings.push({
            path: `configurations.${key}`,
            reason: `Key name "${key}" typically holds secrets. Move to local.settings.json.`,
          });
          break;
        }
      }

      // Check value for connection string patterns
      for (const pattern of CONNECTION_STRING_PATTERNS) {
        if (pattern.test(strValue)) {
          findings.push({
            path: `configurations.${key}`,
            reason: `Value looks like a connection string. Move to local.settings.json.`,
          });
          break;
        }
      }

      // Check value patterns
      for (const pattern of SECRET_VALUE_PATTERNS) {
        if (pattern.test(strValue)) {
          findings.push({
            path: `configurations.${key}`,
            reason: `Value looks like a token or credential. Move to local.settings.json.`,
          });
          break;
        }
      }
    }
  }

  // Deduplicate by path (a value might match both key name and value patterns)
  const seen = new Set();
  return findings.filter(f => {
    if (seen.has(f.path)) return false;
    seen.add(f.path);
    return true;
  });
}
