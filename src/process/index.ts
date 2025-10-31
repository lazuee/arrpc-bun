import { file } from "bun";
import {
	EXECUTABLE_ARCH_SUFFIXES,
	EXECUTABLE_EXACT_MATCH_PREFIX,
	getCustomDbPath,
	getDetectableDbPath,
	PROCESS_COLOR,
	PROCESS_SCAN_INTERVAL,
} from "../constants";
import type { DetectableApp, Handlers, Native } from "../types";
import { createLogger } from "../utils";
import * as Natives from "./native/index";

const log = createLogger("process", ...PROCESS_COLOR);

const DetectableDB = (await file(
	getDetectableDbPath(),
).json()) as DetectableApp[];

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
				existingEntry.executables = [
					...(existingEntry.executables || []),
					...customEntry.executables,
				];
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

// Load detectable_fixes.json if it exists
// This file contains patches and additions to Discord's detectable database
try {
	const customFile = file(getCustomDbPath());
	if (await customFile.exists()) {
		const customEntries =
			(await customFile.json()) as Partial<DetectableApp>[];
		mergeCustomEntries(customEntries, "detectable_fixes.json");
	}
} catch {
	// ignore errors if detectable_fixes.json doesn't exist or is invalid
}

const NativeImpl = (Natives as Record<string, Native>)[process.platform] as
	| Native
	| undefined;

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
	checkParallels: boolean,
	strictArgs: boolean,
): boolean {
	if (executable.is_launcher !== checkLauncher) return false;

	// if (executable.os && executable.os !== process.platform) return false;

	const firstChar = executable.name[0];
	const firstCompare = toCompare[0];

	if (!firstChar || !firstCompare) return false;

	if (checkParallels) {
		// match parallels app only
		if (firstCompare.endsWith(".app_parallels")) {
			const parallelName = firstCompare.replace(".app_parallels", "");
			return executable.name.toLowerCase() === parallelName; // app name must match exactly
		}
	}

	const nameMatches =
		firstChar === EXECUTABLE_EXACT_MATCH_PREFIX
			? executable.name.substring(1) === firstCompare
			: toCompare.some((y) => executable.name === y);

	if (!nameMatches) return false;

	if (args && executable.arguments) {
		const argsMatch = args.join(" ").indexOf(executable.arguments) > -1;
		if (strictArgs) {
			return argsMatch; // must match exactly
		}
		// in lenient mode: for generic executables (like >java, >python),
		// still require arguments to match to avoid false positives
		if (firstChar === EXECUTABLE_EXACT_MATCH_PREFIX && !argsMatch) {
			return false;
		}
	}

	return true;
}

export default class ProcessServer {
	private handlers!: Handlers;
	private timestamps: Record<string, number> = {};
	private names: Record<string, string> = {};
	private pids: Record<string, number> = {};

	constructor(handlers: Handlers) {
		if (!NativeImpl) return;

		this.handlers = handlers;
		this.scan = this.scan.bind(this);

		this.scan();
		setInterval(this.scan, PROCESS_SCAN_INTERVAL);

		log("started");
	}

	async scan(): Promise<void> {
		if (!NativeImpl) return;

		const processes = await NativeImpl.getProcesses();
		const ids: string[] = [];

		for (const [pid, _path, args] of processes) {
			const path = _path.toLowerCase().replaceAll("\\", "/");
			const toCompare: string[] = [];
			const splitPath = path.split("/");

			for (let i = 1; i < splitPath.length; i++) {
				toCompare.push(splitPath.slice(-i).join("/"));
			}

			for (const p of toCompare.slice()) {
				for (const suffix of EXECUTABLE_ARCH_SUFFIXES) {
					toCompare.push(p.replace(suffix, ""));
				}
			}

			for (const { executables, id, name } of DetectableDB) {
				// prioritize exact matches (with strict argument checking)
				// try non-launcher executables with strict args first
				let matched =
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

				// try launcher executables with strict args
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

				// fall back to lenient matching (name-only, ignore argument mismatches)
				// this handles cases where Discord's database has outdated argument requirements
				if (!matched) {
					// try non-launcher executables without strict args
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

				// try launcher executables without strict args
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

				// support Parallels Desktop (Mac)
				if (!matched && process.platform === "darwin") {
					// try app name
					matched =
						matchesExecutable(
							{ name, is_launcher: false },
							toCompare,
							args,
							false,
							true,
							false,
						) ?? false;
				}

				if (matched) {
					this.names[id] = name;
					this.pids[id] = pid;

					ids.push(id);
					if (!this.timestamps[id]) {
						log("detected game!", name);
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
				}
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
