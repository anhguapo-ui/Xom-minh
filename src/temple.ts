// @ts-nocheck
// Miếu Thần Tài: dữ liệu quẻ xăm, thầy bói và hình vẽ, chuyển từ bản demo (public/demo/index.html).
import { toLunar, findLunar, jdFromDate } from './lunar'
import { chibiSVG, hash, type Look } from './chibi'
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const now=new Date();
export type Off={member_id:string;family_id:string;offerings:string[]};
let OFFS:Off[]=[];let KIDS=new Map<string,string[]>();let PEOPLE=new Map<string,{name:string;look:Look}>();
export function setTempleData(offs:Off[],kids:Map<string,string[]>,people:Map<string,{name:string;look:Look}>){OFFS=offs;KIDS=kids;PEOPLE=people}
function gateSVG(){
  const lant=(x,d)=>`<g class="lant" style="animation-delay:${d}s"><line x1="${x}" y1="30" x2="${x}" y2="40" stroke="#F6D27A"/><ellipse cx="${x}" cy="47" rx="6.5" ry="8" fill="#E33B2E"/><rect x="${x-3.5}" y="38.5" width="7" height="2" fill="#F6D27A"/><rect x="${x-3.5}" y="53.5" width="7" height="2" fill="#F6D27A"/><line x1="${x}" y1="56" x2="${x}" y2="62" stroke="#F6D27A"/></g>`;
  let studs='';for(let r=0;r<4;r++)for(const x of [41,52,67,78])studs+=`<circle cx="${x}" cy="${52+r*11}" r="1.5" fill="#E9B85A"/>`;
  return `<svg viewBox="0 0 120 100" aria-hidden="true">${lant(12,0)}${lant(108,.6)}
  <path d="M4 34 Q18 31 24 22 L96 22 Q102 31 116 34 Q102 35 94 30 L26 30 Q18 35 4 34Z" fill="#1F6B5A"/>
  <path d="M22 22 Q32 19 36 11 L84 11 Q88 19 98 22Z" fill="#26806B"/>
  <rect x="38" y="7" width="44" height="4" rx="2" fill="#F6D27A"/><circle cx="60" cy="5" r="3" fill="#F6D27A"/>
  <rect x="24" y="30" width="72" height="7" fill="#8E1C17"/>
  <rect x="27" y="37" width="8" height="57" fill="#C0302A"/><rect x="85" y="37" width="8" height="57" fill="#C0302A"/>
  <rect x="35" y="44" width="25" height="50" fill="#7A1C12"/><rect x="60" y="44" width="25" height="50" fill="#6A1810"/>
  <rect x="58.8" y="44" width="2.4" height="50" fill="#FFC861" opacity=".85"/>${studs}
  <rect x="42" y="31" width="36" height="11" rx="2" fill="#F6D27A"/><text x="60" y="39.3" text-anchor="middle" font-size="6.6" font-weight="700" fill="#7A1C12" font-family="Be Vietnam Pro, sans-serif">MIẾU XÓM</text>
  <rect x="20" y="94" width="80" height="5" rx="1" fill="#CDB892"/></svg>`}
function altarGroup(ex){ex=ex||[];
  const ents=OFFS.filter(e=>!ex.includes(e.member_id));
  const fams=[...new Set(ents.map(e=>e.family_id))];
  const n=Math.min(9,fams.length),offers=new Set(ents.flatMap(e=>e.offerings||[]));
  let sticks='';for(let i=0;i<n;i++){const dx=(i-(n-1)/2)*4.5,x2=180+dx*1.5,y2=128+Math.abs(dx)*.4;
    sticks+=`<line x1="${180+dx*.5}" y1="150" x2="${x2}" y2="${y2}" stroke="#B5442E" stroke-width="1.6"/><circle class="ember" cx="${x2}" cy="${y2}" r="1.8" fill="#FF6A3D" style="animation-delay:${i*.3}s"/>
      <path class="smoke" d="M${x2} ${y2-3} c-4 -7 4 -12 0 -19 c-3 -5 3 -9 1 -13" style="animation-delay:${(i*.55)%4}s"/>`}
  return `<rect x="150" y="92" width="60" height="44" rx="4" fill="#8E1C17" stroke="#E9B85A" stroke-width="2.5"/>
  <text x="180" y="110" text-anchor="middle" fill="#F8DA8A" font-family="Noto Serif, Georgia, serif" font-size="10.5" font-weight="700">Thần Tài</text>
  <text x="180" y="126" text-anchor="middle" fill="#F8DA8A" font-family="Noto Serif, Georgia, serif" font-size="10.5" font-weight="700">Thổ Địa</text>
  ${[128,232].map(x=>`<rect x="${x-3}" y="137" width="6" height="23" rx="1.5" fill="#D23A2E"/><ellipse class="flame" cx="${x}" cy="132" rx="3" ry="5.5" fill="#FFB938"/><ellipse class="flame" cx="${x}" cy="133.5" rx="1.4" ry="3" fill="#FFF1C2"/>`).join('')}
  ${offers.has('qua')?`<ellipse cx="143" cy="160" rx="12" ry="2" fill="#E9B85A"/><circle cx="137" cy="155" r="4.5" fill="#F28C28"/><circle cx="146" cy="154" r="5" fill="#F2C230"/><circle cx="151" cy="157" r="3.6" fill="#7FB241"/><circle cx="141" cy="149" r="4" fill="#E2552B"/>`:''}
  ${offers.has('nuoc')?`<path d="M155 154h7l-1 6h-5z" fill="#F4EBDD"/>`:''}
  ${offers.has('vang')?`<path d="M199 160l2-5h9l2 5z" fill="#F6D27A"/><path d="M202 155l1.6-3.4h5.8l1.6 3.4z" fill="#FBE6A6"/>`:''}
  ${offers.has('hoa')?`<rect x="214" y="147" width="8" height="13" rx="2.5" fill="#2E6B88"/><path d="M218 147 L213 134 M218 147 L218 130 M218 147 L223 135" stroke="#5E9B3C" stroke-width="1.3"/>${[[213,133],[218,129],[223,134]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="4" fill="#F6C431"/><circle cx="${x}" cy="${y}" r="1.5" fill="#D9771E"/>`).join('')}`:''}
  ${sticks}
  <path d="M163 150 Q165 161 180 161 Q195 161 197 150Z" fill="#E9B85A"/><ellipse cx="180" cy="150" rx="17" ry="3" fill="#7A4E1A"/>
  <rect x="116" y="160" width="128" height="6" rx="1.5" fill="#E9B85A"/><rect x="122" y="166" width="116" height="14" fill="#4A120F"/>`}
/* ---------- Sân miếu rộng ---------- */
const OFF=270,gx=p=>(OFF+p*3.6)/9;
function propsLeft(){
  let bamboo='';for(const [x,h] of [[22,120],[34,100],[46,128],[58,92]])bamboo+=`<rect x="${x}" y="${182-h}" width="5" height="${h}" rx="2.5" fill="#5E9B3C"/>${[0,1,2,3].map(i=>`<rect x="${x-.5}" y="${182-h+12+i*26}" width="6" height="2" fill="#467A2C"/>`).join('')}<ellipse cx="${x+9}" cy="${182-h+6}" rx="9" ry="3" fill="#6FB04A" transform="rotate(-25 ${x+9} ${182-h+6})"/>`;
  let sticks='';for(let i=0;i<7;i++)sticks+=`<rect x="${198+i*1.7}" y="${160+(i%3)*2}" width="1.3" height="14" fill="#D9A84E"/>`;
  return `${bamboo}
  <rect x="100" y="104" width="6" height="96" fill="#7A4E1A"/><rect x="230" y="104" width="6" height="96" fill="#7A4E1A"/>
  <path d="M86 108 Q168 84 250 108 L242 116 Q168 96 94 116Z" fill="#B3261E"/>
  <rect x="122" y="114" width="92" height="20" rx="3" fill="#F6D27A" stroke="#8E1C17" stroke-width="1.5"/>
  <text x="168" y="128.5" text-anchor="middle" font-family="Be Vietnam Pro, sans-serif" font-size="11" font-weight="800" fill="#7A1C12">XIN XĂM</text>
  <rect x="176" y="190" width="58" height="6" rx="1.5" fill="#8A5A2B"/><rect x="180" y="196" width="50" height="16" fill="#C0302A"/><rect x="180" y="196" width="50" height="3" fill="#E9B85A"/>
  ${sticks}<rect x="196" y="170" width="16" height="21" rx="2.5" fill="#8E3B1E"/><rect x="196" y="176" width="16" height="3" fill="#E9B85A"/>`}
function propsRight(){
  let scal='';for(let i=0;i<8;i++)scal+=`<circle cx="${778+i*18}" cy="101" r="9" fill="${i%2?'#E8962A':'#D2475A'}"/>`;
  let mat='';for(let i=0;i<7;i++)mat+=`<path d="M${708+i*24} 212 L${700+i*26} 236" stroke="#C9A85A" stroke-width="1.5"/>`;
  return `<rect x="662" y="112" width="5" height="102" fill="#7A4E1A"/><rect x="758" y="112" width="5" height="102" fill="#7A4E1A"/>
  <rect x="656" y="116" width="114" height="34" rx="3" fill="#FBF1DC" stroke="#8E1C17" stroke-width="2"/>
  <text x="713" y="131" text-anchor="middle" font-family="Be Vietnam Pro, sans-serif" font-size="11" font-weight="800" fill="#8E1C17">THẦY PHÁN</text>
  <text x="713" y="144" text-anchor="middle" font-family="Be Vietnam Pro, sans-serif" font-size="7.5" font-weight="600" fill="#5A3A1A">Vận · Tuổi · Ngày</text>
  <path d="M700 212 L862 212 L884 238 L688 238Z" fill="#E3C77E"/>${mat}
  <rect x="848" y="92" width="4" height="122" fill="#5A3A1A"/>
  <path d="M770 100 Q850 46 930 100Z" fill="#D2475A"/><path d="M810 100 Q850 52 850 52 Q850 52 890 100Z" fill="#E8962A"/>${scal}
  <rect x="792" y="200" width="54" height="6" rx="1.5" fill="#8A5A2B"/><rect x="796" y="206" width="4" height="10" fill="#6A4220"/><rect x="838" y="206" width="4" height="10" fill="#6A4220"/>
  <rect x="800" y="194" width="18" height="6" rx="1" fill="#F4EBDD" stroke="#8A5A2B" stroke-width=".8"/><path d="M826 198 L840 190" stroke="#3A2A1A" stroke-width="1.6" stroke-linecap="round"/>`}
function sceneSVG(ex){
  const h=new Date().getHours(),L=toLunar(now),night=h<5||h>=19,eve=!night&&h>=17,full=L.d>=14&&L.d<=16;
  const sky=night?['#18203B','#3B3563']:eve?['#F3A86C','#7A4462']:['#BFE3F2','#FBEBD3'];
  let stars='';if(night)for(let i=0;i<34;i++)stars+=`<circle cx="${(i*131)%900}" cy="${8+(i*37)%54}" r="${i%3?0.8:1.2}" fill="#fff" opacity=".8"/>`;
  let tiles='';for(let i=0;i<4;i++)tiles+=`<path d="M0 ${198+i*20} H900" stroke="#C6AF88" stroke-width="1"/>`;
  return `<svg class="scene-bg" viewBox="0 0 900 260" preserveAspectRatio="none" aria-hidden="true">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>
  <radialGradient id="lglow"><stop offset="0" stop-color="#FFB54A" stop-opacity=".75"/><stop offset="1" stop-color="#FFB54A" stop-opacity="0"/></radialGradient></defs>
  <rect width="900" height="182" fill="url(#sky)"/>${stars}
  <circle cx="${OFF+312}" cy="30" r="${full?15:11}" fill="${night||full?'#FFF3C8':'#FFE08A'}" opacity="${night||full?1:.75}"/>
  <circle cx="250" cy="160" r="26" fill="#4E8D57"/><circle cx="650" cy="160" r="26" fill="#4E8D57"/><circle cx="890" cy="150" r="30" fill="#3F7A4A"/>
  <g transform="translate(${OFF} 0)">
  <circle cx="18" cy="150" r="34" fill="#3F7A4A"/><circle cx="46" cy="166" r="24" fill="#4E8D57"/><circle cx="342" cy="150" r="34" fill="#3F7A4A"/><circle cx="314" cy="166" r="24" fill="#4E8D57"/>
  <rect x="70" y="76" width="220" height="106" fill="#8E2A1F"/>
  <path d="M44 80 Q66 76 78 60 L282 60 Q294 76 316 80 Q300 82 288 76 L72 76 Q60 82 44 80Z" fill="#1F6B5A"/>
  <path d="M86 60 Q100 54 108 42 L252 42 Q260 54 274 60Z" fill="#26806B"/>
  <rect x="122" y="37" width="116" height="6" rx="3" fill="#E9B85A"/><circle cx="180" cy="32" r="6" fill="#E9B85A"/>
  <rect x="80" y="80" width="10" height="102" fill="#B3261E"/><rect x="270" y="80" width="10" height="102" fill="#B3261E"/>
  <rect x="104" y="86" width="152" height="96" fill="#5A150F"/>
  <g id="altar-g">${altarGroup(ex)}</g>
  ${[96,264].map((x,i)=>`<line x1="${x}" y1="78" x2="${x}" y2="90" stroke="#3A1A10"/><circle cx="${x}" cy="100" r="22" fill="url(#lglow)" opacity="${night||eve?1:.3}"/><g class="lant" style="animation-delay:${i*.7}s"><ellipse cx="${x}" cy="100" rx="8" ry="10" fill="#E33B2E"/><rect x="${x-4}" y="89" width="8" height="2" fill="#F6D27A"/><rect x="${x-4}" y="109" width="8" height="2" fill="#F6D27A"/></g>`).join('')}
  </g>
  <rect y="182" width="900" height="78" fill="#D8C4A2"/>${tiles}
  <path d="M${OFF+150} 182 L${OFF+210} 182 L${OFF+246} 260 L${OFF+114} 260Z" fill="#E8DABF"/>
  <rect y="178" width="900" height="5" fill="#B89E77"/>
  ${propsLeft()}${propsRight()}</svg>`}
const SLOT_X=[8,17,26,36,64,74,83,92],SLOT_B=[22,13,4];
function sceneCast(ex){ex=ex||[];const seen=new Set(),cast=[];
  OFFS.forEach(e=>{if(!PEOPLE.has(e.member_id)||ex.includes(e.member_id))return;
    if(!seen.has(e.member_id)){seen.add(e.member_id);cast.push({pid:e.member_id,kid:false})}
    (KIDS.get(e.family_id)||[]).forEach(k=>{if(!seen.has(k)&&!ex.includes(k)){seen.add(k);cast.push({pid:k,kid:true})}})});
  return cast.map((c,i)=>{const row=Math.floor(i/8)%3;return Object.assign(c,{x:gx(SLOT_X[i%8]+(row===1?2.5:row===2?-2:0)),b:SLOT_B[row]})})}
const charEl=c=>`<button class="ch idle${c.kid?' kid':''}" data-act="char" data-p="${c.pid}" style="left:${c.x}%;bottom:${c.b}%;z-index:${Math.round(100-c.b)};--d:${(hash(c.pid)%30)/10}s" aria-label="${esc(PEOPLE.get(c.pid).name)}">${chibiSVG(PEOPLE.get(c.pid).look)}</button>`;
const NPC={tu:{name:'Ông Từ',x:150/9,b:16,label:'Ông Từ, bấm để xin xăm'},thay:{name:'Thầy Lộc',x:770/9,b:12,label:'Thầy Lộc, bấm để xem bói'}};
function npcSVG(k){
  const thay=k==='thay',skin='#F1C19C',robe=thay?'#22406E':'#7A4A2A';
  return `<svg viewBox="0 -8 60 96" aria-hidden="true">
  <ellipse cx="30" cy="85" rx="15" ry="3" fill="rgba(0,0,0,.2)"/>
  <ellipse cx="24" cy="83" rx="5" ry="2.4" fill="#2B2B2B"/><ellipse cx="36" cy="83" rx="5" ry="2.4" fill="#2B2B2B"/>
  <g class="upper">
  <path d="M17 48 Q30 44 43 48 L47 82 Q30 85 13 82Z" fill="${robe}"/><path d="M30 47 L30 82" stroke="rgba(0,0,0,.2)" stroke-width="1"/>
  <rect x="11" y="50" width="8" height="17" rx="4" fill="${robe}"/><circle cx="15" cy="67" r="3.2" fill="${skin}"/>
  ${thay?`<g class="fan"><path d="M45 66 L60 50 A21 21 0 0 1 58 74 Z" fill="#FBF1DC" stroke="#8E1C17" stroke-width=".8"/><path d="M45 66 L59 56 M45 66 L60 63 M45 66 L59 70" stroke="#C9A85A" stroke-width=".6"/></g>`
     :`<g class="tube"><rect x="40" y="52" width="9" height="15" rx="1.5" fill="#8E3B1E"/><rect x="40" y="56" width="9" height="2" fill="#E9B85A"/>${[41.5,43.5,45.5,47.2].map((x,i)=>`<rect x="${x}" y="${45+(i%2)*2}" width="1.1" height="8" fill="#D9A84E"/>`).join('')}</g>`}
  <rect x="41" y="50" width="8" height="15" rx="4" fill="${robe}"/><circle cx="45" cy="66" r="3.2" fill="${skin}"/>
  <circle cx="30" cy="30" r="22" fill="${skin}"/>
  ${thay?`<g fill="none" stroke="#3A2A1A" stroke-width="1.4"><circle cx="22" cy="32" r="5"/><circle cx="38" cy="32" r="5"/><path d="M27 32h6"/></g><circle cx="22" cy="32" r="1.6" fill="#2B2220"/><circle cx="38" cy="32" r="1.6" fill="#2B2220"/>`
     :`<path d="M18.5 33 Q22 30 25.5 33 M34.5 33 Q38 30 41.5 33" fill="none" stroke="#2B2220" stroke-width="1.6" stroke-linecap="round"/>`}
  <circle cx="16.5" cy="39" r="3" fill="#F08A8A" opacity=".4"/><circle cx="43.5" cy="39" r="3" fill="#F08A8A" opacity=".4"/>
  ${thay?`<path d="M22 41 Q30 37 38 41 Q36 44 30 43 Q24 44 22 41Z" fill="#EDEDED"/><path d="M24 43 Q30 72 36 43Z" fill="#F4F4F4"/><path d="M14 22 Q14 14 18 12" stroke="#EDEDED" stroke-width="2" fill="none"/>`
     :`<path d="M23 40.5 Q30 37.5 37 40.5 Q34 42.5 30 41.6 Q26 42.5 23 40.5Z" fill="#9A9A9A"/><path d="M27 44.5 Q30 47 33 44.5" fill="none" stroke="#8A3B2E" stroke-width="1.3" stroke-linecap="round"/>`}
  <path d="M7 24 Q7 4 30 4 Q53 4 53 24 Q30 15 7 24Z" fill="#1C1F33"/>
  <path d="M9 18 Q30 9 51 18 M8 22 Q30 13 52 22" stroke="#3A3F60" stroke-width="1.2" fill="none"/>
  </g></svg>`}
const npcEl=k=>`<button class="npc ${k}" data-act="npc" data-k="${k}" style="left:${NPC[k].x}%;bottom:${NPC[k].b}%;z-index:${Math.round(100-NPC[k].b)}" aria-label="${NPC[k].label}">${npcSVG(k)}<span class="npc-tag">${NPC[k].name}</span></button>`;
function sceneHTML(ex,enter){ex=ex||[];
  return `<div class="scene-wrap"><div class="scene-scroll" id="scene-scroll"><div class="scene" id="scene">${sceneSVG(ex)}${npcEl('tu')}${npcEl('thay')}${sceneCast(ex).map(charEl).join('')}</div></div>
  <button class="pan l" data-act="pan" data-x="0">‹ Xin xăm</button><button class="pan r" data-act="pan" data-x="1">Thầy bói ›</button>
  ${enter?'<div class="doors" aria-hidden="true"><i></i><i></i></div>':''}</div>`}
function showSay(el,txt){const sc=document.getElementById('scene'),scr=document.getElementById('scene-scroll');if(!sc||!scr)return;sc.querySelectorAll('.say').forEach(s=>s.remove());
  const d=document.createElement('div');d.className='say';d.textContent=txt;sc.appendChild(d);
  const x=Math.max(scr.scrollLeft+80,Math.min(scr.scrollLeft+scr.clientWidth-80,el.offsetLeft));d.style.left=x+'px';d.style.top=Math.max(d.offsetHeight+4,el.offsetTop+4)+'px';
  setTimeout(()=>d.remove(),3400)}
const npcLines=k=>k==='tu'?(isLe()?['Hôm nay ngày đẹp, xin một quẻ đi con!','Thành tâm khấn rồi hẵng lắc nhé.']:['Mùng 1, rằm mới xin xăm cho linh nhé!','Thắp hương xong ghé ông chơi.'])
  :['Lại đây thầy xem cho!','Xem tuổi vợ chồng không? Thầy xem miễn phí!','Hẹn kèo ngày nào, thầy chọn giờ cho.','Thầy phán cho vui thôi nhé!'];
let chatterT=null,chatterI=0;
function startChatter(){if(chatterT)return;chatterT=setInterval(()=>{const scr=document.getElementById('scene-scroll');if(!scr){clearInterval(chatterT);chatterT=null;return}
  if(document.querySelector('.scrim'))return;
  const vis=[...document.querySelectorAll('.npc')].filter(n=>n.offsetLeft>scr.scrollLeft&&n.offsetLeft<scr.scrollLeft+scr.clientWidth);if(!vis.length)return;
  const n=vis[chatterI%vis.length],L=npcLines(n.dataset.k);showSay(n,L[(chatterI++>>1)%L.length])},5200)}
/* ---------- Xin xăm ---------- */
const isLe=()=>{const l=toLunar(now);return l.d===1||l.d===15};
const LV=['Thượng cát','Trung bình','Hạ'];
const XAM=[
 [0,['Xuân về nắng ấm sân nhà','Cây cau trổ hạt, vườn hoa đâm chồi','Lộc trời gõ cửa tới nơi','Một nhà vui vẻ, nụ cười đầy mâm'],'Lộc đến tận cửa, việc nhà hanh thông.','Mở lòng đón khách, chia lộc cho người.'],
 [0,['Thuyền xuôi gió thuận buồm căng','Bến xa đã thấy ánh trăng đón chờ','Việc làm đúng lúc đúng giờ','Tiền vào như nước, chẳng ngờ được to'],'Thời vận đang lên, cứ mạnh dạn làm.','Đừng chần chừ, nhưng nhớ giữ chữ tín.'],
 [0,['Hoa mai nở trước hiên nhà','Chim khôn đậu xuống hót ca rộn ràng','Bạn bè tụ hội một làng','Đường xa hoá gần, đá vàng bền lâu'],'Quý nhân chính là bạn bè quanh mình.','Năng gặp gỡ, giữ tình xóm.'],
 [0,['Ruộng sâu lúa trổ đòng đòng','Mưa thuận gió hoà, nhà nông mỉm cười','Siêng năng chẳng phụ lòng người','Mùa này gặt hái gấp mười mùa qua'],'Công sức bỏ ra sắp được đền đáp.','Cứ đều tay, đừng nóng vội.'],
 [0,['Trăng rằm sáng tỏ sân đình','Cả nhà quây quần, tâm tình bên nhau','Con ngoan, cha mẹ sống lâu','Phúc dày như đất, lộc sâu như nguồn'],'Gia đạo êm ấm, phúc lộc đầy đủ.','Dành thêm thời gian cho người nhà.'],
 [0,['Cá chép vượt sóng hoá rồng','Bao năm bền chí, thành công tới gần','Người tài gặp được minh quân','Bước lên một bước, muôn phần vẻ vang'],'Công việc có bước tiến lớn.','Nắm lấy cơ hội, đừng ngại thử sức.'],
 [0,['Đầu năm hái lộc đầu cành','Cành non mơn mởn, xuân xanh tràn trề','Đi đâu cũng gặp người quê','Tay bắt mặt mừng, đề huề phúc an'],'Ra ngoài gặp may, giao tiếp thuận lợi.','Chủ động hỏi han, kết nối.'],
 [0,['Giếng trong múc mãi không vơi','Lòng người hào phóng, trời ơi lộc về','Cho đi chẳng thấy nhiêu khê','Nhận về gấp bội, bốn bề bình yên'],'Rộng rãi thì lộc càng đầy.','Mời xóm một bữa, phúc sẽ quay về.'],
 [0,['Nhà cao móng vững chân tường','Cột kèo chắc chắn, gió sương chẳng màng','Con đường đã chọn rõ ràng','Đi đều từng bước, vững vàng tới nơi'],'Nền tảng vững, kế hoạch đúng hướng.','Giữ kỷ luật, đừng đổi ý giữa chừng.'],
 [0,['Én bay chao lượn trời xuân','Tin vui từ chốn xa gần gửi về','Người thân tay bắt mặt kề','Họp nhà đông đủ, tràn trề tiếng vui'],'Sắp có tin vui trong nhà.','Gọi điện hỏi thăm họ hàng.'],
 [0,['Vườn nhà cây trái sum suê','Trẻ thơ chạy nhảy, đi về reo vui','Học hành tấn tới không lùi','Ông bà mát mặt, ngọt bùi đủ đầy'],'Con cái ngoan, học hành tiến bộ.','Khen con nhiều hơn một chút.'],
 [0,['Rồng mây gặp hội gió lành','Trăm điều mong ước, đã thành ngay đây','Lộc tài như nước sông đầy','Biết chia biết giữ, tháng này vẻ vang'],'Đại cát, mọi việc như ý.','Gặp vận tốt, càng nên khiêm tốn.'],
 [1,['Mây che trăng chẳng được lâu','Gió lên mây tạn, trăng sau lại tròn','Việc nào còn dở mỏi mòn','Kiên trì thêm chút, vẫn còn kịp thôi'],'Trở ngại nhỏ, rồi sẽ qua.','Bền bỉ thêm vài tuần.'],
 [1,['Đò ngang chờ khách bến sông','Nước lên nước xuống, đừng mong vội vàng','Đợi khi con nước dịu dàng','Sang sông nhẹ nhõm, mọi đàng thảnh thơi'],'Chưa phải lúc, chờ thời thì hơn.','Việc lớn để sau rằm hẵng làm.'],
 [1,['Cây non mới bén chân đồi','Mưa nhiều nắng ít, còn hồi lớn lên','Chăm cây chớ có bỏ quên','Năm sau quả ngọt, ngồi bên hưởng nhàn'],'Việc mới cần thời gian nuôi dưỡng.','Đầu tư công sức, đừng mong lãi ngay.'],
 [1,['Đường làng có chỗ gập ghềnh','Đi chậm một chút, chênh vênh chẳng sờn','Bạn bè dìu dắt cho hơn','Qua đoạn khó ấy, chẳng còn lo chi'],'Có khó khăn nhưng có người giúp.','Đừng ngại nhờ bạn trong xóm.'],
 [1,['Nồi cơm lửa nhỏ liu riu','Chớ vội mở vung, đợi chiều mới ngon','Việc gì cũng có lúc tròn','Nóng vội hỏng việc, lại còn thiệt thân'],'Vội vàng dễ hỏng, thong thả thì thành.','Bàn kỹ với vợ chồng trước khi quyết.'],
 [1,['Trời chiều mây xám giăng ngang','Mưa rào rồi tạnh, nắng vàng lại lên','Buồn vui là chuyện chẳng bền','Giữ lòng thư thái, mọi bên an hoà'],'Tâm trạng thất thường, rồi sẽ ổn.','Ngủ sớm, rủ bạn đi cafe xả hơi.'],
 [1,['Ao nhà cá lớn cá con','Thả câu đều tay, vẫn còn cá ăn','Chớ ham ao lạ xa xăm','Ao nhà quen nước, cả năm đủ đầy'],'Giữ việc đang có, chưa nên đổi.','Cân nhắc kỹ lời mời làm ăn mới.'],
 [1,['Gánh hàng hai đầu đong đưa','Bên nặng bên nhẹ, đã vừa sức chưa','Chia đều cho đỡ nắng mưa','Đường xa mấy cũng như vừa bước chân'],'Công việc và gia đình cần cân bằng.','Chia bớt việc, đừng ôm hết vào mình.'],
 [1,['Hoa sen mọc giữa bùn lầy','Gió đưa hương ngát, mới hay lòng thành','Việc ngay chẳng sợ tiếng lành','Tiếng xấu rồi cũng tan nhanh như sương'],'Có lời ra tiếng vào, mình ngay thẳng thì không sao.','Bỏ qua chuyện thị phi.'],
 [1,['Mùa thu lá rụng sân chùa','Quét đi lại rụng, chẳng thua chẳng phiền','Việc nhà lặt vặt triền miên','Làm vui thì nhẹ, ưu phiền thì lâu'],'Việc vặt nhiều, giữ tâm vui.','Cả nhà cùng dọn dẹp một buổi.'],
 [1,['Cầu tre lắt lẻo qua mương','Bước chân cẩn thận, con đường vẫn qua','Tiền vào chớ vội tiêu ra','Để dành một ít, phòng xa lúc cần'],'Tài chính tạm ổn, cần chi tiêu cẩn thận.','Bớt một khoản mua sắm chưa cần.'],
 [1,['Ngựa hay chưa gặp người tài','Đứng chờ bên bến, sớm mai có người','Đừng buồn khi chửa gặp thời','Mài gươm chờ dịp, đến hồi vẻ vang'],'Tài năng chưa được nhìn nhận, cơ hội đang tới.','Học thêm một kỹ năng mới.'],
 [1,['Bếp nhà khói toả lam chiều','Mẹ nêm vừa miệng, thương yêu đong đầy','Đôi khi mặn nhạt đổi thay','Nhường nhau một chút, vị này thêm ngon'],'Vợ chồng có thể bất đồng nhỏ.','Nhường nhau một câu, nhà êm cả tuần.'],
 [1,['Thả diều trước gió lưng chừng','Dây căng quá mức thì đừng kéo thêm','Thả ra một chút cho êm','Diều bay cao vút, êm đềm trời xanh'],'Đang căng thẳng, nên nới lỏng.','Bớt kiểm soát, tin người khác hơn.'],
 [1,['Chợ phiên tấp nập người qua','Bán mua thong thả, nghĩ xa hẵng làm','Món hời chớ có vội ham','Của rẻ của ôi, chớ tham mà lầm'],'Cẩn trọng chuyện tiền nong, mua bán.','Lời mời "lãi cao" thì hỏi kỹ người thân.'],
 [1,['Trăng non mới nhú đầu cành','Còn cong còn mảnh, chưa thành vầng trăng','Đêm rằm rồi sẽ sáng bằng','Tròn đầy rực rỡ, vầng trăng sáng ngời'],'Việc mới bắt đầu, cần thời gian để tròn.','Đặt mục tiêu nhỏ cho tháng này.'],
 [2,['Mưa dầm thấm đất lâu ngày','Áo khăn ướt sũng, đường lầy khó đi','Dừng chân trú tạm chút thì','Tạnh mưa ta lại bước đi nhẹ nhàng'],'Thời gian này hơi trắc trở.','Tạm dừng việc lớn, lo nghỉ ngơi.'],
 [2,['Thuyền con gặp lúc sóng to','Buông chèo chớ vội, đắn đo vững tay','Bão nào rồi cũng tan ngay','Bình tâm giữ lái, qua ngày gió yên'],'Gặp sóng gió, giữ bình tĩnh sẽ qua.','Chưa ký kết, chưa vay mượn lớn lúc này.'],
 [2,['Cây cao gió lớn lay cành','Lá rơi lả tả, chớ đành buồn lo','Gốc sâu rễ chắc còn to','Xuân sang lộc mới, chẳng lo thiếu gì'],'Có mất mát nhỏ, nhưng nền vẫn vững.','Đừng tiếc của, giữ người là chính.'],
 [2,['Lời qua tiếng lại trong nhà','Nóng lên một chút, hoá ra giận hờn','Nhịn nhau một câu cho trơn','Cơm lành canh ngọt, còn hơn tranh phần'],'Dễ cãi vã trong nhà.','Nói chậm lại, rủ cả nhà đi ăn ngoài.'],
 [2,['Đường xa chân mỏi gối chồn','Ngồi bên gốc gạo, nghỉ còn chưa lâu','Việc nhiều chồng chất trên đầu','Bớt đi một nửa, mai sau lại làm'],'Đang quá sức.','Nghỉ một ngày, sức khoẻ trước đã.'],
 [2,['Đêm khuya đèn cạn bơ vơ','Tìm diêm chẳng thấy, ngồi chờ bình minh','Sáng ra mọi chuyện rõ tình','Chớ lo chớ vội, tự mình rối thêm'],'Có chuyện chưa rõ, đừng đoán bừa.','Hỏi thẳng, nói rõ, hiểu lầm sẽ tan.'],
 [2,['Ví tiền mỏng tựa lá tre','Tháng này chi khéo, kẻo nghe thở dài','Nhậu ít, cà phê bớt vài','Qua mùa thắt chặt, tương lai rủng rỉnh'],'Tài chính hơi eo hẹp.','Lập danh sách chi tiêu tháng này.'],
 [2,['Hạt giống gieo phải đất khô','Tưới hoài chẳng mọc, đừng xô đừng phiền','Đổi sang mảnh đất bên hiên','Mầm xanh lại nhú, an yên tháng ngày'],'Cách đang làm chưa hiệu quả.','Thử hướng khác, hỏi ý người có kinh nghiệm.'],
];
const TOPICS=[['chung','Hỏi chung'],['gia','Gia đạo'],['tai','Tài lộc'],['cong','Công việc'],['con','Con cái']];
const TPOOL={
 gia:[['Nhà cửa êm ấm, vợ chồng thuận hoà, có khách quý ghé chơi.','Trong nhà có chuyện vui, cả nhà sum vầy.','Người lớn khoẻ mạnh, trẻ nhỏ ngoan ngoãn.'],['Nhà có vài chuyện nhỏ cần bàn, nói chuyện nhẹ nhàng là ổn.','Bình thường, yên ổn, nên dành thời gian cho nhau.','Có việc nhà cần sửa sang, làm dần là xong.'],['Dễ có hiểu lầm, nói chậm, nghe nhiều sẽ qua.','Người nhà hơi mệt, nhắc nhau nghỉ ngơi.','Chuyện cũ dễ khơi lại, bỏ qua cho nhẹ lòng.']],
 tai:[['Tiền vào đều tay, có khoản thưởng bất ngờ.','Làm ăn thuận lợi, đầu tư nhỏ có lời.','Có người trả món nợ cũ hoặc mời hợp tác tốt.'],['Thu chi cân bằng, chưa dư nhiều nhưng không thiếu.','Có khoản chi bất ngờ, may mà vẫn xoay được.','Kiếm được, nhưng nên tiết kiệm thêm.'],['Hạn chế cho vay, đi vay và đầu tư lúc này.','Có thể hao chút tiền, coi như của đi thay người.','Chặt tay chi tiêu một thời gian là ổn.']],
 cong:[['Được cấp trên ghi nhận, có thể lên chức hoặc tăng lương.','Việc đang làm về đích đẹp.','Gặp quý nhân giới thiệu việc tốt.'],['Công việc đều đều, chủ động hơn để bứt lên.','Có chút áp lực, chia việc hợp lý sẽ nhẹ.','Đồng nghiệp hỗ trợ tốt, cứ hỏi khi cần.'],['Công việc chậm lại, đừng ép mình quá.','Có trục trặc nhỏ, kiểm tra kỹ trước khi gửi.','Chưa phải lúc đổi việc, cứ giữ chỗ đang làm.']],
 con:[['Con học tiến bộ, có tin vui ở trường.','Các bé khoẻ, ăn ngon ngủ kỹ.','Con biết nghe lời, tự giác hơn hẳn.'],['Con cần bố mẹ kèm thêm chút ít.','Bé hơi mè nheo, chơi cùng con nhiều hơn là ổn.','Học hành tạm ổn, khen ngợi sẽ giúp con cố gắng.'],['Bé dễ ốm vặt, giữ ấm và cho ngủ sớm.','Con có chút buồn, hỏi han con nhiều hơn.','Con hơi lơ là học, nhắc nhở nhẹ nhàng.']],
};
function laXam(n,topic){const q=XAM[n-1],lv=q[0],tp=TOPICS.find(t=>t[0]===topic)||TOPICS[0];
  return `<div class="lx lv${lv}"><div class="lx-h"><span>Quẻ số ${n}</span><b>${LV[lv]}</b></div>
  <div class="lx-poem">${q[1].map(esc).join('<br>')}</div>
  <dl><dt>Ý quẻ</dt><dd>${esc(q[2])}</dd>${topic!=='chung'?`<dt>Về ${tp[1].toLowerCase()}</dt><dd>${esc(TPOOL[topic][lv][n%3])}</dd>`:''}<dt>Lời khuyên</dt><dd>${esc(q[3])}</dd></dl>
  <p class="lx-note">Xin xăm cho vui, tham khảo thôi nhé.</p></div>`}
const tubeSVG=()=>`<svg viewBox="0 0 100 140" aria-hidden="true">${[0,1,2,3,4,5,6,7].map(i=>`<rect x="${31+i*5}" y="${10+(i%3)*5}" width="3" height="50" rx="1" fill="#D9A84E"/><rect x="${31+i*5}" y="${10+(i%3)*5}" width="3" height="6" fill="#C0302A"/>`).join('')}
  <rect x="24" y="40" width="52" height="94" rx="8" fill="#8E3B1E"/><rect x="24" y="58" width="52" height="8" fill="#E9B85A"/><rect x="24" y="110" width="52" height="8" fill="#E9B85A"/><ellipse cx="50" cy="40" rx="26" ry="6" fill="#5A220F"/></svg>`;
function coin(k,i){const f=k==='ok'?(i?'up':'down'):k==='cuoi'?'up':k==='am'?'down':'up';return `<span class="coin ${f}"><i></i></span>`}

/* ---------- Thầy bói ---------- */
const CAN=['Giáp','Ất','Bính','Đinh','Mậu','Kỷ','Canh','Tân','Nhâm','Quý'];
const CHI=['Tý','Sửu','Dần','Mão','Thìn','Tỵ','Ngọ','Mùi','Thân','Dậu','Tuất','Hợi'];
const CON=['Chuột','Trâu','Hổ','Mèo','Rồng','Rắn','Ngựa','Dê','Khỉ','Gà','Chó','Lợn'];
const SINH={Kim:'Thủy',Thủy:'Mộc',Mộc:'Hỏa',Hỏa:'Thổ',Thổ:'Kim'},KHAC={Kim:'Mộc',Mộc:'Thổ',Thổ:'Thủy',Thủy:'Hỏa',Hỏa:'Kim'};
const MAU={Kim:['trắng','bạc','vàng'],Mộc:['xanh lá','đen','xanh dương'],Thủy:['đen','xanh dương','trắng'],Hỏa:['đỏ','hồng','xanh lá'],Thổ:['vàng','nâu','đỏ']};
const HUONG={Kim:'Tây, Tây Bắc',Mộc:'Đông, Đông Nam',Thủy:'Bắc',Hỏa:'Nam',Thổ:'Đông Bắc, Tây Nam'};
function tuoi(dob){if(!dob)return null;const [y,m,d]=dob.split('-').map(Number);if(!y)return null;const ly=toLunar(new Date(y,m-1,d)).y,can=(ly+6)%10,ci=(ly+8)%12;
  let s=[1,1,2,2,3,3,4,4,5,5][can]+[0,0,1,1,2,2,0,0,1,1,2,2][ci];if(s>5)s-=5;
  return {ly,can:CAN[can],chi:CHI[ci],ci,con:CON[ci],menh:['','Kim','Thủy','Hỏa','Thổ','Mộc'][s]}}
const VAN={5:['Hôm nay vận đỏ như son, làm gì cũng thuận.','Quý nhân đi ngang, có người giúp đúng lúc.','Lộc lá rủng rỉnh, nói câu nào người nghe câu nấy.'],
  4:['Ngày khá đẹp, việc nhỏ suôn sẻ, việc lớn có tiến triển.','Tinh thần phấn chấn, rủ kèo là có người đi.','Có tin vui nho nhỏ trước giờ ăn tối.'],
  3:['Ngày bình thường, cứ làm đều tay là ổn.','Không hên không xui, uống cà phê cho tỉnh là được.','Việc nào xong việc nấy, đừng ôm đồm.'],
  2:['Hơi lận đận chút, nói ít nghe nhiều cho lành.','Dễ quên đồ, ra khỏi nhà nhớ kiểm tra ví và chìa khoá.','Đi đường chậm lại một chút, về nhà ăn cơm sớm.']};
const NEN=['Rủ hội đi cafe sáng','Gọi điện hỏi thăm bố mẹ','Khen vợ hoặc chồng một câu','Dọn lại bàn làm việc','Đi bộ sau bữa tối','Chơi với con 30 phút','Mời hàng xóm chén trà','Đọc vài trang sách'];
const TRANH=['Hứa đi kèo rồi bùng','Mua sắm theo cảm hứng','Tranh luận nảy lửa trong nhóm chat','Thức khuya lướt điện thoại','Uống quá chén','Cho vay tiền lúc đang vui','Ăn đêm nhiều dầu mỡ','Hứa điều chưa chắc làm được'];
const THANG=['','Tháng Giêng khai xuân hái lộc, xóm mình đi lễ đầu năm cho đông đủ.','Tháng Hai trời ấm, hợp tụ tập ăn uống ngoài trời.','Tháng Ba lo việc nhà, sửa sang chuẩn bị mùa hè.','Tháng Tư lộc nhỏ rải đều, chăm chỉ là có.','Tháng Năm nắng nóng, các nhà giữ sức, hẹn cafe sáng là đẹp.','Tháng Sáu hợp đi chơi xa cùng các bé.','Tháng Bảy là tháng hiếu nghĩa, nhớ thăm ông bà, nói lời nhẹ nhàng.','Tháng Tám trăng tròn rước đèn, các bé vui, người lớn hoà thuận.','Tháng Chín công việc bận, nhớ nhắc nhau nghỉ ngơi.','Tháng Mười lộc về cuối năm, xóm đoàn kết thì mọi việc hanh thông.','Tháng Một trời lạnh, hợp lẩu tại gia. Nhà nào đăng cai sẽ đắc lộc.','Tháng Chạp tất niên sum vầy, khép sổ năm cũ, mở lòng đón xuân.'];
const THAN=['Thanh Long','Minh Đường','Thiên Hình','Chu Tước','Kim Quỹ','Bảo Quang','Bạch Hổ','Ngọc Đường','Thiên Lao','Huyền Vũ','Tư Mệnh','Câu Trần'],GOODP=[0,1,4,5,7,10];
const tlStart=c=>((c%6)*2+8)%12;
function dayInfo(d){const jd=jdFromDate(d.getDate(),d.getMonth()+1,d.getFullYear()),dc=(jd+1)%12,l=toLunar(d),pos=(dc-tlStart((l.m+1)%12)+12)%12;
  const hours=CHI.map((c,k)=>({c,k,good:GOODP.includes((k-tlStart(dc)+12)%12),from:(k*2+23)%24,to:(k*2+1)%24}));
  return {l,can:CAN[(jd+9)%10],chi:CHI[dc],good:GOODP.includes(pos),than:THAN[pos],hours}}
const hourChi=h=>Math.floor((h+1)/2)%12;
function relate(a,b){let s=0,c,m;
  if(a.ci===b.ci){s+=1;c='cùng tuổi '+a.chi}else if(a.ci%4===b.ci%4){s+=2;c='tam hợp'}else if((a.ci+b.ci)%12===1){s+=2;c='lục hợp'}else if((a.ci-b.ci+12)%12===6){s-=2;c='tứ hành xung'}else c='không xung không hợp';
  if(SINH[a.menh]===b.menh||SINH[b.menh]===a.menh){s+=1;m='tương sinh'}else if(KHAC[a.menh]===b.menh||KHAC[b.menh]===a.menh){s-=1;m='tương khắc'}else m='bình hoà';
  const v=s>=3?'Đại hợp! Hai người như cafe với sữa đặc, thiếu nhau là nhạt.':s===2?'Hợp nhau, làm gì chung cũng thuận. Kèo nào có hai người là kèo đó vui.':s===1?'Khá hợp, thỉnh thoảng lệch pha nhưng nhường nhau là êm.':s===0?'Bình hoà, chẳng hợp chẳng khắc. Thân hay không là do mình vun đắp.':s===-1?'Hơi khắc khẩu, nói chuyện dễ "va". Nhưng càng cãi càng hiểu nhau.':'Xung tuổi! Nhưng xóm mình có câu: xung mà thương mới là bạn lâu năm. Thầy giải: ngồi cạnh nhau, có người thứ ba pha trò là hoá hợp.';
  return {s,c,m,v}}
const PRAYER=`Nam mô A Di Đà Phật! (3 lần)
Con lạy chín phương Trời, mười phương Chư Phật, Chư Phật mười phương.
Con kính lạy Hoàng thiên Hậu Thổ chư vị Tôn thần.
Con kính lạy Thần Tài vị tiền, ngài Thổ Địa cùng các vị Thần linh cai quản trong xứ này.

Tín chủ con là: … Ngụ tại: …
Hôm nay là ngày … tháng … năm …, tín chủ con thành tâm sửa biện hương hoa, lễ vật, trà quả, thắp nén hương thơm dâng lên trước án.

Cúi xin các ngài chứng giám lòng thành, phù hộ cho gia đình chúng con và cả xóm được bình an, mạnh khoẻ, công việc hanh thông, tài lộc dồi dào, các con chăm ngoan.

Chúng con lễ bạc tâm thành, cúi xin chứng giám.
Nam mô A Di Đà Phật! (3 lần)`;

export { gateSVG, altarGroup, sceneHTML, sceneCast, gx, showSay, startChatter, npcSVG, isLe, LV, XAM, TOPICS, TPOOL, laXam, tubeSVG, coin,
  CAN, CHI, CON, MAU, HUONG, tuoi, VAN, NEN, TRANH, THANG, dayInfo, hourChi, relate, PRAYER }
