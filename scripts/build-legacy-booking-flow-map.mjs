import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'deploy-manifest.json');
const outputPath = path.join(root, 'legacy-booking-flow-map.json');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function rel(filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function extractUnionLiterals(source, exportName) {
  const regex = new RegExp(`export type ${exportName} =([\\s\\S]*?);`, 'm');
  const match = source.match(regex);
  if (!match) return [];
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function extractInterfaceFields(source, interfaceName) {
  const regex = new RegExp(`export interface ${interfaceName}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm');
  const match = source.match(regex);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//'))
    .map((line) => line.match(/^([A-Za-z0-9_]+)\??:/)?.[1] ?? null)
    .filter(Boolean);
}

function findOccurrences(files, patterns) {
  const occurrences = [];
  for (const relativeFile of files) {
    const absPath = path.join(root, ...relativeFile.split('/'));
    const lines = readText(absPath).split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const pattern of patterns) {
        if (pattern.regex.test(line)) {
          occurrences.push({
            file: relativeFile,
            line: index + 1,
            text: line.trim(),
            label: pattern.label,
          });
          break;
        }
      }
    });
  }
  return occurrences;
}

const manifest = readJson(manifestPath);
const graph = manifest.function_dependency_graphs.find(
  (entry) => entry.entry === 'supabase/functions/chat-ai-response/index.ts',
);

if (!graph) {
  throw new Error('chat-ai-response dependency graph not found in deploy-manifest.json');
}

const files = graph.files;
const typesPath = path.join(root, 'supabase/functions/_shared/types.ts');
const actionTypesPath = path.join(root, 'supabase/functions/_shared/action-types.ts');
const decisionEnginePath = path.join(root, 'supabase/functions/_shared/decision-engine.ts');
const chatIndexPath = path.join(root, 'supabase/functions/chat-ai-response/index.ts');
const constantsPath = path.join(root, 'supabase/functions/_shared/constants.ts');

const typesSource = readText(typesPath);
const actionTypesSource = readText(actionTypesPath);
const decisionEngineSource = readText(decisionEnginePath);
const chatIndexSource = readText(chatIndexPath);
const constantsSource = readText(constantsPath);

const states = extractUnionLiterals(typesSource, 'ConversationState');
const actions = extractUnionLiterals(actionTypesSource, 'ActionType');
const contextFields = extractInterfaceFields(typesSource, 'ConversationContext');

const stateRecords = states.map((state) => {
  const label = `'${state}'`;
  const occurrences = findOccurrences(files, [{ label, regex: new RegExp(`'${state}'`) }]);
  const assigned = occurrences.filter((entry) =>
    /state\s*:/.test(entry.text) ||
    /setConversationState\(/.test(entry.text) ||
    /transition\(/.test(entry.text)
  );
  const consumed = occurrences.filter((entry) =>
    /\.state\b/.test(entry.text) ||
    /current_state/.test(entry.text) ||
    /VALID_TRANSITIONS/.test(entry.text) ||
    /CREATIVE_FREEDOM_BY_STATE/.test(entry.text) ||
    /MAX_SENTENCES_BY_STATE/.test(entry.text)
  );

  return {
    state,
    occurrences,
    assigned_in: assigned,
    consumed_in: consumed,
  };
});

const actionRecords = actions.map((action) => {
  const producedInDecisionEngine = findOccurrences(
    ['supabase/functions/_shared/decision-engine.ts'],
    [{ label: action, regex: new RegExp(`'${action}'`) }],
  ).filter((entry) =>
    entry.text.includes(`'${action}'`) &&
    !entry.text.startsWith('//') &&
    !entry.text.startsWith('*')
  );

  const handledInRouter = findOccurrences(
    ['supabase/functions/chat-ai-response/index.ts'],
    [{ label: action, regex: new RegExp(`decision\\.action === '${action}'|branch: '${action}'`) }],
  );

  return {
    action,
    produced_by_decision_engine: producedInDecisionEngine,
    handled_in_main_router: handledInRouter,
  };
});

const contextFieldRecords = contextFields.map((field) => {
  const occurrences = findOccurrences(files, [
    { label: field, regex: new RegExp(`\\b${field}\\b`) },
  ]);

  const written = occurrences.filter((entry) =>
    /:\s*/.test(entry.text) ||
    /updateContext\(/.test(entry.text) ||
    /createEmptyContext/.test(entry.text) ||
    /accumulateField\(/.test(entry.text)
  );

  const read = occurrences.filter((entry) =>
    /\.includes\(/.test(entry.text) ||
    /\.filter\(/.test(entry.text) ||
    /\.some\(/.test(entry.text) ||
    /if\s*\(/.test(entry.text) ||
    /return /.test(entry.text) ||
    /\?/.test(entry.text)
  );

  return {
    field,
    occurrences,
    written_in: written,
    read_in: read,
  };
});

const activeBookingStatesMatch = chatIndexSource.match(/const ACTIVE_BOOKING_STATES = new Set\(\[([\s\S]*?)\]\);/m);
const activeBookingStates = activeBookingStatesMatch
  ? [...activeBookingStatesMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  : [];

const serviceLockStatesMatch = chatIndexSource.match(/const SERVICE_LOCK_GUARDED_STATES = new Set\(\[([\s\S]*?)\]\);/m);
const serviceLockStates = serviceLockStatesMatch
  ? [...serviceLockStatesMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  : [];

const validTransitions = (() => {
  const match = constantsSource.match(/export const VALID_TRANSITIONS = \{([\s\S]*?)\} as const;/m);
  if (!match) return {};
  const body = match[1];
  const lines = body.split(/\r?\n/);
  const result = {};
  let currentState = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const stateMatch = line.match(/^'([^']+)':\s*\[$/);
    if (stateMatch) {
      currentState = stateMatch[1];
      result[currentState] = [];
      continue;
    }
    if (currentState && line.startsWith('],')) {
      currentState = null;
      continue;
    }
    if (currentState) {
      const values = [...line.matchAll(/'([^']+)'/g)].map((m) => m[1]);
      result[currentState].push(...values);
    }
  }
  return result;
})();

const output = {
  generated_at_utc: new Date().toISOString(),
  chat_booking_entry: 'supabase/functions/chat-ai-response/index.ts',
  import_graph: graph,
  authoritative_modules: {
    conversation_state: [
      'supabase/functions/chat-ai-response/index.ts',
      'supabase/functions/_shared/context-manager.ts',
    ],
    current_intent: [
      'supabase/functions/chat-ai-response/index.ts',
      'supabase/functions/_shared/decision-engine.ts',
    ],
    service_resolution: [
      'supabase/functions/chat-ai-response/index.ts',
      'supabase/functions/_shared/service-resolver.ts',
    ],
    date_time_selection: [
      'supabase/functions/chat-ai-response/index.ts',
      'supabase/functions/_shared/extraction-contract.ts',
      'supabase/functions/_shared/date-parser.ts',
    ],
    slot_generation: [
      'supabase/functions/_shared/booking-orchestrator.ts',
      'supabase/functions/_shared/availability-engine.ts',
    ],
    slot_selection: [
      'supabase/functions/chat-ai-response/index.ts',
      'supabase/functions/_shared/booking-orchestrator.ts',
    ],
    confirmation: [
      'supabase/functions/chat-ai-response/index.ts',
      'supabase/functions/_shared/response-directive.ts',
    ],
    booking_execution: [
      'supabase/functions/chat-ai-response/index.ts',
      'supabase/functions/_shared/booking-executor.ts',
      'supabase/functions/_shared/guardrails.ts',
    ],
    reschedule_execution: [
      'supabase/functions/chat-ai-response/index.ts',
      'supabase/functions/_shared/reschedule-handler.ts',
      'supabase/functions/_shared/guardrails.ts',
    ],
    handoff: [
      'supabase/functions/chat-ai-response/index.ts',
      'supabase/functions/_shared/handoff-manager.ts',
    ],
    error_recovery: [
      'supabase/functions/chat-ai-response/index.ts',
      'supabase/functions/_shared/error-handler.ts',
    ],
    response_text_generation: [
      'supabase/functions/chat-ai-response/index.ts',
      'supabase/functions/_shared/response-directive.ts',
      'supabase/functions/_shared/response-generator.ts',
    ],
  },
  state_sets: {
    active_booking_states_in_chat_router: activeBookingStates,
    service_lock_guarded_states: serviceLockStates,
    valid_transitions_from_constants: validTransitions,
  },
  states: stateRecords,
  actions: actionRecords,
  context_fields: contextFieldRecords,
  duplicated_behaviors: [
    {
      behavior: 'service_resolution',
      modules: [
        'supabase/functions/chat-ai-response/index.ts',
        'supabase/functions/_shared/service-resolver.ts',
        'supabase/functions/_shared/entity-extractor.ts',
      ],
    },
    {
      behavior: 'slot_selection',
      modules: [
        'supabase/functions/chat-ai-response/index.ts',
        'supabase/functions/_shared/booking-orchestrator.ts',
      ],
    },
    {
      behavior: 'confirmation',
      modules: [
        'supabase/functions/chat-ai-response/index.ts',
        'supabase/functions/_shared/decision-engine.ts',
        'supabase/functions/_shared/response-directive.ts',
        'supabase/functions/_shared/response-generator.ts',
      ],
    },
    {
      behavior: 'post_confirmation_changes',
      modules: [
        'supabase/functions/chat-ai-response/index.ts',
        'supabase/functions/_shared/decision-engine.ts',
        'supabase/functions/_shared/booking-orchestrator.ts',
      ],
    },
    {
      behavior: 'reschedule',
      modules: [
        'supabase/functions/chat-ai-response/index.ts',
        'supabase/functions/_shared/reschedule-handler.ts',
        'supabase/functions/_shared/decision-engine.ts',
      ],
    },
    {
      behavior: 'personal_data_collection',
      modules: [
        'supabase/functions/chat-ai-response/index.ts',
        'supabase/functions/_shared/entity-extractor.ts',
        'supabase/functions/_shared/booking-orchestrator.ts',
        'supabase/functions/_shared/extraction-contract.ts',
      ],
    },
    {
      behavior: 'response_wording',
      modules: [
        'supabase/functions/chat-ai-response/index.ts',
        'supabase/functions/_shared/response-directive.ts',
        'supabase/functions/_shared/response-generator.ts',
        'supabase/functions/_shared/constants.ts',
      ],
    },
  ],
  dead_contracts: {
    state_like_values_not_in_runtime_type: ['collecting_date', 'collecting_personal_data', 'handoff', 'cancel_collecting_target', 'reschedule_collecting_target'],
    action_types_without_current_runtime_handler: ['CONFIRM_SERVICE', 'EXECUTE_CANCEL', 'GENERATE_RESCHEDULE_SLOTS', 'CONFIRM_RESCHEDULE', 'ASK_CLARIFICATION', 'RESET_FLOW'],
    context_fields_with_weak_or_no_runtime_role: ['booking_lifecycle_id', 'fields_collected', 'fields_missing', 'consecutive_errors'],
  },
  recommended_target_architecture: {
    choice: 'hybrid temporary with explicit boundary',
    rationale: [
      'The live runtime is still controlled by chat-ai-response plus shared legacy modules.',
      'booking-v2 is not in the live import graph of chat-ai-response.',
      'The current risk is duplicated control logic, not lack of a second implementation.',
    ],
  },
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  output: rel(outputPath),
  states: output.states.length,
  actions: output.actions.length,
  context_fields: output.context_fields.length,
}, null, 2));
