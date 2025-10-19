# arRPC-Bun Changelog

## v1.0.0 [18-10-2025]
**Complete TypeScript/Bun rewrite of arRPC**

### Major Changes
- **Complete TypeScript port** - Full type safety with zero `any` types
- **Bun runtime** - Leverages Bun's native APIs for better performance
- **Organized type system** - Types split into logical `.d.ts` files (`activity`, `rpc`, `socket`, `process`)
- **Centralized constants** - All magic numbers extracted to `constants.ts`
- **TypeScript enums** - Proper enums for IPC message types, close codes, and error codes

### Code Quality Improvements
- **Fixed recursive functions** - Converted recursive `read()` to iterative while loop (prevents stack overflow)
- **Fixed empty catch blocks** - Proper error handling with debug logging
- **Simplified paths** - Using `import.meta.dirname`, `resolve()`, and `new URL()` patterns
- **Graceful shutdown** - SIGINT/SIGTERM handlers for clean exits

### Project Structure
- **Moved detectable.json to root** - Better visibility and organization
- **Created scripts/ directory** - Dedicated location for maintenance scripts
- **Updated package.json** - Renamed to `arrpc-bun` with dual copyright attribution

### Developer Experience
- **Biome linter** - Fast, modern linting and formatting
- **GitLab CI** - Automated TypeScript and Biome checks
- **Better error messages** - HTTP error handling in update script
- **Configurable constants** - Easy to modify ports, intervals, and paths

### Technical Details
- Replaced custom ANSI color implementation with Bun's native `color()` API
- Added comprehensive error handling to database update script
- Fixed all TypeScript strict mode violations
- Zero compiler warnings, zero linter warnings

### Credits
- Original work: OpenAsar Team
- TypeScript/Bun port: creations

---

# Original arRPC Changelog

## v3.6.0 [28-09-2024]
- Updated Discord's game database to use the latest version.
- Updated dependencies to use the latest versions.

## v3.5.0 [30-08-2024]
- The bridge port is now configurable via the `ARRPC_BRIDGE_PORT` environment variable. ([#96](https://github.com/OpenAsar/arrpc/pull/96))
- Fixed some games by ignoring another 64 bit suffix. ([#107](https://github.com/OpenAsar/arrpc/pull/107))
- Fixed some account connecting being broken by adding a workaround for `CONNECTIONS_CALLBACK`. ([#106](https://github.com/OpenAsar/arrpc/pull/106))
- Updated Discord's game database to use the latest version.

## v3.4.0 [28-04-2024]
- Linux process detection is now improved, thanks to [Sqaaakoi](https://github.com/Sqaaakoi). ([#75](https://github.com/OpenAsar/arrpc/pull/75))
- Rewrote ready packet sent to applications so potential regressions from v3.3.1 should be fixed.
- Rewrote detectable DB loading to work with Node v22.
- Removed top-level await so older runtimes should no longer crash.

## v3.3.1 [13-02-2024]
- Fixed a bug crashing some RPC libraries.

## v3.3.0 [19-01-2024]
- **Rewrote Linux game detection.** It should be more reliable and optimized now. Thanks to @rniii and @0xk1f0 for PRs.
- **Fixed bug which broke a community Rust SDK.**
- **Updated game database.**

## v3.2.0 [13-08-2023]
- **Added callback to invite events API.**
- **Updated detectable database with latest from Discord.**
- **Fixed some libraries not working due to not calling back on activity clear.**
- **Fixed refusing connections from Canary web.**
- **Disabled most logging by default.**

## v3.1.0 [02-02-2023]
- **Added Linux process scanning.** Now scans for detectable Linux games on Linux too.

## v3.0.0 [26-11-2022]
- **Added Process Scanning.** Now scans for detectable/verified games and tells Discord the app, allowing process detection whilst maintaining privacy (Discord does not see any/all processes, just the name and app ID).
- **Fixed RPC not fully working with more apps/libraries.** Now responds with a mock/fake arRPC user and the proper config, replies with confirmation, and supports blank activites fully.
- **Fixed a few minor Bridge bugs.** Fixed catchup not working with several apps.

## v2.2.1 [24-11-2022]
- IPC: Fix version given as string not being accepted
- IPC: Fix socket closing

## v2.2.0 [20-11-2022]
- Server: Move all looking up/fetching to client

## v2.1.0 [20-11-2022]
- Server: Stop activites when app disconnects
- Server: Added support for several apps shown at once (added `socketId`)
- Bridge: Catchup newly connected clients with last message by socket id
- Transports: Rewrote internal API to use handlers object
- API: Added parsing for GUILD_TEMPLATE_BROWSER
- API: Added parsing for DEEP_LINK

## v2.0.0 [20-11-2022]
- feat (breaking): moved asset lookup to client
- feat: add examples
- feat: add changelog
