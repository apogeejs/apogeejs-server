require("./lib/nodeGlobals.js");
require("./lib/debugHook.js");
const express = require('express');
const bodyParser = require('body-parser');
const {ApogeeManager} = require("./ApogeeManager");

const FILE_ROOT = "/file";
const APOGEE_DESCRIPTOR_LOCATION = "deploy/descriptor.json";

//allow no user interaction in standard alert/confirm
//__globals__.apogeeLog = (msg) => console.log(message);
__globals__.apogeeUserAlert = (msg) => console.log(msg);
__globals__.apogeeUserConfirm = (msg,okText,cancelText,okAction,cancelAction,defaultToOk) => defaultToOk ? okAction : cancelAction;
__globals__.apogeeUserConfirmSynchronous = (msg,okText,cancelText,defaultToOk) => defaultToOk;

//===========================
// Set up handlers
//===========================
const app = express();

//--------------
//file server
//--------------
app.use(FILE_ROOT,express.static("file"));

//---------------
//apogee server
//---------------

//parse json body of requests
app.use(bodyParser.json()) // for parsing application/json
app.use(bodyParser.text()); //for parsing plain.text

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*"); // update to match the domain you will make the request from
    res.header("Access-Control-Allow-Methods", "POST, GET");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Content-Type","application/json");
    next();
  });


//apogee endpoint initialization
const apogeeManager = new ApogeeManager();
var initPromise = apogeeManager.getInitPromise(app,APOGEE_DESCRIPTOR_LOCATION);

//---------------------
// listener
//---------------------

//start listener after pogee initialization
const port = getPort();
var startListener = () => {
    app.listen(port, () => console.log(`Example app listening on port ${port}!`));
}

let errorHandler = errorMsg => {
    console.log("Server failed to start: " + errorMsg);
} 

initPromise.then(startListener).catch(errorHandler);

//============================
// Utility Functions
//============================

function getPort() {
    var packageJson = require('./package.json');
    if((packageJson.config)&&(packageJson.config.port)) {
        return packageJson.config.port;
    }

    //default port
    return 30001;
}
