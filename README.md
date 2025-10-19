 <div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://user-images.githubusercontent.com/19228318/202900211-95e8474b-edbb-4048-ba0b-a581a6d57fc4.png" width=300>
    <img alt="arRPC" src="https://user-images.githubusercontent.com/19228318/203024061-064fc015-9096-40c3-9786-ad23d90414a6.png" width=300>
  </picture> <br>
  <a href="https://choosealicense.com/licenses/mit/l"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg"></a>
  <h3>An open implementation of Discord's local RPC servers</h3>
  <h4>Allowing RPC where it was otherwise impossible, like Discord Web and custom clients</h4>
  <h5>TypeScript + Bun Port</h5>
</div>

<br>

This is a TypeScript + Bun port of the original [arRPC](https://github.com/OpenAsar/arrpc) project.

arRPC is an open source implementation of Discord's half-documented local RPC servers for their desktop client. This TypeScript implementation using Bun runtime provides improved type safety and performance while maintaining full compatibility with the original implementation. It opens a simple bridge WebSocket server which messages the JSON of exactly what to dispatch with in the client with no extra processing needed, allowing small and simple mods or plugins. **arRPC is experimental and a work in progress, so expect bugs, etc.**

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
bun run update_db.ts
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
│   ├── types.ts           # TypeScript type definitions
│   ├── utils.ts           # Utility functions (logging, etc.)
│   ├── transports/
│   │   ├── ipc.ts         # IPC transport (named pipes/unix sockets)
│   │   └── websocket.ts   # WebSocket transport
│   └── process/
│       ├── index.ts       # Process scanning for auto-detection
│       ├── detectable.json # Database of detectable applications
│       └── native/
│           ├── index.ts   # Native platform exports
│           ├── linux.ts   # Linux process scanning
│           └── win32.ts   # Windows process scanning
├── examples/              # Example integration code
├── ext/                   # Browser extensions
├── update_db.ts           # Script to update detectable.json
└── package.json
```

## Original Project

This is a port of the original [arRPC](https://github.com/OpenAsar/arrpc) by OpenAsar.

## License

MIT
