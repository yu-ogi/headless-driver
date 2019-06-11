import * as getPort from "get-port";
import * as http from "http";
import * as path from "path";
import * as url from "url";
const handler = require("serve-handler"); // tslint:disable-line:no-var-requires

declare global {
	namespace NodeJS {
		interface Global {
			server: http.Server;
		}
		interface ProcessEnv {
			HOST: string;
			PORT: number;
			BASE_URL: string;
			CONTENT_URL_V1: string;
			CONTENT_URL_V2: string;
			GAME_JSON_URL_V1: string;
			GAME_JSON_URL_V2: string;
			ASSET_BASE_URL_V1: string;
			ASSET_BASE_URL_V2: string;
			CASCADE_CONTENT_URL_V2: string;
			CASCADE_GAME_JSON_URL_V2: string;
		}
	}
}

export const initialize = async () => {
	const port = await getPort();
	const host = "localhost";
	const baseUrl = `http://${host}:${port}`;

	const server = http.createServer((request, response) => {
		handler(request, response, {
			public: path.resolve(__dirname, "fixtures"),
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Credentials": "true"
			}
		});
	});
	server.listen(port, host);

	global.server = server;
	process.env.HOST = host;
	process.env.PORT = port;
	process.env.BASE_URL = baseUrl;
	process.env.CONTENT_URL_V1 = url.resolve(baseUrl, "content-v1/content.json");
	process.env.CONTENT_URL_V2 = url.resolve(baseUrl, "content-v2/content.json");
	process.env.GAME_JSON_URL_V1 = url.resolve(baseUrl, "content-v1/game.json");
	process.env.GAME_JSON_URL_V2 = url.resolve(baseUrl, "content-v2/game.json");
	process.env.ASSET_BASE_URL_V1 = url.resolve(baseUrl, "content-v1/");
	process.env.ASSET_BASE_URL_V2 = url.resolve(baseUrl, "content-v2/");
	process.env.CASCADE_CONTENT_URL_V2 = url.resolve(baseUrl, "content-v2/content.cascade.json");
	process.env.CASCADE_GAME_JSON_URL_V2 = url.resolve(baseUrl, "content-v2/game.definitions.json");
};

module.exports = initialize;