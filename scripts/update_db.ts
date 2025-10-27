import { file, write } from "bun";
import { getCustomDbPath, getDetectableDbPath } from "../src/constants";
import type { DetectableApp } from "../src/types";

console.log("Fetching detectable.json from Discord API...");
const detectablePath = getDetectableDbPath();

const currentDetectable = file(detectablePath);
const current: DetectableApp[] = (await currentDetectable.exists())
	? await currentDetectable.json()
	: [];

const response = await fetch(
	"https://discord.com/api/v9/applications/detectable",
);

if (!response.ok) {
	console.error(`Failed to fetch detectable.json: HTTP ${response.status}`);
	process.exit(1);
}

const updated = (await response.json()) as DetectableApp[];

await write(detectablePath, JSON.stringify(updated, null, 2));

console.log("Updated detectable.json");
console.log(
	`  ${current.length} -> ${updated.length} games (+${updated.length - current.length})`,
);

const oldNames = current.map((x) => x.name);
const newNames = updated.map((x) => x.name);
const newGames = newNames.filter((x) => !oldNames.includes(x));

if (newGames.length > 0) {
	console.log("  New games:", newGames.slice(0, 5).join(", "));
	if (newGames.length > 5) {
		console.log(`  ... and ${newGames.length - 5} more`);
	}
}

console.log("\nFetching detectable_fixes.json from upstream...");
const fixesPath = getCustomDbPath();

const currentFixes = file(fixesPath);
const currentFixesData: Partial<DetectableApp>[] = (await currentFixes.exists())
	? await currentFixes.json()
	: [];

const fixesResponse = await fetch(
	"https://heliopolis.live/creations/arrpc-bun/-/snippets/6/raw/main/detectable_fixes.json",
);

if (!fixesResponse.ok) {
	console.error(
		`Failed to fetch detectable_fixes.json: HTTP ${fixesResponse.status}`,
	);
	console.log("Keeping existing detectable_fixes.json");
} else {
	const updatedFixes =
		(await fixesResponse.json()) as Partial<DetectableApp>[];

	await write(fixesPath, JSON.stringify(updatedFixes, null, "\t"));

	console.log("Updated detectable_fixes.json");
	console.log(
		`  ${currentFixesData.length} -> ${updatedFixes.length} entries (+${updatedFixes.length - currentFixesData.length})`,
	);

	const oldFixIds = currentFixesData.map((x) => x.id).filter(Boolean);
	const newFixIds = updatedFixes.map((x) => x.id).filter(Boolean);
	const newFixes = newFixIds.filter((x) => !oldFixIds.includes(x));

	if (newFixes.length > 0) {
		console.log("  New fixes:", newFixes.join(", "));
	}
}

console.log("\nDatabase update complete!");
