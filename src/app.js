#!/usr/bin/env node

require("./nodeGlobals.js");
require("./debugHook.js");
const express = require('express');
var fs = require('fs');
const bodyParser = require('body-parser');
const path = require('path')
const {ApogeeManager} = require("./ApogeeManager");
const apogeeutil = require('apogeejs-util-lib');
const apogeebase = require('apogeejs-base-lib');
const apogee = require('apogeejs-model-lib');

//libraries
__globals__.apogeeutil = apogeeutil;
__globals__.apogeebase = apogeebase;
__globals__.apogee = apogee;

//allow no user interaction in standard alert/confirm
//__globals__.apogeeLog = (msg) => console.log(message);
__globals__.apogeeUserAlert = (msg) => console.log(msg);
__globals__.apogeeUserConfirm = (msg,okText,cancelText,okAction,cancelAction,defaultToOk) => defaultToOk ? okAction : cancelAction;
__globals__.apogeeUserConfirmSynchronous = (msg,okText,cancelText,defaultToOk) => defaultToOk;

//_require_ is not in globals! We need to put it there so the workspace can access it
__globals__.__apogee_globals__ = {
    "require": require
}

let thisFileDir = path.dirname(process.argv[1]);
const DEFAULT_CONFIG_JSON = {
    serverDirectory: path.join(thisFileDir,".."),
    fileFolder: "file",
    fileUrlPrefix: "/file",
    descriptorPath: "deploy/descriptor.json",
    port: 8000
}

//load the config file and call init with it
if(process.argv.length > 2) {
    let configFile =  process.argv[2];

    //read the descriptor
    try {
        fs.readFile(configFile,loadConfigFile);
    }
    catch(error) {
        let errorMsg = "Error reading descriptor";
        console.error(errorMsg);
        console.error(error.stack);
    }
}
else {
    try {
        initServer(DEFAULT_CONFIG_JSON);
    }
    catch(error) {
        let errorMsg = "Error initializing server - default init";
        console.error(errorMsg);
        console.error(error.stack);
    }
}

/** This receives the config file text and inits the server */
function loadConfigFile(err,inputConfigText) {
    if(err) {
        let errorMsg = "Error: Descriptor not read. " + err;
        console.error(errorMsg);
    }
    else {
        try {
            var inputConfigJson = JSON.parse(inputConfigText);

            //add default values where needed
            for(let key in DEFAULT_CONFIG_JSON) {
                if(inputConfigJson[key] === undefined) {
                    inputConfigJson[key] = DEFAULT_CONFIG_JSON[key];
                }
            }

            initServer(inputConfigJson);              
        }
        catch(error) {
            let errorMsg = "Error initializing server";
            console.error(errorMsg);
            console.error(error.stack);
        }
    }  
}


/** This initializes and starts the server. */
function initServer(configJson) {

    //===========================
    // Set up handlers
    //===========================
    const app = express();

    //--------------
    //file server
    //--------------
    let fileFolderPathAbs = path.join(configJson.serverDirectory,configJson.fileFolder);
    app.use(configJson.fileUrlPrefix,express.static(fileFolderPathAbs));

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
    var initPromise = apogeeManager.getInitPromise(app,configJson.serverDirectory,configJson.descriptorPath);

    //---------------------
    // listener
    //---------------------

    //start listener after apogee initialization
    var startListener = () => {
        app.listen(configJson.port, () => console.log(`Example app listening on port ${configJson.port}!`));
    }

    let errorHandler = errorMsg => {
        console.log("Server failed to start: " + errorMsg);
    } 

    initPromise.then(startListener).catch(errorHandler);
}
