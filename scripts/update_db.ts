import { createWriteStream, readFileSync } from "node:fs";
import { get } from "node:https";
import { DETECTABLE_DB_PATH } from "../src/constants";
import type { DetectableApp } from "../src/types/index.d.ts";

const path = DETECTABLE_DB_PATH;

const current: DetectableApp[] = JSON.parse(readFileSync(path, "utf8"));

const file = createWriteStream(path);

get("https://discord.com/api/v9/applications/detectable", (res) => {
	if (res.statusCode !== 200) {
		console.error(`Failed to fetch detectable DB: HTTP ${res.statusCode}`);
		file.close();
		process.exit(1);
	}

	res.pipe(file);

	file.on("finish", () => {
		file.close();

		try {
			const updated: DetectableApp[] = JSON.parse(readFileSync(path, "utf8"));
			console.log("Updated detectable DB");
			console.log(
				`${current.length} -> ${updated.length} games (+${updated.length - current.length})`,
			);

			const oldNames = current.map((x) => x.name);
			const newNames = updated.map((x) => x.name);
			const newGames = newNames.filter((x) => !oldNames.includes(x));

			if (newGames.length > 0) {
				console.log("New games:", newGames);
			}
		} catch (e: unknown) {
			console.error("Failed to parse updated detectable DB:", e);
			process.exit(1);
		}
	});

	file.on("error", (e: unknown) => {
		console.error("Failed to write detectable DB:", e);
		process.exit(1);
	});
}).on("error", (e: unknown) => {
	console.error("Failed to fetch detectable DB:", e);
	process.exit(1);
});
