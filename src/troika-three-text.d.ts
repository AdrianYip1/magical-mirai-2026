declare module 'troika-three-text' {
  import * as THREE from 'three';

  export class Text extends THREE.Object3D {
    text: string;
    font: string;
    fontSize: number;
    color: number | string;
    anchorX: 'left' | 'center' | 'right' | number;
    anchorY: 'top' | 'middle' | 'bottom' | number;
    textAlign: 'left' | 'center' | 'right';
    letterSpacing: number;
    lineHeight: number;
    maxWidth: number;
    outlineWidth: number | string;
    outlineColor: number | string;
    sync(callback?: () => void): void;
    dispose(): void;
  }
}
