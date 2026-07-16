declare module "n8ao" {
  import type { Camera, Scene } from "three";

  export class N8AOPostPass {
    constructor(
      scene: Scene,
      camera: Camera,
      width?: number,
      height?: number,
    );
    configuration: {
      aoRadius: number;
      distanceFalloff: number;
      intensity: number;
      color: unknown;
      gammaCorrection: boolean;
      halfRes: boolean;
      screenSpaceRadius: boolean;
      autoRenderBeauty: boolean;
    };
    enabled: boolean;
    setQualityMode(mode: string): void;
    setSize(width: number, height: number): void;
  }

  export class N8AOPass {
    constructor(
      scene: Scene,
      camera: Camera,
      width?: number,
      height?: number,
    );
    configuration: N8AOPostPass["configuration"];
    enabled: boolean;
    setQualityMode(mode: string): void;
    setSize(width: number, height: number): void;
  }
}
