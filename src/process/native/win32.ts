import { dlopen, FFIType, type Pointer, suffix } from "bun:ffi";
import type { ProcessInfo } from "@types";
import { createLogger } from "@utils";

const log = createLogger("process:win32", 237, 66, 69);

const TH32CS_SNAPPROCESS = 0x00000002;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const PROCESS_VM_READ = 0x0010;
const MAX_PATH = 260;
const ProcessCommandLineInformation = 60;
const PROCESSENTRY32W_SIZE = 568;

const kernel32 = dlopen(`kernel32.${suffix}`, {
	CreateToolhelp32Snapshot: {
		args: [FFIType.u32, FFIType.u32],
		returns: FFIType.ptr,
	},
	Process32FirstW: {
		args: [FFIType.ptr, FFIType.ptr],
		returns: FFIType.bool,
	},
	Process32NextW: {
		args: [FFIType.ptr, FFIType.ptr],
		returns: FFIType.bool,
	},
	OpenProcess: {
		args: [FFIType.u32, FFIType.bool, FFIType.u32],
		returns: FFIType.ptr,
	},
	QueryFullProcessImageNameW: {
		args: [FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.ptr],
		returns: FFIType.bool,
	},
	CloseHandle: {
		args: [FFIType.ptr],
		returns: FFIType.bool,
	},
	GetLastError: {
		args: [],
		returns: FFIType.u32,
	},
});

const ntdll = dlopen(`ntdll.${suffix}`, {
	NtQueryInformationProcess: {
		args: [FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.ptr],
		returns: FFIType.i32,
	},
});

function readWideString(
	buffer: Uint8Array,
	offset = 0,
	maxLength = MAX_PATH,
): string {
	const chars: number[] = [];
	for (
		let i = offset;
		i < buffer.length - 1 && chars.length < maxLength;
		i += 2
	) {
		const charCode = (buffer[i] ?? 0) | ((buffer[i + 1] ?? 0) << 8);
		if (charCode === 0) break;
		chars.push(charCode);
	}
	return String.fromCharCode(...chars);
}

function readDWORD(buffer: Uint8Array, offset: number): number {
	return (
		(buffer[offset] ?? 0) |
		((buffer[offset + 1] ?? 0) << 8) |
		((buffer[offset + 2] ?? 0) << 16) |
		((buffer[offset + 3] ?? 0) << 24)
	);
}

function writeDWORD(buffer: Uint8Array, offset: number, value: number): void {
	buffer[offset] = value & 0xff;
	buffer[offset + 1] = (value >> 8) & 0xff;
	buffer[offset + 2] = (value >> 16) & 0xff;
	buffer[offset + 3] = (value >> 24) & 0xff;
}

function getProcessPath(hProcess: Pointer): string | null {
	try {
		const pathBuffer = new Uint8Array(MAX_PATH * 2);
		const sizeBuffer = new Uint32Array([MAX_PATH]);

		const result = kernel32.symbols.QueryFullProcessImageNameW(
			hProcess,
			0,
			pathBuffer as unknown as Pointer,
			sizeBuffer as unknown as Pointer,
		);

		if (result) {
			return readWideString(pathBuffer);
		}
	} catch {
		// Silently fail for inaccessible processes
	}
	return null;
}

function getProcessCommandLine(hProcess: Pointer): string[] {
	try {
		const pbiBuffer = new Uint8Array(48);
		const returnLength = new Uint32Array(1);

		let status = ntdll.symbols.NtQueryInformationProcess(
			hProcess,
			0,
			pbiBuffer as unknown as Pointer,
			pbiBuffer.length,
			returnLength as unknown as Pointer,
		);

		if (status !== 0) return [];

		const pebAddress = Number(
			new BigUint64Array(pbiBuffer.buffer.slice(8, 16))[0],
		);
		if (pebAddress === 0) return [];

		const cmdLineInfoBuffer = new Uint8Array(8192);
		status = ntdll.symbols.NtQueryInformationProcess(
			hProcess,
			ProcessCommandLineInformation,
			cmdLineInfoBuffer as unknown as Pointer,
			cmdLineInfoBuffer.length,
			returnLength as unknown as Pointer,
		);

		if (status === 0) {
			const length = readDWORD(cmdLineInfoBuffer, 0) & 0xffff;
			if (length > 0 && length < cmdLineInfoBuffer.length) {
				const cmdLine = readWideString(
					cmdLineInfoBuffer,
					16,
					length / 2,
				);
				if (cmdLine) {
					return parseCommandLine(cmdLine);
				}
			}
		}
	} catch {
		// Silently fail for inaccessible processes
	}
	return [];
}

function parseCommandLine(cmdLine: string): string[] {
	const args: string[] = [];
	let current = "";
	let inQuotes = false;
	let i = 0;

	while (i < cmdLine.length) {
		const char = cmdLine[i];

		if (char === '"') {
			inQuotes = !inQuotes;
			i++;
			continue;
		}

		if (char === " " && !inQuotes) {
			if (current) {
				args.push(current);
				current = "";
			}
			i++;
			continue;
		}

		if (char === "\\") {
			let numBackslashes = 0;
			while (i < cmdLine.length && cmdLine[i] === "\\") {
				numBackslashes++;
				i++;
			}

			if (i < cmdLine.length && cmdLine[i] === '"') {
				current += "\\".repeat(Math.floor(numBackslashes / 2));
				if (numBackslashes % 2 === 0) {
					inQuotes = !inQuotes;
					i++;
				} else {
					current += '"';
					i++;
				}
			} else {
				current += "\\".repeat(numBackslashes);
			}
			continue;
		}

		current += char;
		i++;
	}

	if (current) {
		args.push(current);
	}

	return args;
}

export function getProcesses(): Promise<ProcessInfo[]> {
	return new Promise((resolve) => {
		const processes: ProcessInfo[] = [];

		try {
			const hSnapshot = kernel32.symbols.CreateToolhelp32Snapshot(
				TH32CS_SNAPPROCESS,
				0,
			);

			if (!hSnapshot || hSnapshot === -1) {
				log(
					"failed to create process snapshot:",
					kernel32.symbols.GetLastError(),
				);
				resolve([]);
				return;
			}

			try {
				const pe32 = new Uint8Array(PROCESSENTRY32W_SIZE);
				writeDWORD(pe32, 0, PROCESSENTRY32W_SIZE);

				let hasProcess = kernel32.symbols.Process32FirstW(
					hSnapshot,
					pe32 as unknown as Pointer,
				);

				while (hasProcess) {
					const pid = readDWORD(pe32, 8);
					const exeFile = readWideString(pe32, 44, 260);

					if (pid > 0 && exeFile) {
						const hProcess = kernel32.symbols.OpenProcess(
							PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ,
							false,
							pid,
						);

						let fullPath = "";
						let args: string[] = [];

						if (hProcess && hProcess !== 0) {
							try {
								const path = getProcessPath(hProcess);
								if (path) {
									fullPath = path;
								}

								args = getProcessCommandLine(hProcess);
							} finally {
								kernel32.symbols.CloseHandle(hProcess);
							}
						}

						if (!fullPath) {
							fullPath = exeFile;
						}

						processes.push([pid, fullPath, args]);
					}

					hasProcess = kernel32.symbols.Process32NextW(
						hSnapshot,
						pe32 as unknown as Pointer,
					);
				}
			} finally {
				kernel32.symbols.CloseHandle(hSnapshot);
			}
		} catch (error) {
			log("error enumerating processes:", error);
		}

		resolve(processes);
	});
}
