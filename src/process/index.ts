import { env } from "bun";
import {
	ENV_DEBUG,
	EXECUTABLE_ARCH_SUFFIXES,
	EXECUTABLE_EXACT_MATCH_PREFIX,
	getCustomDb,
	getDetectableDb,
	PROCESS_COLOR,
	PROCESS_SCAN_INTERVAL,
} from "../constants";
import type { DetectableApp, Handlers, Native } from "../types";
import { createLogger } from "../utils";
import * as Natives from "./native/index";

const log = createLogger("process", ...PROCESS_COLOR);

let DetectableDB: DetectableApp[] = [];
const executableIndex: Map<string, DetectableApp[]> = new Map();
let dbLoaded = false;

function mergeCustomEntries(
	customEntries: Partial<DetectableApp>[],
	source: string,
): void {
	for (const customEntry of customEntries) {
		if (!customEntry.id) continue;

		const existingEntry = DetectableDB.find(
			(entry) => entry.id === customEntry.id,
		);

		if (existingEntry) {
			if (customEntry.executables) {
				if (!existingEntry.executables) {
					existingEntry.executables = [];
				}
				existingEntry.executables.push(...customEntry.executables);
			}
			if (customEntry.name) existingEntry.name = customEntry.name;
			if (customEntry.aliases)
				existingEntry.aliases = customEntry.aliases;
		} else {
			DetectableDB.push({
				id: customEntry.id,
				name: customEntry.name || "Custom Game",
				executables: customEntry.executables || [],
				aliases: customEntry.aliases || [],
				hook: customEntry.hook ?? false,
				overlay: customEntry.overlay ?? false,
				overlay_warn: customEntry.overlay_warn ?? false,
				overlay_compatibility_hook:
					customEntry.overlay_compatibility_hook ?? false,
				overlay_methods: customEntry.overlay_methods ?? null,
				icon_hash: customEntry.icon_hash || "",
				themes: customEntry.themes || [],
			});
		}
	}

	log(`loaded ${source} with`, customEntries.length, "entries");
}

function buildExecutableIndex(): void {
	executableIndex.clear();

	for (const app of DetectableDB) {
		if (!app.executables) continue;

		for (const exe of app.executables) {
			const exeName = exe.name.toLowerCase();
			const key = exeName.startsWith(EXECUTABLE_EXACT_MATCH_PREFIX)
				? exeName.substring(1)
				: exeName;

			if (!executableIndex.has(key)) {
				executableIndex.set(key, []);
			}
			executableIndex.get(key)?.push(app);
		}

		if (process.platform === "darwin") {
			const appKey = app.name.toLowerCase();
			if (!executableIndex.has(appKey)) {
				executableIndex.set(appKey, []);
			}
			executableIndex.get(appKey)?.push(app);
		}
	}

	log("built executable index with", executableIndex.size, "keys");
}

async function loadDatabase(): Promise<void> {
	try {
		DetectableDB = (await getDetectableDb()) as DetectableApp[];

		try {
			const customEntries =
				(await getCustomDb()) as Partial<DetectableApp>[];
			mergeCustomEntries(customEntries, "detectable_fixes.json");
		} catch {}

		buildExecutableIndex();
		dbLoaded = true;
		log("database loaded with", DetectableDB.length, "entries");
	} catch (error) {
		log("failed to load database:", error);
	}
}

loadDatabase();

const NativeImpl = (Natives as Record<string, Native>)[process.platform] as
	| Native
	| undefined;

function argsContainString(args: string[], target: string): boolean {
	const targetLower = target.toLowerCase();

	for (let i = 0; i < args.length; i++) {
		const argLower = args[i]?.toLowerCase() || "";
		if (argLower.includes(targetLower)) return true;
	}

	for (let i = 0; i < args.length - 1; i++) {
		let combined = args[i]?.toLowerCase() || "";
		for (let j = i + 1; j < args.length && j < i + 5; j++) {
			combined += ` ${args[j]?.toLowerCase() || ""}`;
			if (combined.includes(targetLower)) return true;
		}
	}

	return false;
}

const appNameRegex = /.app_name$/;
function matchesExecutable(
	executable: {
		name: string;
		is_launcher?: boolean;
		arguments?: string;
		os?: string;
	},
	toCompare: string[],
	args: string[] | null,
	checkLauncher: boolean,
	checkAppName: boolean,
	strictArgs: boolean,
): boolean {
	if (executable.is_launcher !== checkLauncher) return false;

	const firstChar = executable.name[0];
	const firstCompare = toCompare[0];

	if (!firstChar || !firstCompare) return false;

	if (checkAppName) {
		if (appNameRegex.test(firstCompare)) {
			const appName = firstCompare
				.replace(appNameRegex, "")
				.toLowerCase();
			const executableNameLower = executable.name.toLowerCase();
			const matches = executableNameLower === appName;
			if (matches && env[ENV_DEBUG]) {
				log(
					`matched via .app_name: "${executable.name}" === "${appName}"`,
				);
			}
			return matches;
		}
	}

	const nameMatches =
		firstChar === EXECUTABLE_EXACT_MATCH_PREFIX
			? executable.name.substring(1) === firstCompare
			: toCompare.some((y) => executable.name === y);

	if (!nameMatches) return false;

	if (args && executable.arguments) {
		const argsMatch = argsContainString(args, executable.arguments);
		if (strictArgs) {
			if (argsMatch && env[ENV_DEBUG]) {
				log(
					`matched via name + strict args: "${executable.name}" with args "${executable.arguments}"`,
				);
			}
			return argsMatch;
		}
		if (firstChar === EXECUTABLE_EXACT_MATCH_PREFIX && !argsMatch) {
			return false;
		}
	}

	if (env[ENV_DEBUG]) {
		const matchType =
			firstChar === EXECUTABLE_EXACT_MATCH_PREFIX ? "exact" : "partial";
		log(
			`matched via ${matchType} name: "${executable.name}" in [${toCompare.slice(0, 3).join(", ")}...]`,
		);
	}

	return true;
}

export default class ProcessServer {
	private handlers!: Handlers;
	private timestamps: Record<string, number> = {};
	private names: Record<string, string> = {};
	private pids: Record<string, number> = {};
	private pathCache: Map<
		number,
		{ path: string; normalized: string; variations: string[] }
	> = new Map();

	constructor(handlers: Handlers) {
		if (!NativeImpl) return;

		this.handlers = handlers;
		this.scan = this.scan.bind(this);

		this.scan();
		setInterval(this.scan, PROCESS_SCAN_INTERVAL);

		log("started");
	}

	private generatePathVariations(normalizedPath: string): string[] {
		const toCompare: string[] = [];
		const splitPath = normalizedPath.split("/");

		for (let i = 1; i < splitPath.length; i++) {
			toCompare.push(splitPath.slice(-i).join("/"));
		}

		const baseLength = toCompare.length;
		for (let i = 0; i < baseLength; i++) {
			const p = toCompare[i];
			if (!p) continue;
			for (const suffix of EXECUTABLE_ARCH_SUFFIXES) {
				if (p.includes(suffix)) {
					toCompare.push(p.replace(suffix, ""));
				}
			}
		}

		return toCompare;
	}

	private getCandidateApps(pathVariations: string[]): DetectableApp[] {
		const hasAppName = pathVariations.some((path) =>
			path.includes(".app_name"),
		);
		if (hasAppName) {
			return DetectableDB;
		}

		const candidateSet = new Set<DetectableApp>();

		for (const pathVar of pathVariations) {
			const apps = executableIndex.get(pathVar);
			if (apps) {
				for (const app of apps) {
					candidateSet.add(app);
				}
			}

			const lastSlash = pathVar.lastIndexOf("/");
			const filename =
				lastSlash >= 0 ? pathVar.substring(lastSlash + 1) : pathVar;
			const dotIndex = filename.lastIndexOf(".");
			if (dotIndex > 0) {
				const withoutExt = filename.substring(0, dotIndex);
				const appsNoExt = executableIndex.get(withoutExt);
				if (appsNoExt) {
					for (const app of appsNoExt) {
						candidateSet.add(app);
					}
				}
			}
		}

		return Array.from(candidateSet);
	}

	async scan(): Promise<void> {
		if (!NativeImpl || !dbLoaded) return;

		const processes = await NativeImpl.getProcesses();
		const ids: string[] = [];
		const activePids = new Set<number>();

		for (const [pid, _path, args] of processes) {
			activePids.add(pid);

			let cached = this.pathCache.get(pid);
			const normalizedPath = _path.toLowerCase().replaceAll("\\", "/");

			if (!cached || cached.path !== _path) {
				const variations = this.generatePathVariations(normalizedPath);
				cached = {
					path: _path,
					normalized: normalizedPath,
					variations,
				};
				this.pathCache.set(pid, cached);
			}

			const toCompare = cached.variations;

			const candidateApps = this.getCandidateApps(toCompare);

			for (const { executables, id, name } of candidateApps) {
				let matched =
					matchesExecutable(
						{ name, is_launcher: false },
						toCompare,
						args,
						false,
						true,
						false,
					) ?? false;

				if (!matched) {
					matched =
						executables?.some((x) =>
							matchesExecutable(
								x,
								toCompare,
								args,
								false,
								false,
								true,
							),
						) ?? false;
				}

				if (!matched) {
					matched =
						executables?.some((x) =>
							matchesExecutable(
								x,
								toCompare,
								args,
								true,
								false,
								true,
							),
						) ?? false;
				}

				if (!matched) {
					matched =
						executables?.some((x) =>
							matchesExecutable(
								x,
								toCompare,
								args,
								false,
								false,
								false,
							),
						) ?? false;
				}

				if (!matched) {
					matched =
						executables?.some((x) =>
							matchesExecutable(
								x,
								toCompare,
								args,
								true,
								false,
								false,
							),
						) ?? false;
				}

				if (matched) {
					this.names[id] = name;
					this.pids[id] = pid;

					ids.push(id);
					if (!this.timestamps[id]) {
						log("detected game!", name);
						if (env[ENV_DEBUG]) {
							log(`  game id: ${id}`);
							log(`  process pid: ${pid}`);
							log(`  process path: ${_path}`);
						}
						this.timestamps[id] = Date.now();
					}

					const timestamp = this.timestamps[id];
					if (!timestamp) continue;

					this.handlers.activity(
						id,
						{
							application_id: id,
							name,
							timestamps: {
								start: timestamp,
							},
						},
						pid,
						name,
					);

					break;
				}
			}
		}

		for (const cachedPid of this.pathCache.keys()) {
			if (!activePids.has(cachedPid)) {
				this.pathCache.delete(cachedPid);
			}
		}

		for (const id in this.timestamps) {
			if (!ids.includes(id)) {
				const gameName = this.names[id];
				log("lost game!", gameName ?? "unknown");
				delete this.timestamps[id];

				const pid = this.pids[id];
				if (pid !== undefined) {
					this.handlers.activity(id, null, pid);
				}
			}
		}
	}
}
