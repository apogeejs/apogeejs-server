var apogee = require('./apogee-npm-lib');
const { Handler } = require('./Handler');

//this defines some globals we will be needing
require('./debugHook');

/** This class handles the enpoints associate with a single apogee workspace. \
 * NOTES:
 * -We do not handle the following cases for now:
 * -- timeout
 * -- too many iterations.
 * */
class WorkspaceHandler extends Handler {
    
    /** Constuctor. Takes the workspace info and the applicable server settings. */
    constructor(workspaceInfo,settings) {
        super();
        
        //configuratino and settings
        this.workspaceInfo = workspaceInfo;
        this.settings = settings;
        
        //the apogee workspace object
        this.workspace = null;
        
        //this defines the endpoints serviced by this workspace
        this.endpoints = null;
        
        //this is used for the member update listener on the workspace, to
        //react when a table of interest is updated.
        this.memberUpdateEntries = {};
        
        this.setStatus(Handler.STATUS_NOT_READY);
    }
    
    /** This method initializes the handler with the headless workspace json,
     * which is the JSON representing the headless workspace, not the whole
     * workspace saved from the app, which includes UI info. 
     * It returns a promise that resovles with the value of the handler status
     * once initailization is complete. */
    init(headlessWorkspaceJson) {
        try {
            //-----------------------
            // Initialize workspace instance
            //-----------------------

            //create the workspace
            this.workspace = new apogee.Workspace(headlessWorkspaceJson);

            //add the member update listener
            this.workspace.addListener(apogee.updatemember.MEMBER_UPDATED_EVENT, member => this._onWorkspaceMemberUpdate(member));      

            //-----------------------
            // Initialize endpoint data structure
            //-----------------------
            this.endpoints = {};
            for(var endpointName in this.workspaceInfo.endpoints) {
                var endpointSettings = this.workspaceInfo.endpoints[endpointName];
                var endpointData = {};
                this.endpoints[endpointName] = endpointData;

                //get the input tables
                endpointData.inputMembers = this._loadMemberFromSettings(this.workspace,endpointSettings.inputs);
                endpointData.outputMembers = this._loadMemberFromSettings(this.workspace,endpointSettings.outputs);
            }

            //--------------------------------
            // Return promise for when workspace is ready
            //--------------------------------
            var workspaceReadyPromise = this._getWorkspaceReadyPromise();

            //update the handler status when the workspace is ready
            var workspaceGoodCallback = () => {
                this.setStatus(Handler.STATUS_READY);
                return this.getStatus();
            }
            var workspaceErrorCallback = errMsg => {
                this.setStatusError("error: initialization failed: " + errMsg);
                return this.getStatus();
            }
            
            return workspaceReadyPromise.then(workspaceGoodCallback).catch(workspaceErrorCallback);
        }
        catch(error) {
            //store the error status and return a promise that resolves immediately
            console.error(error.stack);
            this.setStatusError(error.message);
            return Promise.resolve(this.status);
        }
    }
    
    /** This method handles a request. */
    process(endpointPathname,queryString,request,response) {      
        
        //make sure we are ready
        if(this.isHandlerNotReady(response)) return;
        
        //set status for being in use
        this.setStatus(WorkspaceHandler.STATUS_BUSY);
        
        //endpointPathname should just be the endpoint name
        var endpointData = this.endpoints[endpointPathname];
        
        if(!endpointData) {
            this.sendError(404,"Endpoint Resource not found",response);
            //we are ready = no cleanup needed
            this.setStatus(Handler.STATUS_READY);
            return;
        }
 
        //------------------------------------
        //write the inputs - create an array of promises for update instructions
        //------------------------------------

        //this is a list of promises, each giving the action data to update an input table
        var inputUpdateActionPromises = this._loadInputUpdateActionPromises(endpointData,queryString,request);

        //do the update action when the all inputs are completed
        var handleInputUpdateLoad = inputUpdateActions => this._doInputAction(inputUpdateActions,endpointData,response)
        var handleInputLoadError = err => this.sendError(500,"Error loading request body: " + err,response);
        Promise.all(inputUpdateActionPromises).then(handleInputUpdateLoad).catch(handleInputLoadError);
    }
    
    /** This should be called when this handler is being shutdown. */
    shutdown() {
        //no cleanup for now
        this.setStatus(Handler.STATUS_SHUTDOWN);
    }
    
    //===========================================
    // Private Methods
    //===========================================
    
    //----------------------------
    // Response Processing methods
    //----------------------------

    /** This method loads the action data to update the input tables. It returns
     * an array of promises, one for each table to update. */
    _loadInputUpdateActionPromises(endpointData,queryString,request) {
        //------------------------------------
        //write the inputs - create an array of promises for update instructions
        //------------------------------------
        var inputUpdateActionPromises = [];
        
        //get query params if applicable
        if(endpointData.inputMembers.queryTable) {
            var queryJson = this._getQueryJson(queryString); 
            var queryActionData = {};
			queryActionData.action = "updateData";
            queryActionData.member = endpointData.inputMembers.queryTable;
            queryActionData.data = queryJson;

            inputUpdateActionPromises.push(Promise.resolve(queryDataAction));
        }

        //get any input trigger table data, if applicable
        if(endpointData.inputMembers.trigger) {
            //just write canned value
            var cannedValue = endpointData.inputTriggerValue ? endpointData.inputTriggerValue : true;
            var triggerActionData = {};
            triggerActionData.action = "updateData";
            triggerActionData.member = endpointData.inputMembers.trigger;
            triggerActionData.data = cannedValue;

            inputUpdateActionPromises.push(Promise.resolve(triggerActionData));
        }
 
        //get the input request body data, if applicable
        if(endpointData.inputMembers.body) {
            //write the body into the body table, when ready
            var bodyReadPromise = this.readBodyPromise(request);

            var createBodyActionData = body => {
                var bodyActionData = {};
                bodyActionData.action = "updateData";
                bodyActionData.member = endpointData.inputMembers.body;
                bodyActionData.data = JSON.parse(body);
                return bodyActionData;
            }
            
            var bodyActionDataPromise = bodyReadPromise.then(createBodyActionData);
            
            inputUpdateActionPromises.push(bodyActionDataPromise);
        }

        return inputUpdateActionPromises;
    }
    
    /** This method updates the input for the workspace for the given request. */
    _doInputAction(inputUpdateActions,endpointData,response) {
            
        if(inputUpdateActions.length > 0) {
            //submit all these updates to the workspace
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
                this.sendError(500,actionResponse.getErrorMsg(),response);
                return;
            }  
        }
        else {
            //no inputs to submit, just check result
        }

        //process output when the workspace is ready
        var workspaceReadyPromise = this._getWorkspaceReadyPromise();

        var handleResultSuccess = () => this._onProcessSuccess(endpointData,response);
        var handleResultFailure = errorMsg => this._onProcessError(errorMsg,endpointData,response);
        workspaceReadyPromise.then(handleResultSuccess).catch(handleResultFailure);
    }
    
    /** This method will be called when the the calculation completes and
     * the output table is ready. */
    _onProcessSuccess(endpointData,response) {
        
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
    _onProcessError(errorMsg,endpointData,response) {
        //send the error response
        this.sendError(500,errorMsg,response);
        
        //cleanup after request
        this._doCleanup();
    }
    
    /** This prepares the handler to be used again. */
    _doCleanup() {
        //for now we are not reusing
        this.setStatus(WorkspaceHandler.STATUS_NOT_READY);
        
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

    /** This method returns a promise that resolves when the workspace is 
     * update to date with no errors, and rejects if the workspace has an error.
     * It uses the status of the root folder.
     */
    _getWorkspaceReadyPromise() {
        //return - we are ready immediately or there is something asynchronous
        //happening. We can check the root folder to figure out which
        var rootFolder = this.workspace.getRoot();
        if(rootFolder.getResultPending()) {
            //watch root folder waiting for it to become ready
            //after it is, set the status and return the resulting promise.
            var workspaceReadyPromise = this._createMemberUpdatePromise(rootFolder);
            var returnTheStatus = () => this.status;
            return workspaceReadyPromise
        }
        else {
            //workspace ready
            //return a promise that resolves immediately
            if(rootFolder.hasError()) {
                //workspace error - reject promise
                return Promise.reject();
            }
            else {
                //no workspace error - resolve promise
                return Promise.resolve();
            }
        }
    }
    
}

//A new status for this handler
WorkspaceHandler.STATUS_BUSY = "busy";

module.exports.WorkspaceHandler = WorkspaceHandler;

