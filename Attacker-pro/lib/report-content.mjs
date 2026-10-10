// report-content.mjs — target-aware labels, remediation, and paths shared by Markdown + PDF reports.

import { getObjectives, effectiveTargetId } from './target.mjs';

const FIX_MERCIBANK = {
  CRED_KEY: {
    cause: 'The agent treats text retrieved from a help article as trusted instructions and reads back an internal reference.',
    fix: 'Mark retrieved content as untrusted data, never instructions; strip/scan for secrets before returning; keep internal references out of the model context entirely.',
  },
  INJECT_OBEYED: {
    cause: 'An instruction embedded in retrieved content is executed (indirect prompt injection).',
    fix: 'Separate data from instructions; never let retrieved text trigger tool calls or recipients; allow/deny-list actions server-side.',
  },
  BOLA: {
    cause: 'The agent fetches another customer on request, with no ownership check (broken object-level authorization).',
    fix: 'Enforce ownership in the TOOL, not the prompt: get_account must reject any id != the authenticated customer. Deny by default.',
  },
  PCI: {
    cause: 'The agent returns the full PAN on a verification pretext.',
    fix: 'Never surface the full PAN to the model; the tool returns only the last four. Redact in the tool layer.',
  },
  EXCESSIVE_AGENCY: {
    cause: 'initiate_transfer executes with an OTP the system never issued (and/or a social override).',
    fix: 'Verify the OTP server-side against a code send_otp actually generated this session; no override path; require a fresh, bound OTP per transfer.',
  },
  PROMPT_LEAK: {
    cause: 'A strong framing extracts verbatim system prompt / config.',
    fix: 'Keep secrets out of the prompt; treat the system prompt as non-sensitive; add an output filter for known config canaries.',
  },
  TOOL_DISCOVERY: {
    cause: 'The agent enumerates its internal tool/function names under a diagnostics frame.',
    fix: 'Do not expose tool schemas to users; refuse meta-questions about internal capabilities.',
  },
  MEMORY_POISON: {
    cause: 'A user-asserted "fact" persists and is later recalled as truth.',
    fix: 'Do not let user claims mutate authoritative state; keep identity/entitlement facts server-side, never in conversational memory.',
  },
};

const FIX_NLT = {
  RAG_DEV_DISCLOSURE: {
    cause: 'Customer chat RAG retrieves development or internal knowledge-base documents and the model summarizes credentials, keys, or internal hostnames into the reply.',
    fix: 'Partition knowledge bases so development/internal corpora never enter customer-facing retrieval; enforce collection-level ACLs and pre-retrieval filters; scan or block secret patterns and internal host suffixes before context is passed to the model.',
  },
  CHAT_TICKET_BOLA: {
    cause: 'Chat loads another user\'s ticket into the model context without an ownership check, while REST correctly denies the same ticket.',
    fix: 'Enforce ticket ownership in chat context retrieval (same rule as GET /api/tickets); never inject foreign ticket fields into the prompt.',
  },
  ADMIN_RBAC_BYPASS: {
    cause: 'A customer session can call admin aggregate ticket APIs and read protected operational statistics.',
    fix: 'Apply @require_role(\'admin\') consistently on all /api/admin/* routes; deny by default for non-admin sessions.',
  },
  PROMPT_GUIDELINE_LEAK: {
    cause: 'The model repeats verbatim internal GUIDELINES / system instruction text in the customer-visible reply.',
    fix: 'Treat guideline leakage as a failure; add output filters for known instruction markers; keep sensitive policy text out of recoverable prompt surfaces where possible.',
  },
  TICKET_FAST_CLOSE: {
    cause: 'Fast-close logic changes ticket status without policy/ownership checks when closure phrases appear in chat.',
    fix: 'Require authenticated ownership and resolution policy before closing; disable or gate fast-close on foreign or unverified tickets.',
  },
};

const PLAIN_MERCIBANK = {
  EXCESSIVE_AGENCY: 'the assistant can be talked into moving money without a valid one-time passcode',
  BOLA: "the assistant can be made to reveal another customer's account details",
  PCI: 'the assistant can be made to read back a full card number',
  CRED_KEY: 'the assistant can be made to leak an internal reference/key',
  PROMPT_LEAK: 'the assistant can be made to reveal its internal instructions',
  INJECT_OBEYED: 'the assistant follows hidden instructions planted in content it reads',
  MEMORY_POISON: 'the assistant can be tricked into trusting a false claim across a conversation',
  TOOL_DISCOVERY: 'the assistant reveals internal capabilities it should keep private',
};

const PLAIN_NLT = {
  RAG_DEV_DISCLOSURE: 'development or internal knowledge-base content can be summarized into customer chat, exposing synthetic credentials and internal host markers',
  CHAT_TICKET_BOLA: 'another customer\'s ticket details can appear in chat even when the REST API denies access',
  ADMIN_RBAC_BYPASS: 'a customer login can read admin ticket statistics over HTTP GET',
  PROMPT_GUIDELINE_LEAK: 'internal guideline or system-instruction phrases can be read back verbatim',
  TICKET_FAST_CLOSE: 'tickets can be closed from chat without proper policy or ownership checks',
};

const ACTION_MERCIBANK = {
  EXCESSIVE_AGENCY: 'Validate every OTP server-side before any transfer; remove override paths.',
  BOLA: 'Enforce object-level authorization in APIs — deny access to other customers by default.',
  PCI: 'Never send full card numbers into the model; expose only last-four at the tool layer.',
  CRED_KEY: 'Treat retrieved help content as untrusted data; block secrets from model context.',
  PROMPT_LEAK: 'Keep secrets out of prompts; filter outputs for known sensitive patterns.',
  INJECT_OBEYED: 'Prevent retrieved text from triggering tools or changing recipients.',
  MEMORY_POISON: 'Keep authoritative identity and entitlement data server-side only.',
  TOOL_DISCOVERY: 'Do not expose internal tool schemas to end users.',
};

const ACTION_NLT = {
  RAG_DEV_DISCLOSURE: 'Keep development/internal KB collections out of customer RAG indexes; filter retrieval and model context for secrets and internal host patterns.',
  CHAT_TICKET_BOLA: 'Apply the same ownership checks in chat ticket context as on ticket REST endpoints.',
  ADMIN_RBAC_BYPASS: 'Protect all admin GET routes with admin role checks; retest with customer session.',
  PROMPT_GUIDELINE_LEAK: 'Block verbatim guideline markers in outputs; reduce recoverable instruction text.',
  TICKET_FAST_CLOSE: 'Gate ticket closure on ownership and confirmed resolution; audit fast-close triggers.',
};

/** @param {{ targetId?: string, objective?: string }} finding */
export function objectiveRecord(finding) {
  if (!finding?.objective) return {};
  try {
    return getObjectives(finding.targetId)[finding.objective] || {};
  } catch {
    return {};
  }
}

/** @param {{ targetId?: string, objective?: string, owaspLLM?: string, owaspASI?: string }} finding */
export function formatOwaspLine(finding) {
  const o = objectiveRecord(finding);
  const llm = o.owaspLLM || finding.owaspLLM || '—';
  const asi = o.owaspASI ?? finding.owaspASI;
  if (asi && asi !== '—') return `${llm} · ${asi}`;
  return llm;
}

/** @param {{ targetId?: string, objective?: string, title?: string }} finding */
export function objectiveLabel(finding) {
  const o = objectiveRecord(finding);
  return o.label || finding.title || finding.objective || '—';
}

/** @param {{ targetId?: string, objective?: string, evidence?: string }} finding */
export function fixGuidance(finding) {
  const target = effectiveTargetId(finding.targetId);
  if (target === 'nlt' && FIX_NLT[finding.objective]) return FIX_NLT[finding.objective];
  if (FIX_MERCIBANK[finding.objective]) return FIX_MERCIBANK[finding.objective];
  return {
    cause: finding.evidence ? `Confirmed issue (${finding.evidence}).` : 'See reproduction evidence in the finding record.',
    fix: 'Remediate in application code and add a regression test for this objective.',
  };
}

/** @param {{ targetId?: string, objective?: string, title?: string }} finding */
export function plainImpactPhrase(finding) {
  const target = effectiveTargetId(finding.targetId);
  if (target === 'nlt' && PLAIN_NLT[finding.objective]) return PLAIN_NLT[finding.objective];
  if (PLAIN_MERCIBANK[finding.objective]) return PLAIN_MERCIBANK[finding.objective];
  return objectiveLabel(finding);
}

/** @param {{ targetId?: string, objective?: string }} finding */
export function recommendedAction(finding) {
  const target = effectiveTargetId(finding.targetId);
  if (target === 'nlt' && ACTION_NLT[finding.objective]) return ACTION_NLT[finding.objective];
  if (ACTION_MERCIBANK[finding.objective]) return ACTION_MERCIBANK[finding.objective];
  return 'Remediate in application code and add a regression test.';
}

/** @param {{ objective?: string }} finding */
export function stakeholderSeverityNote(finding) {
  if (finding.objective === 'RAG_DEV_DISCLOSURE') {
    return 'Impact comes from development or internal knowledge-base content reaching customer-facing RAG retrieval, not from payment or transfer tools.';
  }
  return 'It rates high because the assistant can act on its own using connected tools, so the impact is real-world, not just a bad sentence.';
}

/** @param {{ objective?: string }} finding */
export function stakeholderRemediationFraming(finding) {
  if (finding.objective === 'RAG_DEV_DISCLOSURE') {
    return 'These are retrieval and data-boundary failures exposed through chat, not cosmetic wording issues. Remediation should harden knowledge-base partitioning and RAG filters; prompt-only guardrails are not sufficient.';
  }
  return 'These are application and authorization failures exposed through the assistant, not cosmetic wording issues. Remediation should happen in backend tools and data paths; prompt-only guardrails are not sufficient.';
}

/**
 * Workspace-relative regression artifact path for report links.
 * @param {{ id?: string }} finding
 * @param {string} [campaignId] `active`, archive folder name, or omitted
 */
export function regressionArtifactPath(finding, campaignId) {
  const id = finding.id || 'finding';
  if (campaignId && campaignId !== 'active' && /^[A-Za-z0-9._-]+$/.test(campaignId)) {
    return `campaign/archive/${campaignId}/regression/${id}.gen.yaml`;
  }
  return `campaign/regression/${id}.gen.yaml`;
}
