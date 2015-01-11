// may be able to de-globalize this
var OJSCAD = null;

/*
 * Invoked when the page is loaded.
 */
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
	
	// submitInput is invoked directly by the Extrude button's
	// onclick method, but listen for stray submit events anyway.
	document.forms[0].addEventListener(
		'submit',
		function(e) {
			e.preventDefault();
			submitInput();
			return false;
		},
		false
	);
};

/*
 * Invoked when the "Extrude Route" button is clicked.
 * Validates options and initiates loading of GPX file.
 */
var submitInput = function() {
	
	var radioValue = function(radios) {
		for (var i = 0, len = radios.length; i < len; i++) {
			if (radios[i].checked) {
				return parseInt(radios[i].value);
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
	
	var composeProjection = function(projType, utmZone, utmHemi, custom) {
		if (projType === 1) {
			return custom;
		} else if (projType === 2) {
			return "+proj=utm +zone=" + utmZone + (utmHemi == 1 ? " +south" : "") + " +ellps=WGS84 +datum=WGS84 +units=m +no_defs";
		}
		return "GOOGLE";
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
		
		if (options.zoverride && (!isFinite(options.zconstant) || options.zconstant <= 0)) {
			Messages.error("Constant elevation must be greater than 0.");
			return false;
		}
		
		if (!isFinite(options.base) || options.base < 0) {
			Messages.error("Base height must be greater than or equal to 0.");
			return false;
		}
		
		// Additional sanity checking could be applied to extents.
		if (options.regionfit && (
				!isFinite(options.region_minx) || 
				!isFinite(options.region_maxx) ||
				!isFinite(options.region_miny) ||
				!isFinite(options.region_maxy))) {
			Messages.error("Invalid region extents.");
			return false;
		}
		
		if (options.projection === "") {
			Messages.error("Undefined map projection.");
			return false;
		}
		
		try {
			PointProjector.init(options.projection);
		} catch(err) {
			Messages.error("Unrecognized map projection.");
			return false;
		}
		
		return true;
	};
	
	var form = document.forms[0];
	var options = {
		buffer:         parseFloat(form.path_width.value) / 2.0,
		vertical:       parseFloat(form.vertical.value),
		bedx:           parseFloat(form.width.value),
		bedy:           parseFloat(form.depth.value),
		base:           parseFloat(form.base.value),
		zcut:           form.zoverride.checked ? false : form.zcut.checked,
		zoverride:      form.zoverride.checked,
		zconstant:      parseFloat(form.zconstant.value),
		regionfit:      form.regionfit.checked,
		region_minx:    parseFloat(form.east_min.value),
		region_maxx:    parseFloat(form.east_max.value),
		region_miny:    parseFloat(form.north_min.value),
		region_maxy:    parseFloat(form.north_max.value),
		shapetype:      radioValue(form.shape),
		projection:     composeProjection(radioValue(form.proj_type), form.utm_zone.value, form.utm_hemisphere.value, form.projection.value),
		markerInterval: markerInterval(radioValue(form.marker), parseFloat(form.marker_interval.value)),
		smoothtype:     radioValue(form.smooth),
		smoothspan:     parseFloat(form.mindist.value),
		jscadDiv:       document.getElementById('code_jscad'),
		oscadDiv:       document.getElementById('code_openscad')
	};
	
	if (!validOptions(options)) {
		return;
	}
	
	var upload_url = null;
	if (radioValue(form.gpxsource) === 0) {
		// Assign a local URL to the file selected for upload
		// https://developer.mozilla.org/en-US/docs/Web/API/URL.createObjectURL
		var files = document.getElementById('gpxfile').files;
		if (files.length === 0) {
			Messages.error('No GPX file selected.');
			return;
		}
		upload_url = window.URL.createObjectURL(files[0]);
	} else {
		if (parseInt(form.gpxsample.value) === 0) {
			upload_url = "gpx/SouthMtn.gpx";
		} else if (parseInt(form.gpxsample.value) === 1) {
			upload_url = "gpx/VXX.gpx";
		} else {
			return;
		}
	}
	
	loader(options, upload_url);
	
	if (radioValue(form.gpxsource) === 0) {
		window.URL.revokeObjectURL(upload_url);
	}
};

/*
 * Invoked by submitInput (above) if options look reasonable.
 * Issues an XMLHttpRequest to load the route GPX file.
 * The onreadystatechange handler initiates parsing and display.
 */
var loader = function(options, gpx_url) {
	
	Messages.clear();
	
	var req = new XMLHttpRequest();
	req.onreadystatechange = function() {
		if (req.readyState === 4 /*&& req.status == 200*/) {
			
			if (!req.responseXML) {
				Messages.error("This doesn't appear to be a GPX file.");
				return;
			}
			
			// Attempt to parse response XML as a GPX file.
			var pts = Parser.file(req.responseXML, options.zoverride ? options.zconstant : null);
			if (pts === null) {
				return;
			}
			
			// If all is well, proceed to extrude the GPX path.
			g = new Gpex(options, pts);
		}
	};
	
	// submit asynchronous request for the GPX file
	req.open('GET', gpx_url, true);
	req.overrideMimeType("text/xml");
	req.send();
};

// use a tidier options object
function Gpex(options, pts) {
	
	// read-only configuration
	this.options = options;
	
	this.basemap = new Basemap(OJSCAD.viewer);
	
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
	
	// array of projected x/y/z vectors (meters)
	this.projected_points = [];
	
	// array of scaled/centered/z-cut x/y/z vectors (mm)
	this.output_points = [];
	
	// array of marker objects. Members include location vector and orientation.
	this.markers = [];
	
	this.Display(this.Extrude(pts));
}

Gpex.prototype.Extrude = function(pts) {
		
	// populates this.ll (lat/lon vectors) and this.markers
	this.ScanPoints(pts);
	
	// populates projected point vectors
	this.ProjectPoints();
	
	// fit returns a scaled and centered output unit [x, y, z] vector from input [x, y, z] projected vector
	var that = this;
	var fit = function(v) {
		return [
			that.scale * (v[0] - that.offset[0]),
			that.scale * (v[1] - that.offset[1]),
			that.scale * (v[2] - that.offset[2]) * that.options.vertical + that.options.base
		];
	};
	
	// apply the necessary scale and offset to fit projected points to output area
	this.output_points = this.projected_points.map(fit, this);
	
	// likewise, scale and offset marker locations to fit output
	// (can't do this at the time markers is initially populated
	// because we don't have scale/offset until ProjectPoints)
	this.markers = this.markers.map(function(m) {
		return {
			location: fit(m.location),
			orientation: m.orientation
		};
	}, this);
	
	// return output geometry code
	return this.process_path();
};

Gpex.prototype.Display = function(code) {
	
	// If fitting route to bed, report region extent
	if (!this.options.regionfit) {
		document.forms[0].east_min.value = Math.round(this.bounds.minx);
		document.forms[0].east_max.value = Math.round(this.bounds.maxx);
		document.forms[0].north_min.value = Math.round(this.bounds.miny);
		document.forms[0].north_max.value = Math.round(this.bounds.maxy);
	}
	
	// 1. Assumes bounds are meters (true for GM & UTM)
	// 2. Approximate scale based on X extent (itself based on opp corners)
	// Be better to at least look at a segment of a
	// single circle of lat through extent centroid 
	var xextent = this.bounds.maxx - this.bounds.minx;
	var xscale = Math.round(xextent * 1000 / this.options.bedx);
	console.log("1:" + xscale);
	
	if (OJSCAD.viewer) {
		OJSCAD.viewer.setBedSize(this.options.bedx, this.options.bedy);
	}
	
	// Attempt to retrieve a basemap on three conditions:
	// map style is selected; default Google Maps projection is selected;
	// zoom level is reasonable (determined during basemap update calc)
	if (!(this.options.shapetype === 0 &&
			this.options.projection === "GOOGLE" &&
			this.basemap.Update(this.bounds, {x:this.options.bedx, y:this.options.bedy}))) {
		this.basemap.Clear();
	}
	
	// Update the preview display (required to prepare STL export,
	// even if WebGL is not available to display the preview)
	OJSCAD.setJsCad(code.jscad(true));
	
	// Display code for custom usage
	this.options.jscadDiv.innerHTML = code.jscad(false);
	this.options.oscadDiv.innerHTML = code.oscad();
	
	// Bring the output div into view
	document.getElementById('output').scrollIntoView();
};

// Scan point array to determine bounds, path length, and marker locations.
// Also assembles array of segment distances (n - 1 where n = point count)
// A monstrous behemoth.
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
			
			if (mindist === 0 || dist >= mindist) {
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
	
	for (i = 0; i < marker_objs.length; i++) {
				
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
		
		var scale = null;
		if (this.options.shapetype === 0) {
			// track: set scale based on approx route extent
			var min_geo = proj4('GOOGLE', [min_lon, min_lat]);
			var max_geo = proj4('GOOGLE', [max_lon, max_lat]);
			var geo_x = max_geo[0] - min_geo[0];
			var geo_y = max_geo[1] - min_geo[1];
			scale = Scale(this.bed, geo_x, geo_y);
		}
		else if (this.options.shapetype === 1) {
			// linear: set scale based on distance
			scale = Scale(this.bed, this.distance, 0);
		}
		else if (this.options.shapetype === 2) {
			// ring: set scale based on ring radius
			scale = Scale(this.bed, 2 * this.ringRadius, 2 * this.ringRadius);
		}
		
		// Model path buffer (mm) / scale = real world path buffer size (meters);
		// segments representing lengths less than this size are noisy; discard.
		smoothing_distance = Math.floor(this.options.buffer / scale);
	}
	
	// smooth route by minimum distance filter
	distFilter(rawpoints, smoothing_distance);
};

Gpex.prototype.ProjectPoints = function() {
	
	// cumulative distance
	var cd = 0;
	
	// Initialize extents using first projected point.
	var xyz = this.ProjectPoint(this.ll[0], 0);
	this.bounds = new Bounds(xyz);
	this.projected_points.push(xyz);
	
	// Project the rest of the points, updating extents.
	for (var i = 1; i < this.ll.length; i++) {
		
		cd += this.d[i-1];
		
		xyz = this.ProjectPoint(this.ll[i], cd/this.smooth_total);
		this.bounds.Update(xyz);
		this.projected_points.push(xyz);
	}
	
	if (this.options.regionfit) {
		this.bounds.maxx = this.options.region_maxx;
		this.bounds.minx = this.options.region_minx;
		this.bounds.maxy = this.options.region_maxy;
		this.bounds.miny = this.options.region_miny;
	}
	
	this.offset = Offsets(this.bounds, this.options.zcut);
	this.scale = ScaleBounds(this.bounds, this.bed);
};

/*
 * Given an output point array with at least two points, loop
 * through each segment (pair of points). In each iteration
 * of the for loop, pj and pk are the 2D coordinates of the
 * corners of the quad representing a buffered path for
 * that segment; consecutive segments share endpoints.
 * Another monstrous behemoth.
 */
Gpex.prototype.process_path = function() {
	
	var acuteAngle = function(angle) {
		if ((Math.abs(angle) > Math.PI/2) && (Math.abs(angle) < (3 * Math.PI)/2)) {
			return true;
		}
		return false;
	};
	
	var that = this;
	
	/*
	 * Given a point array and index of a point,
	 * return the angle of the vector from that point
	 * to the next. (2D) (If the index is to the last point,
	 * return the preceding segment's angle. Point array
	 * should have at least 2 points!)
	 */
	var segmentAngle = function(i) {
		// in case of final point, repeat last segment angle
		if (i + 1 == that.output_points.length) {
			return segmentAngle(i - 1);
		}
		// angle between this point and the next
		return vector_angle(that.output_points[i], that.output_points[i + 1]);
	};
	
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
	var jointPoints = function(i, rel, avga) {

		// distance from endpoint to segment buffer intersection
		var jointr = that.options.buffer/Math.cos(rel/2);
		
		// arbitrary hack to prevent extremely spiky corner artifacts
		// on acute angles. Optimal solution would introduce additional
		// corner points. (As-is, path width is not maintained here.)
		
		if (Math.abs(jointr) > that.options.buffer * 2) {
			jointr = Math.sign(jointr) * that.options.buffer * 2;
		}
		
		// joint coordinates (endpoint offset at bisect angle by jointr)
		var	lx = that.output_points[i][0] + jointr * Math.cos(avga + Math.PI/2),
			ly = that.output_points[i][1] + jointr * Math.sin(avga + Math.PI/2),
			rx = that.output_points[i][0] + jointr * Math.cos(avga - Math.PI/2),
			ry = that.output_points[i][1] + jointr * Math.sin(avga - Math.PI/2);
		
		return [[lx, ly], [rx, ry]];
	};
	
	var last_angle,
		angle,
		rel_angle,
		joint_angle,
		path_pts,
		vertices = [],
		faces = [];
		
	// s is segment counter used for calculating face indices; it is
	// managed separately from i in case we skip any acute/noisy segment
	for (var i = 0, s = 0; i < this.output_points.length; i++) {
		
		angle = segmentAngle(i);
		if (i === 0) {
			last_angle = angle;
		}
		
		rel_angle = angle - last_angle;
		joint_angle = rel_angle / 2 + last_angle;
		
		// Collapse series of acute angle segments into a single cusp.
		if (acuteAngle(rel_angle) &&
				(i < this.output_points.length - 1) &&
				acuteAngle(segmentAngle(i + 1) - angle)) {
			// by continuing, we add no points or faces to the model,
			// and do not update last_angle - it remains pointing at
			// whatever it did before we hit this weird acute segment
			continue;
		}
		
		path_pts = jointPoints(i, rel_angle, joint_angle);
		
		// next four points of segment polyhedron
		PathSegment.points(vertices, path_pts, this.output_points[i][2]);
		
		// faces connecting first four points to last four of segment
		// if s == 0, default to first_face behavior
		PathSegment.faces(faces, s);
		s = s + 1;
		last_angle = angle;
	}
	
	// final endcap
	PathSegment.last_face(faces, s);
	
	// Package results in a code object and pass it back to caller
	return new Code(vertices, faces, this.markers, {markerWidth: 2 * this.options.buffer + 2});
};

/*
 * Bounds
 * Initialize new Bounds object to a single point.
 * 
 * Parameters:
 * - [x, y, z] initial point ([0, 0, 0] if undefined)
 */
var Bounds = function(xyz) {
	if (typeof(xyz) === "undefined") {
		this.minx = this.maxx = 0;
		this.miny = this.maxy = 0;
		this.minz = this.maxz = 0;
	} else {
		this.minx = this.maxx = xyz[0];
		this.miny = this.maxy = xyz[1];
		this.minz = this.maxz = xyz[2];
	}
};

/*
 * Bounds.Update
 * Expand bounded region (if necessary) to include new point.
 * 
 * Parameters:
 * - [x, y, z] new point
 */
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
};

/*
 * Bounds.Center
 * 
 * Returns:
 * - [x, y] bounds extent center
 */
Bounds.prototype.Center = function() {
	return [(this.minx + this.maxx) / 2, (this.miny + this.maxy) / 2];
};

// returns offset vector to translate model to output origin
// zcut is boolean indicating whether to trim at min z or not
var Offsets = function(bounds, zcut) {
	
	// xy offset used to center model around origin
	var xy = bounds.Center();
	
	// zero z offset uses full height above sea level
	// disabled if minimum elevation is at or below 0
	var zoffset = 0;
	if (zcut === true || bounds.minz <= 0) {
		zoffset = Math.floor(bounds.minz - 1);
	}
	
	return [xy[0], xy[1], zoffset];
};

// Return scale factor necessary to fit extents to bed
var Scale = function(bed, xextent, yextent) {
	var xscale = bed.x / xextent,
		yscale = bed.y / yextent;
	return Math.min(xscale, yscale);
};

// Return scale factor necessary to fit bounds to bed
var ScaleBounds = function(bounds, bed) {
	return Scale(bed, (bounds.maxx - bounds.minx), (bounds.maxy - bounds.miny));
};

/*
 * Basemap
 * 
 * Parameters:
 * - view, a reference to the OpenJsCad.Viewer which will display this basemap
 */
var Basemap = function(view) {
	this.view = view;
};

/*
 * Basemap.ZoomLevel (helps Basemap.Update)
 * 
 * Returns:
 * - Google Maps zoom level required for basemap.
 * 
 * Parameters:
 * - ne, [lng, lat] array representing one corner of region
 * - sw, [lng, lat] array representing opposite corner of region
 * - mapDim, {width, height} desired map image pixel dimensions
 */
Basemap.prototype.ZoomLevel = function(ne, sw, mapDim) {
	// jacked from http://stackoverflow.com/a/13274361/339879
	var WORLD_DIM = {height: 256, width: 256};
	function latRad(lat) {
		var sin = Math.sin(lat * Math.PI / 180);
		var radX2 = Math.log((1 + sin) / (1 - sin)) / 2;
		return Math.max(Math.min(radX2, Math.PI), -Math.PI) / 2;
	}
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
};

/*
 * Basemap.Update
 * Update basemap to fit specified region and bed dimensions.
 * 
 * Returns:
 * - boolean true if updated, false if not for any reason
 * 
 * Parameters:
 * - bounds, {minx, miny, maxx, maxy} region extents in GOOGLE proj coordinates
 * - bed, {x, y} dimensions of bed in mm
 */
Basemap.prototype.Update = function(bounds, bed) {
	var bedmax = Math.max(bed.x, bed.y);
	var mapsize = {
		width:  Math.round(640 * bed.x / bedmax),
		height: Math.round(640 * bed.y / bedmax)
	};
	
	var sw = proj4("GOOGLE", "WGS84", [bounds.minx, bounds.miny]);
	var ne = proj4("GOOGLE", "WGS84", [bounds.maxx, bounds.maxy]);
	var zoominfo = this.ZoomLevel(ne, sw, mapsize);
	
	// don't bother with base map if zoom level would be too high
	if (zoominfo.zoom > 21) {
		return false;
	}
	
	var mapscale = mapsize[zoominfo.axis] / 256 / Math.exp(zoominfo.zoom * Math.LN2) / zoominfo.span;
	var center = proj4("GOOGLE", "WGS84", bounds.Center());
	var mapurl = "https://maps.googleapis.com/maps/api/staticmap?center=" +
			center[1].toFixed(6) + "," + center[0].toFixed(6) +
			"&zoom=" + zoominfo.zoom + "&size=" + mapsize.width + "x" + mapsize.height +
			"&maptype=terrain&scale=2&format=jpg&key=AIzaSyBMTdBdNXMyAWYU8Sn4dt4WYtsf5lqvldA";
	
	if (this.view !== null) {
		this.view.setBaseMap(mapurl, mapscale, bed.x, bed.y, this.Download);
	}
	
	return true;
};

/*
 * Basemap.Clear
 * Resets basemap texture. 
 */
Basemap.prototype.Clear = function() {
	if (this.view !== null) {
		this.view.clearBaseMap();
	}
};

/*
 * Basemap.Download
 * Generates downloadable PDF version of basemap at correct scale.
 * 
 * Parameters:
 * - img, basemap texture image
 * - scale, applied to bed dimensions to get mm basemap dimensions
 * - w, bed width in mm
 * - h, bed height in mm
 */
Basemap.prototype.Download = function(img, scale, w, h) {
	
	// Create a temporary canvas sized to fit map image
	var canvas = document.createElement("canvas");
	canvas.width = img.width;
	canvas.height = img.height;
	
	// Draw the map image to the canvas
	var context = canvas.getContext("2d");
	context.drawImage(img, 0, 0);
	
	// Determine size of map image in mm based on mm bed size and bed-map scale.
	var mapw = scale * w;
	var maph = scale * h;
	
	// Create PDF to fit map image mm size exactly.
	var pdfdoc = new jsPDF({
		orientation: mapw > maph ? 'l' : 'p',
		format: [mapw, maph]
	});
	
	// Draw map image canvas to PDF (scale to fit)
	var imgDataURL = canvas.toDataURL("image/jpeg");
	pdfdoc.addImage(imgDataURL, 'JPEG', 0, 0, mapw, maph);
	
	// Draw bed outline centered on PDF above map image
	pdfdoc.setDrawColor(26, 26, 26);
	pdfdoc.rect(mapw/2 - w/2, maph/2 - h/2, w, h);
	
	// Trigger PDF download (TODO: name it appropriately)
	pdfdoc.save('basemap.pdf');
};

// point to project and cumulative distance along path
// distance ratio now, now absolute distance
Gpex.prototype.ProjectPoint = function(point, cdr) {
	var xyz;
	if (this.options.shapetype == 1) {
		xyz = PointProjector.linear(point, cdr, this.distance);
	} else if (this.options.shapetype == 2) {
		xyz = PointProjector.ring(point, cdr, this.ringRadius);
	} else {
		xyz = PointProjector.project(point);
	}
	return xyz;
};

var vector_angle = function(a, b) {
	var dx = b[0] - a[0],
		dy = b[1] - a[1];
	return Math.atan2(dy, dx);
};

/*
 * SCAD Code
 * 
 * Input:
 * - points
 * - faces
 * - markers
 * - options = {
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
};

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
	
	result += ";\n}\n\n";
	
	// markers
	
	if (this.markers.length > 0) {
		
		// first one plus concatenate rest in union()
		var m = this.markers[0] + this.markers.slice(1).map(function(s) {
			return ".union(" + s + ")";
		}).join("");
		
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
};

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
};

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
		
		if (s === 0) {
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

// Rudimentary GPX parsing based on https://github.com/peplin/gpxviewer/
var Parser = {
	
	// Default elevation value
	elevation: null,
	
	// Parse GPX file, starting with tracks
	// Elevation arg specifies default z value
	file: function(content, elevation) {
		this.elevation = elevation;
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
		
		// Only the first trkpt is tested for elevations; all others are assumed alike.
		if (this.elevation === null && trkpts[0].getElementsByTagName('ele').length === 0) {
			Messages.error('This GPX file does not appear to contain any elevation data.<br />Specify a constant default elevation or try using <a href="http://www.gpsvisualizer.com/elevation">GPX Visualizer</a> to add elevation data to your route.');
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
			// Prefer predefined constant elevation value if available
			// Mobile Safari doesn't seem to like using .innerHTML with XML
			this.elevation || parseFloat(pt.getElementsByTagName('ele')[0].textContent)
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
	
	// must be called with a valid projDefinition prior to calling .project()
	init: function(projDefinition) {
		this.projection = proj4(projDefinition);
	},
	
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
	
	project: function(v) {
		return this.projection.forward([v[0], v[1]]).concat(v[2]);
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
