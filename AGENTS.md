# Project Agent Rules

These instructions apply to every agent working anywhere in this repository.

## Documentation roles

- `AGENTS.md`: rules for agents. Do not use it as project documentation.
- `PROJECT_OVERVIEW.md`: private working context for agents. It describes the current project state and must be read before coding.
- `README.md`: the normal repository README for developers and users.
- `report.html`: the complete, human-facing assignment report intended for submission. It is a polished project-showcase website, not a Word-document imitation, while still presenting rigorous report content and evidence.

## Required workflow

### Before coding

1. Read this `AGENTS.md` file completely.
2. Read `PROJECT_OVERVIEW.md` completely before planning or editing code.
3. Before making any file edit, create and switch to a new, descriptively named Git branch dedicated to the current update. Do not edit on `main`, `master`, or a branch reused from an earlier update. Read-only tasks do not require a new branch. If branch creation is blocked, stop and ask the user rather than editing first.
4. Inspect the relevant source, configuration, and tests. Documentation provides context, but the current code determines actual behavior.
5. Read `README.md` when the task affects installation, usage, commands, or other developer-facing information.
6. Read `report.html` when the task affects reportable project content or the assignment submission.
7. If documentation and code disagree, call out the mismatch and include the necessary documentation correction in the task.

Do not begin implementation until these context checks are complete.

### While coding

- Keep changes consistent with the goals, boundaries, terminology, and architecture recorded in `PROJECT_OVERVIEW.md`.
- Prefer focused changes and preserve unrelated user work.
- Add or update proportionate tests when behavior changes.
- Record important architectural or product decisions in `PROJECT_OVERVIEW.md`; do not leave essential decisions only in chat, commit messages, or source comments.

### After coding

Before reporting that a coding task is complete:

1. Verify the implementation with the most relevant available tests, checks, or build commands.
2. Update `PROJECT_OVERVIEW.md` so the next agent receives an accurate description of the implemented state. Add a concise ISO-dated entry under `Recent changes` for every material code change.
3. Review and update `README.md` whenever setup, commands, configuration, prerequisites, usage, or other developer-facing behavior changed.
4. Review and update `report.html` whenever a material code change affects the assignment narrative, requirements, design, implementation, testing, results, screenshots, references, limitations, or appendices.
5. Keep the report's navigation, table of contents, heading anchors, visual evidence, and project statistics synchronized. Preserve valid, semantic, accessible, responsive, and print-friendly HTML.
6. Re-read changed documentation and confirm that links, paths, commands, dates, and claims are accurate.

Documentation updates are part of the definition of done. Do not claim completion while any affected document is stale.

## Documentation responsibilities

- Keep `AGENTS.md` limited to rules and workflow instructions.
- Keep `PROJECT_OVERVIEW.md` optimized for agent context: current state, structure, architecture, dependencies, interfaces, decisions, and unresolved work.
- Keep `README.md` concise and practical: what the project is, how to set it up, how to run it, and how to test it.
- Keep `report.html` comprehensive and submission-ready. It should explain the project from problem and requirements through design, implementation, testing, results, evaluation, conclusion, references, and appendices.
- Design `report.html` as an engaging UI/UX project showcase with intentional visual hierarchy, responsive layouts, useful navigation, cards, diagrams, screenshots, metrics, timelines, and restrained interaction where appropriate.
- Treat `report.html` as both a website experience and an academic report. Do not reduce it to a long page of plain text, a change log, or a copy of `PROJECT_OVERVIEW.md`.
- Link to detailed topic-specific documentation instead of duplicating large sections.
- Never invent missing project facts. Mark unknown items as `TBD` and replace them when evidence becomes available.
- Update existing sections rather than appending conflicting descriptions.

## Completion report

When handing work back, summarize:

- what changed;
- what verification ran and its result;
- which documentation was updated;
- any remaining risks, limitations, or `TBD` items.
