var fs = require('fs');
var parser = require('url');

exports.readFile = function(request,response) {

	var url = parser.parse(request.url, true);
	var path = __dirname + url.pathname;
  
	var onData = function(err,data) {
		if(err) {
			console.log(err.msg);
			response.writeHead(500, {"Content-Type":"text/plain"});
			response.write("Error!");
		}
		else {
			response.writeHead(200, {"Content-Type":"text/html"});
			response.write(data);
		}
		response.end();
	}
	
	fs.readFile(path,onData);      
  
}