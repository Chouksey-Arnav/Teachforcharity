# MUST READ — before any UI/UX change

**Every screen in this app uses the HeyLemon (heylemon.ai) landing-page design system: its fonts, type scale, colors, shapes and animations.** That covers the public site, sign-in, onboarding, dashboards, admin, emails' call-to-action wording, and anything you add later. Don't introduce a second look. If a new screen needs something this system doesn't have, build it from these parts.

AI agents and contributors: this file is a rule, not a suggestion. If a change you're asked to make conflicts with it, say so before making it.

## 1. Fonts and typography

Loaded once in `src/app/layout.tsx` with `next/font`. Don't add other font families.

| Role | Font | How to use it |
|---|---|---|
| Headlines | **Source Serif 4** (`--font-serif`) | `className="display"`. Put the emphasized word in `<em>`, which renders italic ("Was *Maya* there?"). This italic accent is HeyLemon's signature, so use it once per headline, not everywhere. |
| Body and UI text | **Inter** (`--font-sans`) | The default. Body 14–16px, `text-ink-2` or `text-muted` for secondary text. |
| Labels and eyebrows | **Geist Mono** (`--font-mono`) | `className="eyebrow"`: 11.5px, uppercase, 0.16em tracking, forest green. Use it above headings and for small meta lines (`font-mono text-[11px] uppercase tracking-[0.14em]`). |

Type scale: page titles `display text-4xl`–`text-5xl`; card titles `display text-[22px]`–`text-3xl`; dialogs `display text-[28px]`. Headlines use `text-wrap: balance` (already global).

## 2. Color

Use the tokens in `src/app/globals.css` (`@theme` and `--lm-*`). Never hard-code new hex values.

- Paper and cream backgrounds: `bg-paper`, `bg-paper-2`, `bg-cream`; cards `bg-card` with `border-line`.
- Ink text: `text-ink`, `text-ink-2`, `text-muted`, `text-faint` (all pass WCAG AA on paper).
- Glow accent (lemon): `bg-glow`, `brass-*`. Success: `pine-*` / `bg-mint`. Danger: `clay-*`. Soft accents: `peach`, `lilac`.

## 3. Shapes and surfaces

- **Buttons are pills.** Always use `Button` / `LinkButton` from `src/components/ui/button.tsx`: `primary` (ink pill), `secondary` (frosted glass), `brass` (glow), `ghost`, `danger`. Don't hand-roll button styles.
- Cards: `rounded-2xl` to `rounded-[28px]`, `shadow-card`, lifting to `shadow-lift` on hover. Dialogs: `rounded-[28px] shadow-pop` with a blurred ink backdrop.
- Inputs: `Field`, `Input`, `Select`, `Textarea` from `src/components/ui/field.tsx` (focus ring is the glow color).
- Notices, badges and empty states: `Notice`, `Badge`, `Empty`.
- Frosted glass and the painted sky wash (`lm-wash`) are for page chrome, not content cards.

## 4. Animation

HeyLemon motion is soft and springy, never flashy. Use only these:

| Motion | Use |
|---|---|
| `animate-rise` (0.6s, `--lm-ease`) | Cards, notices and dialogs entering. |
| `animate-fade` (0.3s) | Panels expanding inside a card. |
| Spring hover lift (`--lm-spring`, built into `Button`) | Anything pressable: `hover:-translate-y-px`, `active:scale-[0.97]`. |
| Scroll reveal (`.rv`, `src/components/landing/reveal.tsx`) | Public-site sections only. |
| Landing demo motion (`landing.module.css`: `pop`, `fadeUp`, `hlSweep`, caret blink) | Landing/product demos only. |

Every animation must respect `prefers-reduced-motion` (handled globally in `globals.css`; don't override it).

## 5. Checklist for every UI pull request

- [ ] Headlines use `display` (Source Serif 4), labels use `eyebrow` (Geist Mono), text is Inter.
- [ ] Only theme tokens; no new hex colors, fonts or shadows.
- [ ] Buttons are the shared pill `Button`; inputs are the shared `Field` components.
- [ ] Entry animation is `animate-rise` or `animate-fade`, and reduced motion still works.
- [ ] It looks right at 375px wide with no horizontal scroll, and in print where relevant.
- [ ] Text contrast is AA or better (run `tests/e2e/a11y.mjs`).

## Reference

- The live system: `src/app/globals.css`, `src/components/ui/*`, `src/components/landing/*`.
- The source of the look: https://heylemon.ai (cream paper, ink pills, serif headlines with an italic accent word, mono eyebrows, numbered 01/02/03 steps, soft floating cards).
