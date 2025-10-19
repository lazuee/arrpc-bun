export interface DetectableApp {
	id: string;
	name: string;
	executables?: Array<{
		name: string;
		is_launcher?: boolean;
		arguments?: string;
	}>;
}

export type ProcessInfo = [number, string, string[]];
