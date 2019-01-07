var fs = require('fs');
const { Handler } = require('./Handler');

/** This is a handler that server static files. */
class FileHandler extends Handler {
    
    /** The file root is the location of the folder that contains the
     * static files. */
    constructor(fileRoot) {
        super();
        
        this.fileRoot = fileRoot;
        this.setStatus(Handler.STATUS_READY);
    }
    
    /** This method handles requests. The pathname given here is the excluding 
     * any parent directories. */
    process(path,queryString,request,response) {
        var filePath = this.fileRoot + path;

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

        fs.readFile(filePath,onData);      

    }    
}

module.exports.createInstance = function(fileRoot) {
    return new FileHandler(fileRoot);
}