import { tmpdir } from "node:os";
import { join } from "node:path";
import { env, write } from "bun";
import { ENV_DEBUG, STATE_COLOR, STATE_FILE_NAME } from "./constants";
import type { ActivityPayload, StateFileContent } from "./types";
import { createLogger } from "./utils";

const log = createLogger("state", ...STATE_COLOR);

class StateManager {
	private activities = new Map<string, ActivityPayload>();
	private stateFilePath: string;
	private writeDebounceTimer: Timer | null = null;
	private readonly DEBOUNCE_MS = 100;

	constructor() {
		this.stateFilePath = join(tmpdir(), STATE_FILE_NAME);
		if (env[ENV_DEBUG]) {
			log(`state file path: ${this.stateFilePath}`);
		}
	}

	getStateFilePath(): string {
		return this.stateFilePath;
	}

	update(payload: ActivityPayload): void {
		if (payload.activity) {
			this.activities.set(payload.socketId, payload);
		} else {
			this.activities.delete(payload.socketId);
		}

		if (this.writeDebounceTimer) {
			clearTimeout(this.writeDebounceTimer);
		}
		this.writeDebounceTimer = setTimeout(() => {
			this.writeToFile();
		}, this.DEBOUNCE_MS);
	}

	private async writeToFile(): Promise<void> {
		const content: StateFileContent = {
			version: "1",
			timestamp: Date.now(),
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
				log(
					`wrote state file: ${content.activities.length} activities`,
				);
			}
		} catch (error) {
			log(`failed to write state file: ${error}`);
		}
	}

	async cleanup(): Promise<void> {
		if (this.writeDebounceTimer) {
			clearTimeout(this.writeDebounceTimer);
		}
		try {
			await write(
				this.stateFilePath,
				JSON.stringify({
					version: "1",
					timestamp: Date.now(),
					activities: [],
				}),
			);
			if (env[ENV_DEBUG]) {
				log("cleaned up state file");
			}
		} catch (error) {
			log(`failed to cleanup state file: ${error}`);
		}
	}
}

export const stateManager = new StateManager();
