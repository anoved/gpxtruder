//http://www.openjs.com/scripts/dom/class_manipulation.php
function hasClass(ele,cls) {
	return ele.className.match(new RegExp('(\\s|^)'+cls+'(\\s|$)'));
}
function addClass(ele,cls) {
	if (!this.hasClass(ele,cls)) ele.className += " "+cls;
}
function removeClass(ele,cls) {
	if (hasClass(ele,cls)) {
		var reg = new RegExp('(\\s|^)'+cls+'(\\s|$)');
		ele.className=ele.className.replace(reg,' ');
	}
}

// http://www.rainbodesign.com/pub/css/css-visibility.html
function toggleDivDisplay(theDiv, button) {
	if (document.getElementById(theDiv).style.display == 'block') {
		document.getElementById(theDiv).style.display = 'none';
		addClass(document.getElementById(button), 'inactive');
		removeClass(document.getElementById(button), 'active');
	} else {
		document.getElementById(theDiv).style.display = 'block';
		addClass(document.getElementById(button), 'active');
		removeClass(document.getElementById(button), 'inactive');
	}
}
