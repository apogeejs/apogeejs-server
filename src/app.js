#!/usr/bin/env node

require("../apogeejs-model-lib/src/nodeGlobals.js");
require("../apogeejs-model-lib/src/debugHook.js");
const express = require('express');
var fs = require('fs');
const bodyParser = require('body-parser');
const path = require('path')
const {ApogeeManager} = require("./ApogeeManager");
const apogeeutil = require('../apogeejs-util-lib/src/apogeejs-util-lib.js');
const apogeebase = require('../apogeejs-base-lib/src/apogeejs-base-lib.js');
const apogee = require('../apogeejs-model-lib/src/apogeejs-model-lib.js');
const { config } = require("process");

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
    deployFolder: "/deploy",
    port: 8000
}

startServer();

//==================================
// functions
//==================================

async function startServer() {

    try {

        let configJson = await getConfig();

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
        app.use(express.json()) // for parsing application/json
        app.use(express.text()); //for parsing plain.text

        //cross origin headers
        app.use(function(req, res, next) {
            res.header("Access-Control-Allow-Origin", "*"); // update to match the domain you will make the request from
            res.header("Access-Control-Allow-Methods", "POST, GET");
            res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
            next();
        });


        //apogee endpoint initialization
        const apogeeManager = new ApogeeManager();

        let deployFolderPathAbs = path.join(configJson.serverDirectory,configJson.deployFolder);
        await apogeeManager.init(deployFolderPathAbs);

        app.use(apogeeManager.getHandler());

        //-------------------
        //start the listener
        //-------------------

        app.listen(configJson.port, () => console.log(`Example app listening on port ${configJson.port}!`));

    }
    catch(error) {
        console.log("Server failed to start: " + error.toString());
        if(error.stack) console.error(error.stack);
    } 
}

/** This funcion loads the config JSON */
async function getConfig() {
    let configJson;
    if(process.argv.length > 2) {
        let configFilePath =  process.argv[2];
        let configText = await fsPromises.readFile(configFilePath);
        configJson = JSON.parse(configText);
    }
    else {
        configJson = {};
    }

    //load defaults
    //add default values where needed
    for(let key in DEFAULT_CONFIG_JSON) {
        if(configJson[key] === undefined) {
            configJson[key] = DEFAULT_CONFIG_JSON[key];
        }
    }

    return configJson;
}
