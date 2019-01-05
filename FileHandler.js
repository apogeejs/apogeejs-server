var fs = require('fs');
var parser = require('url');

class FileHandler {
    
    /** The file root is the location of the folder that contains the
     * static files. */
    constructor(fileRoot) {
        this.fileRoot = fileRoot;
    }
    
    /** This method handles requests. The pathname given here is the excluding 
     * any parent directories. */
    process(pathname,queryString,request,response) {
        var path = this.fileRoot + pathname;

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
}

exports.FileHandler = FileHandler;