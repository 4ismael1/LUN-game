import * as THREE from 'three';
import { Engine } from '../core/engine';
import { Input } from '../core/input';
import { Assets } from '../core/assets';
import { settings, onSettings } from '../core/settings';
import { AudioEngine } from '../audio/audio';
import { Music } from '../audio/music';
import { VoiceSynth, VOICES } from '../audio/voice';
import { UI } from '../ui/ui';
import { Materials, TEXTURE_SETS } from '../world/materials';
import { World, Interactable, HideSpot } from '../world/world';
import { buildPlaza, PlazaRefs } from '../world/build/plaza';
import { buildTown, TownRefs } from '../world/build/town';
import { buildChurch, ChurchRefs } from '../world/build/church';
import { buildMarket, MarketRefs } from '../world/build/market';
import { buildHouse, HouseRefs } from '../world/build/house';
import { buildStage, StageRefs } from '../world/build/stage';
import { buildStreets, LoopStreet } from '../world/build/streets';
import { buildSky, Sky } from '../world/build/sky';
import { drawSymbol } from '../world/canvasTex';
import { Player } from './player';
import { Entity } from './entity';
import { NavGrid } from './nav';
import { Ambience } from './ambience';
import { Tasks, CANCEL } from './tasks';
import { ITEMS, itemIcon, MEMORY_IDS } from './items';
import { Story } from './story';
import { CREDITS_HTML } from './credits';
import { HandFlashlight } from './flashlight';

export const MODEL_LIST = [
  'npc_man', 'npc_man2', 'npc_woman', 'npc_woman2', 'npc_old', 'npc_child', 'cat', 'dog', 'bench', 'potted_plant_1', 'potted_plant_2', 'potted_plant_3',
  'vase', 'candle', 'candle_wood', 'church_bell', 'wardrobe', 'table_wood', 'chair_wood', 'books', 'bottle', 'stool', 'tv_old', 'radio_vintage', 'shelf',
  'cardboard_box', 'fruit_crate_1', 'fruit_crate_2', 'pot', 'clay_pot', 'plastic_chair', 'barrel', 'crate', 'broom', 'bucket', 'ukulele', 'bicycle',
  'trash_bin', 'sofa', 'armchair', 'bed', 'lantern', 'guitar', 'camera', 'speaker', 'drum', 'mic_stand', 'mug', 'gear',
];
export const AUDIO_LIST = (
  'bell_church bell_church_far bell_small bells_toll_sequence birds_dawn bottle_clink broom_sweep bus_pass camera_eject camera_shutter candle_whoosh car_horn_far car_pass cat_meow chain_rattle chair_drag child_laugh child_run clock_tick cloth_rustle creature_breath creature_growl creature_scream creature_step dog_bark_1 dog_bark_2 dog_howl door_close door_creak door_locked door_open door_slam electric_spark flashlight_click footsteps_behind gate_iron_creak gear_clank glass_break jingle_bells_small lock_unlock loop_breath_heavy loop_creaking_wood loop_crickets loop_crowd_distant loop_electric_hum loop_flags loop_fountain loop_heartbeat loop_radio_static loop_rain_light loop_room_church loop_traffic_distant loop_wind loop_wind_strong match_strike mechanism_ratchet metal_creak metal_shutter motorbike_far music_box_wind organ_crank owl_hoot pickup_item pickup_paper plates_clatter power_down power_up radio_click_on radio_tune riser rooster_crow slam_wood step_grass_1 step_grass_2 step_grass_3 step_grass_4 step_stone_1 step_stone_2 step_stone_3 step_stone_4 step_stone_5 step_tile_1 step_tile_2 step_tile_3 step_tile_4 step_wood_1 step_wood_2 step_wood_3 step_wood_4 step_wood_5 stinger_low switch_click thunder_1 thunder_2 ui_back ui_click ui_confirm ui_hover ui_note whisper_1 whisper_2 whisper_3 wood_creak_1 wood_creak_2'
).split(' ');

/** sounds needed on the title and in the first minutes of the prologue */
const CORE_AUDIO = /^(ui_|step_|loop_(wind|crickets|flags)$|pickup_|flashlight_click|cloth_rustle)/;
/** background queue order: prologue first, then what midnight needs */
const SOON_AUDIO = [/^loop_(crowd|traffic|fountain|electric)|car_pass|bus_pass|plates_clatter|metal_shutter|dog_bark/, /^bell|riser|power_down|stinger|creature/];
const nextFrame = () => new Promise<void>((r) => setTimeout(r, 16));

export type GameState = 'loading' | 'title' | 'playing' | 'paused' | 'dead' | 'ending';

export interface Doc {
  id: string;
  title: string;
  html: string;
  cls: string;
}

export class Game {
  engine: Engine;
  audio: AudioEngine;
  music: Music;
  voice: VoiceSynth;
  ui: UI;
  input: Input;
  assets = new Assets();
  mats = new Materials();
  world!: World;
  sky!: Sky;
  player!: Player;
  entity!: Entity;
  nav!: NavGrid;
  amb: Ambience;
  tasks = new Tasks();
  story!: Story;
  plaza!: PlazaRefs;
  town!: TownRefs;
  church!: ChurchRefs;
  market!: MarketRefs;
  house!: HouseRefs;
  stage!: StageRefs;
  streets!: LoopStreet[];
  state: GameState = 'loading';
  overlay: null | 'inventory' | 'reader' | 'puzzle' = null;
  puzzleBlocking = false;
  flashlight: THREE.SpotLight;
  flashTarget: THREE.Object3D;
  hand: HandFlashlight;
  hasFlashlight = false;
  flashOn = false;
  battery = 1;
  spares = 0;
  flashFlicker = 0;
  flickerNoise = 0;
  inventory: string[] = [];
  docs: Doc[] = [];
  photos: { url: string; caption: string }[] = [];
  film = 0;
  hasCamera = false;
  cameraRaised = false;
  focus: Interactable | null = null;
  holdT = 0;
  zoneName = 'plaza';
  zone: import('../world/world').Zone | null = null;
  danger = 0;
  fogDensity = 0.012;
  fogTarget = 0.012;
  fogColor = new THREE.Color(0x0b1018);
  time = 0;
  titleT = 0;
  lastLockLoss = 0;
  heartbeat: import('../audio/audio').SoundHandle | null = null;
  breath: import('../audio/audio').SoundHandle | null = null;
  entityBreath: import('../audio/audio').SoundHandle | null = null;
  playTime = 0;
  photoTargets: { id: string; pos: THREE.Vector3; maxDist: number; cond: () => boolean; onCapture: () => void; done?: boolean }[] = [];
  onPhoto: ((url: string) => void) | null = null;
  private photoCanvas = document.createElement('canvas');
  private tmpV = new THREE.Vector3();
  stepCount = 0;
  cullT = 0;
  lastStep = 0;

  constructor(container: HTMLElement) {
    this.engine = new Engine(container);
    this.audio = new AudioEngine();
    this.music = new Music(this.audio);
    this.voice = new VoiceSynth(this.audio);
    this.ui = new UI();
    this.input = new Input(this.engine.renderer.domElement);
    this.amb = new Ambience(this.audio);
    this.hand = new HandFlashlight(this.engine.camera, this.engine.scene);
    this.flashlight = this.hand.spot;
    this.flashTarget = this.hand.target;
    this.ui.uiSound = (k) => {
      const n = k === 'hover' ? 'ui_hover' : k === 'back' ? 'ui_back' : 'ui_click';
      this.audio.resume();
      this.audio.play(n, { bus: 'ui', volume: k === 'hover' ? 0.25 : 0.5, reverb: 0 });
    };
    this.ui.onAction = (a) => this.onUIAction(a);
    this.photoCanvas.width = 480;
    this.photoCanvas.height = 360;
    (window as any).__drawSymbol = drawSymbol;
    // fog must exist before shaders are warmed up, otherwise the first frame recompiles everything
    this.engine.scene.fog = new THREE.FogExp2(this.fogColor.getHex(), this.fogDensity);
    this.bindInput();
    onSettings(() => {
      this.engine.camera.fov = settings.fov;
      this.engine.camera.updateProjectionMatrix();
    });
  }

  // ---------------------------------------------------------------- loading
  async load() {
    const ui = this.ui;
    ui.setLoading(0.02, 'Preparando…');
    // fonts are needed by the canvas signs; load them alongside everything else
    const fonts = Promise.all(['Cormorant Garamond', 'Alfa Slab One', 'Lobster', 'Caveat', 'IM Fell English SC', 'Special Elite'].map((f) => document.fonts.load(`32px "${f}"`))).catch(() => undefined);
    const textures: string[] = [];
    for (const s of TEXTURE_SETS) for (const k of ['diff', 'nor', 'rough']) textures.push(`${s}/${k}.jpg`);
    textures.push('leaves/cluster.png', 'vines/cluster.png');
    const core = AUDIO_LIST.filter((a) => CORE_AUDIO.test(a));
    await this.assets.loadAll({ textures, models: MODEL_LIST, audio: core, hdr: 'night_1k.hdr' }, this.audio, (f, label) => ui.setLoading(0.03 + f * 0.67, `Cargando ${label}…`));
    await fonts;
    for (const s of TEXTURE_SETS) this.mats.setTextures(s, { diff: this.assets.tex(`${s}/diff.jpg`), nor: this.assets.tex(`${s}/nor.jpg`), rough: this.assets.tex(`${s}/rough.jpg`) });
    for (const k of ['leaves/cluster.png', 'vines/cluster.png']) {
      const t = this.assets.tex(k);
      if (t) t.colorSpace = THREE.SRGBColorSpace;
    }
    if (this.assets.hdr) {
      const pm = new THREE.PMREMGenerator(this.engine.renderer);
      this.assets.hdr.mapping = THREE.EquirectangularReflectionMapping;
      this.mats.envMap = pm.fromEquirectangular(this.assets.hdr).texture;
      pm.dispose();
    }
    ui.setLoading(0.72, 'Levantando la plaza…');
    await nextFrame();
    this.buildWorld();
    ui.setLoading(0.84, 'Encendiendo los faroles…');
    // shader compilation reports no progress; creep the bar so it never looks stuck
    let creep = 0.84;
    const creepT = window.setInterval(() => ui.setLoading((creep += (0.98 - creep) * 0.12), 'Encendiendo los faroles…'), 120);
    await nextFrame();
    await this.warmup();
    clearInterval(creepT);
    ui.setLoading(1, 'Listo');
    (document.getElementById('credits-body') as HTMLElement).innerHTML = CREDITS_HTML;
  }

  /** Runs once the title is on screen: the rest of the sounds and the music samples. */
  loadRest() {
    const rest = AUDIO_LIST.filter((a) => !CORE_AUDIO.test(a));
    const rank = (a: string) => {
      const i = SOON_AUDIO.findIndex((r) => r.test(a));
      return i < 0 ? SOON_AUDIO.length : i;
    };
    rest.sort((a, b) => rank(a) - rank(b));
    this.assets.loadAudioBackground(rest, this.audio).then(() => {
      if (this.assets.missing.length) console.warn('[assets] missing:', this.assets.missing);
    });
    this.music.prewarm();
  }

  /**
   * Compile every shader and upload every texture before the title shows, including
   * objects that are hidden right now (culled props, NPCs, the entity, the hand light),
   * so pressing "Jugar" doesn't stall on the first frames.
   */
  private async warmup() {
    const r = this.engine.renderer;
    const scene = this.engine.scene;
    const hidden: THREE.Object3D[] = [];
    const texs = new Set<THREE.Texture>();
    scene.traverse((o) => {
      if (!o.visible && !(o as THREE.Light).isLight) {
        hidden.push(o);
        o.visible = true;
      }
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      for (const m of Array.isArray(mat) ? mat : [mat])
        for (const v of Object.values(m)) if (v && (v as THREE.Texture).isTexture) texs.add(v as THREE.Texture);
    });
    for (const t of texs) r.initTexture(t);
    try {
      await r.compileAsync(scene, this.engine.camera);
    } catch {
      r.compile(scene, this.engine.camera);
    }
    // one real frame from the spawn point builds shadow / depth programs too
    const cam = this.engine.camera;
    cam.position.set(12.5, 1.7, 20.5);
    cam.lookAt(0, 2, 0);
    this.engine.render();
    for (const o of hidden) o.visible = false;
  }

  buildWorld() {
    const scene = this.engine.scene;
    const w = new World(scene, this.mats, this.assets);
    this.world = w;
    this.sky = buildSky(scene);
    this.plaza = buildPlaza(w);
    this.town = buildTown(w);
    this.church = buildChurch(w);
    this.market = buildMarket(w);
    this.house = buildHouse(w);
    this.stage = buildStage(w);
    this.streets = buildStreets(w);
    // zones (priority: small first)
    w.zone('plaza', -34, -36, 50, 30.5, { priority: 1, reverb: [0.12, 0.1, 0], footstep: 'stone' });
    w.zone('garden', -22, -22, 22, 22, { priority: 2, reverb: [0.1, 0.08, 0], footstep: 'stone' });
    w.zone('kiosk', -5.3, -5.3, 5.3, 5.3, { priority: 3, y0: 1.2, reverb: [0.3, 0.1, 0], footstep: 'wood' });
    w.zone('atrium', -16, -36, 16, -30.5, { priority: 2, reverb: [0.2, 0.2, 0], footstep: 'stone' });
    w.zone('church', -6.5, -86, 6.5, -37.5, { priority: 4, indoor: true, reverb: [0, 0.1, 0.55], footstep: 'tile', fog: 0.6 });
    w.zone('sacristy', 8, -58, 12.5, -50, { priority: 5, indoor: true, reverb: [0.5, 0.1, 0], footstep: 'tile' });
    w.zone('tower', -14.5, -42.5, -6.5, -36, { priority: 5, indoor: true, reverb: [0.2, 0.45, 0.1], footstep: 'wood', y1: 17.6 });
    w.zone('belfry', -14.5, -42.5, -8, -36, { priority: 6, y0: 17.6, reverb: [0.1, 0.25, 0.1], footstep: 'wood' });
    w.zone('arcade', -34, -26, -30, 26, { priority: 2, reverb: [0.35, 0.2, 0], footstep: 'tile' });
    w.zone('shops', -42, -30, -34, 30, { priority: 3, indoor: true, reverb: [0.5, 0.1, 0], footstep: 'tile' });
    w.zone('market', -66, -26, -42, 8, { priority: 3, indoor: true, reverb: [0.2, 0.55, 0], footstep: 'stone', fog: 0.8 });
    w.zone('reloj', -66, -26, -58, -18.5, { priority: 4, indoor: true, reverb: [0.6, 0.05, 0], footstep: 'wood' });
    w.zone('callejon', -24, -80, -20, -31, { priority: 3, reverb: [0.45, 0.2, 0], footstep: 'stone' });
    w.zone('corral', -19.8, -52, -15, -44, { priority: 4, reverb: [0.3, 0.05, 0], footstep: 'grass' });
    w.zone('house', -43, -76, -24, -52, { priority: 4, indoor: true, reverb: [0.55, 0.05, 0], footstep: 'tile' });
    w.zone('patio', -35, -68, -28, -58, { priority: 5, reverb: [0.35, 0.05, 0], footstep: 'stone' });
    w.zone('stage', 30, -12, 50, 12, { priority: 2, reverb: [0.25, 0.2, 0], footstep: 'stone' });
    w.finalize();
    w.setupCulling(['props', 'bulbs', 'signs', 'doors', 'market', 'callejon', 'stage', 'house']);
    // nav grid for the entity
    this.nav = new NavGrid(w.col, w.navBounds.minX, w.navBounds.minZ, w.navBounds.maxX, w.navBounds.maxZ);
    this.nav.build((x, z) => (x > -15 && x < -6.5 && z > -43 && z < -35.5)); // not inside tower
    this.player = new Player(this.engine.camera, w);
    this.player.onStep = (surf, run, crouch) => this.footstep(surf, run, crouch);
    this.entity = new Entity(w, this.nav);
    this.setupEntitySounds();
    this.setupAmbience();
    this.story = new Story(this);
    this.story.setup();
  }

  setupEntitySounds() {
    const e = this.entity;
    e.sound.step = (p, chase) => this.audio.play('creature_step', { volume: chase ? 0.55 : 0.35, rate: 0.85 + Math.random() * 0.2, ref: 3, rolloff: 1.3 }, p.clone().setY(0.3));
    e.sound.jingle = (p) => this.audio.play('jingle_bells_small', { volume: 0.5, rate: 0.9 + Math.random() * 0.25, ref: 3.5, rolloff: 1.2 }, p.clone().setY(1.3));
    e.sound.scream = (p) => this.audio.play('creature_scream', { volume: 0.9, ref: 5 }, p);
    e.sound.door = (d) => {
      const c = d.hingePos;
      this.audio.play(e.state === 'chase' ? 'door_slam' : 'door_creak', { volume: 0.6, ref: 4 }, c.clone().setY(1.2));
    };
    e.onState = (s, prev) => {
      if (s === 'chase' && prev !== 'chase') {
        this.audio.play('creature_growl', { volume: 0.7, ref: 5 }, e.pos.clone().setY(2));
        this.audio.play('stinger_low', { volume: 0.5, bus: 'sfx', reverb: 0.3 });
        this.player.emit(0, 'none');
      }
      if (s === 'lost' || s === 'search') {
        if (prev === 'chase') this.story.onEntityLost();
      }
    };
    e.onCatch = () => this.gameOver('La Desvelada te alcanzó.');
  }

  setupAmbience() {
    const a = this.amb;
    a.loop('crowd', 'loop_crowd_distant', { base: 0.55 });
    a.loop('traffic', 'loop_traffic_distant', { base: 0.35 });
    a.loop('crickets', 'loop_crickets', { base: 0.4 });
    a.loop('wind', 'loop_wind', { base: 0.5 });
    a.loop('windStrong', 'loop_wind_strong', { base: 0.45 });
    a.loop('fountain', 'loop_fountain', { pos: new THREE.Vector3(0, 1.5, -14), ref: 2.5, base: 0.7 });
    a.loop('flags', 'loop_flags', { pos: new THREE.Vector3(0, 5, 0), ref: 6, base: 0.5 });
    a.loop('hum', 'loop_electric_hum', { pos: new THREE.Vector3(12, 3, -33), ref: 2.5, base: 0.4 });
    a.loop('hum2', 'loop_electric_hum', { pos: new THREE.Vector3(-30.5, 3.6, -1), ref: 2.5, base: 0.35 });
    a.loop('church', 'loop_room_church', { indoorMuffle: false, base: 0.55 });
    a.loop('rain', 'loop_rain_light', { base: 0.5 });
    a.loop('creak', 'loop_creaking_wood', { indoorMuffle: false, base: 0.5 });
    a.loop('static', 'loop_radio_static', { pos: new THREE.Vector3(-41.2, 3, 1.5), ref: 2, base: 0.25 });
    a.loop('clocks', 'clock_tick', { pos: new THREE.Vector3(-62, 1.8, -22), ref: 2, base: 0.6, indoorMuffle: false });
    a.randomPositions = () => {
      const p = this.player.pos;
      return new THREE.Vector3(p.x + (Math.random() - 0.5) * 30, 3.5, p.z + (Math.random() - 0.5) * 30);
    };
    a.onThunder = () => this.story.lightning();
  }

  // ---------------------------------------------------------------- input / UI
  bindInput() {
    const canvas = this.engine.renderer.domElement;
    canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked && !this.overlay) this.input.requestLock();
    });
    this.input.onLockFail = () => this.ui.lockHint(this.state === 'playing' && !this.overlay && !this.input.locked);
    this.input.onLockChange((locked) => {
      this.ui.lockHint(!locked && this.state === 'playing' && !this.overlay);
      if (!locked && this.state === 'playing' && !this.overlay) {
        this.lastLockLoss = performance.now();
        this.pause();
      }
    });
    this.input.onKey((code) => {
      if (code === 'Escape') {
        if (this.overlay === 'reader') this.closeReader();
        else if (this.overlay === 'inventory') this.closeInventory();
        else if (this.overlay === 'puzzle' && this.story.puzzles.canEscape()) this.story.puzzles.close(false);
        else if (this.state === 'paused' && this.ui.top() === 'pause') this.resume();
        else if (this.state === 'paused' && this.ui.top() !== 'pause') {
          this.ui.pop();
        }
        return;
      }
      if (this.state !== 'playing') return;
      if (code === 'Tab') {
        if (this.overlay === 'inventory') this.closeInventory();
        else if (!this.overlay) this.openInventory();
      }
      if (this.overlay === 'reader' && (code === 'KeyE' || code === 'Space' || code === 'Enter')) this.closeReader();
    });
    document.getElementById('reader')!.addEventListener('click', () => this.closeReader());
  }

  onUIAction(act: string) {
    this.audio.resume();
    switch (act) {
      case 'play':
        this.newGame();
        break;
      case 'continue':
        this.continueGame();
        break;
      case 'controls':
        this.ui.push('controls');
        break;
      case 'settings':
        this.ui.push('settings');
        break;
      case 'credits':
        if (this.state === 'ending') {
          this.ui.hide('ending');
          this.ui.clearStack();
          this.ui.push('ending');
        }
        this.ui.push('credits');
        break;
      case 'back': {
        const prev = this.ui.pop();
        if (!prev && this.state === 'title') this.ui.show('title');
        break;
      }
      case 'resume':
        this.resume();
        break;
      case 'checkpoint':
        this.ui.clearStack();
        this.retry();
        break;
      case 'restart':
        this.ui.clearStack();
        this.newGame();
        break;
      case 'quit':
        this.toTitle();
        break;
      case 'retry':
        this.ui.hide('gameover');
        this.retry();
        break;
      case 'again':
        this.ui.hide('ending');
        this.ui.clearStack();
        this.newGame();
        break;
      case 'close-inv':
        this.closeInventory();
        break;
    }
  }

  toTitle() {
    this.state = 'title';
    this.tasks.reset();
    this.ui.clearStack();
    ['pause', 'gameover', 'ending', 'inventory', 'reader', 'puzzle'].forEach((s) => this.ui.hide(s as any));
    this.overlay = null;
    this.ui.setHud(false);
    this.ui.clearSubs();
    this.ui.viewfinder(false);
    this.ui.hideView(null);
    this.input.exitLock();
    this.hand.model.visible = false;
    this.ui.show('title');
    this.ui.fade(0, 0.8);
    (document.getElementById('btn-continue') as HTMLElement).classList.toggle('hidden', !this.story.hasSave());
    this.story.titleScene();
  }

  newGame() {
    this.audio.resume();
    this.ui.hide('title');
    this.ui.clearStack();
    this.story.clearSave();
    this.startPlaying(() => this.story.newGame());
  }

  continueGame() {
    this.audio.resume();
    this.ui.hide('title');
    this.ui.clearStack();
    this.startPlaying(() => this.story.loadSave());
  }

  retry() {
    this.ui.clearStack();
    this.startPlaying(() => this.story.restoreCheckpoint());
  }

  private startPlaying(init: () => void) {
    this.ui.hide('title');
    this.ui.fade(1, 0.01);
    this.state = 'playing';
    this.overlay = null;
    this.ui.setHud(true);
    this.ui.viewfinder(false);
    this.ui.hideView(null);
    this.ui.clearSubs();
    this.cameraRaised = false;
    this.tasks.reset();
    init();
    this.input.requestLock();
    setTimeout(() => this.ui.fade(0, 1.6), 150);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.push('pause');
    this.audio.duck(0.3);
    this.audio.setMuffle(1200);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.ui.clearStack();
    this.state = 'playing';
    this.audio.duck(1);
    this.audio.setMuffle(20000);
    this.input.requestLock();
  }

  // ---------------------------------------------------------------- inventory & docs
  give(id: string, silent = false) {
    if (!this.inventory.includes(id) || id === 'pilas') this.inventory.push(id);
    if (!silent) {
      this.audio.play(ITEMS[id]?.memory ? 'ui_note' : 'pickup_item', { bus: 'ui', volume: 0.6 });
      const it = ITEMS[id];
      if (it) this.ui.itemCard(itemIcon(id), it.name, !!it.memory);
    }
    if (ITEMS[id]?.memory) this.story.onMemory(id);
  }
  has(id: string) {
    return this.inventory.includes(id);
  }
  take(id: string) {
    const i = this.inventory.indexOf(id);
    if (i >= 0) this.inventory.splice(i, 1);
  }
  memories() {
    return MEMORY_IDS.filter((m) => this.inventory.includes(m));
  }

  addDoc(d: Doc) {
    if (!this.docs.find((x) => x.id === d.id)) this.docs.push(d);
  }

  read(d: Doc) {
    this.addDoc(d);
    this.audio.play('pickup_paper', { bus: 'ui', volume: 0.7 });
    this.overlay = 'reader';
    this.input.exitLock();
    this.ui.reader(d.html, d.cls);
  }
  closeReader() {
    if (this.overlay !== 'reader') return;
    this.ui.pop();
    this.overlay = null;
    this.audio.play('pickup_paper', { bus: 'ui', volume: 0.4, rate: 1.2 });
    this.input.requestLock();
  }

  private invTab = 'items';
  openInventory() {
    this.overlay = 'inventory';
    this.input.exitLock();
    const grid = document.getElementById('inv-items')!;
    const detail = document.getElementById('inv-detail')!;
    const docs = document.getElementById('inv-docs')!;
    const photos = document.getElementById('inv-photos')!;
    const tabs = document.querySelectorAll<HTMLButtonElement>('.inv-tab');
    const showTab = (t: string) => {
      this.invTab = t;
      tabs.forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
      grid.classList.toggle('hidden', t !== 'items');
      docs.classList.toggle('hidden', t !== 'docs');
      photos.classList.toggle('hidden', t !== 'photos');
      detail.classList.toggle('hidden', t !== 'items');
    };
    tabs.forEach(
      (b) =>
        (b.onclick = () => {
          this.audio.play('ui_click', { bus: 'ui', volume: 0.4 });
          showTab(b.dataset.tab!);
        }),
    );
    const renderDetail = (id: string | null) => {
      detail.innerHTML = '';
      if (!id) {
        detail.innerHTML = '<div class="empty">Selecciona un objeto</div>';
        return;
      }
      const it = ITEMS[id];
      const big = document.createElement('div');
      big.className = 'big';
      big.appendChild(itemIcon(id));
      detail.appendChild(big);
      const h = document.createElement('h3');
      h.textContent = it.name;
      detail.appendChild(h);
      const p = document.createElement('p');
      let extra = '';
      if (id === 'linterna') extra = ` Batería: ${Math.round(this.battery * 100)}% · pilas de repuesto: ${this.spares}.`;
      if (id === 'camara') extra = ` Quedan ${this.film} fotos.`;
      p.textContent = it.desc.replace(/\s*\(Tab.*?\)/, '') + extra;
      detail.appendChild(p);
      const action = (label: string, fn: () => void) => {
        const b = document.createElement('button');
        b.className = 'act';
        b.textContent = label;
        b.onclick = fn;
        detail.appendChild(b);
      };
      if (id === 'tamal')
        action('Comer', () => {
          this.take('tamal');
          this.player.stamina = 1;
          this.player.exhausted = false;
          this.audio.play('cloth_rustle', { bus: 'ui', volume: 0.5 });
          this.closeInventory();
          this.tasks.run(() => this.think('Rajas con queso. Sabe a las mañanas de Candelaria de cuando era niño.'));
        });
      if (id === 'linterna')
        action(this.flashOn ? 'Guardar' : 'Sacar', () => {
          this.closeInventory();
          this.toggleFlash();
        });
    };
    grid.innerHTML = '';
    const counts = new Map<string, number>();
    for (const id of this.inventory) if (ITEMS[id]) counts.set(id, (counts.get(id) ?? 0) + 1);
    const ids = [...counts.keys()];
    const total = Math.max(12, Math.ceil(ids.length / 4) * 4);
    let first: HTMLElement | null = null;
    for (let i = 0; i < total; i++) {
      const el = document.createElement('div');
      const id = ids[i];
      el.className = 'inv-slot' + (id ? '' : ' empty') + (id && ITEMS[id].memory ? ' mem' : '');
      if (id) {
        el.appendChild(itemIcon(id));
        const n = counts.get(id)!;
        if (n > 1) {
          const c = document.createElement('span');
          c.className = 'cnt';
          c.textContent = '×' + n;
          el.appendChild(c);
        }
        el.title = ITEMS[id].name;
        el.addEventListener('click', () => {
          grid.querySelectorAll('.inv-slot').forEach((x) => x.classList.remove('sel'));
          el.classList.add('sel');
          this.audio.play('ui_click', { bus: 'ui', volume: 0.4 });
          renderDetail(id);
        });
        if (!first) first = el;
      }
      grid.appendChild(el);
    }
    renderDetail(null);
    if (first) {
      first.classList.add('sel');
      renderDetail(ids[0]);
    }
    docs.innerHTML = this.docs.length ? '' : '<div class="note">Todavía no has leído nada.</div>';
    for (const d of this.docs) {
      const b = document.createElement('button');
      b.className = 'inv-doc';
      b.textContent = d.title;
      b.addEventListener('click', () => {
        this.closeInventory(false);
        this.read(d);
      });
      docs.appendChild(b);
    }
    photos.innerHTML = this.photos.length ? '' : '<div class="note">No has tomado fotografías.</div>';
    this.photos.forEach((p) => {
      const el = document.createElement('div');
      el.className = 'inv-photo';
      const img = document.createElement('img');
      img.src = p.url;
      el.appendChild(img);
      el.title = p.caption;
      el.addEventListener('click', () => {
        this.closeInventory(false);
        this.read({ id: 'photo-view', title: 'Foto', html: `<img src="${p.url}" alt=""/>${p.caption}`, cls: 'photo' });
        this.docs = this.docs.filter((x) => x.id !== 'photo-view');
      });
      photos.appendChild(el);
    });
    const mem = this.memories().length;
    document.getElementById('inv-memories')!.textContent = mem ? `✦ Recuerdos: ${mem} de 5` : '';
    showTab(this.invTab);
    this.ui.push('inventory');
    this.audio.play('cloth_rustle', { bus: 'ui', volume: 0.6 });
  }
  closeInventory(relock = true) {
    if (this.overlay !== 'inventory') return;
    this.ui.pop();
    this.overlay = null;
    if (relock) this.input.requestLock();
  }

  // ---------------------------------------------------------------- dialogue
  /** speak a line with babble voice and subtitle */
  async say(who: string, text: string, voiceKey: string, pos?: THREE.Vector3, minDur = 0) {
    const gen = this.tasks.gen;
    const prof = VOICES[voiceKey] ?? VOICES.julian;
    const d = this.voice.speak(text, prof, pos);
    await this.ui.sub(who, text, Math.max(minDur, d * 0.9 + 0.35, 1.3 + text.length * 0.036));
    this.tasks.check(gen);
  }
  async think(text: string, dur?: number) {
    const gen = this.tasks.gen;
    await this.ui.sub('', text, dur ?? Math.max(2.0, 1.1 + text.length * 0.045), true);
    this.tasks.check(gen);
  }
  wait(s: number) {
    const gen = this.tasks.gen;
    return this.tasks.wait(s).then(() => this.tasks.check(gen));
  }
  until(pred: () => boolean, timeout = Infinity) {
    const gen = this.tasks.gen;
    return this.tasks.until(pred, timeout).then(() => this.tasks.check(gen));
  }

  // ---------------------------------------------------------------- sounds
  footstep(surf: string, run: boolean, crouch: boolean) {
    const counts: Record<string, number> = { stone: 5, wood: 5, tile: 4, grass: 4 };
    const n = counts[surf] ?? 5;
    let k = 1 + Math.floor(Math.random() * n);
    if (k === this.lastStep) k = (k % n) + 1;
    this.lastStep = k;
    const vol = (crouch ? 0.18 : run ? 0.75 : 0.42) * (surf === 'wood' ? 1.1 : 1);
    this.audio.play(`step_${surf}_${k}`, { volume: vol, rate: 0.92 + Math.random() * 0.16, reverb: 0.25 }, this.player.pos.clone().setY(0.1));
    this.stepCount++;
  }

  sfx(name: string, pos?: THREE.Vector3, vol = 0.7, opts: import('../audio/audio').PlayOpts = {}) {
    return this.audio.play(name, { volume: vol, ...opts }, pos);
  }

  // ---------------------------------------------------------------- hiding
  enterHide(h: HideSpot) {
    const p = this.player;
    const seenEntering = this.entity.canSeePlayer && this.entity.distToPlayer < 7;
    p.hidden = h;
    p.hideLook = { yaw: 0, pitch: 0 };
    this.ui.hideView(h.kind === 'confessional' ? 'confessional' : h.kind);
    this.sfx(h.kind === 'locker' ? 'metal_creak' : h.kind === 'wardrobe' ? 'door_creak' : 'cloth_rustle', h.inside, 0.5);
    if (this.flashOn) this.toggleFlash();
    this.entity.hiddenSeen = seenEntering;
    this.story.onHide(h, seenEntering);
  }
  exitHide() {
    const p = this.player;
    const h = p.hidden;
    if (!h) return;
    p.hidden = null;
    this.ui.hideView(null);
    p.teleport(h.exit, p.yaw, 0);
    this.sfx('cloth_rustle', h.exit, 0.4);
  }

  // ---------------------------------------------------------------- flashlight
  toggleFlash() {
    if (!this.hasFlashlight) return;
    if (!this.flashOn && this.battery <= 0.001) {
      this.sfx('flashlight_click', undefined, 0.5);
      this.ui.hint('La linterna no tiene pilas.', 2.5);
      return;
    }
    this.flashOn = !this.flashOn;
    this.sfx('cloth_rustle', undefined, 0.25);
    this.sfx('flashlight_click', undefined, 0.6, { delay: this.flashOn ? 0.18 : 0 });
    this.player.emit(3, 'click');
  }

  updateFlashlight(dt: number) {
    if (this.flashOn) {
      this.battery = Math.max(0, this.battery - dt / 330);
      if (this.battery <= 0) {
        if (this.spares > 0) {
          this.spares--;
          this.take('pilas');
          this.battery = 1;
          this.sfx('switch_click', undefined, 0.6);
          this.ui.toast('Linterna', 'Cambiaste las pilas.');
        } else {
          this.flashOn = false;
          this.ui.hint('La linterna se apagó. Busca pilas.', 3);
        }
      }
    }
    let f = 1;
    const ed = this.entity.root.visible ? this.entity.pos.distanceTo(this.player.pos) : 99;
    // electrical interference when she is near
    if (ed < 12) {
      this.flickerNoise += dt * (14 - ed);
      if (Math.sin(this.flickerNoise * 1.7) * Math.sin(this.flickerNoise * 0.63) > 0.55 - (12 - ed) * 0.04) f *= 0.05 + Math.random() * 0.25;
    }
    // weak battery: dimmer, warmer and unstable
    if (this.battery < 0.2) {
      f *= 0.55 + this.battery * 2.2;
      if (Math.random() < dt * 1.5) this.flashFlicker = 0.15 + Math.random() * 0.3;
    }
    if (this.flashFlicker > 0) {
      this.flashFlicker -= dt;
      f *= Math.random() < 0.5 ? 0.08 : 0.9;
    }
    // warm tint when weak
    this.flashlight.color.setRGB(1, 0.94 - (1 - this.battery) * 0.06, 0.84 - (1 - this.battery) * 0.16);
    const held = this.hasFlashlight && this.flashOn && !this.cameraRaised && !this.player.hidden && this.state === 'playing';
    this.hand.setHeld(held);
    const q = settings.quality;
    // castShadow stays fixed: toggling it changes the light setup and recompiles every
    // shader in the scene (a long freeze each time F was pressed). Only skip the render.
    this.flashlight.castShadow = q !== 'bajo';
    this.flashlight.shadow.autoUpdate = this.flashOn;
    this.hand.update(dt, this.flashOn && !this.player.hidden, f * this.hand.raise, this.player.lastDX, this.player.lastDY, this.player.moveSpeed, this.player.running, (o, d, m) => this.world.col.rayDist(o, d, m));
    this.ui.battery(this.hasFlashlight ? this.battery : null);
  }

  // ---------------------------------------------------------------- camera (photos)
  takePhoto() {
    if (!this.hasCamera) return;
    if (this.film <= 0) {
      this.sfx('switch_click', undefined, 0.5);
      this.ui.hint('No queda película.', 2);
      return;
    }
    this.film--;
    this.ui.film(this.film);
    const r = this.engine.renderer;
    const cam = this.engine.camera;
    // flash burst via the flashlight (no extra lights → no shader recompiles)
    const prevI = this.flashlight.intensity, prevA = this.flashlight.angle, prevD = this.flashlight.distance;
    this.flashlight.intensity = 90;
    this.flashlight.angle = 1.0;
    this.flashlight.distance = 30;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    this.flashlight.position.copy(cam.position);
    this.flashTarget.position.copy(cam.position).addScaledVector(fwd, 6);
    this.flashTarget.updateMatrixWorld();
    cam.layers.enable(World.SPIRIT);
    r.setRenderTarget(null);
    r.render(this.engine.scene, cam);
    const src = r.domElement;
    const g = this.photoCanvas.getContext('2d')!;
    const W = this.photoCanvas.width, H = this.photoCanvas.height;
    const sw = src.width, sh = src.height;
    const cw = Math.min(sw, (sh * W) / H), ch = cw * (H / W);
    g.filter = 'sepia(0.35) contrast(1.15) saturate(0.8) brightness(1.15)';
    g.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, W, H);
    g.filter = 'none';
    // vignette + grain
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(20,10,0,0.55)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,240,220' : '0,0,0'},${Math.random() * 0.12})`;
      g.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
    }
    cam.layers.disable(World.SPIRIT);
    this.flashlight.intensity = prevI;
    this.flashlight.angle = prevA;
    this.flashlight.distance = prevD;
    const url = this.photoCanvas.toDataURL('image/jpeg', 0.82);
    this.ui.flash(0.85, 0.5);
    this.sfx('camera_shutter', undefined, 0.8);
    this.sfx('camera_eject', undefined, 0.5, { delay: 0.25 });
    this.player.emit(9, 'photo');
    // photo targets
    let caption = '';
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    for (const t of this.photoTargets) {
      if (t.done || !t.cond()) continue;
      const d = t.pos.distanceTo(cam.position);
      if (d > t.maxDist) continue;
      if (!frustum.containsPoint(t.pos)) continue;
      const toT = t.pos.clone().sub(cam.position).normalize();
      if (toT.dot(fwd) < 0.8) continue;
      if (this.world.col.blocked(cam.position, cam.position.clone().lerp(t.pos, 0.92))) continue;
      t.done = true;
      caption = t.id;
      t.onCapture();
      break;
    }
    this.photos.push({ url, caption: this.story.photoCaption(caption) });
    this.onPhoto?.(url);
    this.story.showPolaroid(url);
  }

  // ---------------------------------------------------------------- game over / ending
  gameOver(reason: string) {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.story.puzzles.close(false, true);
    this.overlay = null;
    const e = this.entity;
    this.player.lookOverride = { target: new THREE.Vector3(e.pos.x, 2.1, e.pos.z), strength: 12 };
    e.sound.scream(e.pos.clone().setY(2));
    this.player.camShake = 1;
    this.ui.flash(0.4, 0.3);
    this.music.set('chase', 0, 0.5);
    this.music.set('danger', 0, 0.8);
    setTimeout(() => {
      this.ui.fade(1, 0.6);
      this.audio.duck(0.1, 0.4);
    }, 700);
    setTimeout(() => {
      this.player.lookOverride = null;
      this.input.exitLock();
      this.ui.setHud(false);
      this.ui.clearSubs();
      this.ui.hideView(null);
      this.ui.viewfinder(false);
      (document.getElementById('go-sub') as HTMLElement).textContent = reason;
      this.ui.show('gameover');
      this.audio.duck(1, 1);
      this.entity.hide();
      this.tasks.reset();
    }, 1900);
  }

  // ---------------------------------------------------------------- main loop
  start() {
    let last = performance.now();
    const loop = () => {
      requestAnimationFrame(loop);
      const now = performance.now();
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.1) dt = 0.1;
      this.frame(dt);
    };
    requestAnimationFrame(loop);
  }

  frame(dt: number) {
    this.time += dt;
    const t = this.time;
    this.mats.uniforms.uTime.value = t;
    this.sky.uniforms.uTime.value = t;
    if (this.state === 'title') {
      this.story.titleUpdate(dt);
    } else if (this.state === 'playing' || this.state === 'dead') {
      this.update(dt);
    }
    // world animation always runs (even paused we keep sky etc. still)
    this.cullT -= dt;
    if (this.cullT <= 0) {
      this.cullT = 0.25;
      this.world.cull(this.engine.camera.position, this.player.pos.y > 12 ? 90 : 48);
    }
    if (this.state !== 'paused') {
      this.world.update(dt, t);
      this.world.lights.update(dt, t, this.engine.camera);
      this.music.update(dt);
      this.amb.listener.copy(this.engine.camera.position);
      this.amb.update(this.state === 'playing' ? dt : 0);
    }
    this.audio.updateListener(this.engine.camera);
    this.sky.update(dt, this.engine.camera.position);
    this.updateFog(dt);
    this.engine.render();
    this.input.endFrame();
  }

  update(dt: number) {
    const p = this.player;
    const inp = this.input;
    const playing = this.state === 'playing';
    if (playing) this.playTime += dt;
    this.tasks.update(dt);
    // zone
    const z = this.world.zoneAt(p.pos.clone().setY(p.pos.y + 1));
    this.zone = z;
    const zn = z?.name ?? 'plaza';
    if (zn !== this.zoneName) {
      const prev = this.zoneName;
      this.zoneName = zn;
      this.story.onZone(zn, prev);
    }
    this.amb.indoor = !!z?.indoor;
    const rv = z?.reverb ?? [0.1, 0.1, 0];
    this.audio.setReverb(rv[0], rv[1], rv[2]);
    // input actions
    const blocked = !!this.overlay && this.overlay !== 'puzzle';
    const inPuzzle = this.overlay === 'puzzle';
    p.canMove = playing && !blocked && !inPuzzle && !this.story.lockMove;
    p.canLook = playing && !blocked && !inPuzzle && inp.locked;
    if (playing && !this.overlay && inp.locked) {
      if (inp.hit('KeyF')) this.toggleFlash();
      if ((inp.hit('KeyQ') || inp.rightClicked) && this.hasCamera && !p.hidden) {
        this.cameraRaised = !this.cameraRaised;
        this.ui.viewfinder(this.cameraRaised);
        this.sfx('cloth_rustle', undefined, 0.3);
        if (this.cameraRaised) this.story.hintOnce('camera-use', '<kbd>Clic</kbd> fotografiar · <kbd>Q</kbd> bajar la cámara', 4);
      }
      if (this.cameraRaised && inp.mouseClicked) this.takePhoto();
    }
    if (this.cameraRaised) {
      this.engine.camera.fov += (settings.fov * 0.72 - this.engine.camera.fov) * Math.min(1, dt * 8);
      this.engine.camera.updateProjectionMatrix();
    } else if (Math.abs(this.engine.camera.fov - settings.fov) > 0.05) {
      this.engine.camera.fov += (settings.fov - this.engine.camera.fov) * Math.min(1, dt * 8);
      this.engine.camera.updateProjectionMatrix();
    }
    p.update(dt, inp, z?.footstep ?? 'stone');
    this.story.update(dt);
    this.updateInteraction(dt);
    this.updateFlashlight(dt);
    // entity
    const lit = this.playerLitLevel();
    this.entity.update(dt, this.time, {
      playerPos: p.pos,
      playerEye: p.eyePos,
      playerHidden: !!p.hidden,
      playerCrouch: p.crouching,
      flashlightOn: this.flashOn,
      playerForward: new THREE.Vector3(0, 0, -1).applyQuaternion(this.engine.camera.quaternion),
      noise: p.noise,
      playerLit: lit,
    });
    // hidden & seen: she drags you out
    if (p.hidden && this.entity.hiddenSeen && this.entity.mode === 'hunt') {
      this.entity.lastKnown.copy(p.hidden.exit);
      if (this.entity.state !== 'chase') this.entity.setState('chase');
      this.entity.forceChaseTime = 2;
      if (this.entity.pos.distanceTo(p.hidden.exit) < 1.3) this.gameOver('Te vio esconderte.');
    }
    this.updateDanger(dt);
    // stamina ui & breathing
    this.ui.stamina(p.stamina);
    const breathV = p.stamina < 0.45 ? (0.45 - p.stamina) * 1.2 : 0;
    if (breathV > 0.02 && !this.breath) this.breath = this.audio.play('loop_breath_heavy', { loop: true, volume: 0.0001, bus: 'sfx', reverb: 0.05 });
    this.breath?.setVolume(breathV, 0.4);
    if (this.breath && breathV <= 0.01 && p.stamina > 0.8) {
      this.breath.stop(1);
      this.breath = null;
    }
  }

  playerLitLevel(): number {
    // approximate: near an active lamp?
    let best = 0;
    for (const l of this.world.lights.lamps) {
      const eff = (l as any)._eff ?? 0;
      if (eff < 0.3) continue;
      const d = l.pos.distanceTo(this.player.pos);
      if (d < l.distance * 0.6) best = Math.max(best, (1 - d / (l.distance * 0.6)) * eff);
    }
    return Math.min(1, best + (this.flashOn ? 0.3 : 0));
  }

  updateDanger(dt: number) {
    const e = this.entity;
    let target = 0;
    if (e.root.visible && (e.mode === 'hunt' || e.mode === 'scripted')) {
      const d = e.pos.distanceTo(this.player.pos);
      target = THREE.MathUtils.clamp(1 - (d - 3) / 22, 0, 1);
      if (e.state === 'chase') target = Math.max(target, 0.85);
      else if (e.state === 'investigate' || e.state === 'search') target = Math.max(target * 0.9, 0.3);
    }
    this.danger += (target - this.danger) * Math.min(1, dt * (target > this.danger ? 1.2 : 0.4));
    this.music.danger = this.danger;
    const chase = e.state === 'chase' || (e.mode === 'scripted' && this.story.scriptedChase);
    this.music.set('chase', chase ? 0.9 : 0, chase ? 1.2 : 3.5);
    this.engine.grade.uniforms.danger.value = this.danger * 0.8;
    // heartbeat
    const hb = this.danger > 0.35 ? (this.danger - 0.35) * 1.1 : 0;
    if (hb > 0.02 && !this.heartbeat) this.heartbeat = this.audio.play('loop_heartbeat', { loop: true, volume: 0.0001, reverb: 0 });
    this.heartbeat?.setVolume(hb, 0.5);
    if (this.heartbeat && hb <= 0.01 && this.danger < 0.2) {
      this.heartbeat.stop(1.5);
      this.heartbeat = null;
    }
    // entity breath (positional)
    const near = e.root.visible && e.pos.distanceTo(this.player.pos) < 14;
    if (near && !this.entityBreath) this.entityBreath = this.audio.play('creature_breath', { loop: true, volume: 0.0001, ref: 2.5, rolloff: 1.4 }, e.pos.clone().setY(2.1));
    if (this.entityBreath) {
      this.entityBreath.setPosition(e.pos.clone().setY(2.1));
      this.entityBreath.setVolume(near ? 0.55 : 0, 0.5);
      if (!near && !e.root.visible) {
        this.entityBreath.stop(0.8);
        this.entityBreath = null;
      }
    }
  }

  private markerEls: HTMLDivElement[] = [];
  private markerBox = document.getElementById('markers')!;

  private marker(i: number): HTMLDivElement {
    let m = this.markerEls[i];
    if (!m) {
      m = document.createElement('div');
      m.className = 'mk';
      this.markerBox.appendChild(m);
      this.markerEls[i] = m;
    }
    return m;
  }

  updateInteraction(dt: number) {
    const p = this.player;
    let used = 0;
    const hideMarkers = () => {
      for (let i = used; i < this.markerEls.length; i++) this.markerEls[i].style.display = 'none';
    };
    if (this.state !== 'playing' || this.overlay || !this.input.locked) {
      this.ui.prompt(null);
      this.ui.hold(null);
      hideMarkers();
      return;
    }
    // dialogue: E / Space / click advances the current line
    if (this.ui.subActive && this.ui.subIsDialogue && (this.input.hit('KeyE') || this.input.hit('Space') || (this.input.mouseClicked && !this.cameraRaised))) {
      this.voice.stopAll();
      this.ui.skipSub();
      this.ui.prompt(null);
      hideMarkers();
      return;
    }
    if (p.hidden) {
      this.ui.prompt('<kbd>E</kbd>Salir del escondite');
      if (this.input.hit('KeyE')) this.exitHide();
      hideMarkers();
      return;
    }
    const cam = this.engine.camera;
    const eye = cam.position;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    let best: Interactable | null = null;
    let bestScore = Infinity;
    const near: { it: Interactable; d: number }[] = [];
    for (const it of this.world.interactables) {
      const d0 = it.pos.distanceTo(eye);
      if (d0 > 6) continue;
      let en = false;
      try {
        en = it.enabled();
      } catch {
        en = false;
      }
      if (!en) continue;
      const to = this.tmpV.copy(it.pos).sub(eye);
      const dist = to.length();
      to.normalize();
      const dot = to.dot(fwd);
      if (dot < 0.2) continue;
      if (dist > 1.2 && this.world.col.blocked(eye, eye.clone().lerp(it.pos, 0.85))) continue;
      if (!it.id.startsWith('door:')) near.push({ it, d: dist });
      const reach = (it.reach ?? 2.3) + 0.4;
      if (dist > reach + it.radius) continue;
      const ang = Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
      const allow = Math.max(0.32, Math.atan2(it.radius + 0.3, dist));
      if (ang > allow) continue;
      const score = ang / allow + dist * 0.08;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    if (best !== this.focus) {
      this.focus = best;
      this.holdT = 0;
    }
    // world markers: small dots for nearby things you can use, a ring + label on the focused one
    if (best && !near.find((n) => n.it === best)) near.push({ it: best, d: best.pos.distanceTo(eye) });
    near.sort((a, b) => a.d - b.d);
    const W = window.innerWidth, H = window.innerHeight;
    const v = new THREE.Vector3();
    for (const n of near.slice(0, 8)) {
      v.copy(n.it.pos).project(cam);
      if (v.z > 1) continue;
      const m = this.marker(used++);
      m.style.display = 'block';
      m.style.left = ((v.x + 1) / 2) * W + 'px';
      m.style.top = ((1 - v.y) / 2) * H + 'px';
      const focus = n.it === best;
      m.classList.toggle('focus', focus);
      m.style.opacity = focus ? '1' : String(THREE.MathUtils.clamp(1.2 - n.d / 5, 0.25, 0.9));
      if (focus) m.dataset.label = typeof n.it.prompt === 'function' ? n.it.prompt() : n.it.prompt;
    }
    hideMarkers();
    if (!best) {
      this.ui.prompt(null);
      this.ui.hold(null);
      return;
    }
    // label is drawn by the marker; keep the center prompt only for hold actions
    this.ui.prompt(best.hold ? '<kbd>E</kbd>mantener' : null);
    this.story.hintOnce('interact', '<kbd>E</kbd> interactuar con lo que está marcado', 4);
    if (best.hold) {
      if (this.input.down('KeyE')) {
        this.holdT += dt;
        this.ui.hold(Math.min(1, this.holdT / best.hold));
        if (this.holdT >= best.hold) {
          this.holdT = 0;
          this.ui.hold(null);
          best.onUse();
        }
      } else {
        this.holdT = Math.max(0, this.holdT - dt * 2);
        this.ui.hold(this.holdT > 0 ? this.holdT / best.hold : null);
      }
    } else if (this.input.hit('KeyE')) {
      best.onUse();
      this.sfx('ui_click', undefined, 0.15, { bus: 'ui' });
    }
  }

  updateFog(dt: number) {
    const scene = this.engine.scene;
    if (!scene.fog) scene.fog = new THREE.FogExp2(this.fogColor.getHex(), this.fogDensity);
    const f = scene.fog as THREE.FogExp2;
    let target = this.fogTarget * (this.zone?.fog ?? 1);
    const street = this.story ? this.story.streetFogBoost() : 0;
    target += street;
    this.fogDensity += (target - this.fogDensity) * Math.min(1, dt * 1.5);
    f.density = this.fogDensity;
    f.color.lerp(this.fogColor, Math.min(1, dt * 1.2));
  }
}

export { CANCEL };
