'use strict';

// Landmarks use a normalized 512 px reference space for every source tile.

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
  constructor(images,frames) {
    this.canvas=document.createElement('canvas');
    this.canvas.width=this.canvas.height=1024;
    const gl=this.canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true});
    if(!gl)throw new Error('WebGL unavailable');
    this.gl=gl;
    function shader(type,source) {
      const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    const program=gl.createProgram();
    const vertex=shader(gl.VERTEX_SHADER,`attribute vec2 position;attribute vec2 fromUV;attribute vec2 toUV;
      varying vec2 aUV;varying vec2 bUV;
      void main(){gl_Position=vec4(position.x*2.0-1.0,1.0-position.y*2.0,0.0,1.0);aUV=fromUV;bUV=toUV;}`);
    const fragment=shader(gl.FRAGMENT_SHADER,`precision mediump float;uniform sampler2D fromPortraits;uniform sampler2D toPortraits;uniform float blend;
      varying vec2 aUV;varying vec2 bUV;
      void main(){gl_FragColor=mix(texture2D(fromPortraits,aUV),texture2D(toPortraits,bUV),blend);}`);
    gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    gl.deleteShader(vertex);gl.deleteShader(fragment);gl.useProgram(program);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    ['position','fromUV','toUV'].forEach((name,i)=>{
      const location=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location,2,gl.FLOAT,false,24,i*8);
    });
    gl.uniform1i(gl.getUniformLocation(program,'fromPortraits'),0);
    gl.uniform1i(gl.getUniformLocation(program,'toPortraits'),1);
    this.blend=gl.getUniformLocation(program,'blend');
    this.textures=[];
    gl.viewport(0,0,1024,1024);
    this.setSequence(images,frames);
  }
  setSequence(images,frames) {
    const gl=this.gl;
    this.images=images;this.frames=frames;
    this.points=frames.map(frame=>portraitPoints(frame.pose));
    // Source landmarks normalize the AI frames to one continuous camera framing.
    this.sourcePoints=frames.map(frame=>portraitPoints(frame.sourcePose));
    const mean=this.points[0].map((_,i)=>[0,1].map(axis=>this.points.reduce((sum,p)=>sum+p[i][axis],0)/this.points.length));
    this.triangles=portraitTriangles(mean);
    this.data=new Float32Array(this.triangles.length*3*6);
    images.forEach((image,i)=>{
      if(!image||this.textures[i])return;
      const texture=gl.createTexture();this.textures[i]=texture;
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    });
  }
  render(from,to,t) {
    const gl=this.gl;if(gl.isContextLost())return null;
    const a=this.points[from],b=this.points[to],sa=this.sourcePoints[from],sb=this.sourcePoints[to];let offset=0;
    const uv=(point,index,axis)=>{
      const frame=this.frames[index],asset=PORTRAIT_ASSETS[frame.sheet],image=this.images[frame.sheet];
      const divisions=axis===0?asset.columns:asset.rows;
      const cell=axis===0?frame.cell%asset.columns:Math.floor(frame.cell/asset.columns);
      const pixels=axis===0?image.naturalWidth:image.naturalHeight,inset=divisions/(2*pixels);
      return (cell+Math.max(inset,Math.min(1-inset,point[axis])))/divisions;
    };
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.textures[this.frames[from].sheet]);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.textures[this.frames[to].sheet]);
    for(const triangle of this.triangles)for(const i of triangle) {
      this.data[offset++]=a[i][0]+(b[i][0]-a[i][0])*t;
      this.data[offset++]=a[i][1]+(b[i][1]-a[i][1])*t;
      this.data[offset++]=uv(sa[i],from,0);this.data[offset++]=uv(sa[i],from,1);
      this.data[offset++]=uv(sb[i],to,0);this.data[offset++]=uv(sb[i],to,1);
    }
    gl.bufferData(gl.ARRAY_BUFFER,this.data,gl.DYNAMIC_DRAW);
    gl.uniform1f(this.blend,t);gl.drawArrays(gl.TRIANGLES,0,this.data.length/6);
    return this.canvas;
  }
}
