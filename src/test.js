/*
 * Called onLoad. Intercept form submission; handle file locally.
 */
function setup() {
	var form = document.forms.namedItem('gpxform');
	form.addEventListener('submit', function(ev) {
		ev.preventDefault();
		loader(document.getElementById('gpxfile').files[0]);
	}, false);
}

/*
 * Get a File object URL from form input or drag and drop.
 * Use XMLHttpRequest to retrieve the file content, and
 * pass the content on to be processed. Basic Javascript GPX
 * parsing based on https://github.com/peplin/gpxviewer/
 */
function loader(gpxfile) {
	
	var gpxurl = window.URL.createObjectURL(gpxfile);

	var req = new XMLHttpRequest();
	req.onreadystatechange = function() {
		if (req.readyState === 4) {
			var gd = new GpxDiddler(req.responseXML, 'output');
			gd.LoadTracks();
		}
	}
	
	req.open('GET', gpxurl, true);
	req.send(null);
	
	window.URL.revokeObjectURL(gpxurl);
}

function GpxDiddler(content, output) {
	this.content = content;
	this.output = output;
	
	this.minx = 0;
	this.maxx = 0;
	this.miny = 0;
	this.maxy = 0;
	this.minz = 0;
	this.maxz = 0;
	
	this.xextent = 0;
	this.yextent = 0;
	this.zextent = 0;
	
	this.xoffset = 0;
	this.yoffset = 0;
}

GpxDiddler.prototype.LoadTracks = function() {
	var tracks = this.content.documentElement.getElementsByTagName('trk');
	for (var i = 0; i < tracks.length; i++) {
		this.LoadTrack(tracks[i]);
	}
}

GpxDiddler.prototype.LoadTrack = function(track) {
	var segments = track.getElementsByTagName('trkseg');
	for (var i = 0; i < segments.length; i++) {
		this.LoadSegment(segments[i]);
	}
}

GpxDiddler.prototype.LoadSegment = function(segment) {
	var trkpts = segment.getElementsByTagName('trkpt');
	var points = this.ProjectPoints(trkpts);
	var scad = this.process_path(points);
	document.getElementById(this.output).innerHTML = scad;
}

GpxDiddler.prototype.ProjectPoints = function(trkpts) {
	
	var p = [];
	
	// Initialize extents using first projected point.
	var xyz1 = this.LL2XYZ(trkpts[0]);
	this.minx = xyz1[0];
	this.maxx = xyz1[0];
	this.miny = xyz1[1];
	this.maxy = xyz1[1];
	this.minz = xyz1[2];
	this.maxz = xyz1[2];
	p.push(xyz1);
	
	// Project the rest of the points, updating extents.
	for (var i = 1; i < trkpts.length; i++) {
		var xyz = this.LL2XYZ(trkpts[i]);
		
		if (xyz[0] < this.minx) {
			this.minx = xyz[0];
		}
		
		if (xyz[0] > this.maxx) {
			this.maxx = xyz[0];
		}
		
		if (xyz[1] < this.miny) {
			this.miny = xyz[1];
		}
		
		if (xyz[1] > this.maxy) {
			this.maxy = xyz[1];
		}
		
		if (xyz[2] < this.minz) {
			this.minz = xyz[2];
		}
		
		if (xyz[2] > this.maxz) {
			this.maxz = xyz[2];
		}
		
		p.push(xyz);
	}
	
	this.xextent = this.maxx - this.minx;
	this.yextent = this.maxy - this.miny;
	this.zextent = this.maxz - this.minz;
	
	this.xoffset = -1/2 * (this.minx + this.maxx);
	this.yoffset = -1/2 * (this.miny + this.maxy);
	
	return p;
}

/*
 * Given a point array and index of a point,
 * return the angle of the vector from that point
 * to the next. (2D) (If the index is to the last point,
 * return the preceding segment's angle. Point array
 * should have at least 2 points!)
 */
function segment_angle(p, i) {
	
	// in case of final point, repeat last segment angle
	if (i + 1 == p.length) {
		return segment_angle(p, i - 1);
	}
	
	// 2D coordinates of this point and the next
	var ix = p[i][0],
		iy = p[i][1],
		jx = p[i + 1][0],
		jy = p[i + 1][1],
		
	// Vector components of segment from this to next
		dx = jx - ix,
		dy = jy - iy,
		
	// Angle of segment vector (radians ccw from x-axis)
		angle = Math.atan2(dy, dx);
	
	return angle;
}

/*
 * Return a pair of 2D points representing the joints
 * where the buffered paths around the actual segment
 * intersect - segment endpoints offset perpendicular
 * to segment by buffer distance, adjusted for tidy
 * intersection with adjacent segment's buffered path.
 */
function joint_points(p, i, absa, avga) {
	
	// FIXME: SCAD output compiles to STL successfully with a buffer value
	//        of 5, but fails with CGAL assertion errors for wider buffers
	//        like 16 or 20. Makes me worry about some misunderstood thing,
	//        and OpenSCAD's general flakiness with all but simplest input.
	
	// FIXME: Actually, the CGAL assertion errors occur with a buffer width
	//        of 5 as well for a longer track, meaning it IS one of these
	//        flaky indeterminate OpenSCAD wimp-ass garbage failures.
	
	// My best guess is that there is some minimum distance issue where
	// we are basically getting coincident points.
	
	// the standard segment buffer width
	var buffer = 20;
	
	// distance from endpoint to segment buffer intersection
	var jointr = buffer/Math.cos(avga - absa),
	
	// joint coordinates (endpoint offset at bisect angle by jointr)
		lx = p[i][0] + jointr * Math.cos(avga + Math.PI/2),
		ly = p[i][1] + jointr * Math.sin(avga + Math.PI/2),
		rx = p[i][0] + jointr * Math.cos(avga - Math.PI/2),
		ry = p[i][1] + jointr * Math.sin(avga - Math.PI/2);
	
	return [[lx, ly], [rx, ry]];
}

/*
 * Given a point array p with at least two points, loop
 * through each segment (pair of points). In each iteration
 * of the for loop, pj and pk are the 2D coordinates of the
 * corners of the quad representing a buffered path for
 * that segment; consecutive segments share endpoints.
 */
GpxDiddler.prototype.process_path = function(p) {
	
	var a0 = segment_angle(p, 0),
		a1,
		ra = 0,
		ja = a0,
		pj = joint_points(p, 0, a0, ja),
		pk,
		lasti = 0;
	
	//var scad = "translate([" + this.xoffset + ", " + this.yoffset + ", 0]) union() {\n";
	var ppts = [];
	ppts.push(v2s([pj[0][0], pj[0][1], 0]));
	ppts.push(v2s([pj[1][0], pj[1][1], 0]));
	ppts.push(v2s([pj[0][0], pj[0][1], p[0][2]]));
	ppts.push(v2s([pj[1][0], pj[1][1], p[0][2]]));

	var pfac = [];
	
	// start cap faces
	pfac.push(v2s([0, 2, 3]));
	pfac.push(v2s([3, 1, 0]))
	
	// segment counter (separate from i in case we filter-skip input segments)
	var s = 0;
	
	for (var i = 1; i < p.length; i++) {
		
		a1 = segment_angle(p, i);
		ra = a1 - a0;
		ja = ra / 2 + a0;
		pk = joint_points(p, i, a1, ja);
		
		// this minimum distance check does not eliminate erratic OpenSCAD internal CGAL errors
	//	var xydist = Math.sqrt(Math.pow(p[i][0] - p[lasti][0], 2) + Math.pow(p[i][1] - p[lasti][1], 2));
	//	if (xydist < 15) {
	//		continue;
	//	}
	// as-is, skipping segments will mess up our constant width buffer joints
		
		//console.log(pj.toString(), pk.toString());
		// use this.xoffset and this.yoffset instead of final 0,0 to hard-translate coords
		//scad += ptstopolyhedron(pj, pk, p[lasti][2], p[i][2], 0, 0);
		
		ppts.push(v2s([pk[0][0], pk[0][1], 0]));
		ppts.push(v2s([pk[1][0], pk[1][1], 0]));
		ppts.push(v2s([pk[0][0], pk[0][1], p[i][2]]));
		ppts.push(v2s([pk[1][0], pk[1][1], p[i][2]]));
		
		// trying to fill in face indices for building one big polyhedron

		// top
		pfac.push(v2s([s + 2, s + 6, s + 3]));
		pfac.push(v2s([s + 3, s + 6, s + 7]));
		
		// left
		pfac.push(v2s([s + 3, s + 7, s + 5]));
		pfac.push(v2s([s + 3, s + 5, s + 1]));
		
		// right
		pfac.push(v2s([s + 6, s + 2, s + 0]));
		pfac.push(v2s([s + 6, s + 0, s + 4]));
		
		// bottom
		pfac.push(v2s([s + 0, s + 5, s + 4]));
		pfac.push(v2s([s + 0, s + 1, s + 5]));
				
		a0 = a1;
		pj = pk;
		lasti = i;
		s += 4;
	}
	
	// end cap faces
	pfac.push(v2s([s + 2, s + 1, s + 3]));
	pfac.push(v2s([s + 2, s + 0, s + 1]));
	
	//scad += '}';
	
	var poly = "translate(["+this.xoffset+", "+this.yoffset+", 0]) polyhedron(points=[" + ppts.join(', ') + "], faces=[" + pfac.join(', ') + "]);"
		
	return poly;
}

function v2s(v) {
	return "[" + v[0] + ", " + v[1] + ", " + v[2] + "]";
}

function ptstopolyhedron(j, k, jz, kz, ox, oy) {
	return "polyhedron(\
points = [\
[" + (j[0][0]+ox) + "," + (j[0][1]+oy) + "," + 0 + "], \
[" + (j[1][0]+ox) + "," + (j[1][1]+oy) + "," + 0 + "], \
[" + (k[0][0]+ox) + "," + (k[0][1]+oy) + "," + 0 + "], \
[" + (k[1][0]+ox) + "," + (k[1][1]+oy) + "," + 0 + "], \
[" + (j[0][0]+ox) + "," + (j[0][1]+oy) + "," + jz + "], \
[" + (j[1][0]+ox) + "," + (j[1][1]+oy) + "," + jz + "], \
[" + (k[0][0]+ox) + "," + (k[0][1]+oy) + "," + kz + "], \
[" + (k[1][0]+ox) + "," + (k[1][1]+oy) + "," + kz + "]\
],\
faces = [\
[0, 1, 2], \
[1, 3, 2], \
[4, 7, 5], \
[4, 6, 7], \
[7, 2, 3], \
[7, 6, 2], \
[4, 5, 1], \
[4, 1, 0], \
[7, 1, 5], \
[7, 3, 1], \
[6, 4, 2], \
[2, 4, 0]\
]);\n"
}

GpxDiddler.prototype.LL2XYZ = function(gpxpt) {
	var lon = parseFloat(gpxpt.getAttribute('lon'));
	var lat = parseFloat(gpxpt.getAttribute('lat'));
	var ele = parseFloat(gpxpt.getElementsByTagName('ele')[0].innerHTML);
	// Albers Equal Area Conic North America
	var xy = proj4('+proj=aea +lat_1=29.5 +lat_2=45.5 +lat_0=37.5 +lon_0=-96 +x_0=0 +y_0=0 +ellps=GRS80 +datum=NAD83 +units=m +no_defs', [lon, lat]);
	return [xy[0], xy[1], 5 * (ele - 255)];
}

