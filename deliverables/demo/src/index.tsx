import React from 'react';
import {AbsoluteFill,Composition,Img,Sequence,interpolate,registerRoot,staticFile,useCurrentFrame,spring} from 'remotion';
const teal='#53cabe';
const scenes=[
 ['earth-sharp-global.png','ТРИ МИРА. ОДНА МИССИЯ.','Исследуйте Землю, Луну и Марс',0,120],
 ['earth-sharp-regional.png','НАЙДИТЕ ЗЕМНОЙ АНАЛОГ','8 регионов · 2 261 окно рельефа',120,150],
 ['global-research-appendix.png','ПРОВЕРЬТЕ НАУЧНУЮ ОСНОВУ','Исследовательские маршруты и первичные публикации',270,135],
 ['unified-comparison-desktop.png','СРАВНИТЕ ПОВЕРХНОСТИ','Синхронное 3D · высоты · изолинии',405,165],
 ['unified-profile-desktop.png','УВИДЬТЕ РАЗЛИЧИЯ','Профили высот и количественные метрики',570,135],
 ['report-visual-page.png','СОХРАНИТЕ ДОКАЗАТЕЛЬСТВА','PDF-отчёт с визуализациями и источниками',705,135],
] as const;
function Scene({item,index}:{item:typeof scenes[number],index:number}){
 const f=useCurrentFrame();const [src,title,sub,,duration]=item;
 const entrance=spring({frame:f,fps:30,config:{damping:200},durationInFrames:18});
 const scale=interpolate(f,[0,duration],[1.02,1.1]);
 const doc=src.includes('appendix')||src.includes('page');
 return <AbsoluteFill style={{background:'#071113',opacity:interpolate(f,[0,8,duration-8,duration],[0,1,1,0]),overflow:'hidden'}}>
 <div style={{position:'absolute',left:doc?880:80,right:80,top:doc?65:170,bottom:doc?65:65,overflow:'hidden',border:'1px solid #2e5355',borderRadius:14,boxShadow:'0 24px 100px #000'}}>
 <Img src={staticFile(src)} style={{width:'100%',height:'100%',objectFit:doc?'contain':'cover',transform:`scale(${scale})`,transformOrigin:index===1?'60% 55%':'50% 50%'}}/>
 </div>
 <div style={{position:'absolute',left:80,top:doc?330:36,width:doc?730:1750,transform:`translateY(${(1-entrance)*40}px)`,opacity:entrance}}>
 <div style={{color:teal,fontSize:18,letterSpacing:4,marginBottom:18}}>ASTRAS / {String(index+1).padStart(2,'0')}</div>
 <div style={{fontSize:doc?58:48,fontWeight:800,lineHeight:1.06,letterSpacing:-1}}>{title}</div>
 <div style={{fontSize:doc?29:25,color:'#a4bfbe',marginTop:18,lineHeight:1.4}}>{sub}</div>
 </div>
 <div style={{position:'absolute',bottom:0,left:0,height:4,background:teal,width:`${100*f/duration}%`}}/>
 </AbsoluteFill>
}
function End(){const f=useCurrentFrame();return <AbsoluteFill style={{background:'radial-gradient(ellipse at center,#143e40,#050b0e)',justifyContent:'center',alignItems:'center'}}><div style={{fontSize:150,fontWeight:800,letterSpacing:-8,transform:`scale(${interpolate(f,[0,60],[.92,1])})`}}>AST<span style={{color:teal}}>RAS</span></div><div style={{fontSize:34,color:'#abc9c7',marginTop:22}}>Исследовать. Сравнить. Обосновать.</div></AbsoluteFill>}
function Demo(){return <AbsoluteFill style={{fontFamily:'Arial,sans-serif',color:'#edf4f3',background:'#071113'}}>{scenes.map((item,i)=><Sequence key={item[0]} from={item[3]} durationInFrames={item[4]} premountFor={30}><Scene item={item} index={i}/></Sequence>)}<Sequence from={840} durationInFrames={60} premountFor={30}><End/></Sequence></AbsoluteFill>}
registerRoot(()=> <Composition id="Astras" component={Demo} width={1920} height={1080} fps={30} durationInFrames={900}/>);
