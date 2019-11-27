import { LoadFileOption, RunnerExecutionMode, RunnerPlayer } from "@akashic/headless-driver-runner";
import { RunnerV1, RunnerV1Game } from "@akashic/headless-driver-runner-v1";
import { RunnerV2, RunnerV2Game } from "@akashic/headless-driver-runner-v2";
import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import { NodeVM, VMScript } from "vm2";
import * as ExecVmScriptV1 from "../ExecuteVmScriptV1";
import * as ExecVmScriptV2 from "../ExecuteVmScriptV2";
import { getSystemLogger } from "../Logger";
import { AMFlowClient } from "../play/amflow/AMFlowClient";
import { PlayManager } from "../play/PlayManager";
import { loadFile, validateUrl } from "../utils";

export interface CreateRunnerParameters {
	playId: string;
	amflow: AMFlowClient;
	playToken: string;
	executionMode: RunnerExecutionMode;
	gameArgs?: any;
	player?: RunnerPlayer;
	allowedPaths?: any[]; // アクセスを許可する path の配列。Regex か string を対象とする。
}

interface EngineConfiguration {
	content_url: string;
	asset_base_url: string;
	engine_urls: string[];
	external: string[];
}

interface GameConfiguration {
	definitions?: string[];
	environment?: {
		"sandbox-runtime"?: "1" | "2";
		external: { [key: string]: string };
	};
}

/**
 * Runner を管理するマネージャ。
 */
export class RunnerManager {
	private runners: (RunnerV1 | RunnerV2)[] = [];
	private nextRunnerId: number = 0;
	private playManager: PlayManager;
	private nvm: NodeVM;

	constructor(playManager: PlayManager) {
		this.playManager = playManager;
	}

	/**
	 * Runner を作成する。
	 * Runner は Node.js の Virtual Machine 上で実行される。
	 * 主な制限事項として process へのアクセスが制限される。
	 * @param params パラメータ
	 */
	async createRunner(params: CreateRunnerParameters): Promise<string> {
		let runner: RunnerV1 | RunnerV2;

		const play = this.playManager.getPlay(params.playId);
		if (play == null) {
			throw new Error("Play is not found");
		}

		try {
			let engineConfiguration: EngineConfiguration;
			let gameConfiguration: GameConfiguration;
			let contentUrl: string;
			let external: { [name: string]: string } = {};

			if ("contentUrl" in play) {
				contentUrl = play.contentUrl;
				engineConfiguration = await this.resolveContent(contentUrl);
				gameConfiguration = await this.resolveGameConfiguration(engineConfiguration.content_url);
				for (let i = 0; i < engineConfiguration.external.length; i++) {
					const name = engineConfiguration.external[i];
					external[name] = "0"; // NOTE: "0" 扱いとする
				}
			} else {
				contentUrl = play.gameJsonPath;
				gameConfiguration = await this.resolveGameConfiguration(contentUrl);
				let ext: string[] = [];
				if (gameConfiguration.environment != null && gameConfiguration.environment.external != null) {
					external = gameConfiguration.environment.external;
					ext = Object.keys(gameConfiguration.environment.external);
				}
				engineConfiguration = {
					external: ext,
					content_url: contentUrl,
					asset_base_url: path.dirname(play.gameJsonPath),
					engine_urls: []
				};
			}
			const amflow = params.amflow;

			let configurationBaseUrl: string | null = null;
			let version: "1" | "2" = "1";

			// NOTE: `sandbox-runtime` の値を解決する。
			// TODO: akashic-runtime の値を参照するようにする。
			if (gameConfiguration.definitions) {
				const defs: GameConfiguration[] = [];
				for (let i = 0; i < gameConfiguration.definitions.length; i++) {
					const _url = url.resolve(engineConfiguration.asset_base_url, gameConfiguration.definitions[i]);
					const _def = await this.loadJSON(_url);
					defs.push(_def);
				}
				version = defs.reduce((acc, def) => (def.environment && def.environment["sandbox-runtime"]) || acc, version);
				configurationBaseUrl = url.resolve(engineConfiguration.content_url, "./");
			} else if (gameConfiguration.environment && gameConfiguration.environment["sandbox-runtime"] === "2") {
				version = "2";
			}

			let allowedPaths = [engineConfiguration.asset_base_url];
			if (params.allowedPaths) {
				allowedPaths = allowedPaths.concat(params.allowedPaths);
			}

			this.nvm = new NodeVM({
				sandbox: {
					trustedFunctions: {
						loadFile: (targetUrl: string, opt?: LoadFileOption) => {
							validateUrl(targetUrl, allowedPaths);
							return loadFile(targetUrl, opt);
						}
					}
				},
				require: {
					context: "sandbox",
					external: true,
					builtin: [] // 何も設定しない。require() が必要な場合は sandboxの外側で実行される trustedFunctions で定義する。
				}
			});

			const runnerId = `${this.nextRunnerId++}`;
			const filePath = version === "2" ? ExecVmScriptV2.getFilePath() : ExecVmScriptV1.getFilePath();
			const str = fs.readFileSync(filePath, { encoding: "utf8" });
			const script = new VMScript(str);
			const functionInSandbox = this.nvm.run(script, filePath);

			if (version === "2") {
				getSystemLogger().info("v2 content");
				runner = (functionInSandbox as typeof ExecVmScriptV2).createRunnerV2({
					contentUrl,
					assetBaseUrl: engineConfiguration.asset_base_url,
					configurationUrl: engineConfiguration.content_url,
					configurationBaseUrl,
					runnerId,
					playId: play.playId,
					playToken: params.playToken,
					amflow,
					executionMode: params.executionMode,
					external,
					gameArgs: params.gameArgs,
					player: params.player
				});
				runner.errorTrigger.addOnce((err: any) => {
					getSystemLogger().error(err);
					this.stopRunner(runnerId);
				});
			} else {
				getSystemLogger().info("v1 content");
				runner = (functionInSandbox as typeof ExecVmScriptV1).createRunnerV1({
					contentUrl,
					assetBaseUrl: engineConfiguration.asset_base_url,
					configurationUrl: engineConfiguration.content_url,
					configurationBaseUrl,
					runnerId,
					playId: play.playId,
					playToken: params.playToken,
					amflow,
					executionMode: params.executionMode,
					external,
					gameArgs: params.gameArgs,
					player: params.player
				});
				runner.errorTrigger.handle((err: any) => {
					getSystemLogger().error(err);
					this.stopRunner(runnerId);
					return true;
				});
			}

			this.runners.push(runner);
		} catch (e) {
			throw e;
		}

		return runner.runnerId;
	}

	/**
	 * Runner を開始する。
	 * @param runnerId RunnerID
	 */
	async startRunner(runnerId: string): Promise<RunnerV1Game | RunnerV2Game | null> {
		const runner = this.getRunner(runnerId);

		if (!runner) {
			throw new Error("Runner is not found");
		}

		return await runner.start();
	}

	/**
	 * Runner を停止する。
	 * @param runnerId RunnerID
	 */
	async stopRunner(runnerId: string): Promise<void> {
		const runner = this.getRunner(runnerId);

		if (!runner) {
			throw new Error("Runner is not found");
		}

		await runner.stop();
		this.runners = this.runners.filter(r => r !== runner);
	}

	/**
	 * Runner の情報を取得する。
	 * @param runnerId RunnerID
	 */
	getRunner(runnerId: string): (RunnerV1 | RunnerV2) | null {
		return this.runners.find(runner => runner.runnerId === runnerId) || null;
	}

	/**
	 * 現在作成されている Runner の情報の一覧を取得する。
	 */
	getRunners(): (RunnerV1 | RunnerV2)[] {
		return this.runners;
	}

	protected async resolveContent(contentUrl: string): Promise<EngineConfiguration> {
		return await this.loadJSON<EngineConfiguration>(contentUrl);
	}

	protected async resolveGameConfiguration(gameJsonUrl: string): Promise<GameConfiguration> {
		return await this.loadJSON<GameConfiguration>(gameJsonUrl);
	}

	protected async loadJSON<T>(contentUrl: string): Promise<T> {
		return await loadFile<T>(contentUrl, { json: true });
	}
}
