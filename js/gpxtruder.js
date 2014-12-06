var OJSCAD = undefined;

var setup = function() {
	
	var radioValue = function(radios) {
		for (var i = 0, len = radios.length; i < len; i++) {
			if (radios[i].checked) {
				return parseInt(radios[i].value);
				break;
			}
		}
		return undefined;
	};
	
	var markerInterval = function(markerType, markerSpan) {
		if (markerType === 0) {
			// no markers
			return 0;
		} else if (markerType === 1) {
			// kilometers
			return 1000;
		} else if (markerType === 2) {
			// miles
			return 1609;
		}
		return markerSpan;
	};
	
	// returns true if options are valid, false otherwise
	var validOptions = function(options) {
		
		if (!isFinite(options.vertical) || options.vertical < 1) {
			Messages.error("Vertical exaggeration must be greater than or equal to 1.");
			return false;
		}
		
		if (!isFinite(options.smoothspan) || options.smoothspan < 0) {
			Messages.error("Minimum smoothing interval must be greater than or equal to 0.");
			return false;
		}
		
		if (!isFinite(options.markerInterval) || options.markerInterval < 0) {
			Messages.error("Marker interval must be greater than or equal to 1.");
			return false;
		}
		
		if (!isFinite(options.bedx) || options.bedx < 20) {
			Messages.error("Bed width must be greater than or equal to 20.");
			return false;
		}
		
		if (!isFinite(options.bedy) || options.bedy < 20) {
			Messages.error("Bed height must be greater than or equal to 20.");
			return false;
		}
		
		if (!isFinite(options.buffer) || options.buffer < 0.5) {
			Messages.error("Path width must be greater than or equal to 1.");
			return false;
		}
		
		if (!isFinite(options.base) || options.base < 0) {
			Messages.error("Base height must be greater than or equal to 0.");
			return false;
		}
		
		return true;
	};
	
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
			
			var form = ev.target;
			var options = {
				buffer:         parseFloat(form.path_width.value) / 2.0,
				vertical:       parseFloat(form.vertical.value),
				bedx:           parseFloat(form.width.value),
				bedy:           parseFloat(form.depth.value),
				base:           parseFloat(form.base.value),
				zcut:           form.zcut.checked,
				shapetype:      radioValue(form.shape),
				markerInterval: markerInterval(radioValue(form.marker), parseFloat(form.marker_interval.value)),
				smoothtype:     radioValue(form.smooth),
				smoothspan:     parseFloat(form.mindist.value),
				jscadDiv:       document.getElementById('code_jscad'),
				oscadDiv:       document.getElementById('code_openscad')
			};
			
			if (!validOptions(options)) {
				return;
			}
			
			// Assign a local URL to the file selected for upload
			// https://developer.mozilla.org/en-US/docs/Web/API/URL.createObjectURL
			//var upload_url = window.URL.createObjectURL(document.getElementById('gpxfile').files[0]);
			
			var upload_url = "/SouthMtn.gpx";
			loader(options, upload_url);
			
			//window.URL.revokeObjectURL(upload_url);
		},
		false
	);
}

var loader = function(options, gpx_url) {
		
	Messages.clear();
	
	var req = new XMLHttpRequest();
	req.onreadystatechange = function() {
		if (req.readyState === 4) {
			
			if (!req.responseXML) {
				Messages.error("This doesn't appear to be a GPX file.");
				return;
			}
			
			// Attempt to parse response XML as a GPX file.
			var pts = Parser.file(req.responseXML);
			if (pts === null) {
				return;
			}
			
			// If all is well, proceed to extrude the GPX path.
			new Gpex(options, pts);
		}
	}
	
	// submit asynchronous request for the GPX file
	req.open('GET', gpx_url, true);
	req.send();
}

// use a tidier options object
function Gpex(options, pts) {
	
	// read-only configuration
	this.options = options;
	
	// available bed extent
	this.bed = {
		x: this.options.bedx - (2 * this.options.buffer),
		y: this.options.bedy - (2 * this.options.buffer)
	};
	
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
	this.smooth_total = 0;
	
	// array of projected x/y/z vectors (meters) (pp = projected points)
	this.pp = [];
	
	// array of scaled/centered/z-cut x/y/z vectors (fp = final points)
	this.fp = [];
	
	// array of marker objects. Members include location vector and orientation.
	this.markers = [];
	
	// orientation of each marker (aligned with initial segment along which it lies)
	//this.markseg = [];
	
	this.Display(this.Extrude(pts));
}

Gpex.prototype.Extrude = function(pts) {
		
	// populates this.ll (lat/lon vectors)
	this.ScanPoints(pts);
	
	// populates this.pp (projected point vectors)
	this.ProjectPoints();
	
	// scale/center projected point vectors
	this.fp = this.pp.map(this.pxyz, this);
	
	// scale/center markers (overwriting originals)
	// can't do this at the time markers is initially populated
	// because we don't have scale/offset until ProjectPoints
	//this.markers = this.markers.map(this.pxyz, this);
	this.markers = this.markers.map(function(m) {
		return {
			location: this.pxyz(m.location),
			orientation: m.orientation
		};
	}, this);
	
	// return output geometry code
	return this.process_path();
}

Gpex.prototype.Display = function(code) {
	
	// Tweak preview display if available
	if (OJSCAD.viewer) {
		OJSCAD.viewer.setBedSize(this.options.bedx, this.options.bedy);
		
		// Attempt to retrieve a basemap on two conditions:
		// track shape is selected and zoom level is reasonable
		if (!(this.options.shapetype === 0 && this.basemap())) {
			OJSCAD.viewer.clearBaseMap(this.rotate);
		}
	}
	
	// Update the preview display (required to prepare STL export,
	// even if WebGL is not available to display the preview)
	OJSCAD.setJsCad(code.jscad(true));
	
	// Display code for custom usage
	this.options.jscadDiv.innerHTML = code.jscad(false);
	this.options.oscadDiv.innerHTML = code.oscad();
	
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
		if (this.options.markerInterval > 0 && md >= this.options.markerInterval) {
			
			// portion of this segment's length that falls before the marker
			var last_seg = this.options.markerInterval - lastmd;
			
			// portion of this segment's length that falls after the marker
			var next_seg = segdist - last_seg;
			
			// percent along segment from lastpt to rawpt
			var pd = last_seg / segdist;
			
			var markerpoint = [
				lastpt[0] + pd * (rawpt[0] - lastpt[0]),
				lastpt[1] + pd * (rawpt[1] - lastpt[1]),
				lastpt[2] + pd * (rawpt[2] - lastpt[2])
			];
			
			// storing the geographic coordinates + cumulative distance;
			// convert to projected coordinates on output
			marker_objs.push({
				loc: markerpoint,
				pos: cd - next_seg,
				seg: i
			});
			
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
				
		var marker_angle = vector_angle(
			this.ProjectPoint(rawpoints[marker_objs[i].seg - 1], (rawpointcd[marker_objs[i].seg - 1])/this.distance),
			this.ProjectPoint(rawpoints[marker_objs[i].seg], (rawpointcd[marker_objs[i].seg])/this.distance)
		);
				
		this.markers.push({
			location: this.ProjectPoint(marker_objs[i].loc, marker_objs[i].pos/this.distance),
			orientation: marker_angle
		});
	}
	
	var smoothing_distance = this.options.smoothspan;

	// Guestimate viable mindist based on scale if automatic smoothing
	// is enabled and the shape type is route (directional smoothing
	// is not vital for linear/ring shape - but might be faster.)
	if (this.options.smoothtype === 0) {
		
		if (this.options.shapetype === 0) {
			// track: set scale based on approx route extent
			var min_geo = proj4('GOOGLE', [min_lon, min_lat]);
			var max_geo = proj4('GOOGLE', [max_lon, max_lat]);
			var geo_x = max_geo[0] - min_geo[0];
			var geo_y = max_geo[1] - min_geo[1];
			var scale = Scale(this.bed, geo_x, geo_y);
		}
		else if (this.options.shapetype === 1) {
			// linear: set scale based on distance
			var scale = Scale(this.bed, this.distance, 0);
		}
		else if (this.options.shapetype === 2) {
			// ring: set scale based on ring radius
			var scale = Scale(this.bed, 2 * this.ringRadius, 2 * this.ringRadius);
		}
		
		// Model path buffer (mm) / scale = real world path buffer size (meters);
		// segments representing lengths less than this size are noisy; discard.
		smoothing_distance = Math.floor(this.options.buffer / scale);
	}
	
	// smooth route by minimum distance filter
	distFilter(rawpoints, smoothing_distance);
}

var Bounds = function(xyz) {
	this.minx = xyz[0];
	this.maxx = xyz[0];
	this.miny = xyz[1];
	this.maxy = xyz[1];
	this.minz = xyz[2];
	this.maxz = xyz[2];
}

Bounds.prototype.Update = function(xyz) {
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

// returns offset vector to translate model to output origin
// zcut is boolean indicating whether to trim at min z or not
var Offsets = function(bounds, zcut) {
	
	// xy offset used to center model around origin
	var xoffset = (bounds.minx + bounds.maxx) / 2;
	var yoffset = (bounds.miny + bounds.maxy) / 2;
	
	// zero z offset uses full height above sea level
	// disabled if minimum elevation is at or below 0
	if (zcut == false && bounds.minz > 0) {
		var zoffset = 0;
	} else {
		// by default, z offset is calculated to cut
		// the elevation profile just below minimum
		var zoffset = Math.floor(bounds.minz - 1);
	}
	
	return [xoffset, yoffset, zoffset];
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
Gpex.prototype.basemap = function(bounds) {
	
	var bedmax = Math.max(this.options.bedx, this.options.bedy);
	
	var bedwidth = this.rotate ? this.options.bedy : this.options.bedx;
	var bedheight = this.rotate ? this.options.bedx : this.options.bedy;
	
	var mapsize = {
		width:  Math.round(640 * bedwidth / bedmax),
		height: Math.round(640 * bedheight / bedmax)
	};
	
	var sw = proj4("GOOGLE", "WGS84", [this.bounds.minx, this.bounds.miny]);
	var ne = proj4("GOOGLE", "WGS84", [this.bounds.maxx, this.bounds.maxy]);
	var zoominfo = getBoundsZoomLevel(ne, sw, mapsize);
	
	if (zoominfo.zoom > 21) {
		// don't bother with base map if zoom level would be too high
		return false;
	}
	
	var mapscale = mapsize[zoominfo.axis] / 256 / Math.exp(zoominfo.zoom * Math.LN2) / zoominfo.span;
	
	var center = proj4("GOOGLE", "WGS84", [this.offset[0], this.offset[1]]);

	var mapurl = "https://maps.googleapis.com/maps/api/staticmap?center=" + center[1].toFixed(6) + "," + center[0].toFixed(6) + "&zoom=" + zoominfo.zoom + "&size=" + mapsize.width + "x" + mapsize.height + "&maptype=terrain&scale=2&format=jpg&key=AIzaSyBMTdBdNXMyAWYU8Sn4dt4WYtsf5lqvldA";
	
	OJSCAD.viewer.setBaseMap(mapurl, mapscale, this.rotate, bedwidth, bedheight);
	
	//console.log(mapurl, mapscale);
	
	return true;
}

/*
 * w & h are mm dimensions of bed extent
 * scale applied to bed extent to get map extent
 */
function prepmap(img, scale, w, h) {
	
	var canvas = document.createElement("canvas");
	canvas.width = img.width;
	canvas.height = img.height;
	
	var context = canvas.getContext("2d");
	context.drawImage(img, 0, 0);
	
	var mapw = scale * w;
	var maph = scale * h;
	
	var imgDataURL = canvas.toDataURL("image/jpeg");

	var pdfdoc = new jsPDF({
		orientation: mapw > maph ? 'l' : 'p',
		format: [mapw, maph]
	});
	
	
	pdfdoc.addImage(imgDataURL, 'JPEG', 0, 0, mapw, maph);
	pdfdoc.setDrawColor(26, 26, 26);
	pdfdoc.rect(mapw/2 - w/2, maph/2 - h/2, w, h);
	pdfdoc.save('basemap.pdf');
}

// Return scale factor necessary to fit extent to bed, disregarding rotation
var Scale = function(bed, xextent, yextent) {
	var mmax = Math.max(xextent, yextent),
		mmin = Math.min(xextent, yextent),
		bmax = Math.max(bed.x, bed.y),
		bmin = Math.min(bed.x, bed.y),
		fmax = bmax / mmax,
		fmin = bmin / mmin;
	return Math.min(fmax, fmin);
}

// Return boolean whether the model should be rotated to fit bed
var Rotate = function(bed, xextent, yextent) {
	if ((bed.x >= bed.y && xextent >= yextent) ||
		(bed.x < bed.y && xextent < yextent)) {
		return false;
	}	
	return true;
}

// point to project and cumulative distance along path
// distance ratio now, now absolute distance
Gpex.prototype.ProjectPoint = function(point, cdr) {
	var xyz;
	if (this.options.shapetype == 1) {
		xyz = PointProjector.linear(point, cdr, this.distance);
	} else if (this.options.shapetype == 2) {
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
	this.bounds = new Bounds(xyz);
	this.pp.push(xyz);
	
	// Project the rest of the points, updating extents.
	for (var i = 1; i < this.ll.length; i++) {
		
		cd += this.d[i-1];
		
		xyz = this.ProjectPoint(this.ll[i], cd/this.smooth_total);
		this.bounds.Update(xyz);
		this.pp.push(xyz);
	}
	
	var xextent = this.bounds.maxx - this.bounds.minx;
	var yextent = this.bounds.maxy - this.bounds.miny;
	this.offset = Offsets(this.bounds, this.options.zcut);
	this.scale = Scale(this.bed, xextent, yextent);
	this.rotate = Rotate(this.bed, xextent, yextent);
}

var vector_angle = function(a, b) {
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
	return vector_angle(this.fp[i], this.fp[i + 1]);
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
	var jointr = this.options.buffer/Math.cos(rel/2);
	
	// arbitrary hack to prevent extremely spiky corner artifacts
	// on acute angles. Optimal solution would introduce additional
	// corner points. (As-is, path width is not maintained here.)
	
	if (Math.abs(jointr) > this.options.buffer * 2) {
		jointr = Math.sign(jointr) * this.options.buffer * 2;
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
	for (var i = 0, s = 0; i < this.fp.length; i++) {
		
		angle = this.segment_angle(i);
		if (i === 0) {
			last_angle = angle;
		}
		
		rel_angle = angle - last_angle;
		joint_angle = rel_angle / 2 + last_angle;
		
		// Collapse series of acute angle segments into a single cusp.
		if (acuteAngle(rel_angle)
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
	
	// final endcap
	PathSegment.last_face(faces, s);
	
	// Package results in a code object and pass it back to caller
	return new Code(vertices, faces, this.markers, {rotation: this.rotate, markerWidth: 2 * this.options.buffer + 2});
}

/*
 * SCAD Code
 * 
 * Input:
 * - points
 * - faces
 * - markers
 * - options = {
 *    rotate: // boolean; indicates whether model should be rotated to fit bed
 *    markerWidth: // used to size interval markers
 *   }
 * 
 */
var Code = function(points, faces, markers, options) {

	// Compose points as a SCAD-ready string of vertex vectors
	this.points = points.map(function(v) {
		return "[" + v[0].toFixed(4) + ", " + v[1].toFixed(4) + ", " + v[2].toFixed(4) + "]";
	}).join(",\n");
	
	// Compose faces as a SCAD-ready string of face index vectors 
	this.faces = faces.map(function(v) {
		return "[" + v[0] + ", " + v[1] + ", " + v[2] + "]";
	}).join(",\n");
	
	// Compose markers as a list of strings; each is a call to the SCAD marker() module.
	this.markers = markers.map(function(marker) {
		return "marker([" + marker.location[0] + ", " + marker.location[1] + "], " + (marker.orientation * 180/Math.PI) + ", " + marker.location[2] + ")";
	});
	
	this.options = options;
}

// preview mode: boolean; openjscad.js (built-in preview) and openjscad.org (external) use different dialects.
Code.prototype.jscad = function(preview) {
		
	var models = ["{name: 'profile', caption: 'Profile', data: profile()}"];
	
	// profile
	
	var result = "function profile() {\nreturn ";
	
	if (preview) {
		result += "CSG.polyhedron({points:[\n" + this.points + "\n],\nfaces:[\n" + this.faces + "\n]})";
	} else {
		result += "polyhedron({points:[\n" + this.points + "\n],\ntriangles:[\n" + this.faces + "\n]})";
	}
	
	if (this.options.rotation) {
		result += ".rotateZ(90)";
	}
	
	result += ";\n}\n\n";
	
	// markers
	
	if (this.markers.length > 0) {
		
		// first one plus concatenate rest in union()
		var m = this.markers[0] + this.markers.slice(1).map(function(s) {
			return ".union(" + s + ")";
		}).join("");
		
		if (this.options.rotation) {
			m += ".rotateZ(90)";
		}
		
		if (preview) {
			result += "function marker(position, orientation, height) {\nvar z = height + 2;\n" +
				"return CSG.cube({radius: [1, " + this.options.markerWidth + ", z/2], center: [0, 0, 0]})" +
				".rotateZ(orientation).translate([position[0], position[1], z/2]);\n}\n";
		} else {
			result += "function marker(position, orientation, height) {\nvar z = height + 2;\n" +
				"return cube({size: [1, " + this.options.markerWidth + ", z], center: true})" +
				".rotateZ(orientation).translate([position[0], position[1], z/2]);\n}\n";
		}
		
		result += "function markers() {\nreturn " + m + ";\n}\n\n";
		
		models.push("{name: 'markers', caption: 'Markers', data: markers()}");
	}

	if (preview) {
		result += "function main() {\nreturn [" + models.join(',') + "];\n}\n";
	} else {
		result += "function main() {\nreturn profile()" + (this.markers.length > 0 ? ".union(markers())" : "") + ";\n}\n";
	}
	
	return result;
}

Code.prototype.oscad = function() {
	
	var result = "module profile() {\npolyhedron(points=[\n" + this.points + "\n],\nfaces=[\n" + this.faces + "\n]);\n}\n\n";
	
	if (this.markers.length > 0) {
		result += "module marker(position, orientation, height) {\n" +
			"	assign(z=height+2) {\n" +
			"	translate([position[0], position[1], z/2])\n" +
			"	rotate([0, 0, orientation])\n" +
			"	cube(size=[1, " + this.options.markerWidth + ", z], center=true);\n}}\n\n";
		result += "module markers() {\n\tunion() {\n\t\t" + this.markers.join(";\n\t\t") + ";\n\t}\n}\n\n";
		result += "markers();\n";
	}
	
	result += "profile();\n";
	return result;
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
			this.scale * (v[0] - this.offset[0]),
			this.scale * (v[1] - this.offset[1]),
			this.scale * (v[2] - this.offset[2]) * this.options.vertical + this.options.base
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
	
	clear: function(msgElement) {
		if (typeof msgElement === 'undefined') {
			var j = this.msgdiv.children.length;
			for (var i = 0; i < j; i++) {
				this.msgdiv.removeChild(this.msgdiv.children[0]);
			}
		} else {
			this.msgdiv.removeChild(msgElement);
		}
	},
	
	error: function(text) {
		this.message(text, "errormsg");
	},
	
	status: function(text) {
		this.message(text, "statusmsg");
	},
	
	message: function(text, type) {
		var that = this;
		var msg = document.createElement("div");
		msg.innerHTML = text;
		msg.className = "msg " + type;
		msg.onclick = function(e) {
			that.clear(e.target);
		};
		
		this.msgdiv.appendChild(msg);
	}
};
