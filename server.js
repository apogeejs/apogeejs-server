var http = require("http");
var router = require("./router");

var { FileHandler } = require("./FileHandler");
var { ApogeeHandler } = require("./ApogeeHandler");

const FILE_ROOT = "file/";
const APOGEE_DESCRIPTOR = "test/simple/descriptor.json";
const PORT = 8888;


function init() {
    //add a static file handler
    var fileHandler = new FileHandler(FILE_ROOT);
    router.addEndpoint("/file",fileHandler);

    //add the apogee handler
    var apogeeHandler = new ApogeeHandler();
    apogeeHandler.init(APOGEE_DESCRIPTOR);
    router.addEndpoint("/apogee",apogeeHandler);

    //start server
    http.createServer(router.route).listen(PORT);
}

setTimeout(init,2000);