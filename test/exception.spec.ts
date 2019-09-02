import { expect } from "chai";
import fs from "fs";
import "mocha";
import { StreamZip } from "../src/index";
import { makeid, rmdirRecursive } from "./util";

import stream = require("stream");

const basePathTmp = "test/.tmp/";

describe("exception", () => {
	let testPathTmp: string = null;

	before(async () => {
		testPathTmp = basePathTmp + makeid(8) + "/";
		if (!fs.existsSync(basePathTmp)) {
			fs.mkdirSync(basePathTmp);
		}
		if (fs.existsSync(testPathTmp)) {
			await rmdirRecursive(testPathTmp);
		}
		fs.mkdirSync(testPathTmp);
	});

	after(async () => {
		await rmdirRecursive(testPathTmp);
	});

	it("callback exception", (done) => {
		const zip = new StreamZip({ file: "test/special/tiny.zip" });
		let streamError = false;
		let streamFinished = false;
		let callbackCallCount = 0;
		zip.once("entry", (entry) => {
			zip.stream(entry, (err, zipStream) => {
				callbackCallCount++;
				const uncaughtExceptions = process.listeners("uncaughtException");
				process.removeAllListeners("uncaughtException");
				process.once("uncaughtException", (ex) => {
					expect(ex.message).to.eq("descriptive message!");
					expect(callbackCallCount).to.eq(1);
					expect(!streamError && !streamFinished).to.eq(true);

					process.removeAllListeners("uncaughtException");
					for (const lst of uncaughtExceptions) {
						process.on("uncaughtException", lst);
					}

					done();
				});
				zipStream.on("data", () => {
					throw new Error("descriptive message!");
				});
				zipStream.on("error", () => {
					streamError = true;
				});
				zipStream.on("finish", () => {
					streamFinished = true;
				});
				const downstream = new stream.PassThrough();
				zipStream.pipe(downstream);
			});
		});
	});
});
