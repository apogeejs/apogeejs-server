
/** This method sends an error response. */
function sendError(code,msg,response) {
	response.writeHead(code, {"Content-Type":"text/plain"});
	response.write(msg);
	response.end();
}

/** This method asynchronously reads the body of the request
 * and sends the result to onData on completion.
 * onData(request,response,body) */
exports.readBody = function(request,response,onData) {
	//read the body of the post
	var lines = [];
	request.on('data', function(chunk) {
		lines.push(chunk);
	})
	request.on('end', function() {
		var body = Buffer.concat(lines).toString();
		onData(request,response,body);
	});
	request.on('error', function(err) {
		sendError(500,err,response);
	});
}

/** This method sends an error response. */
exports.sendError = sendError;