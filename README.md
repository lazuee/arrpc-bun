<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://user-images.githubusercontent.com/19228318/202900211-95e8474b-edbb-4048-ba0b-a581a6d57fc4.png" width=300>
    <img alt="arRPC" src="https://user-images.githubusercontent.com/19228318/203024061-064fc015-9096-40c3-9786-ad23d90414a6.png" width=300>
  </picture> <br>
  <a href="https://choosealicense.com/licenses/mit/"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg"></a>
  <h3>An open implementation of Discord's local RPC servers</h3>
  <h4>Allowing RPC where it was otherwise impossible, like Discord Web and custom clients</h4>
  <h5>TypeScript + Bun Port • v1.1.4</h5>
</div>

<br>

This is a complete TypeScript + Bun rewrite of the original [arRPC](https://github.com/OpenAsar/arrpc) project by OpenAsar.

arRPC is an open source implementation of Discord's half-documented local RPC servers for their desktop client. This TypeScript implementation using Bun runtime provides **full type safety with zero `any` types**, improved performance through Bun's native APIs, and better code organization while maintaining full compatibility with the original implementation. It opens a simple bridge WebSocket server which messages the JSON of exactly what to dispatch with in the client with no extra processing needed, allowing small and simple mods or plugins.

## What's New in v1.1.0

- **Complete TypeScript port** - Full type safety with organized type system split across multiple `.d.ts` files
- **Bun-native implementation** - Zero Node.js WebSocket dependencies
  - Uses Bun's native `Bun.serve()` WebSocket support (removed `ws` package)
  - Native `color()` API for terminal output
  - Faster, lighter, and more efficient
- **Centralized constants** - All magic numbers extracted to `constants.ts` with proper TypeScript enums
- **Fixed code quality issues** - Converted recursive functions to iterative, proper error handling, graceful shutdown
- **Better developer experience** - Biome linter, GitLab CI, comprehensive error messages
- **Improved project structure** - Dedicated `scripts/` directory, root-level database for better visibility

See the [changelog](changelog.md) for full details.

<br>

Rich Presence (RPC) is the name for how some apps can talk to Discord desktop on your PC via localhost servers to display detailed info about the app's state. This usually works via parts of Discord desktop natively doing things + parts of Discord web interpreting that and setting it as your status. arRPC is an open source implementation of the local RPC servers on your PC, allowing apps to talk to it thinking it was just normal Discord. It can then send that info to apps which usually don't get RPC, like Discord Web, ArmCord, etc. which can then set that as your status. This would otherwise not be possible, as web apps/browsers/etc can't just use Discord's already existing code and version.

- App with Discord RPC
- ~~Discord Desktop's native server~~ arRPC
- ~~Discord Web's setting~~ mod/plugin

<br>

## Installation

Make sure you have [Bun](https://bun.sh) installed.

Install dependencies:
```bash
bun install
```

## Usage

### Server
Run the arRPC server:
```bash
bun start
```

For development with auto-reload:
```bash
bun run dev
```

### Update Detectable Apps Database
To update the list of detectable applications from Discord's API:
```bash
bun run update-db
```

### Development
Check code quality with Biome:
```bash
bun run lint
```

Fix linting issues automatically:
```bash
bun run lint:fix
```

Type check with TypeScript:
```bash
bunx tsc --noEmit
```

### Web
#### No Mods
1. Get [the arRPC server running](#server)
2. With Discord open, run the content of [`examples/bridge_mod.js`](examples/bridge_mod.js) in Console (Ctrl+Shift+I).

#### Vencord
1. Get [the arRPC server running](#server)
2. Just enable the `WebRichPresence (arRPC)` Vencord plugin!

### Custom Clients

#### ArmCord, Vesktop
These clients have arRPC specially integrated, just enable the option in its settings (server not required)!

#### Webcord
1. Get [the arRPC server running](#server)
2. Disable the `Use built-in Content Security Policy` option in Advanced settings
3. With Webcord open, run the content of [`examples/bridge_mod.js`](examples/bridge_mod.js) in the DevTools Console (Ctrl+Shift+I).

---

Then just use apps with Discord RPC like normal and they *should* work!

<br>

## Configuration

arRPC can be configured using environment variables:

- `ARRPC_BRIDGE_PORT` - WebSocket bridge starting port (default: 1337, tries 1337-1347 if in use)
- `ARRPC_DEBUG` - Enable debug logging (set to any value to enable)
- `ARRPC_NO_PROCESS_SCANNING` - Disable automatic game detection (set to any value to disable)

Example:
```bash
ARRPC_DEBUG=1 ARRPC_BRIDGE_PORT=6969 bun start
```

### Port Ranges
- **Bridge WebSocket**: 1337-1347 (tries next port if in use)
- **RPC WebSocket**: 6463-6472 (Discord's standard range)

<br>

## Supported

### Transports
- [X] WebSocket Server
  - [X] JSON
  - [ ] Erlpack
- [ ] HTTP Server
- [X] IPC
- [X] Process Scanning

### Commands
- [X] DISPATCH
- [X] SET_ACTIVITY
- [X] INVITE_BROWSER
- [X] GUILD_TEMPLATE_BROWSER
- [X] DEEP_LINK
- [X] CONNECTIONS_CALLBACK

## Project Structure

```
arrpc.bun/
├── src/
│   ├── index.ts           # Main entry point
│   ├── server.ts          # RPC server implementation
│   ├── bridge.ts          # WebSocket bridge for web clients
│   ├── constants.ts       # Centralized constants and enums
│   ├── utils.ts           # Utility functions (logging, etc.)
│   ├── types/             # TypeScript type definitions
│   │   ├── activity.d.ts  # Activity-related types
│   │   ├── rpc.d.ts       # RPC protocol types
│   │   ├── socket.d.ts    # Socket and handler types
│   │   ├── process.d.ts   # Process scanning types
│   │   └── index.d.ts     # Type exports
│   ├── transports/
│   │   ├── ipc.ts         # IPC transport (named pipes/unix sockets)
│   │   └── websocket.ts   # WebSocket transport
│   └── process/
│       ├── index.ts       # Process scanning for auto-detection
│       └── native/
│           ├── index.ts   # Native platform exports
│           ├── linux.ts   # Linux process scanning
│           └── win32.ts   # Windows process scanning
├── scripts/
│   └── update_db.ts       # Script to update detectable.json
├── examples/              # Example integration code
├── ext/                   # Browser extensions
├── detectable.json        # Database of detectable applications
└── package.json
```

## Original Project

This is a TypeScript/Bun port of the original [arRPC](https://github.com/OpenAsar/arrpc) by the OpenAsar team.

**Original work**: Copyright (c) 2022 OpenAsar
**TypeScript/Bun port**: Copyright (c) 2025 creations

## Repository

This port is maintained at: [https://heliopolis.live/creations/arrpc-bun](https://heliopolis.live/creations/arrpc-bun)

## License

MIT
