import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const functionsRoot = path.join(root, 'supabase', 'functions');
const manifestPath = path.join(root, 'deploy-manifest.json');
const supabaseConfigPath = path.join(root, 'supabase', 'config.toml');
const linkedProjectRefPath = path.join(root, 'supabase', '.temp', 'project-ref');
const linkedProjectJsonPath = path.join(root, 'supabase', '.temp', 'linked-project.json');

const explicitRequiredFiles = [
  'supabase/functions/chat-ai-response/index.ts',
  'supabase/functions/_shared/types.ts',
  'supabase/functions/_shared/action-types.ts',
  'supabase/functions/_shared/decision-types.ts',
  'supabase/functions/_shared/context-manager.ts',
  'supabase/functions/_shared/decision-engine.ts',
  'supabase/functions/_shared/booking-orchestrator.ts',
  'supabase/functions/_shared/availability-engine.ts',
  'supabase/functions/_shared/booking-executor.ts',
  'supabase/functions/_shared/reschedule-handler.ts',
  'supabase/functions/_shared/extraction-contract.ts',
  'supabase/functions/_shared/validators.ts',
  'supabase/functions/_shared/constants.ts',
  'supabase/functions/_shared/state-machine.ts',
  'supabase/functions/_shared/response-generator.ts',
  'supabase/functions/_shared/response-directive.ts',
  'supabase/functions/_shared/service-resolver.ts',
  'supabase/functions/_shared/error-handler.ts',
  'supabase/functions/_shared/knowledge-retriever.ts',
  'supabase/functions/_shared/llm-provider.ts',
  'supabase/functions/_shared/logger.ts',
];

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function rel(p) {
  return toPosix(path.relative(root, p));
}

function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function fileRecord(filePath) {
  const relativePath = rel(filePath);
  if (!fileExists(filePath)) {
    return {
      relative_path: relativePath,
      exists_locally: false,
      file_size: null,
      last_modified_utc: null,
      sha256: null,
      empty_file: null,
    };
  }

  const stat = fs.statSync(filePath);
  return {
    relative_path: relativePath,
    exists_locally: true,
    file_size: stat.size,
    last_modified_utc: stat.mtime.toISOString(),
    sha256: sha256(filePath),
    empty_file: stat.size === 0,
  };
}

function walkFiles(dirPath) {
  const output = [];
  if (!dirExists(dirPath)) return output;

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      output.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      output.push(fullPath);
    }
  }

  return output.sort((a, b) => rel(a).localeCompare(rel(b)));
}

function extractImports(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const imports = new Set();
  const patterns = [
    /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      imports.add(match[1]);
    }
  }

  return [...imports];
}

function resolveRelativeImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.js'),
    path.join(base, 'index.mjs'),
  ];

  return candidates.find((candidate) => fileExists(candidate)) ?? null;
}

function buildFunctionDependencyGraph(functionEntryFile) {
  const visited = new Set();
  const edges = new Map();
  const missingImports = [];
  const externalImports = new Map();

  function visit(filePath) {
    const normalized = path.resolve(filePath);
    if (visited.has(normalized) || !fileExists(normalized)) return;
    visited.add(normalized);

    const imports = extractImports(normalized);
    const localDeps = [];
    const externals = [];

    for (const specifier of imports) {
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        const resolved = resolveRelativeImport(normalized, specifier);
        if (resolved) {
          localDeps.push(path.resolve(resolved));
          visit(resolved);
        } else {
          missingImports.push({
            importer: rel(normalized),
            specifier,
            resolved_candidate_base: rel(path.resolve(path.dirname(normalized), specifier)),
          });
        }
      } else {
        externals.push(specifier);
      }
    }

    edges.set(rel(normalized), localDeps.map(rel).sort());
    if (externals.length > 0) {
      externalImports.set(rel(normalized), externals.sort());
    }
  }

  visit(functionEntryFile);

  return {
    entry: rel(functionEntryFile),
    files: [...visited].map(rel).sort(),
    edges: Object.fromEntries([...edges.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    external_imports: Object.fromEntries(
      [...externalImports.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    ),
    missing_imports: missingImports.sort((a, b) =>
      `${a.importer}:${a.specifier}`.localeCompare(`${b.importer}:${b.specifier}`),
    ),
  };
}

function tryReadJson(filePath) {
  if (!fileExists(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function tryReadText(filePath) {
  if (!fileExists(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8').trim();
}

function compareRemoteDownload(remoteRootRelative) {
  const remoteFunctionsRoot = path.join(root, remoteRootRelative, 'supabase', 'functions');
  if (!dirExists(remoteFunctionsRoot)) return null;

  return walkFiles(remoteFunctionsRoot).map((remoteFilePath) => {
    const relativeInsideFunctions = toPosix(path.relative(remoteFunctionsRoot, remoteFilePath));
    const localFilePath = path.join(functionsRoot, ...relativeInsideFunctions.split('/'));
    const localRecord = fileRecord(localFilePath);
    const remoteRecord = fileRecord(remoteFilePath);

    return {
      remote_root: toPosix(remoteRootRelative),
      relative_path: `supabase/functions/${relativeInsideFunctions}`,
      local_exists: localRecord.exists_locally,
      local_sha256: localRecord.sha256,
      remote_sha256: remoteRecord.sha256,
      local_size: localRecord.file_size,
      remote_size: remoteRecord.file_size,
      hashes_match:
        localRecord.exists_locally &&
        localRecord.sha256 !== null &&
        localRecord.sha256 === remoteRecord.sha256,
    };
  });
}

function getFunctionEntryFiles() {
  if (!dirExists(functionsRoot)) return [];

  return fs
    .readdirSync(functionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '_shared')
    .map((entry) => path.join(functionsRoot, entry.name, 'index.ts'))
    .filter((entryFile) => fileExists(entryFile))
    .sort((a, b) => rel(a).localeCompare(rel(b)));
}

const allFunctions = getFunctionEntryFiles();
const functionGraphs = allFunctions.map((entryFile) => buildFunctionDependencyGraph(entryFile));

const chatEntry = path.join(functionsRoot, 'chat-ai-response', 'index.ts');
const chatGraph = functionGraphs.find((graph) => graph.entry === rel(chatEntry)) ?? null;
const chatFiles = new Set(chatGraph?.files ?? []);

const functionsIntersectingChatFlow = functionGraphs
  .filter((graph) => graph.entry !== rel(chatEntry))
  .map((graph) => {
    const shared = graph.files.filter((file) => chatFiles.has(file));
    return {
      function_entry: graph.entry,
      shared_files_with_chat_flow: shared.sort(),
    };
  })
  .filter((graph) => graph.shared_files_with_chat_flow.length > 0)
  .sort((a, b) => a.function_entry.localeCompare(b.function_entry));

const relevantRoots = [
  path.join(functionsRoot, 'chat-ai-response'),
  path.join(functionsRoot, '_shared'),
];

const relevantFiles = relevantRoots.flatMap(walkFiles);
const allFunctionFiles = walkFiles(functionsRoot);

const requiredFiles = explicitRequiredFiles.map((relativeFile) =>
  fileRecord(path.join(root, ...relativeFile.split('/'))),
);

const importValidationTargets = allFunctionFiles.filter((file) =>
  /\.(ts|tsx|js|mjs)$/.test(file),
);

const importValidation = importValidationTargets.map((file) => {
  const imports = extractImports(file);
  const missing = imports
    .filter((specifier) => specifier.startsWith('./') || specifier.startsWith('../'))
    .map((specifier) => ({ specifier, resolved: resolveRelativeImport(file, specifier) }))
    .filter((entry) => !entry.resolved)
    .map((entry) => entry.specifier);

  return {
    file: rel(file),
    missing_relative_imports: missing.sort(),
  };
});

const filesWithMissingImports = importValidation.filter(
  (entry) => entry.missing_relative_imports.length > 0,
);

const configProjectId = (() => {
  if (!fileExists(supabaseConfigPath)) return null;
  const content = fs.readFileSync(supabaseConfigPath, 'utf8');
  const match = content.match(/project_id\s*=\s*"([^"]+)"/);
  return match ? match[1] : null;
})();

const linkedProjectRef = tryReadText(linkedProjectRefPath);
const linkedProjectJson = tryReadJson(linkedProjectJsonPath);
const remoteDownloadRoots = [
  'scripts/remote-function-download',
  'scripts/remote-download-public',
  'scripts/remote-download-close-conversation',
  'scripts/remote-download-close-idle',
];
const remoteDownloadComparisons = remoteDownloadRoots
  .map((remoteRoot) => compareRemoteDownload(remoteRoot))
  .filter(Boolean)
  .flat();

const manifest = {
  generated_at_utc: new Date().toISOString(),
  project_root: root,
  supabase_project_id_from_config: configProjectId,
  linked_project_ref_from_temp: linkedProjectRef,
  linked_project_metadata_from_temp: linkedProjectJson,
  deployment_target_mismatch: configProjectId !== null && linkedProjectRef !== null
    ? configProjectId !== linkedProjectRef
    : null,
  supabase_config_file: fileRecord(supabaseConfigPath),
  linked_project_ref_file: fileRecord(linkedProjectRefPath),
  linked_project_json_file: fileRecord(linkedProjectJsonPath),
  relevant_roots: relevantRoots.map(rel),
  all_function_entrypoints: allFunctions.map(rel),
  chat_booking_flow_entry: rel(chatEntry),
  function_dependency_graphs: functionGraphs,
  functions_intersecting_chat_flow: functionsIntersectingChatFlow,
  required_files: requiredFiles,
  relevant_files_manifest: relevantFiles.map(fileRecord),
  all_functions_manifest: allFunctionFiles.map(fileRecord),
  files_with_missing_relative_imports: filesWithMissingImports,
  remote_download_comparisons: remoteDownloadComparisons,
};

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  manifestPath: rel(manifestPath),
  chatBookingFlowFileCount: chatGraph?.files.length ?? 0,
  relevantFileCount: manifest.relevant_files_manifest.length,
  allFunctionFileCount: manifest.all_functions_manifest.length,
  functionsIntersectingChatFlow: functionsIntersectingChatFlow.map((entry) => entry.function_entry),
  filesWithMissingImports: filesWithMissingImports.length,
}, null, 2));
