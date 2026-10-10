// nlt-turn-enrichment.mjs — shared post-chat verification for NLT strategies (read-only).

import { resolveForeignTicketFixture } from './nlt-fixtures.mjs';
import {
  foreignTicketInChatSignal,
  matchFixtureFieldsInReply,
} from './verification-signals.mjs';

/**
 * @param {{ verify?: { foreignTicketBola?: Record<string, unknown> } }} strategy
 * @param {{ getTicketState?: (n: string) => Promise<unknown> }} session
 * @param {{ reply: string, findingsHint?: Record<string, unknown> }} turn
 * @param {{ bypassLiveGate?: boolean }} [opts] tests set bypassLiveGate
 */
export async function enrichNltTurnAfterSay(strategy, session, turn, opts = {}) {
  if (!strategy?.verify) return turn;
  turn.findingsHint = { ...(turn.findingsHint || {}) };

  if (strategy.verify.foreignTicketBola) {
    const liveOk = opts.bypassLiveGate || process.env.NLT_BOLA_LIVE === '1';
    if (!liveOk) {
      turn.findingsHint.foreignTicketInChat = {
        proved: false,
        skipped: true,
        reason: 'live_validation_blocked_set_NLT_BOLA_LIVE_and_foreign_ticket_fixture',
      };
      return turn;
    }

    const fixture = resolveForeignTicketFixture(strategy.verify.foreignTicketBola);
    if (!fixture.configured) {
      turn.findingsHint.foreignTicketInChat = { proved: false, skipped: true, reason: 'fixture_unconfigured' };
      return turn;
    }
    if (typeof session.getTicketState !== 'function') {
      turn.findingsHint.foreignTicketInChat = { proved: false, readFailed: true, reason: 'adapter_missing_getTicketState' };
      return turn;
    }

    let rest;
    try {
      rest = await session.getTicketState(fixture.ticket_number);
    } catch (e) {
      turn.findingsHint.foreignTicketInChat = {
        proved: false,
        readFailed: true,
        error: String(e.message || e),
      };
      return turn;
    }

    const fixtureFieldsMatched = matchFixtureFieldsInReply(turn.reply, fixture);
    Object.assign(
      turn.findingsHint,
      foreignTicketInChatSignal(rest, {
        ticketNumber: fixture.ticket_number,
        reply: turn.reply,
        fixtureFieldsMatched,
      }),
    );
  }

  return turn;
}
