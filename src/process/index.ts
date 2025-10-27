import { file } from "bun";
import type {
	DetectableApp,
	ExtendedSocket,
	ExtendedWebSocket,
	Handlers,
} from "../types";
import { createLogger } from "../utils";
import * as Natives from "./native/index";

import {
	EXECUTABLE_ARCH_SUFFIXES,
	EXECUTABLE_EXACT_MATCH_PREFIX,
	PROCESS_COLOR,
	PROCESS_SCAN_INTERVAL,
	getDetectableDbPath,
} from "../constants";

const log = createLogger("process", ...PROCESS_COLOR);

const DetectableDB = (await file(
	getDetectableDbPath(),
).json()) as DetectableApp[];

type Native = {
	getProcesses: () => Promise<Array<[number, string, string[]]>>;
};

const Native = (Natives as Record<string, Native>)[process.platform] as
	| Native
	| undefined;

const timestamps: Record<string, number> = {};
const names: Record<string, string> = {};
const pids: Record<string, number> = {};

export default class ProcessServer {
	private handlers!: Handlers;

	constructor(handlers: Handlers) {
		if (!Native) return;

		this.handlers = handlers;
		this.scan = this.scan.bind(this);

		this.scan();
		setInterval(this.scan, PROCESS_SCAN_INTERVAL);

		log("started");
	}

	async scan(): Promise<void> {
		if (!Native) return;

		const processes = await Native.getProcesses();
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
				let matched = executables?.some((x) => {
					if (x.is_launcher) return false;
					const firstChar = x.name[0];
					const firstCompare = toCompare[0];
					if (!firstChar || !firstCompare) return false;
					if (
						firstChar === EXECUTABLE_EXACT_MATCH_PREFIX
							? x.name.substring(1) !== firstCompare
							: !toCompare.some((y) => x.name === y)
					) {
						return false;
					}
					if (args && x.arguments)
						return args.join(" ").indexOf(x.arguments) > -1;
					return true;
				});

				if (!matched) {
					matched = executables?.some((x) => {
						if (!x.is_launcher) return false;
						const firstChar = x.name[0];
						const firstCompare = toCompare[0];
						if (!firstChar || !firstCompare) return false;
						if (
							firstChar === EXECUTABLE_EXACT_MATCH_PREFIX
								? x.name.substring(1) !== firstCompare
								: !toCompare.some((y) => x.name === y)
						) {
							return false;
						}
						if (args && x.arguments)
							return args.join(" ").indexOf(x.arguments) > -1;
						return true;
					});
				}

				if (matched) {
					names[id] = name;
					pids[id] = pid;

					ids.push(id);
					if (!timestamps[id]) {
						log("detected game!", name);
						timestamps[id] = Date.now();
					}

					const timestamp = timestamps[id];
					if (!timestamp) continue;

					this.handlers.message(
						{
							socketId: id,
						} as unknown as ExtendedSocket | ExtendedWebSocket,
						{
							cmd: "SET_ACTIVITY",
							args: {
								activity: {
									application_id: id,
									name,
									timestamps: {
										start: timestamp,
									},
								},
								pid,
							},
						},
					);
				}
			}
		}

		for (const id in timestamps) {
			if (!ids.includes(id)) {
				const gameName = names[id];
				log("lost game!", gameName ?? "unknown");
				delete timestamps[id];

				this.handlers.message(
					{
						socketId: id,
					} as unknown as ExtendedSocket | ExtendedWebSocket,
					{
						cmd: "SET_ACTIVITY",
						args: {
							activity: null,
							pid: pids[id],
						},
					},
				);
			}
		}
	}
}
