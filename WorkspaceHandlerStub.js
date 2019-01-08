var fs = require('fs');
const { Handler } = require('./Handler');
const { WorkspaceHandler } = require('./WorkspaceHandler');

class WorkspaceHandlerStub extends Handler {
    /** Constructor */
    constructor(workspaceInfo,settings) {
        super();
        
        this.workspaceInfo = workspaceInfo;
        this.settings = settings;
        this.headlessWorkspaceJson = null
        this.handlers = []; //no handlers instantiated yet
        this.setStatus(Handler.STATUS_NOT_READY);
    }
    
    /** This method must be called to initialize the handler. It
     * is asynchronous. A request will fail before the initialization is
     * complete.  */
    init() {
        //load the workspace json
        fs.readFile(this.workspaceInfo.source, (err,workspaceText) => this._onWorkspaceRead(err,workspaceText));  //load from source  
    }
    
    /** This method should be called to process a request. */
    process(path,queryString,request,response) {
        
        //make sure we are ready
        if(this.isHandlerNotReady(response)) return;
   
        //get a handler - we may have to wait for one to be available
        var handlerPromise = this._getHandlerPromise(); 
        
        //process the request when ready
        //on error, we will give up, we should maybe see what the problem is and
        //get a new handler if this is just a problem with the particular handler
        handlerPromise
                .then( handler => handler.process(path,queryString,request,response))
                .catch( errorMsg => this.sendError(500,"Error handling request: " + errorMsg,response));
    }
    
    shutdown() {
        //nothing for now...
        
        //set status
        this.setStatus(Handler.STATUS_SHUTDOWN);
    }
    
    //====================================
    // Private Methods
    //====================================
    /** This stores the workspace json given the workspace file text. */
    _onWorkspaceRead(err,workspaceText) {
        if(err) {
            this.setErrorStatus("Source data not loaded: " + err);
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
                this.setErrorStatus("Improper workspace format");
                return;
            }

            if(this.headlessWorkspaceJson.version != WorkspaceHandlerStub.SUPPORTED_WORKSPACE_VERSION) {   
                this.setErrorStatus("Improper workspace version. Required: " + WorkspaceHandlerStub.SUPPORTED_WORKSPACE_VERSION + ", Found: " + this.headlessWorkspaceJson.version);
            }
            else {
                this.setStatus(Handler.STATUS_READY);
                console.log("Apogee Workspace Handler Stub initialized.");
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
        
        var onError = errorMsg => {
            console.log(errorMsg);
        }
        
        return initPromise.then(onWorkspaceInitReturn).catch(onError);
        
        //in the future we can return one from the list if one is available
        //or we have to wait until one is ready.
    }
}

WorkspaceHandlerStub.SUPPORTED_WORKSPACE_VERSION = .2;

module.exports.WorkspaceHandlerStub = WorkspaceHandlerStub;


