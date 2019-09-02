import { expect } from "chai";
import fs from "fs";
import "mocha";
import { StreamZip } from "../src/index";
import { makeid, rmdirRecursive } from "./util";

const basePathTmp = "test/.tmp/";

describe("parallel", () => {
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

	it("streaming 100 files", (done) => {
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
