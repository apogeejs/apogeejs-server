var parser = require('url');

var handlers = [];

/** This method adds a handler for the given path. */
exports.addEndpoint = function(pathname,handler) {	
	handlers[pathname] = handler;
}

exports.route = function(request,response) {
	var url = parser.parse(request.url,true);

	var handler;
    for(var handlerPathname in handlers) {
        var handler = handlers[handlerPathname];
        if(url.pathname.startsWith(handlerPathname + "/")) {
            var childPathname = url.pathname.substring(handlerPathname.length+1);
            var queryString = url.search;
            handler.process(childPathname,queryString,request,response);
            return;
        }
    }
    
	//if we didn't find the handler, return 403
    response.writeHead(403,{"Content-Type": "text/plain"});
    response.write("Endpoint not found!");
    response.end();
}
