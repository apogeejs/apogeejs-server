var http = require("http");
var router = require('./router');
var filehandler = require("./filehandler");
var apogeehandler = require("./apogeehandler");

const FILE_ROOT = "file/";
const APOGEE_DESCRIPTOR_LOCATION = "test/simple/descriptor.json";
const PORT = 8888;

//NOTE - delay is just so the debugger can start before I do any work
function init() {
    
    //------------------------------
    // add child handlers
    //------------------------------
    
    //add a static file handler
    var fileHandler = filehandler.createInstance(FILE_ROOT);
    router.addHandler("file",fileHandler);

    //add the apogee handler
    var apogeeHandler = apogeehandler.createInstance(APOGEE_DESCRIPTOR_LOCATION);
    router.addHandler("apogee",apogeeHandler);

    //--------------------------------
    // start server
    //--------------------------------
    
    //create listener
    http.createServer(router.route).listen(PORT);
}

setTimeout(init,2000);