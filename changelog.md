# arRPC-Bun Changelog

## v1.1.6 [21-10-2025]
**Native Win32 FFI implementation and enhanced type safety**

### Major Changes
- **Complete Windows FFI rewrite** - Replaced PowerShell with native Win32 API calls using Bun FFI
  - Direct `kernel32.dll` and `ntdll.dll` API access via `bun:ffi`
  - Uses `CreateToolhelp32Snapshot`, `Process32FirstW/NextW` for process enumeration
  - Uses `NtQueryInformationProcess` to extract full command-line arguments
  - **10-50x faster** than PowerShell approach (no subprocess overhead)
  - **More reliable** - No shell parsing, direct memory reads
  - **Future-proof** - Works on all Windows versions including Windows 11+
  - Properly handles wide strings (UTF-16) and Windows data structures

### Bug Fixes
- **Fixed TypeScript strict mode compliance** - All array and record accesses now properly handle undefined values
  - `src/process/native/win32.ts` - Added nullish coalescing for buffer array accesses in FFI operations
  - `src/process/native/linux.ts` - Added safety check for command line path extraction
  - `src/process/index.ts` - Added guards for array/record undefined accesses
  - `src/server.ts` - Fixed timestamp record assignment safety
  - Full compliance with `noUncheckedIndexedAccess: true`
- **Fixed platform-specific module loading** - Prevents FFI library loading errors on non-Windows platforms
  - `src/process/native/index.ts` - Now conditionally imports platform modules using top-level await
  - Fixes "Failed to open library" dlopen errors when running on Linux/macOS
  - Windows FFI code only loads on Windows, Linux code only loads on Linux

### Improvements
- **Improved type safety** - Codebase now passes TypeScript strict mode without any type errors
- **Better cross-platform support** - Server starts cleanly on all platforms without attempting to load incompatible native libraries
- **Performance** - Windows process scanning is significantly faster with native APIs vs shell commands
- **Reverted to relative imports** - Removed TypeScript path aliases (`@types`, `@constants`, `@utils`)
  - Now uses standard relative imports (`./types`, `../constants`, etc.)
  - Better compatibility with various bundlers and tools
  - Removed `baseUrl` and `paths` from `tsconfig.json`

## v1.1.4 [19-10-2025]
**Improved code organization and Windows game detection**

### Improvements
- **TypeScript path aliases** - Added `@types`, `@constants`, `@utils` imports
  - Cleaner imports: `from "@types"` instead of `from "../../types/index.d.ts"`
  - Configured in `tsconfig.json` with `baseUrl` and `paths`
  - All relative imports updated across codebase
- **Windows anti-cheat compatibility** - Enhanced process detection for protected games
  - Now includes `ProcessName` as fallback when `Path` is blocked
  - Fixes detection for games with Easy Anti-Cheat (Dead by Daylight, etc.)
  - Uses: `Get-Process | Select-Object Id,Path,ProcessName`
- **Refactored native functions** - Converted arrow functions to regular function declarations
  - Better readability and debugging
  - Clearer variable names (`resolve` instead of `res`, `output` instead of `out`)
  - Consistent style across Linux and Windows implementations

## v1.1.3 [19-10-2025]
**Fixed Windows 11 compatibility**

### Bug Fixes
- **Replaced deprecated wmic with PowerShell** - Windows process scanning now uses `Get-Process` cmdlet
  - `wmic` was removed in Windows 11
  - Now uses: `powershell -Command "Get-Process | Select-Object Id,Path | ConvertTo-Csv"`
  - Works on Windows 10, 11, and future versions
  - Maintains same functionality for game detection

## v1.1.2 [19-10-2025]
**Added port retry logic for bridge server**

### Improvements
- **Bridge port retry** - Bridge server now tries multiple ports (1337-1347) instead of crashing
  - No more "EADDRINUSE" errors with large stack traces
  - Automatically tries next port if current one is in use
  - Logs which port it's trying in debug mode
  - Clean error message only if all ports in range are exhausted
- **Better error handling** - More graceful handling when ports are in use

## v1.1.1 [19-10-2025]
**Fixed path resolution for npm package installation**

### Bug Fixes
- **Fixed DETECTABLE_DB_PATH resolution** - Now resolves relative to package location instead of CWD
  - Changed from `resolve("detectable.json")` to `resolve(import.meta.dirname, "..", "detectable.json")`
  - Fixes `ENOENT: no such file or directory` error when installed as npm package
  - Works correctly both when run from repo and when installed in `node_modules/`

## v1.1.0 [19-10-2025]
**Fully native Bun implementation - Removed all Node.js WebSocket dependencies**

### Major Changes
- **Native Bun WebSocket support** - Replaced `ws` package with `Bun.serve()` native WebSocket
  - Bridge WebSocket server now uses pure Bun implementation
  - RPC WebSocket transport uses pure Bun implementation
  - Zero external WebSocket dependencies
  - Better performance and lower memory footprint
- **Removed dependencies** - Removed `ws` and `@types/ws` packages completely
- **Updated type definitions** - Removed dependency on `ws` types, using pure Bun types

### Technical Improvements
- WebSocket connections handled directly by Bun runtime
- Port discovery using native Bun error handling
- Origin validation in fetch handler
- Query parameter parsing using native URL API
- All WebSocket functionality now 100% Bun-native

## v1.0.0 [18-10-2025]
**Complete TypeScript/Bun rewrite of arRPC**

### Major Changes
- **Complete TypeScript port** - Full type safety with zero `any` types
- **Bun runtime** - Leverages Bun's native APIs for better performance
  - Native `Bun.serve()` WebSocket support (removed `ws` package dependency)
  - Native `color()` API for terminal colors
  - Zero Node.js-specific packages for WebSocket functionality
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
