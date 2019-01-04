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
    
/////// OLD REFERENCE CODE
    
/** This method makes thhandler for the endpoint to be deployed. */
function createHandler(headlessWorkspaceJson,inputTableName,outputTableName) {
	return function(request,response,body) {
		var onEndpointData = function(req,res,bd) {
			processEndpointBody(headlessWorkspaceJson,inputTableName,bd,outputTableName,res);
		}
		
		utils.readBody(request,response,onEndpointData);
	}
}

/** This method process the endpoint request. */
function processEndpointBody(headlessWorkspaceJson,inputTableName,inputTableStringData,outputTableName,response) {
	try {		
	
		console.log("Starting endpoint processing: " + inputTableStringData);
		
		//open the model
		var workspace = new apogee.Workspace(headlessWorkspaceJson);
		var rootFolder = workspace.getRoot();
		
		//set input, if applicable
		if(inputTableName) {
			var inputTableData = JSON.parse(inputTableStringData);
			
			//set the input
			var inputTable = rootFolder.lookupChild(inputTableName);
			if(!inputTable) {
				utils.sendError(500,"Deployment error - Input table not found!",response);
				return;
			}
			
			var actionData = {};
			actionData.action = "updateData";
            actionData.member = inputTable;
            actionData.data = inputTableData;
			
			var actionResponse = apogee.action.doAction(actionData,false);        
			if(!actionResponse.getSuccess()) {
				//error executing action!
				utils.sendError(500,actionResponse.getErrorMsg());
			}
		}
		
//THIS WILL NEED TO BE ASYNCHRONOUS!
		
		//get the output (maybe make this optional?)
		var outputTable = rootFolder.lookupChild(outputTableName);
		if(!outputTable) {
			utils.sendError(500,"Deployment error - Output table not found!",response);
			return;
		}
		var outputString = outputTable.getData();
		var responseBody = JSON.stringify(outputString);
		
		//send response
		response.writeHead(200, {"Content-Type":"text/plain"});
		response.write(responseBody);
		response.end();
	}
	catch(error) {
		console.log("Error: " + error.stack);
		sendError(500,error.stack,response);
	}
}

module.exports = WorkspaceHandler;

