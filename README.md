# SIMP Modernization Dashboard

A standalone, web-hosted board that shows the **per-module modernization status** across the
[`simp`](https://github.com/simp) organization at a glance — so the modernization plan (which
otherwise lives in prose) stays connected to the real state of the code.

It is a **read-only** client-side Angular app (no backend). It authenticates with a GitHub
Personal Access Token entered in the browser and computes each module's status **from ground
truth** — the repo's `Gemfile`, `metadata.json`, file tree, and CI workflows — via read-only
GitHub API calls. It never writes to any repository.

> Modeled on [`dependency-dashboard/renovate-dashboard`](https://github.com/dependency-dashboard/renovate-dashboard)
> (same Angular 21 + Tailwind 4 + GitHub Pages stack), but tracks the modernization checklist
> rather than dependency PRs.

## The checklist

For each active `pupmod-simp-*` module (discovered live from `simp-core/Puppetfile.branches`),
the board derives:

| Column | Done when… |
|--------|-----------|
| **Drop pdk** | the `pdk` gem is removed from the `Gemfile` (`pupmod:build` replaces `pdk build`) |
| **voxpupuli-test** | `puppetlabs_spec_helper` is swapped for `voxpupuli-test` |
| **Harness pins** | `simp-rake-helpers ~> 6.0` and `simp-beaker-helpers ~> 3.0` |
| **OpenVox** | `openvox` is declared in `metadata.json` requirements |
| **REFERENCE CI** | `REFERENCE.md` exists and a CI job verifies its freshness |
| **EL7 dropped** | no EL7 in `metadata.json` `operatingsystem_support` |
| **tcpwrappers** | no tcpwrappers manifests/dependencies remain |
| **Blast-radius** | ships a non-destructive `simp:defaults` profile |

Each row also links the module's open `Cleanup for X.0.0 release` PR with its live CI status.
A summary bar shows org-wide rollup counts (e.g. `OpenVox 23/85`).

## GitHub token (read-only)

This app only ever issues `GET` requests. Use a **read-only** token:

- **Fine-grained PAT** (recommended): `Contents: Read`, `Metadata: Read`, `Checks: Read`,
  `Pull requests: Read`.
- **Classic PAT**: `repo` (read) + `workflow` if your org requires it for Actions data.

The token is held in session storage only and is cleared when the tab closes.

## Commands

```bash
npm install            # install dependencies
npm start              # dev server at http://localhost:4200
npm run build          # production build
npm run build:pages    # build for GitHub Pages (base-href /modernization-dashboard/)
npm test               # run unit tests (Vitest)
npm run lint           # lint TS + HTML
```

## Deployment

`.github/workflows/pages-deploy.yml` builds and publishes to GitHub Pages on push to `main`.
The site is fully static; no secrets are stored — each viewer supplies their own read-only token.

## Architecture

- `services/module-list.service.ts` — discovers active modules from `Puppetfile.branches`.
- `services/github-api.service.ts` — read-only (GET-only) GitHub REST client.
- `services/checklist-detectors.ts` — pure functions that derive each checklist cell (unit-tested).
- `services/checklist.service.ts` — fetches a module's files and runs the detectors.
- `components/module-matrix/` — the rollup bar + module × checklist table.
- `app.ts` — orchestrates the scan and enriches rows with open release PRs.
