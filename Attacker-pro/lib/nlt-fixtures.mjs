// nlt-fixtures.mjs — controlled lab tokens for BOLA verification (not live victim PII).
// Align ticket_number with a foreign ticket seeded in the lab DB; override via env when instructed.

/** @type {{ ticket_number: string, matchTokens: { description: string, category: string } }} */
export const LAB_FOREIGN_TICKET_FIXTURE = Object.freeze({
  ticket_number: 'NLT-900042',
  matchTokens: {
    description: 'RC-LAB-FIXTURE-TICKET-DESC-9e2b',
    category: 'RC-LAB-FIXTURE-CAT-shipping-delay',
  },
});

/**
 * @param {{ ticketNumber?: string, descToken?: string, categoryToken?: string }} [overrides]
 */
export function resolveForeignTicketFixture(overrides = {}) {
  const ticket_number = String(
    overrides.ticketNumber
    || process.env.NLT_FOREIGN_TICKET_NUMBER
    || LAB_FOREIGN_TICKET_FIXTURE.ticket_number,
  ).trim();
  const matchTokens = {
    description: String(
      overrides.descToken
      || process.env.NLT_FOREIGN_TICKET_DESC_TOKEN
      || LAB_FOREIGN_TICKET_FIXTURE.matchTokens.description,
    ).trim(),
    category: String(
      overrides.categoryToken
      || process.env.NLT_FOREIGN_TICKET_CATEGORY_TOKEN
      || LAB_FOREIGN_TICKET_FIXTURE.matchTokens.category,
    ).trim(),
  };
  const configured = Boolean(ticket_number && matchTokens.description && matchTokens.category);
  return { ticket_number, matchTokens, configured };
}
