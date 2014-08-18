
/*
 * Called onLoad. Intercept form submission; handle file locally.
 */
var setup = function() {
	var jscad = new OpenJsCad.Processor(document.getElementById('display'));
	var form = document.forms.namedItem('gpxform');
	form.addEventListener('submit', function(ev) {
		ev.preventDefault();
		loader(document.getElementById('gpxfile').files[0], jscad);
	}, false);
}

/*
 * Get a File object URL from form input or drag and drop.
 * Use XMLHttpRequest to retrieve the file content, and
 * pass the content on to be processed. Basic Javascript GPX
 * parsing based on https://github.com/peplin/gpxviewer/
 */
var loader = function(gpxfile, jscad) {
	
	var radioValue = function(radios) {
		for (var i = 0, len = radios.length; i < len; i++) {
			if (radios[i].checked) {
				return parseInt(radios[i].value);
				break;
			}
		}
		return undefined;
	};
	
	var gpxurl = window.URL.createObjectURL(gpxfile);
	
	var req = new XMLHttpRequest();
	req.onreadystatechange = function() {
		if (req.readyState === 4) {
			var gd = new GpxDiddler(
					req.responseXML,
					jscad,
					document.getElementById('path_width').value / 2.0,
					document.getElementById('vertical').value,
					document.getElementById('width').value,
					document.getElementById('depth').value,
					document.getElementById('base').value,
					document.getElementById('zcut').checked,
					radioValue(document.getElementsByName('shape')),
					radioValue(document.getElementsByName('marker')),
					document.getElementById('mindist').value);
			gd.LoadTracks();
		}
	}
	
	req.open('GET', gpxurl, true);
	req.send(null);
	
	window.URL.revokeObjectURL(gpxurl);
}

function GpxDiddler(content, jscad, buffer, vertical, bedx, bedy, base, zcut, shape, marker, mindist) {
	this.content = content;
	this.jscad = jscad;
	this.buffer = parseFloat(buffer);
	this.vertical = parseFloat(vertical);
	this.bedx = parseFloat(bedx);
	this.bedy = parseFloat(bedy);
	this.base = parseFloat(base);
	this.zcut = zcut;
	this.shape = shape;
	this.minimumDistance = parseFloat(mindist);
	
	// array of lon/lat/ele vectors (deg-ew/deg-ns/meters)
	this.ll = [];
	
	// array of segment distances
	// (Vincenty method applied to WGS84 input lat/lon coordinates)
	this.d = [];
	
	// total distance of route (sum of segment distances)
	this.distance = 0;
	
	// used for ring shape only; ring circumference = this.distance
	this.ringRadius = 0;
	
	// array of projected x/y/z vectors (meters)
	this.pp = [];
	
	// array of scaled/centered/z-cut x/y/z vectors
	this.fp = [];
	
	// array of 2D vectors marking miles/kms
	this.markers = [];
	
	// meters per marker (0 = no markers)
	this.mpermark = marker;
	
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
	
	this.scale = 0;
	this.rotate = false;
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
	
	// populates this.ll (lat/lon vectors)
	this.ScanPoints(segment.getElementsByTagName('trkpt'));
	
	// populates this.pp (projected point vectors)
	this.ProjectPoints();
	
	// scale/center projected point vectors
	this.fp = this.pp.map(this.pxyz, this);
	
	// scale/center markers (overwriting originals)
	this.markers = this.markers.map(this.pxyz, this);
	
	var scad = this.process_path();
	if (this.jscad.viewer) {
		this.jscad.viewer.setBedSize(this.bedx, this.bedy);
	}
	this.jscad.setJsCad(scad);
}

// Converts GPX trkpt nodelist to array of lon/lat/elevation vectors.
// Also assembles array of segment distances (n - 1 where n = point count)
GpxDiddler.prototype.ScanPoints = function(trkpts) {
	
	this.ll.push(this.llz(trkpts[0]));
	
	for (var current = 1, last = 0; current < trkpts.length; current++) {
		
		var point = this.llz(trkpts[current]);
		var dist = distVincenty(point[1], point[0], this.ll[last][1], this.ll[last][0]);
		
		if (this.minimumDistance == 0 || dist >= this.minimumDistance) {
			this.ll.push(point);
			this.d.push(dist);
			last += 1;
		}
	}
	
	this.distance = this.d.reduce(function(prev, cur) {
		return prev + cur;
	});
	
	this.ringRadius = this.distance / (Math.PI * 2);
}

// set min/max x/y/z bounds to the given xyz point
GpxDiddler.prototype.InitBounds = function(xyz) {
	this.minx = xyz[0];
	this.maxx = xyz[0];
	this.miny = xyz[1];
	this.maxy = xyz[1];
	this.minz = xyz[2];
	this.maxz = xyz[2];
}

// update min/max x/y/z bounds to include the given xyz point
GpxDiddler.prototype.UpdateBounds = function(xyz) {
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
}

// calculate extents (model size in each dimension) from bounds
GpxDiddler.prototype.UpdateExtent = function() {
	this.xextent = this.maxx - this.minx;
	this.yextent = this.maxy - this.miny;
	this.zextent = this.maxz - this.minz;
}

// calculate offsets used to translate model to output origin
GpxDiddler.prototype.UpdateOffset = function() {
	
	// xy offset used to center model around origin
	this.xoffset = (this.minx + this.maxx) / 2;
	this.yoffset = (this.miny + this.maxy) / 2;
	
	// zero z offset uses full height above sea level
	// disabled if minimum elevation is at or below 0
	if (this.zcut == false && this.minz > 0) {
		this.zoffset = 0;
	} else {
		// by default, z offset is calculated to cut
		// the elevation profile just below minimum
		this.zoffset = Math.floor(this.minz - 1);
	}
}

// calculate scale used to fit model on output bed
GpxDiddler.prototype.UpdateScale = function() {
	// indent bed extent to accomodate buffer width
	var xbe = this.bedx - (2 * this.buffer),
		ybe = this.bedy - (2 * this.buffer);
	var mmax = Math.max(this.xextent, this.yextent),
		mmin = Math.min(this.xextent, this.yextent),
		bmax = Math.max(xbe, ybe),
		bmin = Math.min(xbe, ybe),
		fmax = bmax / mmax,
		fmin = bmin / mmin;
	this.scale = Math.min(fmax, fmin);
	
	// determine whether the model should be rotated to fit
	if ((xbe > ybe && this.xextent > this.yextent) ||
		(xbe < ybe && this.xextent < this.yextent)) {
		this.rotate = false;
	} else {
		this.rotate = true;
	}
}

// point to project and cumulative distance along path
GpxDiddler.prototype.ProjectPoint = function(point, cd) {
	var xyz;
	if (this.shape == 1) {
		xyz = point.projLinear(cd);
	} else if (this.shape == 2) {
		xyz = point.projRing(cd/this.distance, this.ringRadius);
	} else {
		xyz = point.projMerc();
	}
	return xyz;
}

GpxDiddler.prototype.ProjectPoints = function() {
	
	// cumulative distance
	var cd = 0;
	
	// distance since last marker
	var md = 0, lastmd = 0;
	
	// Initialize extents using first projected point.
	var xyz = this.ProjectPoint(this.ll[0], 0);
	this.InitBounds(xyz);
	this.pp.push(xyz);
	
	// Project the rest of the points, updating extents.
	for (var i = 1; i < this.ll.length; i++) {
		
		lastmd = md;
		md += this.d[i-1];
		cd += this.d[i-1];
		
		xyz = this.ProjectPoint(this.ll[i], cd);
		this.UpdateBounds(xyz);
		this.pp.push(xyz);
		
		// If we've met or exceeded distance to next marker,
		// determine its exact location and add it to list.
		// (No marker calculations if mpermark is zero)
		if (this.mpermark > 0 && md >= this.mpermark) {
			
			var last_seg = this.mpermark - lastmd;
			var seg_length = md - lastmd;
			var next_seg = seg_length - last_seg;
			var pd = last_seg / seg_length;
			
			// marker located along segment between previous and current point
			// pd is the proportionate distance along that vector
			var markerpoint = [
				this.ll[i-1][0] + pd * (this.ll[i][0] - this.ll[i-1][0]),
				this.ll[i-1][1] + pd * (this.ll[i][1] - this.ll[i-1][1]),
				this.ll[i-1][2] + pd * (this.ll[i][2] - this.ll[i-1][2])
			];
			
			// store projected marker location			
			this.markers.push(this.ProjectPoint(markerpoint, cd - next_seg));
			
			// reset distance to next marker
			md = next_seg;
		}
	}
	
	this.UpdateExtent();
	this.UpdateOffset();
	this.UpdateScale();
}

/*
 * Given a point array and index of a point,
 * return the angle of the vector from that point
 * to the next. (2D) (If the index is to the last point,
 * return the preceding segment's angle. Point array
 * should have at least 2 points!)
 */
GpxDiddler.prototype.segment_angle = function(i) {
	
	// in case of final point, repeat last segment angle
	if (i + 1 == this.fp.length) {
		return this.segment_angle(i - 1);
	}
	
	// 2D coordinates of this point and the next
	var ix = this.fp[i][0],
		iy = this.fp[i][1],
		jx = this.fp[i + 1][0],
		jy = this.fp[i + 1][1],
		
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
GpxDiddler.prototype.joint_points = function(i, absa, avga) {
	
	// distance from endpoint to segment buffer intersection
	var jointr = this.buffer/Math.cos(avga - absa),
	
	// joint coordinates (endpoint offset at bisect angle by jointr)
		lx = this.fp[i][0] + jointr * Math.cos(avga + Math.PI/2),
		ly = this.fp[i][1] + jointr * Math.sin(avga + Math.PI/2),
		rx = this.fp[i][0] + jointr * Math.cos(avga - Math.PI/2),
		ry = this.fp[i][1] + jointr * Math.sin(avga - Math.PI/2);
	
	return [[lx, ly], [rx, ry]];
}

/*
 * Given a point array fp with at least two points, loop
 * through each segment (pair of points). In each iteration
 * of the for loop, pj and pk are the 2D coordinates of the
 * corners of the quad representing a buffered path for
 * that segment; consecutive segments share endpoints.
 */
GpxDiddler.prototype.process_path = function() {
	
	var a0 = this.segment_angle(0),
		a1,
		ra = 0,
		ja = a0,
		pj = this.joint_points(0, a0, ja),
		pk;
	
	// first four points of segment polyhedron
	var ppts = [];
	ppts.push_vertices(pj, this.fp[0][2] + this.base);

	var pfac = [];
	pfac.push_first_faces();
	
	for (var i = 1; i < this.fp.length; i++) {
		
		a1 = this.segment_angle(i);
		ra = a1 - a0;
		ja = ra / 2 + a0;
		pk = this.joint_points(i, a1, ja);
		
		// last four points of segment polyhedron
		ppts.push_vertices(pk, this.fp[i][2] + this.base);
		
		// faces of segment based on index of first involved point
		pfac.push_faces((i - 1) * 4);
		
		a0 = a1;
		pj = pk;
	}
	
	pfac.push_last_faces((i - 1) * 4);
	
	return this.AssembleSCAD(
		ppts.map(function(v) {
			return "[" + v[0].toFixed(4) + ", " + v[1].toFixed(4) + ", " + v[2].toFixed(4) + "]";
		}),
		pfac.map(function(v) {
			return "[" + v[0] + ", " + v[1] + ", " + v[2] + "]";
		})
	);
}

GpxDiddler.prototype.AssembleSCAD = function(pathPoints, pathFaces) {
	
	var rotate = this.rotate ? ".rotateZ(90)" : "";
	
	var models = ["{name: 'profile', caption: 'Profile', data: CSG.polyhedron({points:[\n" + pathPoints.join(",\n") + "\n],\nfaces:[\n" + pathFaces.join(",\n") + "\n]})" + rotate + "}"];
	
	if (this.mpermark > 0) {
		models.push("{name: 'markers', caption: 'Markers', data: " + this.markerscad() + rotate + "}");
	}
	
	return "function main() {\nreturn [" + models.join(',') + "];\n}\n";
}

// assumes this.markers.length >= 1
GpxDiddler.prototype.markerscad = function() {
	
	var c = "CSG.cylinder({start: [0, 0, 0], end: [0, 0, 2], radius: 4})" +
			".translate([" + this.markers[0][0] + ", " + this.markers[0][1] + ", 0])";
	
	for (var i = 1; i < this.markers.length; i++) {
		var x = this.markers[i][0],
			y = this.markers[i][1];
		c += ".union(CSG.cylinder({start: [0, 0, 0], end: [0, 0, 2], radius: 4})" +
				".translate([" + x + ", " + y + ", 0]))";
	}
		
	return c;
}

Array.prototype.push_vertices = function(v, z) {
	this.push([v[0][0], v[0][1], 0]);	// lower left
	this.push([v[1][0], v[1][1], 0]);	// lower right
	this.push([v[0][0], v[0][1], z]);	// upper left
	this.push([v[1][0], v[1][1], z]);	// upper right
}

Array.prototype.push_first_faces = function() {
	this.push([0, 2, 3]);
	this.push([3, 1, 0]);
}

// s is index of first corner point comprising this segment
Array.prototype.push_faces = function(s) {
	
	// top face
	this.push([s + 2, s + 6, s + 3]);
	this.push([s + 3, s + 6, s + 7]);
	
	// left face
	this.push([s + 3, s + 7, s + 5]);
	this.push([s + 3, s + 5, s + 1]);
	
	// right face
	this.push([s + 6, s + 2, s + 0]);
	this.push([s + 6, s + 0, s + 4]);
	
	// bottom face
	this.push([s + 0, s + 5, s + 4]);
	this.push([s + 0, s + 1, s + 5]);
}

Array.prototype.push_last_faces = function(s) {
	this.push([s + 2, s + 1, s + 3]);
	this.push([s + 2, s + 0, s + 1]);
}

// returns a scaled and centered output unit [x, y, z] vector from input [x, y, z] Mercator meter vector
GpxDiddler.prototype.pxyz = function(v) {
	return [
			this.scale * (v[0] - this.xoffset),
			this.scale * (v[1] - this.yoffset),
			this.scale * (v[2] - this.zoffset) * this.vertical
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

// assumes first element of array is longitude and second is latitude
// projects these coordinates to Mercator, and returns a new array
// beginning with projected x and y meter coordinates. (Any remaining
// elements are retained in the result unmodified.)
Array.prototype.projMerc = function() {
	return proj4(
			'+proj=merc +lon_0=0 +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +datum=WGS84 +units=m +no_defs',
			[this[0], this[1]]
	).concat(this.slice(2));
}

// param cd = cumulative distance
Array.prototype.projLinear = function(cd) {
	return [0, cd].concat(this.slice(2));
}

// param dr = distance ratio (cumulative distance / total distance)
Array.prototype.projRing = function(d, r) {
	return [
		r * Math.cos(2 * Math.PI * d),
		r * Math.sin(2 * Math.PI * d)
	].concat(this.slice(2));	
}
