import stream from "stream";
import { CrcVerify } from "./CrcVerify";

export class EntryVerifyStream extends stream.Transform {
	public verify: CrcVerify;

	constructor(baseStm: stream.Stream, crc: number, size: number) {

		super();
		this.verify = new CrcVerify(crc, size);
		baseStm.on("error", (e) => {
			this.emit("error", e);
		});
	}

	public _transform(data: Buffer, encoding: any, callback: (err: Error, data: Buffer) => void) {
		let err;
		try {
			this.verify.data(data);
		} catch (e) {
			err = e;
		}
		callback(err, data);
	}

}
