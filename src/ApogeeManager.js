//const { timeStamp } = require('console');
var fsPromises = require('fs/promises');
const path = require('path');
const express = require('express')
const { WorkspaceManager } = require('./WorkspaceManager');

/** This class initializes and shuts down the apogee workspace listeners. */
class ApogeeManager {
    
    //================================
    // Public Methods
    //================================
    
    /** Constructor. Pass in the name for this handler, to be used in error messages
     * and such. It should typically be the path to this handler. 
     */
    constructor() {  
        this.settings = null;
        this.deployDir = null;
        this.loadedModules = {};
        this.workspaceManagers = [];

        this.router = null;
        this.handler = (req,res,next) => {
            this.router(req,res,next);
        }
    }

    /** This returns the handler function to handle apogee requests. */
    getHandler() {
        return this.handler;
    }
    
    /** This method initializes the service, loading all workspaces in the deploy directory. */
    async init(deployDir) {
        //init some variables
        this.router = express.Router();
        this.deployDir = deployDir;

        //load workspaces
        let fileInfos = await fsPromises.readdir(this.deployDir, {withFileTypes: true});
        let workspaceManagerPromises = [];
        fileInfos.forEach(fileInfo => {
            if(fileInfo.isFile()) {
                let workspaceManagerPromise = this._loadWorkspace(fileInfo.name);
                workspaceManagerPromises.push(workspaceManagerPromise);
            }
        });

        //store the workspaces and add them to the router
        await Promise.all(workspaceManagerPromises).then(workspaceManagers => {
            this.workspaceManagers = workspaceManagers;
            workspaceManagers.forEach(workspaceManager => {
                let handler = workspaceManager.getHandler();
                if(handler) {
                    this.router.use(handler);
                }
            })
        });

        return true;
    }

    /** This method loads modules as needed, making sure each is loaded only once on thi server. 
     * @arg moduleList - This the the refEntries list from the workspace
     * @arg workspaceKey - The name of the workspace requesting the modules.
    */
    loadModules(moduleList,workspaceKey) {
        moduleList.forEach(moduleEntry => {
            //we will only load npm modules
            if(moduleEntry.entryType == "npm module") {
                let moduleName = moduleEntry.serverUrl ? moduleEntry.serverUrl : moduleEntry.url;
                
                //load the module if needed
                if(this.loadedModules[moduleName] == undefined) {
                    this._loadModule(moduleName);
                    this.loadedModules[moduleName] = [];
                }
                //record this workspace as a user for this module
                this.loadedModules[moduleName].push(workspaceKey);
            }
        })
    }

    /** This method should be called when a workspace is being undeployed. It will remove and modules that 
     * are no longer needed on this server. 
     * @arg moduleList - This the the refEntries list from the workspace
     * @arg workspaceKey - The name of the workspace requesting the modules.
     */
    unloadModules(moduleList,workspaceKey) {
        //for now we have no unload. If we add dynamic deploy we will want to add this.
        throw new Error("Implement unload modules! (Once we get dynamic deploy functionality)");
    }
    
    /** This method should be called to shut down the server. */
    shutdown() {
        //this doesn't actually shutdown server right now
        this.workspaceManagers.forEach(workspaceManager => {
            workspaceManager.shutdown();
        })
        //this.workspaceManager = [];
    }
    
    //================================
    // Private Methods
    //================================
   
    /** This method initialized the endpoints.  */
    async _loadWorkspace(fileName) {
        try {
            let filePath = path.join(this.deployDir,fileName);
            let fileText = await fsPromises.readFile(filePath);

            let workspaceJson = JSON.parse(fileText);
            let workspaceManager = new WorkspaceManager(this,fileName);
            await workspaceManager.initWorkspace(workspaceJson);

            return workspaceManager;
        }
        catch(loadError) {
            console.log(loadError.toString());
            if(loadError.stack) console.error(loadError.stack);
            throw new Error("Error loading workspace file " + fileName);
        }
    }

    /** This method loads a module. It may throw an exception if there is a failure. */
    _loadModule(moduleName) {
        let module = require(moduleName);
        if((module)&&(module.initApogeeModule)) module.initApogeeModule();
    }
    
}

/** Global settings */
ApogeeManager.GLOBAL_SETTINGS = {
    responseTimeoutMsec: 2*60*1000, //2 minutes NOT IMPLMENTED!
    maxResponseIterations: 50 //this is a limit on iterative calculations (apogee messenger). In some cases this may be too small.
}

/** This method returns an Apogee instance, which will be asynchronously
 * initialized when the workspaces are loaded. */
module.exports.ApogeeManager = ApogeeManager;



