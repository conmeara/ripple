# Codex Execution Plans

This file defines how to write and maintain an execution plan, or ExecPlan, in
this repository. An ExecPlan is a self-contained design and implementation
document that a coding agent can follow to deliver a working feature or system
change.

Use ExecPlans for complex features, significant refactors, high-risk migrations,
work with major unknowns, database or filesystem changes, HyperFrames subsystem
work, release hardening, and anything likely to span multiple sessions.

For Ripple product direction, roadmap, domain model, HyperFrames notes, release
criteria, and testing strategy, read `ROADMAP.md`.

## How To Use ExecPlans

When writing an ExecPlan, start from the template below and fill it in as you
research. Read the relevant code, verify assumptions, and make the plan specific
enough that a fresh agent can continue from only the current working tree and
the ExecPlan text.

When implementing an ExecPlan, keep moving through the next milestone without
asking the user to invent next steps. Update the plan whenever progress is made,
surprises are found, or decisions change. The plan should always reflect the
actual current state of the work.

When discussing an ExecPlan with the user, record durable decisions in the plan
itself. Chat history is useful, but the plan is the artifact future agents will
read.

## Requirements

Every ExecPlan must:

- be fully self-contained
- assume the reader knows the current working tree, but not prior conversation
- explain the purpose from the user's point of view before implementation detail
- define any project-specific or technical term in plain language
- name concrete repository paths, modules, functions, commands, and expected
  observations
- produce demonstrably working behavior, not just code that compiles
- include validation steps and acceptance criteria
- include idempotence and recovery notes for repeatable or risky steps
- stay current as progress, discoveries, and decisions happen

Do not rely on external docs or earlier plans unless they are checked into this
repository and linked from the ExecPlan. If outside knowledge is required,
summarize the needed parts inside the plan in your own words.

## Formatting

ExecPlans are plain Markdown files. If an ExecPlan is written into its own `.md`
file, do not wrap the entire file in a code fence. If you paste an ExecPlan into
chat, wrap the whole plan in one fenced `md` block and avoid nested triple
backticks.

Write mostly in prose. Lists are fine where they improve scanning, but the plan
should read like a clear story: what will exist, why it matters, how to build it,
and how to prove it works. Use checkboxes only in `Progress`.

Use repository-relative paths such as `src/main/windows/main.ts`. State exact
commands with their working directory.

## Required Sections

Each ExecPlan must contain these sections, in this order:

1. Purpose / Big Picture
2. Progress
3. Surprises & Discoveries
4. Decision Log
5. Outcomes & Retrospective
6. Context and Orientation
7. Plan of Work
8. Concrete Steps
9. Validation and Acceptance
10. Idempotence and Recovery
11. Interfaces and Dependencies
12. Artifacts and Notes

`Progress`, `Surprises & Discoveries`, `Decision Log`, and
`Outcomes & Retrospective` are living sections. Update them at every meaningful
stopping point.

## Milestones

For long work, divide the plan into milestones. Each milestone should explain
what will exist at the end, which files will change, which commands prove it,
and what the user or reviewer should observe.

Milestones should be independently verifiable. Prefer additive milestones that
keep the app working while a larger migration is underway.

When a library or architecture choice is uncertain, add a prototyping milestone.
The prototype should be small, testable, and clear about what evidence would
promote it into the main implementation or cause it to be discarded.

## Validation

Validation is mandatory. Every ExecPlan must say how to prove the work with this
repository's actual toolchain.

For Ripple, validation commonly includes:

- `bun run ts:check`
- focused unit or integration tests once a test runner is added
- Electron smoke checks
- Codex Computer Use for desktop interaction and visual QA
- HyperFrames doctor, preview, snapshot, and render checks when applicable
- FFprobe or frame-snapshot checks for export behavior

If a validation command cannot be run, record why and describe the remaining
risk.

## ExecPlan Template

Use this template for files under `plans/`.

```md
# <Short, action-oriented title>

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

Explain what the user can do after this change that they cannot do today. Name
the visible behavior and how someone will see it working.

## Progress

- [ ] Add granular steps here with dates as work proceeds.

## Surprises & Discoveries

- Observation: None yet.
  Evidence: Not started.

## Decision Log

- Decision: None yet.
  Rationale: Not started.
  Date/Author: YYYY-MM-DD / Name.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Describe the current state as if the reader is new to the repository. Name the
key files and explain how they fit together. Define non-obvious terms.

## Plan of Work

Describe the implementation sequence in prose. Name files, modules, functions,
and data structures to create or change.

## Concrete Steps

Run commands from `/Users/comeara/Projects/ripple` unless noted otherwise.

1. Read the relevant files.
2. Make the planned edits.
3. Run validation commands.
4. Update this ExecPlan with outcomes and evidence.

## Validation and Acceptance

State exact commands and expected observations. Include user-visible acceptance
criteria.

## Idempotence and Recovery

Explain which steps can be repeated safely and how to recover from partial
failure.

## Interfaces and Dependencies

Name the APIs, types, modules, services, commands, and external tools this plan
depends on or creates.

## Artifacts and Notes

Record concise evidence, command output summaries, important diffs, or links to
related plans.
```

## Revision Notes

- 2026-04-24 / Codex: Separated the ExecPlan standard from the Ripple roadmap.
  The roadmap now lives in `ROADMAP.md`; this file is the reusable operating
  guide for phase-specific plans.
