# Theming Rules

Use `theme/tokens.ts` for raw values and `theme/semantic.ts` for usage-level names.

Rules:

- No hardcoded hex/rgba values in feature components.
- Prefer `semantic` values in UI components.
- Use `tokens` directly for spacing, radii, font sizes, and shared sizing.
- Keep new UI additions dark-theme compatible with current mock.
