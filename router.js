var parser = require('url');

var startsWithPath = undefined;
var handlers = {};

/** This method adds a handler for the given path. */
exports.addEndpoint = function(path,handler) {	
	handlers[path] = handler;
}

/** This method adds a handler for a path that starts with the given value. 
 * we are only allowing one of these for now. 
 * We are using this to allow a nicer url for requesting html files. */
exports.addStartsWithEndpoint = function(startWithPath,handler) {
	startsWithPath = startWithPath;
	exports.addEndpoint(startWithPath,handler);
}

exports.route = function(request,response) {
	var url = parser.parse(request.url,true);
	console.log("request: " + url.pathname);
	
	var key;
	if((startsWithPath)&&(url.pathname.startsWith(startsWithPath))) {
		key = startsWithPath;
	}
	else {
		key = url.pathname;
	}
	
	var handler = handlers[key];
	if(handler) {
		handler(request,response);
	}
	else {
		response.writeHead(403,{"Content-Type": "text/plain"});
		response.write("Endpoint not found!");
		response.end();
	}
}
