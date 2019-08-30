const express = require('express');
const apogeeManager = require("./apogeemanager");

const FILE_ROOT = "file/";
const APOGEE_DESCRIPTOR_LOCATION = "deploy/descriptor.json";

//===========================
// Set up handlers
//===========================
const app = express();

//file server
app.use("/file",express.static("file"));

//apogee endpoint initialization
const am = apogeeManager.loadApogeeManager(app,APOGEE_DESCRIPTOR_LOCATION);

//============================
// Start Listening (system might not be all up though)
//============================

app.use(express.json()) // for parsing application/json

const port = getPort();
app.listen(port, () => console.log(`Example app listening on port ${port}!`));

//============================
// Utilities
//============================

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
    return 30001;
}
