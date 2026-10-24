// 3D talking avatar: loads a Ready Player Me–style GLB (ARKit + Oculus viseme
// blend shapes), idles, blinks, shows moods, and lip-syncs to speech.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { LipsyncEn } from "./vendor/lipsync-en.mjs";

const lipsync = new LipsyncEn();
const UNIT_MS = 62;        // length of one lip-sync "unit" at speech rate 1
const VISEME_WEIGHT = 0.85;

// Resting facial expression for each mood (blend shape -> amount).
const MOODS = {
  idle:      { mouthSmile: 0.2, browInnerUp: 0.05 },
  thinking:  { mouthSmile: 0.05, browInnerUp: 0.35, eyesLookUp: 0.35, mouthPressLeft: 0.2, mouthPressRight: 0.2 },
  speaking:  { mouthSmile: 0.12, browInnerUp: 0.12 },
  listening: { mouthSmile: 0.25, eyeWideLeft: 0.18, eyeWideRight: 0.18, browOuterUpLeft: 0.2, browOuterUpRight: 0.2 },
};
// Head pose offsets (radians) for each mood: [pitch, yaw, roll].
const POSES = {
  idle: [0, 0, 0],
  thinking: [-0.06, 0.08, 0.04],
  speaking: [0, 0, 0],
  listening: [0.03, 0, 0.07],
};

export class Avatar {
  constructor(el, url) {
    this.el = el;
    this.mood = "idle";
    this.values = {};       // current blend shape values
    this.queue = [];        // scheduled visemes: { v, t0, t1, est }
    this.utt = null;
    this.nextBlink = performance.now() + 1500;
    this.blinkUntil = 0;
    this.pose = [0, 0, 0];

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    el.append(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(22, 1, 0.1, 50);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.0));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(1.2, 2, 2.5);
    const fill = new THREE.DirectionalLight(0xffeedd, 0.9);
    fill.position.set(-2, 1, 1.5);
    this.scene.add(key, fill);

    this.clock = new THREE.Clock();
    this.ready = new GLTFLoader().loadAsync(url).then((gltf) => this.#setup(gltf.scene));
    new ResizeObserver(() => this.#resize()).observe(el);
    this.#resize();
    r.setAnimationLoop(() => this.#frame());
  }

  setMood(mood) {
    if (MOODS[mood]) this.mood = mood;
  }

  // Called when an utterance starts. Until the browser reports word timings,
  // lip-sync follows an estimate of the whole sentence.
  startUtterance(text, rate = 1) {
    this.utt = { text, rate, gotBoundary: false };
    this.queue = [];
    let t = performance.now();
    for (const m of text.matchAll(/[A-Za-z0-9']+|[,;:]|[.!?]/g)) {
      const tok = m[0];
      if (tok === "," || tok === ";" || tok === ":") { t += 220 / rate; continue; }
      if (/[.!?]/.test(tok)) { t += 380 / rate; continue; }
      t = this.#scheduleWord(tok, t, rate, true) + UNIT_MS / rate;
    }
  }

  // Called on each speechSynthesis word boundary for exact timing.
  word(charIndex, charLength) {
    if (!this.utt) return;
    const now = performance.now();
    if (!this.utt.gotBoundary) {
      this.utt.gotBoundary = true;
      this.queue = this.queue.filter((q) => !q.est);
    }
    // cut off whatever was planned for the previous word
    this.queue = this.queue.filter((q) => q.t0 < now);
    for (const q of this.queue) q.t1 = Math.min(q.t1, now + 40);
    const rest = this.utt.text.slice(charIndex);
    const w = charLength ? rest.slice(0, charLength) : (rest.match(/^[A-Za-z0-9']+/) || [""])[0];
    if (w) this.#scheduleWord(w, now, this.utt.rate, false);
  }

  endUtterance() {
    this.utt = null;
    this.queue = [];
  }

  #scheduleWord(word, start, rate, est) {
    const text = lipsync.preProcessText(word);
    const o = lipsync.wordsToVisemes(text);
    const unit = UNIT_MS / rate;
    let end = start;
    for (let i = 0; i < o.visemes.length; i++) {
      const t0 = start + o.times[i] * unit;
      const t1 = t0 + o.durations[i] * unit;
      this.queue.push({ v: o.visemes[i], t0, t1, est });
      end = Math.max(end, t1);
    }
    return end;
  }

  #setup(model) {
    this.scene.add(model);
    this.meshes = [];
    model.traverse((o) => {
      if (o.isMesh) o.frustumCulled = false;
      if (o.isMesh && o.morphTargetDictionary) this.meshes.push(o);
    });
    this.head = model.getObjectByName("Head");
    this.neck = model.getObjectByName("Neck");
    this.spine = model.getObjectByName("Spine2");
    this.base = {
      head: this.head.rotation.clone(),
      neck: this.neck?.rotation.clone(),
      spine: this.spine?.rotation.clone(),
    };

    model.updateMatrixWorld(true);
    const p = new THREE.Vector3();
    this.head.getWorldPosition(p);
    this.target = new THREE.Vector3(p.x, p.y + 0.06, p.z);
    this.camera.position.set(p.x, p.y + 0.07, p.z + 1.25);
    this.camera.lookAt(this.target);
  }

  #resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  #setMorph(name, v) {
    for (const m of this.meshes) {
      const i = m.morphTargetDictionary[name];
      if (i !== undefined) m.morphTargetInfluences[i] = v;
    }
  }

  #frame() {
    if (this.meshes) this.#animate();
    this.renderer.render(this.scene, this.camera);
  }

  #animate() {
    const now = performance.now();
    const t = this.clock.getElapsedTime();

    // --- target blend shape values ---
    const target = { ...MOODS[this.mood] };

    if (now > this.nextBlink) {
      this.blinkUntil = now + 140;
      this.nextBlink = now + 2200 + Math.random() * 3800;
    }
    const blink = now < this.blinkUntil ? 1 : 0;
    target.eyeBlinkLeft = blink;
    target.eyeBlinkRight = blink;

    this.queue = this.queue.filter((q) => q.t1 > now - 100);
    for (const q of this.queue) {
      if (now >= q.t0 - 30 && now <= q.t1 && q.v !== "sil") {
        const k = "viseme_" + q.v;
        target[k] = Math.max(target[k] || 0, VISEME_WEIGHT);
      }
    }

    // --- ease current values toward targets ---
    for (const k of new Set([...Object.keys(this.values), ...Object.keys(target)])) {
      const goal = target[k] || 0;
      const speed = k.startsWith("viseme_") ? 0.45 : k.startsWith("eyeBlink") ? 0.6 : 0.08;
      const v = (this.values[k] ?? 0) + (goal - (this.values[k] ?? 0)) * speed;
      this.values[k] = v;
      this.#setMorph(k, v);
    }

    // --- head and body motion ---
    const goalPose = POSES[this.mood];
    for (let i = 0; i < 3; i++) this.pose[i] += (goalPose[i] - this.pose[i]) * 0.04;
    const talkNod = this.mood === "speaking" ? 0.025 * Math.sin(t * 4.3) * Math.sin(t * 1.3) : 0;
    const b = this.base;
    this.head.rotation.set(
      b.head.x + this.pose[0] + 0.025 * Math.sin(t * 0.7) + talkNod,
      b.head.y + this.pose[1] + 0.05 * Math.sin(t * 0.43),
      b.head.z + this.pose[2] + 0.02 * Math.sin(t * 0.61),
    );
    if (this.neck) this.neck.rotation.set(b.neck.x + 0.01 * Math.sin(t * 0.5), b.neck.y + 0.015 * Math.sin(t * 0.37), b.neck.z);
    if (this.spine) this.spine.rotation.set(b.spine.x + 0.012 * Math.sin(t * 1.1), b.spine.y, b.spine.z); // breathing
  }
}
