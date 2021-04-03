const fs = require('fs');
const path = require('path');
const { ActionRunner } = require('./ActionRunner');
const { WorkspaceHandler } = require('./WorkspaceHandler');
const apogee = require('../apogeejs-model-lib/src/apogeejs-model-lib.js');
const Model = apogee.Model;
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
class WorkspaceManager extends ActionRunner {

    /** Constructor */
    constructor(workspaceName,workspaceConfig,settings) { 
        super();

        //configuration 
        this.workspaceName = workspaceName;
        this.workspaceConfig = workspaceConfig;
        this.settings = settings;
 
        //base model input
        this.baseModel = null;
        this.endpointInfoMap = null;

        //status info
        this.workspaceReady = false;
        this.workspaceShutdown = false;
        this.workspaceError = false;
        this.workspaceErrorMsg = "";
    }
    
    /** This method initializes the endpoints for this workspace.  */
    initEndpoints(app) {
        //create endpoints for this workspace
        for(let endpointName in this.workspaceConfig.endpoints) {
            //add endpoints to app
            let handlerFunction = (request,response) => this._processRequest(endpointName,request,response);
            let path = "/" + this.workspaceName + "/" + endpointName;
            //for now we are automatically adding a listener for get and post. We might want to make
            //this optional or at least dependent on whether or not there is a body
            app.post(path,handlerFunction);
            app.get(path,handlerFunction);
        }

        //load the workspace json
        let sourcePath = path.join(this.settings.serverDir,this.workspaceConfig.source);
        fs.readFile(sourcePath, (err,workspaceText) => this._onWorkspaceRead(err,workspaceText));  //load from source  
    }
    
    shutdown() {
        //nothing for now...
        this.workspaceReady = false;
        this.workspaceShutdown = true;
    }

    //---------------------------------
    //implementations for action runner
    //---------------------------------

    /** This function will be called when the action and any subsequent asynchronous actions complete. */
    onActionCompleted() {
        try {
            //save the base model
            this.baseModel = this.getModel();

            //initialize the endpoint info
            this._populateEndpointInfo();

            //set workspace readh
            this.workspaceReady = true;
        }
        catch(error) {
            this._handleSetupError(error.message);
        }
    }

    /** This funtion will be called if there is an error running the action. */
    onActionError(msg) {
        this._handleSetupError(msg);
    };
    
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
                throw new Error("Endpoint not found: " + endpointName + "for workspace " + this.workspaceName);
            }

            let workspaceHandler = new WorkspaceHandler(this.baseModel,this.settings);
            workspaceHandler.handleRequest(request,response,endpointInfo);
        }
        catch(error) {
            response.status(500).send("Unknown error processing request: " + error.message);
        }
    }

    /** This method will issue a response if the workspace is not ready to handle a request, for whatever reason. */
    _doWorkspaceNotReadyResponse(response) {
        let msg;
        if(this.workspaceError) {
            msg = "Workspace endpoints not available: " + this.workspaceName + " Error loading workspace: " + this.workspaceErrorMsg;
        }
        else if(this.workspaceShutdown) {
            msg = "The workspace has already been shutdown: " + this.workspaceName;
        }
        else {
            msg = "The workspace is being initialized: " + this.workspaceName;
        }
        response.status(500).send(msg);
    }


    /** This stores the workspace json given the workspace file text. */
    _onWorkspaceRead(err,workspaceText) {
        if(err) {
            this._handleSetupError("Source data not loaded: " + err);
            return;
        }
        else {
            try {
                let modelJson = this._getModelJson(workspaceText);
                
                if(modelJson.version != WorkspaceManager.SUPPORTED_WORKSPACE_VERSION) {   
                    this._handleSetupError("Improper workspace version. Required: " + WorkspaceManager.SUPPORTED_WORKSPACE_VERSION + ", Found: " + this.headlessWorkspaceJson.version);
                }
                else {
                    //create and load the base model
                    let model = new Model(this.getModelRunContext());
                    this.setModel(model);

                    let loadAction = {};
                    loadAction.action = "loadModel";
                    loadAction.modelJson = modelJson;
                    //run the load action with invalidOK and the error msg prefix
                    this.runActionOnModel(loadAction,true,"Error loading base model: ");
                }
            }
            catch(error) {
                this._handleSetupError("Error loading workspace: " + error.message);
            }
        }
    }

    /** This loads the model json from the input text. */
    _getModelJson(inputText) {
        let inputJson = JSON.parse(inputText);
        if(inputJson.fileType == "apogee app js workspace") {
            return inputJson.code.model;
        }
        else if(inputJson.fileType == "apogee model") {
            return inputJson;
        }
        else {
            throw new Error("Improper workspace format");
        }
    }

    
    /** This populates the endpoint information needed by the endpoint handlers */
    _populateEndpointInfo() {
        //populate the endpoint information
        this.endpointInfoMap = {};
        for(let endpointName in this.workspaceConfig.endpoints) {
            //create the endpoint info
            let endpointConfig = this.workspaceConfig.endpoints[endpointName];
            let endpointInfo = {};

            //get the input member ids, if applicable
            endpointInfo.inputIds = {};
            if(endpointConfig.inputs) {
                this._loadMemberIds(endpointConfig.inputs,endpointInfo.inputIds);
            }
            
            //get the return value member id, if applicable
            if(endpointConfig.output) {
                endpointInfo.outputId = this._getMemberId(endpointConfig.output);
            }

            if(endpointConfig.headerKeys) {
                endpointInfo.headerKeys = endpointConfig.headerKeys
            }

            this.endpointInfoMap[endpointName] = endpointInfo;
        }
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
        let member = this.baseModel.getMemberByFullName(this.baseModel,memberFullName);
        if(!member) {
            throw new Error("Endpoint field not found: " + memberFullName);
        }
        return member.getId();
    }

}

//this is the supported version of the workspace.
WorkspaceManager.SUPPORTED_WORKSPACE_VERSION = .3;

module.exports.WorkspaceManager = WorkspaceManager;


