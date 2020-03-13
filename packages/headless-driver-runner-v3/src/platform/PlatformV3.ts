import { akashicEngine as g, pdi } from "@akashic/engine-files";
import { Looper, Platform, PlatformParameters } from "@akashic/headless-driver-runner";

import { NullSurface } from "./NullSurface";
import { ResourceFactory } from "./ResourceFactory";

export class PlatformV3 extends Platform implements pdi.Platform {
	private resFac: g.ResourceFactoryLike;
	private rendererReq: pdi.RendererRequirement | null;
	private primarySurface: g.SurfaceLike | null;

	constructor(param: PlatformParameters) {
		super(param);
		this.resFac = new ResourceFactory((e: Error) => this.errorHandler(e));
		this.rendererReq = null;
		this.primarySurface = null;
	}

	getResourceFactory(): g.ResourceFactoryLike {
		return this.resFac;
	}

	setRendererRequirement(requirement: pdi.RendererRequirement): void {
		this.rendererReq = requirement;
		this.primarySurface = new NullSurface(this.rendererReq.primarySurfaceWidth, this.rendererReq.primarySurfaceHeight, null);
	}

	setPlatformEventHandler(handler: pdi.PlatformEventHandler): void {
		// do nothing
	}

	getPrimarySurface(): g.SurfaceLike {
		return this.primarySurface;
	}

	createLooper(fun: (deltaTime: number) => number): Looper {
		return new Looper(fun, (e: Error) => this.errorHandler(e));
	}
}