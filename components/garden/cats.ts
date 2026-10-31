import * as THREE from "three";

/** Original, articulated toy-like cats. Forward is +Z; pivots keep the paws grounded. */
export function createCat(breed: "british" | "siamese") {
  const british = breed === "british";
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const material = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.88 });
  const fur = material(british ? "#939eaa" : "#e8d9bc");
  const dark = material(british ? "#7f8998" : "#66514b");
  const cream = material(british ? "#fff6e7" : "#dbc6a8");
  const pink = material("#d39493");
  const eye = material(british ? "#dfae4b" : "#6dbbcc");
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
  ball(body, fur, [0, 0.62, -0.08], british ? [0.34, 0.37, 0.51] : [0.26, 0.31, 0.54]);
  ball(body, cream, [0, 0.6, 0.28], [british ? 0.28 : 0.21, 0.32, 0.24]);
  const head = new THREE.Group();
  head.position.set(0, 0.95, 0.4);
  body.add(head);
  ball(head, british ? fur : dark, [0, 0, 0], british ? [0.37, 0.32, 0.3] : [0.29, 0.3, 0.29]);
  // Puffy white cheeks and a white blaze distinguish the British bicolour.
  if (british) ball(head, cream, [0, -0.09, 0.236], [0.16, 0.19, 0.09]);
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(side * (british ? 0.23 : 0.21), 0.235, -0.035);
    ear.rotation.z = -side * 0.25;
    head.add(ear);
    const earShape = new THREE.Shape();
    earShape.moveTo(-0.14, 0); earShape.quadraticCurveTo(-0.1, 0.18, 0, british ? 0.27 : 0.34);
    earShape.quadraticCurveTo(0.07, 0.31, 0.14, 0); earShape.closePath();
    const geometry = new THREE.ExtrudeGeometry(earShape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.025, bevelSegments: 2, steps: 1 });
    const mesh = new THREE.Mesh(geometry, dark); mesh.castShadow = true; ear.add(mesh);
    ball(ear, pink, [0, 0.1, 0.09], [0.065, british ? 0.09 : 0.12, 0.012]);
    ball(head, cream, [side * 0.09, -0.115, 0.262], [0.115, 0.085, 0.069]);
  }
  const eyes: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const orbit = new THREE.Group(); orbit.position.set(side * 0.15, 0.035, 0.263); head.add(orbit); eyes.push(orbit);
    ball(orbit, black, [0, 0, 0], [0.089, 0.098, 0.031]);
    ball(orbit, eye, [0, 0, 0.021], [0.072, 0.08, 0.018]);
    ball(orbit, black, [0, 0.003, 0.037], [0.026, 0.062, 0.012]);
    ball(orbit, shine, [-0.024, 0.033, 0.045], [0.021, 0.021, 0.008]);
    ball(orbit, shine, [0.025, -0.02, 0.047], [0.008, 0.008, 0.006]);
  }
  ball(head, pink, [0, -0.082, 0.342], [0.044, 0.029, 0.025]);
  function line(points: THREE.Vector3[], radius: number, mat: THREE.Material, parent: THREE.Object3D) {
    const curve = new THREE.CatmullRomCurve3(points);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, radius, 5, false), mat); parent.add(mesh); return mesh;
  }
  for (const side of [-1, 1]) {
    line([new THREE.Vector3(0, -0.1, 0.33), new THREE.Vector3(side * 0.035, -0.145, 0.331), new THREE.Vector3(side * 0.075, -0.13, 0.32)], 0.007, black, head);
    for (let i = 0; i < 3; i++) line([new THREE.Vector3(side * 0.11, -0.09, 0.31), new THREE.Vector3(side * 0.29, -0.07 + i * 0.045, 0.31), new THREE.Vector3(side * 0.43, -0.08 + i * 0.06, 0.28)], 0.0045, cream, head);
  }
  const legs: THREE.Group[] = [];
  for (const z of [-0.35, 0.26]) for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * (british ? 0.21 : 0.17), 0.51, z); body.add(leg); legs.push(leg);
    ball(leg, british ? fur : dark, [0, -0.17, 0], [0.105, 0.25, 0.11]);
    ball(leg, british ? cream : dark, [0, -0.385, 0.04], [0.12, 0.09, 0.16]);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.69, -0.49); body.add(tail);
  line([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.19, -0.3), new THREE.Vector3(0, 0.55, -0.35), new THREE.Vector3(0.13, 0.75, -0.23)], british ? 0.105 : 0.075, dark, tail);
  ball(tail, dark, [0.13, 0.75, -0.23], [british ? 0.105 : 0.075, 0.09, 0.085]);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.028, 8, 24), material(british ? "#b86c54" : "#789b8b"));
  collar.position.set(0, 0.78, 0.32); collar.rotation.x = Math.PI / 2.5; body.add(collar);
  ball(body, material("#d6aa57"), [0, 0.62, 0.46], [0.052, 0.06, 0.045]);
  return { root, animate(time: number, walking: boolean) {
    const gait = Math.sin(time * 8);
    body.position.y = walking ? Math.abs(gait) * 0.025 : Math.sin(time * 1.8) * 0.008;
    legs.forEach((leg, i) => { leg.rotation.x = walking ? Math.sin(time * 8 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.38 : 0; });
    tail.rotation.z = Math.sin(time * 2.2) * 0.22;
    head.rotation.y = walking ? Math.sin(time * 1.4) * 0.09 : Math.sin(time * 0.7) * 0.28;
    const blink = time % 5.7 > 5.5 ? 0.08 : 1;
    eyes.forEach(e => { e.scale.y = blink; });
  } };
}
