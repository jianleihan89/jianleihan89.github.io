'use strict';

// Shared facial and body landmarks keep the two portraits aligned as they blend.
// Coordinates are in each square's original 512 px reference space.
const PORTRAIT_LANDMARKS = [
  [[250,50],[225,155],[273,149],[252,177],[240,198],[270,199],[208,207],[255,235],[289,205],[220,248],[285,248],[137,178],[365,176],[251,305],[171,415],[350,415]],
  [[268,37],[242,128],[288,126],[268,153],[254,177],[286,178],[218,182],[269,213],[308,184],[233,232],[293,232],[139,181],[370,179],[259,288],[159,425],[357,427]],
  [[253,25],[236,101],[287,101],[266,127],[250,146],[281,145],[211,158],[268,187],[309,158],[239,204],[290,204],[127,225],[382,219],[266,297],[159,447],[371,449]],
  [[246,17],[224,80],[273,78],[254,104],[242,123],[277,123],[197,140],[259,157],[297,139],[221,177],[287,177],[106,221],[366,237],[267,282],[166,409],[370,410]],
  [[264,16],[240,77],[287,75],[266,101],[251,119],[281,118],[199,138],[268,154],[310,138],[236,177],[299,177],[103,223],[386,249],[281,277],[178,397],[386,406]],
  [[274,25],[251,85],[299,85],[273,100],[262,121],[302,121],[203,132],[283,167],[338,136],[242,189],[327,194],[130,230],[431,257],[316,282],[208,392],[443,410]]
];

function portraitPoints(frame) {
  const [hair, eyeL, eyeR, nose, mouthL, mouthR, jawL, chin, jawR,
    neckL, neckR, shoulderL, shoulderR, chest, waistL, waistR] = frame;
  const browL = [eyeL[0], eyeL[1] - 13], browR = [eyeR[0], eyeR[1] - 13];
  return [[0,0],[128,0],[256,0],[384,0],[512,0],[512,170],[512,340],
    [512,512],[384,512],[256,512],[128,512],[0,512],[0,340],[0,170],
    hair, [eyeL[0]-27,eyeL[1]], browL, browR, [eyeR[0]+27,eyeR[1]],
    eyeL, eyeR, nose, mouthL, mouthR, jawL, chin, jawR, neckL, neckR,
    shoulderL, shoulderR, chest, waistL, waistR].map(p=>p.map(v=>v/512));
}

function portraitTriangles(points) {
  const count=points.length, vertices=points.concat([[-10,-10],[10,-10],[0,10]]);
  let triangles=[[count,count+1,count+2]];
  function contains(triangle,p) {
    const [a,b,c]=triangle.map(i=>vertices[i]);
    const d=2*(a[0]*(b[1]-c[1])+b[0]*(c[1]-a[1])+c[0]*(a[1]-b[1]));
    if(Math.abs(d)<1e-10)return false;
    const aa=a[0]*a[0]+a[1]*a[1],bb=b[0]*b[0]+b[1]*b[1],cc=c[0]*c[0]+c[1]*c[1];
    const x=(aa*(b[1]-c[1])+bb*(c[1]-a[1])+cc*(a[1]-b[1]))/d;
    const y=(aa*(c[0]-b[0])+bb*(a[0]-c[0])+cc*(b[0]-a[0]))/d;
    return (p[0]-x)**2+(p[1]-y)**2 <= (a[0]-x)**2+(a[1]-y)**2+1e-9;
  }
  for(let i=0;i<count;i++) {
    const edges=new Map(),keep=[];
    for(const triangle of triangles) {
      if(!contains(triangle,vertices[i])){keep.push(triangle);continue;}
      for(let j=0;j<3;j++) {
        const a=triangle[j],b=triangle[(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(':');
        if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);
      }
    }
    triangles=keep.concat([...edges.values()].map(edge=>edge.concat(i)));
  }
  return triangles.filter(t=>t.every(i=>i<count));
}

class PortraitMorph {
  constructor(sheet) {
    this.canvas=document.createElement('canvas');
    this.canvas.width=this.canvas.height=1024;
    const gl=this.canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true});
    if(!gl)throw new Error('WebGL unavailable');
    this.gl=gl;
    this.points=PORTRAIT_LANDMARKS.map(portraitPoints);
    // A single mesh topology is used throughout every transition.
    const mean=this.points[0].map((_,i)=>[0,1].map(axis=>this.points.reduce((sum,p)=>sum+p[i][axis],0)/this.points.length));
    this.triangles=portraitTriangles(mean);
    this.data=new Float32Array(this.triangles.length*3*6);
    function shader(type,source) {
      const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    const program=gl.createProgram();
    const vertex=shader(gl.VERTEX_SHADER,`attribute vec2 position;attribute vec2 fromUV;attribute vec2 toUV;
      varying vec2 aUV;varying vec2 bUV;
      void main(){gl_Position=vec4(position.x*2.0-1.0,1.0-position.y*2.0,0.0,1.0);aUV=fromUV;bUV=toUV;}`);
    const fragment=shader(gl.FRAGMENT_SHADER,`precision mediump float;uniform sampler2D portraits;uniform float blend;
      varying vec2 aUV;varying vec2 bUV;
      void main(){gl_FragColor=mix(texture2D(portraits,aUV),texture2D(portraits,bUV),blend);}`);
    gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    gl.deleteShader(vertex);gl.deleteShader(fragment);gl.useProgram(program);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    ['position','fromUV','toUV'].forEach((name,i)=>{
      const location=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location,2,gl.FLOAT,false,24,i*8);
    });
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,sheet);
    gl.uniform1i(gl.getUniformLocation(program,'portraits'),0);
    this.blend=gl.getUniformLocation(program,'blend');
    this.inset=[1.5/sheet.naturalWidth,1/sheet.naturalHeight];
    gl.viewport(0,0,1024,1024);
  }
  render(from,to,t) {
    const gl=this.gl;if(gl.isContextLost())return null;
    const a=this.points[from],b=this.points[to];let offset=0;
    const uv=(point,index,axis)=>{
      const divisions=axis===0?3:2,cell=axis===0?index%3:Math.floor(index/3);
      return (cell+Math.max(this.inset[axis],Math.min(1-this.inset[axis],point[axis])))/divisions;
    };
    for(const triangle of this.triangles)for(const i of triangle) {
      this.data[offset++]=a[i][0]+(b[i][0]-a[i][0])*t;
      this.data[offset++]=a[i][1]+(b[i][1]-a[i][1])*t;
      this.data[offset++]=uv(a[i],from,0);this.data[offset++]=uv(a[i],from,1);
      this.data[offset++]=uv(b[i],to,0);this.data[offset++]=uv(b[i],to,1);
    }
    gl.bufferData(gl.ARRAY_BUFFER,this.data,gl.DYNAMIC_DRAW);
    gl.uniform1f(this.blend,t);gl.drawArrays(gl.TRIANGLES,0,this.data.length/6);
    return this.canvas;
  }
}
