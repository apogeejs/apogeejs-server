//const { timeStamp } = require('console');
var fs = require('fs');
const path = require('path');
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
        this.descriptor = null;
        this.settings = null;
        this.handlerStubs = {};
        this.serverDir = null;
        this.loadedModules = {};
    }
    
    /** This method initializes the handler with the descriptor json. */
    getInitPromise(app,serverDir,descriptorFileRelative) {
        this.serverDir = serverDir;

        var initPromise = new Promise( (resolve,reject) => {
            //callback for the descriptor
            var onDescriptorRead = (err,descriptorText) => {
                if(err) {
                    let errorMsg = "Error: Descriptor not read. " + err;
                    reject(errorMsg);
                }
                else {
                    try {
                        var descriptor = JSON.parse(descriptorText);
                        console.log("Apogee descriptor loaded");
                        this._initEndpoints(app,descriptor);
                        resolve();               
                    }
                    catch(error) {
                        let errorMsg = "Error initializing endpoints";
                        console.error(error.stack);
                        reject(errorMsg);
                    }
                }  
            }
            
            //read the descriptor
            try {
                let descriptorFileAbsolute = path.join(this.serverDir,descriptorFileRelative)
                fs.readFile(descriptorFileAbsolute,onDescriptorRead);
            }
            catch(error) {
                let errorMsg = "Error reading descriptor";
                console.error(error.stack);
                reject(errorMsg);
            }
        });

        return initPromise;
    }

    /** This method loads modules as needed, making sure each is loaded only once on thi server. 
     * @arg moduleList - This the the refEntries list from the workspace
     * @arg workspaceName - The name of the workspace requesting the modules.
    */
    loadModules(moduleList,workspaceName) {
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
                this.loadedModules[moduleName].push(workspaceName);
            }
        })
    }

    /** This method should be called when a workspace is being undeployed. It will remove and modules that 
     * are no longer needed on this server. 
     * @arg moduleList - This the the refEntries list from the workspace
     * @arg workspaceName - The name of the workspace requesting the modules.
     */
    unloadModules(moduleList,workspaceName) {
        //for now we have no unload. If we add dynamic deploy we will want to add this.
        throw new Error("Implement unload modules! (Once we get dynamic deploy functionality)");
    }
    
    /** This method should be called to shut down the server. */
    shutdown() {
        //this doesn't actually shutdown server right now
        this.handlerStubs.forEach(handlerStub => handlerStub.shutdown());
        this.handlerStubs = [];
    }
    
    //================================
    // Private Methods
    //================================
   
    /** This method initialized the endpoints.  */
    _initEndpoints(app,descriptor) {
        this.descriptor = descriptor; 

        //create settings instance
        

        //create handler stubs
        if(!descriptor.workspaces) {
            throw new Error("Workspaces entry missing in descriptor!");
        }

        for(let workspaceName in descriptor.workspaces) {
            let workspaceInfo = descriptor.workspaces[workspaceName];
            let workspaceSettings = this._loadSettings(workspaceInfo);
            let workspaceManager = new WorkspaceManager(this,workspaceName,workspaceInfo,workspaceSettings);

            //this is asynchronous. It won't handle requests until it is finished
            workspaceManager.initEndpoints(app);

            this.handlerStubs[workspaceName] = WorkspaceManager;
        }
    }

    /** This method creates the settings as the global settings with any overrides 
     * provided by the workspace descriptor. */
    _loadSettings(workspaceInfo) {
        var settings = Object.assign({},ApogeeManager.GLOBAL_SETTINGS);

        settings.serverDir = this.serverDir;
        
        if(workspaceInfo.settings) {
            settings = Object.assign(settings,workspaceInfo.settings);
        } 
        
        return settings;
    }

    /** This method loads a module. It may throw an exception if there is a failure. */
    _loadModule(moduleName) {
        let module = require(moduleName);
        if((module)&&(module.initApogeeModule)) module.initApogeeModule();
    }
    
}

/** Global settings */
ApogeeManager.GLOBAL_SETTINGS = {
    maxHandlerCount: 4, 
    minHandlerCount: 1,
    handlerSuccessiveCreateDelay: 5000, //we will delay between repeated checks to make new handlers
    maxHandlerUnusedLifetimeMsec: 2*60*60*1000, //2 hours
    maxHandlerLifetimeMsec: 4*60*60*1000, //4 hours
    responseTimeoutMsec: 2*60*1000, //2 minutes NOT IMPLMENTED!
    maxResponseIterations: 50 //this is a limit on iterative calculations (apogee messenger). In some cases this may be too small.
}

/** This method returns an Apogee instance, which will be asynchronously
 * initialized when the descriptor file is loaded. */
module.exports.ApogeeManager = ApogeeManager;



