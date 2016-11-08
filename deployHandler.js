var hax = require('hax-lib-node');
var utils = require('./serviceUtils');
var serviceRouter = null;

/** This method must be called to set the router. */
exports.init = function(router) {
	serviceRouter = router;
}

/** This is the handler method for the deploy service. */
exports.onDeploy = function(request,response) {
	utils.readBody(request,response,processDeployBody);
}

//=======================================================
// Internal Methods
//=======================================================

/** This function processes the incoming body to 
 * deploy the desired endpoints */ 
function processDeployBody(request,response,body) {
	
	try {
		console.log("Starting deploy processing: " + body);
		
		//load input
		var descriptor = JSON.parse(body);
		
		//required
		var workspaceJson = descriptor.workspaceJson;
		if(!workspaceJson) {
			utils.sendError(400,"Workspace JSON missing!",response);
			return;
		}
		
		//required
		var workspace = workspaceJson.workspace;
		if(!workspace) {
			utils.sendError(400,"Core workspace not present in workspace JSON",response);
			return;
		}
		
		//optional
		var inputTable = descriptor.inputTable;
		
		//required
		var outputTable = descriptor.outputTable;
		if(!outputTable) {
			utils.sendError(400,"Output table missing!",response);
			return;
		}
		
		//required
		var path = descriptor.path;
		if(!path) {
			utils.sendError(400,"Path missing!",response);
			return;
		}
		
		if(serviceRouter) {
			//open the model
			var handler = createHandler(workspace,inputTable,outputTable);
			serviceRouter.addEndpoint(path,handler);
			
			//send response
			response.writeHead(200, {"Content-Type":"text/plain"});
			response.write("Endpoint " + path + " added");
			response.end();			
		}
		else {
			utils.sendError(500,"Deployment handler not initialized!",response);
		}	
	}
	catch(error) {
		console.log("Error: " + error.stack);
		utils.sendError(500,error.stack,response);
	}
}

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
		var workspace = new hax.core.Workspace(headlessWorkspaceJson);
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
			hax.core.updatemember.updateData(inputTable,inputTableData);
		}
		
//THIS WILL NEED TO BE ASYNCHRONOUS!
		
		//get the output (maybe make this optional?)
		var outputTable = rootFolder.lookupChild(outputTableName);
		if(!inputTable) {
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


