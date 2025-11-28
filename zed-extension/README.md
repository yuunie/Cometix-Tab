# Cometix Tab for Zed

🚀 AI Code Completion powered by Cursor API for Zed Editor.

## Features

- **AI Code Completion**: Intelligent code suggestions via Cursor API
- **Multi-Language Support**: Works with JavaScript, TypeScript, Python, Rust, Go, and many more
- **LSP Integration**: Seamless integration with Zed's completion system

## Installation

### From Zed Extensions (Coming Soon)

1. Open Zed
2. Go to Extensions panel
3. Search for "Cometix Tab"
4. Click Install

### Manual Installation (Development)

1. Clone this repository
2. Build the LSP server:

```bash
cd lsp-server
npm install
npm run build
```

3. Build the extension:

```bash
cargo build --release --target wasm32-wasi
```

4. Install as dev extension in Zed

## Configuration

### Getting Auth Token

1. Visit [www.cursor.com](https://www.cursor.com) and sign in
2. Open browser DevTools (F12)
3. Go to Application → Cookies
4. Find `WorkosCursorSessionToken`
5. Convert to session token

### Zed Settings

Add to your Zed `settings.json`:

```json
{
  "lsp": {
    "cometix-lsp": {
      "settings": {
        "authToken": "your-cursor-api-token",
        "serverUrl": "https://api2.cursor.sh",
        "enabled": true
      }
    }
  }
}
```

Or use environment variables:

```bash
export COMETIX_AUTH_TOKEN="your-token"
export COMETIX_SERVER_URL="https://api2.cursor.sh"
```

## How It Works

```
User types → Zed requests completion → Cometix LSP → Cursor API → Returns suggestions
```

The extension provides an LSP server that:
1. Receives completion requests from Zed
2. Sends context to Cursor API
3. Returns AI-powered code suggestions

## Supported Languages

- JavaScript / TypeScript / JSX / TSX
- Python
- Rust
- Go
- Java
- C / C++ / C#
- PHP
- Ruby
- Swift
- Kotlin
- HTML / CSS / SCSS
- JSON / YAML / TOML
- SQL
- Markdown
- Shell Script
- Dockerfile

## Limitations

- **LSP Completion Style**: Shows completions in dropdown menu (not ghost text)
- **Trigger Required**: Completions appear after typing trigger characters or Ctrl+Space

## Comparison with VSCode Extension

| Feature | VSCode (Cometix-Tab) | Zed (This Extension) |
|---------|---------------------|---------------------|
| Display | Ghost Text 👻 | Dropdown Menu 📋 |
| Trigger | Automatic | Auto + Manual |
| Multi-line | Full support | Partial |
| File Sync | Full support | Coming soon |

## Development

### Project Structure

```
zed-extension/
├── extension.toml      # Extension manifest
├── Cargo.toml         # Rust dependencies
├── src/
│   └── lib.rs         # Extension entry point
├── lsp-server/        # LSP server (Node.js)
│   ├── src/
│   │   ├── index.ts       # LSP server main
│   │   ├── cursor-client.ts   # Cursor API client
│   │   └── logger.ts      # Logging utility
│   ├── package.json
│   └── tsconfig.json
└── icons/
    └── icon.svg
```

### Building

```bash
# Build LSP server
cd lsp-server
npm install
npm run build

# Build Zed extension
cd ..
cargo build --release --target wasm32-wasi
```

## License

MIT License - See [LICENSE](LICENSE) for details.

## Credits

- [Cursor](https://cursor.com) - AI code completion API
- [Zed](https://zed.dev) - Fast, collaborative code editor
- [Cometix-Tab VSCode](https://github.com/Haleclipse/Cometix-Tab) - Original VSCode extension

## Contributing

Contributions welcome! Please open issues or PRs on GitHub.
