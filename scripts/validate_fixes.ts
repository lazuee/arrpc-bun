import { file } from "bun";
import { getCustomDbPath, getDetectableDbPath } from "../src/constants";
import type { DetectableApp } from "../src/types";

const VALID_PLATFORMS = ["win32", "linux", "darwin"];

interface ValidationError {
	path: string;
	message: string;
}

const errors: ValidationError[] = [];

function addError(path: string, message: string): void {
	errors.push({ path, message });
}

async function validateCustomJson(): Promise<boolean> {
	console.log("Validating detectable_fixes.json...\n");

	const customFile = file(getCustomDbPath());
	if (!(await customFile.exists())) {
		console.log("No detectable_fixes.json file found (this is okay)");
		return true;
	}

	let customEntries: unknown;
	try {
		customEntries = await customFile.json();
	} catch (error) {
		addError("detectable_fixes.json", `Invalid JSON: ${error}`);
		return false;
	}

	if (!Array.isArray(customEntries)) {
		addError("detectable_fixes.json", "Root must be an array");
		return false;
	}

	const detectableDB = (await file(
		getDetectableDbPath(),
	).json()) as DetectableApp[];
	const detectableIds = new Set(detectableDB.map((entry) => entry.id));

	for (let i = 0; i < customEntries.length; i++) {
		const entry = customEntries[i];
		const basePath = `[${i}]`;

		if (typeof entry !== "object" || entry === null) {
			addError(basePath, "Entry must be an object");
			continue;
		}

		if (!("id" in entry)) {
			addError(basePath, "Missing required field: id");
			continue;
		}

		if (typeof entry.id !== "string") {
			addError(`${basePath}.id`, "Must be a string");
		}

		const existsInDb = detectableIds.has(entry.id);

		if ("executables" in entry) {
			if (!Array.isArray(entry.executables)) {
				addError(`${basePath}.executables`, "Must be an array");
			} else {
				for (let j = 0; j < entry.executables.length; j++) {
					const exe = entry.executables[j];
					const exePath = `${basePath}.executables[${j}]`;

					if (typeof exe !== "object" || exe === null) {
						addError(exePath, "Must be an object");
						continue;
					}

					if (!("name" in exe)) {
						addError(
							`${exePath}.name`,
							"Missing required field: name",
						);
					} else if (typeof exe.name !== "string") {
						addError(`${exePath}.name`, "Must be a string");
					} else if (exe.name.trim() === "") {
						addError(`${exePath}.name`, "Cannot be empty");
					}

					if (
						"is_launcher" in exe &&
						typeof exe.is_launcher !== "boolean"
					) {
						addError(`${exePath}.is_launcher`, "Must be a boolean");
					}

					if (
						"arguments" in exe &&
						typeof exe.arguments !== "string"
					) {
						addError(`${exePath}.arguments`, "Must be a string");
					}

					if ("os" in exe) {
						if (typeof exe.os !== "string") {
							addError(`${exePath}.os`, "Must be a string");
						} else if (!VALID_PLATFORMS.includes(exe.os)) {
							addError(
								`${exePath}.os`,
								`Must be one of: ${VALID_PLATFORMS.join(", ")}`,
							);
						}
					}
				}
			}
		}

		if ("name" in entry && typeof entry.name !== "string") {
			addError(`${basePath}.name`, "Must be a string");
		}

		if ("aliases" in entry) {
			if (!Array.isArray(entry.aliases)) {
				addError(`${basePath}.aliases`, "Must be an array");
			} else {
				for (let j = 0; j < entry.aliases.length; j++) {
					if (typeof entry.aliases[j] !== "string") {
						addError(
							`${basePath}.aliases[${j}]`,
							"Must be a string",
						);
					}
				}
			}
		}

		if ("hook" in entry && typeof entry.hook !== "boolean") {
			addError(`${basePath}.hook`, "Must be a boolean");
		}

		if ("overlay" in entry && typeof entry.overlay !== "boolean") {
			addError(`${basePath}.overlay`, "Must be a boolean");
		}

		if (
			"overlay_warn" in entry &&
			typeof entry.overlay_warn !== "boolean"
		) {
			addError(`${basePath}.overlay_warn`, "Must be a boolean");
		}

		if (
			"overlay_compatibility_hook" in entry &&
			typeof entry.overlay_compatibility_hook !== "boolean"
		) {
			addError(
				`${basePath}.overlay_compatibility_hook`,
				"Must be a boolean",
			);
		}

		if ("overlay_methods" in entry) {
			if (
				entry.overlay_methods !== null &&
				typeof entry.overlay_methods !== "number"
			) {
				addError(
					`${basePath}.overlay_methods`,
					"Must be a number or null",
				);
			}
		}

		if ("icon_hash" in entry && typeof entry.icon_hash !== "string") {
			addError(`${basePath}.icon_hash`, "Must be a string");
		}

		if ("themes" in entry) {
			if (!Array.isArray(entry.themes)) {
				addError(`${basePath}.themes`, "Must be an array");
			} else {
				for (let j = 0; j < entry.themes.length; j++) {
					if (typeof entry.themes[j] !== "string") {
						addError(
							`${basePath}.themes[${j}]`,
							"Must be a string",
						);
					}
				}
			}
		}

		if (errors.length === 0) {
			if (existsInDb) {
				console.log(
					`Entry ${i}: Patches existing game (ID: ${entry.id})`,
				);
			} else {
				console.log(`Entry ${i}: Adds new game (ID: ${entry.id})`);
				if (!("name" in entry)) {
					console.log(
						"Warning: New game without 'name' field will use \"Custom Game\"",
					);
				}
			}
		}
	}

	return errors.length === 0;
}

const _isValid = await validateCustomJson();

if (errors.length > 0) {
	console.log("\n❌ Validation failed with errors:\n");
	for (const error of errors) {
		console.log(`  ${error.path}: ${error.message}`);
	}
	process.exit(1);
}

console.log("\ndetectable_fixes.json is valid!");
process.exit(0);
