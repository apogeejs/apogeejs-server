var apogee = require('./apogee-npm-lib');
var utils = require('./serviceUtils');

/** This class handles the enpoints associate with a single apogee workspace. \
 * NOTES:
 * -We do not handle the following cases for now:
 * -- timeout
 * -- too many iterations.
 * */
class WorkspaceHandler {
    
    /** Constuctor. Takes the workspace info and the applicable server settings. */
    constructor(workspaceInfo,settings) {
        
        //settings
        this.workspaceInfo = workspaceInfo;
        this.settings = settings;
        
        //the apogee workspace object
        this.workspace = null;
        
        //this defines the endpoints serviced by this workspace
        this.endpoints = null;
        
        //this is used for the member update listener on the workspace, to
        //react when a table of interest is updated.
        this.memberUpdateEntries = {};
        
        //these hold the status
        this.status = WorkspaceHandler.NOT_READY;
        this.statusMsg = null;
    }
    
    /** This returns the status of the handler. */
    getStatus() {
        return this.status;
    }
    
    /** This returns a status message, which should be set in the case 
     * the status is WorkspaceHandler.STATUS_ERROR. */
    getStatusMsg() {
        return this.statusMsg;
    }
    
    /** This method initializes the handler with the headless workspace json,
     * which is the JSON representing the headless workspace, not the whole
     * workspace saved from the app, which includes UI info. 
     * It returns a promise that resovles with the value of the handler status. */
    initPromise(headlessWorkspaceJson) {
        try {
            //create the workspace
            this.workspace = new apogee.Workspace(headlessWorkspaceJson);

            //add the member update listener
            this.workspace.addListener(apogee.updatemember.MEMBER_UPDATED_EVENT, member => this._onWorkspaceMemberUpdate(member));      

            //for each endpoint, get the input and output tables
            this.endpoints = {};
            for(var endpointName in this.workspaceInfo.endpoints) {
                var endpointSettings = this.workspaceInfo.endpoints[endpointName];
                var endpointData = {};
                this.endpoints[endpointName] = endpointData;

                //get the input tables
                endpointData.inputMembers = this._loadMemberFromSettings(this.workspace,endpointSettings.inputs);
                endpointData.outputMembers = this._loadMemberFromSettings(this.workspace,endpointSettings.outputs);
                
                //verify there is at least on output member
                if(this._getCount(endpointData.outputMembers)==0) {
                    throw new Error("There must be at least one valid output table! Endpoint name = " + endpointName);
                }
            }

            //return - we are ready immediately or there is something asynchronous
            //happening. We can check the root folder to figure out which
            var rootFolder = this.workspace.getRoot();
            if(rootFolder.getResultPending()) {
                //watch root folder waiting for it to become ready
                //after it is, set the status and return the resulting promise.
                var workspaceReadyPromise = this._createMemberUpdatePromise(rootFolder);
                var workspaceGoodCallback = () => this._setStatusReady();
                var workspaceErrorCallback = errMsg => this._setStatusError("error: initialization failed: " + errMsg);
                var returnTheStatus = () => this.status;
                return workspaceReadyPromise.then(workspaceGoodCallback).catch(workspaceErrorCallback).then(returnTheStatus);
            }
            else {
                //workspace ready
                //return a promise that resolves immediately
                this._setStatus(WorkspaceHandler.STATUS_READY);
                return Promise.resolve(this.status);
            }
        }
        catch(error) {
            //store the error status and return a promise that resolves immediately
            console.error(error.stack);
            this._setStatusError(error.message);
            return Promise.resolve(this.status);
        }
    }
    
    /** This method handles a request. */
    process(endpointPathname,queryString,request,response) {      
        
        //make sure we are ready
        if(this.status != WorkspaceHandler.STATUS_READY) {
            utils.sendError(500,"Endpoint in improper state: " + this.status,response);
            return;
        }
        
        //set status for being in use
        this._setStatus(WorkspaceHandler.STATUS_BUSY);
        
        //endpointPathname should just be the endpoint name
        var endpointData = this.endpoints[endpointPathname];
        
        if(!endpointData) {
            utils.sendError(403,"Endpoint Resource not found",response);
            //we are ready = no cleanup needed
            this._setStatus(WorkspaceHandler.STATUS_READY);
            return;
        }
        
        //-------------------------------
        //configure the output change listener to react to request completion
        //-------------------------------
        if(endpointData.outputMembers.body) {
            var responseReadyPromise = this._createMemberUpdatePromise(endpointData.outputMembers.body);
            responseReadyPromise.then( () => this._onProcessSuccess(response,endpointData)).catch(errorMsg => this._onProcessError(response,endpointData,errorMsg)); 
        }
        else if(endpointData.outputMembers.trigger) {
            var requestCompletedPromise = this._createMemberUpdatePromise(endpointData.outputMembers.trigger);
            requestCompletedPromise.then( () => this._onProcessSuccess(response,endpointData)).catch(errorMsg => this._onProcessError(resposne,endpointData,errorMsg));
        }
        else {
            //we should catch this error elsewhere, and not reach here
            utils.sendError(403,"Bad endpoint configuration",response);
            //we are ready = no cleanup needed
            //we will not mark this as an error status here
            this._setStatus(WorkspaceHandler.STATUS_READY);
            return;
        }
 
        //------------------------------------
        //write the inputs
        //------------------------------------
        var inputUpdateActions = [];
        
        //get query params if applicable, write them below with all inputs together
        if(endpointData.inputMembers.queryTable) {
            var queryJson = this._getQueryJson(queryString); 
            var queryActionData = {};
			queryActionData.action = "updateData";
            queryActionData.member = endpointData.inputMembers.queryTable;
            queryActionData.data = queryJson;
            inputUpdateActions.push(queryDataAction);
        }
 
        //set the input data (body or just load the trigger data)
        if(endpointData.inputMembers.body) {
            //write the body into the body table, when ready
            utils.readBody(request,response, (request,response,body) => {
                var bodyActionData = {};
                bodyActionData.action = "updateData";
                bodyActionData.member = endpointData.inputMembers.body;
                bodyActionData.data = JSON.parse(body);
                inputUpdateActions.push(bodyActionData);
                
                //set the input tables after body loaded
                this._doInputAction(inputUpdateActions,response);
            });
        }
        else if(endpointData.inputMembers.trigger) {
            //just write canned value
            var cannedValue = endpointData.inputTriggerValue ? endpointData.inputTriggerValue : true;
            var triggerActionData = {};
            triggerActionData.action = "updateData";
            triggerActionData.member = endpointData.inputMembers.trigger;
            triggerActionData.data = cannedValue;
            inputUpdateActions.push(triggerActionData);
                
            //set the input tables after body loaded
            this._doInputAction(inputUpdateActions,response);
        }
        else if(endpointData.inputMembers.queryTable){
            //the only input table is the query table - write that data 
            this._doInputAction(inputUpdateAction,response);
        }
        else {
            //no input data or trigger - we just want to read from the workspace
            this._onProcessSuccess(response,endpointData);
        }
       
    }
    
    /** This should be called when this handler is being shutdown. */
    shutdown() {
        //no cleanup for now
        this._setStatus(WorkspaceHandler.STATUS_NOT_READY);
    }
    
    //===========================================
    // Private Methods
    //===========================================
    
    //----------------------------
    // Response Processing methods
    //----------------------------
    
    /** This method updates the input for the workspace for the given request. */
    _doInputAction(inputUpdateActions,response) {
        var compoundActionData = {};
        compoundActionData.action = apogee.compoundaction.ACTION_NAME;
        compoundActionData.workspace = this.workspace;
        compoundActionData.actions = inputUpdateActions;
        
        var actionResponse = apogee.action.doAction(compoundActionData,false);        
        if(actionResponse.getSuccess()) {
            //let the output listener handle the result from here
        }
        else {
            //error executing action!
            utils.sendError(500,actionResponse.getErrorMsg(),response);
        }  
    }
    
    /** This method will be called when the the calculation completes and
     * the output table is ready. */
    _onProcessSuccess(response,endpointData) {
        
        response.writeHead(200, {"Content-Type":"text/plain"});
        
        //write the body, if applicable
        if(endpointData.outputMembers.body) {
            var outputString = endpointData.outputMembers.body.getData();
            var responseBody = JSON.stringify(outputString);
            response.write(responseBody);
        }

        //send response
        response.end();
        
        //cleanup after request
        this._doCleanup();
    }
    
    /** This method will be called when the calculation has an error in the
     * output table. */
    _onProcessError(response,endpointData,errorMsg) {
        //send the error response
        utils.sendError(500,errorMsg,response);
        
        //cleanup after request
        this._doCleanup();
    }
    
    /** This prepares the handler to be used again. */
    _doCleanup() {
        //for now we are not reusing
        this._setStatus(WorkspaceHandler.STATUS_NOT_READY);
        
        //when we do, we need to set the initial values back in the input tables
        //using the endpoint data, which we will need to pass in
        //and when the table is ready again, update the status.
    }
    
    //--------------------------------
    // Utilities
    //--------------------------------
    
    _getCount(object) {
        var count = 0;
        for(var key in object) {
            count++;
        }
        return count;
    }
    
    _setStatus(status,statusMsg) {
        this.status = status;
        this.statusMsg = statusMsg;
    }
    
    _setStatusError(statusMsg) {
        this.status = WorkspaceHandler.STATUS_ERROR;
        this.statusMsg = statusMsg;
    }
    
    /** This method loads the member objects from the paths from the settings. */
    _loadMemberFromSettings(workspace,sourceMemberMap) {
        var outputMemberMap = {};
            
        for(var memberMapKey in sourceMemberMap) {
            var memberFullName = sourceMemberMap[memberMapKey];

            //load whatever data is needed for input tables
            var member = workspace.getMemberByFullName(memberFullName);
            if(member) {
                outputMemberMap[memberMapKey] = member;
            }
            else {
                //table not found!
                throw new Error("Memer not found: " + memberMapKey + " - " + memberPath);
            }
        }
        
        return outputMemberMap;
    }
    
    /** This returns a map of query keys to values. 
     * multi values currently not supported. */
    _getQueryJson(queryString) {
        if(queryString) {
            var queryEntryPairs = queryString.split("&").split("=");
            var queryEntryMap = {};
            queryEntryPairs.forEach(pair => {
                queryEntryMap[pair[0]] = pair[1];
            })
            return queryEntryMap;
        }
        else {
            return {};    
        }
    }
    
    //-------------------------------
    // Output status listener methods
    //-------------------------------
    
    /** This is the method called from workspace on member update, to check
     * if any table of interest to us have updated. */
    _onWorkspaceMemberUpdate(member) {
        //check if there are listeners for this member
        var memberUpdateEntry = this.memberUpdateEntries[member.getFullName()];
        if(memberUpdateEntry) {
            //check if we have an update event. If so, call listener               
            if((member.getResultInvalid())||(member.getResultPending())) {
                //no action - wait for update
                return;
            }
            else if(member.hasError()) {
                //error!
                //create error message
                var errorMsg = "";
                var actionErrors = member.getErrors();
                for(var i = 0; i < actionErrors.length; i++) {
                    errorMsg += actionErrors[i].msg + "\n";
                }
                //reject promise
                memberUpdateEntry.promiseRejectFunction(errorMessage);
                
                //remove this entry!
                delete this.memberUpdateEntries[member.getFullName()];
            }
            else {
                //success!
                memberUpdateEntry.promiseResolveFunction();
                
                //remove this entry!
                delete this.memberUpdateEntries[member.getFullName()];
            }
        }
    }

        
    /** This method returns a promise that resolvbes or rejects then the given 
     * member of the workspace is updated. 
     * NOTE - we are only allowing one entry for a given member at a time, which 
     * should be all we need. */
    _createMemberUpdatePromise(member) {
        
        //we are only allowing one entry - make sure there is not one here. For now we will just write a msg to console
        if(this.memberUpdateEntries[member.getFullName()] !== undefined) {
            console.log("We are goign to overwrite an entry! Why is this happening?");
        }
        
        var memberUpdateEntry = {}
        var memberUpdatePromise = new Promise( (resolve,reject) => {
            memberUpdateEntry.promiseResolveFunction = resolve;
            memberUpdateEntry.promiseRejectFunction = reject;
        });

        //add to list
        this.memberUpdateEntries[member.getFullName()] = memberUpdateEntry;

        return memberUpdatePromise;
    } 
    
}

//status values
WorkspaceHandler.STATUS_NOT_READY = "not ready";
WorkspaceHandler.STATUS_READY = "ready";
WorkspaceHandler.STATUS_BUSY = "busy";
WorkspaceHandler.STATUS_ERROR = "error";
WorkspaceHandler.STATUS_SHUTDOWN = "shutdown";


   
module.exports.WorkspaceHandler = WorkspaceHandler;

