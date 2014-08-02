/*
 * Called onLoad. Intercept form submission; handle file locally.
 */
function setup() {
	var form = document.forms.namedItem('gpxform');
	form.addEventListener('submit', function(ev) {
		ev.preventDefault();
		GPXLoader(document.getElementById('gpxfile').files[0]);
	}, false);
}

/*
 * Get a File object URL from form input or drag and drop.
 * Use XMLHttpRequest to retrieve the file content, and
 * pass the content on to be processed.
 */
function GPXLoader(gpxfile) {
	
	var gpxurl = window.URL.createObjectURL(gpxfile);

	var req = new XMLHttpRequest();
	req.onreadystatechange = function() {
		if (req.readyState === 4) {
			/*var gd = new GPXDoc(req.responseXML);
			LoadTracks(gd.content);*/
			LoadTracks(req.responseXML);
		}
	}
	
	req.open('GET', gpxurl, true);
	req.send(null);
	
	window.URL.revokeObjectURL(gpxurl);
}

/*function GPXDoc(content) {
	this.content = content;
}*/

function LoadTracks(gpxdoc) {
	var tracks = gpxdoc.documentElement.getElementsByTagName("trk");
	for (var i = 0; i < tracks.length; i++) {
		this.LoadTrack(tracks[i]);
	}
}

function LoadTrack(track) {
	var segments = track.getElementsByTagName("trkseg");
	for (var i = 0; i < segments.length; i++) {
		LoadSegment(segments[i]);
	}
}

function getcoords(point) {
	var lon = parseFloat(point.getAttribute("lon"));
	var lat = parseFloat(point.getAttribute("lat"));
	var ele = parseFloat(point.getElementsByTagName("ele")[0].innerHTML);
	var xy = proj4("+proj=moll +lon_0=0 +x_0=0 +y_0=0 +ellps=WGS84 +datum=WGS84 +units=m +no_defs", [lon, lat]);
	return [xy[0], xy[1], ele];
}

function LoadSegment(segment) {
	var points = segment.getElementsByTagName("trkpt");
	
	
	var xyz1 = getcoords(points[0]);
	var minx = xyz1[0];
	var maxx = xyz1[0];
	var miny = xyz1[1];
	var maxy = xyz1[1];
	var minz = xyz1[2];
	var maxz = xyz1[2];
	
	var p = [xyz1];
	for (var i = 1; i < points.length; i++) {
		var xyz = getcoords(points[i]);
		
		if (xyz[0] < minx) {
			minx = xyz[0];
		}
		
		if (xyz[0] > maxx) {
			maxx = xyz[0];
		}
		
		if (xyz[1] < miny) {
			miny = xyz[1];
		}
		
		if (xyz[1] > maxy) {
			maxy = xyz[1];
		}
		
		if (xyz[2] < minz) {
			minz = xyz[2];
		}
		
		if (xyz[2] > maxz) {
			maxz = xyz[2];
		}
		
		p.push(xyz);
	}
	
	var xextent = maxx - minx;
	var yextent = maxy - miny;
	var zextent = maxz - minz;
	
	var xoffset = -1/2 * (minx + maxx);
	var yoffset = -1/2 * (miny + maxy);
	
	
	var stuff = "translate([" + xoffset + "," + yoffset + ",0]) union() {\n";

	for (i = 1; i < p.length; i++) {
	
		// FIXME should use round down of minz instead of hard-coded 255
		var post = "translate([" + p[i][0] + "," + p[i][1] + ",0]) cylinder(h=" + (p[i][2] - 255) * 5.0 + ", d=30);\n";
		stuff += post;
	}
	
	stuff += "}";
	
	document.getElementById("output").innerHTML = stuff;
}

