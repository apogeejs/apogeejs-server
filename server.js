var http = require("http");
var router = require('./router');
var filehandler = require("./filehandler");
var apogeehandler = require("./apogeehandler");

const FILE_ROOT = "file/";
const APOGEE_DESCRIPTOR_LOCATION = "test/simple/descriptor.json";
//const APOGEE_DESCRIPTOR_LOCATION = "test/other/descriptor.json";

const PORT = getPort();
console.log("Using port: " + PORT);

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

function getPort() {
    if(process.argv.length === 3) {
        var portString = process.argv[2];
        try {
            return parseInt(portString);
        }  
        catch(error) {
            console.error("Errror reading port: " + error.message);
        }
    }

    //default port
    return 8887;
}

setTimeout(init,2000);