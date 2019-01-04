var utils = require('./serviceUtils');
var fs = require('fs');
const { WorkspaceHandler } = require('./WorkspaceHandler');

class WorkspaceHandlerStub {
    /** Constructor */
    constructor(workspaceInfo,settings) {
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
			this.workspaceJson = data;
            this.status = "ready"
		}
        fs.readFile(this.workspaceInfo.source,onData);  //load from source  
    }
    
    /** This method returns true if this handler handles this request. */
    handles(pathname) {
        //path should be workspace name plus the endpoint name
        return pathname.startsWith(this.workspaceInfo.name + "/");
    }
    
    /** This method should be called to process a request. */
    process(pathname,request,response) {
        //make sure the server is ready
        if(this.status != "ready") {
            utils.sendError(500,"Server endpoint not ready. Status = " + this.status,response);
            return;
        }
   
        //get a handler - we may have to wait for one to be available
        var handlerPromise = getHandlerPromise(); 
        
        //remove the workspace name to get the endpoint path name. 
        var endpointPathname = pathname.substring(this.workspaceInfo.name.length + 1);
        
        //process the request when ready
        handlerPromise
                .then( handler => handler.process(endpointPathName,request,response));
                .catch( err => utils.sendError(500,"Error handling request: " + err));
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
        workspaceHandler.init(this.workspaceJson);
        //this handler should be ready, return it as a promise that resolves immediately
        return Promise.resolve(workspaceHandler);
        
        //in the future we can return one from the list if one is available
        //or we have to wait until one is ready.
    }
}

module.exports = WorkspaceHandlerStub;


