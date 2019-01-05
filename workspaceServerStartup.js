var fs = require('fs');
const { WorkspaceServer } = require('./WorkspaceServer');

//load the descriptor
var onDescriptorLoad = (err,data) => {
    if(err) {
        console.log("Error loading descriptor: " + err);
    }
    else {
        var descriptor = JSON.parse(data);
        var workspaceServer = new WorkspaceServer();
        workspaceServer.startup(descriptor);
    }
}
fs.readFile("test/simple/descriptor.json",onDescriptorLoad);  //load from source 
