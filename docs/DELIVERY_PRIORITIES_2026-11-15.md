# Owner delivery priorities — 15 November 2026

**Status:** owner-requested work order for the VirgoStars multi-agent fleet. This is a planning/acceptance contract, **not** a statement that any feature is finished or production-ready. All changes use small independent PRs and the review, CI and owner-only merge gates of [AGENT_START.md](../AGENT_START.md).

## Global rule: settle existing PRs first

Work across registered product repositories in this order: (1) merge PRs that meet the exact-head gate; (2) independently review open non-draft PRs and unblock real review findings; (3) triage, retarget or close duplicate, stale, conflicting and stacked draft PRs with explicit rationale; (4) only then start useful new implementation work. Prefer reducing overlapping PR stacks rather than producing more alternate versions of the same code. Do not merge a draft, blindly rebase others' branches, bypass tests, or silently change owner-only policies. For `docs-only` repositories, code PR integration remains **owner-only**.

Measure progress with: open PRs by repo, independently reviewed current HEADs, actionable merge candidates, stale/duplicate drafts closed, conflicts and owner decisions outstanding. An unreviewed draft does not count as integrated functionality.

## Delivery stages and acceptance gates

### 1. VirgoStars-Ephemeris — astronomical replacement MVP (priority 1)

**Authoritative reference:** the precise astronomy functions invoked by the existing VirgoStars backend, with their real argument, flag, result, error, time-scale and environment semantics. An owner-authorized maintainer must prepare a *sanitized API usage matrix*; do not assume the list from the Swiss Ephemeris public API or publish private implementation code.

**Implement:** every required *astronomical* capability in the canonical Rust core, with thin appropriate consumer bindings/adapters. Cover used calendar/JD conversion, planetary and lunar states and velocities, time scales, coordinate frames, sidereal/nutation and fixed-star/observer or event primitives *only insofar as verified backend calls require them*. The calculation of astrological house systems and aspects belongs in stage 2, even if the legacy interface used `swe_*` entry points.

**Gate:** a checked table mapping **each used backend call → replacement function → flag/parameter behavior → tests → unsupported cases**; controlled end-to-end adapter tests; deterministic boundary/error tests; independently traceable JPL/Horizons/other licensed numerical references with stated tolerances. No Swiss source porting, bundled unlicensed kernels, inferred precision or production cutover without separate approval. Work already in active PRs must be reconciled before new duplicates are opened.

### 2. astrological-functions — backend astrology parity (priority 2)

**Authoritative reference:** the backend's actual *astrological* calculations, inventoried as a sanitized behavior matrix. Include actual used zodiac/ayanamsa conventions, house methods and cusp placement, configured aspects and directions, derived chart points, times/progressions/events and any other invoked method **only after verifying use**. Maintain method-specific quirks (e.g. legacy Vehlow versus generic labels) in explicit versioned compatibility profiles.

**Gate:** one line per backend function with inputs, outputs, configuration defaults, errors, boundaries and a passing regression fixture; tested consumption of the Ephemeris provider; no silent Swiss fallback, duplicated astronomy, private data or unlicensed source. Separate original behavior parity from proposed algorithmic corrections.

### 3. astrological-charts — frontend renderer feature parity (priority 3)

**Authoritative reference:** existing VirgoStars frontend rendering and its user-visible controls, with a reviewed, non-sensitive feature matrix. Inspect the actual frontend before asserting complete parity.

**Implement and verify:** every relevant chart mode, option and interaction from the source renderer, including applicable natal/transit/synastry/latitude modes, supported visual skins, hover/focus/select and aspect controls, pan/zoom if present, accessibility and responsive/mobile behavior, export PNG/JPEG and non-WebGL paths if actually supported. Preserve consumer contracts.

**Gate:** feature matrix **original UI behavior → public renderer API/control → automated browser/screenshot comparison → remaining difference** across supported browser, resolution and display modes. Do not redistribute private artwork or unknown-license fonts; synthetic assets do not prove visual parity.

### 4. virgostars-desktop — integrated application and legacy/front-end settings parity (priority 4)

**Authoritative references:** owner-controlled legacy application menus/settings and existing VirgoStars frontend settings/UI. Reference implementations may be private: compare them only in authorized environments and publish **neither** private code/assets nor confidential interface material.

**Implement:** wire the validated Ephemeris → Astrological Functions → Charts contract into Tauri/Angular; complete the applicable navigation, menus, settings, persistence, validation, localization and keyboard/accessibility flows found in the approved inventories. Preserve offline-first previously authenticated use, per-profile data isolation, conflict-aware sync, licensing and a safe native bridge.

**Gate:** each approved legacy/front-end menu and setting is mapped to a Desktop screen or control with verified state persistence and error handling; end-to-end chart calculations and UI tests; offline/online restart and upgrade/migration tests. A synthetic demonstration or a successful build is not evidence of full parity.

## Supporting repositories and sequencing

- VirgoStars-Event-Ephemeris (priority 5) and astrological-assets (priority 6) support the above stages when an explicit dependency is demonstrated. Do not duplicate Ephemeris or Functions scope.
- Orchestrator (priority 9) work is limited to genuine coordination bugs and blockers. Its own PRs also follow the merge gate; never relax it to increase throughput.
- **Completion requires evidence and owner acceptance**, not merely a closed issue, green unit tests, or a published PR. Parallel teams may prepare non-conflicting tests, inventories and adapters in later stages while upstream stage implementation is underway, but must not claim upstream completion or integrate unverified dependencies.
- Target repositories remain public collaboration environments; private backend/frontend/legacy source must not be pasted into public issues, PRs, documentation, test data or logs. Use sanitized contracts and synthetic fixtures instead.

## Operational next actions

1. Review the fleet board and classify the current PR backlog (ready to merge, needs review, needs fixes, superseded, owner-only).
2. Reconcile overlapping and stacked PRs in the four main product repositories before opening duplicates.
3. Produce authorized API-usage inventories from the actual backend and UI feature inventories from the actual frontend and legacy app (sanitized before sharing).
4. Convert each verified gap into small, non-overlapping P0/P1 issues in the corresponding **public** repository; apply acceptance gates and the stage order above.
