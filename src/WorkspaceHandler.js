require('../apogeejs-model-lib/src/nodeGlobals.js');
const { ActionRunner } = require('./ActionRunner');

//------------------------
//debug
let DEBUG_NEXT_HANDLER_ID = 1;

function getTimestamp() {
    return new Date().toISOString();
}
//------------------------

/** This class manages the calculation for a single request. It starts with a base model instance
 * and executes an action to update the input tables to the values specified in the request. At completion
 * of the calculation it returns the result in the response. */
class WorkspaceHandler {
    
    /** Constuctor. This takes an non-request specific info. */
    constructor(baseModel,settings) {

//this is for debug
this.debugId = DEBUG_NEXT_HANDLER_ID++;
//console.log("DEBUG: " + getTimestamp() + ": Create new handler. " + this.debugId);

        //configuration and settings
        this.settings = settings;
        
        //set the apogee model - create a copy of the workspace manager base model
        //Get clean copy should not actually do anything here other than returning the input model (since it should be "clean").
        //The model is immutable so once we run actions on it we will not change the input model instance but will end up 
        //with a new model instance.
        this.modelManager = new ActionRunner();
        this.modelManager.copyModel(baseModel);

        //these values will be set by the request
        this.response = null;
        this.returnBodyId = null;
    }

    /** This method handles a request. */
    async handleRequest(request,response,endpointInfo) {  
        try {
            //store the response so we can access it later
            this.response = response;
            this.outputId = endpointInfo.outputId ? endpointInfo.outputId : null;

            //get the request input data
            let inputDataMap = this._getInputDataMap(endpointInfo,request);
    
            //get the action to load the inputs
            let inputAction = this._getInputAction(endpointInfo,inputDataMap);

            //run action with
            //output ids - output member, if there is one
            //invalid ok - NO for the output tables, yes if we are only checking completion on root folders
            let outputIds = endpointInfo.outputId ? [endpointInfo.outputId] : null;
            let invalidOk =  endpointInfo.outputId ? false : true;
            await this.modelManager.runActionOnModel(inputAction,outputIds,invalidOk,"Error executing request: ");

            //return result
            let resultValue;
            if(this.outputId) {
                let model = this.modelManager.getModel();
                let resultMember = model.lookupMemberById(this.outputId);
                resultValue = resultMember.getData();
            }
            this._doSuccessResponse(resultValue);

        }
        catch(error) {
            let errorMsg = error.message ? error.message : error ? error.toString() : "Unknown error";
            this._doErrorResponse(errorMsg);
        }
    }

    //===========================
    // Private methods
    //===========================

    /** This does an error response */
    _doErrorResponse(errorMsg) {
        this.response.status(500).send(errorMsg);
    }

    /** This does a success response */
    _doSuccessResponse(resultValue) {
        if((resultValue !== undefined)&&(resultValue !== null)) {
            this.response.json(resultValue);
        }
        else {
            this.response.status(200).end();
        }
    }

    /** This collects the input data from the request. */
    _getInputDataMap(endpointInfo,request) {

        //this array holds a list of member objects and the value we want to set for them
        var inputDataMap = {};
        
        //get query params if applicable
        if(endpointInfo.inputIds.queryParams) {
            inputDataMap.queryParams = request.query; 
        }

        //get query params if applicable
        if(endpointInfo.inputIds.pathParams) {
            inputDataMap.pathParams = request.params; 
        }

        //this gets the requested header parameters
        if((endpointInfo.inputIds.headers)&&(endpointInfo.headerKeys)) {
            let headerData = {};
            endpointInfo.headerKeys.forEach(headerKey => { 
                let value = request.get(headerKey);
                if(value != undefined) {
                    headerData[headerKey] = value;
                }
            }); 
            inputDataMap.headers = headerData; 
        }

        //get any input trigger member data if applicable
        if(endpointInfo.inputIds.trigger) {
            inputDataMap.trigger = endpointInfo.inputTriggerValue ? endpointInfo.inputTriggerValue : true;
        }
 
        //get the input request body data
        if(endpointInfo.inputIds.body) {
            inputDataMap.body = request.body;
        }
       
        return inputDataMap;
    }


    /** This method creates an action to update the initial model with any input values that should be set. */
    _getInputAction(endpointInfo,inputDataMap) {

        var updateDataActions = [];

        //create an action for each input member set
        for(let inputName in endpointInfo.inputIds) {
            let inputData = inputDataMap[inputName];
            if(inputData) {
                let updateDataAction = {};
                updateDataAction.action = "updateData";
                updateDataAction.memberId = endpointInfo.inputIds[inputName];
                updateDataAction.data = inputData;
                updateDataActions.push(updateDataAction);
            }
        }

        var action;
        if(updateDataActions.length > 1) {
            //make a single compound action
            action = {};
            action.action = "compoundAction";
            action.actions = updateDataActions;
        }
        else if(updateDataActions.length == 1) {
            //we have a single action
            action = updateDataActions[0];
        }
        else {
            //there are no inputs!
            action = null;
        }

        return action;
    }
}

module.exports.WorkspaceHandler = WorkspaceHandler;

