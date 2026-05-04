# Contributing to 1Code

## Building from Source

Prerequisites: Bun, Python, Xcode Command Line Tools (macOS)

```bash
bun install
bun run dev      # Development with hot reload
bun run build    # Production build
bun run package:mac  # Create distributable
```

## Open Source vs Hosted Version

This is the open-source version of 1Code. Some features require the hosted backend at 1code.dev:

| Feature | Open Source | Hosted (1code.dev) |
|---------|-------------|-------------------|
| Local AI chat | Yes | Yes |
| Claude Code integration | Yes | Yes |
| Git worktrees | Yes | Yes |
| Terminal | Yes | Yes |
| Sign in / Sync | No | Yes |
| Background agents | No | Yes |
| Auto-updates | No | Yes |
| Direct feedback support | No | Yes |
| Early access to new features | No | Yes |

## Analytics & Telemetry

Analytics (PostHog) and error tracking (Sentry) are **disabled by default** in open source builds. They only activate if you set the environment variables in `.env.local`.

## Contributing

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Submit a PR

Send feedback to [conor.omeara@icloud.com](mailto:conor.omeara@icloud.com)
or open a [GitHub issue](https://github.com/conmeara/ripple/issues/new).

## License

Apache 2.0
