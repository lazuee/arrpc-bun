import { file } from "bun";
import {
	EXECUTABLE_ARCH_SUFFIXES,
	EXECUTABLE_EXACT_MATCH_PREFIX,
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

const NativeImpl = (Natives as Record<string, Native>)[process.platform] as
	| Native
	| undefined;

function matchesExecutable(
	executable: {
		name: string;
		is_launcher?: boolean;
		arguments?: string;
	},
	toCompare: string[],
	args: string[] | null,
	checkLauncher: boolean,
): boolean {
	if (executable.is_launcher !== checkLauncher) return false;

	const firstChar = executable.name[0];
	const firstCompare = toCompare[0];
	if (!firstChar || !firstCompare) return false;

	const nameMatches =
		firstChar === EXECUTABLE_EXACT_MATCH_PREFIX
			? executable.name.substring(1) === firstCompare
			: toCompare.some((y) => executable.name === y);

	if (!nameMatches) return false;

	if (args && executable.arguments) {
		return args.join(" ").indexOf(executable.arguments) > -1;
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
				// try matching non-launcher executables first
				let matched =
					executables?.some((x) =>
						matchesExecutable(x, toCompare, args, false),
					) ?? false;

				// if not matched try matching launcher executables
				if (!matched) {
					matched =
						executables?.some((x) =>
							matchesExecutable(x, toCompare, args, true),
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
