# Rules of Engagement (ROE) — MerciBank lab
*Read this before you attack anything. In a real job this is the document that makes your testing
legal. We practise it here so it becomes a habit.*

## Why an ROE exists
Probing a system for weaknesses **without authorization is illegal** (in the US, the Computer Fraud
and Abuse Act; most countries have an equivalent). What separates a security engineer from an
attacker is a signed document that says: *the owner authorizes these tests, on these systems, in this
window, within these limits.* No ROE, no test. Every engagement you run for a client — and every lab
you run here — starts with one.

An ROE is close kin to a **penetration-testing scope document**: it draws the boundary of what you
may touch and what you may not.

## The parts of an ROE (memorize these — they map to the intake questionnaire, Section H)
1. **Authorization** — who owns the system and confirms in writing they can permit the test.
2. **Scope — in** — the exact systems/endpoints you may test.
3. **Scope — out** — everything you must not touch (other systems, other people, infra).
4. **Window** — when testing may happen.
5. **Limits** — no denial-of-service, no destroying/exfiltrating real data, rate caps.
6. **Kill switch** — how to stop immediately.
7. **Contacts / escalation** — who to call if something breaks or you find something serious.
8. **Evidence handling** — how you store transcripts/canaries; don't leak them.

## This lab's ROE (you are authorized under exactly this)
| Field | Value |
|---|---|
| **Authorization** | EnGenious University authorizes you to security-test the MerciBank lab target for this cohort. |
| **In scope** | The MerciBank Assistant running **on your own machine** (`http://localhost:8080`) and its Promptfoo harness. |
| **Out of scope** | Any other host or network; classmates' machines; the cohort infrastructure, Zoom, Discord/Slack, GitHub org; any real bank or real service. |
| **Window** | The Week 2 lab sessions and your own practice time during the cohort. |
| **Limits** | No load/DoS testing beyond the one bounded "unbounded-output" case. All data is fictional — there is nothing real to exfiltrate; do not point the target at real accounts, mail, or keys. |
| **Kill switch** | Stop the target: Ctrl-C the `npm start` terminal. |
| **Contacts** | Your cohort instructors, in the cohort channel. |
| **Evidence** | Keep your `promptfoo` run outputs and screenshots for your findings write-up. Do not post canary values outside the cohort. |

## The one rule that overrides everything
**Testing stays inside this ROE — always.** (This is cohort rule #3 from Day 1.) If you find yourself
wanting to try something outside the box above, that is exactly the moment to stop and ask.
