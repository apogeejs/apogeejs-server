var http = require("http");
var parser = require('url');
var { ParentHandler } = require("./ParentHandler");

//This module exposes a simple parent handler, which allows adding child handlers
//and processing requests.
var handler = new ParentHandler();

module.exports.addHandler = function(folderName,handler) {
    handler.addChildHandler(folderName,handler);
}

module.exports.route = function(request,response) {
    var url = parser.parse(request.url,true);
    var path = url.pathname;
    var queryString = url.search;

    handler.process(path,queryString,request,response);
}
