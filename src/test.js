var oj = null;

/*
 * Called onLoad. Intercept form submission; handle file locally.
 */
function setup() {
	oj = new OpenJsCad.Processor(document.getElementById('display'));
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
			var gd = new GpxDiddler(
					req.responseXML,
					document.getElementById('path_width').value / 2.0,
					document.getElementById('vertical').value,
					document.getElementById('width').value,
					document.getElementById('depth').value,
					document.getElementById('base').value,
					document.getElementById('zcut').checked);
			gd.LoadTracks();
		}
	}
	
	req.open('GET', gpxurl, true);
	req.send(null);
	
	window.URL.revokeObjectURL(gpxurl);
}

function GpxDiddler(content, buffer, vertical, bedx, bedy, base, zcut) {
	this.content = content;
	this.buffer = parseFloat(buffer);
	this.vertical = parseFloat(vertical);
	this.bedx = parseFloat(bedx);
	this.bedy = parseFloat(bedy);
	this.base = parseFloat(base);
	this.zcut = zcut;
	
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
	this.zoffset = 0;
	
	this.bedscale = 0;
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
	var scad = this.process_path(points.map(this.pxyz, this));
	oj.setJsCad(scad);
}

GpxDiddler.prototype.ProjectPoints = function(trkpts) {
	
	var p = [];
	var d = [];
	
	// Initialize extents using first projected point.
	var llz1 = this.llz(trkpts[0]);
	var xyz1 = this.LL2XYZ(llz1);
	this.minx = xyz1[0];
	this.maxx = xyz1[0];
	this.miny = xyz1[1];
	this.maxy = xyz1[1];
	this.minz = xyz1[2];
	this.maxz = xyz1[2];
	p.push(xyz1);
	
	// Project the rest of the points, updating extents.
	for (var i = 1; i < trkpts.length; i++) {
		var llz = this.llz(trkpts[i]);
		var xyz = this.LL2XYZ(llz);
		
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
		d.push(distVincenty(llz[1], llz[0], llz1[1], llz1[0]));
		
		llz1 = llz;
	}
	
	/*console.log(d.reduce(function(prev, cur) {
		return prev + cur;
	}));*/
	
	this.xextent = this.maxx - this.minx;
	this.yextent = this.maxy - this.miny;
	this.zextent = this.maxz - this.minz;
	
	// xy offset used center course map around origin
	this.xoffset = (this.minx + this.maxx) / 2;
	this.yoffset = (this.miny + this.maxy) / 2;
	
	// z offset used to set lowest point of course at or just above zero
	if (this.zcut == false && this.minz > 0) {
		// use true height from sea level if requested
		// (and if min elevation is also above sea level)
		this.zoffset = 0;
	} else {
		// otherwise, use the minimum elevation
		this.zoffset = Math.floor(this.minz - 1);
	}
	
	this.bedscale = bedscale(this.xextent, this.yextent, this.bedx, this.bedy);
	
	return p;
}

// model xy extents, bed xy extents
function bedscale(mx, my, bx, by) {
	var mmax = Math.max(mx, my),
		mmin = Math.min(mx, my),
		bmax = Math.max(bx, by),
		bmin = Math.min(bx, by);
	var fmax = bmax / mmax,
		fmin = bmin / mmin;
	var scale = Math.min(fmax, fmin);
	return scale;
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
 * absa is absolute angle of this segment; avga is the
 * average angle between this segment and the next.
 * (p could be kept as a GpxDiddler property.)
 */
GpxDiddler.prototype.joint_points = function(p, i, absa, avga) {
	
	// distance from endpoint to segment buffer intersection
	var jointr = this.buffer/Math.cos(avga - absa),
	
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
		pj = this.joint_points(p, 0, a0, ja),
		pk;
	
	// first four points of segment polyhedron
	var ppts = [];
	ppts.push([pj[0][0], pj[0][1], 0]);						// lower left
	ppts.push([pj[1][0], pj[1][1], 0]);						// lower right
	ppts.push([pj[0][0], pj[0][1], p[0][2] + this.base]);	// upper left
	ppts.push([pj[1][0], pj[1][1], p[0][2] + this.base]);	// upper right

	// initial endcap face
	var pfac = [];
	pfac.push([0, 2, 3]);
	pfac.push([3, 1, 0])
	
	for (var i = 1; i < p.length; i++) {
		
		a1 = segment_angle(p, i);
		ra = a1 - a0;
		ja = ra / 2 + a0;
		pk = this.joint_points(p, i, a1, ja);
		
		// last four points of segment polyhedron
		ppts.push([pk[0][0], pk[0][1], 0]);						// lower left
		ppts.push([pk[1][0], pk[1][1], 0]);						// lower right
		ppts.push([pk[0][0], pk[0][1], p[i][2] + this.base]);	// upper left
		ppts.push([pk[1][0], pk[1][1], p[i][2] + this.base]);	// upper right
		
		// faces of segment based on index of first involved point
		segment_faces(pfac, (i - 1) * 4);
		
		a0 = a1;
		pj = pk;
	}
	
	// final endcap face
	pfac.push([(i - 1) * 4 + 2, (i - 1) * 4 + 1, (i - 1) * 4 + 3]);
	pfac.push([(i - 1) * 4 + 2, (i - 1) * 4 + 0, (i - 1) * 4 + 1]);
	
	return "function main() {\nreturn CSG.polyhedron({points:[\n" + ppts.map(v2s).join(",\n") + "\n],\nfaces:[\n" + pfac.map(v2s).join(",\n") + "\n]});\n}\n";
}

// a is face array
// s is index of first corner point comprising this segment
function segment_faces(a, s) {
	
	// top face
	a.push([s + 2, s + 6, s + 3]);
	a.push([s + 3, s + 6, s + 7]);
	
	// left face
	a.push([s + 3, s + 7, s + 5]);
	a.push([s + 3, s + 5, s + 1]);
	
	// right face
	a.push([s + 6, s + 2, s + 0]);
	a.push([s + 6, s + 0, s + 4]);
	
	// bottom face
	a.push([s + 0, s + 5, s + 4]);
	a.push([s + 0, s + 1, s + 5]);
}

function v2s(v) {
	return "[" + v[0] + ", " + v[1] + ", " + v[2] + "]";
}

// returns a scaled and centered output unit [x, y, z] vector from input [x, y, z] Mercator meter vector
GpxDiddler.prototype.pxyz = function(v) {
	return [
			this.bedscale * (v[0] - this.xoffset),
			this.bedscale * (v[1] - this.yoffset),
			this.bedscale * (v[2] - this.zoffset) * this.vertical
	];
}

// returns numeric [longitude, latitude, elevation] vector from GPX track point
GpxDiddler.prototype.llz = function(pt) {
	return [
			parseFloat(pt.getAttribute('lon')),
			parseFloat(pt.getAttribute('lat')),
			parseFloat(pt.getElementsByTagName('ele')[0].innerHTML)
	];
}

// returns Mercator projected [x, y, elevation] meter vector from lon/lat/elevation
GpxDiddler.prototype.LL2XYZ = function(llzv) {
	// Mercator projection - for alignment w/popular web mapping displays
	var xy = proj4(
			'+proj=merc +lon_0=0 +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +datum=WGS84 +units=m +no_defs',
			[llzv[0], llzv[1]]
	);
	return [
			xy[0],
			xy[1],
			llzv[2]
	];
}
