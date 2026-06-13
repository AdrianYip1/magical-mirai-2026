import * as THREE from 'three';
import type { WheelItem } from './sphereSelect';
import { cylDims, menuState } from './renderer';

export const menuReflectScene = new THREE.Scene();
const proxyGroup = new THREE.Group();
menuReflectScene.add(proxyGroup);

const MIKU_TEAL = 0x22dbcc;

export function initMenuReflect(items: WheelItem[]) {
  for (const child of [...proxyGroup.children]) {
    proxyGroup.remove(child);
    const m = child as THREE.Mesh;
    m.geometry.dispose();
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.dispose();
  }

  const n = items.length;
  const { r } = cylDims;
  const w = 2 * r * Math.sin(Math.PI / n);
  const h = cylDims.h;
  const R = r * Math.cos(Math.PI / n);
  const loader = new THREE.TextureLoader();

  proxyGroup.position.y = h;

  items.forEach((item, i) => {
    const a = (i / n) * 2 * Math.PI;

    let mat: THREE.MeshBasicMaterial;
    if (item.kind === 'song') {
      const src = item.data.thumbnail || import.meta.env.BASE_URL + 'assets/placeholder_miku.png';
      mat = new THREE.MeshBasicMaterial({ color: 0x1b3a44, toneMapped: false });
      loader.load(src, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        mat.map = tex;
        mat.color.setRGB(1, 1, 1);
        mat.needsUpdate = true;
      });
    } else {
      mat = new THREE.MeshBasicMaterial({ color: MIKU_TEAL, toneMapped: false });
    }

    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    plane.position.set(R * Math.sin(a), 0, R * Math.cos(a));
    plane.rotation.y = a;
    proxyGroup.add(plane);
  });
}

export function updateMenuReflect() {
  proxyGroup.rotation.y = menuState.cylAngle;
}
