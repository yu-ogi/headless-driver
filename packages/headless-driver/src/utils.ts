import * as fs from "fs";
import { LoadFileOption } from "@akashic/headless-driver-runner";
import fetch from "node-fetch";

/**
 * テキストファイルの読み込みを行う。
 *
 * @param url url または path
 */
export async function loadFile(url: string): Promise<string>;

/**
 * ファイルの読み込みを行う。
 *
 * @param url url または path
 * @param opt オプション
 */
export async function loadFile<T>(url: string, opt: LoadFileOption): Promise<T>;

export async function loadFile<T>(url: string, opt: LoadFileOption = {}): Promise<T> {
	if (isHttpProtocol(url)) {
		const res = await fetch(url, { method: "GET" });
		return opt.json ? res.json() : res.text();
	} else {
		const str = fs.readFileSync(url, { encoding: opt.encoding ? opt.encoding : "utf8" });
		return opt.json ? JSON.parse(str) : str;
	}
}

/**
 * ファイルが存在するかを確認する。
 * @param path ファイルパス
 * @returns ファイルが存在すれば `true`、 そうでなければ `false`。
 */
export function existsSync(path: string): boolean {
	return fs.existsSync(path);
}

export function isHttpProtocol(url: string): boolean {
	return /^(http|https)\:\/\//.test(url);
}
