# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

## Commands

```bash
npm start              # Dev server at http://localhost:4200
npm run build          # Production build
npm run build:pages    # Build for GitHub Pages (base-href /renovate-dashboard/)
npm test               # Run tests once (Vitest)
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with coverage
npm run lint           # Lint TS and HTML files
```

To run a single test file: `npx ng test --include src/app/path/to/file.spec.ts`

**Always run `npm run lint` and `npm test` before committing.** Lint checks Angular template rules (e.g. labels must be associated with controls) that are not caught by the TypeScript compiler.

## Configuration

The header repository link is read from `NG_APP_SOURCE_REPOSITORY_URL`. Prefix commands to override it:

```bash
NG_APP_SOURCE_REPOSITORY_URL=https://github.com/your-org/your-repo npm start
```

## Architecture

This is an Angular 21 standalone application displaying Renovate dependency-update PRs grouped by type/topic. It uses Signals for state management, Tailwind CSS 4 for styling, and Vitest for unit tests.

## Angular & TypeScript Rules

**Components:**
- All components are standalone — do **not** set `standalone: true` in decorators (it's the default)
- Use `input()` / `output()` functions, not `@Input()` / `@Output()` decorators
- Set `changeDetection: ChangeDetectionStrategy.OnPush` on every component
- Prefer inline templates for small components
- Prefer Reactive forms over Template-driven forms
- Use `class` bindings, not `ngClass`; use `style` bindings, not `ngStyle`
- Do **not** use `@HostBinding` / `@HostListener` — put host bindings in the `host` object of `@Component`/`@Directive`
- Use `NgOptimizedImage` for static images (not for inline base64 images)

**State & templates:**
- Use signals for local state; use `computed()` for derived state
- Never call `.mutate()` on signals — use `.set()` or `.update()`
- Use native control flow (`@if`, `@for`, `@switch`) — not `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables

**Services & routing:**
- Use `inject()` for dependency injection, not constructor injection
- Services use `providedIn: 'root'`
- Implement lazy loading for feature routes

**TypeScript:**
- Prefer type inference when the type is obvious
- Avoid `any`; use `unknown` when the type is uncertain
