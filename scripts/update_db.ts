import { file, write } from "bun";
import { DETECTABLE_DB_PATH } from "../src/constants";
import type { DetectableApp } from "../src/types/index.d.ts";

const path = DETECTABLE_DB_PATH;

const currentFile = file(path);
const current: DetectableApp[] = (await currentFile.exists())
	? await currentFile.json()
	: [];

const response = await fetch(
	"https://discord.com/api/v9/applications/detectable",
);

if (!response.ok) {
	console.error(`Failed to fetch detectable DB: HTTP ${response.status}`);
	process.exit(1);
}

const updated = (await response.json()) as DetectableApp[];

const hasOBSInCurrent = current.some(
	(app) => app.id === "STREAMERMODE" || app.name === "OBS",
);

const hasOBSInUpdated = updated.some(
	(app) => app.id === "STREAMERMODE" || app.name === "OBS",
);

if (!hasOBSInUpdated) {
	if (hasOBSInCurrent) {
		const obsEntry = current.find(
			(app) => app.id === "STREAMERMODE" || app.name === "OBS",
		);
		if (obsEntry) {
			updated.push(obsEntry);
		}
	} else {
		updated.push({
			aliases: ["Obs"],
			executables: [
				{ is_launcher: false, name: "obs", os: "linux" },
				{ is_launcher: false, name: "obs.exe", os: "win32" },
				{ is_launcher: false, name: "obs.app", os: "darwin" },
			],
			hook: true,
			id: "STREAMERMODE",
			name: "OBS",
		});
		console.log("Added custom OBS StreamerMode entry");
	}
}

await write(path, JSON.stringify(updated, null, 2));

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
