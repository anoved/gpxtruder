# GPXtruder

Make 3D-printable elevation models of GPX tracks. Try it now at [gpxtruder.xyz](http://gpxtruder.xyz/).

## Usage

## Examples

## Limitations

GPXtruder was written to fulfil a personal interest. In that respect it is a success, but ambitious users should be aware it has many limitations. Browse the code in the [`gh-pages` branch](https://github.com/anoved/gpxtruder/tree/gh-pages).

- Input GPX files must include elevations (`ele` tags). If your GPX file does not include elevations, you can run it through [GPS Visualizer's DEM database service](http://www.gpsvisualizer.com/elevation) to lookup and insert elevations. *To-do: lookup elevations automatically if necessary.*
- Route smoothing is achieved by discarding points that are close together. A threshold distance may be manually set or automatically estimated. Smoothing reduces the total route length and reduces detail. *To-do: more sophisticated smoothing that preserves route shape and length while still reducing geometric complexity.*
- "Noisy" GPX tracks (such as dense clusters of points recorded when motionless) can result in spikes in the output model. Abrupt course changes (such as hairpin turns) can result in similar artifacts. GPXtruder attempts to mitigate these issues by route smoothing and by interpolating acute corner paths differently. *To-do: more sophisticated handling of pauses, spurs, and pivots.*
- Self-intersecting models may be generated due to acute corners or crossing paths. Some software may consider such models invalid or non-manifold. *To-do: report or resolve self-intersections.*
- Untested with very large routes, polar routes, and routes that span hemisphere boundaries.
- Untested with many device and browser combinations.

You can help resolve these and other problems by reporting bugs and additional details as [issues](https://github.com/anoved/gpxtruder/issues) or by [forking the project](https://github.com/anoved/gpxtruder/fork) and posting pull requests with fixes. All contributions are welcome.

## Acknowledgements

GPXtruder uses [openjscad.js](https://github.com/Spiritdude/OpenJSCAD.org) by Joost Nieuwenhuijse and Rene Mueller; [lightgl.js](http://github.com/evanw/lightgl.js/) and [csg.js](https://github.com/evanw/csg.js/) by Evan Wallace; [jsPDF](https://github.com/MrRio/jsPDF) by James Hall; [proj4.js](https://github.com/proj4js/proj4js) by Andreas Hocevar and Calvin Metcalf; [details-shim](https://github.com/tyleruebele/details-shim) by Tyler Uebele; and Drew Robinson's Javascript implementation of the [Vincenty distance formulae](http://jsperf.com/vincenty-vs-haversine-distance-calculations) from [jsperf](https://github.com/mathiasbynens/jsperf.com). The header font is [Freshman](http://www.dafont.com/freshman.font) by William Boyd. The background pattern is [derived](http://blog.spoongraphics.co.uk/terms-of-use) from [Topographic Map Patterns](http://blog.spoongraphics.co.uk/freebies/8-free-seamless-vector-topographic-map-patterns) by Chris Spooner.

## Advertising

## License

GPXtruder is freely distributed under an open source [MIT License](http://opensource.org/licenses/MIT).
