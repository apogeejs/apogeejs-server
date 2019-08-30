var apogee = require('./apogee-npm-lib');

//this defines some globals we will be needing
require('./debugHook');

/** This class handles the enpoints associate with a single apogee workspace. \
 * NOTES:
 * -We do not handle the following cases for now:
 * -- timeout
 * -- too many iterations.
 * */
class WorkspaceHandler {
    
    /** Constuctor. Takes the workspace info and the applicable server settings. */
    constructor(workspaceInfo,settings) {
        super();
        
        //configuration and settings
        this.workspaceInfo = workspaceInfo;
        this.settings = settings;
        
        //the apogee workspace object
        this.workspace = null;
        
        //this defines the endpoints serviced by this workspace
        this.endpoints = null;

        //these hold the status
        this.status = WorkspaceHandler.STATUS_NOT_READY;
        this.statusMsg = null;
    }

    
    //---------------------------
    // Handler Status Methods
    //---------------------------
    
    /** This returns the status of the handler. */
    getStatus() {
        return this.status;
    }
    
    /** This returns a status message, which should be set in the case 
     * the status is WorkspaceHandler.STATUS_ERROR. */
    getStatusMsg() {
        return this.statusMsg;
    }
    
    setStatus(status,statusMsg) {
        this.status = status;
        this.statusMsg = statusMsg;
    }
    
    setStatusError(statusMsg) {
        this.status = WorkspaceHandler.STATUS_ERROR;
        this.statusMsg = statusMsg;
    }
    
    //--------------------
    // Initialization
    //--------------------
    
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
            
//////////////////////////////////////
//FIX THIS PROBLEM IN BETTER WAY
let requireEntry = {};
requireEntry.data = {};
requireEntry.data.require = require;
this.workspace.contextManager.addToContextList(requireEntry);
///////////////////////////////////////

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

                //store the input initial values
                endpointData.inputInitialValues = this._getInitialValues(endpointData.inputMembers);
            }

            //--------------------------------
            // Return promise for when workspace is ready, giving the handler status
            //--------------------------------
            let generateWorkspaceReadyPromise = () => this._getWorkspaceReadyPromise();
            let setStatusFunction = () => this._setInitStatus();

            //temporary workaround====================================================================
            //in the current release I need this delay or else I will miss asynch messenger updates
            //this should not be needed in the literate page releases
            var delay10 = new Promise( (resolve,reject) => {
                setTimeout(() => resolve(),10);
            })
            //========================================================================================
            
            //return a promise that gives the status
            return delay10.then(generateWorkspaceReadyPromise).then(setStatusFunction).catch(errorMsg => this.setStatusError(errorMsg)).then(() => this.status);
        }
        catch(error) {
            //store the error status and return a promise that resolves immediately
            console.error(error.stack);
            this.setStatusError(error.message);
            return Promise.resolve(this.status);
        }
    }

    //--------------------
    // Request Handler
    //--------------------
    
    /** This method handles a request. */
    handleRequest(endpointData,request,response) {      
        
        //This shouldn't happen - but make sure we are ready
        if(this.status != WorkspaceHandler.STATUS_READY) {
            response.status(500).send("Unknown Error: endpoing not in ready state");
            return;
        }

        //set status for being in use
        this.setStatus(WorkspaceHandler.STATUS_BUSY);
        
        //load the endpoint data
        var endpointData = this.endpoints[endpointName];
        if(!endpointData) {
            response.status(404).send("Endpoint Resource not found");
            //we are ready = no cleanup needed
            this.setStatus(WorkspaceHandler.STATUS_READY);
            return;
        }

        //------------------------------------
        // Load the request
        //------------------------------------
 
        //load the input into the workspace
        var inputData = this._getInputData(endpointData,request);
        this._loadInputData(inputData);

        //-----------------------------------
        // Get the response
        //-----------------------------------

        //Here we wait for the workspace calculation to finish
        var generateAwaitCompletionPromise = () => this._getWorkspaceReadyPromise(endpointData);

        //here we publis the result
        var processResultFunction = () => this._processResult(endpointData,response);

        //this creates an error message if there was an exception anywhere in out processing
        var handleExceptionsFunction = errorMsg => response.status(500).send(errorMsg,);

        //this cleans up the workspace so it is ready to use again
        var doCleanupFunction = () => this._doCleanup(endpointData);

        //temporary workaround====================================================================
        //in the current release I need this delay or else I will miss asynch messenger updates
        //this should not be needed in the literate page releases
        var generateDelay10 = () => {
            return new Promise( (resolve,reject) => {
                setTimeout(() => resolve(),10);
            })
        }
        //========================================================================================

        //here we execute the process
        generateDelay10.then(generateAwaitCompletionPromise).then(processResultFunction).catch(handleExceptionsFunction).then(doCleanupFunction);
    }
    
    /** This should be called when this handler is being shutdown. */
    shutdown() {
        //no cleanup for now
        this.setStatus(WorkspaceHandler.STATUS_SHUTDOWN);
    }
    
    //===========================================
    // Private Methods
    //===========================================
    
    //----------------------------
    // Response Processing methods
    //----------------------------

    /** This method loads the action data to update the input tables. It returns
     * an array of promises, one for each table to update. */
    _getInputData(endpointData,request) {

        //this array holds a list of member objects and the value we want to set for them
        var inputData = [];
        
        //get query params if applicable input data
        if(endpointData.inputMembers.queryParams) {
            let entry = {};
            entry.member = endpointData.inputMembers.queryParams;
            entry.data = request.query; 
            inputData.push(entry);
        }

        //get any input trigger table data
        if(endpointData.inputMembers.trigger) {
            //just write canned value
            let entry  = {};
            entry.member = endpointData.inputMembers.trigger;
            entry.data = endpointData.inputTriggerValue ? endpointData.inputTriggerValue : true;
            inputData.push(entry);
        }
 
        //get the input request body data
        if(endpointData.inputMembers.body) {
            //write the body into the body table, when ready

            let entry = {};
            entry.member = endpointData.inputMembers.body;
            entry.data = req.body; 
            inputData.push(entry);
        }
       
        return inputData;
    }

    /** This method updates the input for the workspace for the array of input data (data value and table object in each entry). */
    _loadInputData(inputData) {

        var updateDataActions = [];

        //create an action for each input table we must set
        inputData.forEach(inputEntry => {
            let updateDataAction = {};
            updateDataAction.action = "updateData";
            updateDataAction.member = inputEntry.member;
            updateDataAction.data = inputEntry.data;
            updateDataActions.push(updateDataAction);
        })

        var action;
        if(updateDataActions.length > 1) {
            //make a single compound action
            action = {};
            action.action = apogee.compoundaction.ACTION_NAME;
            action.workspace = this.workspace;
            action.actions = updateDataActions;
        }
        else if(updateDataActions.length == 1) {
            action = updateDataActions[0];
        }
        else {
            action = null;
        }

        //execute the action
        if(action) {
            var actionResponse = apogee.action.doAction(action,false);        
            if(!actionResponse.getSuccess()) {
                //error executing action!
                throw new Error("Error executing request: " + actionResponse.getErrorMsg());
            } 
        }
    }

    
    /** This method resolves when the workspace calculation is ready - meaning anything other than pending.
     * Elsewhere we should handle the respose value. */
    _getWorkspaceReadyPromise() {
        //return - we are ready immediately or there is something asynchronous
        //happening. We can check the root folder to figure out which
        var rootFolder = this.workspace.getRoot();

        if((rootFolder.getResultPending())||(this.workspace.actionQueue.length > 0)) {

            //folder update will be asynchronous. Add a listener on apogee for this member
            //when not pending, resolve the promise

            let folderReadyPromise = new Promise( (resolve,reject) => {

                //define the listener that responds when the folder is ready
                let folderReadyListener = member => {
                    if(member == rootFolder) {
                        if(member.getResultPending()) {
                            //not ready yet - keep waiting
                        }
                        else {
                            //process finished
                            resolve();
                        }

                        //remove this listener
                        this.workspace.removeListener(apogee.updatemember.MEMBER_UPDATED_EVENT, folderReadyListener);
                    }
                }

                //add the listener
                this.workspace.addListener(apogee.updatemember.MEMBER_UPDATED_EVENT, folderReadyListener); 
            });

            return folderReadyPromise;
        }
        else {
            //workspace is ready now
            return Promise.resolve();
        }
    }

    _processResult(endpointData,response) {
        //get the output table
        let outputMember = endpointData.outputMembers.body ? endpointData.outputMembers.body : null;
        //this member will be used to check for error. if there is no output body, we will check error status from the root folder.
        let statusMember = outputMember ? outputMember : this.workspace.getRoot();

        if(statusMember.hasError()) {
            let errorMsg = "Error computing response: " + member.getErrorMsg();
            response.status(500).send(errorMsg);
        }
        else if(statusMember.getResultInvalid()) {
            //this shouldn't happen. Report an error
            let errorMsg = "Their was an unknown error computing the response. Response invalid.";
            response.status(500).send(errorMsg);
        }
        else if(statusMember.getResultPending()) {
            //this shouldn't happen - we should have rules this one out
            let errorMsg = "Their was an unknown error computing the response. Response still pending.";
            response.status(500).send(errorMsg);
        }
        else {
            //success
            response.json(outputMember.getData());
        }  
    }

    /** This sets the handler status once it is initialized or reset. */
    _setInitStatus() {
        //we will check the status of the root folder
        let rootFolder = this.workspace.getRoot();

        if( (rootFolder.hasError()) || (rootFolder.getResultInvalid()) || (rootFolder.getResultPending()) ) {
            //there is something wrong
            this.setStatus(WorkspaceHandler.STATUS_ERROR);
        }
        else {
            //success
            this.setStatus(WorkspaceHandler.STATUS_READY);
        }  
    }

    
    /** This prepares the handler to be used again. */
    _doCleanup(endpointData) {

        if(true) {
            //for now we are not reusing
            this.setStatus(WorkspaceHandler.STATUS_NOT_READY);
        }
        else {
            //this is for is we do reuse the workspace
        
            //when we do, we need to set the initial values back in the input tables
            //using the endpoint data, which we will need to pass in
            //and when the table is ready again, update the status.

            //set the initial values
            this._loadInputData(endpointData.inputInitialValues);
            
            //when the workspace is ready, set the status
            let generateResetCompletePromise = () => this._getWorkspaceReadyPromise();
            let setStatusFunction = () => this._setInitStatus();

            //temporary workaround====================================================================
            //in the current release I need this delay or else I will miss asynch messenger updates
            //this should not be needed in the literate page releases
            var delay10 = new Promise( (resolve,reject) => {
                setTimeout(() => resolve(),10);
            })
            //========================================================================================

            delay10.then(generateResetCompletePromise).then(setStatusFunction).catch(errMsg => this.this.setStatusError(errorMsg));

        }
    }

    
    //--------------------------------
    // Utilities
    //--------------------------------
    
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
                throw new Error("Member not found: " + memberMapKey + " - " + memberPath);
            }
        }
        
        return outputMemberMap;
    }
    
    /** This reads the input members, returning a form used in setInputData */
    _getInitialValues(inputMembers) {
        let initialValues = [];
        for(var memberKeyType in inputMembers) {
            var entry = {};
            entry.member = inputMembers[memberKeyType];
            entry.data = entry.member.getData();
            initialValues.push(entry);
        }
        return initialValues;
    }
    
}

//A new status for this handler
//status values
WorkspaceHandler.STATUS_UNKOWN = "unknown";
WorkspaceHandler.STATUS_NOT_READY = "not ready";
WorkspaceHandler.STATUS_READY = "ready";
WorkspaceHandler.STATUS_ERROR = "error";
WorkspaceHandler.STATUS_SHUTDOWN = "shutdown";
WorkspaceHandler.STATUS_BUSY = "busy";

module.exports.WorkspaceHandler = WorkspaceHandler;

