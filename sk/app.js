'use strict';
const $=id=>document.getElementById(id);
const MIN_CAPEX=-40,MAX_CAPEX=100;
const STATES=[
{at:-40,name:'小难崔',en:'CAPEX FREEZE',color:'#79838a',quote:'云厂商一缩手，估值模型先改三遍。',tag:'削减预算 · 需求担忧',note:'HBM 需求\n预期降温',description:'穿皱西装，瘦削哭丧脸，缩颈耸肩、含胸佝偻的畏缩形态'},
{at:-20,name:'牢崔',en:'GUIDANCE CUT',color:'#627887',quote:'说好的 AI 军备竞赛，怎么开始省钱了？',tag:'指引下修 · 预期转弱',note:'预算下修\n订单先等等',description:'穿蓝灰色虚构囚服，皱眉抿嘴，垂头缩肩的戒备形态'},
{at:0,name:'崔总',en:'WAIT FOR GUIDANCE',color:'#687b5e',quote:'先看资本开支指引，再谈信仰。',tag:'预算持平 · 等待指引',note:'预算没变\n静待业绩会',description:'穿深色西装，自然站直、双肩放松的中性商务形态'},
{at:20,name:'崔圣',en:'BUILD MORE',color:'#8d8150',quote:'你们多建一座机房，我就多一分信仰。',tag:'温和加码 · 需求想象升温',note:'机房在建\n订单有盼头',description:'穿金边长袍，下颌加宽，抬头挺胸、肩背打开的自信形态'},
{at:50,name:'崔神',en:'HBM EXPECTATIONS',color:'#a38840',quote:'你们卷算力，我盯着 HBM 订单。',tag:'加速扩张 · 订单预期上修',note:'算力竞赛\nHBM 受瞩目',description:'穿黑金龙袍，宽颌粗颈，双臂垂下、胸膛前挺的神化形态'},
{at:100,name:'崔祖',en:'CAPEX ARMS RACE',color:'#ad6545',quote:'大厂预算翻倍，崔祖原地登基。',tag:'大举扩张 · 股东预期拉满',note:'资本开支翻倍\n崔祖原地登基',description:'穿红金龙袍、戴帝冕，咬肌夸张、得意大笑，正面直视镜头、极度挺胸的幻想帝王形态'}
];
const capexPercent=v=>{const n=Math.round(v);return (n>0?'+':n<0?'−':'')+Math.abs(n)+'%';};
const slider=$('capex-slider'),canvas=$('portrait'),ctx=canvas.getContext('2d'),sheet=new Image(),reduced=matchMedia('(prefers-reduced-motion: reduce)');
const portraitImages=[sheet];
let portraitFrames=framesForImages(portraitImages);
let morph=null,capex=0,loaded=false,animation=0,auto=false,sound=false,audio,previousState=2,toastTimer,announceTimer;
function stateAt(v){return STATES.reduce((best,s,i)=>Math.abs(s.at-v)<Math.abs(STATES[best].at-v)?i:best,0);}
function blendAt(v){let lower=0;while(lower<portraitFrames.length-2&&v>portraitFrames[lower+1].at)lower++;return {lower,upper:lower+1,t:Math.max(0,Math.min(1,(v-portraitFrames[lower].at)/(portraitFrames[lower+1].at-portraitFrames[lower].at)))};}
function drawCell(context,index,x,y,w,h,alpha=1){
 const frame=portraitFrames[index],image=portraitImages[frame.sheet],asset=PORTRAIT_ASSETS[frame.sheet];
 const cw=image.naturalWidth/asset.columns,ch=image.naturalHeight/asset.rows;
 context.globalAlpha=alpha;
 context.drawImage(image,(frame.cell%asset.columns)*cw,Math.floor(frame.cell/asset.columns)*ch,cw,ch,x,y,w,h);
 context.globalAlpha=1;
}
function drawPortrait(context=ctx,v=capex,x=0,y=0,size=1024){
 if(!loaded||!context)return;
 const b=blendAt(v);
 const frame=morph?.render(b.lower,b.upper,b.t);
 if(frame){context.drawImage(frame,x,y,size,size);return;}
 if(b.t===0){drawCell(context,b.lower,x,y,size,size);return;}
 if(b.t===1){drawCell(context,b.upper,x,y,size,size);return;}
 drawCell(context,b.lower,x,y,size,size);
 drawCell(context,b.upper,x,y,size,size,b.t);
}
function beep(index){if(!sound)return;try{audio??=new(window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});const osc=audio.createOscillator(),gain=audio.createGain();osc.frequency.value=[220,277,330,440,554,659][index];gain.gain.setValueAtTime(.035,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.12);osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+.13);}catch{sound=false;updateSound();toast('此浏览器暂不支持音效');}}
function render(announce=false){const index=stateAt(capex),s=STATES[index],percent=capexToPosition(capex);slider.value=String(percent);document.documentElement.style.setProperty('--accent',s.color);$('state-name').textContent=s.name;$('state-en').textContent=s.en;$('quote').textContent=s.quote;$('phase').textContent=String(index+1).padStart(2,'0')+' / 06';$('status-tag').textContent=s.tag;$('status-note').replaceChildren(...s.note.split('\n').flatMap((line,i)=>i?[document.createElement('br'),document.createTextNode(line)]:[document.createTextNode(line)]));$('capex-number').replaceChildren(document.createTextNode(capexPercent(capex).slice(0,-1)),Object.assign(document.createElement('small'),{textContent:'%'}));$('track-fill').style.width=percent+'%';$('ruler-marker').style.top=(100-percent)+'%';slider.setAttribute('aria-valuetext',`模拟大科技资本开支同比 ${capexPercent(capex)}，${s.name}，${s.description}`);canvas.setAttribute('aria-label',`${s.name}：${s.description}`);document.querySelectorAll('[data-capex]').forEach((button,i)=>{button.classList.toggle('active',i===index);button.setAttribute('aria-pressed',String(i===index));});drawPortrait();if(index!==previousState){beep(index);previousState=index;}if(announce){clearTimeout(announceTimer);announceTimer=setTimeout(()=>$('announcement').textContent=`模拟资本开支同比 ${capexPercent(capex)}。${s.name}。${s.quote}`,160);}}
function setCapex(v,announce=false){capex=Math.max(MIN_CAPEX,Math.min(MAX_CAPEX,Number(v)));render(announce);}
function syncAuto(){ $('auto').setAttribute('aria-pressed',String(auto));$('play-icon').textContent=auto?'Ⅱ':'▷';$('play-label').textContent=auto?'暂停变身':'一键拉满资本开支';$('helper').textContent=auto?'资本开支加速，股东信仰升温…':'拖动资本开支预期，查看股东风评';}
function stop(){cancelAnimationFrame(animation);auto=false;syncAuto();}
function goTo(target,duration=650){stop();if(reduced.matches){setCapex(target,true);return;}const initial=capexToPosition(capex),destination=capexToPosition(target),start=performance.now();function tick(now){const p=Math.min(1,(now-start)/duration);setCapex(positionToCapex(initial+(destination-initial)*(1-Math.pow(1-p,3))));if(p<1)animation=requestAnimationFrame(tick);else render(true);}animation=requestAnimationFrame(tick);}
slider.addEventListener('input',()=>{stop();setCapex(positionToCapex(Number(slider.value)));});slider.addEventListener('change',()=>render(true));slider.addEventListener('pointerdown',stop);
slider.addEventListener('keydown',event=>{const position=capexToPosition(capex);let next;if(event.key==='ArrowLeft'||event.key==='ArrowDown')next=position-1;else if(event.key==='ArrowRight'||event.key==='ArrowUp')next=position+1;else if(event.key==='Home')next=0;else if(event.key==='End')next=100;else return;event.preventDefault();stop();setCapex(positionToCapex(next),true);});
for(const button of document.querySelectorAll('[data-capex]')){button.style.left=capexToPosition(Number(button.dataset.capex))+'%';button.addEventListener('click',()=>goTo(Number(button.dataset.capex)));}
$('reset').addEventListener('click',()=>goTo(0));$('random').addEventListener('click',()=>{let next=positionToCapex(Math.floor(Math.random()*101));if(Math.abs(next-capex)<4)next=capex>0?-20:50;goTo(next);});
$('auto').addEventListener('click',()=>{if(auto){stop();return;}stop();auto=true;syncAuto();setCapex(MIN_CAPEX);const start=performance.now(),duration=reduced.matches?0:10000;function tick(now){const p=duration?Math.min(1,(now-start)/duration):1;setCapex(positionToCapex(p*100));if(p<1)animation=requestAnimationFrame(tick);else{auto=false;syncAuto();render(true);}}animation=requestAnimationFrame(tick);});
function updateSound(){$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'关闭音效':'开启音效');$('sound').querySelector('span').textContent=sound?'音效开':'音效关';}
$('sound').addEventListener('click',()=>{sound=!sound;updateSound();beep(stateAt(capex));});
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.add('show');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3000);}
async function exportImage(){if(!loaded){toast('人物图像尚未载入，请稍后再试。');return;}stop();const value=capex,s=STATES[stateAt(value)],button=$('export');button.disabled=true;try{await document.fonts.ready;const out=document.createElement('canvas');out.width=1080;out.height=1350;const c=out.getContext('2d');if(!c)throw new Error('Canvas unavailable');c.fillStyle='#f1f0e9';c.fillRect(0,0,1080,1350);c.strokeStyle='#cdd3c0';c.strokeRect(32,32,1016,1286);const text=(str,y,size,color='#2b332d',serif=false)=>{c.textAlign='center';c.fillStyle=color;c.font=`${size}px ${serif?'"Songti SC","STSong",serif':'"PingFang SC","Microsoft YaHei",sans-serif'}`;c.fillText(str,540,y);};text('BIG TECH CAPEX / 海力士投资者视角',91,17,'#969e89');text('崔氏滑动变祖器',173,64,'#2b332d',true);drawPortrait(c,value,150,213,780);text(s.name,1091,76,s.color,true);text(s.quote,1155,27,'#79846e',true);text(`大科技资本开支同比 ${capexPercent(value)} / 模拟情景`,1210,18,'#939d85');text('AI 虚构造型 · 投资者情绪玩梗 · 非实际指引或股价预测',1262,15,'#8e9881');text('身份参考：대한민국 국회 / Wikimedia Commons / KOGL Type 1 · AI 改编',1295,11,'#9da58f');const blob=await new Promise(resolve=>out.toBlob(resolve,'image/png'));if(!blob)throw new Error('PNG export failed');const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`崔氏变祖器-CapEx${Math.round(value)}%-${s.name}.png`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);toast('当前形态已生成，正在保存 PNG');}catch(error){console.error('Export failed',error);toast('保存失败，请重试或直接截图。');}finally{button.disabled=false;}}
$('export').addEventListener('click',exportImage);
async function loadTransitions(){
 const results=await Promise.allSettled(PORTRAIT_ASSETS.slice(1).map((asset,i)=>new Promise((resolve,reject)=>{
   const image=new Image();image.decoding='async';
   image.onload=()=>{portraitImages[i+1]=image;resolve();};
   image.onerror=()=>reject(new Error(asset.src));image.src=asset.src;
 })));
 portraitFrames=framesForImages(portraitImages);
 if(morph)try{morph.setSequence(portraitImages,portraitFrames);}catch(error){morph=null;console.warn('Using portrait blend.',error);}
 document.documentElement.dataset.portraitFrames=String(portraitFrames.length);
 if(results.some(result=>result.status==='rejected'))console.warn('Some transition sheets did not load; keeping available portraits.');
 render();
}
sheet.onload=()=>{
 loaded=true;
 try{morph=new PortraitMorph(portraitImages,portraitFrames);}catch(error){console.warn('Portrait morph unavailable; using image blend.',error);}
 $('portrait-wrap').classList.add('ready');render();loadTransitions();
};
sheet.onerror=()=>{$('portrait-wrap').classList.add('failed');$('helper').textContent='人物造型未载入，请刷新重试';toast('人物图像未载入，当前显示参考肖像。');};
sheet.src=PORTRAIT_ASSETS[0].src;render();
document.addEventListener('visibilitychange',()=>{if(document.hidden&&auto)stop();});
