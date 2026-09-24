import * as THREE from 'three';
import type { Game, Doc } from './game';
import { NPC, NPCDef } from './npc';
import { Puzzles } from './puzzles';
import { LOOP_D, toLocal, toWorld, LoopStreet } from '../world/build/streets';
import { setClock } from '../world/build/town';
import { drawFamilyPhoto, CANDLE_SOLUTION } from '../world/build/house';
import { makeGear } from '../world/build/church';
import { signTexture, flameTexture } from '../world/canvasTex';
import { HideSpot, World } from '../world/world';
import { doorCenter } from '../world/build/helpers';
import { uvBox } from '../world/geom';
import { MEMORY_IDS, itemIcon as itemIconFor } from './items';
import { loadProgress, saveProgress } from '../core/settings';

const SAVE_KEY = 'ultima-noche-save-v1';

export const S = {
  PROLOGUE: 0,
  MIDNIGHT: 1,
  KIOSK: 2,
  HOUSE: 3,
  CANDLES: 4,
  TOWER: 5,
  GEARS: 6,
  MECHANISM: 7,
  CLIMAX: 8,
  CLIMAX_RUN: 9,
  DAWN: 10,
};

interface Snapshot {
  stage: number;
  flags: Record<string, any>;
  inventory: string[];
  docs: string[];
  film: number;
  battery: number;
  spares: number;
  hasFlashlight: boolean;
  hasCamera: boolean;
  pos: [number, number, number];
  yaw: number;
  playTime: number;
  deaths: number;
  photos: { url: string; caption: string }[];
  candles: boolean[];
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export class Story {
  puzzles: Puzzles;
  stage = 0;
  flags: Record<string, any> = {};
  npcs: NPC[] = [];
  npc: Record<string, NPC> = {};
  clockMin = 23 * 60 + 52;
  lockMove = false;
  scriptedChase = false;
  private hintsShown = new Set<string>();
  private checkpoint: Snapshot | null = null;
  private deaths = 0;
  private DOCS: Record<string, Doc> = {};
  private flashProp!: THREE.Group;
  private cat: { obj: THREE.Object3D; mixer: THREE.AnimationMixer | null; spot: number; walk: THREE.AnimationAction | null; idle: THREE.AnimationAction | null } | null = null;
  private lucia: NPC | null = null;
  private refugio: NPC | null = null;
  private procession: THREE.Group | null = null;
  private ghostFigures: THREE.Group | null = null;
  private kioskFlowers!: THREE.Group;
  private chayoRebozo!: THREE.Mesh;
  private rain: THREE.LineSegments | null = null;
  private rainOn = false;
  private lightningT = 0;
  private flashTimer = 0;
  private titleAngle = 0;
  private taxi: THREE.Group | null = null;
  private events = new Map<string, boolean>();
  private eventTimer = 20;
  private prologueDoneTalk = new Set<string>();
  private dawn = 0;
  private dawnTarget = 0;
  private climaxDeadline = 0;
  private bellSeq: string[] = [];
  private mirrorArmed = false;
  private polaroidEl: HTMLDivElement;
  private bellMechRunning = false;
  private gearMeshes: THREE.Mesh[] = [];
  private loopCount = 0;
  private lastTeleport = 0;
  private radioEventDone = false;
  private barkT = 0;
  private stageMusicT = 0;
  private candleLit: boolean[] = [false, false, false, false, false, false, false];
  private lastSafeWarn = 0;

  constructor(private g: Game) {
    this.puzzles = new Puzzles(g);
    this.polaroidEl = document.createElement('div');
    this.polaroidEl.style.cssText = 'position:fixed;right:4vw;bottom:10vh;width:220px;padding:10px 10px 34px;background:#efe8d8;box-shadow:0 10px 40px #000;transform:rotate(3deg) translateY(30px);opacity:0;transition:opacity .6s, transform .6s;z-index:12;pointer-events:none';
    document.body.appendChild(this.polaroidEl);
  }

  // ======================================================================= SETUP
  setup() {
    const g = this.g;
    this.defineDocs();
    this.setupNPCs();
    this.setupProps();
    this.setupDoors();
    this.setupInteractables();
    this.setupHides();
    this.setupPhotoTargets();
    this.setupRain();
  }

  private defineDocs() {
    const d = (id: string, title: string, html: string, cls = '') => (this.DOCS[id] = { id, title, html, cls });
    d('nota_organillo', 'Tarjeta del organillo', 'Para mi Lucy, en su santo:\n\nTu canción está colgada en el cielo de la plaza.\nEmpieza en la luna y termina en el corazón.\nCuenta los agujeritos.\n\n— Papá', 'hand');
    d('periodico1', 'El Heraldo · 2 feb 2006', '<h1>EL HERALDO</h1><div class="date">Aguascalientes · Jueves 2 de febrero de 2006 · $5.00</div><h2>Buscan a niña extraviada durante el apagón de la verbena</h2><p>Lucía A., de ocho años, fue vista por última vez cerca del kiosco del Jardín del Carmen, poco después de la medianoche, cuando una sobrecarga en el sistema de sonido del escenario dejó sin luz a todo el barrio durante casi una hora.</p><p>Vestía un vestido amarillo y un listón del mismo color. Vecinos con veladoras la buscaron toda la madrugada.</p><p>El reloj del templo quedó detenido a las 12:13.</p>', 'news');
    d('periodico2', 'El Heraldo · 3 feb 2006', '<h1>EL HERALDO</h1><div class="date">Viernes 3 de febrero de 2006</div><h2>Luto en el barrio: hallan sin vida a la pequeña Lucía</h2><p>Al amanecer, el campanero Refugio M. encontró a la menor al pie de la torre del Templo del Carmen. Se presume que subió al campanario durante el apagón y cayó por el barandal dañado.</p><p>El campanero fue detenido por dejar abierta la torre. El párroco ordenó clausurarla y suspender las campanadas de medianoche «hasta que el barrio sane».</p><h2>Se suspende la fiesta de la Candelaria</h2>', 'news');
    d('nota_mama', 'Nota en la cocina', 'Julián:\nTe dejé tamales en la olla y atole en el termo.\nLlévate a tu hermana a la verbena y NO LA SUELTES,\nque con tanta gente se pierde.\nLlego tarde del turno.\n\nTe quiero, mijo.\n— Mamá\n1/feb/06', 'hand');
    d('nota_papa', 'Nota junto a la cámara', 'Para mi Lucy:\nesta cámara ve lo que los ojos ya no.\nÚsala poquito, que la película está cara.\n\n— Papá', 'hand');
    d('nota_refugio', 'Nota en el mecanismo', 'Don Aurelio:\nle encargo los dos engranes del mecanismo del alba,\nque ya no muerden. Guárdelos en su cajón\ncomo siempre, que ahí nadie los toca.\nPara la Candelaria tienen que quedar,\nque el alba se toca como Dios manda.\n\n— Refugio M.\n30 de enero de 2006', 'hand');
    d('inscripcion', 'Inscripción en la torre', '«Después del Dolor viene la Soledad;\ndespués de la Soledad, la Esperanza;\ny al final, la Luz.»\n\n— Toque del alba.\nCampanas: Dolores (al sur), Soledad (al poniente),\nEsperanza (al norte), Luz (al oriente).', '');
    d('carta', 'Carta sin enviar', 'Don Refugio:\n\nUsted no tuvo la culpa.\nMi mamá me dijo que no la soltara y yo la dejé sola en el kiosco\npara irme a la cantina con mis amigos.\nCuando se fue la luz ella me buscó. Ella quería ver las campanas.\nYo no dije nada. Dejé que se lo llevaran a usted.\n\nPerdóneme. Aunque yo no me perdone.\n\n— Julián A.\n2007', 'hand');
    d('cartel_lucia', 'Cartel viejo en un poste', '<h1>¿LA HAS VISTO?</h1><div class="date">Lucía Arriaga · 8 años · vestido amarillo</div><p>Vista por última vez en el Jardín del Carmen la noche del 1 de febrero.</p><p>Cualquier informe: Tel. 15-2-26-06</p>', 'news');
    d('volante', 'Volante de la verbena', '<h1>¡REGRESAN LAS CAMPANADAS!</h1><div class="date">Gran Verbena de la Candelaria · 1 de febrero</div><p>Después de veinte años, el Templo del Carmen volverá a tocar las doce campanadas de medianoche para anunciar la fiesta.</p><p>¡Tamales, atole, lotería, música en vivo con Los Faroles de Aguascalientes!</p>', 'news');
    d('foto_velas', 'Foto: el dibujo de las velas', 'En la foto, la hoja en blanco no está en blanco.\nEs un candelabro de siete velas, dibujado con gis por una niña.\nAlgunas velas tienen flama. Otras no.\n\n(Revísala en tus fotografías.)', 'hand');
  }

  // ======================================================================= NPCs
  private setupNPCs() {
    const g = this.g;
    const w = g.world;
    const defs: NPCDef[] = [
      { id: 'beto', name: 'Don Beto', model: 'npc_man', height: 1.68, pos: V(11, 0, 25.4), yaw: Math.PI, anim: 'idle', voice: 'beto', outfit: { Shirt: 0xe6ddc8, Pants: 0x3a3026, Hair: 0xc8c4be, Skin: 0x8a6448 } },
      { id: 'chayo', name: 'Doña Chayo', model: 'npc_woman2', height: 1.58, pos: V(-1.5, 0.15, 12.1), yaw: Math.PI / 2 + 0.4, anim: 'idle', voice: 'chayo', outfit: { Jacket: 0x5a2a3a, LightJacket: 0x6a3a48, Shirt: 0x2a2226, Pants: 0x2a2024, HairBase: 0xa8a4a0, Hair: 0xb8b4b0, Skin: 0x9a7a5a } },
      { id: 'chuy', name: 'Chuy', model: 'npc_man', height: 1.74, pos: g.stage.musicianSpot.clone(), yaw: -Math.PI / 2, anim: 'idle', voice: 'chuy', outfit: { Shirt: 0x1a1a1c, Pants: 0x1a1a1c, Skin: 0x8a6a4a } },
      { id: 'chema', name: 'Don Chema', model: 'npc_man2', height: 1.72, pos: V(-27.3, 0, 27.3), yaw: 0, anim: 'walk', voice: 'chema', outfit: { Shirt: 0x2a3552, Pants: 0x1c2030, Socks: 0x111111 }, path: [V(-27.3, 0, 27.3), V(27.3, 0, 27.3), V(27.3, 0, -27), V(-27.3, 0, -27)], speed: 1.0 },
      { id: 'panadero', name: 'El panadero', model: 'npc_man', height: 1.7, pos: V(-33.2, 0.15, -16), yaw: Math.PI / 2, anim: 'idle', voice: 'panadero', outfit: { Shirt: 0xf0ece4, Pants: 0x5a5048 } },
      { id: 'compa1', name: 'Parroquiano', model: 'npc_man2', height: 1.72, pos: V(-31.6, 0.15, -3.2), yaw: 0.4, anim: 'idle', voice: 'vecino', outfit: { Shirt: 0x7a2a2a, Pants: 0x2e3848 } },
      { id: 'compa2', name: 'Parroquiano', model: 'npc_man', height: 1.76, pos: V(-31.4, 0.15, -1.8), yaw: Math.PI - 0.3, anim: 'idle', voice: 'vecino', outfit: { Shirt: 0xd8c8a0, Pants: 0x3a3a3a } },
      { id: 'lupe', name: 'Doña Lupe', model: 'npc_woman', height: 1.6, pos: V(-33.3, 0.15, 4), yaw: Math.PI / 2, anim: 'idle', voice: 'lupe', outfit: { Dress: 0x3a4a7a, Hair: 0x1a1412 } },
      { id: 'pareja1', name: '', model: 'npc_woman', height: 1.62, pos: V(-0.9, 0.15, 16.2), yaw: Math.PI / 2, anim: 'idle', voice: 'vecina', path: [V(-1.2, 0.15, 21), V(-0.8, 0, 38)], speed: 0.8, outfit: { Dress: 0xb03a5a }, oneWay: true },
      { id: 'pareja2', name: '', model: 'npc_man2', height: 1.75, pos: V(0.3, 0.15, 16.3), yaw: -Math.PI / 2, anim: 'idle', voice: 'vecino', path: [V(0.2, 0.15, 21), V(0.6, 0, 38)], speed: 0.8, oneWay: true },
    ];
    for (const d of defs) {
      const n = new NPC(d, w);
      this.npcs.push(n);
      this.npc[d.id] = n;
    }
    this.npc.pareja1.busy = this.npc.pareja2.busy = true; // they start walking at 11:52
    // guitar for the musician
    const gt = g.assets.instance('guitar', { height: 1.0 });
    if (gt) {
      gt.position.set(0.12, 0.72, 0.28);
      gt.rotation.set(0.2, Math.PI / 2, -1.1);
      this.npc.chuy.obj.add(gt);
    }
    // broom for Lupe
    const br = g.assets.instance('broom', { height: 1.4 });
    if (br) {
      br.position.set(0.3, 0, 0.3);
      br.rotation.z = 0.3;
      this.npc.lupe.obj.add(br);
    }
    // Lucía (ghost girl) — child model tinted yellow
    const ld: NPCDef = { id: 'lucia', name: 'Lucía', model: 'npc_child', height: 1.22, pos: V(0.5, 0.15, 7.6), yaw: Math.PI, anim: 'idle', voice: 'lucia', outfit: { LightBrown: 0xf0c828, LightBlue: 0xf0c828, Hair: 0x2a1a10 } };
    this.lucia = new NPC(ld, w);
    this.lucia.setVisible(false);
    this.lucia.obj.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) {
        const mat = (m.material as THREE.MeshStandardMaterial).clone();
        mat.transparent = true;
        mat.opacity = 0.82;
        mat.emissive = new THREE.Color(0x40380a);
        m.material = mat;
      }
    });
    // Don Refugio (old man, ending)
    const rd: NPCDef = { id: 'refugio', name: 'Don Refugio', model: 'npc_old', height: 1.62, pos: V(2, 0.3, -33.5), yaw: Math.PI, anim: 'idle', voice: 'refugioReal', tint: 0xd8d0c0 };
    this.refugio = new NPC(rd, w);
    this.refugio.setVisible(false);
    const rbroom = g.assets.instance('broom', { height: 1.4 });
    if (rbroom) {
      rbroom.position.set(0.35, 0, 0.25);
      rbroom.rotation.z = 0.35;
      this.refugio.obj.add(rbroom);
    }
    // cat
    const catObj = g.assets.instance('cat', { height: 0.3, skinned: true });
    if (catObj) {
      g.engine.scene.add(catObj);
      catObj.visible = false;
      const gl = g.assets.models.get('cat')!;
      const mixer = new THREE.AnimationMixer(catObj.children[0]);
      const find = (n: string) => {
        const c = gl.animations.find((a) => a.name.toLowerCase() === n) ?? gl.animations.find((a) => a.name.toLowerCase().includes(n));
        return c ? mixer.clipAction(c) : null;
      };
      const idle = find('idle');
      idle?.play();
      this.cat = { obj: catObj, mixer, spot: 0, walk: find('walk') ?? find('run'), idle };
      catObj.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh) {
          const mat = (m.material as THREE.MeshStandardMaterial).clone();
          mat.color.set(0xd8883a);
          m.material = mat;
        }
      });
    }
  }

  // ======================================================================= PROPS
  private setupProps() {
    const g = this.g;
    const m = g.mats;
    // the guard's flashlight lying on the path after midnight
    const fp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.26, 10), m.flat(0x202224, { metal: 0.6, rough: 0.4, key: 'flBody' }));
    body.rotation.z = Math.PI / 2;
    fp.add(body);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.036, 0.07, 12), m.flat(0x303234, { metal: 0.7, key: 'flHead' }));
    head.rotation.z = Math.PI / 2;
    head.position.x = -0.16;
    fp.add(head);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), new THREE.MeshBasicMaterial({ color: 0xfff4d8 }));
    lens.position.x = -0.196;
    lens.rotation.y = -Math.PI / 2;
    fp.add(lens);
    fp.position.set(0.8, 0.19, -9.8);
    fp.rotation.y = -Math.PI / 2 + 0.3; // lens toward the church (-z)
    fp.visible = false;
    g.engine.scene.add(fp);
    this.flashProp = fp;
    // beam pool on the ground toward the church
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 7), new THREE.MeshBasicMaterial({ map: g.world.poolTex, color: 0xfff0d0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(0.3, 0.17, -13.5);
    beam.rotation.z = 0.05;
    fp.userData.beam = beam;
    beam.visible = false;
    g.engine.scene.add(beam);
    g.world.lamp('flashProp', V(0.4, 0.5, -11.5), { color: 0xfff0d8, intensity: 3, distance: 7, poolY: null, halo: false, on: false, priority: 2 });
    // Chayo's rebozo left on the bench (after midnight)
    const reb = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5, 4, 2), new THREE.MeshStandardMaterial({ color: 0x5a2a3a, roughness: 1, side: THREE.DoubleSide }));
    const pos = reb.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.random() * 0.06);
    reb.rotation.x = -Math.PI / 2 + 0.2;
    reb.position.set(-2.4, 0.62, 13);
    reb.visible = false;
    g.engine.scene.add(reb);
    this.chayoRebozo = reb;
    // white calla lilies appearing around the kiosk steps
    const kf = new THREE.Group();
    const lilyMat = m.flat(0xf4f0e2, { rough: 0.7, side: THREE.DoubleSide, key: 'lily2', emissive: 0x303028, emissiveIntensity: 0.3 });
    const stemMat = m.flat(0x2f5a26, { rough: 0.9, key: 'stem' });
    for (let i = 0; i < 44; i++) {
      const side = i % 2 ? 1 : -1;
      const x = (Math.random() - 0.5) * 3.2;
      const z = side * (7.2 + Math.random() * 0.8);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.5, 4), stemMat);
      stem.position.set(x, 0.4, z);
      kf.add(stem);
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 7, 1, true), lilyMat);
      fl.position.set(x, 0.68, z);
      fl.rotation.set(0.5 * (Math.random() - 0.5), 0, 0.5 * (Math.random() - 0.5) + Math.PI);
      kf.add(fl);
    }
    kf.visible = false;
    g.engine.scene.add(kf);
    this.kioskFlowers = kf;
    // procession figures (hooded, with candles)
    const proc = new THREE.Group();
    const ghostMat = new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 1, transparent: true, opacity: 0.85 });
    const ft = flameTexture();
    for (let i = 0; i < 14; i++) {
      const fig = new THREE.Group();
      const robe = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.65, 10, 1, true), ghostMat);
      robe.position.y = 0.82;
      fig.add(robe);
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), ghostMat);
      hood.position.y = 1.65;
      hood.scale.set(1, 1.2, 1);
      fig.add(hood);
      const cand = new THREE.Sprite(new THREE.SpriteMaterial({ map: ft, color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false }));
      cand.scale.set(0.07, 0.16, 1);
      cand.position.set(0.12, 1.2, 0.22);
      fig.add(cand);
      const cg = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.world.glowTex, color: 0xff9a40, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 }));
      cg.scale.setScalar(0.7);
      cg.position.copy(cand.position);
      fig.add(cg);
      fig.userData.phase = Math.random() * 10;
      proc.add(fig);
    }
    proc.visible = false;
    g.engine.scene.add(proc);
    this.procession = proc;
    // static ghost figures for the climax (standing around the garden, facing the church)
    const gf = new THREE.Group();
    for (let i = 0; i < 18; i++) {
      const fig = proc.children[i % proc.children.length].clone();
      const a = (i / 18) * Math.PI * 2;
      const r = 12 + (i % 3) * 3.5;
      fig.position.set(Math.cos(a) * r, 0.15, Math.sin(a) * r);
      fig.rotation.y = Math.atan2(-fig.position.x, -40 - fig.position.z);
      gf.add(fig);
    }
    gf.visible = false;
    g.engine.scene.add(gf);
    this.ghostFigures = gf;
    // taxi (ending)
    const taxi = new THREE.Group();
    const paint = m.flat(0xe8e2d0, { metal: 0.4, rough: 0.35, key: 'taxiPaint' });
    const red = m.flat(0x9a2020, { metal: 0.4, rough: 0.4, key: 'taxiRed' });
    const b1 = new THREE.Mesh(uvBox(1.8, 0.7, 4.3), paint);
    b1.position.y = 0.65;
    taxi.add(b1);
    const b2 = new THREE.Mesh(uvBox(1.6, 0.55, 2.2), m.flat(0x1a2028, { metal: 0.6, rough: 0.1, key: 'taxiGlass' }));
    b2.position.set(0, 1.25, -0.2);
    taxi.add(b2);
    const stripe = new THREE.Mesh(uvBox(1.82, 0.12, 4.32), red);
    stripe.position.y = 0.72;
    taxi.add(stripe);
    const sgn = new THREE.Mesh(uvBox(0.5, 0.18, 0.2), new THREE.MeshStandardMaterial({ color: 0xfff0a0, emissive: 0xffd060, emissiveIntensity: 1 }));
    sgn.position.set(0, 1.62, -0.2);
    taxi.add(sgn);
    for (const [x, z] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 14), m.flat(0x111111, { key: 'tire' }));
      wh.rotation.z = Math.PI / 2;
      wh.position.set(x, 0.32, z);
      taxi.add(wh);
    }
    for (const x of [-0.6, 0.6]) {
      const hl = new THREE.Mesh(new THREE.CircleGeometry(0.12, 10), new THREE.MeshBasicMaterial({ color: 0xfff4d0 }));
      hl.position.set(x, 0.7, -2.16);
      hl.rotation.y = Math.PI;
      taxi.add(hl);
    }
    taxi.position.set(0, 0, 33.5);
    taxi.visible = false;
    g.engine.scene.add(taxi);
    this.taxi = taxi;
    // gear meshes in the mechanism (appear when placed)
    const sizes = [0.27, 0.36];
    g.church.gearSlots.slice(1).forEach((slot, i) => {
      const gm = makeGear(g.world, sizes[i], i === 0 ? 18 : 24, 0xa8844a);
      gm.visible = false;
      slot.add(gm);
      this.gearMeshes.push(gm);
    });
    // inscription plaque in the belfry
    const insc = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshStandardMaterial({ map: signTexture('DOLOR · SOLEDAD · ESPERANZA · LUZ', { w: 1024, h: 560, bg: '#b8a088', fg: '#3a2418', font: '"Cormorant Garamond", Georgia', aged: 0.9 }), roughness: 0.9 }));
    insc.position.set(-11.25, 18 + 1.5, -41.9);
    g.world.group('church').add(insc);
    // poster of the missing girl on a lamp post (prologue hint)
    const post = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.44), new THREE.MeshStandardMaterial({ map: signTexture('¿LA HAS VISTO?', { w: 256, h: 350, bg: '#d8ccb0', fg: '#3a2418', sub: 'Lucía · 8 años', aged: 1 }), roughness: 1 }));
    post.position.set(2.6, 1.7, -9.48);
    post.rotation.y = Math.PI;
    g.world.group('signs').add(post);
    // festival flyer on the kiosk
    const fly = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.55), new THREE.MeshStandardMaterial({ map: signTexture('¡REGRESAN LAS CAMPANADAS!', { w: 300, h: 420, bg: '#f2cf3a', fg: '#8a1a3a', sub: 'Verbena de la Candelaria', aged: 0.3 }), roughness: 0.8 }));
    fly.position.set(1.47, 1.2, 6.4);
    fly.rotation.y = Math.PI / 2;
    g.world.group('signs').add(fly);
  }

  // ======================================================================= DOORS
  private setupDoors() {
    const g = this.g;
    const specialDoors = new Set(['churchL', 'churchR', 'gateL', 'gateR', 'casa', 'lucy', 'almacenFront', 'almacenBack', 'tower']);
    for (const d of g.world.doors) {
      const c = doorCenter(d);
      g.world.interact({
        id: 'door:' + d.id,
        pos: c,
        radius: 0.6,
        reach: 2.2,
        prompt: () => (d.isOpen ? 'Cerrar' : d.locked ? 'Abrir' : 'Abrir'),
        enabled: () => {
          if (d.id === 'lucy') return this.flags.lucyRoom && Math.abs(d.angle - d.target) < 0.05;
          if (specialDoors.has(d.id) && d.id !== 'tower' && d.id !== 'almacenBack' && d.id !== 'almacenFront') return !d.locked && Math.abs(d.angle - d.target) < 0.05 && this.stage !== S.PROLOGUE;
          return Math.abs(d.angle - d.target) < 0.05;
        },
        onUse: () => this.useDoor(d),
      });
      // the interactable should follow the door swing
      const it = g.world.interactables[g.world.interactables.length - 1];
      g.world.updaters.push(() => {
        const base = d.pivot.userData.baseRot ?? 0;
        const a = base + d.angle * 0.35;
        it.pos.set(d.hingePos.x + Math.cos(a) * d.width * 0.55, d.hingePos.y + 1.1, d.hingePos.z - Math.sin(a) * d.width * 0.55);
      });
    }
  }

  useDoor(d: import('../world/world').Door) {
    const g = this.g;
    const c = doorCenter(d);
    if (d.locked) {
      g.sfx(d.sound === 'iron' ? 'chain_rattle' : 'door_locked', c, 0.6);
      g.ui.hint(d.lockedMsg, 3);
      g.player.emit(5, 'door');
      if (d.id === 'tower') this.onTowerLocked();
      return;
    }
    const opening = !d.isOpen;
    d.setOpen(opening);
    if (d.sound === 'iron') g.sfx('gate_iron_creak', c, 0.6, { rate: 1.1 });
    else g.sfx(opening ? (Math.random() < 0.4 ? 'door_creak' : 'door_open') : 'door_close', c, 0.65);
    g.player.emit(opening ? 7 : 10, 'door');
    if (opening) d.onOpen?.();
  }

  // ======================================================================= INTERACTABLES
  private it(id: string, pos: THREE.Vector3, prompt: string | (() => string), enabled: () => boolean, onUse: () => void, opts: { radius?: number; reach?: number; hold?: number } = {}) {
    this.g.world.interact({ id, pos, prompt, enabled, onUse, radius: opts.radius ?? 0.4, reach: opts.reach, hold: opts.hold });
  }

  private setupInteractables() {
    const g = this.g;
    const st = () => this.stage;
    // ---------- prologue NPC talk ----------
    const talkable = ['beto', 'chayo', 'chuy', 'chema', 'panadero', 'lupe', 'compa1'];
    for (const id of talkable) {
      const n = this.npc[id];
      this.it('talk:' + id, n.pos.clone(), () => `Hablar con ${n.def.name}`, () => this.stage === S.PROLOGUE && n.visible && !n.talking && !this.flags.midnightStarted && !this.g.convo, () => this.talk(id), { radius: 0.7, reach: 2.6 });
      // follow npc
      const itm = g.world.interactables[g.world.interactables.length - 1];
      g.world.updaters.push(() => itm.pos.set(n.pos.x, n.pos.y + (n.baseAnim === 'sitting' ? 1.0 : 1.45), n.pos.z));
    }
    // ---------- documents / posters ----------
    this.it('poster', V(2.6, 1.7, -9.45), 'Leer el cartel', () => true, () => g.read(this.DOCS.cartel_lucia));
    this.it('flyer', V(1.47, 1.2, 6.4), 'Leer el volante', () => true, () => g.read(this.DOCS.volante));
    this.it('newspaper', g.house.newspaperPos.clone(), 'Leer el periódico', () => true, () => {
      g.read(this.DOCS.periodico1);
      this.houseClue('periodico');
    });
    this.it('nota_mama', g.house.noteKitchenPos.clone(), 'Leer la nota', () => true, () => {
      g.read(this.DOCS.nota_mama);
      this.houseClue('nota');
    });
    this.it('familyPhoto', g.house.familyPhoto.mesh.position.clone(), 'Mirar la fotografía', () => true, () => this.lookFamilyPhoto());
    this.it('periodico2', V(10.5, 0.95, -52.1), 'Leer los recortes', () => true, () => g.read(this.DOCS.periodico2));
    this.it('inscripcion', V(-11.25, 19.5, -41.8), 'Leer la inscripción', () => true, () => g.read(this.DOCS.inscripcion));
    this.it('calendario', V(-35.2, 1.7, -60.4), 'Mirar el calendario', () => true, () => g.think('Febrero de 2006. El 1 tiene un círculo: «VERBENA». El 2: «tamales — Candelaria».'));
    this.it('sticker', V(-39.05, 1.3, -66.8), 'Mirar la calcomanía', () => true, () => g.think('«Radio Candelaria, 1260 AM. ¡La que se oye en todo el barrio!» Mamá la ponía siempre.'));
    this.it('grafiti', g.house.graffiti1020.clone(), 'Mirar el grafiti', () => st() >= S.KIOSK, () => g.think('«L ♥ 1020». Con gis. Letra de niña.'));
    // ---------- flashlight pickup ----------
    this.it('flashlight', V(0.8, 0.3, -9.8), 'Recoger la linterna de Don Chema', () => this.stage >= S.MIDNIGHT && !this.flags.guardLight, () => this.pickFlashlight(), { radius: 0.5, reach: 2.4 });
    // ---------- matches at the tamales cart (if not given) ----------
    this.it('cerillos', V(11, 1.0, 24.55), 'Tomar los cerillos', () => this.stage >= S.MIDNIGHT && !g.has('cerillos'), () => {
      g.give('cerillos');
      g.think('Los cerillos de Don Beto. Seguían sobre su carrito, junto a la olla todavía tibia.');
    });
    this.it('champurrado', V(11, 1.1, 24.55), 'Tocar la olla', () => this.stage >= S.MIDNIGHT && g.has('cerillos'), () => g.think('Todavía está tibia. Como si Don Beto acabara de irse.'));
    // ---------- church ----------
    this.it('confesionario', V(5.05, 1.3, -46.4), 'Entrar al confesionario', () => st() >= S.MIDNIGHT && !g.player.hidden, () => this.confessional(), { radius: 0.6 });
    g.church.candelabrum.candles.forEach((c, i) => {
      this.it('vela' + i, c.pos, () => (this.candleLit[i] ? 'Apagar la vela' : g.has('cerillos') ? 'Encender la vela' : 'Examinar la vela'), () => st() >= S.MIDNIGHT && !this.flags.candlesSolved, () => this.toggleCandle(i), { radius: 0.12, reach: 2.4 });
    });
    this.it('zapatito', g.church.lucyShoe.position.clone().setY(18.1), 'Mirar el zapatito', () => true, () => this.lookShoe(), { radius: 0.25 });
    this.it('notaRefugio', V(-11.25, 19.4, -39.0), 'Leer la nota', () => true, () => {
      g.read(this.DOCS.nota_refugio);
      this.onRefugioNote();
    }, { radius: 0.4 });
    this.it('mecanismo', V(-11.25, 19.2, -38.7), () => (this.flags.gearsPlaced ? (this.flags.mechanismWound ? 'El mecanismo está corriendo' : 'Dar cuerda al mecanismo') : 'Examinar el mecanismo'), () => st() >= S.TOWER && !(this.flags.mechanismWound && this.flags.gearsPlaced), () => this.useMechanism(), { radius: 0.6, hold: this.flags.gearsPlaced ? 2.5 : undefined });
    g.church.bells.forEach((b) => {
      this.it('bell:' + b.name, b.pos.clone().setY(18 + 1.6), `Tocar la campana «${b.name}»`, () => this.flags.mechanismWound && (st() === S.MECHANISM || st() === S.CLIMAX_RUN), () => this.ringBell(b.name), { radius: 0.7, reach: 2.8 });
    });
    // ---------- kiosk organillo ----------
    this.it('organillo', V(0, 2.5, 0.2), () => (this.flags.organilloSolved ? 'Dar vuelta a la manivela' : 'Examinar el organillo'), () => st() >= S.MIDNIGHT, () => this.useOrganillo(), { radius: 0.5, reach: 2.4 });
    // ---------- house ----------
    this.it('radio', g.house.radioPos.clone().setY(1.0), 'Encender el radio', () => st() >= S.KIOSK, () => this.useRadio(), { radius: 0.3 });
    this.it('camara', V(-29.3, 0.95, -53.1), 'Tomar la cámara', () => this.flags.lucyRoom && !g.hasCamera, () => this.pickCamera(), { radius: 0.3 });
    this.it('hojaBlanca', V(-28.25, 1.6, -55.2), 'Mirar la hoja', () => this.flags.lucyRoom, () => g.think(g.hasCamera ? 'Una hoja en blanco, pegada con cinta. «La cámara ve lo que los ojos ya no»…' : 'Una hoja en blanco, pegada con cinta a la pared.'), { radius: 0.4 });
    this.it('ropero', V(-39.2, 1.2, -72), () => (this.flags.wardrobeMoved ? 'Asomarse' : 'Empujar el ropero'), () => st() >= S.KIOSK && !this.flags.wardrobeMoved, () => this.pushWardrobe(), { radius: 0.8, hold: 1.4 });
    this.it('rayones', V(-38.7, 0.2, -72), 'Mirar los rayones', () => st() >= S.KIOSK && !this.flags.wardrobeMoved, () => g.think('Rayones en el piso. Alguien arrastró este ropero muchas veces.'), { radius: 0.5 });
    this.it('carta', V(-42.3, 0.5, -71.0), 'Leer la carta', () => this.flags.wardrobeMoved && !g.has('carta'), () => {
      g.read(this.DOCS.carta);
      g.give('carta');
    }, { radius: 0.3 });
    this.it('liston', g.house.ribbon.position.clone(), 'Tomar el listón', () => st() >= S.MIDNIGHT && !g.has('liston'), () => {
      g.house.ribbon.visible = false;
      g.give('liston');
      g.think('Su listón. Amarillo, como el vestido. Yo se lo amarré esa tarde.');
    }, { radius: 0.2 });
    // ---------- market ----------
    this.it('relojMaestro', g.market.masterClock.pos.clone(), 'Poner la hora', () => st() >= S.TOWER && !this.flags.drawerOpen, () => this.g.story.puzzles.clock([12, 13], () => this.onClockSolved()), { radius: 0.5 });
    this.it('cajon', g.market.drawer.position.clone(), () => (this.flags.drawerOpen ? 'Tomar los engranes' : 'Abrir el cajón'), () => st() >= S.TOWER && !g.has('engrane_chico'), () => {
      if (!this.flags.drawerOpen) {
        g.sfx('door_locked', g.market.drawer.position, 0.4, { rate: 1.6 });
        g.think('Cerrado. Tiene una cerradura unida al reloj grande.');
        return;
      }
      this.takeGears();
    }, { radius: 0.35 });
    this.it('cerrojo', V(-42.3, 1.2, -24), 'Descorrer el cerrojo', () => st() >= S.TOWER && g.world.doors.find((d) => d.id === 'almacenBack')!.locked && g.player.pos.x < -42, () => {
      const back = g.world.doors.find((d) => d.id === 'almacenBack')!;
      const front = g.world.doors.find((d) => d.id === 'almacenFront')!;
      back.locked = false;
      front.locked = false;
      g.sfx('lock_unlock', V(-42, 1.2, -24), 0.7);
      this.useDoor(back);
    }, { radius: 0.4 });
    g.market.batteries.forEach((b, i) => {
      this.it('pilas' + i, b, 'Tomar pilas', () => st() >= S.MIDNIGHT && !this.flags['pilas' + i], () => {
        this.flags['pilas' + i] = true;
        g.spares++;
        g.give('pilas');
        g.sfx('pickup_item', b, 0.5);
      }, { radius: 0.3 });
    });
    this.it('pilasPlaza', V(-11, 1.0, 24.55), 'Tomar pilas', () => st() >= S.CLIMAX && !this.flags.pilasPlaza, () => {
      this.flags.pilasPlaza = true;
      g.spares++;
      g.give('pilas');
    }, { radius: 0.3 });
    // ---------- stage ----------
    this.it('cassette', g.stage.console.clone(), 'Reproducir el cassette', () => st() >= S.MIDNIGHT && !g.has('cassette'), () => this.playCassette(), { radius: 0.35 });
    this.it('planta', g.stage.generator.clone(), 'Arrancar la planta de luz', () => st() === S.CLIMAX && !this.flags.generatorOn, () => this.useGenerator(), { radius: 0.8 });
    this.it('tablero', g.stage.panel.clone(), 'Abrir el tablero eléctrico', () => st() === S.CLIMAX && !this.flags.panelDone, () => this.usePanel(), { radius: 0.6 });
    // ---------- ending ----------
    this.it('taxi', V(0, 1.1, 32), 'Subir al taxi', () => st() === S.DAWN && this.flags.ending === 'normal' && !!this.taxi?.visible, () => this.finishEnding('normal'), { radius: 1.6, reach: 3 });
    this.it('refugio', V(0, 1.4, 0), 'Hablar con Don Refugio', () => st() === S.DAWN && this.flags.ending === 'true' && !!this.refugio?.visible && !this.flags.talkedRefugio, () => this.talkRefugio(), { radius: 0.7, reach: 2.6 });
    const ri = g.world.interactables[g.world.interactables.length - 1];
    g.world.updaters.push(() => this.refugio && ri.pos.set(this.refugio.pos.x, 1.4, this.refugio.pos.z));
    this.it('decir', V(0, 0, 0), 'Decir la verdad', () => this.flags.awaitTruth, () => this.sayTruth(), { radius: 3, reach: 6 });
    const di = g.world.interactables[g.world.interactables.length - 1];
    g.world.updaters.push(() => di.pos.copy(g.entity.pos).setY(g.entity.pos.y + 1.8));
    // ---------- misc flavor ----------
    this.it('fuente', V(0, 0.9, -11.4), 'Asomarse a la fuente', () => st() >= S.MIDNIGHT, () => g.think(this.stage >= S.CLIMAX ? 'Velas flotando sobre el agua negra. Cientos.' : 'Seca. Hace un momento corría el agua.'), { radius: 1.5 });
    this.it('rebozo', V(-2.4, 0.7, 13), 'Mirar el rebozo', () => st() >= S.MIDNIGHT && this.chayoRebozo.visible, () => g.think('El rebozo de Doña Chayo. Tibio. Huele a canela.'), { radius: 0.4 });
    this.it('estatua', V(0, 2.4, 12.6), 'Leer la placa', () => true, () => g.think(this.stage >= S.HOUSE ? '«A las madres que esperan.» …Antes miraba hacia el kiosco. Ahora mira hacia el callejón.' : '«A las madres que esperan. Barrio del Carmen, 1962.»'), { radius: 0.6 });
    this.it('relojIglesia', V(0, 2, -30.9), 'Mirar el reloj del templo', () => true, () => g.think('El reloj del templo marca las 12:13. Doña Chayo dice que así lleva veinte años.'), { radius: 1.2, reach: 3 });
    this.it('tv', g.market.cantinaTV.position.clone(), 'Mirar la televisión', () => st() >= S.MIDNIGHT, () => g.think('Solo estática. Por un momento creí ver el kiosco en la pantalla.'), { radius: 0.4, reach: 3 });
  }

  // ======================================================================= HIDES
  private setupHides() {
    const g = this.g;
    const add = (h: HideSpot, promptPos: THREE.Vector3, when: () => boolean) => {
      g.world.hides.push(h);
      this.it('hide:' + h.id, promptPos, h.kind === 'understage' ? 'Meterse debajo del escenario' : h.kind === 'locker' ? 'Esconderse en el casillero' : h.kind === 'stall' ? 'Esconderse bajo el puesto' : h.kind === 'confessional' ? 'Esconderse' : 'Esconderse en el ropero', () => when() && !g.player.hidden, () => g.enterHide(h), { radius: 0.6 });
    };
    const late = () => this.stage >= S.TOWER;
    add({ id: 'sacristia', inside: V(11.9, 0.05, -56.5), exit: V(10.7, 0.05, -56.5), yaw: -Math.PI / 2 * -1, kind: 'wardrobe', enabled: late }, V(11.6, 1.2, -56.5), () => this.stage >= S.MIDNIGHT);
    g.market.lockers.forEach((l, i) => add({ id: 'locker' + i, inside: V(l.x, 0.15, 7.55), exit: l.clone(), yaw: 0, kind: 'locker', enabled: late }, V(l.x, 1.2, 7.2), late));
    add({ id: 'puestoMercado', inside: V(-47, 0.15, -4.5), exit: V(-44, 0.15, -4.5), yaw: -Math.PI / 2, kind: 'stall', enabled: late }, V(-45.3, 0.8, -4.5), late);
    add({ id: 'escenario', inside: g.stage.underStage.clone(), exit: g.stage.underStageExit.clone(), yaw: 0, kind: 'understage', enabled: late }, V(45, 0.6, -7.4), late);
    add({ id: 'puestoTamales', inside: V(11, 0.15, 25.5), exit: V(11, 0.15, 23.2), yaw: 0, kind: 'stall', enabled: late }, V(11, 0.8, 24.2), late);
    add({ id: 'puestoJuguetes', inside: V(25.9, 0.15, 6), exit: V(23.8, 0.15, 6), yaw: Math.PI / 2, kind: 'stall', enabled: late }, V(24.8, 0.8, 6), late);
  }

  // ======================================================================= PHOTO TARGETS
  private setupPhotoTargets() {
    const g = this.g;
    g.photoTargets.push({
      id: 'velas', pos: V(-28.2, 1.6, -55.2), maxDist: 4.5, cond: () => this.flags.lucyRoom,
      onCapture: () => {
        this.flags.candleClue = true;
        g.addDoc(this.DOCS.foto_velas);
        g.tasks.run(async () => {
          await g.wait(2.2);
          await g.think('En la foto, la hoja no está en blanco. Un candelabro de siete velas… algunas encendidas.');
          await g.think('«Las velitas de la iglesia». Ella las dibujó así.');
          this.objective('Enciende las velas del candelabro de la iglesia como en el dibujo.');
          this.setStage(S.HOUSE);
          this.saveCheckpoint(V(-31.5, 0.12, -62), Math.PI / 2);
        });
      },
    });
    g.photoTargets.push({
      id: 'pasillo', pos: V(-26, 1.2, -66.5), maxDist: 12, cond: () => this.flags.lucyRoom,
      onCapture: () => {
        g.tasks.run(async () => {
          await g.wait(2.0);
          g.sfx('stinger_low', undefined, 0.4);
          await g.think('Hay alguien en la foto. Una niña, en el zaguán. Señala hacia la sala.');
        });
      },
    });
    g.photoTargets.push({
      id: 'kiosco', pos: V(0, 2.2, 0), maxDist: 16, cond: () => this.flags.organilloSolved && !g.has('foto_verbena'),
      onCapture: () => {
        g.tasks.run(async () => {
          await g.wait(2.0);
          g.give('foto_verbena');
          await g.think('La foto no muestra el kiosco vacío. Muestra la verbena. A ella… y a mí, de quince años, mirando hacia la cantina.');
        });
      },
    });
    g.photoTargets.push({
      id: 'procesion', pos: V(0, 1.5, 0), maxDist: 40, cond: () => !!this.procession?.visible,
      onCapture: () => {
        g.tasks.run(async () => {
          await g.wait(2.0);
          await g.think('En la foto tienen cara. Don Beto. Doña Chayo. El vigilante… La gente que la buscó aquella noche.');
        });
      },
    });
    g.photoTargets.push({
      id: 'espejo', pos: V(-31.2, 1.55, -75.78), maxDist: 6, cond: () => this.radioEventDone,
      onCapture: () => g.tasks.run(async () => {
        await g.wait(2.0);
        await g.think('En el reflejo de la foto hay alguien detrás de mí. Alta. Con velo.');
      }),
    });
  }

  photoCaption(id: string) {
    const map: Record<string, string> = {
      velas: 'las velitas de la iglesia',
      pasillo: 'el zaguán',
      kiosco: 'verbena · 1 feb 2006',
      procesion: 'los que la buscaron',
      espejo: 'el espejo de la sala',
    };
    return map[id] ?? '';
  }

  showPolaroid(url: string) {
    const el = this.polaroidEl;
    el.innerHTML = `<img src="${url}" style="width:100%;display:block;filter:brightness(0) sepia(1);transition:filter 2.4s ease-out"/>`;
    el.style.opacity = '1';
    el.style.transform = 'rotate(3deg) translateY(0)';
    const img = el.querySelector('img') as HTMLImageElement;
    requestAnimationFrame(() => requestAnimationFrame(() => (img.style.filter = 'brightness(1) sepia(0.3)')));
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'rotate(3deg) translateY(30px)';
    }, 4200);
  }

  // ======================================================================= RAIN
  private setupRain() {
    const n = 1400;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 6);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x8a9ab0, transparent: true, opacity: 0.35, depthWrite: false }));
    rain.frustumCulled = false;
    rain.visible = false;
    const seeds = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      seeds[i * 3] = (Math.random() - 0.5) * 30;
      seeds[i * 3 + 1] = Math.random() * 14;
      seeds[i * 3 + 2] = (Math.random() - 0.5) * 30;
    }
    rain.userData.seeds = seeds;
    this.g.engine.scene.add(rain);
    this.rain = rain;
  }

  private updateRain(dt: number) {
    const r = this.rain!;
    r.visible = this.rainOn && !this.g.zone?.indoor && this.g.zoneName !== 'arcade' && this.g.zoneName !== 'kiosk';
    if (!r.visible) return;
    const s = r.userData.seeds as Float32Array;
    const pos = (r.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const c = this.g.engine.camera.position;
    const n = s.length / 3;
    for (let i = 0; i < n; i++) {
      s[i * 3 + 1] -= dt * 14;
      if (s[i * 3 + 1] < 0) s[i * 3 + 1] += 14;
      const x = c.x + s[i * 3], y = c.y - 4 + s[i * 3 + 1], z = c.z + s[i * 3 + 2];
      pos[i * 6] = x;
      pos[i * 6 + 1] = y;
      pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x + 0.03;
      pos[i * 6 + 4] = y + 0.35;
      pos[i * 6 + 5] = z;
    }
    r.geometry.attributes.position.needsUpdate = true;
  }

  lightning() {
    const g = this.g;
    this.flashTimer = 0.5;
    g.tasks.run(async () => {
      await g.wait(0.6 + Math.random() * 1.8);
      g.sfx(Math.random() < 0.5 ? 'thunder_1' : 'thunder_2', undefined, 0.55, { reverb: 0.4 });
    });
  }

  // ======================================================================= STAGE STATE
  setStage(s: number) {
    this.stage = s;
    this.applyWorld();
  }

  private lampsOf(group: string) {
    return this.g.world.lights.lamps.filter((l) => l.group === group);
  }

  /** Put the world into the visual/audio state of the current stage (idempotent). */
  applyWorld() {
    const g = this.g;
    const s = this.stage;
    const L = g.world.lights;
    const setAll = (group: string, on: boolean, fl?: import('../world/lights').Flicker) => this.lampsOf(group).forEach((l) => {
      L.setOn(l, on);
      if (fl) l.flicker = fl;
    });
    const night = s >= S.MIDNIGHT && s < S.DAWN;
    const climaxDark = s === S.CLIMAX;
    // NPCs
    this.npcs.forEach((n) => n.setVisible(s === S.PROLOGUE));
    // barriers
    g.streets.forEach((st) => {
      st.barrier.visible = s === S.PROLOGUE;
      st.barrierCols.forEach((c) => (c.enabled = s === S.PROLOGUE));
    });
    // lamps
    const garden = this.lampsOf('garden');
    garden.forEach((l, i) => {
      L.setOn(l, !climaxDark && s !== S.DAWN);
      l.flicker = s === S.PROLOGUE ? (i % 7 === 3 ? 'faulty' : 'none') : s >= S.HOUSE && s < S.CLIMAX_RUN ? (i % 3 === 0 ? 'dying' : i % 4 === 1 ? 'faulty' : 'none') : i % 5 === 2 ? 'faulty' : 'none';
      if (night && s >= S.HOUSE && s < S.CLIMAX_RUN && i % 5 === 4) L.setOn(l, false);
    });
    this.lampsOf('facade').forEach((l, i) => L.setOn(l, s === S.PROLOGUE || s === S.CLIMAX_RUN || (night && !climaxDark && i % (s >= S.HOUSE ? 3 : 2) === 0)));
    setAll('atrium', !climaxDark && s !== S.DAWN);
    setAll('kiosk', s === S.PROLOGUE || (s >= S.KIOSK && s !== S.CLIMAX && s !== S.DAWN));
    setAll('stalls', s === S.PROLOGUE || s === S.CLIMAX_RUN);
    const marketDark = s >= S.TOWER && (this.flags.marketDark || s >= S.GEARS);
    setAll('arcade', (s === S.PROLOGUE || (night && !marketDark && !climaxDark) || s === S.CLIMAX_RUN), s === S.PROLOGUE ? 'none' : undefined);
    setAll('shops', s === S.PROLOGUE);
    setAll('cantina', s === S.PROLOGUE);
    setAll('marketHall', s <= S.CANDLES && s !== S.PROLOGUE ? true : s === S.PROLOGUE);
    setAll('market', !marketDark && !climaxDark && s !== S.DAWN);
    setAll('church', s >= S.MIDNIGHT && s !== S.DAWN);
    setAll('churchFill', s >= S.MIDNIGHT);
    setAll('tower', s >= S.CANDLES && s !== S.DAWN);
    setAll('callejon', s !== S.DAWN && !climaxDark);
    setAll('house', s >= S.KIOSK && !this.radioEventDone && s < S.CLIMAX);
    setAll('lucy', this.flags.lucyRoom && s < S.CLIMAX);
    setAll('secret', !!this.flags.wardrobeMoved);
    setAll('street', s !== S.DAWN && !climaxDark);
    setAll('stageLights', s === S.PROLOGUE || s === S.CLIMAX_RUN);
    setAll('reloj', s >= S.TOWER && s < S.GEARS);
    L.setOn(L.get('flashProp')!, s >= S.MIDNIGHT && !this.flags.guardLight && s < S.DAWN);
    g.stage.parLights.forEach((p) => (p.visible = s === S.PROLOGUE || s === S.CLIMAX_RUN));
    // string lights: prologue colorful, climax_run red
    const sl = g.plaza.stringLights[0];
    const base = (sl as any).baseColors as THREE.Color[];
    for (let i = 0; i < sl.count; i++) {
      let c: THREE.Color;
      if (s === S.PROLOGUE) c = base[i];
      else if (s === S.CLIMAX_RUN) c = base[i].clone().lerp(new THREE.Color(1.6, 0.9, 0.5), 0.5);
      else if (s === S.CLIMAX) c = i % 5 === 0 ? new THREE.Color(1.4, 0.1, 0.1) : new THREE.Color(0, 0, 0);
      else c = i % 9 === 0 ? base[i].clone().multiplyScalar(0.4) : new THREE.Color(0.02, 0.02, 0.02);
      sl.setColorAt(i, c);
    }
    if (sl.instanceColor) sl.instanceColor.needsUpdate = true;
    // papel picado torn fraction
    const frac = s === S.PROLOGUE || s === S.DAWN ? 0 : s < S.HOUSE ? 0.55 : s < S.CLIMAX ? 0.8 : 0.95;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const p of g.plaza.papel) {
      for (let i = 0; i < p.count; i++) p.mesh.setMatrixAt(i, p.torn[i] < frac ? zero : p.base[i]);
      p.mesh.instanceMatrix.needsUpdate = true;
    }
    g.plaza.clueBanners.visible = night && s < S.CLIMAX;
    // fountain
    const wet = s === S.PROLOGUE || s === S.DAWN || s >= S.CLIMAX;
    g.plaza.fountainJets.visible = s === S.PROLOGUE || s === S.DAWN;
    g.plaza.fountainWater.position.y = wet ? 0.62 : 0.3;
    g.plaza.fountainWater.visible = wet || s < S.HOUSE;
    g.plaza.candlesFountain.visible = s === S.CLIMAX;
    // organillo, flowers, statue, rebozo
    g.plaza.organillo.visible = night;
    this.kioskFlowers.visible = s >= S.KIOSK && s < S.DAWN;
    g.plaza.flowers.visible = s < S.HOUSE || s === S.DAWN;
    g.plaza.deadFlowers.visible = !g.plaza.flowers.visible;
    if (g.plaza.monument) g.plaza.monument.rotation.y = s >= S.HOUSE && s < S.DAWN ? Math.atan2(-22, -45) : Math.PI;
    this.chayoRebozo.visible = night;
    this.ghostFigures!.visible = s === S.CLIMAX;
    g.stage.ghostBand.visible = false;
    // tree foliage thins
    const tf = g.plaza.treeFoliage;
    if (tf) {
      const mats = (tf as any).baseMatrices as THREE.Matrix4[];
      mats.forEach((m, i) => tf.setMatrixAt(i, s >= S.TOWER && s < S.DAWN && (i * 7919) % 100 < 35 ? zero : m));
      tf.instanceMatrix.needsUpdate = true;
    }
    // flashlight prop
    this.flashProp.visible = s >= S.MIDNIGHT && !this.flags.guardLight && s < S.DAWN;
    (this.flashProp.userData.beam as THREE.Mesh).visible = this.flashProp.visible;
    // doors
    const door = (id: string) => g.world.doors.find((d) => d.id === id)!;
    for (const id of ['churchL', 'churchR']) {
      const d = door(id);
      d.locked = s === S.PROLOGUE;
      d.lockedMsg = 'El templo está cerrado. Abren a las seis para la misa de la Candelaria.';
      d.setOpen(s >= S.MIDNIGHT && !(s === S.GEARS && this.flags.churchSealed), true);
    }
    const tower = door('tower');
    tower.locked = s < S.CANDLES;
    tower.setOpen(s >= S.CANDLES && s !== S.DAWN, true);
    for (const id of ['gateL', 'gateR']) {
      const d = door(id);
      d.locked = s < S.KIOSK;
      d.lockedMsg = s === S.PROLOGUE ? 'El portón del callejón está cerrado con cadena. Un letrero: «Propiedad privada».' : 'El portón del callejón está cerrado con cadena.';
      d.setOpen(s >= S.KIOSK, true);
    }
    const casa = door('casa');
    casa.locked = s < S.KIOSK;
    if (s >= S.HOUSE) casa.setOpen(true, true);
    // lucía's room
    this.setLucyRoom(!!this.flags.lucyRoom);
    // wardrobe
    this.setWardrobe(!!this.flags.wardrobeMoved);
    // candles
    g.church.candelabrum.candles.forEach((c, i) => {
      c.flame.visible = this.flags.candlesSolved ? true : this.candleLit[i];
      c.lit = c.flame.visible;
    });
    // church extension handled per-frame
    // signs
    this.applySigns(s >= S.HOUSE && s < S.DAWN);
    // family photo
    drawFamilyPhoto(g.house.familyPhoto.canvas, this.radioEventDone && s < S.DAWN);
    g.house.familyPhoto.tex.needsUpdate = true;
    // gears
    this.gearMeshes.forEach((m) => (m.visible = !!this.flags.gearsPlaced));
    const mech = g.world.interactables.find((x) => x.id === 'mecanismo');
    if (mech) mech.hold = this.flags.gearsPlaced && !this.flags.mechanismWound ? 2.5 : undefined;
    // entity
    if (s < S.TOWER || s === S.GEARS || s === S.MECHANISM || s === S.DAWN) g.entity.hide();
    // sky / weather / fog
    const sky = g.sky.uniforms;
    // colour grade per chapter: warm fair → cold and drained after midnight → red at the climax
    const gu = g.engine.grade.uniforms;
    const night2 = s >= S.MIDNIGHT && s < S.DAWN;
    gu.desat.value = s === S.PROLOGUE ? 0.05 : s === S.DAWN ? 0.1 : s >= S.CLIMAX ? 0.25 : 0.38;
    gu.vignette.value = s === S.PROLOGUE || s === S.DAWN ? 0.3 : 0.62;
    gu.grain.value = night2 ? 0.06 : 0.035;
    gu.aberr.value = night2 ? 0.35 : 0;
    gu.tint.value.set(...((s === S.CLIMAX || s === S.CLIMAX_RUN ? [1.08, 0.9, 0.88] : night2 ? [0.9, 0.97, 1.06] : s === S.DAWN ? [1.05, 1.0, 0.95] : [1.04, 0.99, 0.94]) as [number, number, number]));
    sky.uStorm.value = s === S.PROLOGUE ? 0.15 : s < S.TOWER ? 0.35 : s < S.CLIMAX_RUN ? 0.85 : s === S.CLIMAX_RUN ? 0.6 : 0;
    sky.uRed.value = s === S.CLIMAX || s === S.CLIMAX_RUN ? 0.9 : 0;
    this.dawnTarget = s === S.DAWN ? 1 : s === S.CLIMAX_RUN ? 0.15 : 0;
    if (s !== S.DAWN) this.dawn = Math.min(this.dawn, this.dawnTarget);
    this.rainOn = s >= S.TOWER && s <= S.CLIMAX;
    g.fogTarget = [0.011, 0.016, 0.018, 0.021, 0.022, 0.026, 0.026, 0.024, 0.032, 0.024, 0.006][s];
    g.fogColor.set(s === S.CLIMAX ? 0x1a0c0e : s === S.DAWN ? 0xb8a8a0 : 0x0b1018);
    g.mats.uniforms.uWind.value = s === S.PROLOGUE ? 0.35 : s === S.DAWN ? 0.3 : s >= S.TOWER ? 1.25 : 0.85;
    g.world.lights.globalLevel = 1;
    // ambience & music
    const a = g.amb;
    a.enabled = true;
    a.profile = s === S.PROLOGUE ? 'prologue' : s === S.DAWN ? 'silent' : s === S.CLIMAX ? 'climax' : s >= S.TOWER ? 'storm' : 'night';
    a.set('crowd', s === S.PROLOGUE ? 1 : 0);
    a.set('traffic', s === S.PROLOGUE || s === S.DAWN ? 1 : 0);
    a.set('crickets', s === S.PROLOGUE ? 1 : s === S.DAWN ? 0 : 0.35);
    a.set('wind', s === S.DAWN ? 0.3 : 1);
    a.set('windStrong', s >= S.TOWER && s <= S.CLIMAX_RUN ? 1 : 0);
    a.set('fountain', wet && s !== S.CLIMAX ? 1 : 0);
    a.set('flags', s === S.DAWN ? 0.3 : 1);
    a.set('hum', s !== S.DAWN && !climaxDark ? 1 : 0);
    a.set('hum2', s >= S.MIDNIGHT && s < S.TOWER ? 1 : 0);
    a.set('rain', this.rainOn ? 1 : 0);
    a.set('static', s >= S.MIDNIGHT && s < S.DAWN ? 1 : 0);
    a.set('clocks', s >= S.MIDNIGHT && s < S.DAWN ? 1 : 0);
    const mu = g.music;
    mu.set('plaza', s === S.PROLOGUE ? 0.35 : 0, 3);
    mu.set('cantina', s === S.PROLOGUE ? 0.9 : 0, 1);
    mu.setPosition('cantina', g.market.cantinaPos);
    mu.set('musician', s === S.PROLOGUE ? 0.85 : 0, 1);
    mu.setPosition('musician', g.stage.musicianSpot.clone().setY(2));
    mu.set('horror', s >= S.MIDNIGHT && s < S.DAWN ? (s >= S.TOWER ? 0.85 : 0.6) : 0, 6);
    mu.set('explore', s >= S.MIDNIGHT && s < S.CLIMAX ? (s >= S.TOWER ? 0.35 : 0.7) : 0, 6);
    mu.set('danger', s >= S.TOWER && s < S.DAWN ? 1 : 0, 3);
    mu.set('ghostband', s === S.CLIMAX ? 0.8 : 0, 3);
    mu.setPosition('ghostband', V(44, 3, 0));
    mu.set('final', s === S.DAWN ? 0.8 : 0, 5);
    // clocks
    if (s === S.PROLOGUE) setClock(g.town.presidenciaClock, 23, 40);
    // HUD
    g.ui.film(g.hasCamera ? g.film : null);
  }

  private applySigns(alt: boolean) {
    const g = this.g;
    for (const [name, sgn] of Object.entries(g.market.signs)) {
      if (sgn.alt === name) continue;
      const mat = sgn.mesh.material as THREE.MeshStandardMaterial;
      if (!sgn.mesh.userData.orig) sgn.mesh.userData.orig = mat.map;
      const want = alt ? (sgn.mesh.userData.altTex ??= signTexture(sgn.alt, { w: 1024, h: 156, bg: '#1a1412', fg: '#b8a888', aged: 1, border: '#6a5a48' })) : sgn.mesh.userData.orig;
      if (mat.map !== want) {
        mat.map = want;
        mat.emissiveMap = want;
        mat.needsUpdate = true;
      }
    }
  }

  private setLucyRoom(on: boolean) {
    const h = this.g.house;
    h.lucyWall.children.forEach((c) => (c.visible = !on));
    (h.lucyWall.userData.doorVersion as THREE.Group).visible = on;
    h.lucyWallCollider.enabled = !on;
    (h.lucyWall.userData.doorCols as import('../world/colliders').Collider[]).forEach((c) => (c.enabled = on));
    h.lucyDoor.collider.enabled = on;
    h.lucyRoom.visible = on;
    h.candleDrawing.visible = on;
    h.cameraProp.visible = on && !this.g.hasCamera;
  }

  private setWardrobe(moved: boolean) {
    const h = this.g.house;
    h.wardrobe.position.z = moved ? -70.6 : -72;
    h.wardrobeCollider.min.z = (moved ? -70.6 : -72) - 1.0;
    h.wardrobeCollider.max.z = (moved ? -70.6 : -72) + 1.0;
  }

  // ======================================================================= NEW GAME / CHECKPOINTS
  newGame() {
    const g = this.g;
    this.resetState();
    g.player.teleport(V(12.5, 0.15, 20.5), 0.55);
    this.setStage(S.PROLOGUE);
    this.saveCheckpoint(V(12.5, 0.15, 20.5), 0.55);
    g.tasks.run(() => this.prologue());
  }

  private resetState() {
    const g = this.g;
    this.flags = {};
    this.stage = 0;
    this.clockMin = 23 * 60 + 52;
    this.hintsShown.clear();
    this.currentObjective = null;
    this.objectiveLog = [];
    this.objectiveTarget = null;
    this.events.clear();
    this.prologueDoneTalk.clear();
    this.candleLit = [false, false, false, false, false, false, false];
    this.radioEventDone = false;
    this.loopCount = 0;
    this.bellSeq = [];
    this.dawn = 0;
    this.deaths = 0;
    this.lockMove = false;
    this.scriptedChase = false;
    g.inventory = ['telefono', 'linterna'];
    g.docs = [];
    g.photos = [];
    g.film = 0;
    g.hasCamera = false;
    g.hasFlashlight = true;
    g.flashOn = false;
    g.battery = 1;
    g.spares = 0;
    g.playTime = 0;
    g.photoTargets.forEach((t) => (t.done = false));
    g.house.ribbon.visible = true;
    this.npcs.forEach((n) => {
      n.pos.copy(n.def.pos);
      n.yaw = n.def.yaw;
      n.pathIdx = 0;
      n.talkIdx = 0;
      n.talking = false;
      n.play(n.def.anim, 0);
    });
    this.npc.pareja1.busy = this.npc.pareja2.busy = true;
    g.market.shutterPanaderia.scale.y = 0.08;
    g.market.shutterPanaderia.position.y = 0.15 + 2.85 / 2 + 2.6;
    this.lucia?.setVisible(false);
    this.refugio?.setVisible(false);
    if (this.taxi) this.taxi.visible = false;
    if (this.procession) this.procession.visible = false;
    if (this.cat) this.cat.obj.visible = false;
    g.entity.hide();
    g.church.extGroup.visible = false;
    g.church.backWallGroup.visible = true;
    this.setExtension(false);
    g.ui.objective(null);
    g.music.set('final', 0, 0.1);
    this.flags.extension = false;
  }

  private snapshot(pos: THREE.Vector3, yaw: number): Snapshot {
    const g = this.g;
    return {
      stage: this.stage,
      flags: JSON.parse(JSON.stringify(this.flags)),
      inventory: [...g.inventory],
      docs: g.docs.map((d) => d.id),
      film: g.film,
      battery: g.battery,
      spares: g.spares,
      hasFlashlight: g.hasFlashlight,
      hasCamera: g.hasCamera,
      pos: [pos.x, pos.y, pos.z],
      yaw,
      playTime: g.playTime,
      deaths: this.deaths,
      photos: g.photos.slice(-10),
      candles: [...this.candleLit],
    };
  }

  saveCheckpoint(pos: THREE.Vector3, yaw: number) {
    this.checkpoint = this.snapshot(pos, yaw);
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.checkpoint));
    } catch {
      try {
        const c = { ...this.checkpoint, photos: [] };
        localStorage.setItem(SAVE_KEY, JSON.stringify(c));
      } catch {
        /* ignore */
      }
    }
    if (this.stage > 0) this.g.ui.toast('', 'Guardando', 2);
  }

  hasSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw) as Snapshot;
      return s.stage > 0 && s.stage < S.DAWN;
    } catch {
      return false;
    }
  }
  clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  }
  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) this.checkpoint = JSON.parse(raw);
    } catch {
      this.checkpoint = null;
    }
    if (!this.checkpoint) return this.newGame();
    this.restoreCheckpoint();
  }

  restoreCheckpoint() {
    const g = this.g;
    const cp = this.checkpoint;
    if (!cp) return this.newGame();
    const deaths = this.deaths + (g.state === 'playing' ? 0 : 0);
    this.resetState();
    this.deaths = Math.max(deaths, cp.deaths) + 1;
    this.flags = JSON.parse(JSON.stringify(cp.flags));
    this.stage = cp.stage;
    g.inventory = [...cp.inventory];
    g.docs = cp.docs.map((id) => this.DOCS[id]).filter(Boolean);
    g.film = cp.film;
    g.battery = Math.max(cp.battery, 0.6);
    g.spares = cp.spares;
    g.hasFlashlight = cp.hasFlashlight;
    g.hasCamera = cp.hasCamera;
    g.playTime = cp.playTime;
    g.photos = cp.photos ?? [];
    this.candleLit = cp.candles ?? this.candleLit;
    this.radioEventDone = !!this.flags.radioEvent;
    if (g.has('liston')) g.house.ribbon.visible = false;
    g.photoTargets.forEach((t) => {
      if (t.id === 'velas' && this.flags.candleClue) t.done = true;
      if (t.id === 'kiosco' && g.has('foto_verbena')) t.done = true;
    });
    if (this.flags.extension) this.setExtension(true);
    this.clockMin = 24 * 60;
    this.applyWorld();
    const p = V(cp.pos[0], cp.pos[1], cp.pos[2]);
    g.player.teleport(p, cp.yaw);
    g.ui.clock('12:00 a.m.', true);
    g.ui.battery(g.hasFlashlight ? g.battery : null);
    // resume the current chapter
    g.tasks.run(() => this.resumeStage());
  }

  private async resumeStage() {
    const g = this.g;
    const s = this.stage;
    if (s === S.MIDNIGHT) {
      this.objective(this.flags.loopFound ? 'Algo no te deja salir. La iglesia está abierta.' : 'Sal de la plaza.');
      if (this.flags.confessed) this.objective('Examina el organillo del kiosco.');
    } else if (s === S.KIOSK) this.objective(this.flags.inHouse ? 'Explora la casa.' : 'Sigue a la niña al callejón.');
    else if (s === S.HOUSE) this.objective('Enciende las velas del candelabro de la iglesia como en el dibujo.');
    else if (s === S.CANDLES) this.objective('Sube al campanario.');
    else if (s === S.TOWER) {
      this.objective('Busca los engranes en la relojería del mercado.');
      if (this.flags.marketDark) this.startMarketHunt();
    } else if (s === S.GEARS) this.objective('Repara el mecanismo del campanario.');
    else if (s === S.MECHANISM) this.objective('Toca el alba: sigue la inscripción.');
    else if (s === S.CLIMAX) {
      g.battery = 1;
      this.startClimaxHunt();
      this.objective(this.flags.generatorOn ? 'Sube los interruptores del tablero eléctrico.' : 'Arranca la planta de luz del escenario.');
      // a checkpoint must stay winnable: at least 3 minutes to dawn
      this.climaxDeadline = g.tasks.time + Math.max(180, this.flags.climaxLeft ?? 420);
    } else if (s === S.CLIMAX_RUN) {
      this.climaxDeadline = g.tasks.time + Math.max(150, this.flags.climaxLeft ?? 150);
      this.objective('¡Toca el alba en el campanario!');
      this.startFinalChase();
    }
  }

  // ======================================================================= PROLOGUE
  private async prologue() {
    const g = this.g;
    g.ui.clock('11:52 p.m.');
    await g.wait(1.5);
    g.phone.signal(true);
    g.phone.message('Tu conductor · Roberto', 'Llego a las <b>12:05</b>. Te espero en la calle Nieto, lado sur del jardín.', { dur: 6 });
    await g.wait(1.2);
    this.objective('Espera tu taxi (12:05). Puedes dar una vuelta por el jardín.');
    g.ui.hint('<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> caminar · <kbd>Ratón</kbd> mirar · <kbd>F</kbd> linterna', 8);
    await g.think('Otra vez salí tardísimo. Al menos la plaza está bonita… mañana es la Candelaria.');
    await g.wait(8);
    g.ui.hint('<kbd>Shift</kbd> correr · <kbd>C</kbd> agacharse', 5);
    // wait for 11:47
    await g.until(() => this.clockMin >= 23 * 60 + 54);
    // a call from an unknown number: a child's voice
    const answered = await g.call('Número desconocido', [
      ['Voz de niña', '¿Julián? ¿Ya vienes?', 'radioLucia'],
      ['Voz de niña', 'Te estoy esperando en el kiosco. Como me dijiste.', 'radioLucia'],
    ], { hint: true });
    if (answered) {
      g.sfx('loop_radio_static', undefined, 0.25);
      await g.think('¿Qué…? Colgaron.');
      await g.think('Esa voz… no. Número equivocado. Tiene que ser.');
    } else {
      g.phone.message('Número desconocido', '¿Ya vienes, Julián? Tu hermana te está esperando en el kiosco.', { bad: true, dur: 7 });
      await g.wait(2.5);
      await g.think('¿Mi hermana…? Número equivocado. Tiene que ser.');
    }
    await g.until(() => this.clockMin >= 23 * 60 + 55);
    // panadero closes
    this.closeBakery();
    await g.until(() => this.clockMin >= 23 * 60 + 56);
    this.npc.pareja1.busy = this.npc.pareja2.busy = false;
    // the girl on the kiosk steps (sighting)
    this.flags.girlShow = true;
    await g.until(() => this.clockMin >= 23 * 60 + 59);
    this.flags.girlShow = false;
    this.lucia?.setVisible(false);
    await g.think('Casi medianoche. Van a tocar las campanas.');
    await g.until(() => this.clockMin >= 24 * 60);
    await this.midnight();
  }

  private closeBakery() {
    const g = this.g;
    const sh = g.market.shutterPanaderia;
    const n = this.npc.panadero;
    n.play('interact');
    g.sfx('metal_shutter', V(-34, 2.5, -16), 0.6, { ref: 4 });
    let t = 0;
    const up = () => {
      t += 0.016;
      const k = Math.min(1, t / 3);
      sh.scale.y = 0.08 + 0.92 * k;
      sh.position.y = 0.15 + 2.85 / 2 + 2.6 * (1 - k) - 0 * k;
      if (k < 1) requestAnimationFrame(up);
      else n.play('idle');
    };
    up();
    g.world.lights.setOn(g.world.lights.get('panaderia')!, false);
    if (g.player.pos.distanceTo(n.pos) < 18) g.tasks.run(() => g.say(n.def.name, '¡Ya cerramos, joven! Mañana hay tamales pa\' la fiesta. Buenas noches.', 'panadero', n.pos.clone().setY(1.6)));
  }

  private async talk(id: string) {
    const g = this.g;
    const n = this.npc[id];
    n.talking = true;
    n.greet();
    g.convo = 'npc';
    g.ui.letterbox(true);
    const p = n.pos.clone().setY(n.pos.y + 1.6);
    g.player.lookOverride = { target: n.pos.clone().setY(n.pos.y + (n.baseAnim === 'sitting' ? 1.0 : 1.55)), strength: 5 };
    setTimeout(() => (g.player.lookOverride = null), 450);
    const who = n.def.name;
    const v = n.def.voice;
    const k = n.talkIdx++;
    try {
      if (id === 'beto') {
        if (k === 0) {
          await g.say(who, '¡Buenas noches, joven! Ya estoy guardando, pero me queda un tamalito de rajas, recién salido. ¿Gusta?', v, p);
          await g.say('Julián', 'Gracias, don. ¿Cuánto le debo?', 'julian');
          g.sfx('cloth_rustle', p, 0.5);
          g.give('tamal');
          await g.say(who, 'Nada, nada. Ándele, que está haciendo frío. Y llévese estos cerillos, pa’ que se alumbre…', v, p);
          g.give('cerillos');
          await g.say(who, '…que en esta plaza, de repente, se va la luz.', v, p);
          g.ui.hint('<kbd>Tab</kbd> inventario', 4);
        } else if (k === 1) {
          await g.say(who, 'Mañana es la Candelaria. Tamales pa\' todo el barrio.', v, p);
          await g.say(who, 'Oiga… ¿usted no es el muchacho de los Arriaga? Tiene la mismita cara de su mamá, que en paz descanse.', v, p);
          await g.say('Julián', 'No. Se equivoca.', 'julian');
        } else await g.say(who, 'Van a volver a tocar las campanas a medianoche. Veinte años sin que suenen. Yo, la verdad… preferiría que no.', v, p);
      } else if (id === 'chayo') {
        n.lookAtPlayer = 3;
        if (k === 0) {
          await g.say(who, '¿Usted también espera a alguien, mijo? Yo aquí espero a mi viejo, que siempre se tarda en la cantina.', v, p);
        } else if (k === 1) {
          await g.say(who, '¿Ve aquel reloj de la iglesia? Se paró hace veinte años. Las doce y trece. Nadie lo ha querido componer.', v, p);
        } else {
          await g.say(who, 'Esa noche también había verbena. Se fue la luz y una niña… no, no. Perdóneme. Son cosas de viejas.', v, p);
        }
      } else if (id === 'chuy') {
        if (k === 0) await g.say(who, 'Ando ensayando, joven. Mañana tocamos con Los Faroles, aquí mismo.', v, p);
        else if (k === 1) await g.say(who, 'Esta canción me la pidió una niña, hace mucho, en una prueba de sonido. La cajita de música del kiosco tocaba la misma.', v, p);
        else await g.say(who, 'Si va a esperar, quédese donde haya luz. De noche esta plaza se pone rara.', v, p);
      } else if (id === 'chema') {
        n.busy = true;
        if (k === 0) await g.say(who, 'Buenas noches. Las calles están cerradas por la verbena. Si espera taxi, que lo recojan en la Nieto, del lado sur.', v, p);
        else if (k === 1) await g.say(who, 'Cuando den las campanadas apago lo del escenario, que la instalación está vieja. La otra vez se botó todo.', v, p);
        else await g.say(who, 'Váyase a su casa en cuanto pueda, joven. Esta noche no es buena para andar solo.', v, p);
        n.busy = false;
      } else if (id === 'panadero') {
        await g.say(who, k === 0 ? 'Ya mero cierro, joven. Si quiere conchas, mañana temprano.' : 'Buenas noches. Cuídese.', v, p);
      } else if (id === 'lupe') {
        await g.say(who, k === 0 ? 'Ya no hay pozole, mijo, ya se acabó. Vuelva mañana, que va a haber enchiladas pa\' la fiesta.' : 'Ándele, que ya van a dar las doce.', v, p);
      } else if (id === 'compa1') {
        await g.say('Parroquiano', k === 0 ? '¿Qué pasó, joven? ¿Se echa una con nosotros? …¿No? Ni modo.' : '¿Te acuerdas de la verbena del seis, compadre? Cuando se fue la luz…', 'vecino', p);
        if (k > 0) await g.say('Parroquiano', 'No hables de eso. Salud.', 'vecino', this.npc.compa2.pos.clone().setY(1.7));
      }
    } finally {
      n.talking = false;
      if (g.convo === 'npc') g.convo = null;
      g.ui.letterbox(false);
      this.prologueDoneTalk.add(id);
    }
  }

  // ======================================================================= MIDNIGHT
  private async midnight() {
    const g = this.g;
    this.flags.midnightStarted = true;
    g.ui.clock('12:00 a.m.');
    this.objective(null);
    const towerTop = V(-11.25, 21, -39.25);
    this.npcs.forEach((n) => (n.lookAtPlayer = 0));
    for (let i = 1; i <= 12; i++) {
      g.sfx('bell_church', towerTop, 1.0, { ref: 18, rolloff: 0.6, reverb: 0.5 });
      g.player.camShake = Math.max(g.player.camShake, 0.08);
      if (i === 2) g.think('Las campanas… después de veinte años.');
      if (i === 6) {
        this.npcs.forEach((n) => (n.busy = true));
        g.music.set('cantina', 0.5, 2);
      }
      if (i >= 7) {
        g.world.lights.lamps.forEach((l) => {
          if (l.group !== 'church') l.flicker = 'faulty';
        });
      }
      if (i === 9) {
        g.music.tapeStop('cantina');
        g.music.tapeStop('musician');
        g.music.set('plaza', 0, 1.5);
      }
      if (i === 10) g.amb.set('crowd', 0.3);
      await g.wait(i === 12 ? 1.2 : 2.6);
    }
    // blackout
    g.sfx('power_down', undefined, 0.8);
    g.world.lights.globalLevel = 0;
    g.sky.moon.intensity = 0.05;
    const hemiI = g.sky.hemi.intensity;
    g.sky.hemi.intensity = 0.06;
    g.engine.grade.uniforms.blackout.value = 0.55;
    g.amb.stopAll();
    g.amb.enabled = false;
    g.audio.duck(0.25, 0.3);
    await g.wait(1.5);
    this.setStage(S.MIDNIGHT);
    g.world.lights.globalLevel = 0;
    g.amb.enabled = false;
    g.amb.set('wind', 1);
    g.audio.duck(1, 2);
    await g.wait(1.0);
    g.sfx('whisper_2', g.player.pos.clone().add(V(1.5, 1.6, -1)), 0.5);
    await g.wait(2.0);
    g.sfx('power_up', undefined, 0.6);
    // between two flickers a tall figure stands a few metres ahead… then it's gone
    const fwd = g.player.forward;
    const fig = g.player.pos.clone().addScaledVector(fwd, 5.5);
    const figOk = g.nav.walkable(fig.x, fig.z) && !g.world.col.blocked(g.player.eyePos, fig.clone().setY(1.6));
    let k = 0;
    for (let i = 0; i < 12; i++) {
      k = i === 4 || i === 5 ? 1 : i === 6 ? 0 : Math.random();
      g.world.lights.globalLevel = k > 0.5 ? 1 : 0.1;
      if (figOk && i === 4) {
        g.entity.place(fig, Math.atan2(-fwd.x, -fwd.z));
        g.entity.setState('inactive');
      }
      if (figOk && i === 6) {
        g.entity.hide();
        g.sfx('stinger_low', undefined, 0.7);
        g.player.camShake = 0.5;
      }
      await g.wait(i === 4 || i === 5 ? 0.22 : 0.07 + Math.random() * 0.1);
    }
    g.world.lights.globalLevel = 1;
    g.engine.grade.uniforms.blackout.value = 0;
    g.sky.hemi.intensity = hemiI;
    this.applyWorld();
    this.clockMin = 24 * 60;
    g.ui.clock('12:00 a.m.', true);
    await g.wait(0.8);
    await g.think('¿Qué…? ¿Dónde están todos?');
    g.sfx('dog_howl', V(g.player.pos.x + 40, 3, g.player.pos.z - 30), 0.4, { ref: 10 });
    await g.think('Hace un segundo había gente. Música. Don Beto…');
    this.objective('¿Dónde se fueron todos?');
    this.saveCheckpoint(g.player.pos.clone(), g.player.yaw);
    await g.wait(3);
    g.phone.signal(false);
    g.phone.message('Teléfono', 'Sin servicio. Solo llamadas de emergencia.', { bad: true, dur: 3.5 });
    await g.wait(2);
    await g.think('Allá, junto a la fuente. Una luz en el suelo.');
    g.ui.hint('<kbd>F</kbd> enciende tu linterna en los lugares oscuros', 5);
    await g.until(() => this.flags.guardLight || this.flags.loopFound, 40);
    if (!this.flags.loopFound && !this.flags.visitedChurch) this.objective('Sal de la plaza.');
    await g.until(() => this.flags.loopFound || this.zoneIs('church'), 240);
    if (!this.flags.loopFound && !this.zoneIs('church') && !this.flags.visitedChurch) this.objective('Algo no te deja salir. La iglesia está abierta.');
  }

  private pickFlashlight() {
    const g = this.g;
    this.flags.guardLight = true;
    g.spares += 2;
    g.give('pilas', true);
    g.give('pilas');
    this.flashProp.visible = false;
    (this.flashProp.userData.beam as THREE.Mesh).visible = false;
    g.world.lights.setOn(g.world.lights.get('flashProp')!, false);
    g.sfx('flashlight_click', undefined, 0.6);
    g.ui.hint('Pilas de repuesto: se cambian solas cuando la linterna se agota.', 6);
    g.tasks.run(async () => {
      await g.wait(0.6);
      await g.think('La linterna de Don Chema. Todavía estaba prendida… apuntando a la iglesia. Me quedo con sus pilas.');
      if (!this.flags.loopFound && !this.flags.visitedChurch) this.objective('Sal de la plaza. Tu taxi… ya no importa.');
    });
  }

  // ======================================================================= LOOP
  private checkLoop() {
    const g = this.g;
    if (this.stage < S.MIDNIGHT || this.stage >= S.DAWN) return;
    if (g.tasks.time - this.lastTeleport < 0.5) return;
    const p = g.player.pos;
    for (let i = 0; i < g.streets.length; i++) {
      const st = g.streets[i];
      const l = toLocal(st, p);
      if (Math.abs(l.x) < 3.3 && l.s > LOOP_D && l.s < LOOP_D + 4) {
        const next = g.streets[(i + 1) % g.streets.length];
        const ns = 2 * LOOP_D - l.s;
        const np = toWorld(next, ns, -l.x, p.y);
        // rotation mapping: dA -> -dB
        const angA = Math.atan2(st.dir.x, st.dir.z);
        const angB = Math.atan2(-next.dir.x, -next.dir.z);
        const dRot = angB - angA;
        g.player.pos.copy(np);
        g.player.yaw += dRot;
        const v = g.player.vel;
        const c = Math.cos(dRot), s = Math.sin(dRot);
        const vx = v.x * c + v.z * s, vz = -v.x * s + v.z * c;
        v.x = vx;
        v.z = vz;
        g.player.syncCamera(0);
        g.afterTeleport();
        this.lastTeleport = g.tasks.time;
        this.onLoop(st, next);
        return;
      }
    }
  }

  private onLoop(from: LoopStreet, to: LoopStreet) {
    const g = this.g;
    this.loopCount++;
    this.flags.loops = this.loopCount;
    g.tasks.run(async () => {
      await g.until(() => {
        const l = toLocal(to, g.player.pos);
        return l.s < 20;
      }, 20);
      if (this.loopCount === 1) {
        this.flags.loopFound = true;
        g.sfx('riser', undefined, 0.35);
        await g.think('No… Esta es la plaza. Otra vez la plaza.');
        await g.think(`Me fui por la ${from.name} y regresé por la ${to.name}.`);
        if (!this.flags.confessed && this.stage === S.MIDNIGHT) this.objective('Algo no te deja salir. La iglesia está abierta.');
      } else if (this.loopCount === 2) await g.think('Otra vez. Todas las calles regresan aquí.');
      else if (this.loopCount === 4) await g.think('Deja de correr, Julián. No hay salida por aquí.');
    });
  }

  /** fog banks down the looping streets: shown only inside the band so both sides of the jump match */
  private updateStreetBanks() {
    const g = this.g;
    const active = this.stage >= S.MIDNIGHT && this.stage < S.DAWN;
    for (const st of g.streets) {
      const l = toLocal(st, g.player.pos);
      const inBand = active && Math.abs(l.x) < 4 && l.s > LOOP_D - 13 && l.s < LOOP_D + 13;
      st.fogBanks.forEach((b) => {
        b.visible = inBand;
        if (inBand) b.children.forEach((m) => ((m as THREE.Mesh).material as THREE.MeshBasicMaterial).color.copy(g.fogColor));
      });
    }
  }

  streetFogBoost() {
    if (this.stage < S.MIDNIGHT || this.stage >= S.DAWN) return 0;
    const z = this.g.zoneName;
    if (!z.startsWith('street:')) return 0;
    const st = this.g.streets[parseInt(z.split(':')[1], 10)];
    const l = toLocal(st, this.g.player.pos);
    return 0.1 * THREE.MathUtils.smoothstep(l.s, 8, 30);
  }

  // ======================================================================= CHURCH
  private zoneIs(...names: string[]) {
    return names.includes(this.g.zoneName);
  }

  private async confessional() {
    const g = this.g;
    const h: HideSpot = { id: 'confesionario', inside: V(5.7, 0.05, -46.4), exit: V(4.5, 0.05, -46.4), yaw: Math.PI / 2, kind: 'confessional', enabled: () => true };
    g.enterHide(h);
    if (this.stage < S.MIDNIGHT) return;
    const n = (this.flags.confessions ?? 0) as number;
    this.flags.confessions = n + 1;
    const rp = V(5.9, 1.5, -47.5);
    const say = (t: string) => g.say('Una voz', t, 'refugio', rp);
    if (n === 0) {
      await g.wait(1.5);
      g.sfx('cloth_rustle', rp, 0.4);
      await say('…Julián.');
      await g.say('Julián', '¿Quién está ahí?', 'julian');
      await say('Veinte años sin que suene el alba. Veinte años de la misma noche.');
      await say('Mientras la noche no termine, nadie sale. Ni tú.');
      await g.say('Julián', '¿Cómo sabe mi nombre?', 'julian');
      await say('La campana del alba no sonó aquella madrugada. Hay que tocarla. Pero la torre no se abre para quien no quiere ver.');
      await say('Ella te esperó en el kiosco. Empieza por ahí.');
      this.flags.confessed = true;
      this.objective('Examina el organillo del kiosco.');
    } else if (this.stage < S.HOUSE) {
      await say('Ella te esperó en el kiosco, Julián. Te esperó toda la noche.');
    } else if (this.stage < S.CANDLES) {
      await say('Las velitas… a ella le gustaba prenderlas conmigo. Siete. Como los días que tardó en volver tu mamá del hospital.');
    } else if (this.stage < S.GEARS) {
      await say('Ya te vio. Si la escuchas, escóndete. Apaga la luz. Ella no ve en lo oscuro… pero oye todo.');
    } else {
      await say('Yo guardé silencio veinte años por ti, muchacho. Ahora toca el alba.');
    }
    await g.wait(0.5);
    if (g.player.hidden?.id === 'confesionario') g.ui.hint('<kbd>E</kbd> salir', 3);
  }

  private toggleCandle(i: number) {
    const g = this.g;
    const c = g.church.candelabrum.candles[i];
    if (!this.candleLit[i] && !g.has('cerillos')) {
      g.think('Necesito con qué encenderla.');
      return;
    }
    this.candleLit[i] = !this.candleLit[i];
    c.flame.visible = this.candleLit[i];
    if (this.candleLit[i]) {
      g.sfx('match_strike', c.pos, 0.6);
      g.sfx('candle_whoosh', c.pos, 0.4, { delay: 0.5 });
    } else g.sfx('candle_whoosh', c.pos, 0.3, { rate: 1.4 });
    if (CANDLE_SOLUTION.every((v, k) => v === this.candleLit[k])) this.onCandlesSolved();
    else if (this.candleLit.filter(Boolean).length >= 4 && !this.flags.candleClue) this.hintOnce('candles', 'Las velas… ¿cómo estaban?', 3);
  }

  private onCandlesSolved() {
    const g = this.g;
    this.flags.candlesSolved = true;
    g.tasks.run(async () => {
      g.church.candelabrum.candles.forEach((c) => {
        c.flame.visible = true;
        c.flame.scale.set(0.1, 0.24, 1);
      });
      g.music.bellNote(62, V(0, 3, -60), 0.5);
      g.music.bellNote(69, V(0, 3, -60), 0.35);
      await g.wait(1.5);
      g.sfx('lock_unlock', V(-7.25, 1.2, -39.4), 0.8, { ref: 6 });
      await g.wait(0.8);
      const tower = g.world.doors.find((d) => d.id === 'tower')!;
      tower.locked = false;
      tower.setOpen(true);
      g.sfx('gate_iron_creak', V(-7.25, 1.2, -39.4), 0.7);
      await g.think('La puerta de la torre… se abrió sola.');
      this.setStage(S.CANDLES);
      this.objective('Sube al campanario.');
      this.saveCheckpoint(V(0, 0.05, -50), Math.PI);
      g.church.candelabrum.candles.forEach((c) => c.flame.scale.set(0.07, 0.15, 1));
    });
  }

  private onTowerLocked() {
    const g = this.g;
    if (this.flags.towerLockedSeen) return;
    this.flags.towerLockedSeen = true;
    g.tasks.run(async () => {
      await g.think('La torre. Por aquí se sube al campanario.');
      if (!this.flags.confessed) await g.think('Alguien se mueve en el confesionario…');
    });
  }

  /** "the church is bigger inside": swap the back wall for the extended nave when inside */
  private setExtension(on: boolean) {
    const c = this.g.church;
    c.extGroup.visible = on;
    c.backWallGroup.visible = !on;
    c.backColliders.forEach((x) => (x.enabled = !on));
    c.extColliders.forEach((x) => (x.enabled = on));
    c.altarGroup.position.z = on ? -20 : 0;
    // altar colliders move with the group: approximate by shifting presbytery collider set
  }

  private updateChurch() {
    const g = this.g;
    if (!this.flags.extension) return;
    const inside = this.zoneIs('church');
    const want = inside;
    if (g.church.extGroup.visible !== want) this.setExtension(want);
  }

  // ======================================================================= KIOSK
  private useOrganillo() {
    const g = this.g;
    if (this.flags.organilloSolved) {
      g.sfx('organ_crank', V(0, 2, 0), 0.5);
      g.music.playOrganillo(V(0, 2, 0), false, 8);
      return;
    }
    if (!this.flags.readOrganNote) {
      this.flags.readOrganNote = true;
      g.read(this.DOCS.nota_organillo);
      g.tasks.run(async () => {
        await g.until(() => g.overlay === null);
        await g.think('«En el cielo de la plaza»… el papel picado. Algunas banderas son distintas.');
        this.hintOnce('organ', 'Busca los papeles picados con figura. Cuenta los agujeritos.', 6);
      });
      return;
    }
    g.sfx('music_box_wind', V(0, 2, 0), 0.5);
    this.puzzles.organillo(() => this.onOrganilloSolved());
  }

  private onOrganilloSolved() {
    const g = this.g;
    this.flags.organilloSolved = true;
    g.tasks.run(async () => {
      g.sfx('organ_crank', V(0, 2, 0), 0.5);
      const dur = g.music.playOrganillo(V(0, 2.3, 0), false, 12);
      g.music.set('horror', 0.2, 3);
      g.world.lights.setGroup('kiosk', true);
      this.kioskFlowers.visible = true;
      await g.wait(4);
      await g.think('La canción de Lucía. La cajita del kiosco la tocaba cada domingo.');
      // Lucía appears on the south steps
      const l = this.lucia!;
      l.pos.set(0.4, 0.15, 7.8);
      l.yaw = Math.PI;
      l.def.path = undefined;
      l.setVisible(true);
      l.play('idle');
      g.sfx('child_laugh', l.pos.clone().setY(1.2), 0.5);
      await g.wait(Math.min(dur - 6, 10));
      // she runs toward the callejón
      l.def.path = [V(-3.5, 0.15, 7.5), V(-8.5, 0.15, 1.2), V(-21, 0.15, 1.2), V(-26, 0, 0), V(-26, 0, -26), V(-22, 0, -32), V(-22, 0, -40)];
      l.def.noWait = true;
      l.def.speed = 3.2;
      l.pathIdx = 0;
      l.waitTime = 0;
      g.sfx('child_run', l.pos.clone().setY(0.5), 0.6);
      this.objective('Sigue a la niña.');
      await g.until(() => l.pathIdx >= 5 || l.pos.distanceTo(V(-22, 0, -32)) < 2, 30);
      g.sfx('chain_rattle', V(-22, 1.5, -31.2), 0.7, { ref: 6 });
      await g.wait(0.8);
      this.setStage(S.KIOSK);
      for (const id of ['gateL', 'gateR']) {
        const d = g.world.doors.find((x) => x.id === id)!;
        d.setOpen(false, true);
        d.locked = false;
        d.setOpen(true);
      }
      g.sfx('gate_iron_creak', V(-22, 1.5, -31.2), 0.8, { ref: 8 });
      await g.until(() => l.pathIdx >= 7, 10);
      l.setVisible(false);
      l.def.path = undefined;
      g.music.set('horror', 0.6, 5);
      this.objective('Sigue a la niña al callejón.');
      this.saveCheckpoint(V(-4, 0.15, 9), Math.PI * 0.75);
    });
  }

  // ======================================================================= HOUSE
  private houseClue(k: string) {
    this.flags['clue_' + k] = true;
    const n = ['periodico', 'nota', 'foto'].filter((x) => this.flags['clue_' + x]).length;
    if (n === 2 && !this.flags.houseRealized) {
      this.flags.houseRealized = true;
      this.g.tasks.run(async () => {
        await this.g.until(() => this.g.overlay === null);
        await this.g.think('Esta es mi casa. La casa donde crecí. Yo… me había obligado a olvidarla.');
        this.objective('La radio de la cocina… mamá siempre tenía una estación puesta.');
      });
    }
  }

  private lookFamilyPhoto() {
    const g = this.g;
    this.houseClue('foto');
    const url = g.house.familyPhoto.canvas.toDataURL();
    g.read({ id: 'familia', title: 'Foto familiar', html: `<img src="${url}" alt=""/>${this.radioEventDone ? 'Alguien rayó mi cara de la foto.' : 'Mamá, Lucía y yo. Candelaria de 2005.'}`, cls: 'photo' });
  }

  private useRadio() {
    const g = this.g;
    const pos = g.house.radioPos.clone().setY(1.0);
    const talk = (lines: [string, string][], prof: string) => () => {
      let stop = false;
      g.tasks.run(async () => {
        for (const [who, t] of lines) {
          if (stop) return;
          await g.say(who, t, prof, pos);
          if (stop) return;
          await g.wait(0.5);
        }
      });
      return { stop: () => { stop = true; g.voice.stopAll(); } };
    };
    const musicSt = () => {
      const h = g.audio.play('loop_radio_static', { loop: true, volume: 0.05, ref: 1.5 }, pos);
      const mu = g.music;
      mu.setPosition('cantina', pos);
      mu.set('cantina', 0.5, 0.3);
      return { stop: () => { h?.stop(0.2); mu.set('cantina', 0, 0.3); mu.setPosition('cantina', g.market.cantinaPos); } };
    };
    const lucySong = () => {
      let stop = false;
      g.music.playOrganillo(pos, true, 8, 70);
      g.tasks.run(async () => {
        await g.wait(2);
        if (!stop) await g.say('Voz de niña', 'La, la, lalá… la, la…', 'radioLucia', pos);
      });
      return { stop: () => { stop = true; g.voice.stopAll(); } };
    };
    this.puzzles.radio(
      [
        { freq: 610, name: 'XEPA · "La Consentida"', play: musicSt },
        { freq: 790, name: 'Noticiero · 2 de febrero de 2006', play: talk([['Locutor', 'Noticias de la mañana. Continúa la búsqueda de la niña Lucía A., de ocho años, extraviada durante el apagón de la verbena del Jardín del Carmen.'], ['Locutor', 'El apagón comenzó a las doce con trece minutos, por una sobrecarga en el equipo de sonido del escenario.'], ['Locutor', 'Vecinos con veladoras la buscan desde la madrugada.']], 'radio') },
        { freq: 1020, name: '…', play: lucySong, onTuned: () => {
          if (!g.has('cancion')) g.tasks.run(async () => {
            await g.wait(4);
            g.give('cancion');
          });
        } },
        { freq: 1260, name: 'Radio Candelaria', play: talk([['Mamá', '¿Julián? Julián, mijo, ¿estás ahí?'], ['Mamá', '¿Dónde está tu hermana? Te dije que no la soltaras.'], ['Mamá', 'Se fue la luz… ¿dónde está Lucía?']], 'radioMadre'), onTuned: () => this.radioEvent() },
        { freq: 1450, name: 'Complacencias', play: talk([['Locutora', 'Y la siguiente complacencia va para la familia Arriaga, de parte de su hija Lucía, que dice que su hermano Julián le prometió llevarla a ver las campanas.'], ['Locutora', 'Mija, ¡qué bonito! Aquí va tu canción…']], 'radio') },
      ],
      pos,
    );
  }

  private radioEvent() {
    const g = this.g;
    if (this.radioEventDone) return;
    this.radioEventDone = true;
    this.flags.radioEvent = true;
    g.tasks.run(async () => {
      await g.wait(9);
      if (this.puzzles.active === 'radio') this.puzzles.close(false);
      g.sfx('power_down', V(-37, 2, -63), 0.6);
      g.world.lights.setGroup('house', false);
      await g.wait(0.6);
      this.lightning();
      g.sfx('jingle_bells_small', V(-31.5, 4.5, -71), 0.6, { ref: 5 });
      await g.wait(1.4);
      await g.think('La luz de la casa… y esos cascabeles. Arriba, en la azotea.');
      this.flags.lucyRoom = true;
      this.setLucyRoom(true);
      g.world.lights.setGroup('lucy', true);
      drawFamilyPhoto(g.house.familyPhoto.canvas, true);
      g.house.familyPhoto.tex.needsUpdate = true;
      this.mirrorArmed = true;
      this.objective('¿Esa puerta del patio estaba ahí?');
      this.flags.roofSightingPending = true;
    });
  }

  private pickCamera() {
    const g = this.g;
    g.hasCamera = true;
    g.film = 10;
    g.give('camara');
    g.house.cameraProp.visible = false;
    g.ui.film(g.film);
    g.read(this.DOCS.nota_papa);
    g.tasks.run(async () => {
      await g.until(() => g.overlay === null);
      g.ui.hint('<kbd>Q</kbd> / <kbd>Clic derecho</kbd> levantar la cámara · <kbd>Clic</kbd> fotografiar', 7);
      await g.think('La cámara de papá. Quedan diez fotos.');
      this.objective('La cámara ve lo que los ojos ya no. Fotografía el cuarto de Lucía.');
    });
  }

  private pushWardrobe() {
    const g = this.g;
    this.flags.wardrobeMoved = true;
    g.sfx('chair_drag', V(-39.6, 1, -72), 0.8);
    g.player.emit(10, 'push');
    const w = g.house.wardrobe;
    let t = 0;
    const anim = () => {
      t += 0.02;
      w.position.z = -72 + Math.min(1, t) * 1.4;
      if (t < 1) requestAnimationFrame(anim);
      else this.setWardrobe(true);
    };
    anim();
    g.world.lights.setGroup('secret', true);
    g.tasks.run(async () => {
      await g.wait(1.5);
      await g.think('Un hueco en la pared. Nuestro escondite. Aquí guardaba mis cosas…');
    });
  }

  // ======================================================================= TOWER
  private lookShoe() {
    const g = this.g;
    g.tasks.run(async () => {
      await g.think('Un zapatito amarillo. Del pie derecho.');
      await g.think('Ella quería ver las campanas. Yo le prometí que la iba a traer.');
      if (!this.flags.sawRail) {
        this.flags.sawRail = true;
        await g.think('El barandal está roto. Justo aquí.');
      }
    });
  }

  private onRefugioNote() {
    const g = this.g;
    if (this.stage >= S.TOWER) return;
    g.tasks.run(async () => {
      await g.until(() => g.overlay === null);
      await g.think('Los engranes están en la relojería del mercado. En el cajón de Don Aurelio.');
      this.setStage(S.TOWER);
      this.objective('Busca los engranes en la relojería del mercado.');
      this.saveCheckpoint(V(-11.25, 18.05, -40.4), 0);
      await g.wait(2);
      await g.think('Algo me está esperando abajo. Lo siento.');
      g.ui.hint('Si te persigue: rompe la línea de visión, escóndete, apaga la linterna.', 7);
    });
  }

  // ======================================================================= MARKET
  private marketEntry() {
    const g = this.g;
    if (this.flags.marketDark) return;
    this.flags.marketDark = true;
    g.tasks.run(async () => {
      g.sfx('electric_spark', V(-32, 3.5, -8), 0.8);
      g.sfx('power_down', V(-32, 3, -8), 0.7);
      this.applyWorld();
      await g.wait(1.2);
      await g.think('Se fue la luz en los portales.');
      // she stands at the far end of the portales
      const e = g.entity;
      e.apparition(V(-32, 0.15, 23.5), g.player.pos, {
        maxTime: 8,
        onVanish: () => this.startMarketHunt(),
      });
      g.sfx('jingle_bells_small', V(-32, 1.5, 23.5), 0.5, { ref: 6 });
      await g.wait(1.5);
      if (e.state === 'apparition') await g.think('Allá. Al otro extremo de los portales. Alguien… algo.');
      this.saveCheckpoint(V(-32, 0.15, -12), Math.PI / 2);
    });
  }

  private startMarketHunt() {
    const g = this.g;
    const patrol = [V(-44, 0.15, -1), V(-44, 0.15, -15), V(-50, 0.15, -15), V(-50, 0.15, -22), V(-56, 0.15, -22), V(-56, 0.15, -1), V(-62, 0.15, -8), V(-50, 0.15, 4), V(-32, 0.15, -8), V(-32, 0.15, 10)];
    g.entity.hunt(V(-60, 0.15, 3.5), patrol, 1.0);
    g.entity.zoneLimit = (p) => p.x < -29.5 && p.z > -26 && p.z < 26;
    g.entity.catchRadius = 1.05;
  }

  private onClockSolved() {
    const g = this.g;
    this.flags.drawerOpen = true;
    g.market.drawer.position.x += 0.35;
    g.sfx('lock_unlock', g.market.drawer.position, 0.6);
    g.market.clocks.forEach((c) => (c.speed = 0));
    g.tasks.run(async () => {
      await g.think('Las 12:13. La hora en que se fue la luz. El cajón se abrió.');
    });
  }

  private takeGears() {
    const g = this.g;
    g.give('engrane_chico', true);
    g.give('engrane_grande', true);
    g.give('engrane_enorme', true);
    g.sfx('gear_clank', g.market.drawer.position, 0.7);
    g.ui.itemCard(itemIconFor('engrane_grande'), 'Tres engranes de bronce');
    g.tasks.run(async () => {
      await g.wait(0.6);
      const e = g.entity;
      g.sfx('creature_scream', V(-50, 2, -8), 0.7, { ref: 8 });
      if (e.mode !== 'hunt') this.startMarketHunt();
      e.zoneLimit = null;
      e.aggression = 1.08;
      if (e.pos.distanceTo(g.player.pos) > 25) e.place(V(-52, 0.15, -15));
      e.lastKnown.copy(g.player.pos);
      e.setState('chase');
      e.forceChaseTime = 5;
      this.flags.gearChase = true;
      this.objective('¡Huye a la iglesia!');
      await g.think('¡Me oyó!');
    });
  }

  // ======================================================================= MECHANISM & BELLS
  private useMechanism() {
    const g = this.g;
    if (this.stage < S.GEARS && !g.has('engrane_chico')) {
      g.read(this.DOCS.nota_refugio);
      this.onRefugioNote();
      return;
    }
    if (!this.flags.gearsPlaced) {
      this.puzzles.gears(
        [
          { id: 'engrane_chico', teeth: 18 },
          { id: 'engrane_grande', teeth: 24 },
          { id: 'engrane_enorme', teeth: 30 },
        ],
        () => {
          this.flags.gearsPlaced = true;
          this.gearMeshes.forEach((m) => (m.visible = true));
          g.take('engrane_chico');
          g.take('engrane_grande');
          g.tasks.run(async () => {
            await g.think('Encajan. Ahora hay que darle cuerda.');
            const it = g.world.interactables.find((x) => x.id === 'mecanismo')!;
            it.hold = 2.5;
          });
        },
      );
      return;
    }
    if (!this.flags.mechanismWound) {
      this.flags.mechanismWound = true;
      g.sfx('mechanism_ratchet', V(-11.25, 19, -39.4), 0.8);
      this.bellMechRunning = true;
      g.tasks.run(async () => {
        await g.wait(1.2);
        g.sfx('gear_clank', V(-11.25, 19, -39.4), 0.6);
        await g.wait(1.5);
        // ghost bells play the dawn sequence once as a sonic hint
        const order = ['Dolores', 'Soledad', 'Esperanza'];
        for (const name of order) {
          const b = g.church.bells.find((x) => x.name === name)!;
          g.music.bellNote(b.midi, b.pos.clone().setY(21), 0.45, -15);
          this.swingBell(name);
          await g.wait(1.6);
        }
        g.sfx('slam_wood', V(-8.8, 21, -39.2), 0.5);
        await g.think('Tres campanas sonaron solas. La cuarta, no.');
        this.setStage(S.MECHANISM);
        this.objective('Toca el alba: sigue la inscripción.');
        this.saveCheckpoint(V(-11.25, 18.05, -40.4), 0);
      });
    }
  }

  private swingBell(name: string) {
    const b = this.g.church.bells.find((x) => x.name === name);
    if (!b) return;
    let t = 0;
    const m = b.mesh;
    const axis = Math.abs(b.pos.x - -11.25) < 0.1 ? 'x' : 'z';
    const anim = () => {
      t += 0.016;
      const a = Math.sin(t * 5) * Math.exp(-t * 1.2) * 0.5;
      if (axis === 'x') m.rotation.x = a;
      else m.rotation.z = a;
      if (t < 3.5) requestAnimationFrame(anim);
    };
    anim();
  }

  private ringBell(name: string) {
    const g = this.g;
    const b = g.church.bells.find((x) => x.name === name)!;
    const order = ['Dolores', 'Soledad', 'Esperanza', 'Luz'];
    const final = this.stage === S.CLIMAX_RUN;
    const expect = order[this.bellSeq.length];
    g.player.emit(40, 'bell');
    if (name === 'Luz' && !final) {
      g.sfx('slam_wood', b.pos, 0.7);
      g.sfx('electric_spark', b.pos, 0.4);
      if (this.bellSeq.length === 3) this.startClimax();
      else {
        g.think('La campana «Luz» no suena. Solo un golpe seco.');
        this.bellSeq = [];
      }
      return;
    }
    g.music.bellNote(b.midi, b.pos.clone().setY(21), 0.8);
    if (name === 'Dolores') g.sfx('bell_church', b.pos.clone().setY(21), 0.6, { ref: 10 });
    this.swingBell(name);
    if (name === expect) {
      this.bellSeq.push(name);
      if (final && this.bellSeq.length === 4) this.onFinalBells();
    } else {
      this.bellSeq = [];
      g.music.bellNote(b.midi + 1, b.pos.clone().setY(21), 0.4, 40);
      g.ui.hint('Las campanas se atropellan. Así no es el alba.', 3);
      if (name === 'Dolores') this.bellSeq = ['Dolores'];
    }
  }

  // ======================================================================= CLIMAX
  private startClimax() {
    const g = this.g;
    this.bellSeq = [];
    g.tasks.run(async () => {
      this.lockMove = false;
      await g.wait(1);
      g.sfx('stinger_low', undefined, 0.6);
      await g.say('Una voz', 'La Luz no suena, Julián. Esa noche se fue la luz… y con ella se fue tu hermana.', 'refugio');
      await g.say('Una voz', 'Devuélvele la luz a la plaza. Pero apúrate: ya viene el alba… y ella no quiere que llegue.', 'refugio');
      this.setStage(S.CLIMAX);
      g.battery = 1;
      g.flashFlicker = 1.5;
      this.lightning();
      this.climaxDeadline = g.tasks.time + 420;
      this.objective('Arranca la planta de luz del escenario.');
      this.saveCheckpoint(V(-11.25, 18.05, -40.4), 0);
      this.flags.climaxLeft = 420;
      this.startClimaxHunt();
      await g.wait(3);
      await g.think('La plaza… ya no es la plaza.');
    });
  }

  private startClimaxHunt() {
    const g = this.g;
    const patrol = [V(0, 0.15, 24), V(20, 0.15, 24), V(26, 0.15, 0), V(36, 0, 0), V(26, 0.15, -24), V(0, 0.3, -28), V(-25, 0.15, -20), V(-25, 0.15, 0), V(-24, 0.15, 20), V(12, 0.15, 12), V(-12, 0.15, -12)];
    g.entity.hunt(V(-24, 0.15, 20), patrol, 1.1);
    g.entity.zoneLimit = (p) => p.x > -30 && p.z > -31 && p.z < 30 && p.x < 50;
  }

  private useGenerator() {
    const g = this.g;
    const pos = g.stage.generator.clone();
    this.puzzles.generator(
      (ok) => {
        g.sfx(ok ? 'mechanism_ratchet' : 'metal_creak', pos, 0.8);
        g.player.emit(ok ? 22 : 30, 'generator');
      },
      () => {
        this.flags.generatorOn = true;
        g.sfx('power_up', pos, 0.8);
        const hum = g.audio.play('loop_electric_hum', { loop: true, volume: 0.5, ref: 3 }, pos);
        this.flags.genHum = !!hum;
        g.player.emit(35, 'generator');
        this.objective('Sube los interruptores del tablero eléctrico.');
        g.tasks.run(async () => {
          await g.think('¡Arrancó! Pero hace un ruido que se oye en toda la plaza…');
          await g.until(() => this.stage !== S.CLIMAX);
          hum?.stop(1);
        });
      },
    );
  }

  private usePanel() {
    const g = this.g;
    if (!this.flags.generatorOn) {
      g.sfx('switch_click', g.stage.panel, 0.6);
      g.think('No hay corriente. Primero hay que arrancar la planta.');
      return;
    }
    this.puzzles.panel(
      () => {
        g.player.emit(25, 'spark');
        g.world.lights.globalLevel = 0.3;
        setTimeout(() => (g.world.lights.globalLevel = 1), 300);
      },
      () => this.onPowerRestored(),
    );
  }

  private onPowerRestored() {
    const g = this.g;
    this.flags.panelDone = true;
    g.tasks.run(async () => {
      g.sfx('power_up', undefined, 0.8);
      g.music.tapeStop('ghostband');
      this.setStage(S.CLIMAX_RUN);
      g.world.lights.globalLevel = 0;
      for (let i = 0; i < 8; i++) {
        g.world.lights.globalLevel = Math.random() < 0.6 ? 1 : 0.3;
        await g.wait(0.08);
      }
      g.world.lights.globalLevel = 1;
      // the run to the tower and the bells need time, however long the generator took
      this.climaxDeadline = Math.max(this.climaxDeadline, g.tasks.time + 150);
      await g.think('Esta vez… no se fue la luz.');
      this.objective('¡Toca el alba en el campanario!');
      this.saveCheckpoint(g.player.pos.clone(), g.player.yaw);
      this.startFinalChase();
    });
  }

  private startFinalChase() {
    const g = this.g;
    const e = g.entity;
    e.hunt(V(44, 0, 9), [V(36, 0, 0)], 1.12);
    e.zoneLimit = null;
    e.lastKnown.copy(g.player.pos);
    e.setState('chase');
    e.forceChaseTime = 6;
    g.sfx('creature_scream', e.pos.clone().setY(2), 0.8);
    this.flags.finalChase = true;
    this.flags.towerChaseStarted = false;
    this.flags.towerClimb = false;
  }

  /**
   * Final chase in the tower: she stops following on the stairs and starts climbing only
   * once Julián reaches the belfry, so the bells get a fair window (~25 s) whatever
   * pace he climbed at. Growls on the way up tell him how close she is.
   */
  private towerChase(atTop: boolean) {
    const g = this.g;
    if (!this.flags.towerChaseStarted) {
      this.flags.towerChaseStarted = true;
      g.entity.hide();
      this.scriptedChase = true; // keep the chase music going
    }
    if (!atTop || this.flags.towerClimb) return;
    this.flags.towerClimb = true;
    g.tasks.run(async () => {
      const e = g.entity;
      await g.wait(1.5);
      if (this.stage !== S.CLIMAX_RUN) return;
      // she climbs the same stairs
      const path: THREE.Vector3[] = [V(-6.8, 0.05, -39.4), V(-9.3, 0.05, -39.4), V(-9.3, 0.05, -37.3)];
      const ix0 = -14.5 + 0.8, ix1 = -8 - 0.8, iz0 = -42.5 + 0.8, iz1 = -36 - 0.8;
      const corners = [[ix1 - 0.5, iz1 - 0.5], [ix0 + 0.5, iz1 - 0.5], [ix0 + 0.5, iz0 + 0.5], [ix1 - 0.5, iz0 + 0.5]];
      let y = 0.05;
      for (let i = 0; i < 9; i++) {
        y += 2.0;
        const c = corners[(i + 1) % 4];
        path.push(V(c[0], Math.min(18.05, y), c[1]));
      }
      path.push(V(-11.25, 18.05, -39.8));
      e.place(path[0]);
      e.scripted(path, 1.9);
      g.sfx('door_slam', V(-6.8, 1.2, -39.4), 0.8, { ref: 8 });
      g.sfx('creature_growl', path[0].clone().setY(2), 0.8, { ref: 8 });
      await g.think('Viene subiendo. Rápido: Dolores, Soledad, Esperanza, Luz.');
      // growl every few flights so the player can hear her getting closer
      let lastFlight = 0;
      while (this.stage === S.CLIMAX_RUN && e.mode === 'scripted' && e.scriptedPath.length) {
        const flight = Math.floor(e.pos.y / 6);
        if (flight > lastFlight) {
          lastFlight = flight;
          g.sfx('creature_growl', e.pos.clone().setY(e.pos.y + 1.8), 0.6 + flight * 0.1, { ref: 6 });
          if (flight === 2) g.ui.hint('Ya casi llega arriba…', 2.5);
        }
        await g.wait(0.25);
      }
    });
  }

  private onFinalBells() {
    const g = this.g;
    const e = g.entity;
    this.scriptedChase = false;
    const trueEnding = g.memories().length >= 3;
    g.tasks.run(async () => {
      // stop her where she is (she has almost reached the top)
      e.mode = 'off';
      e.setState('apparition');
      e.apparitionMaxTime = 999;
      e.apparitionLook = -999;
      this.lockMove = true;
      g.music.set('chase', 0, 0.5);
      g.music.set('danger', 0, 2);
      g.sfx('bell_church', V(-11.25, 21, -39.25), 1.0, { ref: 20 });
      g.music.bellNote(74, V(-11.25, 21, -39.25), 0.9);
      await g.wait(0.6);
      // make sure she is visible on the stairs landing near the hatch
      const top = V(-12.8, 18.05, -40.8);
      e.place(top, 0);
      g.player.lookOverride = { target: V(top.x, 19.9, top.z), strength: 3 };
      await g.wait(1.8);
      g.player.lookOverride = null;
      if (trueEnding) {
        this.flags.awaitTruth = true;
        g.ui.hint('<kbd>E</kbd> Decir la verdad', 8);
        await g.until(() => !this.flags.awaitTruth, 12);
        if (this.flags.awaitTruth) {
          this.flags.awaitTruth = false;
          await this.sayTruthSequence();
        }
      } else {
        await g.think('La campana de la Luz… sonó.');
        g.ui.flash(1, 3.5);
        e.hide();
        await g.wait(1.0);
        this.ending('normal');
      }
    });
  }

  private sayTruth() {
    this.flags.awaitTruth = false;
    this.g.tasks.run(() => this.sayTruthSequence());
  }

  private async sayTruthSequence() {
    const g = this.g;
    const e = g.entity;
    await g.say('Julián', 'Fui yo. Yo la dejé sola en el kiosco. Me fui a la cantina con mis amigos.', 'julian');
    await g.say('Julián', 'Cuando se fue la luz, ella me buscó. Quería ver las campanas. Yo se lo prometí.', 'julian');
    await g.say('Julián', 'Don Refugio no tuvo la culpa. Nunca lo dije. Nunca le dije a nadie.', 'julian');
    await g.wait(1.0);
    // she unveils
    const veil = e.visual.veil;
    const mask = e.visual.mask;
    for (let i = 0; i < 40; i++) {
      veil.scale.y = Math.max(0.01, 1 - i / 40);
      veil.position.y = 1.78 + (i / 40) * 0.5;
      ((mask.material as THREE.MeshStandardMaterial).emissiveIntensity) = 0.25 + i * 0.05;
      await g.wait(0.04);
    }
    await g.say('Mamá', 'Ya, mijo. Ya la puedes soltar.', 'madre', e.pos.clone().setY(e.pos.y + 2));
    await g.say('Mamá', 'Ella nunca te culpó. Nunca.', 'madre', e.pos.clone().setY(e.pos.y + 2));
    g.ui.flash(1, 4);
    e.hide();
    veil.scale.y = 1;
    veil.position.y = 1.78;
    (mask.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.25;
    await g.wait(1.2);
    this.ending('true');
  }

  // ======================================================================= ENDINGS
  private ending(kind: 'normal' | 'true') {
    const g = this.g;
    this.flags.ending = kind;
    this.lockMove = false;
    g.tasks.run(async () => {
      g.ui.fade(1, 1.5);
      g.audio.duck(0.05, 1);
      await g.wait(2.5);
      g.entity.hide();
      this.setStage(S.DAWN);
      this.dawn = 0.6;
      g.hasFlashlight = g.hasFlashlight;
      g.flashOn = false;
      g.ui.battery(null);
      g.ui.clock('6:02 a.m.');
      g.amb.stopAll();
      g.amb.set('wind', 0.3);
      g.amb.set('traffic', 0.5);
      g.amb.set('fountain', 1);
      // people back
      const beto = this.npc.beto;
      beto.setVisible(true);
      beto.pos.set(11, 0, 25.4);
      beto.def.path = undefined;
      this.npc.chayo.setVisible(true);
      this.npc.chema.setVisible(true);
      if (kind === 'normal') {
        g.player.teleport(V(-1.4, 0.15, 11.6), Math.PI * 0.15);
        this.taxi!.visible = true;
      } else {
        g.player.teleport(V(0, 0.3, -31.6), Math.PI);
        this.refugio!.setVisible(true);
        this.refugio!.pos.set(2.2, 0.3, -33.8);
        this.refugio!.yaw = 0;
        this.lucia!.pos.set(0.4, 1.45, 3.6);
        this.lucia!.def.path = undefined;
        this.lucia!.setVisible(true);
      }
      g.audio.duck(1, 3);
      await g.wait(0.5);
      g.ui.fade(0, 3);
      g.sfx('birds_dawn', V(10, 6, 0), 0.6, { ref: 12 });
      await g.wait(2);
      g.sfx('rooster_crow', V(-40, 8, -60), 0.5, { ref: 15 });
      if (kind === 'normal') {
        await g.say('Don Beto', '¡Joven! ¿Se quedó dormido en la banca? Ándele, que ya casi empieza la fiesta.', 'beto', beto.pos.clone().setY(1.6));
        await g.think('Nadie recuerda el apagón. Solo yo.');
        g.phone.signal(true);
        g.phone.message('Tu conductor · Roberto', 'Ya llegué. Estoy en la calle Nieto. ¿Todo bien? Te marqué toda la noche.', { dur: 6 });
        this.objective('Ve al taxi.');
      } else {
        g.sfx('bells_toll_sequence', V(-11.25, 21, -39.25), 0.7, { ref: 20 });
        await g.think('Amaneció. Las campanas tocan el alba… por fin.');
        this.objective('Habla con Don Refugio.');
      }
    });
  }

  private async talkRefugio() {
    const g = this.g;
    this.flags.talkedRefugio = true;
    const r = this.refugio!;
    r.talking = true;
    const p = r.pos.clone().setY(1.6);
    await g.say('Julián', '¿Don Refugio?', 'julian');
    await g.say('Don Refugio', 'Buenos días, joven. ¿Viene a la misa de la Candelaria?', 'refugioReal', p);
    await g.say('Julián', 'Vengo a decirle algo que debí decirle hace veinte años.', 'julian');
    await g.wait(1);
    await g.say('Don Refugio', '…Ya lo sabía, mijo. Siempre lo supe. Y nunca dejé de rezar por los dos.', 'refugioReal', p);
    await g.say('Don Refugio', 'Ándele. Suba conmigo a tocar el alba. Ya es de día.', 'refugioReal', p);
    r.talking = false;
    await g.wait(1);
    // Lucía waves from the kiosk and fades
    await g.think('En el kiosco, una niña de vestido amarillo me dice adiós con la mano.');
    await g.wait(2);
    this.lucia!.setVisible(false);
    this.finishEnding('true');
  }

  private finishEnding(kind: 'normal' | 'true') {
    const g = this.g;
    this.flags.finished = true;
    g.tasks.run(async () => {
      g.ui.fade(1, 2.5);
      await g.wait(3);
      g.state = 'ending';
      g.input.exitLock();
      g.ui.setHud(false);
      g.ui.clearSubs();
      const mins = Math.round(g.playTime / 60);
      const mem = g.memories().length;
      const k = document.getElementById('end-kicker')!;
      const t = document.getElementById('end-title')!;
      const tx = document.getElementById('end-text')!;
      if (kind === 'normal') {
        k.textContent = 'FINAL · 1 DE 2';
        t.textContent = 'Amanecer';
        tx.innerHTML = '<p>Julián se fue de la plaza con el sol en la cara.</p><p>Esa medianoche, las campanas volvieron a sonar. Él no las escuchó: estaba lejos, en otra ciudad, en otra vida.</p><p>Pero cada madrugada, a las doce con trece, se despierta. Y durante un segundo, antes de recordar dónde está, la oye cantar.</p>';
      } else {
        k.textContent = 'FINAL VERDADERO · 2 DE 2';
        t.textContent = 'Desvelada';
        tx.innerHTML = '<p>Don Refugio y Julián tocaron juntos el alba de la Candelaria.</p><p>Esa noche hubo verbena. Hubo tamales, lotería, papel picado. Nadie supo por qué el hombre de la banca lloraba y sonreía al mismo tiempo.</p><p>La cajita de música del kiosco nunca volvió a sonar sola. Ya no hacía falta.</p>';
      }
      document.getElementById('end-stats')!.innerHTML = `Tiempo: ${mins} min · Recuerdos: ${mem} de 5 · Fotografías: ${g.photos.length} · Noches repetidas: ${Math.max(0, this.deaths)}` + (kind === 'normal' && mem < 3 ? '<br><i>Hay otro final. Busca los recuerdos de Julián.</i>' : '');
      g.ui.show('ending');
      g.ui.fade(0, 2);
      this.clearSave();
      const prog = loadProgress();
      if (!prog.endingsSeen.includes(kind)) prog.endingsSeen.push(kind);
      saveProgress(prog);
    });
  }

  // ======================================================================= EVENTS / HOOKS
  onMemory(id: string) {
    const g = this.g;
    const n = g.memories().length;
    g.tasks.run(async () => {
      await g.wait(1.5);
      if (n === 3) await g.think('Empiezo a recordar todo. Todo lo que me obligué a olvidar.');
    });
    void id;
    void MEMORY_IDS;
  }

  onHide(h: HideSpot, seen: boolean) {
    const g = this.g;
    this.hintOnce('hide', '<kbd>E</kbd> salir del escondite · no respires fuerte', 4);
    if (seen && g.entity.mode === 'hunt') g.tasks.run(() => g.think('Me vio entrar…'));
    void h;
  }

  onEntityLost() {
    const g = this.g;
    if (this.flags.gearChase && this.stage === S.TOWER) return;
    this.hintOnce('lost', 'La perdiste. Por ahora.', 3);
    void g;
  }

  onZone(z: string, prev: string) {
    const g = this.g;
    const s = this.stage;
    // church sanctuary
    if ((z === 'church' || z === 'tower' || z === 'belfry' || z === 'sacristy') && g.entity.mode === 'hunt' && s < S.CLIMAX_RUN) {
      const e = g.entity;
      if (e.state === 'chase' || this.flags.gearChase) {
        e.setState('return');
        g.tasks.run(async () => {
          await g.wait(1);
          if (this.flags.gearChase && s === S.TOWER) {
            this.flags.gearChase = false;
            // she stays at the atrium gate looking in
            e.apparition(V(0, 0.3, -31.2), V(0, 0, -40), { maxTime: 10 });
            this.flags.churchSealed = true;
            const dl = g.world.doors.find((d) => d.id === 'churchL')!;
            const dr = g.world.doors.find((d) => d.id === 'churchR')!;
            await g.until(() => g.player.pos.z < -39, 6);
            dl.setOpen(false);
            dr.setOpen(false);
            g.sfx('door_slam', V(0, 2, -36.4), 0.9, { ref: 8 });
            this.setStage(S.GEARS);
            await g.think('Se cerraron solas. Aquí no entra.');
            this.objective('Repara el mecanismo del campanario.');
            this.saveCheckpoint(V(0, 0.05, -45), Math.PI);
            dl.locked = false;
            dr.locked = false;
          }
        });
      }
    }
    if (z === 'church' && !this.flags.visitedChurch && s >= S.MIDNIGHT) {
      this.flags.visitedChurch = true;
      g.tasks.run(async () => {
        await g.think('Las velas están encendidas. Alguien las acaba de prender.');
        g.sfx('whisper_1', V(5.8, 1.6, -47.5), 0.45);
        g.tasks.run(async () => {
          await g.wait(14);
          if (this.zoneIs('church') && g.canScare()) {
            g.sfx('door_slam', V(0, 1.5, -38), 0.9, { ref: 6 });
            await g.wait(1.5);
            if (g.canScare()) g.scare('behind');
          }
        });
        await g.wait(1.2);
        if (!this.flags.confessed && !g.player.hidden) {
          await g.think('¿Alguien en el confesionario?');
          if (!this.flags.confessed) this.objective('Revisa el confesionario.');
        }
      });
    }
    if (z === 'tower' && s >= S.CANDLES && !this.flags.extension) {
      this.flags.extension = true;
    }
    if ((z === 'tower' || z === 'belfry') && s === S.CLIMAX_RUN) this.towerChase(z === 'belfry');
    if (z === 'belfry' && s === S.CANDLES && !this.flags.belfryFirst) {
      this.flags.belfryFirst = true;
      g.tasks.run(async () => {
        await g.think('El campanario. Desde aquí se ve toda la plaza.');
        await g.think('Aquí… aquí fue.');
        if (this.stage === S.CANDLES) this.objective('Examina el mecanismo de las campanas.');
      });
    }
    if (z === 'callejon' && s >= S.KIOSK && !this.flags.enteredAlley) {
      this.flags.enteredAlley = true;
      g.tasks.run(async () => {
        await g.think('El callejón del Encino. Yo corría por aquí de niño.');
        this.objective('Sigue a la niña.');
        this.showCat(0);
      });
    }
    if (z === 'house' && !this.flags.inHouse && s >= S.KIOSK) {
      this.flags.inHouse = true;
      g.tasks.run(async () => {
        await g.think('Huele a humedad… y a canela. Como antes.');
        this.objective('Explora la casa.');
        await g.wait(6);
        if (this.stage !== S.KIOSK || g.zoneName !== 'house') return;
        // the phone rings with no signal: the caller is "Casa", a line that no longer exists
        const ok = await g.call('Casa', [
          ['Casa', '…', 'whisper'],
          ['Voz de niña', 'Ya se fue la luz, Julián. Tengo miedo.', 'radioLucia'],
          ['Voz de niña', '¿Vienes por mí? Mamá dice que no me sueltes.', 'radioLucia'],
        ], { status: 'Sin servicio · Llamada entrante' });
        if (ok) {
          g.sfx('stinger_low', undefined, 0.5);
          this.g.scare('flicker');
          await g.think('Esa es la línea de la casa. Hace veinte años que no existe.');
        }
      });
    }
    if (z === 'patio' && this.flags.roofSightingPending) {
      this.flags.roofSightingPending = false;
      g.tasks.run(async () => {
        await g.wait(0.8);
        this.lightning();
        g.entity.apparition(g.house.roofSighting.clone(), g.player.pos, { maxTime: 7 });
        g.sfx('jingle_bells_small', g.house.roofSighting, 0.5, { ref: 5 });
        await g.wait(3);
        await g.think('Estaba en la azotea. Mirándome. Una mujer alta… con velo.');
      });
    }
    if ((z === 'plaza' || z === 'garden') && prev === 'callejon' && s >= S.HOUSE && !this.flags.processionDone) {
      this.flags.processionDone = true;
      this.processionEvent();
    }
    if ((z === 'arcade' || z === 'shops') && s === S.TOWER) this.marketEntry();
    if (z === 'stage' && s === S.CLIMAX && !this.flags.stageFirst) {
      this.flags.stageFirst = true;
      g.stage.ghostBand.visible = true;
      g.tasks.run(async () => {
        await g.think('La verbena de 2006. Están tocando… para nadie.');
        await g.wait(6);
        g.stage.ghostBand.visible = false;
      });
    }
  }

  private processionEvent() {
    const g = this.g;
    const proc = this.procession!;
    const path = [V(0, 0.3, -32), V(0, 0.15, -24), V(-12, 0.15, -24), V(-25, 0.15, -22), V(-26, 0.15, -8), V(-32, 0.15, -8), V(-40, 0.15, -8)];
    const curve = new THREE.CatmullRomCurve3(path);
    const L = curve.getLength();
    proc.visible = true;
    let t0 = g.tasks.time;
    g.music.set('explore', 0, 2);
    g.tasks.run(async () => {
      await g.think('¿Qué es eso…?');
      await g.wait(40);
      proc.visible = false;
      g.music.set('explore', 0.7, 6);
    });
    const upd = () => {
      if (!proc.visible) return;
      const el = g.tasks.time - t0;
      proc.children.forEach((f, i) => {
        const d = el * 1.0 - i * 1.6;
        const u = THREE.MathUtils.clamp(d / L, 0, 1);
        const p = curve.getPointAt(u);
        const tang = curve.getTangentAt(u);
        f.position.set(p.x + Math.sin(i * 2.3) * 0.4, p.y + Math.sin(el * 2 + i) * 0.02, p.z);
        f.rotation.y = Math.atan2(tang.x, tang.z);
        const dist = f.position.distanceTo(g.player.pos);
        f.visible = d > 0 && u < 0.999 && dist > 7;
      });
      requestAnimationFrame(upd);
    };
    upd();
  }

  private showCat(i: number) {
    const c = this.cat;
    if (!c) return;
    const spots = this.g.house.catSpots;
    c.spot = i;
    c.obj.visible = true;
    c.obj.position.copy(spots[i]);
    this.g.sfx('cat_meow', spots[i].clone().setY(0.4), 0.5);
  }

  private updateCat(dt: number) {
    const c = this.cat;
    if (!c || !c.obj.visible) return;
    c.mixer?.update(dt);
    const g = this.g;
    const spots = g.house.catSpots;
    const target = spots[c.spot];
    const to = target.clone().sub(c.obj.position).setY(0);
    const d = to.length();
    if (d > 0.1) {
      to.normalize();
      c.obj.position.addScaledVector(to, Math.min(d, dt * 2.6));
      c.obj.rotation.y = Math.atan2(to.x, to.z);
      if (c.walk && !c.walk.isRunning()) {
        c.idle?.fadeOut(0.2);
        c.walk.reset().fadeIn(0.2).play();
      }
    } else if (c.walk?.isRunning()) {
      c.walk.fadeOut(0.3);
      c.idle?.reset().fadeIn(0.3).play();
    }
    if (d < 0.2 && g.player.pos.distanceTo(c.obj.position) < 3.2 && c.spot < spots.length - 1) {
      c.spot++;
      if (c.spot === 3) {
        const cd = g.world.doors.find((x) => x.id === 'corral')!;
        if (!cd.isOpen) {
          cd.setOpen(true);
          g.sfx('door_creak', V(-19.8, 1, -47.9), 0.5);
        }
      }
      if (Math.random() < 0.5) g.sfx('cat_meow', c.obj.position.clone().setY(0.4), 0.4);
    }
  }

  // ======================================================================= RANDOM PRESENCES
  private updateEvents(dt: number) {
    const g = this.g;
    const s = this.stage;
    if (s < S.MIDNIGHT || s >= S.DAWN) return;
    if (g.entity.state === 'chase' || this.scriptedChase) return;
    this.eventTimer -= dt;
    if (this.eventTimer > 0) return;
    this.eventTimer = 25 + Math.random() * 30;
    const z = g.zoneName;
    const outdoor = ['plaza', 'garden', 'atrium', 'stage'].includes(z);
    const once = (id: string, prob: number, fn: () => void) => {
      if (this.events.has(id)) return false;
      this.events.set(id, true);
      if (Math.random() < prob) {
        fn();
        return true;
      }
      return false;
    };
    const pick = Math.random();
    if (outdoor && pick < 0.25) {
      once('silhouette', 0.5, () => {
        const sils = g.town.windowSilhouettes;
        const sl = sils[Math.floor(Math.random() * sils.length)];
        sl.visible = true;
        g.tasks.run(async () => {
          await g.wait(7);
          sl.visible = false;
        });
      });
    } else if (outdoor && pick < 0.45) {
      once('chayo', 0.4, () => {
        const n = this.npc.chayo;
        n.setVisible(true);
        n.play('idle', 0);
        this.chayoRebozo.visible = false;
        let seen = false;
        const check = () => {
          if (!n.visible) return;
          const toN = n.pos.clone().setY(1).sub(g.engine.camera.position);
          const fwd = new THREE.Vector3();
          g.engine.camera.getWorldDirection(fwd);
          const look = fwd.dot(toN.normalize());
          if (look > 0.85) seen = true;
          if ((seen && look < 0.3) || g.player.pos.distanceTo(n.pos) < 4) {
            n.setVisible(false);
            this.chayoRebozo.visible = true;
            if (g.player.pos.distanceTo(n.pos) < 6) g.sfx('whisper_3', n.pos.clone().setY(1.2), 0.4);
            return;
          }
          requestAnimationFrame(check);
        };
        g.tasks.run(async () => {
          check();
          await g.wait(45);
          n.setVisible(false);
          this.chayoRebozo.visible = true;
        });
      });
    } else if (outdoor && pick < 0.6) {
      once('dogs', 0.8, () => {
        const p = g.player.pos.clone().add(V(8, 0, 8));
        g.sfx('dog_bark_1', p.clone().add(V(20, 2, 0)), 0.5);
        g.sfx('dog_bark_2', p.clone().add(V(-15, 2, 12)), 0.45, { delay: 0.8 });
        g.sfx('dog_howl', p.clone().add(V(0, 2, -25)), 0.4, { delay: 2 });
      });
    } else if (pick < 0.72) {
      once('steps', 0.4, () => {
        const back = g.player.forward.multiplyScalar(-3).add(g.player.pos);
        g.sfx('footsteps_behind', back.setY(0.2), 0.5);
        g.tasks.run(() => g.think('Pasos. Detrás de mí.'));
      });
    } else if (z === 'callejon' && pick < 0.85) {
      once('childAlley', 0.5, () => {
        g.sfx('child_run', V(-22, 0.5, -70), 0.6);
        g.sfx('child_laugh', V(-22, 1.2, -72), 0.4, { delay: 1 });
      });
    } else if (z === 'stage' || (outdoor && g.player.pos.x > 20)) {
      once('ghostband', 0.35, () => {
        g.stage.ghostBand.visible = true;
        g.music.set('ghostband', 0.35, 1);
        g.tasks.run(async () => {
          await g.wait(5);
          g.stage.ghostBand.visible = false;
          g.music.set('ghostband', 0, 2);
        });
      });
    } else {
      once('slamNear', 0.5, () => g.sfx('door_slam', g.player.pos.clone().add(V(6, 1.5, -6)), 0.5));
    }
  }

  // ======================================================================= UPDATE
  private scareT = 80;
  /** a far figure that watches from the dark and vanishes when you look too long or come closer */
  private farFigure() {
    const g = this.g;
    const f = g.player.forward;
    for (let tries = 0; tries < 8; tries++) {
      const a = (Math.random() - 0.5) * 0.9;
      const dir = V(f.x * Math.cos(a) - f.z * Math.sin(a), 0, f.x * Math.sin(a) + f.z * Math.cos(a));
      const p = g.player.pos.clone().addScaledVector(dir, 14 + Math.random() * 8);
      p.y = 0.1;
      if (!g.nav.walkable(p.x, p.z) || g.world.col.blocked(g.player.eyePos, p.clone().setY(1.7))) continue;
      g.entity.apparition(p, g.player.pos, { maxTime: 7 });
      g.sfx('jingle_bells_small', p.clone().setY(1.3), 0.3, { ref: 6 });
      return true;
    }
    return false;
  }

  /** random scares while exploring: never during chases, dialogue, puzzles or scripted scenes */
  private updateScares(dt: number) {
    const g = this.g;
    const s = this.stage;
    if (s < S.MIDNIGHT || s >= S.CLIMAX_RUN || g.state !== 'playing') return;
    this.scareT -= dt;
    if (this.scareT > 0) return;
    if (!g.canScare() || g.time - g.lastScare < 45) {
      this.scareT = 5;
      return;
    }
    this.scareT = 70 + Math.random() * 80;
    const r = Math.random();
    if (r < 0.35) g.scare('flicker');
    else if (r < 0.65) g.scare('behind');
    else if (!this.farFigure()) g.scare('flicker');
  }

  update(dt: number) {
    const g = this.g;
    const s = this.stage;
    this.updateStreetBanks();
    this.updateScares(dt);
    // prologue clock
    if (s === S.PROLOGUE) {
      // waiting at the pickup spot: time runs faster so nobody stands there for minutes
      const atPickup = Math.hypot(g.player.pos.x, g.player.pos.z - 31) < 6;
      this.clockMin += (dt / 13) * (atPickup ? 4 : 1);
      const hh = Math.floor(this.clockMin / 60) % 24;
      const mm = Math.floor(this.clockMin % 60);
      const h12 = hh % 12 === 0 ? 12 : hh % 12;
      if (!this.flags.midnightStarted) g.ui.clock(`${h12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'p.m.' : 'a.m.'}`);
      setClock(g.town.presidenciaClock, hh, mm);
      // crowd fades as people leave
      const f = THREE.MathUtils.clamp((24 * 60 - this.clockMin) / 8, 0.25, 1);
      g.amb.set('crowd', f);
      // plaza music ducks near diegetic sources
      const dc = Math.min(g.player.pos.distanceTo(g.market.cantinaPos), g.player.pos.distanceTo(g.stage.musicianSpot));
      if (!this.flags.midnightStarted) g.music.set('plaza', dc < 16 ? 0.1 : 0.35, 2);
      // ghost girl sighting
      if (this.flags.girlShow && this.lucia) this.updateGirlSighting();
      // soft boundary in streets
      for (const st of g.streets) {
        const l = toLocal(st, g.player.pos);
        if (Math.abs(l.x) < 3 && l.s > 5 && !this.flags.boundaryHint) {
          this.flags.boundaryHint = true;
          g.tasks.run(() => g.think('Está cerrado por la verbena. Mejor espero el taxi en la Nieto.'));
        }
      }
      // ambient chatter
      this.barkT -= dt;
      if (this.barkT <= 0) {
        this.barkT = 9 + Math.random() * 8;
        const c1 = this.npc.compa1;
        if (c1.visible && g.player.pos.distanceTo(c1.pos) < 9 && !c1.talking) {
          const lines = [['…y le dije: compadre, la de «Morir soñando» no, que me pongo sentimental.', 'compa1'], ['Ja, ja. Ya, ya. Una última y nos vamos.', 'compa2'], ['Oye, ¿y sí van a tocar las campanas?', 'compa1'], ['Eso dicen. Veinte años, compadre.', 'compa2']];
          const L = lines[Math.floor(Math.random() * lines.length)];
          g.tasks.run(() => g.say('Parroquiano', L[0], 'vecino', this.npc[L[1]].pos.clone().setY(1.7)));
        }
      }
    } else if (s >= S.MIDNIGHT && s < S.DAWN) {
      // weird clocks
      if (Math.random() < dt * 0.05) g.ui.clock(['12:00 a.m.', '12:13 a.m.', '--:--', '3:33 a.m.', '12:00 a.m.'][Math.floor(Math.random() * 5)], true);
      const t = g.tasks.time;
      if (s !== S.CLIMAX && s !== S.CLIMAX_RUN) setClock(g.town.presidenciaClock, (12 - (t * 0.02) % 12 + 12) % 12, (60 - (t * 2) % 60) % 60);
    }
    // climax timer: the church clock runs toward dawn
    if (s === S.CLIMAX || s === S.CLIMAX_RUN) {
      const left = Math.max(0, this.climaxDeadline - g.tasks.time);
      this.flags.climaxLeft = left;
      const minsTo6 = (left / 420) * 15;
      const m = 60 - minsTo6;
      g.ui.clock(`5:${String(Math.min(59, Math.floor(m))).padStart(2, '0')} a.m.`);
      setClock(g.town.presidenciaClock, 5, Math.min(59, m));
      this.dawnTarget = 0.05 + (1 - left / 420) * 0.3;
      if (left <= 0 && g.state === 'playing') g.gameOver('El alba no llegó. La noche empieza otra vez.');
    }
    // entity safety / sanctuary warning
    if (g.entity.root.visible && g.entity.mode === 'hunt' && g.entity.state === 'chase' && s < S.CLIMAX && g.tasks.time - this.lastSafeWarn > 20) {
      this.lastSafeWarn = g.tasks.time;
      this.hintOnce('crouch', '<kbd>C</kbd> agacharse te hace más silencioso', 4);
    }
    // NPCs
    for (const n of this.npcs) n.update(dt, g.player.pos);
    this.lucia?.update(dt, g.player.pos);
    this.refugio?.update(dt, g.player.pos);
    this.updateCat(dt);
    this.checkLoop();
    this.updateChurch();
    this.updateEvents(dt);
    this.updateRain(dt);
    this.updateMirror();
    // lightning flash decay
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      const f = this.flashTimer > 0.35 ? 1 : this.flashTimer > 0.25 ? 0.2 : this.flashTimer > 0.15 ? 0.8 : 0;
      g.sky.uniforms.uFlash.value = Math.max(0, f);
    } else g.sky.uniforms.uFlash.value = 0;
    // dawn
    this.dawn += (this.dawnTarget - this.dawn) * Math.min(1, dt * (s === S.DAWN ? 0.15 : 0.5));
    g.sky.uniforms.uDawn.value = this.dawn;
    g.engine.renderer.toneMappingExposure = 1.0 + this.dawn * 0.25;
    // market clocks spin
    if (s >= S.MIDNIGHT && g.zoneName === 'reloj') {
      for (const c of g.market.clocks) {
        if (!c.speed) continue;
        c.m += c.speed * dt;
        if (Math.random() < 0.1) {
          setClock({ canvas: c.canvas, tex: c.tex }, Math.floor(c.h + c.m / 60) % 12, ((Math.floor(c.m) % 60) + 60) % 60);
        }
      }
    }
    // mechanism gear spin
    if (this.bellMechRunning) this.gearMeshes.forEach((m, i) => (m.rotation.z += dt * (i === 0 ? -0.7 : 0.52)));
    // wind gusts
    g.mats.uniforms.uWind.value += (Math.sin(g.tasks.time * 0.3) * 0.15) * dt;
  }

  private updateGirlSighting() {
    const g = this.g;
    const l = this.lucia!;
    const cam = g.engine.camera;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const pos = V(0.4, 0.15, 7.8);
    const toL = pos.clone().setY(0.9).sub(cam.position);
    const d = toL.length();
    const look = fwd.dot(toL.normalize());
    if (!l.visible) {
      // appear only when not looked at, from a distance
      if (look < 0.2 && d > 12 && !this.flags.girlSeenGone) {
        l.pos.copy(pos);
        l.yaw = Math.PI;
        l.def.path = undefined;
        l.setVisible(true);
        this.flags.girlSeenOnce = false;
      }
    } else {
      if (look > 0.9 && d < 40) this.flags.girlSeenOnce = true;
      if ((this.flags.girlSeenOnce && look < 0.4) || d < 8) {
        l.setVisible(false);
        this.flags.girlSeenGone = true;
        if (this.flags.girlSeenOnce) g.tasks.run(() => g.think('¿Había una niña en el kiosco…? Ya no está.'));
      }
    }
  }

  private updateMirror() {
    const g = this.g;
    // the reflector re-renders the whole scene: only keep it active inside the house
    if (g.house.mirror) g.house.mirror.visible = g.zoneName === 'house' && g.player.pos.z < -66;
    if (!this.mirrorArmed || !g.house.mirror) return;
    const m = g.house.mirror;
    const cam = g.engine.camera;
    if (g.zoneName !== 'house') return;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const to = m.position.clone().sub(cam.position);
    const d = to.length();
    if (d > 5 || fwd.dot(to.normalize()) < 0.9) return;
    this.mirrorArmed = false;
    // place the entity figure behind the player, visible only in the mirror (layer 3)
    const e = g.entity;
    const behind = g.player.pos.clone().addScaledVector(g.player.forward, -1.6);
    e.root.visible = true;
    e.root.position.copy(behind);
    e.root.rotation.y = Math.atan2(g.player.pos.x - behind.x, g.player.pos.z - behind.z);
    e.root.traverse((o) => o.layers.set(3));
    g.sfx('stinger_low', undefined, 0.55);
    g.sfx('jingle_bells_small', behind.clone().setY(1.5), 0.5);
    g.tasks.run(async () => {
      await g.wait(1.6);
      e.root.traverse((o) => o.layers.set(0));
      if (e.mode === 'off') e.root.visible = false;
      await g.think('Había alguien detrás de mí. En el espejo. Aquí no hay nadie.');
    });
  }

  // ======================================================================= MISC
  /** objective text shown now, and the ones already done (journal) */
  currentObjective: string | null = null;
  objectiveLog: string[] = [];
  /** where the waypoint points for the current objective (null = no marker) */
  objectiveTarget: (() => THREE.Vector3 | null) | null = null;
  /** what to do once at the target (shown under the objective when you get close) */
  objectiveArrive: string | null = null;
  arrived = false;

  objective(t: string | null) {
    const g = this.g;
    if (t === this.currentObjective) return;
    if (this.currentObjective && !this.objectiveLog.includes(this.currentObjective)) this.objectiveLog.push(this.currentObjective);
    this.currentObjective = t;
    this.arrived = false;
    this.objectiveArrive = null;
    this.objectiveTarget = t ? this.targetFor(t) : null;
    g.ui.objective(t);
    if (t) g.sfx('ui_note', undefined, 0.35, { bus: 'ui' });
  }

  /** the place each objective is about (waypoint) and what to do once you get there */
  private targetFor(t: string): (() => THREE.Vector3 | null) | null {
    const r = this.objectiveRule(t);
    this.objectiveArrive = r?.[2] ?? null;
    return r?.[1] ?? null;
  }

  private objectiveRule(t: string): [RegExp, () => THREE.Vector3 | null, string?] | null {
    const g = this.g;
    const it = (id: string) => () => g.world.interactables.find((i) => i.id === id)?.pos.clone() ?? null;
    const at = (x: number, y: number, z: number) => () => V(x, y, z);
    const rules: [RegExp, () => THREE.Vector3 | null, string?][] = [
      [/Espera tu taxi/, at(0, 1.2, 30.5), 'Espera aquí. El taxi llega a las 12:05.'],
      [/Dónde se fueron todos/, () => (this.flags.guardLight ? null : g.world.interactables.find((i) => i.id === 'flashlight')?.pos.clone() ?? null), 'Recoge la linterna del suelo (E).'],
      [/Sal de la plaza/, at(0, 1.2, 31), 'Sigue la calle hasta el final.'],
      [/iglesia está abierta|Huye a la iglesia/, at(0, 2, -37), 'Entra a la iglesia.'],
      [/confesionario/, it('confesionario'), 'Entra al confesionario (E) y escucha.'],
      [/organillo/, it('organillo'), 'Sube al kiosco y examina el organillo (E).'],
      [/Sigue a la niña/, () => (this.lucia?.visible ? this.lucia.pos.clone().setY(1.2) : V(-22, 1.2, -33))],
      [/Explora la casa/, () => g.house.frontDoor.hingePos.clone().setY(1.5), 'Revisa la cocina, las notas y los cuartos.'],
      [/radio de la cocina/, it('radio'), 'Gira el dial y detente en cada estación.'],
      [/puerta del patio/, () => g.house.lucyDoor.hingePos.clone().setY(1.5), 'Cruza la puerta del patio.'],
      [/Fotografía el cuarto/, at(-28.2, 1.6, -55.2), 'Levanta la cámara (Q) y toma la foto (clic).'],
      [/velas del candelabro/, () => g.church.candelabrum.candles[3].pos.clone(), 'Enciende las velas como en la foto (Tab → Fotos).'],
      [/Sube al campanario/, () => (g.zoneName === 'tower' || g.zoneName === 'belfry' ? V(-11.25, 19.2, -38.7) : V(-6.8, 1.5, -39.4)), 'Sube las escaleras de la torre hasta arriba.'],
      [/mecanismo|Repara el mecanismo/, it('mecanismo'), 'Usa el mecanismo (E).'],
      [/engranes en la relojería/, it('relojMaestro'), 'Pon en el reloj maestro la hora en que se paró el reloj de la iglesia.'],
      [/Toca el alba/, at(-11.25, 19.6, -39.3), 'Lee la inscripción y toca las campanas en ese orden (E).'],
      [/planta de luz/, it('planta'), 'Arranca la planta (E): jala cuando la marca pase por la zona clara.'],
      [/interruptores/, it('tablero'), 'Abre el tablero (E). No subas todas a la vez.'],
      [/Ve al taxi/, it('taxi'), 'Sube al taxi (E).'],
      [/Don Refugio/, it('refugio'), 'Habla con él (E).'],
    ];
    for (const r of rules) if (r[0].test(t)) return r;
    return null;
  }

  hintOnce(key: string, html: string, dur = 4) {
    if (this.hintsShown.has(key)) return;
    this.hintsShown.add(key);
    this.g.ui.hint(html, dur);
  }

  private playCassette() {
    const g = this.g;
    const pos = g.stage.console.clone();
    g.sfx('radio_click_on', pos, 0.6);
    g.tasks.run(async () => {
      const h = g.audio.play('loop_radio_static', { loop: true, volume: 0.12, ref: 2 }, pos);
      await g.say('Cassette', 'Probando, probando… uno, dos. ¿Sí se oye allá atrás?', 'radio', pos);
      await g.say('Cassette · voz de niña', '¿Me tocan la canción de la cajita? ¡Es para mi hermano!', 'radioLucia', pos);
      await g.say('Cassette', 'Ahorita que regrese tu hermano, mija. ¿Dónde anda?', 'radio', pos);
      await g.say('Cassette · voz de niña', 'Fue a la cantina. Dijo que ahorita volvía. Yo lo espero en el kiosco.', 'radioLucia', pos);
      h?.stop(0.5);
      g.give('cassette');
      await g.think('«Yo lo espero en el kiosco».');
    });
  }

  // ======================================================================= TITLE SCENE
  titleScene() {
    const g = this.g;
    this.resetState();
    this.stage = S.PROLOGUE;
    this.applyWorld();
    this.npcs.forEach((n) => n.setVisible(false));
    g.amb.enabled = false;
    g.amb.stopAll();
    g.amb.set('wind', 0.6);
    g.amb.set('crickets', 0.7);
    g.amb.set('flags', 0.6);
    g.music.set('plaza', 0.45, 2);
    g.music.set('cantina', 0, 0.5);
    g.music.set('musician', 0, 0.5);
    g.ui.setHud(false);
  }

  titleUpdate(dt: number) {
    const g = this.g;
    this.titleAngle += dt * 0.035;
    const a = this.titleAngle + 2.2;
    const cam = g.engine.camera;
    // orbit between the kiosk and the ring of laurels so no crown blocks the view
    cam.position.set(Math.cos(a) * 10.5, 2.4 + Math.sin(this.titleAngle * 0.7) * 0.3, Math.sin(a) * 10.5);
    cam.lookAt(0, 3.4, 0);
  }
}

export type { Doc };
export { World };
