# Day 2 (Sun Sep 13, 2026) — The playbook: agents, the threat landscape & the role

Lecture / roundtable "playbook" day (not hands-on; hands-on resumes the next weekend). Led by
Vladimir Tanev (deck), with Igor Dorovskikh (careers), Jaime Mantilla (Claude Code demo) and
Tagir Fakhriev.

## What we covered
- **AI history → agents → swarms:** transformers (2017), the GPT lineage, prompt injection named (2022), function calling, AutoGPT, multi-agent, swarms, recursive self-improvement.
- **Anatomy of an agent:** LLM + memory + loop + tools + goal + "a computer." Tools / function calling · **MCP** · **Skills** (context-loaded markdown) · RAG / vector DB · memory (and poisoning) · A2A · orchestrators / sub-agents · computer / browser use · guardrails · sandbox / Docker.
- **Skill / tool-description poisoning** — malicious instructions hidden where the model reads them as tokens; defenses (a scanned / curated skills repo; have your own agent rewrite an untrusted skill).
- **Static → dynamic assurance** — promptfoo is static testing; agents and swarms need system-of-systems testing. Attack surface = every point untrusted input enters (user message, document, tool result, another agent's output).
- **The role & market** — reading real job posts past inconsistent titles. AIVSS scoring previewed and deferred to the next weekend.

## Tools / demos
Claude Code (review a repo → generate promptfoo YAML) · browser-control extension · NotebookLM.
Named as options: BlueJ/BlueJay (voice-agent testing), DeepEval, LangGraph, Ragas.

## Exercises
- **Attack-surface breakout** on a scenario (support agent with tools / coding-agent swarm / real-time voice banking): 3 attack surfaces + 1 concrete test + 1 production signal + one sentence "not static-testable because…".
- **Job-hunt exercise** — find a real role, mark the skills you have vs lack, one line on closing the biggest gap.

## Homework
Redo the promptfoo exercises; read the "new vocabulary of AI security" slides; review the AIVSS
site + calculator; read Dario Amodei's post; follow the cybersecurity-leaders list; post on LinkedIn.
