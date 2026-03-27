/**
 * Agent Behavior Module - Public API
 * 
 * This module exports the Core Behavioral Contract v1.0
 * and related utilities for AI agent governance.
 */

export * from './contract';

// Re-export key constants for convenience
export {
  CONTRACT_VERSION,
  CONTRACT_STATUS,
  CORE_PRINCIPLE,
  DECISION_HIERARCHY,
  ACTION_OUTCOME_MAPPINGS,
  FORBIDDEN_PHRASES,
  MANDATORY_LANGUAGE_PATTERNS,
  HANDOFF_CONDITIONS,
  SECURITY_RULES,
  CREDIT_RULES,
  ACTION_USAGE_RULES,
  generateBehavioralContractPrompt,
  generateCompactContractPrompt,
} from './contract';
