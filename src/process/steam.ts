import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { env, file } from "bun";
import { ENV_DEBUG, STEAM_COLOR, STEAM_RUNTIME_PATHS } from "../constants";
import type { SteamApp } from "../types/process";
import { createLogger } from "../utils";

const log = createLogger("steam", ...STEAM_COLOR);

interface SteamLibrary {
	path: string;
	apps: string[];
}

const defaultSteamPaths =
	process.platform === "darwin"
		? [resolve(homedir(), "Library", "Application Support", "Steam")]
		: process.platform === "win32"
			? [resolve(env?.["ProgramFiles(x86)"]!, "Steam")]
			: [
					resolve(homedir(), ".steam", "steam"),
					resolve(homedir(), ".local", "share", "Steam"),
				];

function extractNestedBlock(content: string, startPos: number): string | null {
	let depth = 0;
	let start = -1;

	for (let i = startPos; i < content.length; i++) {
		if (content[i] === "{") {
			if (depth === 0) start = i + 1;
			depth++;
		} else if (content[i] === "}") {
			depth--;
			if (depth === 0 && start !== -1) {
				return content.substring(start, i);
			}
		}
	}

	return null;
}

async function parseSteamLibraries(): Promise<SteamLibrary[]> {
	const libraries: SteamLibrary[] = [];

	for (const steamPath of defaultSteamPaths) {
		const vdfPath = join(steamPath, "steamapps", "libraryfolders.vdf");

		try {
			if (env[ENV_DEBUG])
				log("checking for libraryfolders.vdf at", vdfPath);
			const content = await file(vdfPath).text();

			const libraryIdMatches = content.matchAll(/"(\d+)"\s*\{/g);

			for (const match of libraryIdMatches) {
				const libraryId = match[1];
				if (!libraryId) continue;

				const libraryBlock = extractNestedBlock(
					content,
					match.index + match[0].length - 1,
				);
				if (!libraryBlock) continue;

				const pathMatch = libraryBlock.match(/"path"\s+"([^"]+)"/);
				if (!pathMatch?.[1]) continue;

				const libraryPath = pathMatch[1];
				const apps: string[] = [];

				const appsBlockMatch = libraryBlock.match(/"apps"\s*\{/);
				if (appsBlockMatch?.index !== undefined) {
					const appsBlock = extractNestedBlock(
						libraryBlock,
						appsBlockMatch.index + appsBlockMatch[0].length - 1,
					);

					if (appsBlock) {
						const appIdMatches = appsBlock.matchAll(/"(\d+)"/g);
						for (const appMatch of appIdMatches) {
							const appId = appMatch[1];
							if (appId) {
								apps.push(appId);
							}
						}
					}
				}

				if (apps.length > 0) {
					libraries.push({ path: libraryPath, apps });
				}
			}

			if (libraries.length > 0) {
				if (env[ENV_DEBUG]) {
					log(`found ${libraries.length} Steam libraries:`);
					for (const lib of libraries) {
						log(`  - ${lib.path} (${lib.apps.length} apps)`);
					}
				}
				break;
			}
		} catch (error) {
			if (env[ENV_DEBUG]) log("failed to read", vdfPath, error);
		}
	}

	if (libraries.length === 0 && env[ENV_DEBUG]) {
		log("no Steam libraries found");
	}

	return libraries;
}

async function parseAppManifest(
	manifestPath: string,
): Promise<{ name: string; installdir: string } | null> {
	try {
		const text = await file(manifestPath).text();
		const name = text.match(/"name"\s+"([^"]+)"/)?.[1];
		const installdir = text.match(/"installdir"\s+"([^"]+)"/)?.[1];

		if (name && installdir) {
			return { name, installdir };
		}
	} catch {}

	return null;
}

let steamAppLookup: Map<string, string> | null = null;
const resolvedPathCache: Map<string, string | null> = new Map();

async function buildSteamLookup(): Promise<Map<string, string>> {
	if (env[ENV_DEBUG]) log("building Steam app lookup table...");

	const libraries = await parseSteamLibraries();
	const lookup = new Map<string, string>();

	for (const library of libraries) {
		const steamappsPath = join(library.path, "steamapps");

		for (const appid of library.apps) {
			const manifestPath = join(
				steamappsPath,
				`appmanifest_${appid}.acf`,
			);
			const manifest = await parseAppManifest(manifestPath);

			if (manifest) {
				const installPath = join(
					steamappsPath,
					"common",
					manifest.installdir,
				);
				lookup.set(installPath, manifest.name);
			}
		}
	}

	if (env[ENV_DEBUG]) {
		log(`built lookup table with ${lookup.size} Steam apps`);
	}

	return lookup;
}

export async function resolveSteamApp(
	processPath: string,
): Promise<string | null> {
	if (resolvedPathCache.has(processPath)) {
		return resolvedPathCache.get(processPath) ?? null;
	}

	if (!steamAppLookup) {
		steamAppLookup = await buildSteamLookup();
	}

	let normalizedPath = processPath;
	const isWinePath =
		processPath.startsWith("Z:\\") || processPath.startsWith("z:\\");
	if (isWinePath) {
		normalizedPath = processPath.substring(2).replace(/\\/g, "/");
	}

	if (process.platform === "win32") {
		normalizedPath = normalizedPath.replace(/\//g, "\\").toLowerCase();
	}

	const isRuntimeProcess = STEAM_RUNTIME_PATHS.some((runtimePath) =>
		normalizedPath.includes(runtimePath),
	);
	if (isRuntimeProcess) {
		if (env[ENV_DEBUG]) {
			log(
				`skipping Steam runtime/infrastructure process: ${processPath}`,
			);
		}
		resolvedPathCache.set(processPath, null);
		return null;
	}

	for (const [installPath, appName] of steamAppLookup) {
		const compareInstallPath =
			process.platform === "win32" ? installPath.toLowerCase() : installPath;
		if (normalizedPath.startsWith(compareInstallPath)) {
			const resolvedPath = join(installPath, `${appName}.app_name`);
			if (env[ENV_DEBUG]) {
				if (isWinePath) {
					log(
						`normalized Wine path: ${processPath} -> ${normalizedPath}`,
					);
				}
				log(`detected Steam app: "${appName}"`);
				log(`  process path: ${processPath}`);
				log(`  resolved to: ${resolvedPath}`);
			}
			resolvedPathCache.set(processPath, resolvedPath);
			return resolvedPath;
		}
	}

	resolvedPathCache.set(processPath, null);
	return null;
}

export async function initSteamApps(): Promise<SteamApp[]> {
	const libraries = await parseSteamLibraries();
	const steamApps: SteamApp[] = [];

	for (const library of libraries) {
		const steamappsPath = join(library.path, "steamapps");

		for (const appid of library.apps) {
			const manifestPath = join(
				steamappsPath,
				`appmanifest_${appid}.acf`,
			);
			const manifest = await parseAppManifest(manifestPath);

			if (manifest) {
				steamApps.push({
					appid,
					name: manifest.name,
					installdir: manifest.installdir,
					libraryPath: steamappsPath,
				});
			}
		}
	}

	return steamApps;
}
