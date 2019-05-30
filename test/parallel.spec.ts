import { expect } from "chai";
import fs from "fs";
import "mocha";
import { makeid, rmdirRecursive } from "./util";

// import { O_TRUNC } from "constants";
import path from "path";
// import stream from "stream";
import { StreamZip } from "../src/StreamZip";
import { ZipEntry } from "../src/ZipEntry";

// let testPathTmp;
// let testNum = 0;
const basePathTmp = "test/.tmp/";
const contentPath = "test/content/";

describe("test/err", () => {
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
		console.log("parallel", testPathTmp);
	});

	after(async () => {
		await rmdirRecursive(testPathTmp);
	});

	describe("streaming 100 files", () => {
		it("is ok", (done) => {
			const num = 100;
			const zip = new StreamZip({ file: "test/ok/normal.zip" });
			zip.on("ready", () => {
				let extracted = 0;
				const files = ["doc/changelog-foot.html", "doc/sh_javascript.min.js", "BSDmakefile", "README.md"];
				for (let i = 0; i < num; i++) {
					const file = files[Math.floor(Math.random() * files.length)];
					zip.extract(file, testPathTmp + i, (err) => {
						expect(err).to.eq(undefined);
						if (++extracted === num) {
							done();
						}
					});
				}
			});
		});
	});

});
