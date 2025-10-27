import { file, write } from "bun";
import type { DetectableApp } from "../src/types";

import { getDetectableDbPath } from "../src/constants";

const path = getDetectableDbPath();

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
