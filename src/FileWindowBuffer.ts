import { consts } from "./consts";
import { FsRead } from "./FsRead";

export class FileWindowBuffer {
	public position: number;
	public buffer: Buffer;
	public fsOp: FsRead;

	constructor(public fd: number) {
		this.position = 0;
		this.buffer = Buffer.alloc(0);

		this.fsOp = null;
	}

	public checkOp() {
		if (this.fsOp && this.fsOp.waiting) {
			throw new Error("Operation in progress");
		}
	}

	public read(pos: number, length: number, callback: (err: Error, bytesRead: number) => void) {
		this.checkOp();
		if (this.buffer.length < length) {
			this.buffer = Buffer.alloc(length);
		}
		this.position = pos;
		this.fsOp = new FsRead(this.fd, this.buffer, 0, length, this.position, callback);
		this.fsOp.read();
	}

	public expandLeft(length: number, callback: (err: Error, bytesRead: number) => void ) {
		this.checkOp();
		this.buffer = Buffer.concat([Buffer.alloc(length), this.buffer]);
		this.position -= length;
		if (this.position < 0) {
			this.position = 0;
		}
		this.fsOp = new FsRead(this.fd, this.buffer, 0, length, this.position, callback);
		this.fsOp.read();
	}

	public expandRight(length: number,  callback: (err: Error, bytesRead: number) => void) {
		this.checkOp();
		const offset = this.buffer.length;
		this.buffer = Buffer.concat([this.buffer, Buffer.alloc(length)]);
		this.fsOp = new FsRead(this.fd, this.buffer, offset, length, this.position + offset, callback);
		this.fsOp.read();
	}

	public moveRight(length: number, callback: (err: Error, bytesRead: number) => void, shift: number) {
		this.checkOp();
		if (shift) {
			this.buffer.copy(this.buffer, 0, shift);
		} else {
			shift = 0;
		}
		this.position += shift;
		this.fsOp = new FsRead(this.fd, this.buffer, this.buffer.length - shift, shift, this.position + this.buffer.length - shift, callback);
		this.fsOp.read();
	}
}
