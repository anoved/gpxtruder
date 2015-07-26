var OJSCAD=null;var setup=function(){ Messages.msgdiv=document.getElementById('messages');OJSCAD=new OpenJsCad.Processor(document.getElementById('display'),{color:[0,0.6,0.1],openJsCadPath:"js/",viewerwidth:"800px",viewerheight:"400px",bgColor:[0.553,0.686,0.8,1]});
document.forms[0].addEventListener('submit',function(e){e.preventDefault();submitInput();return false;},false);};var submitInput=function(){var radioValue=function(radios){for(var i=0,len=radios.length;i<len;i++){if(radios[i].checked){return parseInt(radios[i].value);}}
return undefined;};var markerInterval=function(markerType,markerSpan){if(markerType===0){ return 0;}else if(markerType===1){ return 1000;}else if(markerType===2){ return 1609;}
return markerSpan;}; var validOptions=function(options){if(!isFinite(options.vertical)||options.vertical<1){Messages.error("Vertical exaggeration must be greater than or equal to 1.");return false;}
if(!isFinite(options.smoothspan)||options.smoothspan<0){Messages.error("Minimum smoothing interval must be greater than or equal to 0.");return false;}
if(!isFinite(options.markerInterval)||options.markerInterval<0){Messages.error("Marker interval must be greater than or equal to 1.");return false;}
if(!isFinite(options.bedx)||options.bedx<20){Messages.error("Bed width must be greater than or equal to 20.");return false;}
if(!isFinite(options.bedy)||options.bedy<20){Messages.error("Bed height must be greater than or equal to 20.");return false;}
if(!isFinite(options.buffer)||options.buffer<0.5){Messages.error("Path width must be greater than or equal to 1.");return false;}
if(!isFinite(options.zconstant)||options.zconstant<=0){Messages.error("Default elevation must be greater than 0.");return false;}
if(!isFinite(options.base)||options.base<0){Messages.error("Base height must be greater than or equal to 0.");return false;}
if(options.regionfit&&(!isFinite(options.region_minx)||!isFinite(options.region_maxx)||!isFinite(options.region_miny)||!isFinite(options.region_maxy))){Messages.error("Invalid region extents.");return false;}
 
if(options.projtype===1&&options.projection===""){Messages.error("Undefined map projection.");return false;}
return true;};var form=document.forms[0];var options={buffer:parseFloat(form.path_width.value)/2.0,vertical:parseFloat(form.vertical.value),bedx:parseFloat(form.width.value),bedy:parseFloat(form.depth.value),base:parseFloat(form.base.value),zcut:form.zoverride.checked?false:form.zcut.checked,zoverride:form.zoverride.checked,zconstant:parseFloat(form.zconstant.value),regionfit:form.regionfit.checked,region_minx:parseFloat(form.east_min.value),region_maxx:parseFloat(form.east_max.value),region_miny:parseFloat(form.north_min.value),region_maxy:parseFloat(form.north_max.value),shapetype:radioValue(form.shape),projtype:radioValue(form.proj_type),projection:form.projection.value,markerInterval:markerInterval(radioValue(form.marker),parseFloat(form.marker_interval.value)),smoothtype:radioValue(form.smooth),smoothspan:parseFloat(form.mindist.value),jscadDiv:document.getElementById('code_jscad'),oscadDiv:document.getElementById('code_openscad')};if(!validOptions(options)){return;}
var upload_url=null;if(radioValue(form.gpxsource)===0){
 var files=document.getElementById('gpxfile').files;if(files.length===0){Messages.error('No GPX file selected.');return;}
upload_url=window.URL.createObjectURL(files[0]);}else{if(parseInt(form.gpxsample.value)===0){upload_url="gpx/SouthMtn.gpx";}else if(parseInt(form.gpxsample.value)===1){upload_url="gpx/VXX.gpx";}else{return;}}
loader(options,upload_url);if(radioValue(form.gpxsource)===0){window.URL.revokeObjectURL(upload_url);}};var loader=function(options,gpx_url){Messages.clear();var req=new XMLHttpRequest();req.onreadystatechange=function(){if(req.readyState===4 ){if(!req.responseXML){Messages.error("This doesn't appear to be a GPX file.");return;}
var pts=Parser.file(req.responseXML,options.zoverride,options.zconstant);if(pts===null){return;}
g=new Gpex(options,pts);}}; req.open('GET',gpx_url,true);req.overrideMimeType("text/xml");req.send();};function Gpex(options,pts){ this.options=options;this.basemap=new Basemap(OJSCAD.viewer); this.bed={x:this.options.bedx-(2*this.options.buffer),y:this.options.bedy-(2*this.options.buffer)};this.ll=[];
this.d=[];this.distance=0; this.ringRadius=0;this.smooth_total=0;this.projected_points=[];this.output_points=[];this.markers=[];try{this.Display(this.Extrude(pts));}catch(e){Messages.error(e.message);}}
Gpex.prototype.Extrude=function(pts){ this.ScanPoints(pts); this.ProjectPoints(); var that=this;
var zscale=this.scale;if(this.options.projtype===1){zscale=this.bed.y/distVincenty(this.bounds.miny,this.bounds.minx,this.bounds.maxy,this.bounds.minx);}
var fit=function(v){return[that.scale*(v[0]-that.offset[0]),that.scale*(v[1]-that.offset[1]),zscale*(v[2]-that.offset[2])*that.options.vertical+that.options.base];}; this.output_points=this.projected_points.map(fit,this);

this.markers=this.markers.map(function(m){return{location:fit(m.location),orientation:m.orientation};},this); return this.process_path();};Gpex.prototype.Display=function(code){ if(!this.options.regionfit){document.forms[0].east_min.value=Math.round(this.bounds.minx);document.forms[0].east_max.value=Math.round(this.bounds.maxx);document.forms[0].north_min.value=Math.round(this.bounds.miny);document.forms[0].north_max.value=Math.round(this.bounds.maxy);}
 
var xextent=this.bounds.maxx-this.bounds.minx;var xscale=Math.round(xextent*1000/this.options.bedx);console.log("1:"+xscale);if(OJSCAD.viewer){OJSCAD.viewer.setBedSize(this.options.bedx,this.options.bedy);}
if(!(this.options.shapetype===0&&this.options.projection==="GOOGLE"&&this.basemap.Update(this.bounds,{x:this.options.bedx,y:this.options.bedy}))){this.basemap.Clear();}
OJSCAD.setJsCad(code.jscad(true)); this.options.jscadDiv.innerHTML=code.jscad(false);this.options.oscadDiv.innerHTML=code.oscad(); document.getElementById('output').scrollIntoView();};
Gpex.prototype.ScanPoints=function(pts){var that=this;var distFilter=function(points,mindist){var pts=[];var dst=[];var total=0;pts.push(points[0]);for(var cur=1,pre=0;cur<points.length;cur++){var dist=distVincenty(points[cur][1],points[cur][0],pts[pre][1],pts[pre][0]);if(mindist===0||dist>=mindist){pts.push(points[cur]);dst.push(dist);total+=dist;pre+=1;}}
that.ll=pts;that.d=dst;that.smooth_total=total;



};var lastpt=pts[0],min_lon=lastpt[0],max_lon=lastpt[0],min_lat=lastpt[1],max_lat=lastpt[1],rawpoints=[lastpt],rawpointcd=[],totaldist=0;var cd=0,md=0,lastmd=0;var marker_objs=[];for(var i=1;i<pts.length;i++){var rawpt=pts[i];if(rawpt[0]<min_lon){min_lon=rawpt[0];}
if(rawpt[0]>max_lon){max_lon=rawpt[0];}
if(rawpt[1]<min_lat){min_lat=rawpt[1];}
if(rawpt[1]>max_lat){max_lat=rawpt[1];}
rawpoints.push(rawpt);var segdist=distVincenty(lastpt[1],lastpt[0],rawpt[1],rawpt[0]);totaldist+=segdist;lastpt=rawpt; lastmd=md; md+=segdist;cd+=segdist; rawpointcd.push(cd);if(this.options.markerInterval>0&&md>=this.options.markerInterval){ var last_seg=this.options.markerInterval-lastmd; var next_seg=segdist-last_seg; var pd=last_seg/segdist;var markerpoint=[lastpt[0]+pd*(rawpt[0]-lastpt[0]),lastpt[1]+pd*(rawpt[1]-lastpt[1]),lastpt[2]+pd*(rawpt[2]-lastpt[2])]; marker_objs.push({loc:markerpoint,pos:cd-next_seg,seg:i});




md=next_seg;}}
this.distance=totaldist;
this.ringRadius=this.distance/(Math.PI*2);if(this.options.projtype===2){var lat=(min_lat+max_lat)/2;var lon=(min_lon+max_lon)/2;this.options.projection=UTM.proj(lat,lon);}else if(this.options.projtype===0){ this.options.projection="GOOGLE";}
try{console.log(this.options.projection);PointProjector.init(this.options.projection);}catch(e){throw new Error("Unrecognized map projection.");}
for(i=0;i<marker_objs.length;i++){var marker_angle=vector_angle(this.ProjectPoint(rawpoints[marker_objs[i].seg-1],(rawpointcd[marker_objs[i].seg-1])/this.distance),this.ProjectPoint(rawpoints[marker_objs[i].seg],(rawpointcd[marker_objs[i].seg])/this.distance));this.markers.push({location:this.ProjectPoint(marker_objs[i].loc,marker_objs[i].pos/this.distance),orientation:marker_angle});}
var smoothing_distance=this.options.smoothspan;

if(this.options.smoothtype===0){var scale=null;if(this.options.shapetype===0){ var min_geo=proj4('GOOGLE',[min_lon,min_lat]);var max_geo=proj4('GOOGLE',[max_lon,max_lat]);var geo_x=max_geo[0]-min_geo[0];var geo_y=max_geo[1]-min_geo[1];scale=Scale(this.bed,geo_x,geo_y);}
else if(this.options.shapetype===1){ scale=Scale(this.bed,this.distance,0);}
else if(this.options.shapetype===2){ scale=Scale(this.bed,2*this.ringRadius,2*this.ringRadius);}
smoothing_distance=Math.floor(this.options.buffer/scale);} 
distFilter(rawpoints,smoothing_distance);};Gpex.prototype.ProjectPoints=function(){ var cd=0;var xyz=this.ProjectPoint(this.ll[0],0);this.bounds=new Bounds(xyz);this.projected_points.push(xyz);for(var i=1;i<this.ll.length;i++){cd+=this.d[i-1];xyz=this.ProjectPoint(this.ll[i],cd/this.smooth_total);this.bounds.Update(xyz);this.projected_points.push(xyz);}
if(this.options.regionfit){this.bounds.maxx=this.options.region_maxx;this.bounds.minx=this.options.region_minx;this.bounds.maxy=this.options.region_maxy;this.bounds.miny=this.options.region_miny;}
this.offset=Offsets(this.bounds,this.options.zcut);this.scale=ScaleBounds(this.bounds,this.bed);};Gpex.prototype.process_path=function(){var acuteAngle=function(angle){if((Math.abs(angle)>Math.PI/2)&&(Math.abs(angle)<(3*Math.PI)/2)){return true;}
return false;};var that=this;var segmentAngle=function(i){ if(i+1==that.output_points.length){return segmentAngle(i-1);} 
return vector_angle(that.output_points[i],that.output_points[i+1]);};var jointPoints=function(i,rel,avga){ var jointr=that.options.buffer/Math.cos(rel/2);


if(Math.abs(jointr)>that.options.buffer*2){jointr=Math.sign(jointr)*that.options.buffer*2;}
var lx=that.output_points[i][0]+jointr*Math.cos(avga+Math.PI/2),ly=that.output_points[i][1]+jointr*Math.sin(avga+Math.PI/2),rx=that.output_points[i][0]+jointr*Math.cos(avga-Math.PI/2),ry=that.output_points[i][1]+jointr*Math.sin(avga-Math.PI/2);return[[lx,ly],[rx,ry]];};var last_angle,angle,rel_angle,joint_angle,path_pts,vertices=[],faces=[];
 for(var i=0,s=0;i<this.output_points.length;i++){angle=segmentAngle(i);if(i===0){last_angle=angle;}
rel_angle=angle-last_angle;joint_angle=rel_angle/2+last_angle;if(acuteAngle(rel_angle)&&(i<this.output_points.length-1)&&acuteAngle(segmentAngle(i+1)-angle)){
 continue;}
path_pts=jointPoints(i,rel_angle,joint_angle); PathSegment.points(vertices,path_pts,this.output_points[i][2]);
 PathSegment.faces(faces,s);s=s+1;last_angle=angle;} 
PathSegment.last_face(faces,s); return new Code(vertices,faces,this.markers,{markerWidth:2*this.options.buffer+2});};var Bounds=function(xyz){if(typeof(xyz)==="undefined"){this.minx=this.maxx=0;this.miny=this.maxy=0;this.minz=this.maxz=0;}else{this.minx=this.maxx=xyz[0];this.miny=this.maxy=xyz[1];this.minz=this.maxz=xyz[2];}};Bounds.prototype.Update=function(xyz){if(xyz[0]<this.minx){this.minx=xyz[0];}
if(xyz[0]>this.maxx){this.maxx=xyz[0];}
if(xyz[1]<this.miny){this.miny=xyz[1];}
if(xyz[1]>this.maxy){this.maxy=xyz[1];}
if(xyz[2]<this.minz){this.minz=xyz[2];}
if(xyz[2]>this.maxz){this.maxz=xyz[2];}};Bounds.prototype.Center=function(){return[(this.minx+this.maxx)/2,(this.miny+this.maxy)/2];};
var Offsets=function(bounds,zcut){ var xy=bounds.Center();
 var zoffset=0;if(zcut===true||bounds.minz<=0){zoffset=Math.floor(bounds.minz-1);}
return[xy[0],xy[1],zoffset];};var Scale=function(bed,xextent,yextent){var xscale=bed.x/xextent,yscale=bed.y/yextent;return Math.min(xscale,yscale);};var ScaleBounds=function(bounds,bed){return Scale(bed,(bounds.maxx-bounds.minx),(bounds.maxy-bounds.miny));};var Basemap=function(view){this.view=view;};Basemap.prototype.ZoomLevel=function(ne,sw,mapDim){ var WORLD_DIM={height:256,width:256};function latRad(lat){var sin=Math.sin(lat*Math.PI/180);var radX2=Math.log((1+sin)/(1-sin))/2;return Math.max(Math.min(radX2,Math.PI),-Math.PI)/2;}
function zoom(mapPx,worldPx,fraction){return(Math.log(mapPx/worldPx/fraction)/Math.LN2);}
var latFraction=(latRad(ne[1])-latRad(sw[1]))/Math.PI;var lngDiff=ne[0]-sw[0];var lngFraction=((lngDiff<0)?(lngDiff+360):lngDiff)/360;var latZoom=zoom(mapDim.height,WORLD_DIM.height,latFraction);var lngZoom=zoom(mapDim.width,WORLD_DIM.width,lngFraction);return{zoom:latZoom<lngZoom?Math.floor(latZoom):Math.floor(lngZoom),span:latZoom<lngZoom?latFraction:lngFraction,axis:latZoom<lngZoom?"height":"width"};};Basemap.prototype.Update=function(bounds,bed){var bedmax=Math.max(bed.x,bed.y);var mapsize={width:Math.round(640*bed.x/bedmax),height:Math.round(640*bed.y/bedmax)};var sw=proj4("GOOGLE","WGS84",[bounds.minx,bounds.miny]);var ne=proj4("GOOGLE","WGS84",[bounds.maxx,bounds.maxy]);var zoominfo=this.ZoomLevel(ne,sw,mapsize); if(zoominfo.zoom>21){return false;}
var mapscale=mapsize[zoominfo.axis]/256/Math.exp(zoominfo.zoom*Math.LN2)/zoominfo.span;var center=proj4("GOOGLE","WGS84",bounds.Center());var mapurl="https://maps.googleapis.com/maps/api/staticmap?center="+
center[1].toFixed(6)+","+center[0].toFixed(6)+"&zoom="+zoominfo.zoom+"&size="+mapsize.width+"x"+mapsize.height+"&maptype=terrain&scale=2&format=jpg&key=AIzaSyBMTdBdNXMyAWYU8Sn4dt4WYtsf5lqvldA";if(this.view!==null){this.view.setBaseMap(mapurl,mapscale,bed.x,bed.y,this.Download);}
return true;};Basemap.prototype.Clear=function(){if(this.view!==null){this.view.clearBaseMap();}};Basemap.prototype.Download=function(img,scale,w,h){ var canvas=document.createElement("canvas");canvas.width=img.width;canvas.height=img.height; var context=canvas.getContext("2d");context.drawImage(img,0,0);var mapw=scale*w;var maph=scale*h;var pdfdoc=new jsPDF({orientation:mapw>maph?'l':'p',format:[mapw,maph]});var imgDataURL=canvas.toDataURL("image/jpeg");pdfdoc.addImage(imgDataURL,'JPEG',0,0,mapw,maph); pdfdoc.setDrawColor(26,26,26);pdfdoc.rect(mapw/2-w/2,maph/2-h/2,w,h);pdfdoc.save('basemap.pdf');};
Gpex.prototype.ProjectPoint=function(point,cdr){var xyz;if(this.options.shapetype==1){xyz=PointProjector.linear(point,cdr,this.distance);}else if(this.options.shapetype==2){xyz=PointProjector.ring(point,cdr,this.ringRadius);}else{xyz=PointProjector.project(point);}
return xyz;};var vector_angle=function(a,b){var dx=b[0]-a[0],dy=b[1]-a[1];return Math.atan2(dy,dx);};var Code=function(points,faces,markers,options){ this.points=points.map(function(v){return"["+v[0].toFixed(4)+", "+v[1].toFixed(4)+", "+v[2].toFixed(4)+"]";}).join(",\n"); this.faces=faces.map(function(v){return"["+v[0]+", "+v[1]+", "+v[2]+"]";}).join(",\n");this.markers=markers.map(function(marker){return"marker(["+marker.location[0]+", "+marker.location[1]+"], "+(marker.orientation*180/Math.PI)+", "+marker.location[2]+")";});this.options=options;};Code.prototype.jscad=function(preview){var models=["{name: 'profile', caption: 'Profile', data: profile()}"];
var result="function profile() {\nreturn ";if(preview){result+="CSG.polyhedron({points:[\n"+this.points+"\n],\nfaces:[\n"+this.faces+"\n]})";}else{result+="polyhedron({points:[\n"+this.points+"\n],\ntriangles:[\n"+this.faces+"\n]})";}
result+=";\n}\n\n";
if(this.markers.length>0){var m=this.markers[0]+this.markers.slice(1).map(function(s){return".union("+s+")";}).join("");if(preview){result+="function marker(position, orientation, height) {\nvar z = height + 2;\n"+"return CSG.cube({radius: [1, "+this.options.markerWidth+", z/2], center: [0, 0, 0]})"+".rotateZ(orientation).translate([position[0], position[1], z/2]);\n}\n";}else{result+="function marker(position, orientation, height) {\nvar z = height + 2;\n"+"return cube({size: [1, "+this.options.markerWidth+", z], center: true})"+".rotateZ(orientation).translate([position[0], position[1], z/2]);\n}\n";}
result+="function markers() {\nreturn "+m+";\n}\n\n";models.push("{name: 'markers', caption: 'Markers', data: markers()}");}
if(preview){result+="function main() {\nreturn ["+models.join(',')+"];\n}\n";}else{result+="function main() {\nreturn profile()"+(this.markers.length>0?".union(markers())":"")+";\n}\n";}
return result;};Code.prototype.oscad=function(){var result="module profile() {\npolyhedron(points=[\n"+this.points+"\n],\nfaces=[\n"+this.faces+"\n]);\n}\n\n";if(this.markers.length>0){result+="module marker(position, orientation, height) {\n"+"	assign(z=height+2) {\n"+"	translate([position[0], position[1], z/2])\n"+"	rotate([0, 0, orientation])\n"+"	cube(size=[1, "+this.options.markerWidth+", z], center=true);\n}}\n\n";result+="module markers() {\n\tunion() {\n\t\t"+this.markers.join(";\n\t\t")+";\n\t}\n}\n\n";result+="markers();\n";}
result+="profile();\n";return result;};var PathSegment={ points:function(a,v,z){ a.push([v[0][0],v[0][1],0]); a.push([v[1][0],v[1][1],0]); a.push([v[0][0],v[0][1],z]); a.push([v[1][0],v[1][1],z]);}, first_face:function(a){a.push([0,2,3]);a.push([3,1,0]);}, last_face:function(a,s){ var i=(s-1)*4;a.push([i+2,i+1,i+3]);a.push([i+2,i+0,i+1]);}, faces:function(a,s){if(s===0){this.first_face(a);return;} 
var i=(s-1)*4; a.push([i+2,i+6,i+3]);a.push([i+3,i+6,i+7]); a.push([i+3,i+7,i+5]);a.push([i+3,i+5,i+1]); a.push([i+6,i+2,i+0]);a.push([i+6,i+0,i+4]); a.push([i+0,i+5,i+4]);a.push([i+0,i+1,i+5]);}};var Parser={forceElev:false,defaultElev:1,

file:function(content,forceElevation,defaultElevation){this.forceElev=forceElevation;this.defaultElev=defaultElevation;var tracks=content.documentElement.getElementsByTagName('trk');if(tracks.length===0){Messages.error("This file does not appear to contain any tracks.<br />(Are you sure it is a GPX file?)");return null;} 
return this.track(tracks[0]);},track:function(track){var segments=track.getElementsByTagName('trkseg');if(segments.length===0){Messages.error("This file does not appear to contain any track segments.<br />(Are you sure it is a valid GPX file?)");return null;}

var pts=[];for(var i=0;i<segments.length;i++){pts=pts.concat(this.segment(segments[i]));}

if(pts.length<2){Messages.error('The primary track does not appear to contain enough points.<br />(At least two points are expected.)');return null;}
return pts;},segment:function(segment){var trkpts=segment.getElementsByTagName('trkpt');
var pts=[];for(var i=0;i<trkpts.length;i++){pts.push(this.point(trkpts[i]));}
return pts;}, point:function(pt){var elevation=this.defaultElev;if(!this.forceElev&&pt.getElementsByTagName('ele').length!==0){elevation=parseFloat(pt.getElementsByTagName('ele')[0].textContent);}
return[parseFloat(pt.getAttribute('lon')),parseFloat(pt.getAttribute('lat')),elevation];}};var PointProjector={init:function(projDefinition){this.projection=proj4(projDefinition);},linear:function(v,distRatio,total){return[0,distRatio*total,v[2]];},ring:function(v,distRatio,radius){return[radius*Math.cos(2*Math.PI*distRatio),radius*Math.sin(2*Math.PI*distRatio),v[2]];},project:function(v){return this.projection.forward([v[0],v[1]]).concat(v[2]);}};var UTM={proj:function(lat,lon){var proj="+proj=utm +zone=";proj+=this.zone(lon);proj+=this.hemi(lat);proj+=" +ellps=WGS84 +datum=WGS84 +units=m +no_defs";return proj;},hemi:function(lat){return(lat<0?' +south':'');},zone:function(lon){lon+=180; lon-=lon%6; lon/=6; return lon+1;}};var Messages={msgdiv:null,clear:function(msgElement){if(typeof msgElement==='undefined'){var j=this.msgdiv.children.length;for(var i=0;i<j;i++){this.msgdiv.removeChild(this.msgdiv.children[0]);}}else{this.msgdiv.removeChild(msgElement);}},error:function(text){this.message(text,"errormsg");},status:function(text){this.message(text,"statusmsg");},message:function(text,type){var that=this;var msg=document.createElement("div");msg.innerHTML=text;msg.className="msg "+type;msg.onclick=function(e){that.clear(e.target);};this.msgdiv.appendChild(msg);}};
