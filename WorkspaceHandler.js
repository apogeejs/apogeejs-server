var apogee = require('./apogee-npm-lib');
var utils = require('./serviceUtils');

class WorkspaceHandler {
    constructor(workspaceInfo,settings) {
        this.workspaceInfo = workspaceInfo;
        this.settings = settings;
        
        this.workspace = null;
        this.inputTables = {};
        this.outputTable = null;
        this.outputListener = null;
        
        this.status = "not initialized";
    }
    
    /** This method initializes the handler with the workspace json. */
    init(workspaceJson) {
        //create the workspace
        var headlessWorkspaceJson = workspaceJson.workspace;
        this.workspace = new apogee.Workspace(headlessWorkspaceJson);
        
//note - for node, workspace load should be synchronous? Double check this.
//IF NOT SYNCHRONOUS - rename the method and return a promise
//checked - it loads synchronously - but that doesn't mean the output table is
//finished - in principal it could finish at some later time and interfere with
//the output listener during a request. Should we make sure the root folder
//is not pending?
//also double check precendence of error versus pending. We want pending to
//be the one shown.  
//also check for load error!
        
        //create output listener
        xxx;
        
        //for each endpoint, get the input and output tables
        this.endPoints = {};
        for(var endPointName in this.workspaceInfo.endpoints) {
            var endPointSettings = this.workspaceInfo.entpoints[endPointName];
            var entpointData = {};
            this.endPoints[endPointName] = endPointData;
            
            //get the input tables
            xxx;

            //get the output table
            xxx; 
            
            //update the output listener for this endpoint
            xxx;
        }
        
        this.status = ready;
    }
    
    /** This method handles a request. */
    process(endpointPathname,request,response) {
        
        //endpointPathname should just be the endpoint name
        var endpointData = this.endPoints[endpointPathName];
        
        if(!endpointData) {
            utils.sendError(403,"Endpoint Resource not found",response);
            return;
        }
        
        //configure the output change listener
//this will read from 
        xxx;
        
        var inputUpdateActions = [];
        
        //get query params if applicable
        if(endpointData.inputTables.queryTable) {
            var queryJson = this.getQueryJson(request); 
            var queryActionData = {};
			queryActionData.action = "updateData";
            queryActionData.member = endpoint.intputTables.queryTable;
            queryActionData.data = queryJson;
            inputUpdateActions.push(queryDataAction);
        }
 
        //get body if applicable
        if(endpointData.inputTables.bodyTable) {
            utils.readBody(request,response, (request,response,body) => {
                var bodyActionData = {};
                bodyActionData.action = "updateData";
                bodyActionData.member = endpoint.intputTables.bodyTable;
                bodyActionData.data = JSON.parse(body);
                inputUpdateActions.push(bodyDataAction);
                
                //set the input tables after body loaded
                this.doInputAction(inputUpdateActions);
            });
        }
        else {
            //set the input tables now - no body load
            this.doInputAction(inputUpdateAction);
        }
       
    }
    
    //===========================================
    // Private Methods
    //===========================================
    
    /** This method updates the input for the workspace for the given request. */
    doInputAction(inputUpdateActions) {
        var counpoundActionData = {};
        compountActionData.action = apogee.compoundaction.ACTION_NAME;
        compoundActionData.actions = inputUpdateActions;
        
        var actionResponse = apogee.action.doAction(counpoundActionData,false);        
        if(actionResponse.getSuccess()) {
            //let the output listener handle the result from here
        }
        else {
            //error executing action!
            utils.sendError(500,actionResponse.getErrorMsg());
        }  
    }
    
    /** This method will be called when the the calculation completes and
     * the output table is ready. */
    processOutput(endpointData) {
        
        response.writeHead(200, {"Content-Type":"text/plain"});
        
        //write the body, if applicable
        if(endpointData.outputTables.body) {
            var outputString = outputTable.getData();
            var responseBody = JSON.stringify(outputString);
            response.write(responseBody);
        }

        //send response
        response.end();
        
        //cleanup after request
        doCleanup();
    }
    
    /** This method will be called when the calculation has an error in the
     * output table. */
    processError(err) {
        //send the error response
        utils.sendError(500,err);
        
        //cleanup after request
        doCleanup();
    }
    
    /** This prepares the handler to be used again. */
    doCleanup() {
        //for now we are not reusing
    }
}
   
module.exports = WorkspaceHandler;

