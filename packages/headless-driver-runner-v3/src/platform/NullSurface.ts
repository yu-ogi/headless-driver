import { akashicEngine as g } from "@akashic/engine-files";
import { NullRenderer } from "./NullRenderer";

export class NullSurface implements g.SurfaceLike {
	width: number;
	height: number;
	isDynamic: boolean;
	animatingStarted: g.Trigger<void>;
	animatingStopped: g.Trigger<void>;
	_drawable: any;
	_renderer: NullRenderer;
	_destroyed: boolean;

	constructor(width: number, height: number, drawable?: any, isDynamic?: boolean) {
		this.width = width;
		this.height = height;
		this._drawable = drawable;
		this.isDynamic = isDynamic;
		this._renderer = new NullRenderer();
	}

	renderer(): g.RendererLike {
		return this._renderer;
	}

	isPlaying(): boolean {
		return false;
	}

	destroy(): void {
		this._destroyed = true;
	}

	destroyed(): boolean {
		return !!this._destroyed;
	}
}