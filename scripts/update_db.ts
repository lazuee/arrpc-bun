import { write } from "bun";
import { print, printError } from "../src/logger";
import type { DetectableApp } from "../src/types";

print("Fetching detectable.json from Discord API...");

let current: DetectableApp[] = [];
try {
	const detectableDbRaw = await import("../detectable.json");
	current = detectableDbRaw.default as DetectableApp[];
} catch {
	print("No existing detectable.json found, starting fresh");
}

const response = await fetch(
	"https://discord.com/api/v9/applications/detectable",
);

if (!response.ok) {
	printError(`Failed to fetch detectable.json: HTTP ${response.status}`);
	process.exit(1);
}

const updated = (await response.json()) as DetectableApp[];
await write(
	new URL("../detectable.json", import.meta.url),
	JSON.stringify(updated, null, 2),
);

print("Updated detectable.json");
print(
	`  ${current.length} -> ${updated.length} games (+${updated.length - current.length})`,
);

const oldNames = current.map((x) => x.name);
const newNames = updated.map((x) => x.name);
const newGames = newNames.filter((x) => !oldNames.includes(x));

if (newGames.length > 0) {
	print(`  New games: ${newGames.slice(0, 5).join(", ")}`);
	if (newGames.length > 5) {
		print(`  ... and ${newGames.length - 5} more`);
	}
}

print("\nFetching detectable_fixes.json from upstream...");

let currentFixesData: Partial<DetectableApp>[] = [];
try {
	const detectableFixesDbRaw = await import("../detectable_fixes.json");
	currentFixesData = detectableFixesDbRaw.default as Partial<DetectableApp>[];
} catch {
	print("No existing detectable_fixes.json found, starting fresh");
}

const fixesResponse = await fetch(
	"https://raw.githubusercontent.com/Creationsss/arrpc-bun/refs/heads/main/detectable_fixes.json",
);

if (!fixesResponse.ok) {
	printError(
		`Failed to fetch detectable_fixes.json: HTTP ${fixesResponse.status}`,
	);
	print("Keeping existing detectable_fixes.json");
} else {
	const updatedFixes =
		(await fixesResponse.json()) as Partial<DetectableApp>[];
	await write(
		new URL("../detectable_fixes.json", import.meta.url),
		JSON.stringify(updatedFixes, null, "\t"),
	);
	print("Updated detectable_fixes.json");
	print(
		`  ${currentFixesData.length} -> ${updatedFixes.length} entries (+${updatedFixes.length - currentFixesData.length})`,
	);

	const oldFixIds = currentFixesData.map((x) => x.id).filter(Boolean);
	const newFixIds = updatedFixes.map((x) => x.id).filter(Boolean);
	const newFixes = newFixIds.filter((x) => !oldFixIds.includes(x));

	if (newFixes.length > 0) {
		print(`  New fixes: ${newFixes.join(", ")}`);
	}
}

print("\nDatabase update complete!");
