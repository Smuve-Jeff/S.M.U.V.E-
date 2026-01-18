## 2026-01-17 - [Accessibility & Keyboard Navigation]

**Learning:** Icon-only buttons with `title` attributes are often missed by screen readers or provided inconsistent experiences if `aria-label` or `sr-only` text is missing. Additionally, custom futuristic UI designs frequently omit standard focus indicators, making keyboard navigation difficult.
**Action:** Always complement `title` with `aria-label` for icon-only buttons. Ensure `focus-visible` styles are explicitly defined to match the app's aesthetic while remaining highly visible (e.g., using theme-colored rings).
