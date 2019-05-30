import events = require("events");
import fs from "fs";
import path from "path";
import { Stream } from "stream";
import stream from "stream";
import zlib from "zlib";
import { CentralDirectoryHeader } from "./CentralDirectoryHeader";
import { CentralDirectoryLoc64Header } from "./CentralDirectoryLoc64Header";
import { CentralDirectoryZip64Header } from "./CentralDirectoryZip64Header";
import { consts } from "./consts";
import { CrcVerify } from "./CrcVerify";
import { EntryDataReaderStream } from "./EntryDataReaderStream";
import { EntryVerifyStream } from "./EntryVerifyStream";
import { FileWindowBuffer } from "./FileWindowBuffer";
import { FsRead } from "./FsRead";
import { ZipEntry } from "./ZipEntry";

export interface IStreamZipConfig {
	storeEntries?: boolean;
	file: string;
	chunkSize?: number;
	skipEntryNameValidation?: boolean;
}

export interface IOP {
	win?: FileWindowBuffer;
	totalReadLength?: number;
	pos?: number;
	minPos?: number;
	lastPos?: number;
	chunkSize?: number;
	firstByte?: number;
	sig?: number;
	complete?: () => void;
	lastBufferPosition?: number;
	lastBytesRead?: number;
	entriesLeft?: number;
	entry?: ZipEntry;
	move?: boolean;
}

export class StreamZip extends events.EventEmitter {

	// public get ready() {
	// 	return this.ready;
	// }
	public static debug: boolean;
	public _entries: { [name: string]: ZipEntry };
	public fileName: string;
	public fd: number;
	public fileSize: number;
	public chunkSize: number;
	public ready: boolean;
	public op: IOP;
	public entriesCount: number;
	public centralDirectory: CentralDirectoryHeader;
	public comment: string;

	// public static setFs(customFs) {
	// 	fs = customFs;
	// }
	constructor(private config: IStreamZipConfig) {
		super();
		this.ready = false;

		this._entries = config.storeEntries !== false ? {} : null,
			this.fileName = config.file;

		this.open();
	}

	public open() {
		fs.open(this.fileName, "r", (err, f) => {
			if (err) {
				return this.emit("error", err);
			}
			this.fd = f;
			fs.fstat(this.fd, (serr, stat) => {
				if (serr) {
					return this.emit("error", serr);
				}
				this.fileSize = stat.size;
				this.chunkSize = this.config.chunkSize || Math.round(this.fileSize / 1000);
				this.chunkSize = Math.max(Math.min(this.chunkSize, Math.min(128 * 1024, this.fileSize)), Math.min(1024, this.fileSize));
				this.readCentralDirectory();
			});
		});
	}

	public readUntilFoundCallback(err: Error, bytesRead: number) {
		if (err || !bytesRead) {
			return this.emit("error", err || "Archive read error");
		}
		const buffer = this.op.win.buffer;
		let pos = this.op.lastPos;
		let bufferPosition = pos - this.op.win.position;
		const minPos = this.op.minPos;
		while (--pos >= minPos && --bufferPosition >= 0) {
			if (buffer.length - bufferPosition >= 4 &&
				buffer[bufferPosition] === this.op.firstByte) { // quick check first signature byte
				if (buffer.readUInt32LE(bufferPosition) === this.op.sig) {
					this.op.lastBufferPosition = bufferPosition;
					this.op.lastBytesRead = bytesRead;
					this.op.complete();
					return;
				}
			}
		}
		if (pos === minPos) {
			return this.emit("error", new Error("Bad archive"));
		}
		this.op.lastPos = pos + 1;
		this.op.chunkSize *= 2;
		if (pos <= minPos) {
			return this.emit("error", new Error("Bad archive"));
		}
		const expandLength = Math.min(this.op.chunkSize, pos - minPos);
		this.op.win.expandLeft(expandLength, (expandedErr, expandedBytesRead) => {
			this.readUntilFoundCallback(expandedErr, expandedBytesRead);
		});

	}

	public readCentralDirectory() {
		const totalReadLength = Math.min(consts.ENDHDR + consts.MAXFILECOMMENT, this.fileSize);
		this.op = {
			win: new FileWindowBuffer(this.fd),
			totalReadLength,
			minPos: this.fileSize - totalReadLength,
			lastPos: this.fileSize,
			chunkSize: Math.min(1024, this.chunkSize),
			firstByte: consts.ENDSIGFIRST,
			sig: consts.ENDSIG,
			complete: () => { this.readCentralDirectoryComplete(); }
		};
		this.op.win.read(this.fileSize - this.op.chunkSize, this.op.chunkSize, (err, bytesRead) => {
			this.readUntilFoundCallback(err, bytesRead);
		});
	}

	public readCentralDirectoryComplete() {
		const buffer = this.op.win.buffer;
		const pos = this.op.lastBufferPosition;
		try {
			this.centralDirectory = new CentralDirectoryHeader();
			this.centralDirectory.read(buffer.slice(pos, pos + consts.ENDHDR));
			this.centralDirectory.headerOffset = this.op.win.position + pos;
			if (this.centralDirectory.commentLength) {
				this.comment = buffer.slice(pos + consts.ENDHDR,
					pos + consts.ENDHDR + this.centralDirectory.commentLength).toString();
			} else {
				this.comment = null;
			}
			this.entriesCount = this.centralDirectory.volumeEntries;
			this.centralDirectory = this.centralDirectory;
			if (this.centralDirectory.volumeEntries === consts.EF_ZIP64_OR_16 && this.centralDirectory.totalEntries === consts.EF_ZIP64_OR_16
				|| this.centralDirectory.size === consts.EF_ZIP64_OR_32 || this.centralDirectory.offset === consts.EF_ZIP64_OR_32) {
				this.readZip64CentralDirectoryLocator();
			} else {
				this.op = {};
				this.readEntries();
			}
		} catch (err) {
			this.emit("error", err);
		}
	}

	public readZip64CentralDirectoryLocator() {
		const length = consts.ENDL64HDR;
		if (this.op.lastBufferPosition > length) {
			this.op.lastBufferPosition -= length;
			this.readZip64CentralDirectoryLocatorComplete();
		} else {
			this.op = {
				win: this.op.win,
				totalReadLength: length,
				minPos: this.op.win.position - length,
				lastPos: this.op.win.position,
				chunkSize: this.op.chunkSize,
				firstByte: consts.ENDL64SIGFIRST,
				sig: consts.ENDL64SIG,
				complete: this.readZip64CentralDirectoryLocatorComplete
			};
			this.op.win.read(this.op.lastPos - this.op.chunkSize, this.op.chunkSize, (err, bytesRead) => {
				this.readUntilFoundCallback(err, bytesRead);
			});
		}
	}

	public readZip64CentralDirectoryLocatorComplete() {
		const buffer = this.op.win.buffer;
		const locHeader = new CentralDirectoryLoc64Header();
		locHeader.read(buffer.slice(this.op.lastBufferPosition, this.op.lastBufferPosition + consts.ENDL64HDR));
		const readLength = this.fileSize - locHeader.headerOffset;
		this.op = {
			win: this.op.win,
			totalReadLength: readLength,
			minPos: locHeader.headerOffset,
			lastPos: this.op.lastPos,
			chunkSize: this.op.chunkSize,
			firstByte: consts.END64SIGFIRST,
			sig: consts.END64SIG,
			complete: () => {
				this.readZip64CentralDirectoryComplete();
			}
		};
		this.op.win.read(this.fileSize - this.op.chunkSize, this.op.chunkSize, (err, bytesRead) => {
			this.readUntilFoundCallback(err, bytesRead);
		});
	}

	public readZip64CentralDirectoryComplete() {
		const buffer = this.op.win.buffer;
		const zip64cd = new CentralDirectoryZip64Header();
		zip64cd.read(buffer.slice(this.op.lastBufferPosition, this.op.lastBufferPosition + consts.END64HDR));
		this.centralDirectory.volumeEntries = zip64cd.volumeEntries;
		this.centralDirectory.totalEntries = zip64cd.totalEntries;
		this.centralDirectory.size = zip64cd.size;
		this.centralDirectory.offset = zip64cd.offset;
		this.entriesCount = zip64cd.volumeEntries;
		this.op = {};
		this.readEntries();
	}

	public readEntries() {
		this.op = {
			win: new FileWindowBuffer(this.fd),
			pos: this.centralDirectory.offset,
			chunkSize: this.chunkSize,
			entriesLeft: this.centralDirectory.volumeEntries
		};
		this.op.win.read(this.op.pos, Math.min(this.chunkSize, this.fileSize - this.op.pos), (err, bytesRead) => {
			this.readEntriesCallback(err, bytesRead);
		});
	}

	public readEntriesCallback(err: Error, bytesRead: number) {
		if (err || !bytesRead) {
			return this.emit("error", err || "Entries read error");
		}
		const buffer = this.op.win.buffer;
		let bufferPos = this.op.pos - this.op.win.position;
		const bufferLength = buffer.length;
		let entry = this.op.entry;
		try {
			while (this.op.entriesLeft > 0) {
				if (!entry) {
					entry = new ZipEntry();
					entry.readHeader(buffer, bufferPos);
					entry.headerOffset = this.op.win.position + bufferPos;
					this.op.entry = entry;
					this.op.pos += consts.CENHDR;
					bufferPos += consts.CENHDR;
				}
				const entryHeaderSize = entry.fnameLen + entry.extraLen + entry.comLen;
				const advanceBytes = entryHeaderSize + (this.op.entriesLeft > 1 ? consts.CENHDR : 0);
				if (bufferLength - bufferPos < advanceBytes) {
					this.op.win.moveRight(this.chunkSize, (moveErr, moveBytesRead) => { this.readEntriesCallback(moveErr, moveBytesRead); }, bufferPos);
					this.op.move = true;
					return;
				}
				entry.read(buffer, bufferPos);
				if (!this.config.skipEntryNameValidation) {
					entry.validateName();
				}
				if (this._entries) {
					this._entries[entry.name] = entry;
				}
				this.emit("entry", entry);
				this.op.entry = entry = null;
				this.op.entriesLeft--;
				this.op.pos += entryHeaderSize;
				bufferPos += entryHeaderSize;
			}
			this.emit("ready");
		} catch (err) {
			this.emit("error", err);
		}
	}

	public checkEntriesExist() {
		if (!this._entries) {
			throw new Error("storeEntries disabled");
		}
	}

	public entry(name: string) {
		this.checkEntriesExist();
		return this._entries[name];
	}

	public entries() {
		this.checkEntriesExist();
		return this._entries;
	}

	public stream(streamEntry: string | ZipEntry, callback: (err: Error, stream?: stream.Readable) => void) {
		return this.openEntry(streamEntry, (err, entry) => {
			if (err) {
				return callback(err);
			}
			const offset = this.dataOffset(entry);
			let entryStream: stream.Readable = new EntryDataReaderStream(this.fd, offset, entry.compressedSize);
			if (entry.method === consts.STORED) {
				// nop
			} else if (entry.method === consts.DEFLATED || entry.method === consts.ENHANCED_DEFLATED) {
				entryStream = entryStream.pipe(zlib.createInflateRaw());
			} else {
				return callback(new Error("Unknown compression method: " + entry.method));
			}
			if (this.canVerifyCrc(entry)) {
				entryStream = entryStream.pipe(new EntryVerifyStream(entryStream, entry.crc, entry.size));
			}
			callback(null, entryStream);
		}, false);
	}

	public entryDataSync(entryOrName: string | ZipEntry) {
		let err = null;
		let entry: ZipEntry;
		this.openEntry(entryOrName, (e, en) => {
			err = e;
			entry = en;
		}, true);
		if (err) {
			throw err;
		}
		let data = Buffer.alloc(entry.compressedSize);
		let bytesRead;
		new FsRead(this.fd, data, 0, entry.compressedSize, this.dataOffset(entry), (e, br) => {
			err = e;
			bytesRead = br;
		}).read(true);
		if (err) {
			throw err;
		}
		if (entry.method === consts.STORED) {
			// nop
		} else if (entry.method === consts.DEFLATED || entry.method === consts.ENHANCED_DEFLATED) {
			data = zlib.inflateRawSync(data);
		} else {
			throw new Error("Unknown compression method: " + entry.method);
		}
		if (data.length !== entry.size) {
			throw new Error("Invalid size");
		}
		if (this.canVerifyCrc(entry)) {
			const verify = new CrcVerify(entry.crc, entry.size);
			verify.data(data);
		}
		return data;
	}

	public openEntry(entryOrName: string | ZipEntry, callback: (error: Error, entry?: ZipEntry) => void, sync: boolean) {
		let entry: ZipEntry;
		if (typeof entryOrName === "string") {
			this.checkEntriesExist();
			entry = this._entries[entryOrName];
			if (!entry) {
				return callback(new Error("Entry not found"));
			}
		} else {
			entry = entryOrName;
		}
		if (!entry.isFile) {
			return callback(new Error("Entry is not file"));
		}
		if (!this.fd) {
			return callback(new Error("Archive closed"));
		}
		const buffer = Buffer.alloc(consts.LOCHDR);
		new FsRead(this.fd, buffer, 0, buffer.length, entry.offset, (err) => {
			if (err) {
				return callback(err);
			}
			let readEx;
			try {
				entry.readDataHeader(buffer);
				if (entry.encrypted) {
					readEx = new Error("Entry encrypted");
				}
			} catch (ex) {
				readEx = ex;
			}
			callback(readEx, entry);
		}).read(sync);
	}

	public dataOffset(entry: ZipEntry) {
		return entry.offset + consts.LOCHDR + entry.fnameLen + entry.extraLen;
	}

	public canVerifyCrc(entry: ZipEntry) {
		// if bit 3 (0x08) of the general-purpose flags field is set, then the CRC-32 and file sizes are not known when the header is written
		return (entry.flags & 0x8) !== 0x8;
	}

	public extractFile(entry: ZipEntry, outPath: string, callback: (err?: Error) => void) {
		this.stream(entry, (streamErr, stm) => {
			if (streamErr) {
				return callback(streamErr);
			}

			let fsStm: fs.WriteStream;
			let errThrown: Error;
			stm.on("error", (err: Error) => {
				errThrown = err;
				if (fsStm) {
					stm.unpipe(fsStm);
					fsStm.close();
					callback(err);
					// () => {
					// 	callback(err);
					// });
				}
			});
			fs.open(outPath, "w", (err, fdFile) => {
				if (StreamZip.debug) {
					console.log("open", outPath);
				}
				if (err) {
					return callback(err || errThrown);
				}
				if (errThrown) {
					fs.close(this.fd, () => {
						callback(errThrown);
					});
					return;
				}
				fsStm = fs.createWriteStream(outPath, { fd: fdFile });
				fsStm.on("finish",  () => {
					if (StreamZip.debug) {
						console.log("close", outPath);
					}
					this.emit("extract", entry, outPath);
					if (!errThrown) {
						callback();
					}
				});
				stm.pipe(fsStm);
			});

		});
	}

	public createDirectories(baseDir: string, dirs: string[][], callback: (err?: Error) => void) {
		if (!dirs.length) {
			return callback();
		}
		const dir = dirs.shift();
		const dirName = path.join(baseDir, path.join.apply(path, dir));
		fs.mkdir(dirName, (err) => {
			if (err && err.code !== "EEXIST") {
				return callback(err);
			}
			this.createDirectories(baseDir, dirs, callback);
		});
	}

	public extractFiles(baseDir: string, baseRelPath: string, files: ZipEntry[], callback: (err: Error, extractedCount: number) => void, extractedCount: number) {
		if (!files.length) {
			return callback(undefined, extractedCount);
		}
		const file = files.shift();
		const targetPath = path.join(baseDir, file.name.replace(baseRelPath, ""));
		this.extractFile(file, targetPath, (err) => {
			if (err) {
				return callback(err, extractedCount);
			}
			this.extractFiles(baseDir, baseRelPath, files, callback, extractedCount + 1);
		});
	}

	public extract(entryOrName: ZipEntry | string, outPath: string, callback: (err: Error, numberOfFiles?: number) => void) {
		let entryName: string = "";
		let entry: ZipEntry;
		if (typeof entryOrName === "string") {
			entry = this.entry(entryOrName);
			if (entry) {
				entryName = entry.name;
			} else {
				entryName = entryOrName as string;
				if (entryName.length && entryName[entryName.length - 1] !== "/") {
					entryName += "/";
				}
			}
		} else {
			entry = entryOrName as ZipEntry;
			if (entry && entry.name) {
				entryName = entry.name;
			}
		}
		if (!entry || entry.isDirectory) {
			const files: ZipEntry[] = [];
			const dirs: string[][] = [];
			const allDirs: { [relPath: string]: boolean } = {};
			for (const e in this._entries) {
				if (Object.prototype.hasOwnProperty.call(this._entries, e) && e.lastIndexOf(entryName, 0) === 0) {
					let relPath = e.replace(entryName, "");
					const childEntry = this._entries[e];
					if (childEntry.isFile) {
						files.push(childEntry);
						relPath = path.dirname(relPath);
					}
					if (relPath && !allDirs[relPath] && relPath !== ".") {
						allDirs[relPath] = true;
						let parts = relPath.split("/").filter((f) => f);
						if (parts.length) {
							dirs.push(parts);
						}
						while (parts.length > 1) {
							parts = parts.slice(0, parts.length - 1);
							const partsPath = parts.join("/");
							if (allDirs[partsPath] || partsPath === ".") {
								break;
							}
							allDirs[partsPath] = true;
							dirs.push(parts);
						}
					}
				}
			}
			dirs.sort((x, y) => x.length - y.length);
			if (dirs.length) {
				this.createDirectories(outPath, dirs, (err) => {
					if (err) {
						callback(err);
					} else {
						this.extractFiles(outPath, entryName, files, callback, 0);
					}
				});
			} else {
				this.extractFiles(outPath, entryName, files, callback, 0);
			}
		} else {
			fs.stat(outPath, (err, stat) => {
				if (stat && stat.isDirectory()) {
					this.extract(entry, path.join(outPath, path.basename(entry.name)), callback);
				} else {
					this.extractFile(entry, outPath, (extractErr) => {
						callback(extractErr, 1);
					});
				}
			});
		}
	}

	public close(callback: (err?: Error) => void) {
		if (this.fd) {
			fs.close(this.fd, (err) => {
				this.fd = null;
				if (callback) {
					callback(err);
				}
			});
		} else if (callback) {
			callback();
		}
	}
}
