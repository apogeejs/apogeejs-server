const express = require('express');
const { ActionRunner } = require('./ActionRunner');
const { WorkspaceHandler } = require('./WorkspaceHandler');

//-------------------------------
//debug
DEBUG_NEXT_REQUEST_ID = 1;

function getTimestamp() {
    return new Date().toISOString();
}
//-------------------------------

/** This class manages all requests for a given workspace, with a single workspace supporting one or
 * more endpoints. This instantiates a base model (workspace) instance and identifies the input and output members
 * for each endpoint. When a request comes in it instantiates a workspace handler to do the actual request
 * calculation. */
class WorkspaceManager {

    /** Constructor */
    constructor(apogeeManager,placeholderName) { 
        this.apogeeManager = apogeeManager;

        //identifiers
        this.workspaceName = null;
        this.placeholderName = placeholderName;
        this.uniqueKey = apogeeutil.getUniqueString();
        
        //configuration 
        this.workspaceDescriptor = null;
        this.endpointDescriptorArray = [];
        this.settings = {};
 
        //base model input
        this.modelManager = null;
        this.endpointInfoMap = null;

        //status info
        this.workspaceReady = false;
        this.workspaceShutdown = false;
        this.workspaceError = false;
        this.workspaceErrorMsg = "";

        //routing
        this.router = express.Router();
        this.handler = (req,res,next) => {
            this.router(req,res,next);
        }
    }

    /** This gets the workspace name. It will only be valid after the workspace is loaded. */
    getName() {
        return this.workspaceName;
    }

    /** This gets a display string for the workspace. */
    getDisplayString() {
        if(this.workspaceName) return this.workspaceName;
        else if(this.placeholderName) return "file " + this.placeholderName;
        else return "worskpace key " + this.uniqueKey;
    }

    hasError() {
        return this.workspaceError;
    }

    getErrorMessage() {
        return this.workspaceErrorMsg;
    }

    /** This returns the handler for request to this workspace. */
    getHandler() {
        return this.handler;
    }
    
    /** This method initializes the endpoints for this workspace.  */
    async initWorkspace(workspaceJson) {
        try {
            let {moduleListJson, modelJson} = this._parseWorkspaceJson(workspaceJson);
            
            //load modules if there are any
            if(moduleListJson) {
                this.apogeeManager.loadModules(moduleListJson,this.uniqueKey);
            }

            //create and load the base model
            this.modelManager = new ActionRunner();
            this.modelManager.loadNewModel();

            let loadAction = {};
            loadAction.action = "loadModel";
            loadAction.modelJson = modelJson;

            //run the load action with invalidOK and the error msg prefix
            await this.modelManager.runActionOnModel(loadAction,true,"Error loading base model: ");

            //initialize the endpoint info
            this._populateEndpointInfo();

            this.workspaceReady = true;
        }
        catch(error) {
            let errorMsg = error.message ? error.message : error ? error.toString() : "Unknown";
            this._handleSetupError("Error loading workspace " + this.getDisplayString() + ": " + errorMsg);
        }
    }
    
    shutdown() {
        //nothing for now...
        this.workspaceReady = false;
        this.workspaceShutdown = true;
    }
    
    //====================================
    // Private Methods
    //====================================

    /** This method should be called if there is an error in initialization. */
    _handleSetupError(errorMsg) {
        //just print an error message
        console.log(errorMsg);
        this.workspaceError = true;
        this.workspaceErrorMsg = errorMsg;
    }

    /** This method should be called to process a request. */
    _processRequest(endpointName,request,response) {

        if(!this.workspaceReady) {
            this._doWorkspaceNotReadyResponse(response);
            return;
        }

        try {
            let endpointInfo = this.endpointInfoMap[endpointName];
            if(!endpointInfo) {
                throw new Error("Endpoint not found: " + endpointName + "for workspace " + this.getDisplayString());
            }

            let baseModel = this.modelManager.getModel();
            let workspaceHandler = new WorkspaceHandler(baseModel,this.settings);
            workspaceHandler.handleRequest(request,response,endpointInfo);
        }
        catch(error) {
            response.status(500).send("Unknown error processing request: " + error.toString());
        }
    }

    /** This method will issue a response if the workspace is not ready to handle a request, for whatever reason. */
    _doWorkspaceNotReadyResponse(response) {
        let msg;
        if(this.workspaceError) {
            msg = "Workspace endpoints not available: " + this.getDisplayString() + " Error loading workspace: " + this.workspaceErrorMsg;
        }
        else if(this.workspaceShutdown) {
            msg = "The workspace has already been shutdown: " + this.getDisplayString();
        }
        else {
            msg = "The workspace is being initialized: " + this.getDisplayString();
        }
        response.status(500).send(msg);
    }

    /** This loads the model json from the input text. */
    _parseWorkspaceJson(inputJson) {
        let moduleListJson;
        let modelJson;

        if(inputJson.fileType == "apogee app js workspace") {
            //check version - this throws an error on failure
            this._validateWorkspaceVersion(inputJson);

            //load from workspace
            if((inputJson.references)&&(inputJson.references.refEntries)) {
                moduleListJson = inputJson.references.refEntries;
            }
            
            modelJson = inputJson.code.model;
        }
        else if(inputJson.fileType == "apogee model") {
            //check version - this throws an error on failure
            this._validateModelVersion(inputJson);
            
            //here there can be no references
            modelJson = inputJson;
        }
        else {
            throw new Error("Improper workspace format");
        }

        return {moduleListJson,modelJson};
    }

    
    /** This populates the endpoint information needed by the endpoint handlers */
    _populateEndpointInfo() {
        //load the service descriptor from the model
        this._loadDescriptor();

        //populate the workspace information
        this.workspaceName = this.workspaceDescriptor.name;
        if(!this.workspaceName) throw new Error("Missing name in workspace descriptor");
        this.settings = this.workspaceDescriptor.settings ? this.workspaceDescriptor.settings : {};

        //populate the endpoint information
        this.endpointInfoMap = {};
        this.endpointDescriptorArray.forEach(endpointDescriptor => {
            let endpointInfo = {};

            let endpointName = endpointDescriptor.name;
            if(!endpointName) throw new Error("Missing name in endpoint descriptor");
            if(this.endpointInfoMap[endpointName]) throw new Error("Duplicate endpoint name: " + endpointName);
            
            endpointInfo.path = endpointDescriptor.path;
            if(!endpointInfo.path) throw new Error("Missing path in endpoint descriptor");

            endpointInfo.inputIds = {};
            if(endpointDescriptor.inputs) {
                this._loadMemberIds(endpointDescriptor.inputs,endpointInfo.inputIds);
            }
            
            if(endpointDescriptor.output) {
                endpointInfo.outputId = this._getMemberId(endpointDescriptor.output);
            }

            //either input or output can be missing, but not both
            if((endpointInfo.outputId === undefined)&&(apogeeutil.jsonObjectLength(endpointInfo.inputIds) == 0)) throw new Error("No inputs or outputs - endpoint name: " + endpointName)

            //if we have header inputs, desired keys should be specified
            if(endpointDescriptor.headerKeys) {
                endpointInfo.headerKeys = endpointDescriptor.headerKeys
            }

            //add endpoints to the router
            let handlerFunction = (request,response) => this._processRequest(endpointName,request,response);
            endpointInfo.methods = endpointDescriptor.method ? [endpointDescriptor.method] : endpointDescriptor.methods;
            if((!endpointInfo.methods)||(endpointInfo.methods.length == 0)) throw new Error("No methods specified for endpoint: " + endpointName);
            endpointInfo.methods.forEach(method => {
                method = method.toLowerCase();
                if(WorkspaceManager.SUPPORTED_METHODS.indexOf(method) < 0) throw new Error(`Unsupported method ${method} in endpoint ${endpointName}`);
                this.router[method](endpointInfo.path,handlerFunction);
            })

            this.endpointInfoMap[endpointName] = endpointInfo;
        });
    }

    /** This populates the member ids in the targetIdMap given the member names 
     * in the sourceNameMap.*/
    _loadMemberIds(sourceNameMap,targetIdMap) {
        for(let inputName in sourceNameMap) {
            let memberFullName = sourceNameMap[inputName];
            let memberId = this._getMemberId(memberFullName);
            targetIdMap[inputName] = memberId;
        }
    }

    /** This gets the member id for the given member full name. */
    _getMemberId(memberFullName) {
        let model = this.modelManager.getModel();
        let member = model.getMemberByFullName(model,memberFullName);
        if(!member) {
            throw new Error("Endpoint field not found: " + memberFullName);
        }
        return member.getId();
    }

    /** This method checks if the workspace json is supported. If not an error is thrown. */
    _validateWorkspaceVersion(workspaceJson) {
        if(workspaceJson.version != WorkspaceManager.SUPPORTED_WORKSPACE_VERSION) {   
            throw new Error("Improper workspace version. Required: " + WorkspaceManager.SUPPORTED_WORKSPACE_VERSION + ", Found: " + workspaceJson.version);
        }
    }

    /** This method checks if the model json is supported. If not an error is thrown. */
    _validateModelVersion(modelJson) {
        if(modelJson.version != WorkspaceManager.SUPPORTED_MODEL_VERSION) {   
            throw new Error("Improper model version. Required: " + WorkspaceManager.SUPPORTED_MODEL_VERSION + ", Found: " + modelJson.version);
        }
    }

    /** This method reads the descriptor from the model. */
    _loadDescriptor() {
        let model = this.modelManager.getModel();
        let memberMap = model.getField("memberMap");
        this.endpointDescriptorArray = [];
        for(let id in memberMap) {
            let member = memberMap[id];
            if(member.isMember) {
                if(member.getName().startsWith("_workspaceDescriptor")) {
                    this.workspaceDescriptor = member.getData();
                }
                else if(member.getName().startsWith("_endpointDescriptor")) {
                    let endpointDescriptor = member.getData();
                    this.endpointDescriptorArray.push(endpointDescriptor);
                }
            }
        }

        //some error checking
        if(!this.workspaceDescriptor) throw new Error("Workspace descriptor missing!");
        if(this.endpointDescriptorArray.length == 0) throw new Error("No endpoint descriptors found!");
    }

}

//this is the supported version of the workspace.
WorkspaceManager.SUPPORTED_WORKSPACE_VERSION = "0.60";
WorkspaceManager.SUPPORTED_MODEL_VERSION = 0.3;

//these are the supported mehods for the service 
//it should just be the list of methods from Express, plus "all"
//We should preferbly let Express tell use which methods they support, for when the add new methods
WorkspaceManager.SUPPORTED_METHODS = [
    "all",
    "checkout",
    "copy",
    "delete",
    "get",
    "head",
    "lock",
    "merge",
    "mkactivity",
    "mkcol",
    "move",
    "m-search",
    "notify",
    "options",
    "patch",
    "post",
    "purge",
    "put",
    "report",
    "search",
    "subscribe",
    "trace",
    "unlock",
    "unsubscribe"
]

module.exports.WorkspaceManager = WorkspaceManager;


