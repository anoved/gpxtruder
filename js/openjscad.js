var OpenJsCad=function(){};OpenJsCad.log=function(txt){var timeInMs=Date.now();var prevtime=OpenJsCad.log.prevLogTime;if(!prevtime)prevtime=timeInMs;var deltatime=timeInMs-prevtime;OpenJsCad.log.prevLogTime=timeInMs;var timefmt=(deltatime*0.001).toFixed(3);txt="["+timefmt+"] "+txt;if((typeof(console)=="object")&&(typeof(console.log)=="function"))
{console.log(txt);}
else if((typeof(self)=="object")&&(typeof(self.postMessage)=="function"))
{self.postMessage({cmd:'log',txt:txt});}
else throw new Error("Cannot log");};
OpenJsCad.Viewer=function(containerelement,width,height,initialdepth,displayW,displayH,options){options=options||{};this.color=options.color||[0,0,1];this.bgColor=options.bgColor||[0.93,0.93,0.93,1];var gl=GL.create();this.gl=gl;this.angleX=-60;this.angleY=0;this.angleZ=-45;this.viewpointX=0;this.viewpointY=0;this.viewpointZ=initialdepth;this.bedWidth=180;this.bedDepth=90; this.basemapurl="";this.maptexture=GL.Texture.checkerboard();this.bedmesh=new GL.Mesh({coords:true});this.bedmesh.vertices=[[-90,45,0],[90,45,0],[90,-45,0],[-90,-45,0]];this.bedmesh.coords=[[0,1],[1,1],[1,0],[0,0]];this.bedmesh.triangles=[[3,1,0],[3,2,1],[0,1,3],[1,2,3]];this.bedmesh.compile(); this.oldFingerDist=-1;gl.canvas.style.width=displayW;gl.canvas.style.height=displayH; gl.canvas.width=width;gl.canvas.height=height;gl.viewport(0,0,width,height); this.orthomode=false;this.setViewPerspective(); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor.apply(gl,this.bgColor);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.polygonOffset(1,1); this.lightingShader=new GL.Shader('\
	varying vec3 color;\
	varying vec3 normal;\
	varying vec3 light;\
	void main() {\
	  const vec3 lightDir = vec3(1.0, 2.0, 3.0) / 3.741657386773941;\
	  light = lightDir;\
	  color = gl_Color.rgb;\
	  normal = gl_NormalMatrix * gl_Normal;\
	  gl_Position = gl_ModelViewProjectionMatrix * gl_Vertex;\
	}\
	','\
	varying vec3 color;\
	varying vec3 normal;\
	varying vec3 light;\
	void main() {\
	  vec3 n = normalize(normal);\
	  float diffuse = max(0.0, dot(light, n));\
	  float specular = pow(max(0.0, -reflect(light, n).z), 10.0) * sqrt(diffuse);\
	  gl_FragColor = vec4(mix(color * (0.3 + 0.7 * diffuse), vec3(1.0), specular), 1.0);\
	}\
	'); this.planeShader=new GL.Shader('\
	varying vec2 coord;\
	void main() {\
	 coord = gl_TexCoord.xy;\
	 gl_Position = gl_ModelViewProjectionMatrix * gl_Vertex;\
	}\
	','\
	uniform sampler2D texture;\
	varying vec2 coord;\
	void main() {\
	 gl_FragColor = texture2D(texture, coord);\
	}\
	');containerelement.appendChild(gl.canvas);var _this=this;gl.onmousemove=function(e){_this.onMouseMove(e);};gl.ondraw=function(){_this.onDraw();};gl.ontouchmove=function(e){_this.onTouchMove(e);};gl.onmousewheel=function(e){var wheelDelta=0;if(e.wheelDelta){wheelDelta=e.wheelDelta;}else if(e.detail){ wheelDelta=e.detail*-40;}
if(wheelDelta){_this.updateZoom(-wheelDelta);}};this.clear();};OpenJsCad.Viewer.prototype={setCsg:function(csg){this.gl.makeCurrent();this.meshes=OpenJsCad.Viewer.csgToMeshes(csg,this.color);this.onDraw();},clear:function(){this.meshes=[];this.onDraw();},supported:function(){return!!this.gl;},setViewOrthographic:function(){this.gl.matrixMode(this.gl.PROJECTION);this.gl.loadIdentity();var cx=this.gl.canvas.width,cy=this.gl.canvas.height; var scale=Math.min(Math.max(cx,cy)/this.viewpointZ,Math.min(cx,cy)/this.viewpointZ);this.gl.ortho(-cx/2/scale,cx/2/scale,-cy/2/scale,cy/2/scale,0,10000);this.gl.matrixMode(this.gl.MODELVIEW);this.orthomode=true;},setViewPerspective:function(){this.gl.matrixMode(this.gl.PROJECTION);this.gl.loadIdentity();this.gl.perspective(45,this.gl.canvas.width/this.gl.canvas.height,0.5,100000);this.gl.matrixMode(this.gl.MODELVIEW);this.orthomode=false;},setBedSize:function(width,depth){this.bedWidth=width;this.bedDepth=depth;},setBaseMap:function(url,scale,mapw,maph,dlcallback){var hash=url+scale+mapw+maph;if(this.basemapurl===hash){return;}else{this.basemapurl=hash;}
var bedx=this.bedWidth/2,bedy=this.bedDepth/2;this.bedmesh.vertices=[[-bedx*scale,bedy*scale,0],[bedx*scale,bedy*scale,0],[bedx*scale,-bedy*scale,0],[-bedx*scale,-bedy*scale,0]];this.bedmesh.coords=[[0,1],[1,1],[1,0],[0,0]];this.bedmesh.compile();var that=this;this.maptexture=GL.Texture.fromURL(url,{callback:function(mapImage){that.onDraw(); var basemapButton=document.getElementById("pdfmaplink");basemapButton.onclick=function(e){dlcallback(mapImage,scale,mapw,maph);};}});},clearBaseMap:function(){this.basemapurl="";var bedx=this.bedWidth/2,bedy=this.bedDepth/2;this.bedmesh.vertices=[[-bedx,bedy,0],[bedx,bedy,0],[bedx,-bedy,0],[-bedx,-bedy,0]];this.bedmesh.coords=[[0,1],[1,1],[1,0],[0,0]];this.bedmesh.compile();this.maptexture=GL.Texture.checkerboard();this.onDraw();},ZOOM_MAX:10000,ZOOM_MIN:10,updateZoom:function(delta){var factor=Math.pow(1.003,delta);var coeff=Math.max(this.getZoom(),0.001);coeff*=factor;this.setZoom(coeff);},setZoom:function(coeff){ coeff=Math.max(coeff,0);coeff=Math.min(coeff,1);this.viewpointZ=this.ZOOM_MIN+coeff*(this.ZOOM_MAX-this.ZOOM_MIN);if(this.orthomode){this.setViewOrthographic();}
this.onDraw();},getZoom:function(){var coeff=(this.viewpointZ-this.ZOOM_MIN)/(this.ZOOM_MAX-this.ZOOM_MIN);return coeff;},resetView:function(){this.setView([-60,0,-45],[0,0,200]);},setView:function(angle,viewpoint){this.angleX=angle[0];this.angleY=angle[1];this.angleZ=angle[2];if(viewpoint!==undefined){this.viewpointX=viewpoint[0];this.viewpointY=viewpoint[1];this.viewpointZ=viewpoint[2];}
this.onDraw();},onMouseMove:function(e){if(e.dragging){e.preventDefault();var rotating=false;if(e.altKey){ this.angleY+=e.deltaX*2;this.angleX+=e.deltaY*2;rotating=true;}else if(e.shiftKey||e.buttons===4){var factor=5e-3;this.viewpointX+=factor*e.deltaX*this.viewpointZ;this.viewpointY-=factor*e.deltaY*this.viewpointZ;}else if(e.ctrlKey){this.updateZoom(e.deltaY);}else{ this.angleZ+=e.deltaX*2;this.angleX+=e.deltaY*2;rotating=true;} 
if(this.orthomode&&rotating){this.setViewPerspective();}
this.onDraw();}}, onTouchMove:function(e){var fingerCount=e.touches.length; if(fingerCount!=2){this.oldFingerDist=-1;}
if(e.dragging){var b=fingerCount;e.preventDefault();var rotating=false;if(b==1){ this.angleY+=e.deltaX*2;this.angleX+=e.deltaY*2;rotating=true;}else if(b==2){ var p1=e.touches[0];var p2=e.touches[1];var fd=Math.abs(p2.pageX-p1.pageX)+Math.abs(p2.pageY-p1.pageY);if(this.oldFingerDist==-1){this.oldFingerDist=fd;}
var delta=this.oldFingerDist-fd;this.updateZoom(delta);}else if(b==3){ var factor=5e-3;this.viewpointX+=factor*e.deltaX*this.viewpointZ;this.viewpointY-=factor*e.deltaY*this.viewpointZ;}else if(b==4){ this.angleZ+=e.deltaX*2;this.angleX+=e.deltaY*2;rotating=true;} 
if(this.orthomode&&rotating){this.setViewPerspective();}
this.onDraw();}},onDraw:function(e){var bedx=this.bedWidth/2,bedy=this.bedDepth/2;var gl=this.gl;gl.makeCurrent();gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.loadIdentity();gl.translate(this.viewpointX,this.viewpointY,-this.viewpointZ);gl.rotate(this.angleX,1,0,0);gl.rotate(this.angleY,0,1,0);gl.rotate(this.angleZ,0,0,1);gl.enable(gl.POLYGON_OFFSET_FILL);for(var i=0;i<this.meshes.length;i++){var mesh=this.meshes[i];this.lightingShader.draw(mesh,gl.TRIANGLES);}
gl.disable(gl.POLYGON_OFFSET_FILL);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.begin(gl.LINES); gl.color(1,0.5,0.5,0.2); gl.vertex(-bedx,0,0);gl.vertex(0,0,0);gl.color(1,0,0,0.8); gl.vertex(0,0,0);gl.vertex(bedx,0,0); gl.color(0.5,1,0.5,0.2); gl.vertex(0,-bedy,0);gl.vertex(0,0,0);gl.color(0,1,0,0.8); gl.vertex(0,0,0);gl.vertex(0,bedy,0); gl.color(0.5,0.5,1,0.2); gl.vertex(0,0,-100);gl.vertex(0,0,0);gl.color(0,0,1,0.8); gl.vertex(0,0,0);gl.vertex(0,0,100); gl.color(0.1,0.1,0.1,0.8);gl.vertex(-bedx,-bedy,0);gl.vertex(-bedx,bedy,0);gl.vertex(-bedx,bedy,0);gl.vertex(bedx,bedy,0);gl.vertex(bedx,bedy,0);gl.vertex(bedx,-bedy,0);gl.vertex(bedx,-bedy,0);gl.vertex(-bedx,-bedy,0);gl.end();this.maptexture.bind(0);this.planeShader.uniforms({texture:0}).draw(this.bedmesh);this.maptexture.unbind(0);gl.disable(gl.BLEND);}};
OpenJsCad.Viewer.csgToMeshes=function(csg,defaultColor){csg=csg.canonicalized();var mesh=new GL.Mesh({normals:true,colors:true});var meshes=[mesh];var vertexTag2Index={};var vertices=[];var colors=[];var triangles=[];

 var smoothlighting=false;var polygons=csg.toPolygons();var numpolygons=polygons.length;for(var polygonindex=0;polygonindex<numpolygons;polygonindex++)
{var polygon=polygons[polygonindex];var color=defaultColor||[0,0,1];if(polygon.shared&&polygon.shared.color)
{color=polygon.shared.color;}
var indices=polygon.vertices.map(function(vertex){var vertextag=vertex.getTag();var vertexindex;if(smoothlighting&&(vertextag in vertexTag2Index))
{vertexindex=vertexTag2Index[vertextag];}
else
{vertexindex=vertices.length;vertexTag2Index[vertextag]=vertexindex;vertices.push([vertex.pos.x,vertex.pos.y,vertex.pos.z]);colors.push(color);}
return vertexindex;});for(var i=2;i<indices.length;i++){triangles.push([indices[0],indices[i-1],indices[i]]);}
if(vertices.length>65000){ mesh.triangles=triangles;mesh.vertices=vertices;mesh.colors=colors;mesh.computeWireframe();mesh.computeNormals(); mesh=new GL.Mesh({normals:true,colors:true});triangles=[];colors=[];vertices=[];meshes.push(mesh);}} 
mesh.triangles=triangles;mesh.vertices=vertices;mesh.colors=colors;mesh.computeWireframe();mesh.computeNormals();return meshes;};OpenJsCad.makeAbsoluteUrl=function(url,baseurl){if(!url.match(/^[a-z]+\:/i))
{var re=/^\/|\/$/g;if(baseurl[baseurl.length-1]!='/'){ baseurl=baseurl.replace(/[^\/]*$/,"");}
if(url[0]=='/'){var basecomps=baseurl.split('/');url=basecomps[0]+'//'+basecomps[2]+'/'+url.replace(re,"");}
else{url=(baseurl.replace(re,"")+'/'+url.replace(re,"")).replace(/[^\/]+\/\.\.\//g,"");}}
return url;};OpenJsCad.isChrome=function()
{return(navigator.userAgent.search("Chrome")>=0);};
OpenJsCad.runMainInWorker=function()
{try
{if(typeof(main)!='function')throw new Error('Your jscad file should contain a function main() which returns a CSG solid or a CAG area.');OpenJsCad.log.prevLogTime=Date.now();var result=main();result=OpenJsCad.expandResultObjectArray(result);OpenJsCad.checkResult(result);var result_compact=OpenJsCad.resultToCompactBinary(result);result=null; self.postMessage({cmd:'rendered',result:result_compact});}
catch(e)
{var errtxt=e.toString();if(e.stack)
{errtxt+='\nStack trace:\n'+e.stack;}
self.postMessage({cmd:'error',err:errtxt});}};OpenJsCad.expandResultObjectArray=function(result){if(result instanceof Array)
{result=result.map(function(resultelement){if((resultelement instanceof CSG)||(resultelement instanceof CAG))
{resultelement={data:resultelement};}
return resultelement;});}
return result;};OpenJsCad.checkResult=function(result){var ok=true;if(typeof(result)!="object")
{ok=false;}
else
{if(result instanceof Array)
{if(result.length<1)
{ok=false;}
else
{result.forEach(function(resultelement){if(!("data"in resultelement))
{ok=false;}
else
{if((resultelement.data instanceof CSG)||(resultelement.data instanceof CAG))
{}
else
{ok=false;}}});}}
else if((result instanceof CSG)||(result instanceof CAG))
{}
else
{ok=false;}}
if(!ok)
{throw new Error("Your main() function does not return valid data. It should return one of the following: a CSG object, a CAG object, an array of CSG/CAG objects, or an array of objects: [{name:, caption:, data:}, ...] where data contains a CSG or CAG object.");}};OpenJsCad.resultToCompactBinary=function(resultin){var resultout;if(resultin instanceof Array)
{resultout=resultin.map(function(resultelement){var r=resultelement;r.data=resultelement.data.toCompactBinary();return r;});}
else
{resultout=resultin.toCompactBinary();}
return resultout;};OpenJsCad.resultFromCompactBinary=function(resultin){function fromCompactBinary(r)
{var result;if(r.class=="CSG")
{result=CSG.fromCompactBinary(r);}
else if(r.class=="CAG")
{result=CAG.fromCompactBinary(r);}
else
{throw new Error("Cannot parse result");}
return result;}
var resultout;if(resultin instanceof Array)
{resultout=resultin.map(function(resultelement){var r=resultelement;r.data=fromCompactBinary(resultelement.data);return r;});}
else
{resultout=fromCompactBinary(resultin);}
return resultout;};OpenJsCad.parseJsCadScriptSync=function(script,debugging){var workerscript="";workerscript+=script;if(debugging)
{workerscript+="\n\n\n\n\n\n\n/* -------------------------------------------------------------------------\n";workerscript+="OpenJsCad debugging\n\nAssuming you are running Chrome:\nF10 steps over an instruction\nF11 steps into an instruction\n";workerscript+="F8  continues running\nPress the (||) button at the bottom to enable pausing whenever an error occurs\n";workerscript+="Click on a line number to set or clear a breakpoint\n";workerscript+="For more information see: http://code.google.com/chrome/devtools/docs/overview.html\n\n";workerscript+="------------------------------------------------------------------------- */\n";workerscript+="\n\n// Now press F11 twice to enter your main() function:\n\n";workerscript+="debugger;\n";}
workerscript+="return main();";var f=new Function(workerscript);OpenJsCad.log.prevLogTime=Date.now();var result=f();result=OpenJsCad.expandResultObjectArray(result);OpenJsCad.checkResult(result);return result;};OpenJsCad.parseJsCadScriptASync=function(script,options,callback){var baselibraries=["csg.js","openjscad.js"];var baseurl=document.location.href.replace(/\?.*$/,'');var openjscadurl=baseurl;if(typeof options.openJsCadPath!='undefined'){
 openjscadurl=OpenJsCad.makeAbsoluteUrl(options.openJsCadPath,baseurl)+'/';}
var libraries=[];if(typeof options.libraries!='undefined'){libraries=options.libraries;}
var workerscript="";workerscript+=script;workerscript+="\n\n\n\n//// The following code is added by OpenJsCad:\n";workerscript+="var _csg_baselibraries="+JSON.stringify(baselibraries)+";\n";workerscript+="var _csg_libraries="+JSON.stringify(libraries)+";\n";workerscript+="var _csg_baseurl="+JSON.stringify(baseurl)+";\n";workerscript+="var _csg_openjscadurl="+JSON.stringify(openjscadurl)+";\n";workerscript+="var _csg_makeAbsoluteURL="+OpenJsCad.makeAbsoluteUrl.toString()+";\n";workerscript+="_csg_baselibraries = _csg_baselibraries.map(function(l){return _csg_makeAbsoluteURL(l,_csg_openjscadurl);});\n";workerscript+="_csg_libraries = _csg_libraries.map(function(l){return _csg_makeAbsoluteURL(l,_csg_baseurl);});\n";workerscript+="_csg_baselibraries.map(function(l){importScripts(l)});\n";workerscript+="_csg_libraries.map(function(l){importScripts(l)});\n";workerscript+="self.addEventListener('message', function(e) {if(e.data && e.data.cmd == 'render'){";workerscript+="  OpenJsCad.runMainInWorker();";workerscript+="}},false);\n";var blobURL=OpenJsCad.textToBlobUrl(workerscript);if(!window.Worker)throw new Error("Your browser doesn't support Web Workers. Please try the Chrome browser instead.");var worker=new Worker(blobURL);worker.onmessage=function(e){if(e.data)
{if(e.data.cmd=='rendered')
{var resulttype=e.data.result.class;var result=OpenJsCad.resultFromCompactBinary(e.data.result);callback(null,result);}
else if(e.data.cmd=="error")
{callback(e.data.err,null);}
else if(e.data.cmd=="log")
{console.log(e.data.txt);}}};worker.onerror=function(e){var errtxt="Error in line "+e.lineno+": "+e.message;callback(errtxt,null);};worker.postMessage({cmd:"render"});return worker;};OpenJsCad.getWindowURL=function(){if(window.URL)return window.URL;else if(window.webkitURL)return window.webkitURL;else throw new Error("Your browser doesn't support window.URL");};OpenJsCad.textToBlobUrl=function(txt){var windowURL=OpenJsCad.getWindowURL();var blob=new Blob([txt]);var blobURL=windowURL.createObjectURL(blob);if(!blobURL)throw new Error("createObjectURL() failed");return blobURL;};OpenJsCad.revokeBlobUrl=function(url){if(window.URL)window.URL.revokeObjectURL(url);else if(window.webkitURL)window.webkitURL.revokeObjectURL(url);else throw new Error("Your browser doesn't support window.URL");};OpenJsCad.FileSystemApiErrorHandler=function(fileError,operation){var errtxt="FileSystem API error: "+operation+" returned error "+fileError.name+" ("+fileError.message+")";throw new Error(errtxt);};OpenJsCad.AlertUserOfUncaughtExceptions=function(){window.onerror=function(message,url,line){message=message.replace(/^Uncaught /i,"");alert(message+"\n\n("+url+" line "+line+")");};};OpenJsCad.Processor=function(containerdiv,options,onchange){this.containerdiv=containerdiv;this.onchange=onchange;this.viewerdiv=null;this.viewer=null;this.zoomControl=null;this.options=options||{};this.viewerwidth=this.options.viewerwidth||"800px";this.viewerheight=this.options.viewerheight||"600px";this.initialViewerDistance=200;this.processing=false;this.currentObject=null;this.hasValidCurrentObject=false;this.hasOutputFile=false;this.worker=null;this.script=null;this.hasError=false;this.debugging=false;this.createElements();};OpenJsCad.Processor.convertToSolid=function(obj){if((typeof(obj)=="object")&&((obj instanceof CAG)))
{obj=obj.extrude({offset:[0,0,0.1]});}
else if((typeof(obj)=="object")&&((obj instanceof CSG)))
{}
else
{throw new Error("Cannot convert to solid");}
return obj;};OpenJsCad.Processor.prototype={createElements:function(){var that=this; while(this.containerdiv.children.length>0)
{this.containerdiv.removeChild(this.containerdiv.children[0]);}
var viewbuttons=document.createElement("div");viewbuttons.className="viewbuttonsdiv";viewbuttons.style.width=this.viewerwidth;this.addViewButton("Reset view",'reset',viewbuttons,function(e){that.viewer.setViewPerspective();that.viewer.resetView();});this.addViewButton("Front (-Y)",'front',viewbuttons,function(e){that.viewer.setViewOrthographic();that.viewer.setView([-90,0,0],[0,0,that.viewer.viewpointZ]);});this.addViewButton("Rear (+Y)",'rear',viewbuttons,function(e){that.viewer.setViewOrthographic();that.viewer.setView([-90,0,180],[0,0,that.viewer.viewpointZ]);});this.addViewButton("Right (+X)",'right',viewbuttons,function(e){that.viewer.setViewOrthographic();that.viewer.setView([-90,0,-90],[0,0,that.viewer.viewpointZ]);});this.addViewButton("Left (-X)",'left',viewbuttons,function(e){that.viewer.setViewOrthographic();that.viewer.setView([-90,0,90],[0,0,that.viewer.viewpointZ]);});this.addViewButton("Top (+Z)",'top',viewbuttons,function(e){that.viewer.setViewOrthographic();that.viewer.setView([0,0,0],[0,0,that.viewer.viewpointZ]);});var viewerdiv=document.createElement("div");this.viewerdiv=viewerdiv; var wArr=this.viewerwidth.match(/^(\d+(?:\.\d+)?)(.*)$/);var hArr=this.viewerheight.match(/^(\d+(?:\.\d+)?)(.*)$/);var canvasW=wArr[2]=='px'?wArr[1]:'800';var canvasH=hArr[2]=='px'?hArr[1]:'600';try{this.viewer=new OpenJsCad.Viewer(this.viewerdiv,canvasW,canvasH,this.initialViewerDistance,this.viewerwidth,this.viewerheight,this.options);this.viewerdiv.className="viewer";this.viewerdiv.style.width=this.viewerwidth;this.viewerdiv.style.height=this.viewerheight;this.containerdiv.appendChild(viewbuttons);this.containerdiv.appendChild(viewerdiv);var usagehelp=document.createElement("p");usagehelp.className="info";usagehelp.innerHTML="Click and drag to rotate. Hold <em>Alt</em> to switch rotation axes. Hold <em>Shift</em> or middle mouse button to pan. Hold <em>Control</em> or scroll to zoom.";this.containerdiv.appendChild(usagehelp);}catch(e){this.viewer=null;this.viewerdiv.innerHTML="<p>Preview disabled ("+e.toString()+").</p>";this.viewerdiv.className="error";this.containerdiv.appendChild(viewerdiv);}
this.errordiv=document.createElement("div");this.errorpre=document.createElement("pre");this.errordiv.appendChild(this.errorpre);this.statusdiv=document.createElement("div");this.statusdiv.className="statusdiv";this.statusdiv.style.width=this.viewerwidth;this.statusspan=document.createElement("span");this.statusspan.id="statusspan";this.statusbuttons=document.createElement("div");this.statusbuttons.style.cssFloat="right";this.statusdiv.appendChild(this.statusspan);this.statusdiv.appendChild(this.statusbuttons);this.abortbutton=document.createElement("button");this.abortbutton.innerHTML="Abort";this.abortbutton.onclick=function(e){that.abort();};this.statusbuttons.appendChild(this.abortbutton);this.basemapButton=document.createElement("button");this.basemapButton.innerHTML="Download PDF";this.basemapButton.id="pdfmaplink";this.statusbuttons.appendChild(this.basemapButton);this.renderedElementDropdown=document.createElement("select");this.renderedElementDropdown.onchange=function(e){that.setSelectedObjectIndex(that.renderedElementDropdown.selectedIndex);};this.renderedElementDropdown.style.display="none";this.statusbuttons.appendChild(this.renderedElementDropdown);this.formatDropdown=document.createElement("select");this.formatDropdown.onchange=function(e){that.currentFormat=that.formatDropdown.options[that.formatDropdown.selectedIndex].value;that.updateDownloadLink();};this.statusbuttons.appendChild(this.formatDropdown);this.generateOutputFileButton=document.createElement("button");this.generateOutputFileButton.onclick=function(e){that.generateOutputFile();};this.statusbuttons.appendChild(this.generateOutputFileButton);this.downloadOutputFileLink=document.createElement("a");this.statusbuttons.appendChild(this.downloadOutputFileLink);this.enableItems();this.containerdiv.appendChild(this.statusdiv);this.containerdiv.appendChild(this.errordiv);this.clearViewer();},addViewButton:function(title,icon,div,callback){var button=document.createElement("img");var srcOff='img/'+icon+'-inactive.png';var srcOn='img/'+icon+'-active.png';button.src=srcOff;button.onmouseover=function(){this.src=srcOn;};button.onmouseout=function(){this.src=srcOff;};button.onclick=callback;button.title=title;button.className="viewbutton";div.appendChild(button);},getFilenameForRenderedObject:function(){var filename=this.filename;if(!filename)filename="openjscad";var index=this.renderedElementDropdown.selectedIndex;if(index>=0)
{var renderedelement=this.currentObjects[index];if('name'in renderedelement)
{filename=renderedelement.name;}
else
{filename+="_"+(index+1);}}
return filename;},setRenderedObjects:function(obj){if(obj===null)
{obj=[];}
else
{if(!(obj instanceof Array))
{obj=[{data:obj,},];}}
this.currentObjects=obj;while(this.renderedElementDropdown.options.length>0)this.renderedElementDropdown.options.remove(0);for(var i=0;i<obj.length;++i)
{var renderedelement=obj[i];var caption;if('caption'in renderedelement)
{caption=renderedelement.caption;}
else if('name'in renderedelement)
{caption=renderedelement.name;}
else
{caption="Element #"+(i+1);}
var option=document.createElement("option");option.appendChild(document.createTextNode(caption));this.renderedElementDropdown.options.add(option);}
this.renderedElementDropdown.style.display=(obj.length>=2)?"inline":"none";this.setSelectedObjectIndex((obj.length>0)?0:-1);},setSelectedObjectIndex:function(index){this.clearOutputFile();this.renderedElementDropdown.selectedIndex=index;var obj;if(index<0)
{obj=new CSG();}
else
{obj=this.currentObjects[index].data;}
this.currentObjectIndex=index;this.currentObject=obj;if(this.viewer)
{var csg=OpenJsCad.Processor.convertToSolid(obj);this.viewer.setCsg(csg);}
this.hasValidCurrentObject=true;while(this.formatDropdown.options.length>0)
this.formatDropdown.options.remove(0);var that=this;this.supportedFormatsForCurrentObject().forEach(function(format){var option=document.createElement("option");option.setAttribute("value",format);option.appendChild(document.createTextNode(that.formatInfo(format).displayName));that.formatDropdown.options.add(option);});this.updateDownloadLink();},selectedFormat:function(){return this.formatDropdown.options[this.formatDropdown.selectedIndex].value;},selectedFormatInfo:function(){return this.formatInfo(this.selectedFormat());},updateDownloadLink:function(){var ext=this.selectedFormatInfo().extension;this.generateOutputFileButton.innerHTML="Generate "+ext.toUpperCase();},clearViewer:function(){this.clearOutputFile();this.setRenderedObjects(null);this.hasValidCurrentObject=false;this.enableItems();},abort:function(){if(this.processing)
{ this.processing=false;this.statusspan.innerHTML="Aborted.";this.worker.terminate();this.enableItems();if(this.onchange)this.onchange();}},enableItems:function(){this.abortbutton.style.display=this.processing?"inline":"none";this.formatDropdown.style.display='none';this.generateOutputFileButton.style.display=((!this.hasOutputFile)&&(this.hasValidCurrentObject))?"inline":"none";this.downloadOutputFileLink.style.display=this.hasOutputFile?"inline":"none";this.errordiv.style.display=this.hasError?"block":"none";this.statusdiv.style.display=this.hasError?"none":"block";this.basemapButton.style.display=(this.viewer&&this.viewer.basemapurl!=="")?"inline":"none";},setOpenJsCadPath:function(path){this.options.openJsCadPath=path;},addLibrary:function(lib){if(typeof this.options.libraries=='undefined'){this.options.libraries=[];}
this.options.libraries.push(lib);},setError:function(txt){this.hasError=(txt!=="");this.errorpre.textContent=txt;this.enableItems();},setDebugging:function(debugging){this.debugging=debugging;},
 setJsCad:function(script,filename){if(!filename)filename="openjscad.jscad";filename=filename.replace(/\.jscad$/i,"");this.abort();this.clearViewer();this.script=null;this.setError("");var scripthaserrors=false;try{var f=new Function(script);f();}catch(e){this.setError(e.toString());this.statusspan.innerHTML="Error.";scripthaserrors=true;}
if(!scripthaserrors)
{this.script=script;this.filename=filename;this.rebuildSolid();}
else
{this.enableItems();if(this.onchange)this.onchange();}},rebuildSolid:function()
{this.abort();this.setError("");this.clearViewer();this.processing=true;this.statusspan.innerHTML="Processing, please wait...";this.enableItems();var that=this;var useSync=this.debugging;var options={};var readyMessage='Ready.';if(!useSync)
{this.worker=OpenJsCad.parseJsCadScriptASync(this.script,this.options,function(err,obj){that.processing=false;that.worker=null;if(err)
{that.setError(err);that.statusspan.innerHTML="Error.";}
else
{that.setRenderedObjects(obj);that.statusspan.innerHTML=readyMessage;}
that.enableItems();if(that.onchange)that.onchange();});}
else
{try
{var obj=OpenJsCad.parseJsCadScriptSync(this.script,this.debugging);that.setRenderedObjects(obj);that.processing=false;that.statusspan.innerHTML=readyMessage;}
catch(e)
{that.processing=false;var errtxt=e.toString();if(e.stack)
{errtxt+='\nStack trace:\n'+e.stack;}
that.setError(errtxt);that.statusspan.innerHTML="Error.";}
that.enableItems();if(that.onchange)that.onchange();}},hasSolid:function(){return this.hasValidCurrentObject;},isProcessing:function(){return this.processing;},clearOutputFile:function(){if(this.hasOutputFile)
{this.hasOutputFile=false;if(this.outputFileDirEntry)
{this.outputFileDirEntry.removeRecursively(function(){});this.outputFileDirEntry=null;}
if(this.outputFileBlobUrl)
{OpenJsCad.revokeBlobUrl(this.outputFileBlobUrl);this.outputFileBlobUrl=null;}
this.enableItems();if(this.onchange)this.onchange();}},generateOutputFile:function(){this.clearOutputFile();if(this.hasValidCurrentObject)
{try
{this.generateOutputFileFileSystem();}
catch(e)
{this.generateOutputFileBlobUrl();}}},currentObjectToBlob:function(){var format=this.selectedFormat();var blob;if(format=="stl")
{blob=this.currentObject.fixTJunctions().toStlBinary();}
else if(format=="x3d"){blob=this.currentObject.fixTJunctions().toX3D();}
else if(format=="dxf")
{blob=this.currentObject.toDxf();}
else
{throw new Error("Not supported");}
return blob;},supportedFormatsForCurrentObject:function(){if(this.currentObject instanceof CSG){return["stl"]; }else if(this.currentObject instanceof CAG){return["dxf"];}else{throw new Error("Not supported");}},formatInfo:function(format){return{stl:{displayName:"STL",extension:"stl",mimetype:"application/sla",},x3d:{displayName:"X3D",extension:"x3d",mimetype:"model/x3d+xml",},dxf:{displayName:"DXF",extension:"dxf",mimetype:"application/dxf",}}[format];},downloadLinkTextForCurrentObject:function(){var ext=this.selectedFormatInfo().extension;return"Download "+this.getFilenameForRenderedObject()+"."+ext;},generateOutputFileBlobUrl:function(){var blob=this.currentObjectToBlob();var windowURL=OpenJsCad.getWindowURL();this.outputFileBlobUrl=windowURL.createObjectURL(blob);if(!this.outputFileBlobUrl)throw new Error("createObjectURL() failed");this.hasOutputFile=true;this.downloadOutputFileLink.href=this.outputFileBlobUrl;this.downloadOutputFileLink.innerHTML=this.downloadLinkTextForCurrentObject();var ext=this.selectedFormatInfo().extension;this.downloadOutputFileLink.setAttribute("download",this.getFilenameForRenderedObject()+"."+ext);this.enableItems();if(this.onchange)this.onchange();},generateOutputFileFileSystem:function(){window.requestFileSystem=window.requestFileSystem||window.webkitRequestFileSystem;if(!window.requestFileSystem)
{throw new Error("Your browser does not support the HTML5 FileSystem API. Please try the Chrome browser instead.");}
var dirname="OpenJsCadOutput1_"+parseInt(Math.random()*1000000000,10)+"."+extension;var extension=this.selectedFormatInfo().extension;var filename=this.getFilenameForRenderedObject()+"."+extension;var that=this;window.requestFileSystem(TEMPORARY,20*1024*1024,function(fs){fs.root.getDirectory(dirname,{create:true,exclusive:true},function(dirEntry){that.outputFileDirEntry=dirEntry;dirEntry.getFile(filename,{create:true,exclusive:true},function(fileEntry){fileEntry.createWriter(function(fileWriter){fileWriter.onwriteend=function(e){that.hasOutputFile=true;that.downloadOutputFileLink.href=fileEntry.toURL();that.downloadOutputFileLink.type=that.selectedFormatInfo().mimetype;that.downloadOutputFileLink.innerHTML=that.downloadLinkTextForCurrentObject();that.downloadOutputFileLink.setAttribute("download",fileEntry.name);that.enableItems();if(that.onchange)that.onchange();};fileWriter.onerror=function(e){throw new Error('Write failed: '+e.toString());};var blob=that.currentObjectToBlob();fileWriter.write(blob);},function(fileerror){OpenJsCad.FileSystemApiErrorHandler(fileerror,"createWriter");});},function(fileerror){OpenJsCad.FileSystemApiErrorHandler(fileerror,"getFile('"+filename+"')");});},function(fileerror){OpenJsCad.FileSystemApiErrorHandler(fileerror,"getDirectory('"+dirname+"')");});},function(fileerror){OpenJsCad.FileSystemApiErrorHandler(fileerror,"requestFileSystem");});}};
