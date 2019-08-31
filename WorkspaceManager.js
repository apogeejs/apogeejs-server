var fs = require('fs');
const { WorkspaceHandler } = require('./WorkspaceHandler');

//-------------------------------
//debug
DEBUG_NEXT_REQUEST_ID = 1;

function getTimestamp() {
    return new Date().toISOString();
}
//-------------------------------

class WorkspaceManager {
    /** Constructor */
    constructor(workspaceName,workspaceInfo,settings) {      
        this.workspaceName = workspaceName;
        this.workspaceInfo = workspaceInfo;
        this.settings = settings;
        this.headlessWorkspaceJson = null;

        this.handlers = [];
        this.requestQueue = [];

        this.workspaceError = false;
    }
    
    /** This method initializes the endpoints for this workspace.  */
    initEndpoints(app) {
        //create endpoints for this workspace
        for(let endpointName in this.workspaceInfo.endpoints) {
            let handlerFunction = (request,response) => this._processRequest(endpointName,request,response);
            let path = "/" + this.workspaceName + "/" + endpointName;
            app.post(path,handlerFunction);
        }

        //load the workspace json
        fs.readFile(this.workspaceInfo.source, (err,workspaceText) => this._onWorkspaceRead(err,workspaceText));  //load from source  
    }

    /** This method is called when a handler changes to READY, ERROR or SHUTDOWN. Ity does not need to be called
     * if the status goes to NOT_READY or BUSY. This is used to update our handler list and process our
     * queued actions. This is done asynchronously. */
    onHandlerStatus(handler) {
        let handlerAction;

        switch(handler.getStatus()) {
            case WorkspaceHandler.STATUS_READY:
                handlerAction = () => this._handlerReady(handler);
                break;

            case WorkspaceHandler.STATUS_ERROR:
                handlerAction = () => this._handlerError(handler);
                break;

            case WorkspaceHandler.STATUS_SHUTDOWN:
                handlerAction = () => this._handlerShutdown(handler);
                break;

            default:
                //no op for other statuses
                break;
        }

        //Do our handler action asynchronously
        if(handlerAction) {
            setTimeout(handlerAction,0);
        }

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
        this.workspaceError = true;
    }

    /** This method should be called to process a request. */
    _processRequest(endpointName,request,response) {

        let requestInfo = {};
        requestInfo.endpointName = endpointName;
        requestInfo.request = request;
        requestInfo.response = response;
        requestInfo.debugId = DEBUG_NEXT_REQUEST_ID++;

        if(this.workspaceError) {
            response.status(500).send("Workspace endpoints unavailable: " + this.workspaceName);
            return;
        }
        
        let handler = this._getAvailableHandler();
        if(handler) {
console.log("DEBUG: " + getTimestamp() + ": Request with handler ready. Request=" + requestInfo.debugId + "; Handler=" + handler.debugId);
            //if there is a handler available use it
            handler.handleRequest(requestInfo);
        }
        else {
console.log("DEBUG: " + getTimestamp() + ": Request queued. Request=" + requestInfo.debugId);

            //otherwise queue this request
            this._queueRequest(requestInfo);

            //make a new handler if we need to
            this._createNewHandlerIfNeeded();
        }

    }

    /** This stores the workspace json given the workspace file text. */
    _onWorkspaceRead(err,workspaceText) {
        if(err) {
            this._handleSetupError("Source data not loaded: " + err);
            return;
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

                //see if we need to instantiate any handlers
                this._createNewHandlerIfNeeded();
            }
        }
    }

    //----------------------------------------
    // Request Queue and Handler Cache Methods
    //----------------------------------------

    _getAvailableHandler() {
        let availableHandler = this.handlers.find(handler => (handler.getStatus() == WorkspaceHandler.STATUS_READY));
        return availableHandler;
    }

    _queueRequest(requestInfo) {
        //queue the request
        this.requestQueue.push(requestInfo);
    }

    /** This method will instantiate a new handler if one is needed. */
    _createNewHandlerIfNeeded() {
console.log("DEBUG: " + getTimestamp() + ": Create handler check. ");
        //no creation if there is a workspace error
        if(this.workspaceError) return;

        let totalNumHandlers = this.handlers.length;

        //get the number of handlers that are waiting to be ready
        let numPendingHandlers = this.handlers.reduce( (count,handler) => {
            return (handler.getStatus() == WorkspaceHandler.STATUS_NOT_READY) ? count+1 : count;
        },0);

        if(this.settings.createHandlersOnDemand) {
            //do not cache handlers
            //make handlers when requests come in
            //keep the number of handlers equal to the number of requests waiting for a handler
            if(numPendingHandlers < requestQueue.length) {
                this._instantiateNewHandler();
            }
        }
        else if(totalNumHandlers < this.settings.minHandlerCount) {
            //cache handlers
            //make a new handler if we are below the minimum
            this._instantiateNewHandler();
        }
        else if(totalNumHandlers < this.settings.maxHandlerCount) {
            //cache handlers
            //make a new one if we are below the max and we have more waiting requests than pending handlers

            //make a new handler if we are not at the maximum handler number and there are fewer handlers
            //pending than there are queued requests
            if(numPendingHandlers < this.requestQueue.length) {
                this._instantiateNewHandler();
            }
        }
    }

    /** This makes a new handler. */
    _instantiateNewHandler() {
        let handler = new WorkspaceHandler(this,this.workspaceInfo,this.settings);

        this.handlers.push(handler);
        handler.init(this.headlessWorkspaceJson);

        //see if we need to make any more handlers, but wait to do it
        setTimeout(() => this._createNewHandlerIfNeeded(),this.settings.handlerSuccessiveCreateDelay);
    }

    /** When this method is called we check if a queued request needs a handler. */
    _handlerReady(handler) {
        if(this.requestQueue.length > 0) {
            let requestInfo = this.requestQueue.shift();
console.log("DEBUG: " + getTimestamp() + ": Handler ready for queued request. Request=" + requestInfo.debugId + "; Handler=" + handler.debugId);
            handler.handleRequest(requestInfo);
        }
    }
    
    /** When this method is called we will kill this handler. */
    _handlerError(handler) {
        this._removeHandler(handler);
        handler.shutdown();
    }
    
    /** When we get this request we need to make sure we don't trying to use this handler. */
    _handlerShutdown(handler) {
        this._removeHandler(handler);
    }

    /** This method removes a handler from the handler list. */
    _removeHandler(handlerToRemove) {
console.log("DEBUG: " + getTimestamp() + ": Remove handler: " + handlerToRemove.debugId);

        //update the handler list, with this removed
        this.handlers = this.handlers.filter( listHandler => (handlerToRemove !== listHandler));

        //check if we need to make a new handler
        this._createNewHandlerIfNeeded();
    }
}

//this is the supported version of the workspace.
WorkspaceManager.SUPPORTED_WORKSPACE_VERSION = .2;

module.exports.WorkspaceManager = WorkspaceManager;


