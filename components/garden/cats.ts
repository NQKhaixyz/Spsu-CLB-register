import * as THREE from "three";

/** Articulated breeds, facing +Z: a cobby blue-white British and a lean seal-point Siamese. */
export function createCat(breed: "british" | "siamese") {
  const british = breed === "british";
  const root = new THREE.Group();
  root.name = british ? "British Shorthair blue-white bicolor" : "Seal-point Siamese";
  const body = new THREE.Group();
  root.add(body);
  const material = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.88 });
  const fur = material(british ? "#929aa5" : "#efe1c5");
  const dark = material(british ? "#929aa5" : "#4c3932");
  const cream = material(british ? "#fffdf7" : "#6a4c3f");
  const pink = material("#d39493");
  const eye = material(british ? "#d99c38" : "#57b8e1");
  const black = material("#2c343e");
  const shine = material("#ffffff");
  const sphere = new THREE.SphereGeometry(1, 20, 14);
  function ball(parent: THREE.Object3D, mat: THREE.Material, xyz: number[], scale: number[]) {
    const mesh = new THREE.Mesh(sphere, mat);
    mesh.position.set(xyz[0], xyz[1], xyz[2]);
    mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  ball(body, fur, [0, british ? 0.62 : 0.69, -0.08], british ? [0.42, 0.39, 0.52] : [0.245, 0.3, 0.57]);
  ball(body, british ? cream : fur, [0, british ? 0.6 : 0.73, 0.28], [british ? 0.34 : 0.2, 0.33, 0.27]);
  if (british) ball(body, cream, [0, 0.43, 0.02], [0.35, 0.25, 0.47]);
  const head = new THREE.Group();
  head.position.set(0, british ? 1.01 : 1.1, 0.4);
  body.add(head);
  if (british) {
    // White inverted-V blaze painted onto the round head, with grey crown and ears.
    const geometry = new THREE.SphereGeometry(1, 48, 36);
    const vertices = geometry.getAttribute("position");
    const colors = new Float32Array(vertices.count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
      const width = (0.57 - y) * 0.61;
      const blend = (1 - THREE.MathUtils.smoothstep(Math.abs(x) - width, -0.035, 0.035)) * THREE.MathUtils.smoothstep(z, 0.08, 0.26);
      color.copy(fur.color).lerp(cream.color, blend).toArray(colors, i * 3);
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const face = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94 }));
    face.scale.set(0.43, 0.36, 0.34); face.castShadow = true; face.receiveShadow = true; head.add(face);
  } else {
    ball(head, fur, [0, 0, 0], [0.29, 0.3, 0.29]);
    ball(head, dark, [0, -0.015, 0.195], [0.255, 0.255, 0.16]);
  }
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(side * (british ? 0.28 : 0.21), british ? 0.265 : 0.23, -0.055);
    ear.rotation.z = -side * (british ? 0.16 : 0.27);
    head.add(ear);
    const earShape = new THREE.Shape();
    earShape.moveTo(-0.13, 0);
    earShape.quadraticCurveTo(-0.1, british ? 0.15 : 0.23, -0.025, british ? 0.19 : 0.31);
    earShape.quadraticCurveTo(0.015, british ? 0.225 : 0.355, 0.045, british ? 0.17 : 0.29);
    earShape.quadraticCurveTo(0.11, 0.1, 0.13, 0); earShape.closePath();
    const geometry = new THREE.ExtrudeGeometry(earShape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.025, bevelSegments: 2, steps: 1 });
    const mesh = new THREE.Mesh(geometry, dark); mesh.castShadow = true; ear.add(mesh);
    ball(ear, pink, [0, british ? 0.065 : 0.1, 0.09], [0.061, british ? 0.067 : 0.12, 0.012]);
    ball(head, cream, [side * (british ? 0.15 : 0.085), -0.15, british ? 0.257 : 0.31], british ? [0.17, 0.125, 0.105] : [0.092, 0.071, 0.057]);
  }
  const eyes: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const orbit = new THREE.Group(); orbit.position.set(side * (british ? 0.18 : 0.14), 0.035, british ? 0.303 : 0.329); head.add(orbit); eyes.push(orbit);
    if (!british) { orbit.rotation.z = side * 0.13; orbit.scale.y = 0.8; }
    ball(orbit, black, [0, 0, 0], [0.089, 0.098, 0.031]);
    ball(orbit, eye, [0, 0, 0.021], [0.072, 0.08, 0.018]);
    ball(orbit, black, [0, 0.003, 0.037], [0.026, 0.062, 0.012]);
    ball(orbit, shine, [-0.024, 0.033, 0.045], [0.021, 0.021, 0.008]);
    ball(orbit, shine, [0.025, -0.02, 0.047], [0.008, 0.008, 0.006]);
  }
  ball(head, british ? pink : dark, [0, -0.088, 0.371], [0.039, 0.025, 0.019]);
  function line(points: THREE.Vector3[], radius: number, mat: THREE.Material, parent: THREE.Object3D) {
    const curve = new THREE.CatmullRomCurve3(points);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, radius, 5, false), mat); parent.add(mesh); return mesh;
  }
  for (const side of [-1, 1]) {
    line([new THREE.Vector3(0, -0.105, 0.371), new THREE.Vector3(side * 0.03, -0.144, 0.371), new THREE.Vector3(side * 0.066, -0.132, 0.36)], 0.006, black, head);
    for (let i = 0; i < 3; i++) line([new THREE.Vector3(side * 0.11, -0.12, 0.34), new THREE.Vector3(side * 0.3, -0.08 + i * 0.04, 0.34), new THREE.Vector3(side * (british ? 0.49 : 0.4), -0.11 + i * 0.055, 0.3)], 0.004, shine, head);
  }
  const legs: THREE.Group[] = [];
  for (const z of [-0.35, 0.26]) for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * (british ? 0.235 : 0.16), 0.51, z); body.add(leg); legs.push(leg);
    ball(leg, british ? cream : fur, [0, british ? -0.15 : -0.08, 0], british ? [0.125, 0.25, 0.125] : [0.078, 0.3, 0.085]);
    if (!british) ball(leg, dark, [0, -0.3, 0.012], [0.084, 0.12, 0.09]);
    ball(leg, british ? cream : dark, [0, -0.395, 0.04], british ? [0.14, 0.1, 0.16] : [0.1, 0.095, 0.135]);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.69, -0.49); body.add(tail);
  const tailPoints = british ? [[0, 0, 0], [0, 0.06, -0.25], [0.12, 0.28, -0.48], [0.24, 0.4, -0.48]] : [[0, 0, 0], [0, 0.2, -0.32], [0.02, 0.65, -0.45], [0.16, 0.84, -0.3]];
  line(tailPoints.map(([x, y, z]) => new THREE.Vector3(x, y, z)), british ? 0.11 : 0.061, dark, tail);
  ball(tail, dark, tailPoints[3], british ? [0.11, 0.11, 0.11] : [0.061, 0.07, 0.061]);
  return { root, animate(time: number, walking: boolean) {
    const gait = Math.sin(time * 8);
    body.position.y = walking ? Math.abs(gait) * 0.025 : Math.sin(time * 1.8) * 0.008;
    legs.forEach((leg, i) => { leg.rotation.x = walking ? Math.sin(time * 8 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.38 : 0; });
    tail.rotation.z = Math.sin(time * 2.2) * 0.22;
    head.rotation.y = walking ? Math.sin(time * 1.4) * 0.09 : Math.sin(time * 0.7) * 0.28;
    const blink = time % 5.7 > 5.5 ? 0.08 : 1;
    eyes.forEach(e => { e.scale.y = blink * (british ? 1 : 0.8); });
  } };
}
