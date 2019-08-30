var fs = require('fs');
const { WorkspaceHandler } = require('./WorkspaceHandler');

class WorkspaceManager {
    /** Constructor */
    constructor(workspaceName,workspaceInfo,settings) {      
        this.workspaceName = workspaceName;
        this.workspaceInfo = workspaceInfo;
        this.settings = settings;
        this.headlessWorkspaceJson = null
        this.handlers = []; //no handlers instantiated yet
    }
    
    /** This method initializes the endpoints for this workspace.  */
    initEndpoints(app) {
        //create endpoints for this workspace
        for(let endpointName in this.workspaceInfo.endpoints) {
            let handlerFunction = (request,response) => this._processEndpoint(endpointName,request,response);
            let path = "/" + this.workspaceName + "/" + endpointName;
            app.post(path,handlerFunction);
        }

        //load the workspace json
        fs.readFile(this.workspaceInfo.source, (err,workspaceText) => this._onWorkspaceRead(err,workspaceText));  //load from source  
    }
    
    shutdown() {
        //nothing for now...
        
    }
    
    //====================================
    // Private Methods
    //====================================

    /** This method should be called if there is an error in initialization. */
    _handleSetupError(errorMsg) {
        //just print an error message
        console.log(errorMsg);
    }

    /** This method should be called to process a request. */
    _processEndpoint(endpointName,request,response) {

        //get a handler - we may have to wait for one to be available
        var handlerPromise = this._getHandlerPromise(); 
        
        //process the request when ready
        //on error, we will give up, we should maybe see what the problem is and
        //get a new handler if this is just a problem with the particular handler
        handlerPromise
                .then( handler => handler.handleRequest(endpointName,request,response))
                .catch( error => {
                    if(error.stack) console.error(error.stack);
                    response.status(500).send("Error handling request: " + error.message);
                });
    }

    /** This stores the workspace json given the workspace file text. */
    _onWorkspaceRead(err,workspaceText) {
        if(err) {
            this._handleSetupError("Source data not loaded: " + err);
        }
        else {
            var workspace = JSON.parse(workspaceText);

            if(workspace.fileType == "apogee app js workspace") {
                this.headlessWorkspaceJson = workspace.workspace;
            }
            else if(workspace.fileType == "apogee workspace") {
                this.headlessWorkspaceJson = workspace;
            }
            else {
                this.setStatusError("Improper workspace format");
                return;
            }

            if(this.headlessWorkspaceJson.version != WorkspaceManager.SUPPORTED_WORKSPACE_VERSION) {   
                this._handleSetupError("Improper workspace version. Required: " + WorkspaceManager.SUPPORTED_WORKSPACE_VERSION + ", Found: " + this.headlessWorkspaceJson.version);
            }
            else {
                console.log("Apogee Workspace Ready: " + this.workspaceName);
            }
        }
    }
    
    _getHandlerPromise() {
        //for now just create a new one, and don't save it
        var workspaceHandler = new WorkspaceHandler(this.workspaceInfo,this.settings);
        var initPromise = workspaceHandler.init(this.headlessWorkspaceJson);
        
        var onWorkspaceInitReturn = status => {
            if(status == WorkspaceHandler.STATUS_READY) {
                return workspaceHandler;
            }
            else {
                throw new Error("Error loading handler. status = " + status);
            }
        }
        
        return initPromise.then(onWorkspaceInitReturn);
        
        //in the future we can return one from the list if one is available
        //or we have to wait until one is ready.
    }
}

WorkspaceManager.SUPPORTED_WORKSPACE_VERSION = .2;

module.exports.WorkspaceManager = WorkspaceManager;


