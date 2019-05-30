import fs from "fs";
import stream from "stream";
import { consts } from "./consts";

export class EntryDataReaderStream extends stream.Readable {
	public fd: number;
	public offset: number;
	public length: number ;
	public pos: number;
	constructor(fd: number, offset: number, length: number) {
		super();
		this.fd = fd;
		this.offset = offset;
		this.length = length;
		this.pos = 0;
	}

	public _read(n: number) {
		const buffer = Buffer.alloc(Math.min(n, this.length - this.pos));
		if (buffer.length) {
			fs.read(this.fd, buffer, 0, buffer.length, this.offset + this.pos,
				(err, bytesRead, bufferForCallback) => {
					this.readCallback(err, bytesRead, bufferForCallback);
				} );
		} else {
			this.push(null);
		}
	}

	public readCallback(err: Error, bytesRead: number, buffer: Buffer) {
		this.pos += bytesRead;
		if (err) {
			this.emit("error", err);
			this.push(null);
		} else if (!bytesRead) {
			this.push(null);
		} else {
			if (bytesRead !== buffer.length) {
				buffer = buffer.slice(0, bytesRead);
			}
			this.push(buffer);
		}
	}

}
