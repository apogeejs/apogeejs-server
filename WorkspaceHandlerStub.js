var utils = require('./serviceUtils');
var fs = require('fs');
const { WorkspaceHandler } = require('./WorkspaceHandler');

class WorkspaceHandlerStub {
    /** Constructor */
    constructor(workspacePathName,workspaceInfo,settings) {
        this.workspacePathName = workspacePathName;
        this.workspaceInfo = workspaceInfo;
        this.settings = settings;
        this.handlers = []; //no handlers instantiated yet
        this.status = "not initialiazed";
    }
    
    /** This method must be called to initialize the handler. It
     * is asynchronous. A resquest will fail before the initialization is
     * complete.  */
    init() {
        //load the workspace
        var onData = (err,data) => {
		if(err) {
			this.status = "error: source data not loaded: " + err;
		}
		else {
            
            if(data.fileType == "apogee app js workspace") {
                this.headlessWorkspaceJson = data.workspace;
            }
            else if(data.fileType == "apogee workspace") {
                this.headlessWorkspaceJson = data;
            }
            else {
                this.status = "error: improper workspace format";
                return;
            }
            
            if(this.headlessWorkspaceJson.version != WorkspaceHandlerStub.SUPPORTED_WORKSPACE_VERSION) {   
                this.status = "error: improper workspace version. required: " + WorkspaceHandlerStub.SUPPORTED_WORKSPACE_VERSION + ", found: " + this.headlessWorkspaceJson.version;
            }
            else {
                this.status = "ready"
            }
		}
        fs.readFile(this.workspaceInfo.source,onData);  //load from source  
    }
    
    /** This method returns true if this handler handles this request. */
    handles(pathname) {
        //path should be workspace name plus the endpoint name
        return pathname.startsWith(this.workspacePathname + "/");
    }
    
    /** This method should be called to process a request. */
    process(url,request,response) {
        //make sure the server is ready
        if(this.status != "ready") {
            utils.sendError(500,"Server endpoint not ready. Status = " + this.status,response);
            return;
        }
   
        //get a handler - we may have to wait for one to be available
        var handlerPromise = getHandlerPromise(); 
        
        //remove the workspace name to get the endpoint path name. 
        var endpointPathname = url.pathname.substring(this.workspacePathName.length + 1);
        var queryString = url.search;
        
        //process the request when ready
        //on error, we will give up, we should maybe see what the problem is and
        //get a new handler if this is just a problem with the particular handler
        handlerPromise
                .then( handler => handler.process(url,queryString,request,response));
                .catch( errorMsg => utils.sendError(500,"Error handling request: " + errorMsg));
    }
    
    shutdown() {
        //nothing for now...
        
        //set status
        this.status = "shutdown";
    }
    
    //====================================
    // Private Methods
    //====================================
    
    getHandlerPromise() {
        //for now just create a new one, and don't save it
        var workspaceHandler = new WorkspaceHandler(this.workspaceInfo,this.settings);
        return workspaceHandler.initPromise(this.workspaceJson);
        
        //in the future we can return one from the list if one is available
        //or we have to wait until one is ready.
    }
}

module.exports = WorkspaceHandlerStub;


