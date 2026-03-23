/**
 * Supported runtime versions for each language.
 * Update these values when new runtime versions are released or deprecated.
 *
 * @see https://learn.microsoft.com/azure/azure-functions/functions-versions
 * @see https://learn.microsoft.com/azure/azure-functions/supported-languages
 */
export const SUPPORTED_RUNTIMES = {
  /** Last updated: March 2026 */
  lastUpdated: '2026-03',

  python: {
    supported: ['3.10', '3.11', '3.12', '3.13'],
    preview: ['3.14'],
    deprecated: ['3.8', '3.9'],
    default: '3.13',
  },
  node: {
    // JavaScript and TypeScript run on Node.js runtime
    supported: ['20', '22'],
    preview: ['24'],
    deprecated: ['18'],
    default: '22',
  },
  // TypeScript and JavaScript alias to node - they share the same runtime versions
  get typescript() { return this.node; },
  get javascript() { return this.node; },
  java: {
    supported: ['8', '11', '17', '21'],
    preview: ['25'],
    deprecated: [],
    default: '21',
    mavenMinVersion: '3.5',
    /** Maven compiler plugin version - check Maven Central for updates */
    mavenCompilerPluginVersion: '3.15.0',
    /** Azure Functions Maven plugin version - check Maven Central for updates */
    mavenPluginVersion: '1.40.0',
    /** Azure Functions Java library version - check Maven Central for updates */
    javaLibraryVersion: '3.2.3',
  },
  'dotnet-isolated': {
    // .NET versions for isolated worker model
    supported: ['8', '9', '10'],
    preview: [],
    deprecated: ['6', '7'],
    default: '8',
    // .NET Framework is also supported for Windows
    frameworkSupported: ['4.8.1'],
  },
  powershell: {
    supported: ['7.2', '7.4'],
    preview: [],
    deprecated: ['7.0'],
    default: '7.4',
  },

  /** Azure Functions runtime version */
  functionsRuntime: '4.x',

  /** Extension bundle version range */
  extensionBundle: '[4.*, 5.0.0)',
};

/**
 * Get the default version for a runtime
 * @param {string} runtime - Runtime name (python, node, typescript, java, dotnet-isolated, powershell)
 * @returns {string} Default version
 */
export function getDefaultVersion(runtime) {
  const normalizedRuntime = runtime.toLowerCase();
  const runtimeConfig = SUPPORTED_RUNTIMES[normalizedRuntime];
  return runtimeConfig?.default || '';
}

/**
 * Get supported versions for a runtime
 * @param {string} runtime - Runtime name
 * @returns {string[]} Array of supported versions
 */
export function getSupportedVersions(runtime) {
  const normalizedRuntime = runtime.toLowerCase();
  const runtimeConfig = SUPPORTED_RUNTIMES[normalizedRuntime];
  return runtimeConfig?.supported || [];
}

/**
 * Check if a version is supported for a runtime
 * @param {string} runtime - Runtime name
 * @param {string} version - Version to check
 * @returns {boolean} True if version is supported
 */
export function isVersionSupported(runtime, version) {
  const normalizedRuntime = runtime.toLowerCase();
  const runtimeConfig = SUPPORTED_RUNTIMES[normalizedRuntime];
  if (!runtimeConfig) return false;
  
  const allSupported = [
    ...(runtimeConfig.supported || []),
    ...(runtimeConfig.preview || []),
  ];
  return allSupported.includes(version);
}

/**
 * Check if a version is deprecated
 * @param {string} runtime - Runtime name
 * @param {string} version - Version to check
 * @returns {boolean} True if version is deprecated
 */
export function isVersionDeprecated(runtime, version) {
  const normalizedRuntime = runtime.toLowerCase();
  const runtimeConfig = SUPPORTED_RUNTIMES[normalizedRuntime];
  return runtimeConfig?.deprecated?.includes(version) || false;
}

/**
 * Format runtime versions as a display string
 * @param {string} runtime - Runtime name
 * @returns {string} Formatted version string
 */
function formatRuntimeVersions(runtime) {
  const config = SUPPORTED_RUNTIMES[runtime];
  if (!config) return '';
  const versions = config.supported.join(', ');
  const preview = config.preview?.length ? ` (preview: ${config.preview.join(', ')})` : '';
  return `${versions}${preview}`;
}

/**
 * Language information including prerequisites and commands.
 * Used for documentation, validation, and user guidance.
 */
export const LANGUAGE_INFO = {
  python: {
    name: 'Python',
    runtime: formatRuntimeVersions('python'),
    programmingModel: 'v2 programming model with @app decorators',
    prerequisites: [
      `Python ${SUPPORTED_RUNTIMES.python.default} or later installed`,
      `Azure Functions Core Tools v${SUPPORTED_RUNTIMES.functionsRuntime}`,
      'Azure CLI (optional, for deployment)',
    ],
    developmentTools: ['Azure Functions Core Tools CLI'],
    initCommand: 'fnx init --runtime python',
    runCommand: 'fnx start',
  },
  javascript: {
    name: 'JavaScript',
    runtime: formatRuntimeVersions('javascript'),
    programmingModel: 'Node.js v4 programming model with JavaScript',
    prerequisites: [
      `Node.js ${SUPPORTED_RUNTIMES.node.default}.x or later installed`,
      `Azure Functions Core Tools v${SUPPORTED_RUNTIMES.functionsRuntime}`,
      'npm package manager',
      'Azure CLI (optional, for deployment)',
    ],
    developmentTools: ['Azure Functions Core Tools CLI'],
    initCommand: 'fnx init --runtime node --language javascript',
    runCommand: 'npm start',
  },
  typescript: {
    name: 'TypeScript',
    runtime: formatRuntimeVersions('typescript'),
    programmingModel: 'Node.js v4 programming model with TypeScript',
    prerequisites: [
      `Node.js ${SUPPORTED_RUNTIMES.node.default}.x or later installed`,
      `Azure Functions Core Tools v${SUPPORTED_RUNTIMES.functionsRuntime}`,
      'npm package manager',
      'Azure CLI (optional, for deployment)',
    ],
    developmentTools: ['Azure Functions Core Tools CLI'],
    initCommand: 'fnx init --runtime node --language typescript',
    runCommand: 'npm start',
    buildCommand: 'npm run build',
  },
  java: {
    name: 'Java',
    runtime: formatRuntimeVersions('java'),
    programmingModel: 'Annotation-based with Maven build system',
    prerequisites: [
      `JDK ${SUPPORTED_RUNTIMES.java.default} installed (${SUPPORTED_RUNTIMES.java.supported.join(', ')} supported)`,
      `Apache Maven ${SUPPORTED_RUNTIMES.java.mavenMinVersion}+`,
      `Azure Functions Core Tools v${SUPPORTED_RUNTIMES.functionsRuntime}`,
      'Azure CLI (optional, for deployment)',
    ],
    developmentTools: ['Azure Functions Core Tools CLI'],
    initCommand: 'fnx init --runtime java',
    runCommand: 'mvn azure-functions:run',
    buildCommand: 'mvn clean package',
  },
  'dotnet-isolated': {
    name: 'C# (.NET Isolated)',
    runtime: formatRuntimeVersions('dotnet-isolated'),
    programmingModel: 'Isolated worker process with dependency injection',
    prerequisites: [
      `.NET ${SUPPORTED_RUNTIMES['dotnet-isolated'].default} SDK or later installed`,
      `Azure Functions Core Tools v${SUPPORTED_RUNTIMES.functionsRuntime}`,
      'Azure CLI (optional, for deployment)',
    ],
    developmentTools: ['Azure Functions Core Tools CLI'],
    initCommand: 'fnx init --runtime dotnet-isolated',
    runCommand: 'fnx start',
    buildCommand: 'dotnet build',
  },
  powershell: {
    name: 'PowerShell',
    runtime: formatRuntimeVersions('powershell'),
    programmingModel: 'PowerShell script-based functions',
    prerequisites: [
      `PowerShell ${SUPPORTED_RUNTIMES.powershell.default} or later installed`,
      `Azure Functions Core Tools v${SUPPORTED_RUNTIMES.functionsRuntime}`,
      'Azure CLI (optional, for deployment)',
    ],
    developmentTools: ['Azure Functions Core Tools CLI'],
    initCommand: 'fnx init --runtime powershell',
    runCommand: 'fnx start',
  },
};

/**
 * Get language info for a runtime
 * @param {string} runtime - Runtime name
 * @returns {Object|null} Language info object or null
 */
export function getLanguageInfo(runtime) {
  const normalizedRuntime = runtime.toLowerCase();
  return LANGUAGE_INFO[normalizedRuntime] || null;
}

/**
 * Get prerequisites for a runtime
 * @param {string} runtime - Runtime name
 * @returns {string[]} Array of prerequisite strings
 */
export function getPrerequisites(runtime) {
  const info = getLanguageInfo(runtime);
  return info?.prerequisites || [];
}
