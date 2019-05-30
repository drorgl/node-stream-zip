import fs from "fs";
import { consts } from "./consts";
import { StreamZip } from "./StreamZip";
// region FsRead

export class FsRead {
	public fd: number;
	public buffer: Buffer;
	public offset: number;
	public length: number;
	public position: number;
	public callback: (err: Error, bytesRead: number) => void;
	public bytesRead: number;
	public waiting: boolean;

	constructor(fd: number, buffer: Buffer, offset: number, length: number, position: number, callback: (err: Error, bytesRead: number) => void) {
		this.fd = fd;
		this.buffer = buffer;
		this.offset = offset;
		this.length = length;
		this.position = position;
		this.callback = callback;
		this.bytesRead = 0;
		this.waiting = false;
	}

	public read(sync?: boolean) {
		if (StreamZip.debug) {
			console.log("read", this.position, this.bytesRead, this.length, this.offset);
		}
		this.waiting = true;
		let err;
		if (sync) {
			let bytesRead: number;
			try {
				bytesRead = fs.readSync(this.fd, this.buffer, this.offset + this.bytesRead,
					this.length - this.bytesRead, this.position + this.bytesRead);
			} catch (e) {
				err = e;
			}
			this.readCallback(sync, err, err ? bytesRead : null);
		} else {
			fs.read(this.fd, this.buffer, this.offset + this.bytesRead,
				this.length - this.bytesRead, this.position + this.bytesRead,
				(readErr, bytesRead) => {
					this.readCallback(sync, readErr, bytesRead);
				});

		}
	}

	public readCallback(sync: boolean, err: Error, bytesRead: number) {
		if (typeof bytesRead === "number") {
			this.bytesRead += bytesRead;
		}
		if (err || !bytesRead || this.bytesRead === this.length) {
			this.waiting = false;
			return this.callback(err, this.bytesRead);
		} else {
			this.read(sync);
		}
	}

}

// endregion
