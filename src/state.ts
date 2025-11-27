import { tmpdir } from "node:os";
import { join } from "node:path";
import { env, file, write } from "bun";
import {
	ENV_DEBUG,
	STATE_COLOR,
	STATE_FILE_MAX_INDEX,
	STATE_FILE_PREFIX,
} from "./constants";
import type { ActivityPayload, ServerInfo, StateFileContent } from "./types";
import { createLogger } from "./utils";

const log = createLogger("state", ...STATE_COLOR);

interface Servers {
	bridge?: ServerInfo;
	websocket?: ServerInfo;
	ipc?: { socketPath: string };
}

class StateManager {
	private activities = new Map<string, ActivityPayload>();
	private servers: Servers = {};
	private stateFilePath: string | null = null;
	private appVersion = "unknown";
	private writeDebounceTimer: Timer | null = null;
	private readonly DEBOUNCE_MS = 100;

	async initialize(): Promise<void> {
		const tempDir = tmpdir();

		for (let i = 0; i <= STATE_FILE_MAX_INDEX; i++) {
			const path = join(tempDir, `${STATE_FILE_PREFIX}-${i}`);
			const f = file(path);

			if (await f.exists()) {
				try {
					const content = (await f.json()) as StateFileContent;
					const age = Date.now() - content.timestamp;
					if (age > 10000) {
						this.stateFilePath = path;
						break;
					}
				} catch {
					this.stateFilePath = path;
					break;
				}
			} else {
				this.stateFilePath = path;
				break;
			}
		}

		if (!this.stateFilePath) {
			log.warn(`all state file slots in use (0-${STATE_FILE_MAX_INDEX})`);
			this.stateFilePath = join(
				tempDir,
				`${STATE_FILE_PREFIX}-${process.pid}`,
			);
		}

		if (env[ENV_DEBUG]) {
			log.info(`state file path: ${this.stateFilePath}`);
		}
	}

	setAppVersion(version: string): void {
		this.appVersion = version;
	}

	getStateFilePath(): string | null {
		return this.stateFilePath;
	}

	setServer(type: "bridge" | "websocket", info: ServerInfo): void {
		this.servers[type] = info;
		this.scheduleWrite();
	}

	setIpcServer(socketPath: string): void {
		this.servers.ipc = { socketPath };
		this.scheduleWrite();
	}

	update(payload: ActivityPayload): void {
		if (payload.activity) {
			this.activities.set(payload.socketId, payload);
		} else {
			this.activities.delete(payload.socketId);
		}
		this.scheduleWrite();
	}

	private scheduleWrite(): void {
		if (this.writeDebounceTimer) {
			clearTimeout(this.writeDebounceTimer);
		}
		this.writeDebounceTimer = setTimeout(() => {
			this.writeToFile();
		}, this.DEBOUNCE_MS);
	}

	private async writeToFile(): Promise<void> {
		if (!this.stateFilePath) return;

		const content: StateFileContent = {
			appVersion: this.appVersion,
			timestamp: Date.now(),
			servers: this.servers,
			activities: [],
		};

		for (const [socketId, payload] of this.activities) {
			if (!payload.activity) continue;

			const activity = payload.activity as {
				name?: string;
				application_id?: string;
				timestamps?: { start?: number };
			};

			content.activities.push({
				socketId,
				name: activity.name || "Unknown",
				applicationId: activity.application_id || "",
				pid: payload.pid ?? 0,
				startTime: activity.timestamps?.start || null,
			});
		}

		try {
			await write(this.stateFilePath, JSON.stringify(content, null, 2));
			if (env[ENV_DEBUG]) {
				log.info(
					`wrote state file: ${content.activities.length} activities`,
				);
			}
		} catch (error) {
			log.info(`failed to write state file: ${error}`);
		}
	}

	async cleanup(): Promise<void> {
		if (this.writeDebounceTimer) {
			clearTimeout(this.writeDebounceTimer);
		}
		if (!this.stateFilePath) return;

		try {
			await file(this.stateFilePath).unlink();
			if (env[ENV_DEBUG]) {
				log.info("cleaned up state file");
			}
		} catch (error) {
			log.info(`failed to cleanup state file: ${error}`);
		}
	}
}

export const stateManager = new StateManager();
