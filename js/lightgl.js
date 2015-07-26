var GL=(function(){




function Texture(width,height,options){options=options||{};this.id=gl.createTexture();this.width=width;this.height=height;this.format=options.format||gl.RGBA;this.type=options.type||gl.UNSIGNED_BYTE;gl.bindTexture(gl.TEXTURE_2D,this.id);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,options.filter||options.magFilter||gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,options.filter||options.minFilter||gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,options.wrap||options.wrapS||gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,options.wrap||options.wrapT||gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,this.format,width,height,0,this.format,this.type,null);}
var framebuffer;var renderbuffer;var checkerboardCanvas;Texture.prototype={
bind:function(unit){gl.activeTexture(gl.TEXTURE0+(unit||0));gl.bindTexture(gl.TEXTURE_2D,this.id);},
unbind:function(unit){gl.activeTexture(gl.TEXTURE0+(unit||0));gl.bindTexture(gl.TEXTURE_2D,null);},




drawTo:function(callback,options){options=options||{};var v=gl.getParameter(gl.VIEWPORT);gl.viewport(0,0,this.width,this.height);framebuffer=framebuffer||gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.id,0);if(options.depth!==false){renderbuffer=renderbuffer||gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,renderbuffer);if(this.width!=renderbuffer.width||this.height!=renderbuffer.height){renderbuffer.width=this.width;renderbuffer.height=this.height;gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,this.width,this.height);}
gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,renderbuffer);}
callback();gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindRenderbuffer(gl.RENDERBUFFER,null);gl.viewport(v[0],v[1],v[2],v[3]);},

swapWith:function(other){var temp;temp=other.id;other.id=this.id;this.id=temp;temp=other.width;other.width=this.width;this.width=temp;temp=other.height;other.height=this.height;this.height=temp;}};
Texture.fromImage=function(image,options){options=options||{};var texture=new Texture(image.width,image.height,options);try{gl.texImage2D(gl.TEXTURE_2D,0,texture.format,texture.format,texture.type,image);}catch(e){if(window.location.protocol=='file:'){throw'image not loaded for security reasons (serve this page over "http://" instead)';}else{throw'image not loaded for security reasons (image must originate from the same '+'domain as this page or use Cross-Origin Resource Sharing)';}}
if(options.minFilter&&options.minFilter!=gl.NEAREST&&options.minFilter!=gl.LINEAR){gl.generateMipmap(gl.TEXTURE_2D);}
return texture;};

Texture.fromURL=function(url,options){var texture=Texture.checkerboard(options);var image=new Image();image.crossOrigin="anonymous";var context=gl;image.onload=function(){context.makeCurrent();Texture.fromImage(image,options).swapWith(texture);if(options.callback!==undefined){options.callback(this);}};image.src=url;return texture;};Texture.checkerboard=function(options){checkerboardCanvas=checkerboardCanvas||(function(){var c=document.createElement('canvas').getContext('2d');c.canvas.width=c.canvas.height=128;for(var y=0;y<c.canvas.height;y+=16){for(var x=0;x<c.canvas.width;x+=16){c.fillStyle=(x^y)&16?'#FFF':'#DDD';c.fillRect(x,y,16,16);}}
return c.canvas;})();return Texture.fromImage(checkerboardCanvas,options);};
















function Indexer(){this.unique=[];this.indices=[];this.map={};}
Indexer.prototype={

add:function(obj){var key=JSON.stringify(obj);if(!(key in this.map)){this.map[key]=this.unique.length;this.unique.push(obj);}
return this.map[key];}};
function Buffer(target,type){this.buffer=null;this.target=target;this.type=type;this.data=[];}
Buffer.prototype={





compile:function(type){var data=[];for(var i=0,chunk=10000;i<this.data.length;i+=chunk){data=Array.prototype.concat.apply(data,this.data.slice(i,i+chunk));}
var spacing=this.data.length?data.length/this.data.length:0;if(spacing!=Math.round(spacing))throw'buffer elements not of consistent size, average size is '+spacing;this.buffer=this.buffer||gl.createBuffer();this.buffer.length=data.length;this.buffer.spacing=spacing;gl.bindBuffer(this.target,this.buffer);gl.bufferData(this.target,new this.type(data),type||gl.STATIC_DRAW);}};







function Mesh(options){options=options||{};this.vertexBuffers={};this.indexBuffers={};this.addVertexBuffer('vertices','gl_Vertex');if(options.coords)this.addVertexBuffer('coords','gl_TexCoord');if(options.normals)this.addVertexBuffer('normals','gl_Normal');if(options.colors)this.addVertexBuffer('colors','gl_Color');if(!('triangles'in options)||options.triangles)this.addIndexBuffer('triangles');if(options.lines)this.addIndexBuffer('lines');}
Mesh.prototype={

addVertexBuffer:function(name,attribute){var buffer=this.vertexBuffers[attribute]=new Buffer(gl.ARRAY_BUFFER,Float32Array);buffer.name=name;this[name]=[];},
addIndexBuffer:function(name){this.indexBuffers[name]=new Buffer(gl.ELEMENT_ARRAY_BUFFER,Uint16Array);this[name]=[];},


compile:function(){var buffer;for(var attribute in this.vertexBuffers){buffer=this.vertexBuffers[attribute];buffer.data=this[buffer.name];buffer.compile();}
for(var name in this.indexBuffers){buffer=this.indexBuffers[name];buffer.data=this[name];buffer.compile();}},

transform:function(matrix){this.vertices=this.vertices.map(function(v){return matrix.transformPoint(Vector.fromArray(v)).toArray();});if(this.normals){var invTrans=matrix.inverse().transpose();this.normals=this.normals.map(function(n){return invTrans.transformVector(Vector.fromArray(n)).unit().toArray();});}
this.compile();return this;},


computeNormals:function(){if(!this.normals)this.addVertexBuffer('normals','gl_Normal');var i;for(i=0;i<this.vertices.length;i++){this.normals[i]=new Vector();}
for(i=0;i<this.triangles.length;i++){var t=this.triangles[i];var a=Vector.fromArray(this.vertices[t[0]]);var b=Vector.fromArray(this.vertices[t[1]]);var c=Vector.fromArray(this.vertices[t[2]]);var normal=b.subtract(a).cross(c.subtract(a)).unit();this.normals[t[0]]=this.normals[t[0]].add(normal);this.normals[t[1]]=this.normals[t[1]].add(normal);this.normals[t[2]]=this.normals[t[2]].add(normal);}
for(i=0;i<this.vertices.length;i++){this.normals[i]=this.normals[i].unit().toArray();}
this.compile();return this;},
computeWireframe:function(){var indexer=new Indexer();for(var i=0;i<this.triangles.length;i++){var t=this.triangles[i];for(var j=0;j<t.length;j++){var a=t[j],b=t[(j+1)%t.length];indexer.add([Math.min(a,b),Math.max(a,b)]);}}
if(!this.lines)this.addIndexBuffer('lines');this.lines=indexer.unique;this.compile();return this;},

getAABB:function(){var aabb={min:new Vector(Number.MAX_VALUE,Number.MAX_VALUE,Number.MAX_VALUE)};aabb.max=aabb.min.negative();for(var i=0;i<this.vertices.length;i++){var v=Vector.fromArray(this.vertices[i]);aabb.min=Vector.min(aabb.min,v);aabb.max=Vector.max(aabb.max,v);}
return aabb;},    

getBoundingSphere:function(){var aabb=this.getAABB();var sphere={center:aabb.min.add(aabb.max).divide(2),radius:0};for(var i=0;i<this.vertices.length;i++){sphere.radius=Math.max(sphere.radius,Vector.fromArray(this.vertices[i]).subtract(sphere.center).length());}
return sphere;}};


Mesh.plane=function(options){options=options||{};var mesh=new Mesh(options),detailX=options.detailX||options.detail||1,detailY=options.detailY||options.detail||1;for(var y=0;y<=detailY;y++){var t=y/detailY;for(var x=0;x<=detailX;x++){var s=x/detailX;mesh.vertices.push([2*s-1,2*t-1,0]);if(mesh.coords)mesh.coords.push([s,t]);if(mesh.normals)mesh.normals.push([0,0,1]);if(x<detailX&&y<detailY){var i=x+y*(detailX+1);mesh.triangles.push([i,i+1,i+detailX+1]);mesh.triangles.push([i+detailX+1,i+1,i+detailX+2]);}}}
mesh.compile();return mesh;};var cubeData=[[0,4,2,6,-1,0,0],[1,3,5,7,+1,0,0],[0,1,4,5,0,-1,0],[2,6,3,7,0,+1,0],[0,2,1,3,0,0,-1],[4,5,6,7,0,0,+1]
];function pickOctant(i){return new Vector((i&1)*2-1,(i&2)-1,(i&4)/2-1);}

Mesh.cube=function(options){var mesh=new Mesh(options);for(var i=0;i<cubeData.length;i++){var data=cubeData[i],v=i*4;for(var j=0;j<4;j++){var d=data[j];mesh.vertices.push(pickOctant(d).toArray());if(mesh.coords)mesh.coords.push([j&1,(j&2)/2]);if(mesh.normals)mesh.normals.push(data.slice(4,7));}
mesh.triangles.push([v,v+1,v+2]);mesh.triangles.push([v+2,v+1,v+3]);}
mesh.compile();return mesh;};

Mesh.sphere=function(options){function tri(a,b,c){return flip?[a,c,b]:[a,b,c];}
function fix(x){return x+(x-x*x) / 2;		}
options = options || {};		var mesh = new Mesh(options);		var indexer = new Indexer(),			detail = options.detail || 6;		for(var octant = 0; octant < 8; octant++) {			var scale = pickOctant(octant);			var flip = scale.x * scale.y * scale.z > 0;			var data = [];			for(var i = 0; i <= detail; i++) {				//Generate a row of vertices on the surface of the sphere

var j,a,b,c;for(j=0;i+j<=detail;j++){a=i/detail;b=j/detail;c=(detail-i-j)/detail;var vertex={vertex:new Vector(fix(a),fix(b),fix(c)).unit().multiply(scale).toArray()};if(mesh.coords)vertex.coord=scale.y>0?[1-a,c]:[c,1-a];data.push(indexer.add(vertex));}
if(i>0){for(j=0;i+j<=detail;j++){a=(i-1)*(detail+1)+((i-1)-(i-1)*(i-1))/2+j;b=i*(detail+1)+(i-i*i)/2+j;mesh.triangles.push(tri(data[a],data[a+1],data[b]));if(i+j<detail){mesh.triangles.push(tri(data[b],data[a+1],data[b+1]));}}}}}
mesh.vertices=indexer.unique.map(function(v){return v.vertex;});if(mesh.coords)mesh.coords=indexer.unique.map(function(v){return v.coord;});if(mesh.normals)mesh.normals=mesh.vertices;mesh.compile();return mesh;};
Mesh.load=function(json,options){options=options||{};if(!('coords'in options))options.coords=!!json.coords;if(!('normals'in options))options.normals=!!json.normals;if(!('colors'in options))options.colors=!!json.colors;if(!('triangles'in options))options.triangles=!!json.triangles;if(!('lines'in options))options.lines=!!json.lines;var mesh=new Mesh(options);mesh.vertices=json.vertices;if(mesh.coords)mesh.coords=json.coords;if(mesh.normals)mesh.normals=json.normals;if(mesh.colors)mesh.colors=json.colors;if(mesh.triangles)mesh.triangles=json.triangles;if(mesh.lines)mesh.lines=json.lines;mesh.compile();return mesh;};


function Vector(x,y,z){this.x=x||0;this.y=y||0;this.z=z||0;}


Vector.prototype={negative:function(){return new Vector(-this.x,-this.y,-this.z);},add:function(v){if(v instanceof Vector)return new Vector(this.x+v.x,this.y+v.y,this.z+v.z);else return new Vector(this.x+v,this.y+v,this.z+v);},subtract:function(v){if(v instanceof Vector)return new Vector(this.x-v.x,this.y-v.y,this.z-v.z);else return new Vector(this.x-v,this.y-v,this.z-v);},multiply:function(v){if(v instanceof Vector)return new Vector(this.x*v.x,this.y*v.y,this.z*v.z);else return new Vector(this.x*v,this.y*v,this.z*v);},divide:function(v){if(v instanceof Vector)return new Vector(this.x/v.x,this.y/v.y,this.z/v.z);else return new Vector(this.x/v,this.y/v,this.z/v);},equals:function(v){return this.x==v.x&&this.y==v.y&&this.z==v.z;},dot:function(v){return this.x*v.x+this.y*v.y+this.z*v.z;},cross:function(v){return new Vector(this.y*v.z-this.z*v.y,this.z*v.x-this.x*v.z,this.x*v.y-this.y*v.x);},length:function(){return Math.sqrt(this.dot(this));},unit:function(){return this.divide(this.length());},min:function(){return Math.min(Math.min(this.x,this.y),this.z);},max:function(){return Math.max(Math.max(this.x,this.y),this.z);},toAngles:function(){return{theta:Math.atan2(this.z,this.x),phi:Math.asin(this.y/this.length())};},toArray:function(n){return[this.x,this.y,this.z].slice(0,n||3);},clone:function(){return new Vector(this.x,this.y,this.z);},init:function(x,y,z){this.x=x;this.y=y;this.z=z;return this;}};


Vector.negative=function(a,b){b.x=-a.x;b.y=-a.y;b.z=-a.z;return b;};Vector.add=function(a,b,c){if(b instanceof Vector){c.x=a.x+b.x;c.y=a.y+b.y;c.z=a.z+b.z;}else{c.x=a.x+b;c.y=a.y+b;c.z=a.z+b;}
return c;};Vector.subtract=function(a,b,c){if(b instanceof Vector){c.x=a.x-b.x;c.y=a.y-b.y;c.z=a.z-b.z;}else{c.x=a.x-b;c.y=a.y-b;c.z=a.z-b;}
return c;};Vector.multiply=function(a,b,c){if(b instanceof Vector){c.x=a.x*b.x;c.y=a.y*b.y;c.z=a.z*b.z;}else{c.x=a.x*b;c.y=a.y*b;c.z=a.z*b;}
return c;};Vector.divide=function(a,b,c){if(b instanceof Vector){c.x=a.x/b.x;c.y=a.y/b.y;c.z=a.z/b.z;}else{c.x=a.x/b;c.y=a.y/b;c.z=a.z/b;}
return c;};Vector.cross=function(a,b,c){c.x=a.y*b.z-a.z*b.y;c.y=a.z*b.x-a.x*b.z;c.z=a.x*b.y-a.y*b.x;return c;};Vector.unit=function(a,b){var length=a.length();b.x=a.x/length;b.y=a.y/length;b.z=a.z/length;return b;};Vector.fromAngles=function(theta,phi){return new Vector(Math.cos(theta)*Math.cos(phi),Math.sin(phi),Math.sin(theta)*Math.cos(phi));};Vector.randomDirection=function(){return Vector.fromAngles(Math.random()*Math.PI*2,Math.asin(Math.random()*2-1));};Vector.min=function(a,b){return new Vector(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.min(a.z,b.z));};Vector.max=function(a,b){return new Vector(Math.max(a.x,b.x),Math.max(a.y,b.y),Math.max(a.z,b.z));};Vector.lerp=function(a,b,fraction){return b.subtract(a).multiply(fraction).add(a);};Vector.fromArray=function(a){return new Vector(a[0],a[1],a[2]);};











function regexMap(regex,text,callback){var result;while((result=regex.exec(text))!==null){callback(result);}}

var LIGHTGL_PREFIX='LIGHTGL';
function Shader(vertexSource,fragmentSource){ function followScriptTagById(id){var element=document.getElementById(id);return element?element.text:id;}
vertexSource=followScriptTagById(vertexSource);fragmentSource=followScriptTagById(fragmentSource);var header='\
    uniform mat3 gl_NormalMatrix;\
    uniform mat4 gl_ModelViewMatrix;\
    uniform mat4 gl_ProjectionMatrix;\
    uniform mat4 gl_ModelViewProjectionMatrix;\
    uniform mat4 gl_ModelViewMatrixInverse;\
    uniform mat4 gl_ProjectionMatrixInverse;\
    uniform mat4 gl_ModelViewProjectionMatrixInverse;\
  ';var vertexHeader=header+'\
    attribute vec4 gl_Vertex;\
    attribute vec4 gl_TexCoord;\
    attribute vec3 gl_Normal;\
    attribute vec4 gl_Color;\
    vec4 ftransform() {\
      return gl_ModelViewProjectionMatrix * gl_Vertex;\
    }\
  ';var fragmentHeader='\
    precision highp float;\
  '+header;
var source=vertexSource+fragmentSource;var usedMatrices={};regexMap(/\b(gl_[^;]*)\b;/g,header,function(groups){var name=groups[1];if(source.indexOf(name)!=-1){var capitalLetters=name.replace(/[a-z_]/g,'');usedMatrices[capitalLetters]=LIGHTGL_PREFIX+name;}});if(source.indexOf('ftransform')!=-1)usedMatrices.MVPM=LIGHTGL_PREFIX+'gl_ModelViewProjectionMatrix';this.usedMatrices=usedMatrices;


function fix(header,source){var replaced={};var match=/^((\s*\/\/.*\n|\s*#extension.*\n)+)\^*$/.exec(source);source=match?match[1]+header+source.substr(match[1].length):header+source;regexMap(/\bgl_\w+\b/g,header,function(result){if(!(result in replaced)){source=source.replace(new RegExp('\\b'+result+'\\b','g'),LIGHTGL_PREFIX+result);replaced[result]=true;}});return source;}
vertexSource=fix(vertexHeader,vertexSource);fragmentSource=fix(fragmentHeader,fragmentSource);function compileSource(type,source){var shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){throw'compile error: '+gl.getShaderInfoLog(shader);}
return shader;}
this.program=gl.createProgram();gl.attachShader(this.program,compileSource(gl.VERTEX_SHADER,vertexSource));gl.attachShader(this.program,compileSource(gl.FRAGMENT_SHADER,fragmentSource));gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS)){throw'link error: '+gl.getProgramInfoLog(this.program);}
this.attributes={};this.uniformLocations={};var isSampler={};regexMap(/uniform\s+sampler(1D|2D|3D|Cube)\s+(\w+)\s*;/g,vertexSource+fragmentSource,function(groups){isSampler[groups[2]]=1;});this.isSampler=isSampler;}
function isArray(obj){var str=Object.prototype.toString.call(obj);return str=='[object Array]'||str=='[object Float32Array]';}
function isNumber(obj){var str=Object.prototype.toString.call(obj);return str=='[object Number]'||str=='[object Boolean]';}
Shader.prototype={

uniforms:function(uniforms){gl.useProgram(this.program);for(var name in uniforms){var location=this.uniformLocations[name]||gl.getUniformLocation(this.program,name);if(!location)continue;this.uniformLocations[name]=location;var value=uniforms[name];if(value instanceof Vector){value=[value.x,value.y,value.z];}else if(value instanceof Matrix){value=value.m;}
if(isArray(value)){switch(value.length){case 1:gl.uniform1fv(location,new Float32Array(value));break;case 2:gl.uniform2fv(location,new Float32Array(value));break;case 3:gl.uniform3fv(location,new Float32Array(value));break;case 4:gl.uniform4fv(location,new Float32Array(value));break;
case 9:gl.uniformMatrix3fv(location,false,new Float32Array([value[0],value[3],value[6],value[1],value[4],value[7],value[2],value[5],value[8]]));break;case 16:gl.uniformMatrix4fv(location,false,new Float32Array([value[0],value[4],value[8],value[12],value[1],value[5],value[9],value[13],value[2],value[6],value[10],value[14],value[3],value[7],value[11],value[15]]));break;default:throw'don\'t know how to load uniform "'+name+'" of length '+value.length;}}else if(isNumber(value)){(this.isSampler[name]?gl.uniform1i:gl.uniform1f).call(gl,location,value);}else{throw'attempted to set uniform "'+name+'" to invalid value '+value;}}
return this;},


draw:function(mesh,mode){this.drawBuffers(mesh.vertexBuffers,mesh.indexBuffers[mode==gl.LINES?'lines':'triangles'],arguments.length<2?gl.TRIANGLES:mode);},




drawBuffers:function(vertexBuffers,indexBuffer,mode){var used=this.usedMatrices;var MVM=gl.modelviewMatrix;var PM=gl.projectionMatrix;var MVMI=(used.MVMI||used.NM)?MVM.inverse():null;var PMI=(used.PMI)?PM.inverse():null;var MVPM=(used.MVPM||used.MVPMI)?PM.multiply(MVM):null;var matrices={};if(used.MVM)matrices[used.MVM]=MVM;if(used.MVMI)matrices[used.MVMI]=MVMI;if(used.PM)matrices[used.PM]=PM;if(used.PMI)matrices[used.PMI]=PMI;if(used.MVPM)matrices[used.MVPM]=MVPM;if(used.MVPMI)matrices[used.MVPMI]=MVPM.inverse();if(used.NM){var m=MVMI.m;matrices[used.NM]=[m[0],m[4],m[8],m[1],m[5],m[9],m[2],m[6],m[10]];}
this.uniforms(matrices);var length=0,attribute;for(attribute in vertexBuffers){var buffer=vertexBuffers[attribute];var location=this.attributes[attribute]||gl.getAttribLocation(this.program,attribute.replace(/^(gl_.*)$/,LIGHTGL_PREFIX+'$1'));if(location==-1||!buffer.buffer)
continue;this.attributes[attribute]=location;gl.bindBuffer(gl.ARRAY_BUFFER,buffer.buffer);gl.enableVertexAttribArray(location); if(buffer.buffer.spacing<1||buffer.buffer.spacing>4){continue;}
gl.vertexAttribPointer(location,buffer.buffer.spacing,gl.FLOAT,false,0,0);length=buffer.buffer.length/buffer.buffer.spacing;}
for(attribute in this.attributes){if(!(attribute in vertexBuffers)){gl.disableVertexAttribArray(this.attributes[attribute]);}}
if(length&&(!indexBuffer||indexBuffer.buffer)){if(indexBuffer){gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer.buffer);gl.drawElements(mode,indexBuffer.buffer.length,gl.UNSIGNED_SHORT,0);}else{gl.drawArrays(mode,0,length);}}
return this;}};

Shader.fromURL=function(vsURL,fsURL){var XMLHttpRequestGet=function(uri){var mHttpReq=new XMLHttpRequest();mHttpReq.open("GET",uri,false);mHttpReq.send(null);if(mHttpReq.status!==200){throw'could not load '+uri;}
return mHttpReq.responseText;};var vsSource=XMLHttpRequestGet(vsURL);var fsSource=XMLHttpRequestGet(fsURL);return new Shader(vsSource,fsSource);};Shader.from=function(vsURLorID,fsURLorID){try{return new Shader(vsURLorID,fsURLorID);}catch(e){return Shader.fromURL(vsURLorID,fsURLorID);}};
var gl;var GL={




create:function(options){options=options||{};var canvas=options.canvas;if(!canvas){canvas=document.createElement('canvas');canvas.width=options.width||800;canvas.height=options.height||600;}
if(!('alpha'in options))options.alpha=false;try{gl=canvas.getContext('webgl',options);}catch(e){}
try{gl=gl||canvas.getContext('experimental-webgl',options);}catch(e){}
if(!gl)throw'WebGL not supported';addMatrixStack();addImmediateMode();addEventListeners();addOtherMethods();return gl;},  
keys:{},Matrix:Matrix,Indexer:Indexer,Buffer:Buffer,Mesh:Mesh,HitTest:HitTest,Raytracer:Raytracer,Shader:Shader,Texture:Texture,Vector:Vector};

function addMatrixStack(){gl.MODELVIEW=ENUM|1;gl.PROJECTION=ENUM|2;var tempMatrix=new Matrix();var resultMatrix=new Matrix();gl.modelviewMatrix=new Matrix();gl.projectionMatrix=new Matrix();var modelviewStack=[];var projectionStack=[];var matrix,stack;gl.matrixMode=function(mode){switch(mode){case gl.MODELVIEW:matrix='modelviewMatrix';stack=modelviewStack;break;case gl.PROJECTION:matrix='projectionMatrix';stack=projectionStack;break;default:throw'invalid matrix mode '+mode;}};gl.loadIdentity=function(){Matrix.identity(gl[matrix]);};gl.loadMatrix=function(m){var from=m.m,to=gl[matrix].m;for(var i=0;i<16;i++){to[i]=from[i];}};gl.multMatrix=function(m){gl.loadMatrix(Matrix.multiply(gl[matrix],m,resultMatrix));};gl.perspective=function(fov,aspect,near,far){gl.multMatrix(Matrix.perspective(fov,aspect,near,far,tempMatrix));};gl.frustum=function(l,r,b,t,n,f){gl.multMatrix(Matrix.frustum(l,r,b,t,n,f,tempMatrix));};gl.ortho=function(l,r,b,t,n,f){gl.multMatrix(Matrix.ortho(l,r,b,t,n,f,tempMatrix));};gl.scale=function(x,y,z){gl.multMatrix(Matrix.scale(x,y,z,tempMatrix));};gl.translate=function(x,y,z){gl.multMatrix(Matrix.translate(x,y,z,tempMatrix));};gl.rotate=function(a,x,y,z){gl.multMatrix(Matrix.rotate(a,x,y,z,tempMatrix));};gl.lookAt=function(ex,ey,ez,cx,cy,cz,ux,uy,uz){gl.multMatrix(Matrix.lookAt(ex,ey,ez,cx,cy,cz,ux,uy,uz,tempMatrix));};gl.pushMatrix=function(){stack.push(Array.prototype.slice.call(gl[matrix].m));};gl.popMatrix=function(){var m=stack.pop();gl[matrix].m=hasFloat32Array?new Float32Array(m):m;};gl.project=function(objX,objY,objZ,modelview,projection,viewport){modelview=modelview||gl.modelviewMatrix;projection=projection||gl.projectionMatrix;viewport=viewport||gl.getParameter(gl.VIEWPORT);var point=projection.transformPoint(modelview.transformPoint(new Vector(objX,objY,objZ)));return new Vector(viewport[0]+viewport[2]*(point.x*0.5+0.5),viewport[1]+viewport[3]*(point.y*0.5+0.5),point.z*0.5+0.5);};gl.unProject=function(winX,winY,winZ,modelview,projection,viewport){modelview=modelview||gl.modelviewMatrix;projection=projection||gl.projectionMatrix;viewport=viewport||gl.getParameter(gl.VIEWPORT);var point=new Vector((winX-viewport[0])/viewport[2]*2-1,(winY-viewport[1])/viewport[3]*2-1,winZ*2-1);return Matrix.inverse(Matrix.multiply(projection,modelview,tempMatrix),resultMatrix).transformPoint(point);};gl.matrixMode(gl.MODELVIEW);}







function addImmediateMode(){var immediateMode={mesh:new Mesh({coords:true,colors:true,triangles:false}),mode:-1,coord:[0,0,0,0],color:[1,1,1,1],pointSize:1,shader:new Shader('\
      uniform float pointSize;\
      varying vec4 color;\
      varying vec4 coord;\
      void main() {\
        color = gl_Color;\
        coord = gl_TexCoord;\
        gl_Position = gl_ModelViewProjectionMatrix * gl_Vertex;\
        gl_PointSize = pointSize;\
      }\
    ','\
      uniform sampler2D texture;\
      uniform float pointSize;\
      uniform bool useTexture;\
      varying vec4 color;\
      varying vec4 coord;\
      void main() {\
        gl_FragColor = color;\
        if (useTexture) gl_FragColor *= texture2D(texture, coord.xy);\
      }\
    ')};gl.pointSize=function(pointSize){immediateMode.shader.uniforms({pointSize:pointSize});};gl.begin=function(mode){if(immediateMode.mode!=-1)throw'mismatched gl.begin() and gl.end() calls';immediateMode.mode=mode;immediateMode.mesh.colors=[];immediateMode.mesh.coords=[];immediateMode.mesh.vertices=[];};gl.color=function(r,g,b,a){immediateMode.color=(arguments.length==1)?r.toArray().concat(1):[r,g,b,a||1];};gl.texCoord=function(s,t){immediateMode.coord=(arguments.length==1)?s.toArray(2):[s,t];};gl.vertex=function(x,y,z){immediateMode.mesh.colors.push(immediateMode.color);immediateMode.mesh.coords.push(immediateMode.coord);immediateMode.mesh.vertices.push(arguments.length==1?x.toArray():[x,y,z]);};gl.end=function(){if(immediateMode.mode==-1)throw'mismatched gl.begin() and gl.end() calls';immediateMode.mesh.compile();immediateMode.shader.uniforms({useTexture:!!gl.getParameter(gl.TEXTURE_BINDING_2D)}).draw(immediateMode.mesh,immediateMode.mode);immediateMode.mode=-1;};}



function addEventListeners(){var context=gl,oldX=0,oldY=0,buttons={},hasOld=false;var has=Object.prototype.hasOwnProperty;function isDragging(){for(var b in buttons){if(has.call(buttons,b)&&buttons[b])return true;}
return false;}
function augment(original){



var e={};for(var name in original){if(typeof original[name]=='function'){e[name]=(function(callback){return function(){callback.apply(original,arguments);};})(original[name]);}else{e[name]=original[name];}}
e.original=original;e.x=e.pageX;e.y=e.pageY;for(var obj=gl.canvas;obj;obj=obj.offsetParent){e.x-=obj.offsetLeft;e.y-=obj.offsetTop;}
if(hasOld){e.deltaX=e.x-oldX;e.deltaY=e.y-oldY;}else{e.deltaX=0;e.deltaY=0;hasOld=true;}
oldX=e.x;oldY=e.y;e.dragging=isDragging();e.preventDefault=function(){e.original.preventDefault();};e.stopPropagation=function(){e.original.stopPropagation();};return e;}
function augmentTouchEvent(original){var e={};for(var name in original){if(typeof original[name]=='function'){e[name]=(function(callback){return function(){callback.apply(original,arguments);};})(original[name]);}else{e[name]=original[name];}}
e.original=original;if(e.targetTouches.length>0){var touch=e.targetTouches[0];e.x=touch.pageX;e.y=touch.pageY;for(var obj=gl.canvas;obj;obj=obj.offsetParent){e.x-=obj.offsetLeft;e.y-=obj.offsetTop;}
if(hasOld){e.deltaX=e.x-oldX;e.deltaY=e.y-oldY;}else{e.deltaX=0;e.deltaY=0;hasOld=true;}
oldX=e.x;oldY=e.y;e.dragging=true;}
e.preventDefault=function(){e.original.preventDefault();};e.stopPropagation=function(){e.original.stopPropagation();};return e;}
function mousedown(e){gl=context;if(!isDragging()){on(document,'mousemove',mousemove);on(document,'mouseup',mouseup);off(gl.canvas,'mousemove',mousemove);off(gl.canvas,'mouseup',mouseup);}
buttons[e.which]=true;e=augment(e);if(gl.onmousedown)gl.onmousedown(e);e.preventDefault();}
function mousemove(e){gl=context;e=augment(e);if(gl.onmousemove)gl.onmousemove(e);e.preventDefault();}
function mouseup(e){gl=context;buttons[e.which]=false;if(!isDragging()){off(document,'mousemove',mousemove);off(document,'mouseup',mouseup);on(gl.canvas,'mousemove',mousemove);on(gl.canvas,'mouseup',mouseup);}
e=augment(e);if(gl.onmouseup)gl.onmouseup(e);e.preventDefault();}
function mousewheel(e){gl=context;e=augment(e);if(gl.onmousewheel)gl.onmousewheel(e);e.preventDefault();}
function touchstart(e){resetAll();on(document,'touchmove',touchmove);on(document,'touchend',touchend);off(gl.canvas,'touchmove',touchmove);off(gl.canvas,'touchend',touchend);gl=context;e=augmentTouchEvent(e);if(gl.ontouchstart)gl.ontouchstart(e);e.preventDefault();}
function touchmove(e){gl=context;if(e.targetTouches.length===0){touchend(e);}
e=augmentTouchEvent(e);if(gl.ontouchmove)gl.ontouchmove(e);e.preventDefault();}
function touchend(e){off(document,'touchmove',touchmove);off(document,'touchend',touchend);on(gl.canvas,'touchmove',touchmove);on(gl.canvas,'touchend',touchend);gl=context;e=augmentTouchEvent(e);if(gl.ontouchend)gl.ontouchend(e);e.preventDefault();}
function reset(){hasOld=false;}
function resetAll(){buttons={};hasOld=false;}
on(gl.canvas,'mousedown',mousedown);on(gl.canvas,'mousemove',mousemove);on(gl.canvas,'mouseup',mouseup);on(gl.canvas,'mousewheel',mousewheel);on(gl.canvas,'DOMMouseScroll',mousewheel);on(gl.canvas,'mouseover',reset);on(gl.canvas,'mouseout',reset);on(gl.canvas,'touchstart',touchstart);on(gl.canvas,'touchmove',touchmove);on(gl.canvas,'touchend',touchend);on(document,'contextmenu',resetAll);}







function mapKeyCode(code){var named={8:'BACKSPACE',9:'TAB',13:'ENTER',16:'SHIFT',27:'ESCAPE',32:'SPACE',37:'LEFT',38:'UP',39:'RIGHT',40:'DOWN'};return named[code]||(code>=65&&code<=90?String.fromCharCode(code):null);}
function on(element,name,callback){element.addEventListener(name,callback);}
function off(element,name,callback){element.removeEventListener(name,callback);}
on(document,'keydown',function(e){if(!e.altKey&&!e.ctrlKey&&!e.metaKey){var key=mapKeyCode(e.keyCode);if(key)GL.keys[key]=true;GL.keys[e.keyCode]=true;}});on(document,'keyup',function(e){if(!e.altKey&&!e.ctrlKey&&!e.metaKey){var key=mapKeyCode(e.keyCode);if(key)GL.keys[key]=false;GL.keys[e.keyCode]=false;}});function addOtherMethods(){

(function(context){gl.makeCurrent=function(){gl=context;};})(gl);

gl.animate=function(){var post=window.requestAnimationFrame||window.mozRequestAnimationFrame||window.webkitRequestAnimationFrame||function(callback){setTimeout(callback,1000/60);};var time=new Date().getTime();var context=gl;function update(){gl=context;var now=new Date().getTime();if(gl.onupdate)gl.onupdate((now-time)/1000);if(gl.ondraw)gl.ondraw();post(update);time=now;}
update();};


gl.fullscreen=function(options){options=options||{};var top=options.paddingTop||0;var left=options.paddingLeft||0;var right=options.paddingRight||0;var bottom=options.paddingBottom||0;if(!document.body){throw'document.body doesn\'t exist yet (call gl.fullscreen() from '+'window.onload() or from inside the <body> tag)';}
document.body.appendChild(gl.canvas);document.body.style.overflow='hidden';gl.canvas.style.position='absolute';gl.canvas.style.left=left+'px';gl.canvas.style.top=top+'px';function resize(){gl.canvas.width=window.innerWidth-left-right;gl.canvas.height=window.innerHeight-top-bottom;gl.viewport(0,0,gl.canvas.width,gl.canvas.height);if(options.camera||!('camera'in options)){gl.matrixMode(gl.PROJECTION);gl.loadIdentity();gl.perspective(options.fov||45,gl.canvas.width/gl.canvas.height,options.near||0.1,options.far||1000);gl.matrixMode(gl.MODELVIEW);}
if(gl.onresize)gl.onresize();if(gl.ondraw)gl.ondraw();}
on(window,'resize',resize);resize();};}

var ENUM=0x12340000;



var hasFloat32Array=(typeof Float32Array!='undefined');


function Matrix(){var m=Array.prototype.concat.apply([],arguments);if(!m.length){m=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];}
this.m=hasFloat32Array?new Float32Array(m):m;}
Matrix.prototype={

inverse:function(){return Matrix.inverse(this,new Matrix());},
transpose:function(){return Matrix.transpose(this,new Matrix());},
multiply:function(matrix){return Matrix.multiply(this,matrix,new Matrix());},

transformPoint:function(v){var m=this.m;return new Vector(m[0]*v.x+m[1]*v.y+m[2]*v.z+m[3],m[4]*v.x+m[5]*v.y+m[6]*v.z+m[7],m[8]*v.x+m[9]*v.y+m[10]*v.z+m[11]).divide(m[12]*v.x+m[13]*v.y+m[14]*v.z+m[15]);},

transformVector:function(v){var m=this.m;return new Vector(m[0]*v.x+m[1]*v.y+m[2]*v.z,m[4]*v.x+m[5]*v.y+m[6]*v.z,m[8]*v.x+m[9]*v.y+m[10]*v.z);}};


Matrix.inverse=function(matrix,result){result=result||new Matrix();var m=matrix.m,r=result.m;r[0]=m[5]*m[10]*m[15]-m[5]*m[14]*m[11]-m[6]*m[9]*m[15]+m[6]*m[13]*m[11]+m[7]*m[9]*m[14]-m[7]*m[13]*m[10];r[1]=-m[1]*m[10]*m[15]+m[1]*m[14]*m[11]+m[2]*m[9]*m[15]-m[2]*m[13]*m[11]-m[3]*m[9]*m[14]+m[3]*m[13]*m[10];r[2]=m[1]*m[6]*m[15]-m[1]*m[14]*m[7]-m[2]*m[5]*m[15]+m[2]*m[13]*m[7]+m[3]*m[5]*m[14]-m[3]*m[13]*m[6];r[3]=-m[1]*m[6]*m[11]+m[1]*m[10]*m[7]+m[2]*m[5]*m[11]-m[2]*m[9]*m[7]-m[3]*m[5]*m[10]+m[3]*m[9]*m[6];r[4]=-m[4]*m[10]*m[15]+m[4]*m[14]*m[11]+m[6]*m[8]*m[15]-m[6]*m[12]*m[11]-m[7]*m[8]*m[14]+m[7]*m[12]*m[10];r[5]=m[0]*m[10]*m[15]-m[0]*m[14]*m[11]-m[2]*m[8]*m[15]+m[2]*m[12]*m[11]+m[3]*m[8]*m[14]-m[3]*m[12]*m[10];r[6]=-m[0]*m[6]*m[15]+m[0]*m[14]*m[7]+m[2]*m[4]*m[15]-m[2]*m[12]*m[7]-m[3]*m[4]*m[14]+m[3]*m[12]*m[6];r[7]=m[0]*m[6]*m[11]-m[0]*m[10]*m[7]-m[2]*m[4]*m[11]+m[2]*m[8]*m[7]+m[3]*m[4]*m[10]-m[3]*m[8]*m[6];r[8]=m[4]*m[9]*m[15]-m[4]*m[13]*m[11]-m[5]*m[8]*m[15]+m[5]*m[12]*m[11]+m[7]*m[8]*m[13]-m[7]*m[12]*m[9];r[9]=-m[0]*m[9]*m[15]+m[0]*m[13]*m[11]+m[1]*m[8]*m[15]-m[1]*m[12]*m[11]-m[3]*m[8]*m[13]+m[3]*m[12]*m[9];r[10]=m[0]*m[5]*m[15]-m[0]*m[13]*m[7]-m[1]*m[4]*m[15]+m[1]*m[12]*m[7]+m[3]*m[4]*m[13]-m[3]*m[12]*m[5];r[11]=-m[0]*m[5]*m[11]+m[0]*m[9]*m[7]+m[1]*m[4]*m[11]-m[1]*m[8]*m[7]-m[3]*m[4]*m[9]+m[3]*m[8]*m[5];r[12]=-m[4]*m[9]*m[14]+m[4]*m[13]*m[10]+m[5]*m[8]*m[14]-m[5]*m[12]*m[10]-m[6]*m[8]*m[13]+m[6]*m[12]*m[9];r[13]=m[0]*m[9]*m[14]-m[0]*m[13]*m[10]-m[1]*m[8]*m[14]+m[1]*m[12]*m[10]+m[2]*m[8]*m[13]-m[2]*m[12]*m[9];r[14]=-m[0]*m[5]*m[14]+m[0]*m[13]*m[6]+m[1]*m[4]*m[14]-m[1]*m[12]*m[6]-m[2]*m[4]*m[13]+m[2]*m[12]*m[5];r[15]=m[0]*m[5]*m[10]-m[0]*m[9]*m[6]-m[1]*m[4]*m[10]+m[1]*m[8]*m[6]+m[2]*m[4]*m[9]-m[2]*m[8]*m[5];var det=m[0]*r[0]+m[1]*r[4]+m[2]*r[8]+m[3]*r[12];for(var i=0;i<16;i++)r[i]/=det;return result;};

Matrix.transpose=function(matrix,result){result=result||new Matrix();var m=matrix.m,r=result.m;r[0]=m[0];r[1]=m[4];r[2]=m[8];r[3]=m[12];r[4]=m[1];r[5]=m[5];r[6]=m[9];r[7]=m[13];r[8]=m[2];r[9]=m[6];r[10]=m[10];r[11]=m[14];r[12]=m[3];r[13]=m[7];r[14]=m[11];r[15]=m[15];return result;};


Matrix.multiply=function(left,right,result){result=result||new Matrix();var a=left.m,b=right.m,r=result.m;r[0]=a[0]*b[0]+a[1]*b[4]+a[2]*b[8]+a[3]*b[12];r[1]=a[0]*b[1]+a[1]*b[5]+a[2]*b[9]+a[3]*b[13];r[2]=a[0]*b[2]+a[1]*b[6]+a[2]*b[10]+a[3]*b[14];r[3]=a[0]*b[3]+a[1]*b[7]+a[2]*b[11]+a[3]*b[15];r[4]=a[4]*b[0]+a[5]*b[4]+a[6]*b[8]+a[7]*b[12];r[5]=a[4]*b[1]+a[5]*b[5]+a[6]*b[9]+a[7]*b[13];r[6]=a[4]*b[2]+a[5]*b[6]+a[6]*b[10]+a[7]*b[14];r[7]=a[4]*b[3]+a[5]*b[7]+a[6]*b[11]+a[7]*b[15];r[8]=a[8]*b[0]+a[9]*b[4]+a[10]*b[8]+a[11]*b[12];r[9]=a[8]*b[1]+a[9]*b[5]+a[10]*b[9]+a[11]*b[13];r[10]=a[8]*b[2]+a[9]*b[6]+a[10]*b[10]+a[11]*b[14];r[11]=a[8]*b[3]+a[9]*b[7]+a[10]*b[11]+a[11]*b[15];r[12]=a[12]*b[0]+a[13]*b[4]+a[14]*b[8]+a[15]*b[12];r[13]=a[12]*b[1]+a[13]*b[5]+a[14]*b[9]+a[15]*b[13];r[14]=a[12]*b[2]+a[13]*b[6]+a[14]*b[10]+a[15]*b[14];r[15]=a[12]*b[3]+a[13]*b[7]+a[14]*b[11]+a[15]*b[15];return result;};


Matrix.identity=function(result){result=result||new Matrix();var m=result.m;m[0]=m[5]=m[10]=m[15]=1;m[1]=m[2]=m[3]=m[4]=m[6]=m[7]=m[8]=m[9]=m[11]=m[12]=m[13]=m[14]=0;return result;};





Matrix.perspective=function(fov,aspect,near,far,result){var y=Math.tan(fov*Math.PI/360)*near;var x=y*aspect;return Matrix.frustum(-x,x,-y,y,near,far,result);};



Matrix.frustum=function(l,r,b,t,n,f,result){result=result||new Matrix();var m=result.m;m[0]=2*n/(r-l);m[1]=0;m[2]=(r+l)/(r-l);m[3]=0;m[4]=0;m[5]=2*n/(t-b);m[6]=(t+b)/(t-b);m[7]=0;m[8]=0;m[9]=0;m[10]=-(f+n)/(f-n);m[11]=-2*f*n/(f-n);m[12]=0;m[13]=0;m[14]=-1;m[15]=0;return result;};



Matrix.ortho=function(l,r,b,t,n,f,result){result=result||new Matrix();var m=result.m;m[0]=2/(r-l);m[1]=0;m[2]=0;m[3]=-(r+l)/(r-l);m[4]=0;m[5]=2/(t-b);m[6]=0;m[7]=-(t+b)/(t-b);m[8]=0;m[9]=0;m[10]=-2/(f-n);m[11]=-(f+n)/(f-n);m[12]=0;m[13]=0;m[14]=0;m[15]=1;return result;};

Matrix.scale=function(x,y,z,result){result=result||new Matrix();var m=result.m;m[0]=x;m[1]=0;m[2]=0;m[3]=0;m[4]=0;m[5]=y;m[6]=0;m[7]=0;m[8]=0;m[9]=0;m[10]=z;m[11]=0;m[12]=0;m[13]=0;m[14]=0;m[15]=1;return result;};

Matrix.translate=function(x,y,z,result){result=result||new Matrix();var m=result.m;m[0]=1;m[1]=0;m[2]=0;m[3]=x;m[4]=0;m[5]=1;m[6]=0;m[7]=y;m[8]=0;m[9]=0;m[10]=1;m[11]=z;m[12]=0;m[13]=0;m[14]=0;m[15]=1;return result;};

Matrix.rotate=function(a,x,y,z,result){if(!a||(!x&&!y&&!z)){return Matrix.identity(result);}
result=result||new Matrix();var m=result.m;var d=Math.sqrt(x*x+y*y+z*z);a*=Math.PI/180;x/=d;y/=d;z/=d;var c=Math.cos(a),s=Math.sin(a),t=1-c;m[0]=x*x*t+c;m[1]=x*y*t-z*s;m[2]=x*z*t+y*s;m[3]=0;m[4]=y*x*t+z*s;m[5]=y*y*t+c;m[6]=y*z*t-x*s;m[7]=0;m[8]=z*x*t-y*s;m[9]=z*y*t+x*s;m[10]=z*z*t+c;m[11]=0;m[12]=0;m[13]=0;m[14]=0;m[15]=1;return result;};


Matrix.lookAt=function(ex,ey,ez,cx,cy,cz,ux,uy,uz,result){result=result||new Matrix();var m=result.m;var e=new Vector(ex,ey,ez);var c=new Vector(cx,cy,cz);var u=new Vector(ux,uy,uz);var f=e.subtract(c).unit();var s=u.cross(f).unit();var t=f.cross(s).unit();m[0]=s.x;m[1]=s.y;m[2]=s.z;m[3]=-s.dot(e);m[4]=t.x;m[5]=t.y;m[6]=t.z;m[7]=-t.dot(e);m[8]=f.x;m[9]=f.y;m[10]=f.z;m[11]=-f.dot(e);m[12]=0;m[13]=0;m[14]=0;m[15]=1;return result;};



function HitTest(t,hit,normal){this.t=arguments.length?t:Number.MAX_VALUE;this.hit=hit;this.normal=normal;}
HitTest.prototype={mergeWith:function(other){if(other.t>0&&other.t<this.t){this.t=other.t;this.hit=other.hit;this.normal=other.normal;}}};

function Raytracer(){var v=gl.getParameter(gl.VIEWPORT);var m=gl.modelviewMatrix.m;var axisX=new Vector(m[0],m[4],m[8]);var axisY=new Vector(m[1],m[5],m[9]);var axisZ=new Vector(m[2],m[6],m[10]);var offset=new Vector(m[3],m[7],m[11]);this.eye=new Vector(-offset.dot(axisX),-offset.dot(axisY),-offset.dot(axisZ));var minX=v[0],maxX=minX+v[2];var minY=v[1],maxY=minY+v[3];this.ray00=gl.unProject(minX,minY,1).subtract(this.eye);this.ray10=gl.unProject(maxX,minY,1).subtract(this.eye);this.ray01=gl.unProject(minX,maxY,1).subtract(this.eye);this.ray11=gl.unProject(maxX,maxY,1).subtract(this.eye);this.viewport=v;}
Raytracer.prototype={
getRayForPixel:function(x,y){x=(x-this.viewport[0])/this.viewport[2];y=1-(y-this.viewport[1])/this.viewport[3];var ray0=Vector.lerp(this.ray00,this.ray10,x);var ray1=Vector.lerp(this.ray01,this.ray11,x);return Vector.lerp(ray0,ray1,y).unit();}};


Raytracer.hitTestBox=function(origin,ray,min,max){var tMin=min.subtract(origin).divide(ray);var tMax=max.subtract(origin).divide(ray);var t1=Vector.min(tMin,tMax);var t2=Vector.max(tMin,tMax);var tNear=t1.max();var tFar=t2.min();if(tNear>0&&tNear<tFar){var epsilon=1.0e-6,hit=origin.add(ray.multiply(tNear));min=min.add(epsilon);max=max.subtract(epsilon);return new HitTest(tNear,hit,new Vector((hit.x>max.x)-(hit.x<min.x),(hit.y>max.y)-(hit.y<min.y),(hit.z>max.z)-(hit.z<min.z)));}
return null;};

Raytracer.hitTestSphere=function(origin,ray,center,radius){var offset=origin.subtract(center);var a=ray.dot(ray);var b=2*ray.dot(offset);var c=offset.dot(offset)-radius*radius;var discriminant=b*b-4*a*c;if(discriminant>0){var t=(-b-Math.sqrt(discriminant))/(2*a),hit=origin.add(ray.multiply(t));return new HitTest(t,hit,hit.subtract(center).divide(radius));}
return null;};


Raytracer.hitTestTriangle=function(origin,ray,a,b,c){var ab=b.subtract(a);var ac=c.subtract(a);var normal=ab.cross(ac).unit();var t=normal.dot(a.subtract(origin))/normal.dot(ray);if(t>0){var hit=origin.add(ray.multiply(t));var toHit=hit.subtract(a);var dot00=ac.dot(ac);var dot01=ac.dot(ab);var dot02=ac.dot(toHit);var dot11=ab.dot(ab);var dot12=ab.dot(toHit);var divide=dot00*dot11-dot01*dot01;var u=(dot11*dot02-dot01*dot12)/divide;var v=(dot00*dot12-dot01*dot02)/divide;if(u>=0&&v>=0&&u+v<=1)return new HitTest(t,hit,normal);}
return null;};return GL;})();
