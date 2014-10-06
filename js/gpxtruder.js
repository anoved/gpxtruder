var OJSCAD = undefined;

var setup = function() {
	
	// Setup notifications
	Messages.msgdiv = document.getElementById('messages');
	
	// Setup WebGL preview display (and STL converter)
	OJSCAD = new OpenJsCad.Processor(document.getElementById('display'), {
		color: [0, 0.6, 0.1],
		openJsCadPath: "js/",
		viewerwidth: "800px",
		viewerheight: "400px",
		bgColor: [0.553, 0.686, 0.8, 1]
	});
	
	// Setup input form; handle submit events locally
	document.forms.namedItem('gpxform').addEventListener(
		'submit',
		function(ev) {
			ev.preventDefault();
			loader(document.getElementById('gpxfile').files[0]);
		},
		false
	);
}

var loader = function(upload_file) {
	
	var radioValue = function(radios) {
		for (var i = 0, len = radios.length; i < len; i++) {
			if (radios[i].checked) {
				return parseInt(radios[i].value);
				break;
			}
		}
		return undefined;
	};
	
	Messages.clear();
	
	// Assign a local URL to the file selected for upload
	// https://developer.mozilla.org/en-US/docs/Web/API/URL.createObjectURL
	var upload_url = window.URL.createObjectURL(upload_file);
	
	var req = new XMLHttpRequest();
	req.onreadystatechange = function() {
		if (req.readyState === 4) {
			
			if (!req.responseXML) {
				Messages.error("This doesn't appear to be a GPX file.");
				return;
			}
			
			var options = {
				buffer:     parseFloat(document.getElementById('path_width').value) / 2.0,
				vertical:   parseFloat(document.getElementById('vertical').value),
				bedx:       parseFloat(document.getElementById('width').value),
				bedy:       parseFloat(document.getElementById('depth').value),
				base:       parseFloat(document.getElementById('base').value),
				zcut:       document.getElementById('zcut').checked,
				shapetype:  radioValue(document.getElementsByName('shape')),
				marktype:   radioValue(document.getElementsByName('marker')),
				markspan:   parseFloat(document.getElementById('marker_interval').value),
				smoothtype: radioValue(document.getElementsByName('smooth')),
				smoothspan: parseFloat(document.getElementById('mindist').value),
				jscadDiv:   document.getElementById('code_jscad'),
				oscadDiv:   document.getElementById('code_openscad')
			};
			
			// Attempt to parse response XML (upload content) as a GPX file.
			var pts = Parser.file(req.responseXML);
			if (pts === null) {
				return;
			}
			
			// If all is well, proceed to extrude the GPX path.
			new Gpex(options, pts);
		}
	}
	
	// submit asynchronous request for the [locally] uploaded file
	req.open('GET', upload_url, true);
	req.send();
	
	window.URL.revokeObjectURL(upload_url);
}

// use a tidier options object
function Gpex(options, pts) {
	
	this.buffer = options.buffer;
	this.vertical = options.vertical;
	this.bedx = options.bedx;
	this.bedy = options.bedy;
	this.base = options.base;
	this.zcut = options.zcut;
	this.shape = options.shapetype;
	this.smoothingMode = options.smoothtype;
	this.minimumDistance = options.smoothspan;
	this.code_jscad = options.jscadDiv;
	this.code_openscad = options.oscadDiv;
	
	// array of lon/lat/ele vectors (deg-ew/deg-ns/meters)
	this.ll = [];
	
	// array of segment distances
	// (Vincenty method applied to WGS84 input lat/lon coordinates)
	this.d = [];
	
	// total distance of route (sum of segment distances)
	this.distance = 0;
	
	// used for ring shape only; ring circumference = this.distance
	this.ringRadius = 0;
	
	// total distance of smoothed route (may vary from initial total)
	this.smooth_total;
	
	// array of projected x/y/z vectors (meters) (pp = projected points)
	this.pp = [];
	
	// array of scaled/centered/z-cut x/y/z vectors (fp = final points)
	this.fp = [];
	
	// startm/stopm: meter markers of path segment of interest
	//               (null indicates start/top of whole path)
	// starti/stopi: corresponding indices into pp/fp arrays
	//               (Calculated by ProjectPoints; must be initialized null.)
	this.pathrange = {
		startm: null, // options.startm == 0 ? null : options.startm,
		stopm: null, // options.stopm == 0 ? null : options.stopm,
		starti: null,
		stopi: null
	};
	
	// array of 2D vectors marking miles/kms
	this.markers = [];
	
	// orientation of each marker (aligned with initial segment along which it lies)
	this.markseg = [];
	
	// meters per marker (0 = no markers)
	if (options.marktype == 0) {
		// no markers
		this.mpermark = 0;
	} else if (options.marktype == 1) {
		// kilometers
		this.mpermark = 1000;
	} else if (options.marktype == 2) {
		// miles
		this.mpermark = 1609;
	} else {
		// other interval
		this.mpermark = options.markspan;
	}
	
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
	
	this.Extrude(pts);
	this.Display();
}

Gpex.prototype.Extrude = function(pts) {
		
	// populates this.ll (lat/lon vectors)
	this.ScanPoints(pts);
	
	// populates this.pp (projected point vectors)
	this.ProjectPoints();
	
	// scale/center projected point vectors
	this.fp = this.pp.map(this.pxyz, this);
	
	// scale/center markers (overwriting originals)
	this.markers = this.markers.map(this.pxyz, this);
	
	// create output geometry
	this.process_path();
}

Gpex.prototype.Display = function() {
	
	// Tweak preview display if available
	if (OJSCAD.viewer) {
		OJSCAD.viewer.setBedSize(this.bedx, this.bedy);
		
		// Attempt to retrieve a basemap on two conditions:
		// track shape is selected and zoom level is reasonable
		if (!(this.shape === 0 && this.basemap())) {
			OJSCAD.viewer.clearBaseMap(this.rotate);
		}
	}
	
	// Update the preview display AND allow STL export
	// (Even if WebGL is not available for preview, STL export should work.)
	OJSCAD.setJsCad(this.jscad_assemble(false));
	
	// Display code for custom usage (can we utilize stuff cached above?)
	this.code_jscad.innerHTML = this.jscad_assemble(true);	
	this.code_openscad.innerHTML = this.oscad_assemble();
	
	// Bring the output div into view
	document.getElementById('output').scrollIntoView();
}

// Scan point array to determine bounds, path length, and marker locations.
// Also assembles array of segment distances (n - 1 where n = point count)
Gpex.prototype.ScanPoints = function(pts) {
	
	var that = this;
	
	var distFilter = function(points, mindist) {
	
		var pts = [];
		var dst = [];
		var total = 0;
		
		pts.push(points[0]);
		
		for (var cur = 1, pre = 0; cur < points.length; cur++) {
			
			var dist = distVincenty(
					points[cur][1], points[cur][0],
					pts[pre][1], pts[pre][0]);
			
			if (mindist == 0 || dist >= mindist) {
				pts.push(points[cur]);
				dst.push(dist);
				total += dist;
				pre += 1;
			}
		}
		
		that.ll = pts;
		that.d = dst;
		that.smooth_total = total;
		
		// the total distance computed here will differ from (be less than)
		// the initial total because some points are discarded, straightening
		// the route and thereby decrease path length. mile markers are placed
		// using the initial distances and thereby remain fixed regardless of
		// route smoothing, so we don't necessarily care that route length varies
	};
	
	var lastpt = pts[0],
		min_lon = lastpt[0],
		max_lon = lastpt[0],
		min_lat = lastpt[1],
		max_lat = lastpt[1],
		rawpoints = [lastpt],
		rawpointcd = [],
		totaldist = 0;
	
	var cd = 0, md = 0, lastmd = 0;
	var marker_objs = [];
	
	for (var i = 1; i < pts.length; i++) {
		
		var rawpt = pts[i];
		
		if (rawpt[0] < min_lon) {
			min_lon = rawpt[0];
		}
		
		if (rawpt[0] > max_lon) {
			max_lon = rawpt[0];
		}
		
		if (rawpt[1] < min_lat) {
			min_lat = rawpt[1];
		}
		
		if (rawpt[1] > max_lat) {
			max_lat = rawpt[1];
		}
		
		rawpoints.push(rawpt);
		
		var segdist = distVincenty(lastpt[1], lastpt[0], rawpt[1], rawpt[0]);
		totaldist += segdist;
		lastpt = rawpt;
		
		// lastmd is marker distance up to but not including this segment
		lastmd = md;
		
		// now md is marker distance including this segment
		md += segdist;
		cd += segdist;
		
		// stash cumulative distance to each raw point
		rawpointcd.push(cd);
		
		// if marker distance including this segment exceeds marker interval, mark!
		if (this.mpermark > 0 && md >= this.mpermark) {
			
			// portion of this segment's length that falls before the marker
			var last_seg = this.mpermark - lastmd;
			
			// portion of this segment's length that falls after the marker
			var next_seg = segdist - last_seg;
			
			// percent along segment from lastpt to rawpt
			var pd = last_seg / segdist;
			
			var markerpoint = [
				lastpt[0] + pd * (rawpt[0] - lastpt[0]),
				lastpt[1] + pd * (rawpt[1] - lastpt[1]),
				lastpt[2] + pd * (rawpt[2] - lastpt[2])
			];
			
			if ((this.pathrange.startm === null || cd >= this.pathrange.startm)
				&& (this.pathrange.stopm === null || cd <= this.pathrange.stopm)) {
				
				// storing the geographic coordinates + cumulative distance;
				// convert to projected coordinates on output
				marker_objs.push({
					loc: markerpoint,
					pos: cd - next_seg,
					seg: i
				});
				
			}
			
			// markseg is, originally, used to cache indices of [projected/scaled]
			// segments surrounding this marker, so that the marker can be oriented
			// along the same vector as that segment. Since our final route may be
			// based on a filtered set of points, the segment we're on now may not
			// be present in the output. So, best to work out the orientation now.
			
			// reset distance to the next marker
			// (starting with remainder of this segment)
			md = next_seg;
		}
	}
	
	this.distance = totaldist;
	
	// some issues with gaps at ends of linear/ring shapes if filtered distance is less
	// than initial distance. Consider using filtered distance... or ratio, not absolute.
	this.ringRadius = this.distance / (Math.PI * 2);
	
	// now that totaldist is known, we can run projectpoints to get actual marker location -
	// and the corresponding vector orientations.
	
	for (var i = 0; i < marker_objs.length; i++) {
		
		this.markers.push(this.ProjectPoint(marker_objs[i].loc, marker_objs[i].pos/this.distance));
		
		var marker_angle = this.vector_angle(
			this.ProjectPoint(rawpoints[marker_objs[i].seg - 1], (rawpointcd[marker_objs[i].seg - 1])/this.distance),
			this.ProjectPoint(rawpoints[marker_objs[i].seg], (rawpointcd[marker_objs[i].seg])/this.distance)
		);
		
		// pushing actual orientation angle to markseg now, not surrounding segment endpoint indices
		this.markseg.push(marker_angle);
		
	}
	
	// actually, hang on; we can store marker locations in geographic form
	// and only call ProjectPoint on them at output time - once total is known.

	// Guestimate viable mindist based on scale if automatic smoothing
	// is enabled and the shape type is route (directional smoothing
	// is not vital for linear/ring shape - but might be faster.)
	if (this.smoothingMode === 0) {
		
		if (this.shape === 0) {
			// track: set scale based on approx route extent
			var min_geo = proj4('GOOGLE', [min_lon, min_lat]);
			var max_geo = proj4('GOOGLE', [max_lon, max_lat]);
			var geo_x = max_geo[0] - min_geo[0];
			var geo_y = max_geo[1] - min_geo[1];
			var scale = this.getScale(geo_x, geo_y);
		}
		else if (this.shape === 1) {
			// linear: set scale based on distance
			var scale = this.getScale(this.distance, 0);
		}
		else if (this.shape === 2) {
			// ring: set scale based on ring radius
			var scale = this.getScale(2 * this.ringRadius, 2 * this.ringRadius);
		}
		
		// Model path buffer (mm) / scale = real world path buffer size (meters);
		// segments representing lengths less than this size are noisy; discard.
		this.minimumDistance = Math.floor(this.buffer / scale);
		
		Messages.status('Automatic interval: ' + this.minimumDistance);
	}
	
	// smooth route by minimum distance filter
	distFilter(rawpoints, this.minimumDistance);
}


// set min/max x/y/z bounds to the given xyz point
Gpex.prototype.InitBounds = function(xyz) {
	this.minx = xyz[0];
	this.maxx = xyz[0];
	this.miny = xyz[1];
	this.maxy = xyz[1];
	this.minz = xyz[2];
	this.maxz = xyz[2];
}

// update min/max x/y/z bounds to include the given xyz point
Gpex.prototype.UpdateBounds = function(xyz) {
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
Gpex.prototype.UpdateExtent = function() {
	this.xextent = this.maxx - this.minx;
	this.yextent = this.maxy - this.miny;
	this.zextent = this.maxz - this.minz;
}

// calculate offsets used to translate model to output origin
Gpex.prototype.UpdateOffset = function() {
	
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

// jacked from http://stackoverflow.com/a/13274361/339879
// ne/se: [lng, lat]
// mapDim: {width: pixels, height: pixels}
function getBoundsZoomLevel(ne, sw, mapDim) {
    var WORLD_DIM = { height: 256, width: 256 };
    //var ZOOM_MAX = 21;

    function latRad(lat) {
        var sin = Math.sin(lat * Math.PI / 180);
        var radX2 = Math.log((1 + sin) / (1 - sin)) / 2;
        return Math.max(Math.min(radX2, Math.PI), -Math.PI) / 2;
    }

	//Math.floor
    function zoom(mapPx, worldPx, fraction) {
        return (Math.log(mapPx / worldPx / fraction) / Math.LN2);
    }

    var latFraction = (latRad(ne[1]) - latRad(sw[1])) / Math.PI;

    var lngDiff = ne[0] - sw[0];
    var lngFraction = ((lngDiff < 0) ? (lngDiff + 360) : lngDiff) / 360;
	
    var latZoom = zoom(mapDim.height, WORLD_DIM.height, latFraction);
    var lngZoom = zoom(mapDim.width, WORLD_DIM.width, lngFraction);
	
	return {
		zoom: latZoom < lngZoom ? Math.floor(latZoom) : Math.floor(lngZoom),
		span: latZoom < lngZoom ? latFraction : lngFraction,
		axis: latZoom < lngZoom ? "height" : "width"
	};
}

// returns true if a basemap is set; returns false if no basemap is set
Gpex.prototype.basemap = function() {
	
	var bedmax = Math.max(this.bedx, this.bedy);
	var mapsize = {
		width:  Math.round(640 * (this.rotate ? this.bedy : this.bedx) / bedmax),
		height: Math.round(640 * (this.rotate ? this.bedx : this.bedy) / bedmax)
	};
	
	var sw = proj4("GOOGLE", "WGS84", [this.minx, this.miny]);
	var ne = proj4("GOOGLE", "WGS84", [this.maxx, this.maxy]);
	var zoominfo = getBoundsZoomLevel(ne, sw, mapsize);
	
	if (zoominfo.zoom > 21) {
		// don't bother with base map if zoom level would be too high
		return false;
	}
	
	var mapscale = mapsize[zoominfo.axis] / 256 / Math.exp(zoominfo.zoom * Math.LN2) / zoominfo.span;
	
	var center = proj4("GOOGLE", "WGS84", [this.xoffset, this.yoffset]);

	var mapurl = "https://maps.googleapis.com/maps/api/staticmap?center=" + center[1].toFixed(6) + "," + center[0].toFixed(6) + "&zoom=" + zoominfo.zoom + "&size=" + mapsize.width + "x" + mapsize.height + "&maptype=terrain&scale=2&format=jpg";
	
	//console.log(mapurl, mapscale, this.bedx * mapscale, this.bedy * mapscale);
	
	OJSCAD.viewer.setBaseMap(mapurl, mapscale, this.rotate);
	
	return true;
}

Gpex.prototype.getScale = function(xextent, yextent) {
	// indent bed extent to accomodate buffer width
	var xbe = this.bedx - (2 * this.buffer),
		ybe = this.bedy - (2 * this.buffer);
	var mmax = Math.max(xextent, yextent),
		mmin = Math.min(xextent, yextent),
		bmax = Math.max(xbe, ybe),
		bmin = Math.min(xbe, ybe),
		fmax = bmax / mmax,
		fmin = bmin / mmin;
	return Math.min(fmax, fmin);
}

Gpex.prototype.getRotate = function() {
	var xbe = this.bedx - (2 * this.buffer),
		ybe = this.bedy - (2 * this.buffer);
	
	// determine whether the model should be rotated to fit
	if ((xbe >= ybe && this.xextent >= this.yextent) ||
		(xbe < ybe && this.xextent < this.yextent)) {
		return false;
	}
	
	return true;
}

// point to project and cumulative distance along path
// distance ratio now, now absolute distance
Gpex.prototype.ProjectPoint = function(point, cdr) {
	var xyz;
	if (this.shape == 1) {
		xyz = PointProjector.linear(point, cdr, this.distance);
	} else if (this.shape == 2) {
		xyz = PointProjector.ring(point, cdr, this.ringRadius);
	} else {
		xyz = PointProjector.mercator(point);
	}
	return xyz;
}

Gpex.prototype.ProjectPoints = function() {
	
	// cumulative distance
	var cd = 0;
	
	// Initialize extents using first projected point.
	var xyz = this.ProjectPoint(this.ll[0], 0);
	this.InitBounds(xyz);
	this.pp.push(xyz);
	
	// should we start at the start?
	if (this.pathrange.startm === null || cd >= this.pathrange.startm) {
		this.pathrange.starti = 0;
	}
	
	// Project the rest of the points, updating extents.
	for (var i = 1; i < this.ll.length; i++) {
		
		cd += this.d[i-1];
		
		xyz = this.ProjectPoint(this.ll[i], cd/this.smooth_total);
		this.UpdateBounds(xyz);
		this.pp.push(xyz);
		
		if (this.pathrange.starti !== null && this.pathrange.stopi === null) {
			// in this case, we've passed the path start point,
			// but haven't yet hit the stop point - so check for it.
			if (this.pathrange.stopm !== null && cd >= this.pathrange.stopm) {
				this.pathrange.stopi = i;
			}
		} else if (this.pathrange.starti === null) {
			// in this case, we haven't yet hit the start point,
			// so check if we have.
			if (cd >= this.pathrange.startm) {
				this.pathrange.starti = i;
			}
		}
	}
	
	// mark stop at the last point if not already stopped
	if (this.pathrange.stopi === null) {
		this.pathrange.stopi = i - 1;
	}
	
	this.UpdateExtent();
	this.UpdateOffset();
	
	this.scale = this.getScale(this.xextent, this.yextent);
	this.rotate = this.getRotate();
}

Gpex.prototype.vector_angle = function(a, b) {
	var dx = b[0] - a[0],
		dy = b[1] - a[1];
	return Math.atan2(dy, dx);
}

/*
 * Given a point array and index of a point,
 * return the angle of the vector from that point
 * to the next. (2D) (If the index is to the last point,
 * return the preceding segment's angle. Point array
 * should have at least 2 points!)
 */
Gpex.prototype.segment_angle = function(i) {
	
	// in case of final point, repeat last segment angle
	if (i + 1 == this.fp.length) {
		return this.segment_angle(i - 1);
	}
	
	// angle between this point and the next
	return this.vector_angle(this.fp[i], this.fp[i + 1]);
}

/*
 * Return a pair of 2D points representing the joints
 * where the buffered paths around the actual segment
 * intersect - segment endpoints offset perpendicular
 * to segment by buffer distance, adjusted for tidy
 * intersection with adjacent segment's buffered path.
 * absa is absolute angle of this segment; avga is the
 * average angle between this segment and the next.
 * (p could be kept as a Gpex property.)
 */
Gpex.prototype.joint_points = function(i, rel, avga) {

	// distance from endpoint to segment buffer intersection
	var jointr = this.buffer/Math.cos(rel/2);
	
	// arbitrary hack to prevent extremely spiky corner artifacts
	// on acute angles. Optimal solution would introduce additional
	// corner points. (As-is, path width is not maintained here.)
	
	if (Math.abs(jointr) > this.buffer * 2) {
		jointr = Math.sign(jointr) * this.buffer * 2;
	}
	
	// joint coordinates (endpoint offset at bisect angle by jointr)
	var	lx = this.fp[i][0] + jointr * Math.cos(avga + Math.PI/2),
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
Gpex.prototype.process_path = function() {
	
	var acuteAngle = function(angle) {
		if ((Math.abs(angle) > Math.PI/2) && (Math.abs(angle) < (3 * Math.PI)/2)) {
			return true;
		}
		return false;
	};
	
	var last_angle = undefined,
		angle = undefined,
		rel_angle = undefined,
		joint_angle = undefined,
		pp = undefined,
		vertices = [],
		faces = [];
		
	// s is segment counter used for calculating face indices; it is
	// managed separately from i in case we skip any acute/noisy segment
	for (
			var i = this.pathrange.starti, s = 0;
			i < this.fp.length, i <= this.pathrange.stopi;
			i++
	) {
		
		angle = this.segment_angle(i);
				
		if (i == this.pathrange.starti) {
			
			// first point
			//console.log('first', i, this.fp[i], angle);
			// "// translate([" + this.fp[i][0] + ", " + this.fp[i][1] + ", " + this.fp[i][2] + "]) rotate([0, 0, " + angle + "])\n";
			
			if (i == 0) {
				last_angle = angle;
			} else {
				last_angle = this.segment_angle(i-1);
			}
		}
		
		rel_angle = angle - last_angle;
		joint_angle = rel_angle / 2 + last_angle;
		
		// Collapse series of acute angle segments into a single cusp. Disabled
		// at path cut point to ensure final face is oriented naturally.
		if (i < this.pathrange.stopi
			&& acuteAngle(rel_angle)
			&& (i < this.fp.length - 1)
			&& acuteAngle(this.segment_angle(i + 1) - angle)) {
			
			// by continuing, we add no points or faces to the model,
			// and do not update last_angle - it remains pointing at
			// whatever it did before we hit this weird acute segment
			continue;
		}
		
		pp = this.joint_points(i, rel_angle, joint_angle);
		
		// next four points of segment polyhedron
		PathSegment.points(vertices, pp, this.fp[i][2]);
		
		// faces connecting first four points to last four of segment
		// if s == 0, default to first_face behavior
		PathSegment.faces(faces, s);
		s = s + 1;
		last_angle = angle;
	}
	
	// last point: i-1
	//console.log('last', i-1, this.fp[i-1], angle);
	//"// translate([" + this.fp[i-1][0] + ", " + this.fp[i-1][1] + ", " + this.fp[i-1][2] + "]) rotate([0, 0, " + angle + "])\n";

	// final endcap
	PathSegment.last_face(faces, s);
	
	// generate array of point vector SCAD strings
	this.model_points = vertices.map(function(v) {
		return "[" + v[0].toFixed(4) + ", " + v[1].toFixed(4) + ", " + v[2].toFixed(4) + "]";
	});
	
	// generate array of face list SCAD strings
	this.model_faces = faces.map(function(v) {
		return "[" + v[0] + ", " + v[1] + ", " + v[2] + "]";
	});
	
	
}

// set these code generators up as objects that can keep track of whether
// they need to include "CSG.", etc, rather than passing this boolean dl param around
Gpex.prototype.jscad_marker = function(i) {
	var x = this.markers[i][0],
		y = this.markers[i][1],
		z = this.markers[i][2],
		
		// angle between this the projected/scaled/centered points comprising the segment
		// along which this marker lies.
		//t = this.vector_angle(this.fp[this.markseg[i][0]], this.fp[this.markseg[i][1]]);
		t = this.markseg[i] * 180/Math.PI;

	return "marker([" + x + ", " + y + "], " + t + ", " + z + ")";

}

// returns jscad function for markers
Gpex.prototype.jscad_markers = function(dl) {
	
	// return empty string if markers are disabled
	if (this.mpermark <= 0 || this.markers.length == 0) {
		return "";
	}
	
	var markers = [];
	for (var i = 0; i < this.markers.length; i++) {
		markers.push(this.jscad_marker(i));
	}
	
	var jscad = markers[0] + markers.slice(1).map(function(s) {
		return ".union(" + s + ")";
	}).join("");
		
	if (this.rotate) {
		jscad += ".rotateZ(90)";
	}
	
	if (dl == true) {
		var markerfunc = "function marker(position, orientation, height) {\n\
	var z = height + 2;\n\
	return cube({size: [1, " + (2 * this.buffer + 2) + ", z], center: true}).rotateZ(orientation).translate([position[0], position[1], z/2]);\n\
}\n";
	} else {
		var markerfunc = "function marker(position, orientation, height) {\n\
	var z = height + 2;\n\
	return CSG.cube({radius: [1, " + (2 * this.buffer + 2) + ", z/2], center: [0, 0, 0]}).rotateZ(orientation).translate([position[0], position[1], z/2]);\n\
	}\n";
	}
	
	return markerfunc + "function markers() {\nreturn " + jscad + ";\n}\n\n";
}

// returns jscad function for profile
Gpex.prototype.jscad_profile = function(dl) {
	var jscad = (dl == true ? "" : "CSG.") + "polyhedron({points:[\n" +
			this.model_points.join(",\n") + "\n],\n" +
			(dl == true ? "triangles" : "faces") + ":[\n" +
			this.model_faces.join(",\n") + "\n]})";
	
	if (this.rotate) {
		jscad += ".rotateZ(90)";
	}
	
	return "function profile() {\nreturn " + jscad + ";\n}\n\n";
}

// dl = download version (webgl jscad is not openjscad.org compatible)
Gpex.prototype.jscad_assemble = function(dl) {
	var jscad = this.jscad_profile(dl);
	
	if (this.markers.length > 0 && this.mpermark > 0) {
		jscad += this.jscad_markers(dl);
	}
	
	if (dl == true) {
		var um = (this.mpermark > 0 && this.markers.length > 0 ? ".union(markers())" : "");
		var mainf = "function main() {\nreturn profile()" + um + ";\n}\n";
	} else {
		var models = ["{name: 'profile', caption: 'Profile', data: profile()}"];
		
		if (this.mpermark > 0 && this.markers.length > 0) {
			models.push("{name: 'markers', caption: 'Markers', data: markers()}");
		}
		
		var mainf = "function main() {\nreturn [" + models.join(',') + "];\n}\n";
	}
	
	return jscad + mainf;
}

Gpex.prototype.oscad_assemble = function() {
	var openscad = "module profile() {\npolyhedron(points=[\n" + this.model_points.join(",\n") + "\n],\nfaces=[\n" + this.model_faces.join(",\n") + "\n]);\n}\n";

	if (this.mpermark > 0 && this.markers.length > 0) {
		openscad += this.oscad_markers();
		openscad += "markers();\n";
	}
	
	openscad += "profile();\n";
	return openscad;
}

Gpex.prototype.oscad_markers = function() {
	var m = [];
	for (var i = 0; i < this.markers.length; i++) {
		m.push(this.oscad_marker(i));
	}
	
	return "module marker(position, orientation, height) {\n\
	assign(z=height+2) {\n\
	translate([position[0], position[1], z/2])\n\
	rotate([0, 0, orientation])\n\
	cube(size=[1, " + (2*this.buffer + 2) + ", z], center=true);\n\
}}\n\n\
module markers() {\n\
	union() {\n" + m.join("\n") + "}\n}\n";
}

Gpex.prototype.oscad_marker = function(i) {
	var x = this.markers[i][0],
		y = this.markers[i][1],
		z = this.markers[i][2],
		t = this.markseg[i] * 180/Math.PI;
	return "marker([" + x + ", " + y + "], " + t + ", " + z + ");"
}

var PathSegment = {
	
	// Corner points of quad perpendicular to path 
	points: function(a, v, z) {
		
		// lower left
		a.push([v[0][0], v[0][1], 0]);
		
		// lower right
		a.push([v[1][0], v[1][1], 0]);
		
		// upper left
		a.push([v[0][0], v[0][1], z]);
		
		// upper right
		a.push([v[1][0], v[1][1], z]);
	},
	
	// Initial endcap face
	first_face: function(a) {
		a.push([0, 2, 3]);
		a.push([3, 1, 0]);
	},
	
	// Final endcap face; s is segment index
	last_face: function(a, s) {
		
		// i is index of first corner point of segment
		var i = (s - 1) * 4;
		
		a.push([i + 2, i + 1, i + 3]);
		a.push([i + 2, i + 0, i + 1]);
	},
	
	// Path segment faces; s is segment index
	faces: function(a, s) {
		
		if (s == 0) {
			this.first_face(a);
			return;
		}
		
		// i is index of first corner point of segment
		var i = (s - 1) * 4;
		
		// top face
		a.push([i + 2, i + 6, i + 3]);
		a.push([i + 3, i + 6, i + 7]);
		
		// left face
		a.push([i + 3, i + 7, i + 5]);
		a.push([i + 3, i + 5, i + 1]);
		
		// right face
		a.push([i + 6, i + 2, i + 0]);
		a.push([i + 6, i + 0, i + 4]);
		
		// bottom face
		a.push([i + 0, i + 5, i + 4]);
		a.push([i + 0, i + 1, i + 5]);
	}
	
};

// returns a scaled and centered output unit [x, y, z] vector from input [x, y, z] Projected vector
Gpex.prototype.pxyz = function(v) {
	return [
			this.scale * (v[0] - this.xoffset),
			this.scale * (v[1] - this.yoffset),
			this.scale * (v[2] - this.zoffset) * this.vertical + this.base
	];
}

// Rudimentary GPX parsing based on https://github.com/peplin/gpxviewer/
var Parser = {
	
	// Parse GPX file, starting with tracks
	file: function(content) {
		var tracks = content.documentElement.getElementsByTagName('trk');
		if (tracks.length === 0) {
			Messages.error("This file does not appear to contain any tracks.<br />(Are you sure it is a GPX file?)");
			return null;
		}
		// Note: only the first track is used
		return this.track(tracks[0]);
	},
	
	track: function(track) {
		var segments = track.getElementsByTagName('trkseg');
		if (segments.length === 0) {
			Messages.error("This file does not appear to contain any track segments.<br />(Are you sure it is a valid GPX file?)");
			return null;
		}
		// Note: only the first segment is used
		return this.segment(segments[0]);
	},
	
	segment: function(segment) {
		var trkpts = segment.getElementsByTagName('trkpt');
		if (trkpts[0].getElementsByTagName('ele').length === 0) {
			Messages.error('This GPX file does not appear to contain any elevation data.<br />Try using <a href="http://www.gpsvisualizer.com/elevation">GPX Visualizer</a> to add elevation data to your route.');
			return null;
		}
		
		// Convert GPX XML trkpts to lon/lat/ele vectors
		// No processing is done at this point.
		var pts = [];
		for (var i = 0; i < trkpts.length; i++) {
			pts.push(this.point(trkpts[i]));
		}
		
		return pts;
	},
	
	// Returns numeric [lon, lat, ele] vector from GPX track point
	point: function(pt) {
		return [
			parseFloat(pt.getAttribute('lon')),
			parseFloat(pt.getAttribute('lat')),
			parseFloat(pt.getElementsByTagName('ele')[0].innerHTML)
		];
	}
};

/*
 * Point Projection Methods
 * 
 * Parameters:
 *  v, a 3-element vector [longitude, latitude, elevation]
 *  distRatio, ratio of point position to path length
 *  total, of path length
 *  radius, of ring, supposing circumference is path length
 * 
 * Return Value:
 *  a 3-element vector [x, y, z] (meters)
 */
var PointProjector = {
	
	linear: function(v, distRatio, total) {
		return [0, distRatio * total, v[2]];
	},
	
	ring: function(v, distRatio, radius) {
		return [
			radius * Math.cos(2 * Math.PI * distRatio),
			radius * Math.sin(2 * Math.PI * distRatio),
			v[2]
		];
	},
	
	mercator: function(v) {
		return proj4('GOOGLE', [v[0], v[1]]).concat(v[2]);
	}
};

var Messages = {
	msgdiv: null,
	
	clear: function() {
		this.msgdiv.innerHTML = "";
		this.msgdiv.className = "";
	},
	
	error: function(message) {
		this.msgdiv.innerHTML = message;
		this.msgdiv.className = "errormsg";
		var that = this;
		this.msgdiv.onclick = function(e) {
			that.clear();
		};
	},
	
	status: function(message) {
		this.msgdiv.innerHTML = message;
		this.msgdiv.className = "statusmsg";
		var that = this;
		this.msgdiv.onclick = function(e) {
			that.clear();
		};
	}
};
