// Sân Miếu Thần Tài 3D (Three.js): miếu, ban thờ, lư hương có khói, Ông Từ, Thầy Lộc, nhân vật chibi.
import * as THREE from 'three'
import type { Look } from './chibi'

export type CastMember = { id: string; look: Look; kid: boolean; name: string }
type Callbacks = { onNpc: (k: 'tu' | 'thay') => void; onChar: (id: string) => void }

const mat = (color: string | number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra })
const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
const cyl = (rt: number, rb: number, h: number, m: THREE.Material, seg = 16) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m)
const sph = (r: number, m: THREE.Material, seg = 16) => new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), m)
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t
}
function signTex(text: string, sub: string | null, bg: string, fg: string) {
  return canvasTex(512, 192, g => {
    g.fillStyle = bg; g.fillRect(0, 0, 512, 192); g.strokeStyle = '#E9B85A'; g.lineWidth = 10; g.strokeRect(8, 8, 496, 176)
    g.fillStyle = fg; g.textAlign = 'center'; g.font = '800 72px "Be Vietnam Pro", system-ui, sans-serif'; g.fillText(text, 256, sub ? 100 : 122)
    if (sub) { g.font = '600 34px "Be Vietnam Pro", system-ui, sans-serif'; g.fillText(sub, 256, 152) }
  })
}

/* ---------- Đầu chibi: mặt vẽ lên mặt trước quả cầu, phía sau là tóc ---------- */
const FACE_U = 0.25 // trong SphereGeometry của Three.js, mặt trước (+z) nằm ở u = 0.25
function faceTexture(look: Look, photo: HTMLImageElement | null, npc?: 'tu' | 'thay') {
  return canvasTex(1024, 512, g => {
    const skin = npc ? '#F1C19C' : look.skin, hair = npc ? '#1C1F33' : look.hairC
    g.fillStyle = skin; g.fillRect(0, 0, 1024, 512)
    const cx = FACE_U * 1024, cy = 290
    // Tóc: phủ đỉnh đầu và phía sau, chừa khuôn mặt
    const longHair = !npc && ['long', 'bob', 'pony', 'pigtails'].includes(look.hair)
    g.fillStyle = hair
    g.fillRect(0, 0, 1024, npc ? 175 : look.hair === 'buzz' ? 150 : 190)
    const backBottom = npc ? 300 : longHair ? 470 : 330
    g.fillRect(cx + 210, 0, 1024 - (cx + 210) + 0, backBottom); g.fillRect(0, 0, Math.max(0, cx - 210), backBottom)
    if (!npc && look.hair === 'spiky') for (let i = 0; i < 1024; i += 40) { g.beginPath(); g.moveTo(i, 190); g.lineTo(i + 20, 225); g.lineTo(i + 40, 190); g.fill() }
    if (!npc && ['bob', 'pigtails'].includes(look.hair)) g.fillRect(cx - 200, 150, 400, 70) // mái bằng
    if (!npc && look.hair === 'side') { g.beginPath(); g.moveTo(cx - 210, 180); g.quadraticCurveTo(cx + 40, 170, cx + 200, 260); g.lineTo(cx + 210, 170); g.fill() }
    if (photo) { // ảnh thật hoặc chân dung AI làm mặt
      g.save(); g.beginPath(); g.ellipse(cx, cy - 10, 175, 150, 0, 0, Math.PI * 2); g.clip()
      const s = Math.max(350 / photo.width, 300 / photo.height) * (look.zoom || 1.25)
      const w = photo.width * s, h = photo.height * s
      g.drawImage(photo, cx - w / 2 - (look.ox || 0) * 6, cy - 10 - h / 2 - (look.oy || 0) * 6, w, h); g.restore()
      return
    }
    // Mắt, má hồng, miệng (kéo giãn theo chiều ngang vì vẽ lên mặt cầu)
    const eye = (x: number) => {
      if (npc === 'tu') { g.strokeStyle = '#2B2220'; g.lineWidth = 9; g.beginPath(); g.arc(x, cy, 26, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); return }
      g.fillStyle = '#2B2220'; g.beginPath(); g.ellipse(x, cy, 20, 26, 0, 0, Math.PI * 2); g.fill()
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 7, cy - 9, 7, 0, Math.PI * 2); g.fill()
    }
    eye(cx - 75); eye(cx + 75)
    g.fillStyle = 'rgba(240,138,138,.5)'; g.beginPath(); g.ellipse(cx - 125, cy + 50, 28, 18, 0, 0, Math.PI * 2); g.ellipse(cx + 125, cy + 50, 28, 18, 0, 0, Math.PI * 2); g.fill()
    g.strokeStyle = '#8A3B2E'; g.lineWidth = 8; g.lineCap = 'round'; g.beginPath(); g.arc(cx, cy + 55, 26, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke()
    if ((!npc && look.glasses) || npc === 'thay') { g.strokeStyle = '#2B2B2B'; g.lineWidth = 8; g.beginPath(); g.arc(cx - 75, cy, 44, 0, Math.PI * 2); g.moveTo(cx + 119, cy); g.arc(cx + 75, cy, 44, 0, Math.PI * 2); g.moveTo(cx - 31, cy); g.lineTo(cx + 31, cy); g.stroke() }
    if (npc === 'tu') { g.fillStyle = '#9A9A9A'; g.beginPath(); g.ellipse(cx, cy + 38, 70, 14, 0, 0, Math.PI * 2); g.fill() }
  })
}
function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise(res => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src })
}

type Rig = { root: THREE.Group; upper: THREE.Group; armL: THREE.Group; armR: THREE.Group; legL: THREE.Mesh; legR: THREE.Mesh; incense: THREE.Group; kid: boolean }
async function buildChar(look: Look, kid: boolean, npc?: 'tu' | 'thay'): Promise<Rig> {
  const root = new THREE.Group(), upper = new THREE.Group()
  const shirt = mat(npc === 'tu' ? '#7A4A2A' : npc === 'thay' ? '#22406E' : look.shirt), skin = mat(npc ? '#F1C19C' : look.skin)
  const pants = mat('#3A3F55'), shoe = mat('#2B2B2B')
  const legL = cyl(.1, .1, .45, pants), legR = cyl(.1, .1, .45, pants)
  legL.position.set(-.14, .3, 0); legR.position.set(.14, .3, 0)
  for (const l of [legL, legR]) { const f = box(.16, .08, .26, shoe); f.position.set(0, -.22, .05); l.add(f) }
  root.add(legL, legR)
  upper.position.y = .52; root.add(upper)
  const body = npc ? cyl(.3, .5, 1.05, shirt) : cyl(.3, .4, .62, shirt)
  body.position.y = npc ? -.05 : .3; upper.add(body)
  const mkArm = (side: number) => {
    const a = new THREE.Group(); a.position.set(side * .38, .55, 0)
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(.09, .32, 4, 8), shirt); sleeve.position.y = -.2; a.add(sleeve)
    const hand = sph(.09, skin, 10); hand.position.y = -.42; a.add(hand)
    upper.add(a); return a
  }
  const armL = mkArm(-1), armR = mkArm(1)
  // Nén hương cầm tay khi khấn
  const incense = new THREE.Group()
  for (let i = -1; i <= 1; i++) { const s = cyl(.012, .012, .5, mat('#B5442E'), 5); s.position.set(i * .05, .2, 0); s.rotation.z = i * .12; const tip = sph(.022, new THREE.MeshBasicMaterial({ color: '#FF6A3D' }), 6); tip.position.y = .25; s.add(tip); incense.add(s) }
  incense.position.set(0, .45, .38); incense.visible = false; upper.add(incense)
  // Đầu: cầu có mặt vẽ ở phía trước, sau gáy là tóc
  const photo = !npc && look.mode === 'photo' && look.photo ? await loadImg(look.photo) : null
  const head = new THREE.Mesh(new THREE.SphereGeometry(.5, 32, 24), new THREE.MeshLambertMaterial({ map: faceTexture(look, photo, npc) }))
  head.position.y = 1.15; head.scale.set(1, .95, .95); upper.add(head)
  if (!npc && look.hair === 'bun') { const b = sph(.18, mat(look.hairC)); b.position.set(0, 1.62, -.1); upper.add(b) }
  if (!npc && look.hair === 'pigtails') for (const s of [-1, 1]) { const b = sph(.15, mat(look.hairC)); b.position.set(s * .5, 1.05, -.05); upper.add(b) }
  if (!npc && look.hair === 'pony') { const b = new THREE.Mesh(new THREE.CapsuleGeometry(.1, .35, 4, 8), mat(look.hairC)); b.position.set(0, 1.0, -.52); b.rotation.x = .4; upper.add(b) }
  if (!npc && look.acc === 'bow') { const b = box(.28, .14, .06, mat('#E85A8A')); b.position.set(.25, 1.55, .1); b.rotation.z = -.4; upper.add(b) }
  if (!npc && look.acc === 'cap') { const c = new THREE.Mesh(new THREE.SphereGeometry(.52, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.2), mat(look.shirt)); c.position.y = 1.2; upper.add(c); const brim = box(.5, .04, .4, mat(look.shirt)); brim.position.set(0, 1.42, .45); upper.add(brim) }
  if (npc) { const t = new THREE.Mesh(new THREE.TorusGeometry(.42, .1, 8, 24), mat('#1C1F33')); t.rotation.x = Math.PI / 2; t.position.y = 1.42; upper.add(t) }
  if (npc === 'thay') {
    const beard = new THREE.Mesh(new THREE.ConeGeometry(.16, .5, 10), mat('#F4F4F4')); beard.position.set(0, .68, .38); beard.rotation.x = Math.PI; upper.add(beard)
    const fan = new THREE.Mesh(new THREE.CircleGeometry(.32, 16, 0, Math.PI * .8), new THREE.MeshLambertMaterial({ color: '#FBF1DC', side: THREE.DoubleSide })); fan.position.set(0, -.42, .1); fan.name = 'fan'; armR.add(fan)
  }
  if (npc === 'tu') { const tube = cyl(.08, .08, .3, mat('#8E3B1E'), 10); tube.position.set(0, -.5, .08); tube.name = 'tube'; armR.add(tube) }
  // Bóng dưới chân
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.45, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: .18, depthWrite: false }))
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .01; root.add(shadow)
  if (kid) root.scale.setScalar(.72)
  return { root, upper, armL, armR, legL, legR, incense, kid }
}

/* ---------- Ngôi miếu ---------- */
function roofMesh(width: number, depth: number, height: number, color: string) {
  const s = new THREE.Shape(), d = depth / 2
  s.moveTo(-d - .5, .35); s.quadraticCurveTo(-d + .2, -.05, -d + .9, .1); s.lineTo(0, height); s.lineTo(d - .9, .1); s.quadraticCurveTo(d - .2, -.05, d + .5, .35); s.lineTo(0, height + .25); s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false }); g.translate(0, 0, -width / 2)
  const m = new THREE.Mesh(g, mat(color)); m.rotation.y = Math.PI / 2; return m
}

export class TempleScene {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(42, 1, .1, 200)
  private clock = new THREE.Clock()
  private raf = 0
  private chars = new Map<string, Rig & { home: THREE.Vector3; busy: boolean }>()
  private npcs: { k: 'tu' | 'thay'; rig: Rig }[] = []
  private sticks = new THREE.Group()
  private offerGroup = new THREE.Group()
  private smoke: { s: THREE.Sprite; life: number; x: number; z: number }[] = []
  private smokeTex: THREE.Texture
  private flames: { light: THREE.PointLight; mesh: THREE.Mesh }[] = []
  private az = 0; private tilt = .26
  private drag: { x: number; y: number; az: number; tilt: number; moved: boolean } | null = null
  private ro: ResizeObserver
  private bubbles: { el: HTMLElement; obj: THREE.Object3D; until: number }[] = []
  private chatterT = 0
  private target = new THREE.Vector3(0, 1.6, -2)

  constructor(private host: HTMLElement, private cb: Callbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y'
    this.smokeTex = canvasTex(64, 64, g => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,248,235,.55)'); r.addColorStop(1, 'rgba(255,248,235,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64) })
    this.buildWorld()
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host); this.resize()
    const el = this.renderer.domElement
    el.addEventListener('pointerdown', this.onDown); addEventListener('pointermove', this.onMove); addEventListener('pointerup', this.onUp)
    this.loop()
  }

  private buildWorld() {
    const h = new Date().getHours(), night = h < 5 || h >= 19, eve = !night && h >= 17
    const sky = night ? '#1B2342' : eve ? '#E9A07A' : '#BFE3F2'
    this.scene.background = new THREE.Color(sky); this.scene.fog = new THREE.Fog(sky, 22, 48)
    this.scene.add(new THREE.HemisphereLight(night ? '#6670A0' : '#FFFFFF', '#8A6E4B', night ? .55 : 1.0))
    const sun = new THREE.DirectionalLight(night ? '#9AA6E0' : eve ? '#FFC79A' : '#FFF4E0', night ? .35 : 1.1); sun.position.set(6, 12, 8); this.scene.add(sun)
    if (night) { const g = new THREE.BufferGeometry(), p: number[] = []; for (let i = 0; i < 300; i++) p.push((Math.random() - .5) * 90, 12 + Math.random() * 20, -20 - Math.random() * 25); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#fff', size: .15 }))) }
    // Sân lát gạch
    const tiles = canvasTex(256, 256, g => { g.fillStyle = '#D8C4A2'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#C3AC86'; g.lineWidth = 4; for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke() } })
    tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping; tiles.repeat.set(16, 12)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 48), new THREE.MeshLambertMaterial({ map: tiles })); ground.rotation.x = -Math.PI / 2; this.scene.add(ground)
    const path = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 16), mat('#E8DABF')); path.rotation.x = -Math.PI / 2; path.position.set(0, .01, 3); this.scene.add(path)

    // Miếu
    const T = new THREE.Group(); T.position.z = -6; this.scene.add(T)
    const base = box(13, .5, 7, mat('#B89E77')); base.position.y = .25; T.add(base)
    const step = box(4, .25, 1, mat('#C9B48F')); step.position.set(0, .12, 3.9); T.add(step)
    const wall = box(12, 4, .3, mat('#8E2A1F')); wall.position.set(0, 2.5, -3.2); T.add(wall)
    for (const x of [-6, 6]) { const w = box(.3, 4, 6.5, mat('#8E2A1F')); w.position.set(x, 2.5, 0); T.add(w) }
    const inner = box(11.4, 3.9, .1, mat('#5A150F')); inner.position.set(0, 2.5, -3.0); T.add(inner)
    for (const x of [-4.8, -1.8, 1.8, 4.8]) { const p = cyl(.26, .3, 4, mat('#B3261E')); p.position.set(x, 2.5, 3.1); T.add(p) }
    const beam = box(12.6, .5, .5, mat('#8E1C17')); beam.position.set(0, 4.6, 3.1); T.add(beam)
    const r1 = roofMesh(14.5, 8.6, 2.2, '#1F6B5A'); r1.position.set(0, 4.8, 0); T.add(r1)
    const r2 = roofMesh(9, 5.2, 1.4, '#26806B'); r2.position.set(0, 6.6, 0); T.add(r2)
    const ridge = box(9.4, .2, .25, mat('#E9B85A')); ridge.position.set(0, 8.3, 0); T.add(ridge)
    const pearl = sph(.3, mat('#F6D27A', { emissive: '#5A3A00' })); pearl.position.set(0, 8.7, 0); T.add(pearl)
    const signM = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.1), new THREE.MeshBasicMaterial({ map: signTex('Miếu Thần Tài', null, '#8E1C17', '#F8DA8A') })); signM.position.set(0, 4.6, 3.37); T.add(signM)

    // Ban thờ
    const A = new THREE.Group(); A.position.set(0, .5, -1.6); T.add(A)
    const table = box(5, .9, 1.4, mat('#6A2A12')); table.position.y = .45; A.add(table)
    const trim = box(5.1, .12, 1.5, mat('#E9B85A')); trim.position.y = .94; A.add(trim)
    const placard = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.3), new THREE.MeshBasicMaterial({ map: canvasTex(320, 260, g => {
      g.fillStyle = '#8E1C17'; g.fillRect(0, 0, 320, 260); g.strokeStyle = '#E9B85A'; g.lineWidth = 12; g.strokeRect(6, 6, 308, 248)
      g.fillStyle = '#F8DA8A'; g.textAlign = 'center'; g.font = '700 54px "Noto Serif", Georgia, serif'; g.fillText('Thần Tài', 160, 110); g.fillText('Thổ Địa', 160, 180) }) }))
    placard.position.set(0, 2.1, -.55); A.add(placard)
    const bowl = cyl(.42, .3, .4, mat('#E9B85A')); bowl.position.set(0, 1.2, .1); A.add(bowl)
    this.sticks.position.set(0, 1.4, .1); A.add(this.sticks)
    this.offerGroup.position.y = 1.0; A.add(this.offerGroup)
    for (const x of [-2, 2]) {
      const c = cyl(.08, .08, .6, mat('#D23A2E'), 10); c.position.set(x, 1.3, .1); A.add(c)
      const f = new THREE.Mesh(new THREE.ConeGeometry(.07, .2, 8), new THREE.MeshBasicMaterial({ color: '#FFC24A' })); f.position.set(x, 1.7, .1); A.add(f)
      const l = new THREE.PointLight('#FFB04A', night ? 2.2 : 1.2, 5); l.position.set(x, 1.9, .3); A.add(l); this.flames.push({ light: l, mesh: f })
    }
    // Đèn lồng ở hiên
    for (const x of [-3.3, 3.3]) {
      const lan = sph(.38, mat('#E33B2E', { emissive: night || eve ? '#8A1A10' : '#300000' })); lan.scale.y = 1.25; lan.position.set(x, 3.7, 3.4); T.add(lan)
      const cap = cyl(.2, .2, .1, mat('#F6D27A')); cap.position.set(x, 4.2, 3.4); T.add(cap)
      if (night || eve) { const l = new THREE.PointLight('#FF6A3D', 1.6, 7); l.position.set(x, 3.6, 3.8); T.add(l) }
    }
    // Cây, tre
    const tree = (x: number, z: number, s = 1) => { const t = new THREE.Group(); const trunk = cyl(.18, .25, 1.6, mat('#6A4A2A')); trunk.position.y = .8; t.add(trunk)
      for (const [dx, dy, r] of [[0, 2.2, 1.2], [.7, 1.8, .9], [-.7, 1.9, .9]]) { const f = sph(r, mat('#4E8D57'), 12); f.position.set(dx, dy, 0); t.add(f) }
      t.position.set(x, 0, z); t.scale.setScalar(s); this.scene.add(t) }
    tree(-9, -6, 1.3); tree(9.5, -6, 1.3); tree(-13, 2); tree(13.5, 3)
    for (let i = 0; i < 7; i++) { const b = cyl(.06, .07, 4 + (i % 3), mat('#5E9B3C'), 6); b.position.set(-12.5 + (i % 4) * .4, (4 + (i % 3)) / 2, -1.5 + Math.floor(i / 4) * .5); this.scene.add(b) }

    // Quầy xin xăm (trái) và chỗ Thầy Lộc (phải)
    const stall = new THREE.Group(); stall.position.set(-7, 0, 1); this.scene.add(stall)
    const st = box(1.6, .8, .8, mat('#C0302A')); st.position.y = .4; stall.add(st)
    const tube = cyl(.16, .16, .5, mat('#8E3B1E'), 12); tube.position.set(.4, 1.05, 0); stall.add(tube)
    for (let i = 0; i < 6; i++) { const s = cyl(.015, .015, .45, mat('#D9A84E'), 4); s.position.set(.33 + (i % 3) * .06, 1.4, -.05 + Math.floor(i / 3) * .1); stall.add(s) }
    for (const x of [-1, 1]) { const p = cyl(.06, .06, 2.6, mat('#7A4E1A'), 8); p.position.set(x, 1.3, -.6); stall.add(p) }
    const s1 = new THREE.Mesh(new THREE.PlaneGeometry(2, .75), new THREE.MeshBasicMaterial({ map: signTex('XIN XĂM', 'Ông Từ', '#F6D27A', '#7A1C12') })); s1.position.set(0, 2.45, -.55); stall.add(s1)
    const corner = new THREE.Group(); corner.position.set(7, 0, 1); this.scene.add(corner)
    const matM = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2), mat('#E3C77E')); matM.rotation.x = -Math.PI / 2; matM.position.y = .02; corner.add(matM)
    const umb = new THREE.Mesh(new THREE.ConeGeometry(1.8, .9, 16, 1, true), new THREE.MeshLambertMaterial({ color: '#D2475A', side: THREE.DoubleSide })); umb.position.set(.3, 2.8, -.2); corner.add(umb)
    const pole = cyl(.05, .05, 2.8, mat('#5A3A1A'), 6); pole.position.set(.3, 1.4, -.2); corner.add(pole)
    const s2 = new THREE.Mesh(new THREE.PlaneGeometry(1.9, .7), new THREE.MeshBasicMaterial({ map: signTex('THẦY PHÁN', 'Vận · Tuổi · Ngày', '#FBF1DC', '#8E1C17') })); s2.position.set(-.7, 1.6, -.9); corner.add(s2)
    const lowt = box(.9, .3, .5, mat('#8A5A2B')); lowt.position.set(.6, .15, .3); corner.add(lowt)
  }

  async setNpcs() {
    for (const k of ['tu', 'thay'] as const) {
      const rig = await buildChar({} as Look, false, k)
      rig.root.position.set(k === 'tu' ? -7.6 : 6.4, 0, k === 'tu' ? 1.9 : 1.6); rig.root.rotation.y = k === 'tu' ? .5 : -.5
      rig.root.traverse(o => { o.userData.pick = { kind: 'npc', k } })
      this.scene.add(rig.root); this.npcs.push({ k, rig })
    }
  }

  private slot(i: number) {
    const xs = [-2, 2, -3.4, 3.4, -4.8, 4.8, -1.6, 1.6, -3, 3, -4.4, 4.4]
    const row = Math.floor(i / xs.length)
    return new THREE.Vector3(xs[i % xs.length] + (row % 2 ? .6 : 0), 0, 1.2 + (i % 12 >= 6 ? 1.6 : 0) + row * 3.2)
  }

  // Cập nhật những người đã thắp hương hôm nay (giữ nguyên ai đang diễn hoạt cảnh)
  async setCast(cast: CastMember[], litFamilies: number, offerings: Set<string>, exclude: string[] = []) {
    const want = cast.filter(c => !exclude.includes(c.id))
    for (const [id, r] of this.chars) if (!r.busy && !want.some(c => c.id === id)) { this.scene.remove(r.root); this.chars.delete(id) }
    let i = 0
    for (const c of want) {
      const home = this.slot(i++)
      let r = this.chars.get(c.id)
      if (!r) {
        const rig = await buildChar(c.look, c.kid)
        rig.root.traverse(o => { o.userData.pick = { kind: 'char', id: c.id } })
        rig.root.position.copy(home); this.scene.add(rig.root)
        r = { ...rig, home, busy: false }; this.chars.set(c.id, r)
      } else if (!r.busy) { r.home = home; if (r.root.position.distanceTo(home) > .3) { const rr = r; rr.busy = true; this.walk(rr, home).then(() => { rr.busy = false }) } }
    }
    this.setSticks(litFamilies); this.setOfferings(offerings)
  }

  setSticks(n: number) {
    this.sticks.clear()
    const k = Math.min(9, n)
    for (let i = 0; i < k; i++) {
      const a = (i - (k - 1) / 2) * .16, s = cyl(.015, .015, .9, mat('#B5442E'), 5)
      s.position.set(Math.sin(a) * .35, .45, 0); s.rotation.z = -a * .8
      const tip = sph(.03, new THREE.MeshBasicMaterial({ color: '#FF6A3D' }), 6); tip.position.y = .45; s.add(tip)
      s.userData.tipX = Math.sin(a) * .7; this.sticks.add(s)
    }
  }
  private setOfferings(o: Set<string>) {
    this.offerGroup.clear()
    if (o.has('qua')) { const plate = cyl(.45, .35, .06, mat('#E9B85A')); plate.position.set(-1.1, 0, .2); this.offerGroup.add(plate)
      for (const [x, y, z, c] of [[-1.25, .15, .2, '#F28C28'], [-1, .17, .28, '#F2C230'], [-.95, .14, .05, '#7FB241'], [-1.1, .33, .18, '#E2552B']] as const) { const f = sph(.14, mat(c), 10); f.position.set(x, y, z); this.offerGroup.add(f) } }
    if (o.has('hoa')) { const v = cyl(.12, .1, .45, mat('#2E6B88'), 10); v.position.set(1.1, .2, .15); this.offerGroup.add(v)
      for (const [x, y] of [[1, .65], [1.15, .72], [1.25, .62]]) { const f = sph(.11, mat('#F6C431'), 8); f.position.set(x, y, .15); this.offerGroup.add(f) } }
    if (o.has('nuoc')) { const c = cyl(.07, .06, .12, mat('#F4EBDD'), 10); c.position.set(-.55, .06, .4); this.offerGroup.add(c) }
    if (o.has('vang')) { const g = box(.3, .1, .16, mat('#F6D27A', { emissive: '#4A3000' })); g.position.set(.6, .05, .4); this.offerGroup.add(g) }
  }

  // Hoạt cảnh thắp hương: đi vào, quay mặt vào ban thờ, chắp tay vái 3 vái, cắm hương, quay ra
  async playLight(people: CastMember[], litAfter: number, offerings: Set<string>, onPlaced: () => void) {
    const rigs: (Rig & { home: THREE.Vector3; busy: boolean })[] = []
    for (let i = 0; i < people.length; i++) {
      const p = people[i]; let r = this.chars.get(p.id)
      if (!r) { const rig = await buildChar(p.look, p.kid); rig.root.traverse(o => { o.userData.pick = { kind: 'char', id: p.id } }); this.scene.add(rig.root); r = { ...rig, home: new THREE.Vector3(), busy: true }; this.chars.set(p.id, r) }
      r.busy = true; r.root.position.set((i - (people.length - 1) / 2) * .9, 0, 13); rigs.push(r)
    }
    this.az = 0
    const altar = (i: number) => new THREE.Vector3(i === 0 ? 0 : (i % 2 ? -1 : 1) * (.9 + Math.floor((i - 1) / 2) * .7), 0, -2.6 + (i ? .5 : 0))
    await Promise.all(rigs.map((r, i) => this.walk(r, altar(i))))
    // Quay mặt vào ban thờ (lưng hướng về phía mình)
    await Promise.all(rigs.map(r => this.turn(r, Math.PI)))
    rigs[0].incense.visible = true
    for (const r of rigs) { r.armL.rotation.set(-1.25, 0, .5); r.armR.rotation.set(-1.25, 0, -.5) }
    for (let k = 0; k < 3; k++) { await Promise.all(rigs.map(r => this.tween(400, t => { r.upper.rotation.x = Math.sin(t * Math.PI) * .45 }))); await this.wait(120) }
    rigs[0].incense.visible = false
    for (const r of rigs) { r.armL.rotation.set(0, 0, 0); r.armR.rotation.set(0, 0, 0) }
    this.setSticks(litAfter); this.setOfferings(offerings); onPlaced()
    await this.wait(400)
    await Promise.all(rigs.map(r => this.turn(r, 0)))
    for (const r of rigs) r.busy = false
  }

  private walk(r: Rig & { busy: boolean }, to: THREE.Vector3) {
    const from = r.root.position.clone(), dist = from.distanceTo(to), ms = dist / 2.2 * 1000
    r.root.rotation.y = Math.atan2(to.x - from.x, to.z - from.z)
    return this.tween(ms, t => {
      r.root.position.lerpVectors(from, to, t)
      const sw = Math.sin(t * dist * 5)
      r.legL.rotation.x = sw * .6; r.legR.rotation.x = -sw * .6; r.armL.rotation.x = -sw * .5; r.armR.rotation.x = sw * .5
      r.root.position.y = Math.abs(sw) * .06
    }).then(() => { r.legL.rotation.x = r.legR.rotation.x = r.armL.rotation.x = r.armR.rotation.x = 0; r.root.position.y = 0 })
  }
  private turn(r: Rig, to: number) { const from = r.root.rotation.y; let d = to - from; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return this.tween(350, t => { r.root.rotation.y = from + d * t }) }
  private tween(ms: number, f: (t: number) => void) {
    return new Promise<void>(res => { const t0 = performance.now(); const step = () => { const t = Math.min(1, (performance.now() - t0) / ms); f(t); if (t < 1) requestAnimationFrame(step); else res() }; step() })
  }
  private wait(ms: number) { return new Promise(r => setTimeout(r, ms)) }

  // Bong bóng lời nói (HTML phủ lên canvas)
  say(kind: 'npc' | 'char', key: string, text: string) {
    const obj = kind === 'npc' ? this.npcs.find(n => n.k === key)?.rig.root : this.chars.get(key)?.root
    if (!obj) return
    this.bubbles.forEach(b => b.el.remove()); this.bubbles = []
    const el = document.createElement('div'); el.className = 'say'; el.textContent = text; this.host.appendChild(el)
    this.bubbles.push({ el, obj, until: performance.now() + 3400 })
  }
  chatter(lines: { tu: string[]; thay: string[] }) {
    let i = 0
    this.chatterT = window.setInterval(() => {
      if (document.querySelector('.scrim')) return
      const n = this.npcs[i % this.npcs.length]; if (!n) return
      const L = lines[n.k]; this.say('npc', n.k, L[Math.floor(i / 2) % L.length]); i++
    }, 6000)
  }

  private onDown = (e: PointerEvent) => { this.drag = { x: e.clientX, y: e.clientY, az: this.az, tilt: this.tilt, moved: false } }
  private onMove = (e: PointerEvent) => {
    if (!this.drag) return
    const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y
    if (Math.abs(dx) + Math.abs(dy) > 6) this.drag.moved = true
    if (Math.abs(dx) > Math.abs(dy) * .8) { this.az = Math.max(-1.05, Math.min(1.05, this.drag.az - dx * .006)); e.preventDefault() }
    else this.tilt = Math.max(.15, Math.min(.75, this.drag.tilt + dy * .003))
  }
  private onUp = (e: PointerEvent) => {
    const d = this.drag; this.drag = null
    if (!d || d.moved || e.target !== this.renderer.domElement) return
    const rect = this.renderer.domElement.getBoundingClientRect()
    const v = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    const ray = new THREE.Raycaster(); ray.setFromCamera(v, this.camera)
    const hit = ray.intersectObjects(this.scene.children, true).find(h => h.object.userData.pick)
    if (!hit) return
    const p = hit.object.userData.pick
    if (p.kind === 'npc') this.cb.onNpc(p.k); else this.cb.onChar(p.id)
  }
  panTo(side: -1 | 1) { const from = this.az, to = side * .95; this.tween(600, t => { this.az = from + (to - from) * t }) }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight || w * .75
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix()
  }
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop)
    const dt = this.clock.getDelta(), t = this.clock.elapsedTime
    // Máy quay xoay quanh sân
    const R = 12.5
    this.camera.position.set(Math.sin(this.az) * R * Math.cos(this.tilt), 1.5 + Math.sin(this.tilt) * R, -2.5 + Math.cos(this.az) * R * Math.cos(this.tilt))
    this.camera.lookAt(this.target)
    // Nhân vật đứng yên thì nhún nhẹ, quay mặt ra sân
    let j = 0
    for (const r of this.chars.values()) { if (!r.busy) { r.upper.position.y = .52 + Math.sin(t * 2.2 + j) * .015; r.root.rotation.y = Math.sin(t * .5 + j) * .15 } j++ }
    for (const n of this.npcs) { n.rig.upper.position.y = .52 + Math.sin(t * 2) * .015; const f = n.rig.armR.getObjectByName('fan'); if (f) f.rotation.z = Math.sin(t * 3) * .4; const tb = n.rig.armR.getObjectByName('tube'); if (tb) tb.rotation.z = Math.sin(t * 9) * (Math.sin(t * .8) > .7 ? .3 : 0) }
    // Nến lung linh
    for (const f of this.flames) { const k = .85 + Math.sin(t * 13 + f.mesh.position.x) * .1 + Math.random() * .05; f.light.intensity = f.light.intensity * .7 + k * .9; f.mesh.scale.set(1, k, 1) }
    // Khói hương
    if (this.sticks.children.length && Math.random() < .35) {
      const s = this.sticks.children[Math.floor(Math.random() * this.sticks.children.length)]
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false }))
      const wp = new THREE.Vector3(); s.getWorldPosition(wp); sp.position.set(wp.x + (s.userData.tipX || 0) * .3, wp.y + .5, wp.z); sp.scale.setScalar(.25)
      this.scene.add(sp); this.smoke.push({ s: sp, life: 0, x: (Math.random() - .5) * .3, z: (Math.random() - .5) * .2 })
    }
    this.smoke = this.smoke.filter(p => {
      p.life += dt; p.s.position.y += dt * .5; p.s.position.x += Math.sin(p.life * 2) * dt * .15 + p.x * dt; p.s.position.z += p.z * dt
      p.s.scale.setScalar(.25 + p.life * .35); (p.s.material as THREE.SpriteMaterial).opacity = Math.max(0, .9 - p.life / 3.2)
      if (p.life > 3.2) { this.scene.remove(p.s); (p.s.material as THREE.SpriteMaterial).dispose(); return false } return true
    })
    this.renderer.render(this.scene, this.camera)
    // Đặt bong bóng lời nói trên đầu
    const now = performance.now(), rect = this.host.getBoundingClientRect()
    this.bubbles = this.bubbles.filter(b => {
      if (now > b.until) { b.el.remove(); return false }
      const p = new THREE.Vector3(); b.obj.getWorldPosition(p); p.y += 2.1 * b.obj.scale.y; p.project(this.camera)
      const x = Math.max(80, Math.min(rect.width - 80, (p.x + 1) / 2 * rect.width)), y = (1 - p.y) / 2 * rect.height
      b.el.style.left = x + 'px'; b.el.style.top = Math.max(40, y) + 'px'; return true
    })
  }

  dispose() {
    cancelAnimationFrame(this.raf); clearInterval(this.chatterT); this.ro.disconnect()
    removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp)
    this.bubbles.forEach(b => b.el.remove())
    this.scene.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mm = m.material as THREE.Material | THREE.Material[] | undefined; if (Array.isArray(mm)) mm.forEach(x => x.dispose()); else mm?.dispose?.() })
    this.renderer.dispose(); this.renderer.domElement.remove()
  }
}
