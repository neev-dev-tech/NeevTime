# NeevTime → Black Theme Migration Plan

Goal: ship a **black (dark) theme** across NeevTime, and make theming a **token swap**
so the whole Neev suite (Clor / Accounting / Payroll / People) shares one look and
light ↔ dark ↔ black is a one-line change, not a per-component rewrite.

## Why a straight "make it dark" won't work today

The theme is **hardcoded hex**, not tokens:
- `tailwind.config.js` colors are fixed values (`saffron.DEFAULT: '#171717'`, `app.bg: '#F8FAFC'`, `charcoal: '#0F172A'`). Renaming `saffron` recolored 300+ sites at once — but the value can't change per theme.
- `index.css` component classes bake in light values: `.btn-primary` = `#171717`, `.card-*` = `#FFFFFF→#FAFAFA` gradients, status `bg`/`text` = light tints.
- `darkMode: 'class'` is on and `.dark body` = `#212228` exists, but components ignore it. Toggling `.dark` = dark canvas + light buttons/cards = broken.

Fix the architecture first, then the black theme is a set of variable values.

## Target token architecture

Define **semantic CSS variables** (not raw hex) and map Tailwind to them.

`src/index.css`:
```css
:root {                     /* LIGHT (default) */
  --bg: 248 250 252;        /* #F8FAFC  (space-separated RGB for rgb(var()/alpha)) */
  --surface: 255 255 255;   /* cards/forms */
  --surface-2: 250 250 250; /* nested/hover */
  --border: 226 232 240;    /* slate-200 */
  --text: 15 23 42;         /* #0F172A */
  --text-muted: 71 85 105;  /* slate-600 */
  --brand: 23 23 23;        /* #171717 primary/CTA */
  --brand-contrast: 255 255 255;
  --ok: 16 185 129; --warn: 245 158 11; --err: 239 68 68; --info: 59 130 246;
}
:root[data-theme="black"], .dark {   /* BLACK */
  --bg: 10 10 10;           /* #0A0A0A near-black canvas */
  --surface: 20 20 20;      /* #141414 cards */
  --surface-2: 30 30 30;    /* #1E1E1E elevated */
  --border: 42 42 42;       /* #2A2A2A hairlines */
  --text: 229 229 229;      /* #E5E5E5 off-white, NOT pure white */
  --text-muted: 163 163 163;/* #A3A3A3 */
  --brand: 255 255 255;     /* invert: white is the CTA on black */
  --brand-contrast: 10 10 10;
  --ok: 52 211 153; --warn: 251 191 36; --err: 248 113 113; --info: 96 165 250; /* desaturated for dark */
}
html { color-scheme: light dark; }   /* native form controls follow theme */
body { background: rgb(var(--bg)); color: rgb(var(--text)); }
```

`tailwind.config.js` — map names to the tokens (keeps all 300+ call sites working):
```js
colors: {
  app:      { bg: 'rgb(var(--bg) / <alpha-value>)', surface: 'rgb(var(--surface) / <alpha-value>)', hover: 'rgb(var(--surface-2) / <alpha-value>)' },
  saffron:  { DEFAULT: 'rgb(var(--brand) / <alpha-value>)', light: 'rgb(var(--brand) / 0.85)', dark: 'rgb(var(--brand) / 1)' },
  charcoal: { DEFAULT: 'rgb(var(--text) / <alpha-value>)' },
  'slate-grey': 'rgb(var(--text-muted) / <alpha-value>)',
  border:   'rgb(var(--border) / <alpha-value>)',
  success:  { DEFAULT: 'rgb(var(--ok) / <alpha-value>)' /* + bg/text as rgb(var(--ok)/0.15) etc */ },
  // warning/error/info same pattern
}
```

Then component classes use tokens, e.g.:
```css
.btn-primary { background: rgb(var(--brand)); color: rgb(var(--brand-contrast)); }
.card-base, .card-tier-1, .card-tier-2 { background: rgb(var(--surface)); border-color: rgb(var(--border)); }  /* drop white gradients */
.field { background: rgb(var(--surface)); border-color: rgb(var(--border)); color: rgb(var(--text)); }
```

## Phases (local-first, verify in the browser each step)

**Phase 0 — Clean tree.** Commit or stash the current retheme WIP so each theme
commit is atomic.

**Phase 1 — Tokenize (no visual change in light).** Add the `:root` variables,
repoint `tailwind.config.js` colors to `rgb(var(--…))`, convert the `index.css`
component classes (`btn`, `card`, `field`) to tokens. Light theme must look
identical — that's the regression test. Verify with a before/after screenshot.

**Phase 2 — Black theme values.** Add the `[data-theme="black"]` / `.dark` block.
Fix the pieces that resist tokens: remove the orange shadows (`soft-orange`,
`rgba(255,160,60)` glows), give status colors dark tints, ensure focus rings and
dividers use `--border`. Walk every page in the black theme; fix contrast (<4.5:1
body, <3:1 UI) as you go.

**Phase 3 — Theme switch + persistence.** A toggle (light / dark / black) that sets
`data-theme` on `<html>` and stores it in `localStorage`; respect
`prefers-color-scheme` on first load. `darkMode: 'class'` already supports this.

**Phase 4 — Kill legacy brand.** Replace the orange "NeevTime · Simplicity
Attendance" logo with a monochrome mark (a light-on-dark variant for black),
swap the orange 3D login illustration for a neutral one (or drop it), remove the
stray Sora font ref so Inter is the only family.

**Phase 5 — Suite-wide.** Publish the token set as a shared theme (a small CSS
file or package) that Clor / Payroll / People import, so the whole platform themes
uniformly. Black theme becomes one shared `[data-theme="black"]` block.

## Verify (all local)
- Light theme pixel-identical after Phase 1 (before/after screenshots).
- Black theme: every page readable, WCAG AA (body 4.5:1, UI 3:1), off-white text
  (`#E5E5E5`, not pure white), desaturated accents, elevation via surface steps
  (`--surface`/`--surface-2`), not just lightness flips.
- Toggle persists across reload and respects OS preference on first visit.

## Definition of done
- Zero hardcoded theme hex in components — everything reads a token.
- `data-theme="black"` themes the entire app with no broken light-mode remnants.
- The same tokens drop into Clor/Payroll/People for a uniform suite look.
