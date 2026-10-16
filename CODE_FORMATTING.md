# Code Formatting

NotifyChain enforces consistent formatting across all languages via automated checks that run on every pull request.

---

## Tools

| Language | Tool | Config |
|---|---|---|
| TypeScript / TSX (dashboard) | [Prettier](https://prettier.io) 3.x | `.prettierrc` (root) |
| TypeScript (listener) | [Prettier](https://prettier.io) 3.x | `.prettierrc` (root) |
| Rust (contracts) | `rustfmt` (stable) | default `rustfmt` rules |
| All files | EditorConfig | `.editorconfig` (root) |

---

## Prettier rules (TypeScript / TSX)

Defined in `.prettierrc` at the repository root.

| Rule | Value |
|---|---|
| `semi` | `true` — semicolons required |
| `singleQuote` | `true` — single quotes for strings |
| `trailingComma` | `"all"` — trailing commas wherever valid |
| `printWidth` | `100` — wrap lines at 100 characters |
| `tabWidth` | `2` — two-space indentation |
| `useTabs` | `false` — spaces, not tabs |
| `arrowParens` | `"always"` — parentheses around arrow function parameters |
| `endOfLine` | `"lf"` — Unix line endings |

---

## Rust formatting

The `rust` CI job runs `cargo fmt --all -- --check`. This uses the default `rustfmt` rules (stable channel). No custom `rustfmt.toml` is required.

---

## EditorConfig

`.editorconfig` enforces baseline rules in supported editors (VS Code, JetBrains, Vim, etc.) independently of any formatter:

- UTF-8 encoding everywhere
- LF line endings everywhere
- Final newline on every file
- Trailing whitespace trimmed (except Markdown)
- 2-space indentation for TS/JS/JSON/YAML/Markdown
- 4-space indentation for Rust

---

## CI enforcement

The `format` job in `.github/workflows/ci.yml` runs on every pull request and push to `main` / `staging`:

```
format job
  ├── dashboard: npm run format:check  (Prettier --check)
  └── listener:  npm run format:check  (Prettier --check)
```

The `rust` job also runs `cargo fmt --all -- --check`.

A pull request **cannot be merged** if either check exits non-zero.

---

## Fixing formatting locally

### TypeScript / TSX

```bash
# Fix dashboard
cd dashboard
npx prettier --write "src/**/*.{ts,tsx}" --config ../.prettierrc

# Fix listener
cd listener
npx prettier --write "src/**/*.ts" --config ../.prettierrc
```

### Rust

```bash
cd contract
cargo fmt --all
```

### VS Code auto-format on save

Install the [Prettier - Code formatter](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) extension and add to `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[rust]": {
    "editor.defaultFormatter": "rust-lang.rust-analyzer"
  }
}
```
