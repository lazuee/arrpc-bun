export interface Activity {
	application_id?: string;
	name?: string;
	details?: string;
	state?: string;
	type?: number;
	timestamps?: {
		start?: number;
		end?: number;
	};
	assets?: {
		large_image?: string;
		large_text?: string;
		small_image?: string;
		small_text?: string;
	};
	party?: {
		id?: string;
		size?: [number, number];
	};
	secrets?: {
		join?: string;
		spectate?: string;
		match?: string;
	};
	buttons?: Array<{
		label: string;
		url: string;
	}>;
	instance?: boolean;
	flags?: number;
	metadata?: {
		button_urls?: string[];
	};
}

export interface ActivityPayload {
	activity: Activity | null;
	pid?: number;
	socketId: string;
}

export interface StateFileContent {
	version: string;
	timestamp: number;
	activities: Array<{
		socketId: string;
		name: string;
		applicationId: string;
		pid: number;
		startTime: number | null;
	}>;
}
